/*
  Vyúčtovanie výdavkov zamestnanca (ako modul v Doklado).

  Zamestnanec zaplatí bločky a faktúry — zo zálohy, ktorú dostal, z vlastných
  peňazí alebo firemnou kartou. Vyúčtovanie ich zhrnie, povie, kto komu koľko
  dlhuje, a vyrobí PDF na podpis. Doklady v ňom nejdú do Pohody z firemnej
  pokladne (zaplatil ich zamestnanec) a prijatá faktúra sa neplatí dodávateľovi
  hromadným príkazom.
*/

export type TypVyuctovania = "zaloha" | "vlastne" | "karta";

export const TYPY_VYUCTOVANIA: { kod: TypVyuctovania; nazov: string; popis: string }[] = [
  {
    kod: "zaloha",
    nazov: "Vyúčtovanie poskytnutej zálohy",
    popis: "Zamestnanec dostal zálohu a platil z nej — rozdiel sa doplatí alebo vráti.",
  },
  {
    kod: "vlastne",
    nazov: "Vyúčtovanie použitia vlastných zdrojov zamestnanca",
    popis: "Zamestnanec platil vlastnými peniazmi — firma mu celú sumu preplatí.",
  },
  {
    kod: "karta",
    nazov: "Vyúčtovanie použitia firemnej debetnej karty",
    popis: "Platby firemnou kartou — zamestnanec nimi preukazuje, na čo kartu použil.",
  },
];

export const nazovTypu = (t: string) => TYPY_VYUCTOVANIA.find((x) => x.kod === t)?.nazov ?? t;

export type PolozkaVyuctovania = {
  druh: "blocek" | "prijata";
  id: string;
  datum: string | null;
  dodavatel: string | null;
  cislo: string | null;
  sposobUhrady: string | null;
  zaklad: number;
  dph: number;
  spolu: number;
  mena: string;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export type SuhrnVyuctovania = {
  pocet: number;
  zaklad: number;
  dph: number;
  spolu: number;
  zaloha: number;
  /** Kladné = firma doplatí zamestnancovi, záporné = zamestnanec vráti firme. */
  rozdiel: number;
  vysledok: string;
  /** Doklady v inej mene ako vyúčtovanie — do súčtu nevstupujú. */
  inaMena: number;
};

export function suhrnVyuctovania(
  polozky: PolozkaVyuctovania[],
  typ: TypVyuctovania,
  zaloha: number,
  mena = "EUR",
): SuhrnVyuctovania {
  const vMene = polozky.filter((p) => (p.mena || "EUR") === mena);
  const zaklad = r2(vMene.reduce((a, p) => a + p.zaklad, 0));
  const dph = r2(vMene.reduce((a, p) => a + p.dph, 0));
  const spolu = r2(vMene.reduce((a, p) => a + p.spolu, 0));
  const z = typ === "zaloha" ? r2(Math.max(0, Number(zaloha) || 0)) : 0;
  const rozdiel = typ === "karta" ? 0 : r2(spolu - z);
  const suma = (n: number) => `${Math.abs(n).toFixed(2).replace(".", ",")} ${mena}`;
  const vysledok =
    typ === "karta"
      ? "Platené firemnou kartou — nič sa nedopláca."
      : rozdiel > 0
        ? `Firma doplatí zamestnancovi ${suma(rozdiel)}.`
        : rozdiel < 0
          ? `Zamestnanec vráti firme ${suma(rozdiel)}.`
          : "Vyrovnané — nikto nikomu nič nedlhuje.";
  return {
    pocet: polozky.length,
    zaklad,
    dph,
    spolu,
    zaloha: z,
    rozdiel,
    vysledok,
    inaMena: polozky.length - vMene.length,
  };
}

/** Navrhnutý názov: „Vyúčtovanie výdavkov – Ján Novák – 10/2026". */
export function nazovVyuctovania(
  meno: string | null | undefined,
  od?: string | null,
  doDna?: string | null,
): string {
  const mes = (d?: string | null) =>
    d && /^\d{4}-\d{2}/.test(d) ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
  const a = mes(od);
  const b = mes(doDna);
  const obdobie = a && b && a !== b ? `${a}–${b}` : a || b;
  return ["Vyúčtovanie výdavkov", String(meno ?? "").trim(), obdobie].filter(Boolean).join(" – ");
}

/** Bloček do položky (sumy v `expense_documents`). */
export function polozkaZBlocku(d: Record<string, any>): PolozkaVyuctovania {
  const spolu = Number(d.total_amount ?? 0) || 0;
  const dph = Number(d.vat_amount ?? 0) || 0;
  return {
    druh: "blocek",
    id: d.id,
    datum: d.issue_date ?? null,
    dodavatel: d.supplier_name ?? null,
    cislo: d.document_number ?? null,
    sposobUhrady: d.payment_method ?? null,
    zaklad: r2(d.base_amount != null ? Number(d.base_amount) : spolu - dph),
    dph: r2(dph),
    spolu: r2(spolu),
    mena: d.currency ?? "EUR",
  };
}

/** Prijatá faktúra do položky. */
export function polozkaZPrijatej(p: Record<string, any>): PolozkaVyuctovania {
  return {
    druh: "prijata",
    id: p.id,
    datum: p.issue_date ?? null,
    dodavatel: p.supplier_name ?? null,
    cislo: p.invoice_number ?? null,
    sposobUhrady: p.payment_method ?? null,
    zaklad: r2(Number(p.amount_without_vat ?? 0) || 0),
    dph: r2(Number(p.vat_amount ?? 0) || 0),
    spolu: r2(Number(p.amount_total ?? 0) || 0),
    mena: p.currency ?? "EUR",
  };
}
