/*
  Splatnosť faktúry a jej predĺženie.

  Predĺženie je obchodná dohoda — mení sa podľa nej, kedy je faktúra „po
  splatnosti“, upomienky aj prehľady. Lehoty DPH (§ 53b 101 dní, § 25a 150 dní)
  sa ale počítajú od pôvodnej splatnosti dohodnutej pri vzniku záväzku — tú si
  databáza pamätá v `povodna_splatnost` pri prvej zmene.
*/

export type SoSplatnostou = {
  due_date?: string | null;
  povodna_splatnost?: string | null;
};

/** Splatnosť, od ktorej sa počítajú lehoty DPH. */
export function danovaSplatnost(r: SoSplatnostou): string | null {
  return (r.povodna_splatnost || r.due_date || null) as string | null;
}

/** Bola splatnosť po vystavení zmenená? */
export function predlzena(r: SoSplatnostou): boolean {
  return Boolean(r.povodna_splatnost && r.due_date && r.povodna_splatnost !== r.due_date);
}

const datum = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${Number(dd)}. ${Number(m)}. ${y}`;
};

/** „30. 11. 2026 (predĺžená, pôvodne 31. 10. 2026)“ */
export function popisSplatnosti(r: SoSplatnostou): string {
  if (!r.due_date) return "—";
  if (!predlzena(r)) return datum(r.due_date);
  const druh = String(r.due_date) > String(r.povodna_splatnost) ? "predĺžená" : "skrátená";
  return `${datum(r.due_date)} (${druh}, pôvodne ${datum(String(r.povodna_splatnost))})`;
}
