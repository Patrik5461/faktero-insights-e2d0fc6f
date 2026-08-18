import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizujVypis, type Vypis, type VypisPohyb } from "./vypis-pohyby";

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
- "smer" je "prijem" pri pripísaní na účet a "vydaj" pri odpísaní.
- "protiucet" je účet protistrany (IBAN alebo číslo s kódom banky), nie účet,
  ktorého je toto výpis.
- Čo na výpise nie je, daj null. Nič si nedomýšľaj.

ODPOVEDZ VÝHRADNE JSON objektom v tomto tvare:
{"cisloVypisu":"číslo výpisu alebo null","ucet":"IBAN účtu výpisu alebo null","mena":"EUR","datumVypisu":"dátum výpisu alebo null","pohyby":[{"datum":"dátum pohybu","suma":"suma","smer":"prijem|vydaj","popis":"popis platby alebo null","protistrana":"názov protistrany alebo null","protiucet":"účet protistrany alebo null","vs":"variabilný symbol alebo null","ks":"konštantný symbol alebo null","ss":"špecifický symbol alebo null"}]}`;

/** Nad týmto sa už do tridsiatich sekúnd neodpovie — výpis treba rozdeliť. */
const STROP_ZNAKOV = 60_000;
const STROP_SUBORU = 15 * 1024 * 1024;

function odpovedNaJson(odpoved: string): unknown {
  let s = (odpoved ?? "").trim();
  const blok = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s);
  if (blok) s = blok[1].trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const i = s.indexOf("{");
    if (i >= 0) s = s.slice(i);
  }
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export const nacitajBankovyVypisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pdf: string }) => input)
  .handler(async ({ data }): Promise<Vypis & { zdroj: "text" | "sken"; stran: number }> => {
    const bajty = Buffer.from(String(data.pdf ?? ""), "base64");
    if (!bajty.length) throw new Error("Súbor sa nepodarilo prečítať.");
    if (bajty.length > STROP_SUBORU) throw new Error("Súbor je väčší než 15 MB.");

    const { extractText, getDocumentProxy } = await import("unpdf");
    let text = "";
    let stran = 0;
    try {
      const doc = await getDocumentProxy(new Uint8Array(bajty));
      stran = doc.numPages;
      const r = await extractText(doc, { mergePages: true });
      text = String(r.text ?? "").trim();
    } catch {
      throw new Error("Toto nevyzerá na PDF — súbor sa nedá otvoriť.");
    }

    const maTextovuVrstvu = text.length >= 200;
    if (maTextovuVrstvu && text.length > STROP_ZNAKOV) {
      throw new Error(
        `Výpis má ${stran} strán a na jedno spracovanie je príliš dlhý. Rozdeľte ho a nahrajte po častiach.`,
      );
    }

    const { aiText, aiVision } = await import("./ai.server");
    const nastavenie = { json: true, maxOutputTokens: 30000 };
    const odpoved = maTextovuVrstvu
      ? await aiText(`${POKYN}\n\nTEXT VÝPISU:\n${text}`, nastavenie)
      : // Naskenovaný výpis — text v ňom nie je, musí sa čítať z obrazu.
        await aiVision(bajty.toString("base64"), "application/pdf", POKYN, nastavenie);

    const vypis = normalizujVypis(odpovedNaJson(odpoved));
    if (!vypis.pohyby.length) {
      throw new Error(
        maTextovuVrstvu
          ? "Vo výpise sa nenašiel ani jeden pohyb. Skontrolujte, či je to naozaj bankový výpis."
          : "PDF nemá textovú vrstvu a z obrazu sa nič nevyčítalo. Skúste výpis stiahnuť z banky priamo ako PDF.",
      );
    }
    return { ...vypis, zdroj: maTextovuVrstvu ? "text" : "sken", stran };
  });

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
