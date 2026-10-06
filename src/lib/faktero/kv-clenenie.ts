/*
  Členenie kontrolného výkazu DPH na prijatom doklade.

  Prázdne = automaticky: Faktero aj Pohoda ho odvodia samy (bloček do B.3,
  faktúra do B.2, prenesenie do B.1, opravný doklad do C.2). Vybrať ho treba
  len vtedy, keď doklad patrí inam — napríklad bloček, ktorý je v skutočnosti
  plnohodnotná faktúra (B.2), alebo doklad, ktorý do výkazu nepatrí vôbec.
*/

export const KV_CLENENIA: { kod: string; nazov: string }[] = [
  { kod: "A1", nazov: "A.1 — vydané faktúry, tuzemsko" },
  { kod: "A2", nazov: "A.2 — vydané faktúry, prenesenie (§ 69 ods. 12)" },
  { kod: "B1", nazov: "B.1 — prijaté, daň platí odberateľ (prenesenie, EÚ)" },
  { kod: "B2", nazov: "B.2 — prijaté faktúry s odpočtom" },
  { kod: "B3", nazov: "B.3 — zjednodušené faktúry, bločky (ERP)" },
  { kod: "C1", nazov: "C.1 — vydané opravné faktúry" },
  { kod: "C2", nazov: "C.2 — prijaté opravné faktúry" },
  { kod: "D1", nazov: "D.1 — tržby z ERP" },
  { kod: "D2", nazov: "D.2 — ostatné vydané" },
  { kod: "X", nazov: "Nezahŕňať do kontrolného výkazu" },
];

/** Na prijatých dokladoch dávajú zmysel len tieto. */
export const KV_PRIJATE = KV_CLENENIA.filter((k) => ["B1", "B2", "B3", "C2", "X"].includes(k.kod));

export function nazovKv(kod: string | null | undefined): string | null {
  if (!kod) return null;
  return KV_CLENENIA.find((k) => k.kod === kod)?.nazov ?? kod;
}

/** Čo by doklad dostal automaticky — na zobrazenie v placeholdri. */
export function kvAutomaticky(d: {
  blocek?: boolean;
  opravny?: boolean;
  prenesenie?: boolean;
}): string {
  if (d.blocek) return "B3";
  if (d.opravny) return "C2";
  if (d.prenesenie) return "B1";
  return "B2";
}
