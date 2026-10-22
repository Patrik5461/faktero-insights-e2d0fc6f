/*
  Nastavenia Nespracovaných dokladov pre firmu — správanie pri vyťažení,
  kontrole a vytvorení dokladu. Ukladajú sa v `companies.uctovanie_nastavenia`
  pod kľúčom `nespracovane` (nový stĺpec netreba, kopírovanie nastavení do
  iných firiem ich prenesie samo).

  Predvolené hodnoty zodpovedajú tomu, ako Faktero fungovalo doteraz —
  okrem `zauctovat`: vytvorením z Nespracovaných je doklad skontrolovaný,
  zaúčtovaný a pripravený na export, keď sa preň dá určiť predkontácia aj
  členenie DPH (vlastné, z pravidla, z kategórie alebo predvolené firmy).
*/

export type NastaveniaNespracovanych = {
  /** Vytvorená prijatá faktúra je rovno zaúčtovaná (pripravená na export). */
  zauctovat: boolean;
  /** Po vytvorení otvoriť ďalší nespracovaný doklad, inak zoznam. */
  dalsi: boolean;
  /** Splatnosť pred dátumom vystavenia doklad zastaví. */
  kontrolaSplatnosti: boolean;
  /**
   * Odchýlka súčtu položiek od sumy dokladu (v centoch), pri ktorej sa doklad
   * dá vytvoriť — rozdiel sa doplní vyrovnávacou položkou.
   */
  toleranciaCenty: number;
  /** Položky faktúr sa použijú hneď po vyťažení (inak čakajú vypnuté). */
  polozkyFaktur: boolean;
  /** Položky bločkov sa použijú hneď po vyťažení. */
  polozkyBlockov: boolean;
  /** Číslo dodacieho listu sa z dokladu preberá. */
  dodaciList: boolean;
  /**
   * Doklad so sumami vo viacerých menách (napr. CZK aj EUR, alebo EUR
   * s prepočtom na CZK) sa vyťaží v domácej mene firmy (SK EUR, CZ CZK).
   */
  domacaMena: boolean;
};

export const PREDVOLENE_NESPRACOVANE: NastaveniaNespracovanych = {
  zauctovat: true,
  dalsi: true,
  kontrolaSplatnosti: true,
  toleranciaCenty: 0,
  polozkyFaktur: true,
  polozkyBlockov: true,
  dodaciList: true,
  domacaMena: true,
};

/** Najväčšia povolená tolerancia — viac by už nebolo zaokrúhlenie, ale chyba v sumách. */
export const MAX_TOLERANCIA_CENTOV = 100;

const ano = (v: unknown, predvolene: boolean) => (typeof v === "boolean" ? v : predvolene);

/** Nastavenia z `companies.uctovanie_nastavenia` (chýbajúce = predvolené). */
export function nastaveniaNespracovanych(uctovanieNastavenia: unknown): NastaveniaNespracovanych {
  const vsetko =
    uctovanieNastavenia && typeof uctovanieNastavenia === "object"
      ? (uctovanieNastavenia as Record<string, unknown>)
      : {};
  const n =
    vsetko.nespracovane && typeof vsetko.nespracovane === "object"
      ? (vsetko.nespracovane as Record<string, unknown>)
      : {};
  const p = PREDVOLENE_NESPRACOVANE;
  const tol = Math.round(Number(n.toleranciaCenty));
  return {
    zauctovat: ano(n.zauctovat, p.zauctovat),
    dalsi: ano(n.dalsi, p.dalsi),
    kontrolaSplatnosti: ano(n.kontrolaSplatnosti, p.kontrolaSplatnosti),
    toleranciaCenty: Number.isFinite(tol) ? Math.min(MAX_TOLERANCIA_CENTOV, Math.max(0, tol)) : 0,
    polozkyFaktur: ano(n.polozkyFaktur, p.polozkyFaktur),
    polozkyBlockov: ano(n.polozkyBlockov, p.polozkyBlockov),
    dodaciList: ano(n.dodaciList, p.dodaciList),
    domacaMena: ano(n.domacaMena, p.domacaMena),
  };
}

/**
 * Úprava vyťažených údajov podľa nastavení firmy: položky čakajú vypnuté
 * (dajú sa jedným prepínačom zapnúť), číslo dodacieho listu sa nepreberie.
 * Čo už človek rozhodol (`polozkyVypnute` je vyplnené), sa nemení.
 */
export function upravVytazeneUdaje<
  U extends { polozky: unknown[]; polozkyVypnute?: boolean; dodaciList?: string },
>(u: U, druh: string | null | undefined, n: NastaveniaNespracovanych): U {
  let out = u;
  const blocek = druh === "blocek";
  const vytazovat = blocek ? n.polozkyBlockov : n.polozkyFaktur;
  if (!vytazovat && out.polozky.length && out.polozkyVypnute === undefined)
    out = { ...out, polozkyVypnute: true };
  if (!n.dodaciList && out.dodaciList) out = { ...out, dodaciList: "" };
  return out;
}

/**
 * Dá sa pre prijatú faktúru určiť predkontácia aj členenie DPH? Rovnaké
 * poradie ako kontrola pred exportom (`prekazkaDokladu`): vlastný kód,
 * kód podľa kategórie, predvolený kód firmy.
 */
export function kodyPrijatejUrcene(
  p: {
    pohoda_predkontacia?: string | null;
    pohoda_clenenie_dph?: string | null;
    category?: string | null;
    reverse_charge?: boolean | null;
  },
  firma: Record<string, any> | null | undefined,
  podlaKategorie: Record<string, { predkontacia?: string | null; clenenie?: string | null }> = {},
): boolean {
  const k = (v: unknown) => String(v ?? "").trim();
  const kat = podlaKategorie[k(p.category)] ?? {};
  const pk =
    k(p.pohoda_predkontacia) || k(kat.predkontacia) || k(firma?.pohoda_predkontacia_prijata);
  const cl =
    k(p.pohoda_clenenie_dph) ||
    k(kat.clenenie) ||
    (p.reverse_charge ? k(firma?.pohoda_clenenie_dph_prijata_pdp) : "") ||
    k(firma?.pohoda_clenenie_dph_prijata);
  return Boolean(pk && cl);
}
