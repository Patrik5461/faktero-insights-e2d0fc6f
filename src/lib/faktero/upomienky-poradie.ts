/**
 * Ktorá automatická upomienka je na rade — čistý výpočet pre cron.
 *
 * 29. 10. 2026 cron poslal 37 odberateľom rovno tretiu, „poslednú“ upomienku
 * s vetou o postúpení pohľadávky na vymáhanie. Faktúry prišli deň predtým
 * importom z iného programu: import nenesie úhradu, takže boli „vystavené“
 * a mesiace po splatnosti. Stupeň sa vyberal len podľa dní po splatnosti,
 * takže faktúra 200 dní po splatnosti dostala hneď tretiu.
 *
 * Preto:
 * - faktúra, ktorá vo Fakteri vznikla až po svojej splatnosti (import,
 *   migrácia, dodatočne zapísaná), sa automaticky neupomína — o jej úhrade
 *   nevieme nič; ručne sa upomenúť dá;
 * - stupne idú po poradí (1 → 2 → 3) a medzi dvoma je aspoň ROZOSTUP_DNI dní.
 */

export type StupenUpomienky = 1 | 2 | 3;

/** Najkratší čas medzi dvoma automatickými upomienkami tej istej faktúry. */
export const ROZOSTUP_DNI = 7;

export type VstupUpomienky = {
  /** Splatnosť faktúry (YYYY-MM-DD). */
  splatnost: string;
  /** Kedy faktúra vo Fakteri vznikla (ISO). */
  zalozena: string;
  /** Dnešok (YYYY-MM-DD). */
  dnes: string;
  /** Dni po splatnosti pre 1., 2. a 3. upomienku (nastavenie firmy). */
  prahy: [number, number, number];
  /** Už odoslané upomienky tejto faktúry. */
  odoslane: { stupen: number; kedy: string }[];
};

export type VysledokUpomienky =
  | { stupen: StupenUpomienky }
  | { stupen: null; dovod: "importovana" | "este_nie" | "vsetky_odoslane" | "rozostup" };

const DEN = 86_400_000;
const dni = (od: string, do_: string) =>
  Math.floor(
    (Date.parse(do_.slice(0, 10) + "T00:00:00Z") - Date.parse(od.slice(0, 10) + "T00:00:00Z")) /
      DEN,
  );

export function upomienkaNaRade(v: VstupUpomienky): VysledokUpomienky {
  // Vznikla až po splatnosti → nevieme, či nie je dávno zaplatená.
  if (v.zalozena.slice(0, 10) > v.splatnost) return { stupen: null, dovod: "importovana" };

  const posledna = v.odoslane.reduce((m, o) => (o.stupen > m.stupen ? o : m), {
    stupen: 0,
    kedy: "",
  });
  if (posledna.stupen >= 3) return { stupen: null, dovod: "vsetky_odoslane" };
  const dalsi = (posledna.stupen + 1) as StupenUpomienky;

  if (dni(v.splatnost, v.dnes) < v.prahy[dalsi - 1]) return { stupen: null, dovod: "este_nie" };
  if (posledna.kedy && dni(posledna.kedy, v.dnes) < ROZOSTUP_DNI) {
    return { stupen: null, dovod: "rozostup" };
  }
  return { stupen: dalsi };
}
