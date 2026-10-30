/*
  Webhook podpory vo WhatsAppe (`/api/public/whatsapp/webhook`), WhatsApp
  Business Cloud API.

  - GET: Meta pri nastavení webhooku overí adresu (`hub.mode=subscribe`,
    `hub.verify_token` = `WHATSAPP_VERIFY_TOKEN`, vrátime `hub.challenge`).
  - POST: udalosti podpísané `X-Hub-Signature-256` (HMAC-SHA256 surového tela
    tajomstvom aplikácie `WHATSAPP_APP_SECRET`). Bez platného podpisu 401.

  Prvá správa z čísla založí požiadavku P-xxxx (zdroj `whatsapp`), ďalšie idú
  do otvorenej požiadavky toho čísla. Fotky a dokumenty sú prílohy požiadavky.
  Meta pri chybe doručuje znova — každá správa sa spracuje raz (`message.id`
  v `whatsapp_prijate`).

  Telefónne číslo je osobný údaj: do logov nejde, administrácia a e-maily
  dostanú len maskované (`maskujCislo`).
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { secureEquals } from "./cron-auth.server";
import { preloz, type Jazyk } from "@/lib/i18n/jazyk";
import { cisloPoziadavky, predmetZoSpravy, type KategoriaPoziadavky } from "./podpora";
import {
  KOS_PODPORY,
  MAX_PRILOHA_PODPORY,
  MAX_PRILOH_NA_POZIADAVKU,
  TYPY_PODPORY,
  cestaPrilohyPodpory,
  typPrilohyPodpory,
} from "./podpora-prilohy";
import {
  MAX_NOVYCH_ZA_DEN,
  MAX_NOVYCH_ZA_HODINU_SPOLU,
  TICHE_TYPY,
  cislaZWaId,
  cistyTextWhatsAppu,
  maskujCislo,
  menoZWhatsAppu,
  rozbalUdalost,
  rozoberPrikazWhatsApp,
  textSpravy,
  type PrikazWhatsApp,
  type WaSprava,
  type WaStatus,
  type WaUdalost,
} from "./whatsapp";
import {
  StropVPamati,
  klucCisla,
  overPodpis,
  phoneNumberId,
  posliTextWhatsApp,
  pouziKodWhatsApp,
  pustiWhatsApp,
  stiahniMediaWhatsApp,
  textOdpovede,
} from "./whatsapp.server";

/** Správy zákazníka: najviac 20 za 10 minút na číslo. */
const SPRAVY = { max: 20, oknoMs: 10 * 60_000 };
const stropSprav = new StropVPamati(SPRAVY.max, SPRAVY.oknoMs);
/** Pokusy o prepojenie: 5 za 10 minút — kód sa nedá skúšať naslepo. */
const PAROVANIE = { max: 5, oknoMs: 10 * 60_000 };
const stropParovania = new StropVPamati(PAROVANIE.max, PAROVANIE.oknoMs);
/** Nové požiadavky zo všetkých čísel spolu za hodinu. */
const stropNovychSpolu = new StropVPamati(MAX_NOVYCH_ZA_HODINU_SPOLU, 3_600_000);

/** Jazyk odpovedí podľa predvoľby čísla (WhatsApp jazyk neposiela); inak slovenčina. */
export function jazykPodlaCisla(waId: string): Jazyk {
  if (waId.startsWith("420")) return "cs";
  if (waId.startsWith("49") || waId.startsWith("43")) return "de";
  return "sk";
}

const teraz = () => new Date().toISOString();

type StavZmena = Partial<
  Record<
    | "webhook_overeny_at"
    | "posledna_udalost_at"
    | "posledna_sprava_at"
    | "posledna_chyba"
    | "posledna_chyba_at",
    string | null
  >
>;

async function zapisStav(zmena: StavZmena) {
  const { error } = await supabaseAdmin.from("whatsapp_stav").update(zmena).eq("id", 1);
  if (error) console.warn("[whatsapp] stav sa nezapísal:", error.message);
}

/* ------------------------------------------------------------ overenie */

/** GET overenie webhooku pri jeho nastavení v Meta. */
export async function overWebhookWhatsApp(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const ocakavany = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  const token = q.get("hub.verify_token") ?? "";
  const challenge = q.get("hub.challenge") ?? "";
  if (
    q.get("hub.mode") !== "subscribe" ||
    !ocakavany ||
    !secureEquals(token, ocakavany) ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)
  ) {
    console.warn("[whatsapp] overenie webhooku odmietnuté");
    return new Response("forbidden", { status: 403 });
  }
  await zapisStav({ webhook_overeny_at: teraz() });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/* -------------------------------------------------------------- vstup */

/** Správy jedného čísla sa spracúvajú po poradí — album fotiek nezaloží päť požiadaviek. */
const fronty = new Map<string, Promise<unknown>>();

function doFronty(kluc: string, praca: () => Promise<unknown>): Promise<unknown> {
  const predosla = fronty.get(kluc) ?? Promise.resolve();
  const dalsia = predosla.then(praca, praca);
  fronty.set(kluc, dalsia);
  void dalsia.finally(() => {
    if (fronty.get(kluc) === dalsia) fronty.delete(kluc);
  });
  return dalsia;
}

export async function prijmiWebhookWhatsApp(
  request: Request,
  o: { cakat?: boolean } = {},
): Promise<Response> {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const surove = Buffer.from(await request.arrayBuffer());
  if (!overPodpis(surove, request.headers.get("x-hub-signature-256"))) {
    console.warn("[whatsapp] odmietnuté – nesedí podpis webhooku");
    return new Response("unauthorized", { status: 401 });
  }
  let u: WaUdalost;
  try {
    u = JSON.parse(surove.toString("utf8"));
  } catch {
    return new Response("bad body", { status: 400 });
  }
  await zapisStav({ posledna_udalost_at: teraz() });

  const { spravy, stavy } = rozbalUdalost(u, phoneNumberId());
  const prace: Promise<unknown>[] = [];
  for (const s of stavy) prace.push(spracujStav(s).catch(zalogujChybu));

  for (const { sprava, profil } of spravy) {
    const id = String(sprava.id).slice(0, 200);
    // Meta pri chybe doručuje znova — tá istá správa sa spracuje len raz.
    const { error } = await supabaseAdmin.from("whatsapp_prijate").insert({ message_id: id });
    if (error) {
      if ((error as { code?: string }).code === "23505") continue;
      console.error("[whatsapp] id správy sa nepodarilo zapísať:", error.message);
      return new Response("error", { status: 500 });
    }
    const waId = cislaZWaId(sprava.from);
    if (!waId) continue;
    prace.push(
      doFronty(klucCisla(waId), () => spracujSpravu(sprava, waId, profil)).catch(zalogujChybu),
    );
  }

  if (Math.random() < 0.01) {
    void supabaseAdmin
      .from("whatsapp_prijate")
      .delete()
      .lt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .then(({ error: e }) => e && console.warn("[whatsapp] upratanie id správ:", e.message));
  }

  // Meta čaká na odpoveď krátko; sťahovanie príloh beží na pozadí.
  if (o.cakat) await Promise.all(prace);
  return new Response("ok", { status: 200 });
}

function zalogujChybu(e: any) {
  console.error("[whatsapp] spracovanie zlyhalo:", e?.message ?? e);
}

/* --------------------------------------------------------- stavy doručenia */

/**
 * Stav odoslanej správy. Zaujíma nás len „failed“ — odpoveď podpory sa
 * nedoručila, tak ju pošleme znova, keď zákazník napíše, a admin to uvidí.
 */
async function spracujStav(s: WaStatus): Promise<void> {
  if (s.status !== "failed") return;
  const kod = s.errors?.[0]?.code ?? null;
  console.warn(`[whatsapp] správa sa nedoručila, kód ${kod ?? "?"}`);
  const { data } = await supabaseAdmin
    .from("whatsapp_odoslane")
    .select("chat_id, poziadavka_id, created_at")
    .eq("wamid", String(s.id).slice(0, 200))
    .maybeSingle();
  const o = data as { chat_id: string; poziadavka_id: string | null; created_at: string } | null;
  if (!o) return;
  // Odkedy znova doručiť: čas nedoručenej odpovede vo vlákne (odoslanie je o chvíľu neskôr).
  const { data: sprava } = o.poziadavka_id
    ? await supabaseAdmin
        .from("podpora_spravy")
        .select("created_at")
        .eq("poziadavka_id", o.poziadavka_id)
        .eq("od_podpory", true)
        .eq("interna", false)
        .lte("created_at", o.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const odSpravy = (sprava as { created_at: string } | null)?.created_at ?? o.created_at;
  const dovod = `WhatsApp správu nedoručil (kód ${kod ?? "?"}) — odpoveď sa doručí, keď zákazník znova napíše.`;
  const { data: chat } = await supabaseAdmin
    .from("whatsapp_chaty")
    .select("nedorucene_od")
    .eq("id", o.chat_id)
    .maybeSingle();
  const odkedy = (chat as { nedorucene_od: string | null } | null)?.nedorucene_od;
  await supabaseAdmin
    .from("whatsapp_chaty")
    .update({
      posledna_chyba: dovod,
      nedorucene_od: odkedy && odkedy < odSpravy ? odkedy : odSpravy,
      updated_at: teraz(),
    })
    .eq("id", o.chat_id);
  await zapisStav({ posledna_chyba: dovod, posledna_chyba_at: teraz() });
}

/* ------------------------------------------------------------ zákazník */

type Chat = {
  id: string;
  wa_id: string;
  user_id: string | null;
  poziadavka_id: string | null;
  nedorucene_od: string | null;
};

export type Vysledok =
  | "ignorovane"
  | "strop"
  | "sparovane"
  | "neplatny_kod"
  | "nova_poziadavka"
  | "do_vlakna"
  | "dorucene"
  | "info";

const UVITANIE =
  "Dobrý deň, toto je podpora Faktera. Napíšte nám otázku alebo popis problému — založíme požiadavku a odpoveď vám príde sem. Poslať môžete aj snímku obrazovky alebo PDF.\n\n/chyba — nahlásiť chybu v aplikácii\n/nova — začať novú požiadavku\n\nAk máte účet vo Fakteri, číslo si prepojte v Pomoc a podpora → Napíšte nám na WhatsApp.";

/** Čas správy zákazníka — od neho beží 24 h okno. Z budúcnosti ani priveľmi starý ho neberieme. */
function casSpravy(s: WaSprava): string {
  const t = Number(s.timestamp) * 1000;
  const n = Date.now();
  return Number.isFinite(t) && t <= n && n - t < 3600_000
    ? new Date(t).toISOString()
    : new Date(n).toISOString();
}

export async function spracujSpravu(
  s: WaSprava,
  waId: string,
  profil: string | null,
): Promise<Vysledok> {
  if (TICHE_TYPY.has(s.type)) return "ignorovane";
  const kluc = klucCisla(waId);
  if (!(await pustiWhatsApp(kluc, "spravy", SPRAVY.max, SPRAVY.oknoMs, stropSprav))) {
    console.warn("[whatsapp] číslo prekročilo strop správ");
    return "strop";
  }
  const j = jazykPodlaCisla(waId);
  const meno = menoZWhatsAppu(profil, waId);
  const odZakaznika = casSpravy(s);
  await zapisStav({ posledna_sprava_at: teraz() });

  const { data: existujuci } = await supabaseAdmin
    .from("whatsapp_chaty")
    .select("id, wa_id, user_id, poziadavka_id, nedorucene_od")
    .eq("wa_id", waId)
    .maybeSingle();
  let chat = existujuci as Chat | null;
  if (chat) {
    await supabaseAdmin
      .from("whatsapp_chaty")
      .update({ meno, posledna_od_zakaznika_at: odZakaznika, updated_at: teraz() })
      .eq("id", chat.id);
  } else {
    const { data: novy, error } = await supabaseAdmin
      .from("whatsapp_chaty")
      .insert({
        wa_id: waId,
        cislo_maska: maskujCislo(waId),
        meno,
        posledna_od_zakaznika_at: odZakaznika,
      })
      .select("id, wa_id, user_id, poziadavka_id, nedorucene_od")
      .single();
    if (error) throw new Error(error.message);
    chat = novy as Chat;
  }

  const odpovedz = (text: string) => posliTextWhatsApp(waId, text);

  // Zákazník napísal — okno je otvorené, nedoručené odpovede podpory idú teraz.
  const dorucene = chat.nedorucene_od ? await dorucNedorucene(chat) : 0;

  // Tlačidlo zo šablóny („Zobraziť odpoveď“) nie je nová správa do vlákna.
  if (s.type === "button") {
    if (!dorucene)
      await odpovedz(
        preloz(
          j,
          "Všetky odpovede podpory sme vám už poslali. Ak potrebujete ešte niečo, napíšte nám.",
        ),
      );
    return "dorucene";
  }

  const prikaz: PrikazWhatsApp = rozoberPrikazWhatsApp(textSpravy(s));

  if (prikaz.druh === "prepojit") {
    if (!(await pustiWhatsApp(kluc, "parovanie", PAROVANIE.max, PAROVANIE.oknoMs, stropParovania)))
      return "strop";
    const userId = await pouziKodWhatsApp(prikaz.kod);
    if (!userId) {
      await odpovedz(
        preloz(
          j,
          "Kód na prepojenie neplatí alebo vypršal. Vyrobte nový vo Fakteri v Pomoc a podpora.",
        ),
      );
      return "neplatny_kod";
    }
    await supabaseAdmin
      .from("whatsapp_chaty")
      .update({ user_id: userId, updated_at: teraz() })
      .eq("id", chat.id);
    await odpovedz(
      preloz(
        j,
        "Číslo je prepojené s vaším účtom vo Fakteri. Napíšte nám, s čím potrebujete pomôcť.",
      ),
    );
    return "sparovane";
  }
  if (prikaz.druh === "pomoc") {
    await odpovedz(preloz(j, UVITANIE));
    return "info";
  }
  if (prikaz.druh === "nova") {
    await supabaseAdmin.from("whatsapp_chaty").update({ poziadavka_id: null }).eq("id", chat.id);
    await odpovedz(preloz(j, "Dobre. Ďalšia správa založí novú požiadavku."));
    return "info";
  }

  const text = cistyTextWhatsAppu(prikaz.text);
  const priloha = prilohaZoSpravy(s);
  const kategoria: KategoriaPoziadavky = prikaz.druh === "chyba" ? "chyba" : "otazka";

  const { nacitajPoziadavku, pridajSpravu, zalozPoziadavku } = await import("./podpora.server");
  const otvorena = chat.poziadavka_id ? await nacitajPoziadavku(chat.poziadavka_id) : null;
  const vlakno =
    otvorena && otvorena.stav !== "vyriesena" && otvorena.whatsapp_chat_id === chat.id
      ? otvorena
      : null;

  if (prikaz.druh === "chyba" && !text && !priloha) {
    if (vlakno) {
      await supabaseAdmin
        .from("podpora_poziadavky")
        .update({ kategoria: "chyba", updated_at: teraz() })
        .eq("id", vlakno.id)
        .eq("kategoria", "otazka");
      await odpovedz(
        preloz(j, "Požiadavku {cislo} sme označili ako chybu v aplikácii.", {
          cislo: cisloPoziadavky(vlakno.cislo),
        }),
      );
    } else {
      await odpovedz(preloz(j, "Popíšte chybu: čo ste robili, čo sa stalo a čo ste čakali."));
    }
    return "info";
  }
  if (!text && !priloha) {
    // Hlasová správa, video, poloha, nálepka… — nevieme ich spracovať.
    await odpovedz(preloz(j, "Pošlite nám text, fotku alebo súbor (obrázok alebo PDF)."));
    return "info";
  }
  const telo = text || "(príloha z WhatsAppu)";

  let poziadavkaId: string;
  let cislo: number;
  let vysledok: Vysledok;
  if (vlakno) {
    await pridajSpravu({ poziadavka: vlakno, autorId: vlakno.user_id, od: "zakaznik", text: telo });
    if (prikaz.druh === "chyba") {
      await supabaseAdmin
        .from("podpora_poziadavky")
        .update({ kategoria: "chyba" })
        .eq("id", vlakno.id)
        .eq("kategoria", "otazka");
    }
    poziadavkaId = vlakno.id;
    cislo = vlakno.cislo;
    vysledok = "do_vlakna";
  } else {
    const odVcera = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("podpora_poziadavky")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_chat_id", chat.id)
      .gte("created_at", odVcera);
    if ((count ?? 0) >= MAX_NOVYCH_ZA_DEN) {
      await odpovedz(
        preloz(
          j,
          "Za posledný deň ste založili veľa požiadaviek. Skúste to prosím neskôr alebo nám napíšte na servis@faktero.sk.",
        ),
      );
      return "strop";
    }
    if (
      !(await pustiWhatsApp(
        "spolu",
        "nove_spolu",
        MAX_NOVYCH_ZA_HODINU_SPOLU,
        3_600_000,
        stropNovychSpolu,
      ))
    ) {
      console.warn("[whatsapp] prekročený spoločný strop nových požiadaviek za hodinu");
      await odpovedz(
        preloz(
          j,
          "Práve prijímame veľa požiadaviek naraz. Skúste to prosím o chvíľu znova alebo nám napíšte na servis@faktero.sk.",
        ),
      );
      return "strop";
    }
    const { data: profilUctu } = chat.user_id
      ? await supabaseAdmin
          .from("profiles")
          .select("email, full_name")
          .eq("id", chat.user_id)
          .maybeSingle()
      : { data: null };
    const pr = profilUctu as { email: string | null; full_name: string | null } | null;
    const nova = await zalozPoziadavku({
      userId: chat.user_id,
      email: pr?.email ?? "",
      meno: pr?.full_name ? `${pr.full_name} · ${meno}` : meno,
      predmet: predmetZoSpravy(telo),
      kategoria,
      zdroj: "whatsapp",
      text: telo,
      url: null,
      userAgent: "WhatsApp",
      whatsappChatId: chat.id,
      pocetPriloh: priloha ? 1 : 0,
    });
    await supabaseAdmin
      .from("whatsapp_chaty")
      .update({ poziadavka_id: nova.id, updated_at: teraz() })
      .eq("id", chat.id);
    poziadavkaId = nova.id;
    cislo = nova.cislo;
    vysledok = "nova_poziadavka";
  }

  let chybaPrilohy: string | null = null;
  if (priloha) chybaPrilohy = await ulozPrilohu(poziadavkaId, priloha, chat.user_id, j);

  const c = cisloPoziadavky(cislo);
  const riadky =
    vysledok === "nova_poziadavka"
      ? [
          preloz(
            j,
            "Ďakujeme, založili sme požiadavku {cislo}. Odpoveď vám príde sem. Ďalšie správy pridáme do tej istej požiadavky, novú začnete príkazom /nova.",
            { cislo: c },
          ),
          kategoria === "otazka" ? preloz(j, "Ak ide o chybu v aplikácii, pošlite /chyba.") : "",
        ]
      : [];
  if (chybaPrilohy) riadky.push(chybaPrilohy);
  const odpoved = riadky.filter(Boolean).join("\n\n");
  if (odpoved) await odpovedz(odpoved);
  return vysledok;
}

/**
 * Odpovede podpory, ktoré mimo 24 h okna neodišli (od `nedorucene_od`),
 * pošle teraz, keď zákazník napísal. Vráti počet doručených.
 */
async function dorucNedorucene(chat: Chat): Promise<number> {
  const { data: poziadavky } = await supabaseAdmin
    .from("podpora_poziadavky")
    .select("id, cislo")
    .eq("whatsapp_chat_id", chat.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const cisla = new Map(
    ((poziadavky ?? []) as { id: string; cislo: number }[]).map((p) => [p.id, p.cislo]),
  );
  if (!cisla.size) {
    await supabaseAdmin.from("whatsapp_chaty").update({ nedorucene_od: null }).eq("id", chat.id);
    return 0;
  }
  const { data: spravy } = await supabaseAdmin
    .from("podpora_spravy")
    .select("poziadavka_id, text, created_at")
    .in("poziadavka_id", [...cisla.keys()])
    .eq("od_podpory", true)
    .eq("interna", false)
    .gte("created_at", chat.nedorucene_od!)
    .order("created_at", { ascending: true })
    .limit(20);
  let pocet = 0;
  let chyba = false;
  for (const s of (spravy ?? []) as { poziadavka_id: string; text: string }[]) {
    const r = await posliTextWhatsApp(
      chat.wa_id,
      textOdpovede(cisloPoziadavky(cisla.get(s.poziadavka_id)), s.text),
    );
    if ("wamid" in r) {
      pocet++;
      await supabaseAdmin.from("whatsapp_odoslane").insert({
        wamid: r.wamid,
        chat_id: chat.id,
        poziadavka_id: s.poziadavka_id,
        druh: "text",
      });
    } else {
      chyba = true;
      break;
    }
  }
  if (!chyba)
    await supabaseAdmin
      .from("whatsapp_chaty")
      .update({ nedorucene_od: null, posledna_chyba: null, updated_at: teraz() })
      .eq("id", chat.id);
  return pocet;
}

/* ---------------------------------------------------------------- prílohy */

type Priloha = { mediaId: string; nazov: string; mime: string };

function prilohaZoSpravy(s: WaSprava): Priloha | null {
  if (s.type === "document" && s.document?.id) {
    return {
      mediaId: s.document.id,
      nazov: cistyTextWhatsAppu(s.document.filename || "subor", 200) || "subor",
      mime: s.document.mime_type ?? "",
    };
  }
  if (s.type === "image" && s.image?.id) {
    const mime = String(s.image.mime_type ?? "image/jpeg")
      .split(";")[0]!
      .trim();
    return {
      mediaId: s.image.id,
      nazov: `whatsapp-${String(s.id)
        .slice(-8)
        .replace(/[^A-Za-z0-9]/g, "")}.${TYPY_PODPORY[mime] ?? "jpg"}`,
      mime,
    };
  }
  return null;
}

/** Uloží prílohu k poslednej správe zákazníka. Vráti dôvod odmietnutia pre zákazníka, alebo `null`. */
async function ulozPrilohu(
  poziadavkaId: string,
  p: Priloha,
  userId: string | null,
  j: Jazyk,
): Promise<string | null> {
  const typ = typPrilohyPodpory(p.mime, p.nazov);
  if (!typ)
    return preloz(j, "Súbor {nazov} sme neuložili — prijímame obrázky a PDF.", { nazov: p.nazov });

  const { count } = await supabaseAdmin
    .from("podpora_prilohy")
    .select("id", { count: "exact", head: true })
    .eq("poziadavka_id", poziadavkaId);
  if ((count ?? 0) >= MAX_PRILOH_NA_POZIADAVKU)
    return preloz(j, "K požiadavke sa dá priložiť najviac {max} súborov.", {
      max: MAX_PRILOH_NA_POZIADAVKU,
    });

  const subor = await stiahniMediaWhatsApp(p.mediaId, MAX_PRILOHA_PODPORY);
  if (!subor)
    return preloz(
      j,
      "Súbor {nazov} sa nepodarilo stiahnuť alebo je väčší než 10 MB. Skúste ho poslať znova.",
      { nazov: p.nazov },
    );

  const { data: sprava } = await supabaseAdmin
    .from("podpora_spravy")
    .select("id")
    .eq("poziadavka_id", poziadavkaId)
    .eq("od_podpory", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cesta = cestaPrilohyPodpory(poziadavkaId, typ);
  const { error: chybaUlozenia } = await supabaseAdmin.storage
    .from(KOS_PODPORY)
    .upload(cesta, subor.bajty, { contentType: typ, upsert: false });
  if (chybaUlozenia) {
    console.error("[whatsapp] príloha sa neuložila:", chybaUlozenia.message);
    return preloz(j, "Súbor {nazov} sa nepodarilo uložiť. Skúste ho poslať znova.", {
      nazov: p.nazov,
    });
  }
  const { error } = await supabaseAdmin.from("podpora_prilohy").insert({
    poziadavka_id: poziadavkaId,
    sprava_id: (sprava as { id: string } | null)?.id ?? null,
    path: cesta,
    name: p.nazov,
    mime: typ,
    size: subor.bajty.length,
    created_by: userId,
  });
  if (error) {
    await supabaseAdmin.storage.from(KOS_PODPORY).remove([cesta]);
    console.error("[whatsapp] riadok prílohy sa neuložil:", error.message);
    return preloz(j, "Súbor {nazov} sa nepodarilo uložiť. Skúste ho poslať znova.", {
      nazov: p.nazov,
    });
  }
  return null;
}
