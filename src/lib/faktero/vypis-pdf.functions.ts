import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  normalizujVypis,
  rozdelVypis,
  zlejVypisy,
  type Vypis,
  type VypisPohyb,
} from "./vypis-pohyby";

/**
 * Prečítanie bankového výpisu z PDF.
 *
 * Ide to v dvoch krokoch a to je zámer: najprv sa z PDF vytiahne **text**
 * (`unpdf`) a modelu sa pošle len ten. Výpis z banky textovú vrstvu takmer
 * vždy má, text je oproti celému súboru rádovo rýchlejší aj lacnejší — a
 * hlavne sa stihne, kým nginx požiadavku po tridsiatich sekundách nepretne.
 * Až keď textová vrstva chýba (vytlačený a naskenovaný výpis), pošle sa celý
 * súbor na rozpoznávanie z obrazu.
 */

const POKYN = `ÚLOHA: Z bankového výpisu vyber hlavičku a VŠETKY pohyby na účte.

PRAVIDLÁ:
- Vyber každý pohyb, vrátane poplatkov, úrokov a daní z úrokov.
- Súčtové a zostatkové riadky (počiatočný zostatok, konečný zostatok, obraty
  spolu, prevedený zostatok) NIE sú pohyby — tie vynechaj.
- Sumu opíš presne tak, ako je na výpise, aj so znamienkom a oddeľovačmi.
- Keď je pri pohybe len deň a mesiac (napr. "15.08."), doplň rok z hlavičky výpisu.
- "smer" je "prijem" pri pripísaní na účet a "vydaj" pri odpísaní.
- "protiucet" je účet protistrany (IBAN alebo číslo s kódom banky), nie účet,
  ktorého je toto výpis.
- Pri platbe kartou je protistranou obchodník. Výpis ho píše za štítok
  "Miesto" (ČSOB), inde "Obchodník" alebo "Terminál" — napr. z
  "Platba kartou, Miesto: BOLT.EU" daj do "protistrana" hodnotu "BOLT.EU".
  Celý text pohybu nechaj aj v "popis".
- Čo na výpise nie je, daj null. Nič si nedomýšľaj.

ODPOVEDZ VÝHRADNE JSON objektom v tomto tvare:
{"cisloVypisu":"číslo výpisu alebo null","ucet":"IBAN účtu výpisu alebo null","mena":"EUR","datumVypisu":"dátum výpisu alebo null","pohyby":[{"datum":"dátum pohybu","suma":"suma","smer":"prijem|vydaj","popis":"popis platby alebo null","protistrana":"názov protistrany alebo null","protiucet":"účet protistrany alebo null","vs":"variabilný symbol alebo null","ks":"konštantný symbol alebo null","ss":"špecifický symbol alebo null"}]}`;

/**
 * Strop dĺžky výpisu.
 *
 * Šesťdesiat tisíc znakov tu ostalo z čias, keď sa výpis posielal na model
 * vcelku a dlhšia požiadavka sa nestihla. Odvtedy sa delí na kusy, takže ide
 * o cenu a nie o čas — hranica je preto v počte kusov nižšie.
 */
const STROP_ZNAKOV = 250_000;
const STROP_KUSOV = 40;
const STROP_SUBORU = 15 * 1024 * 1024;

/**
 * Koľko kusov ide na model naraz.
 *
 * Bez obmedzenia išli všetky súbežne a pri dlhom výpise sa narazilo na strop
 * požiadaviek za minútu. Štyri sú kompromis: čítanie ostáva rýchle a `429`
 * takmer nechodí — a keď príde, `ai.server` ho ešte raz zopakuje.
 */
const SUCASNE = 4;

/** Práca po dávkach, nech ich naraz nebeží viac než `sucasne`. */
async function podavkach<T, V>(
  veci: T[],
  sucasne: number,
  praca: (vec: T) => Promise<V>,
): Promise<V[]> {
  const vysledky: V[] = [];
  for (let i = 0; i < veci.length; i += sucasne) {
    vysledky.push(...(await Promise.all(veci.slice(i, i + sucasne).map(praca))));
  }
  return vysledky;
}

/** Koľko riadkov model vrátil, ešte pred kontrolou dátumov a súm. */
function pocetRiadkov(odpoved: unknown): number {
  const o = (odpoved ?? {}) as Record<string, unknown>;
  for (const k of ["pohyby", "transactions"]) {
    if (Array.isArray(o[k])) return (o[k] as unknown[]).length;
  }
  return Array.isArray(odpoved) ? (odpoved as unknown[]).length : 0;
}

/**
 * Odpoveď modelu ako JSON — a keď sa to nepodarí, treba to vedieť.
 *
 * Predtým sa pri neplatnom JSON vrátil prázdny objekt a stratila sa tým celá
 * príčina: navonok to vyzeralo rovnako, ako keby model nenašiel ani jeden
 * pohyb, a človek dostal radu „skontrolujte, či je to naozaj bankový výpis",
 * hoci výpis bol v poriadku a len sa orezala odpoveď.
 */
function odpovedNaJson(odpoved: string): { hodnota: unknown; zlyhalo: boolean } {
  let s = (odpoved ?? "").trim();
  const blok = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s);
  if (blok) s = blok[1].trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const i = s.indexOf("{");
    if (i >= 0) s = s.slice(i);
  }
  try {
    return { hodnota: JSON.parse(s), zlyhalo: false };
  } catch {
    /*
      Do logu ide len dĺžka a to, či odpoveď vôbec končí zátvorkou — orezanú
      odpoveď to prezradí a obsah výpisu sa pritom nikam nezapíše.
    */
    console.warn(
      `[vypis] odpoveď modelu sa nedá prečítať ako JSON: ${s.length} znakov, ` +
        `${s.trimEnd().endsWith("}") ? "uzavretá" : "neuzavretá (orezaná odpoveď)"}`,
    );
    return { hodnota: {}, zlyhalo: true };
  }
}

type PrecitanyVypis = Vypis & { zdroj: "text" | "sken"; stran: number };

async function precitajVypis(data: {
  pdf?: string;
  text?: string;
  stran?: number;
}): Promise<PrecitanyVypis> {
  {
    /*
      Text si vie vytiahnuť už prehliadač a vtedy sa sem posiela **len text**.
      Je to rozdiel medzi pár kilobajtmi a niekoľkými megabajtmi: PDF sa do
      požiadavky vkladá ako base64, čo ho nafúkne o tretinu, a nad dvadsať
      megabajtov ho nepustí ani nginx — v prehliadači sa to prejaví ako holé
      „Failed to fetch" bez akéhokoľvek vysvetlenia.

      Súbor sa posiela len vtedy, keď textová vrstva chýba (naskenovaný výpis)
      alebo keď sa čítanie v prehliadači nepodarilo.
    */
    let text = String(data.text ?? "").trim();
    let stran = Number(data.stran ?? 0);
    let bajty = Buffer.alloc(0);

    if (!text) {
      bajty = Buffer.from(String(data.pdf ?? ""), "base64");
      if (!bajty.length) throw new Error("Súbor sa nepodarilo prečítať.");
      if (bajty.length > STROP_SUBORU) throw new Error("Súbor je väčší než 15 MB.");

      const { extractText, getDocumentProxy } = await import("unpdf");
      try {
        const doc = await getDocumentProxy(new Uint8Array(bajty));
        stran = doc.numPages;
        const r = await extractText(doc, { mergePages: true });
        text = String(r.text ?? "").trim();
      } catch {
        throw new Error("Toto nevyzerá na PDF — súbor sa nedá otvoriť.");
      }
    }

    const maTextovuVrstvu = text.length >= 200;
    if (!maTextovuVrstvu && !bajty.length) {
      throw new Error(
        "PDF nemá textovú vrstvu. Naskenovaný výpis vieme prečítať z obrazu, ale súbor musí mať do 15 MB.",
      );
    }
    if (maTextovuVrstvu && text.length > STROP_ZNAKOV) {
      throw new Error(
        `Výpis má ${stran} strán a na jedno spracovanie je príliš dlhý. Rozdeľte ho a nahrajte po mesiacoch.`,
      );
    }

    const { aiText, aiVision } = await import("./ai.server");
    const nastavenie = { json: true, maxOutputTokens: 12000 };

    let vypis: Vypis;
    let surovych = 0;
    let kusov = 1;
    let necitatelnych = 0;
    if (maTextovuVrstvu) {
      /*
        Dlhý výpis sa číta po kusoch a po štyroch naraz — pri stovke pohybov by
        jedno volanie písalo odpoveď aj niekoľko minút a človek by na ňu
        pozeral. Naraz sa ich ale púšťať nesmie koľkokoľvek: pri desiatich
        kusoch narazí OpenAI na strop požiadaviek za minútu.
      */
      const kusy = rozdelVypis(text);
      kusov = kusy.length;
      if (kusov > STROP_KUSOV) {
        throw new Error(
          `Výpis má ${stran} strán a rozpadol by sa na ${kusov} častí. Rozdeľte ho a nahrajte po mesiacoch.`,
        );
      }
      const casti = await podavkach(kusy, SUCASNE, async (kus) => {
        const o = odpovedNaJson(await aiText(`${POKYN}\n\nTEXT VÝPISU:\n${kus}`, nastavenie));
        return {
          vypis: normalizujVypis(o.hodnota),
          surovych: pocetRiadkov(o.hodnota),
          zlyhalo: o.zlyhalo,
        };
      });
      vypis = zlejVypisy(casti.map((c) => c.vypis));
      surovych = casti.reduce((n, c) => n + c.surovych, 0);
      necitatelnych = casti.filter((c) => c.zlyhalo).length;
    } else {
      // Naskenovaný výpis — text v ňom nie je, musí sa čítať z obrazu.
      const o = odpovedNaJson(
        await aiVision(bajty.toString("base64"), "application/pdf", POKYN, nastavenie),
      );
      vypis = normalizujVypis(o.hodnota);
      surovych = pocetRiadkov(o.hodnota);
      necitatelnych = o.zlyhalo ? 1 : 0;
    }

    /*
      Pri hľadaní príčiny sú podstatné tri prípady a navonok vyzerajú rovnako:
      model odpovedal nezmyslom (odpoveď sa nedá prečítať), model nenašiel nič
      (zle vytiahnutý text) alebo sme všetko zahodili (prísna kontrola dátumov
      a súm). Do logu ide len počet, nie obsah výpisu.
    */
    console.warn(
      `[vypis] text ${text.length} znakov (${stran} str.) v ${kusov} kusoch, ` +
        `${necitatelnych} nečitateľných odpovedí, model vrátil ${surovych} riadkov, ` +
        `po kontrole ostalo ${vypis.pohyby.length}`,
    );

    if (!vypis.pohyby.length) {
      if (necitatelnych) {
        throw new Error(
          necitatelnych === kusov
            ? "Model odpovedal tak, že sa jeho odpoveď nedala prečítať — obvykle je to príliš dlhý výpis. Skúste ho rozdeliť a nahrať po častiach."
            : `Z ${kusov} častí výpisu sa ${necitatelnych} nepodarilo prečítať. Skúste to ešte raz; ak sa to zopakuje, rozdeľte výpis na kratšie kusy.`,
        );
      }
      if (!maTextovuVrstvu) {
        throw new Error(
          "PDF nemá textovú vrstvu a z obrazu sa nič nevyčítalo. Skúste výpis stiahnuť z banky priamo ako PDF.",
        );
      }
      throw new Error(
        surovych > 0
          ? `Z výpisu sa načítalo ${surovych} riadkov, ale ani jeden nemal použiteľný dátum a sumu. Pošlite nám tento výpis, prosím — treba doplniť tvar, v ktorom ho vaša banka píše.`
          : "Vo výpise sa nenašiel ani jeden pohyb. Skontrolujte, či je to naozaj bankový výpis — a ak áno, pošlite nám ho, prosím.",
      );
    }
    return { ...vypis, zdroj: maTextovuVrstvu ? "text" : "sken", stran };
  }
}

/**
 * Spustenie čítania a doptávanie sa na výsledok.
 *
 * Nedá sa to spraviť jednou požiadavkou: čokoľvek, čo beží dlhšie než asi
 * tridsať sekúnd, sa medzi prehliadačom a serverom pretrhne — v prehliadači to
 * vyzerá ako „Failed to fetch", hoci server pokojne pracuje ďalej. Výpis so
 * štyridsiatimi pohybmi číta model vyše minúty, takže sa odpoveď pošle hneď a
 * stránka sa pýta na výsledok, kým nie je hotový. Rovnaký vzor má čítanie
 * zmlúv o financovaní.
 */
const KOS = "imports";

function cestaVysledku(companyId: string, id: string): string {
  return `${companyId}/vypisy/${id}.json`;
}

async function overClena(ctx: { supabase: any; userId: string }, companyId: string) {
  const { data } = await ctx.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!data) throw new Error("Nemáte prístup k firme.");
}

export const spustiCitanieVypisuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { company_id: string; pdf?: string; text?: string; stran?: number }) => input)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as unknown as { supabase: any; userId: string };
    await overClena(ctx, data.company_id);

    const id = crypto.randomUUID();
    void (async () => {
      let vysledok: Record<string, unknown>;
      try {
        vysledok = { ok: true, vypis: await precitajVypis(data) };
      } catch (e: any) {
        vysledok = { ok: false, chyba: e?.message ?? "Výpis sa nepodarilo prečítať." };
      }
      const { error } = await ctx.supabase.storage
        .from(KOS)
        .upload(cestaVysledku(data.company_id, id), Buffer.from(JSON.stringify(vysledok)), {
          contentType: "application/json",
          upsert: true,
        });
      if (error) console.error("[vypis] výsledok sa nepodarilo uložiť:", error.message);
    })();

    return { id };
  });

export const stavCitaniaVypisuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { company_id: string; id: string }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { hotovo: false } | { hotovo: true; ok: boolean; vypis?: PrecitanyVypis; chyba?: string }
    > => {
      const ctx = context as unknown as { supabase: any; userId: string };
      await overClena(ctx, data.company_id);
      // Id chodí z prehliadača — bez tejto kontroly by sa dal vypýtať výsledok
      // z priečinka cudzej firmy.
      if (!/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("Neplatné čítanie.");

      const cesta = cestaVysledku(data.company_id, data.id);
      const { data: subor } = await ctx.supabase.storage.from(KOS).download(cesta);
      if (!subor) return { hotovo: false };
      const vysledok = JSON.parse(await subor.text());

      /*
        Výsledok je odovzdaný, tak nemá prečo ležať ďalej v koši. Je v ňom celý
        výpis — sumy, protistrany aj variabilné symboly — a prevodník je
        jednorazová vec, nie archív. Mazať musí `supabaseAdmin`: kôš `imports`
        má politiku na čítanie a zápis, na mazanie nie. Členstvo aj cesta sú
        overené vyššie a keď sa zmazať nepodarí, čítanie to zhodiť nesmie.
      */
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: chybaMazania } = await supabaseAdmin.storage.from(KOS).remove([cesta]);
      if (chybaMazania)
        console.warn("[vypis] výsledok sa nepodarilo zmazať:", chybaMazania.message);

      return { hotovo: true, ...vysledok };
    },
  );

/**
 * Potvrdené pohyby do XML pre Pohodu.
 *
 * Je to samostatné volanie, nie súčasť čítania PDF: medzi tým človek riadky
 * prejde a opraví, a práve tie opravené sa majú vyviezť. Skratka účtu a
 * predkontácia sa pýtajú na obrazovke — hovoria, do ktorého účtu v Pohode
 * výpis patrí, a to je vec toho konkrétneho výpisu, nie firmy.
 */
export const vypisDoPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      company_id: string;
      pohyby: VypisPohyb[];
      cisloVypisu?: string | null;
      datumVypisu?: string | null;
      banka?: string | null;
      predkontacia?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<{ fileName: string; content: string }> => {
    if (!Array.isArray(data.pohyby) || !data.pohyby.length) {
      throw new Error("Na vývoz nie je ani jeden pohyb.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    /*
      Firma prichádza z požiadavky a `supabaseAdmin` obchádza RLS — bez tejto
      kontroly by si ktokoľvek prihlásený vypýtal IČO cudzej firmy tým, že si
      do volania napíše jej id.
    */
    const { data: clenstvo } = await supabaseAdmin
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.company_id)
      .eq("user_id", (context as { userId: string }).userId)
      .maybeSingle();
    if (!clenstvo) throw new Error("K tejto firme nemáte prístup.");

    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .select("ico, default_currency")
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!company) throw new Error("Firma sa nenašla.");

    const { buildPohodaBankXml } = await import("./export.server");
    const content = buildPohodaBankXml({
      company: company as never,
      pohyby: data.pohyby,
      cisloVypisu: data.cisloVypisu ?? null,
      datumVypisu: data.datumVypisu ?? null,
      nastavenia: { banka: data.banka ?? null, predkontaciaBanka: data.predkontacia ?? null },
    });

    const znacka = (data.cisloVypisu ?? data.datumVypisu ?? "").replace(/[^\w-]/g, "") || "vypis";
    return { fileName: `pohoda-vypis-${znacka}.xml`, content };
  });
