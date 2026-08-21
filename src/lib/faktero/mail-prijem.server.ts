/**
 * Príjem dokladov e-mailom — serverová časť.
 *
 * Poštu prijíma Resend na doméne z `MAIL_PRIJEM_DOMENA` (predvolene
 * `doklady.faktero.sk`, MX záznam) a na každý mail
 * pošle webhook `email.received`. Webhook nesie len metadáta, prílohy sa dopytujú
 * cez API a sťahujú z odkazu platného hodinu.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  vyberLocalPart,
  jePrilohaDoklad,
  zostavPrijatuFakturu,
  podomenaDokladov,
  celaAdresa,
  PODOMENA_DOKLADOV,
} from "./mail-prijem";
import {
  poskytovatelPotvrdenia,
  overPravostPotvrdenia,
  potvrdenieZMailu,
  rozbalTelo,
  type OdosielatelPotvrdeni,
} from "./mail-potvrdenie";

/** Koľko príloh z jedného mailu spracujeme a aká veľká smie byť. */
const MAX_PRILOH = 5;
const MAX_BAJTOV = 15 * 1024 * 1024;
/** Tolerancia veku podpisu — chráni pred prehratím zachytenej požiadavky. */
const TOLERANCIA_SEKUND = 300;

export type ResendPrilohaMeta = {
  id: string;
  filename?: string | null;
  size?: number | null;
  content_type?: string | null;
  download_url?: string | null;
};

/**
 * Overí podpis webhooku. Resend podpisuje cez Svix: hlavičky `svix-id`,
 * `svix-timestamp`, `svix-signature`, podpisuje sa `id.timestamp.telo` a
 * tajomstvo je base64 za predponou `whsec_`.
 */
export function overPodpisWebhooku(args: {
  telo: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  teraz?: number;
}): boolean {
  const { telo, id, timestamp, signature, secret } = args;
  if (!telo || !id || !timestamp || !signature || !secret) return false;

  const cas = Number(timestamp);
  if (!Number.isFinite(cas)) return false;
  const teraz = Math.floor((args.teraz ?? Date.now()) / 1000);
  if (Math.abs(teraz - cas) > TOLERANCIA_SEKUND) return false;

  const kluc = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const ocakavany = createHmac("sha256", kluc).update(`${id}.${timestamp}.${telo}`).digest();

  // Hlavička môže niesť viac podpisov oddelených medzerou: „v1,<podpis> v1a,<iny>".
  for (const cast of signature.split(" ")) {
    const [verzia, podpis] = cast.split(",");
    if (verzia !== "v1" || !podpis) continue;
    const prijaty = Buffer.from(podpis, "base64");
    if (prijaty.length === ocakavany.length && timingSafeEqual(prijaty, ocakavany)) return true;
  }
  return false;
}

const PROMPT = `Si účtovník. Z priloženého dokladu (faktúra, blok alebo účtenka) vytiahni údaje DODÁVATEĽA, sumy a jednotlivé položky.
Vráť VÝLUČNE JSON v tvare:
{"supplier_name": string|null, "supplier_ico": string|null, "supplier_dic": string|null,
 "supplier_ic_dph": string|null, "supplier_iban": string|null, "invoice_number": string|null,
 "variable_symbol": string|null, "issue_date": "YYYY-MM-DD"|null, "due_date": "YYYY-MM-DD"|null,
 "amount_without_vat": number|null, "vat_amount": number|null, "amount_total": number|null,
 "currency": string|null,
 "items": [{"name": string, "quantity": number|null, "unit": string|null,
            "unit_price": number|null, "vat_rate": number|null, "total": number|null}]}
Dodávateľ je ten, KTO doklad vystavil, nie odberateľ. Sumy uveď ako čísla s bodkou.
Do "items" daj riadky tabuľky dokladu v poradí, v akom sú na papieri; keď doklad
položky nemá, vráť prázdne pole. Súčty, zaokrúhlenie ani „spolu" nie sú položka.
Čo na doklade nie je, nechaj null — nič si nevymýšľaj.`;

/** Prečíta doklad cez Gemini. Keď sa to nepodarí, vráti null a doklad vznikne prázdny. */
export async function precitajDoklad(
  base64: string,
  mimeType: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { aiVision } = await import("./ai.server");
    const odpoved = await aiVision(base64, mimeType, PROMPT);
    const json = odpoved.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch (e: any) {
    console.error("[mail-prijem] čítanie dokladu zlyhalo:", e?.message ?? e);
    return null;
  }
}

/**
 * Celý prijatý mail vrátane tela a hlavičiek. Webhook nesie len metadáta —
 * text, HTML ani `Authentication-Results` v ňom nie sú, a práve tie treba na
 * potvrdenie preposielania a na overenie, že mail je naozaj od Googlu.
 */
async function obsahMailu(emailId: string, apiKey: string): Promise<Record<string, any>> {
  const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    const telo = (await r.text()).slice(0, 200);
    throw new Error(`Resend obsah mailu: ${r.status} ${telo}`);
  }
  return (await r.json()) as Record<string, any>;
}

async function prilohyMailu(emailId: string, apiKey: string): Promise<ResendPrilohaMeta[]> {
  const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    const telo = (await r.text()).slice(0, 200);
    // Najčastejšia príčina: kľúč smie len posielať. Bez tejto vety sa z hlášky
    // Resendu nedá uhádnuť, že chýba druhý kľúč.
    const rada =
      r.status === 401 && /restricted/i.test(telo)
        ? " — kľúč nemá právo čítať prijatú poštu, doplňte RESEND_INBOUND_API_KEY"
        : "";
    throw new Error(`Resend prílohy: ${r.status} ${telo}${rada}`);
  }
  const json: any = await r.json();
  return (json?.data ?? []) as ResendPrilohaMeta[];
}

export type PrijatyMail = {
  email_id: string;
  from?: string | null;
  subject?: string | null;
  to?: (string | null)[] | null;
  received_for?: (string | null)[] | null;
};

export type VysledokPrijmu = {
  stav: "hotovo" | "bez_prilohy" | "neznama_adresa" | "potvrdenie" | "chyba";
  vytvorenych: number;
  detail?: string;
};

/**
 * Potvrdenie preposielania (dnes Gmail).
 *
 * Uloží sa z neho **len** kód, odkaz a schránka, z ktorej sa preposiela — telo
 * mailu nikam neputuje. Mail, ktorý neprejde overením pravosti, sa zahodí:
 * inak by stačilo poslať firme mail „od Googlu" s vlastným odkazom a používateľ
 * by si odklikol cudzie preposielanie.
 */
async function ulozPotvrdeniePreposielania(args: {
  supabaseAdmin: any;
  companyId: string;
  emailId: string;
  apiKey: string;
  predmet: string | null;
  poskytovatel: OdosielatelPotvrdeni;
  naseAdresy: (string | null | undefined)[];
}): Promise<string> {
  const obsah = await obsahMailu(args.emailId, args.apiKey);

  const pravost = overPravostPotvrdenia({
    headers: obsah.headers ?? null,
    spf: obsah.spf,
    dkim: obsah.dkim,
    domena: args.poskytovatel.domena,
  });
  if (!pravost.ok) {
    // Do logu ide len zoznam názvov hlavičiek — podľa neho sa dá zistiť, či ich
    // Resend vôbec posiela, a pritom sa nikam nevypíše obsah cudzieho mailu.
    console.warn(
      `[mail-prijem] potvrdenie od ${args.poskytovatel.adresa} zahodené: ${pravost.dovod}` +
        ` (hlavičky: ${Object.keys(obsah.headers ?? {}).join(", ") || "žiadne"})`,
    );
    return `Potvrdenie preposielania zahodené — ${pravost.dovod}.`;
  }

  const udaje = potvrdenieZMailu({
    provider: args.poskytovatel.provider,
    predmet: args.predmet,
    text: rozbalTelo(obsah.text),
    html: rozbalTelo(obsah.html),
    naseAdresy: args.naseAdresy,
  });

  if (!udaje.code && !udaje.confirm_url) {
    console.warn("[mail-prijem] v potvrdení nebol kód ani odkaz");
    return "Potvrdenie preposielania prišlo, ale kód ani odkaz sa v ňom nenašli.";
  }

  const { error } = await args.supabaseAdmin.from("inbox_verifications").insert({
    company_id: args.companyId,
    provider: udaje.provider,
    source_email: udaje.source_email,
    code: udaje.code,
    confirm_url: udaje.confirm_url,
  });
  if (error) throw new Error(`zápis potvrdenia zlyhal: ${error.message}`);

  const odkial = udaje.source_email ? ` z ${udaje.source_email}` : "";
  return `Potvrdenie preposielania${odkial} — kód ${udaje.code ?? "sa nenašiel, použite odkaz"}.`;
}

/**
 * Spracuje jeden prijatý mail: nájde firmu podľa adresy, stiahne prílohy, uloží ich
 * a z každej založí prijatú faktúru. Do `inbox_messages` zapíše, ako to dopadlo —
 * bez toho by používateľ nemal ako zistiť, prečo sa doklad neobjavil.
 */
export async function spracujPrijatyMail(mail: PrijatyMail): Promise<VysledokPrijmu> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const localPart = vyberLocalPart(
    [...(mail.to ?? []), ...(mail.received_for ?? [])],
    podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA),
  );
  if (!localPart) return { stav: "neznama_adresa", vytvorenych: 0 };

  const { data: adresa } = await supabaseAdmin
    .from("inbox_addresses")
    .select("id, company_id, user_id, active")
    .ilike("local_part", localPart)
    .maybeSingle();

  if (!adresa || !adresa.active) return { stav: "neznama_adresa", vytvorenych: 0 };

  const odosielatel = (mail.from ?? "").trim() || null;
  const predmet = (mail.subject ?? "").trim() || null;

  const { data: zaznam } = await supabaseAdmin
    .from("inbox_messages")
    .insert({
      company_id: adresa.company_id,
      address_id: adresa.id,
      provider_email_id: mail.email_id,
      from_email: odosielatel,
      subject: predmet,
      status: "prijate",
    })
    .select("id")
    .single();

  async function doprav(stav: string, detail: string | null, pocet: number, faktury: string[]) {
    if (zaznam?.id) {
      await supabaseAdmin
        .from("inbox_messages")
        .update({
          status: stav,
          detail,
          attachment_count: pocet,
          created_invoice_ids: faktury,
        })
        .eq("id", zaznam.id);
    }
    await supabaseAdmin
      .from("inbox_addresses")
      .update({ last_received_at: new Date().toISOString() })
      .eq("id", adresa!.id);
  }

  try {
    /*
     * Prílohy prijatého mailu treba z Resendu **čítať**, kým odosielací kľúč
     * má zámerne len právo posielať — inak by jeho únik znamenal prístup k
     * celej pošte. Preto vlastný kľúč; keď nie je, skúsi sa odosielací, aby
     * to na inštalácii s jedným plnohodnotným kľúčom fungovalo tiež.
     */
    const apiKey = (process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY)?.trim();
    if (!apiKey) throw new Error("RESEND_INBOUND_API_KEY ani RESEND_API_KEY nie je nastavený");

    /*
      Potvrdenie preposielania od poskytovateľa pošty ide vlastnou cestou a
      **nesmie** sa dostať do bežného spracovania: nie je to doklad a jeho telo
      nemá čo skončiť v prijatých faktúrach.
    */
    const poskytovatel = poskytovatelPotvrdenia(odosielatel);
    if (poskytovatel) {
      const detail = await ulozPotvrdeniePreposielania({
        supabaseAdmin,
        companyId: adresa.company_id,
        emailId: mail.email_id,
        apiKey,
        predmet,
        poskytovatel,
        naseAdresy: [
          celaAdresa(localPart, podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA)),
          ...(mail.to ?? []),
          ...(mail.received_for ?? []),
        ],
      });
      await doprav("potvrdenie", detail, 0, []);
      return { stav: "potvrdenie", vytvorenych: 0, detail };
    }

    const vsetky = await prilohyMailu(mail.email_id, apiKey);
    const doklady = vsetky.filter((p) => jePrilohaDoklad(p.content_type, p.filename));

    if (!doklady.length) {
      await doprav("bez_prilohy", "Mail neobsahoval PDF ani fotku dokladu.", vsetky.length, []);
      return { stav: "bez_prilohy", vytvorenych: 0 };
    }

    const dnes = new Date().toISOString().slice(0, 10);
    const vytvorene: string[] = [];
    const poznamky: string[] = [];

    for (const priloha of doklady.slice(0, MAX_PRILOH)) {
      if ((priloha.size ?? 0) > MAX_BAJTOV) {
        poznamky.push(`${priloha.filename ?? "príloha"}: väčšia než 15 MB, preskočená`);
        continue;
      }
      if (!priloha.download_url) {
        poznamky.push(`${priloha.filename ?? "príloha"}: chýba odkaz na stiahnutie`);
        continue;
      }

      const stiahnute = await fetch(priloha.download_url);
      if (!stiahnute.ok) {
        poznamky.push(`${priloha.filename ?? "príloha"}: stiahnutie zlyhalo (${stiahnute.status})`);
        continue;
      }
      const bajty = Buffer.from(await stiahnute.arrayBuffer());
      if (bajty.length > MAX_BAJTOV) {
        poznamky.push(`${priloha.filename ?? "príloha"}: väčšia než 15 MB, preskočená`);
        continue;
      }

      const mime = (priloha.content_type ?? "application/pdf").split(";")[0]!.trim();
      const pripona = (priloha.filename?.split(".").pop() ?? "pdf").toLowerCase().slice(0, 5);
      const cesta = `${adresa.company_id}/${crypto.randomUUID()}.${pripona}`;

      const up = await supabaseAdmin.storage
        .from("purchase-invoices")
        .upload(cesta, bajty, { contentType: mime, upsert: false });
      if (up.error) {
        poznamky.push(`${priloha.filename ?? "príloha"}: uloženie zlyhalo`);
        continue;
      }

      const ai = await precitajDoklad(bajty.toString("base64"), mime);
      const faktura = zostavPrijatuFakturu({
        ai,
        odosielatel,
        predmet,
        nazovSuboru: priloha.filename ?? null,
        dnes,
      });

      const { data: vlozena, error } = await supabaseAdmin
        .from("purchase_invoices")
        .insert({
          ...faktura,
          company_id: adresa.company_id,
          created_by: adresa.user_id,
          // `created_by` je majiteľ adresy, nie ten, kto doklad zapísal — bez
          // zdroja by zoznam tvrdil, že to niekto vyplnil ručne.
          source: "mail",
          file_path: cesta,
          file_mime: mime,
          file_size: bajty.length,
        })
        .select("id")
        .single();

      if (error) {
        poznamky.push(`${priloha.filename ?? "príloha"}: zápis zlyhal (${error.message})`);
        continue;
      }
      vytvorene.push(vlozena!.id);
    }

    const preskocene = doklady.length - Math.min(doklady.length, MAX_PRILOH);
    if (preskocene > 0) poznamky.push(`${preskocene} príloh nad rámec limitu ${MAX_PRILOH}`);

    await doprav(
      vytvorene.length ? "hotovo" : "chyba",
      poznamky.join("; ") || null,
      doklady.length,
      vytvorene,
    );
    return {
      stav: vytvorene.length ? "hotovo" : "chyba",
      vytvorenych: vytvorene.length,
      detail: poznamky.join("; ") || undefined,
    };
  } catch (e: any) {
    const detail = String(e?.message ?? e).slice(0, 300);
    console.error("[mail-prijem] spracovanie zlyhalo:", detail);
    await doprav("chyba", detail, 0, []);
    return { stav: "chyba", vytvorenych: 0, detail };
  }
}

export { PODOMENA_DOKLADOV };
