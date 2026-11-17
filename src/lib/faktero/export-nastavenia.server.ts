/*
  Doplnky nastavení exportu, ktoré treba načítať z databázy: nastavenia firmy
  (`uctovanie_nastavenia.export`), popisy predkontácií pre text dokladu,
  partneri, ktorí už sú v adresári Pohody, a skratky bankových účtov.

  Načítava sa len to, čo si firma zapla — firma bez nastavení nespraví ani
  jeden dotaz navyše okrem skratiek účtov (tie sú lacné a bez nich by faktúra
  na druhý účet išla s predvolenou skratkou).
*/

import { nastaveniaExportu, type NastaveniaExportu } from "./export-nastavenia";
import { vsetkoAkoData } from "./strankovanie";
import { mapaPredkontacii, type MapaPredkontaciiPohody } from "./pohoda-predkontacia";

type Klient = any;

export type DoplnkyExportu = {
  export: NastaveniaExportu;
  popisyPredkontacii?: Record<string, string>;
  /** Popis predkontácie pre text hlavičky vydanej faktúry (`popisyVydanych`). */
  popisyPredkontaciiVydanych?: Record<string, string>;
  partneriVPohode?: string[];
  bankaPodlaUctu?: Record<string, string>;
  /** Preklad predkontácií (dvojíc účtov) na skratky Pohody. */
  mapaPredkontacii?: MapaPredkontaciiPohody;
  /**
   * Členenia DPH, ktoré má firma v číselníku Pohody vypnuté (`aktivne=false`,
   * v Pohode „offer“) — POHODA ich pri importe nahradí UD, export ich zastaví.
   */
  vypnuteClenenia?: string[];
};

export async function doplnkyExportu(
  supabase: Klient,
  company: Record<string, any>,
): Promise<DoplnkyExportu> {
  /*
    Doplnky nesmú zhodiť export: keď sa nedajú načítať, ide doklad s tým, čo
    je vo firme (bez skratiek účtov a párovania partnerov).
  */
  try {
    return await nacitajDoplnky(supabase, company);
  } catch {
    return { export: nastaveniaExportu(company?.uctovanie_nastavenia) };
  }
}

async function nacitajDoplnky(
  supabase: Klient,
  company: Record<string, any>,
): Promise<DoplnkyExportu> {
  // Firma prichádza z rôznych miest s rôznym výberom stĺpcov.
  let un = company?.uctovanie_nastavenia;
  if (!("uctovanie_nastavenia" in (company ?? {})) && company?.id) {
    const { data } = await supabase
      .from("companies")
      .select("uctovanie_nastavenia")
      .eq("id", company.id)
      .maybeSingle();
    un = data?.uctovanie_nastavenia ?? null;
  }
  const ex = nastaveniaExportu(un);
  const out: DoplnkyExportu = { export: ex };
  if (!company?.id) return out;

  const [popisy, partneri, ucty, clenenia] = await Promise.all([
    // Popis predkontácie — text dokladu „názov účtovnej položky“ aj text bločku bez popisu.
    supabase
      .from("predkontacie")
      .select("kod, popis, zdroj, ucet_md, ucet_d, agenda")
      .eq("company_id", company.id)
      .eq("druh", "predkontacia")
      .eq("aktivne", true),
    ex.partneri === "parovat"
      ? vsetkoAkoData((zac, kon) =>
          supabase
            .from("pohoda_odoslane")
            .select("zaznam_id")
            .eq("company_id", company.id)
            .eq("agenda", "adresar")
            .order("zaznam_id")
            .range(zac, kon),
        )
      : Promise.resolve({ data: null }),
    supabase
      .from("company_bank_accounts")
      .select("id, iban, pohoda_skratka")
      .eq("company_id", company.id),
    // Číselník členení DPH (aj vypnuté) — pre kontrolu vypnutých členení.
    supabase
      .from("predkontacie")
      .select("kod, aktivne")
      .eq("company_id", company.id)
      .eq("druh", "clenenie_dph"),
  ]);

  /*
    Vypnuté členenie = v číselníku je len vypnuté (žiadny zapnutý riadok
    s tým istým kódom). Chyba dotazu export nezastaví — kontrola sa vynechá.
  */
  if (!clenenia?.error && clenenia?.data) {
    const zapnute = new Set<string>();
    const vypnute = new Set<string>();
    for (const r of clenenia.data as { kod: string | null; aktivne: boolean | null }[]) {
      const k = String(r.kod ?? "").trim();
      if (!k) continue;
      (r.aktivne === false ? vypnute : zapnute).add(k);
    }
    const zoz = [...vypnute].filter((k) => !zapnute.has(k));
    if (zoz.length) out.vypnuteClenenia = zoz;
  }

  /*
    Skratky predkontácií Pohody: číselník z Pohody (rovnaké účty MD/D) a ručná
    tabuľka z nastavení exportu. Mapa je vždy, keď sa číselník dal načítať —
    dvojica účtov bez skratky potom do Pohody nejde (pozri pohoda-predkontacia.ts).
  */
  if (popisy?.data) out.mapaPredkontacii = mapaPredkontacii(popisy.data, ex.skratkyPredkontacii);
  if (popisy?.data) {
    out.popisyPredkontacii = {};
    for (const r of popisy.data as { kod: string; popis: string | null }[]) {
      const p = String(r.popis ?? "").trim();
      if (p && !out.popisyPredkontacii[r.kod]) out.popisyPredkontacii[r.kod] = p;
    }
  }
  if (popisy?.data) {
    const v = popisyVydanych(popisy.data);
    if (Object.keys(v).length) out.popisyPredkontaciiVydanych = v;
  }
  if (partneri?.data)
    out.partneriVPohode = (partneri.data as { zaznam_id: string }[]).map((r) =>
      String(r.zaznam_id),
    );
  // Bez stĺpca (stará databáza) dotaz vráti chybu — vtedy sa skratky ignorujú.
  if (!ucty?.error && ucty?.data) {
    const m: Record<string, string> = {};
    for (const u of ucty.data as {
      id: string;
      iban: string | null;
      pohoda_skratka: string | null;
    }[]) {
      const s = String(u.pohoda_skratka ?? "").trim();
      if (!s) continue;
      m[u.id] = s;
      const iban = String(u.iban ?? "")
        .replace(/\s/g, "")
        .toUpperCase();
      if (iban) m[iban] = s;
    }
    if (Object.keys(m).length) out.bankaPodlaUctu = m;
  }
  return out;
}

/**
 * Popis predkontácie pre vydanú faktúru podľa kódu. Ten istý kód má v Pohode
 * v každej agende iný význam („1“ = Tržby za vlastné výrobky vo vydaných, Nákup
 * tovaru v prijatých) — prednosť má agenda vydaných faktúr, potom kód bez
 * agendy (číselník zo súboru, ručne), potom ostatné agendy okrem nákladových.
 */
const NAKLADOVE_AGENDY = new Set([
  "receivedInvoice",
  "receivedAdvanceInvoice",
  "commitment",
  "cashPaid",
  "bankIssued",
]);
export function popisyVydanych(
  riadky: readonly { kod?: unknown; popis?: unknown; agenda?: unknown }[],
): Record<string, string> {
  const poradie = (agenda: unknown) => {
    const a = String(agenda ?? "").trim();
    if (a === "issuedInvoice") return 0;
    if (!a) return 1;
    return NAKLADOVE_AGENDY.has(a) ? -1 : 2;
  };
  const out: Record<string, string> = {};
  const uroven: Record<string, number> = {};
  for (const r of riadky) {
    const k = String(r.kod ?? "").trim();
    const p = String(r.popis ?? "").trim();
    const u = poradie(r.agenda);
    if (!k || !p || u < 0) continue;
    if (k in uroven && uroven[k] <= u) continue;
    out[k] = p;
    uroven[k] = u;
  }
  return out;
}
