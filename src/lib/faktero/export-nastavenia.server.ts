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

type Klient = any;

export type DoplnkyExportu = {
  export: NastaveniaExportu;
  popisyPredkontacii?: Record<string, string>;
  partneriVPohode?: string[];
  bankaPodlaUctu?: Record<string, string>;
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

  const [popisy, partneri, ucty] = await Promise.all([
    ex.textPrijate === "polozka"
      ? supabase
          .from("predkontacie")
          .select("kod, popis")
          .eq("company_id", company.id)
          .eq("druh", "predkontacia")
          .eq("aktivne", true)
      : Promise.resolve({ data: null }),
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
  ]);

  if (popisy?.data) {
    out.popisyPredkontacii = {};
    for (const r of popisy.data as { kod: string; popis: string | null }[]) {
      const p = String(r.popis ?? "").trim();
      if (p && !out.popisyPredkontacii[r.kod]) out.popisyPredkontacii[r.kod] = p;
    }
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
