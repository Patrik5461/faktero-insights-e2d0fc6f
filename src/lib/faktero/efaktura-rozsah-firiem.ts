/**
 * Prehľad firiem na eFaktúre pre administráciu (PDF): čo presne má ktorá
 * firma u nás — odosielanie aj prijímanie, len odosielanie, alebo či je
 * ešte len v procese.
 *
 * Rozhoduje posledná žiadosť z Portálu FS (`efaktura_pds_ziadosti` —
 * firma si Faktero vybrala za poštára, teda príjem aj odosielanie) a posledný
 * onboarding „len odosielanie“ (`efaktura_odosielanie_ziadosti` — príjem
 * ostáva u iného poskytovateľa). Čisté funkcie, aby sa dali skúšať.
 */

export type RozsahEfaktury =
  | "odosielanie_prijimanie"
  | "len_odosielanie"
  | "v_procese"
  | "cudzi_poskytovatel"
  | "bez_portalu"
  | "nefunkcne";

export const NAZOV_ROZSAHU: Record<RozsahEfaktury, string> = {
  odosielanie_prijimanie: "Odosielanie aj prijímanie",
  len_odosielanie: "Len odosielanie",
  v_procese: "V procese aktivácie",
  cudzi_poskytovatel: "U iného poskytovateľa",
  bez_portalu: "Bez výberu na portáli FS",
  nefunkcne: "Zamietnutá / chyba",
};

/** Poradie v PDF — najprv tie, čo naozaj fungujú. */
export const PORADIE_ROZSAHU: RozsahEfaktury[] = [
  "odosielanie_prijimanie",
  "len_odosielanie",
  "v_procese",
  "cudzi_poskytovatel",
  "bez_portalu",
  "nefunkcne",
];

const PDS_V_PROCESE = new Set(["prijata", "na_schvalenie", "registruje_sa", "na_kontrolu"]);
const SEND_ONLY_V_PROCESE = new Set([
  "vytvorena",
  "caka_na_fs",
  "caka_na_potvrdenie",
  "aktivuje_sa",
]);

export type VstupFirmy = {
  pdsStav: string | null;
  cudziPoskytovatel?: string | null;
  sendOnlyStav: string | null;
  prijemPoskytovatel?: string | null;
  maProfil: boolean;
};

export function rozsahFirmy(v: VstupFirmy): { rozsah: RozsahEfaktury; poznamka: string | null } {
  if (v.sendOnlyStav === "active") {
    return {
      rozsah: "len_odosielanie",
      poznamka: v.prijemPoskytovatel
        ? `príjem u: ${v.prijemPoskytovatel}`
        : "príjem u iného poskytovateľa",
    };
  }
  if (v.pdsStav === "registrovana") return { rozsah: "odosielanie_prijimanie", poznamka: null };
  if (
    (v.pdsStav && PDS_V_PROCESE.has(v.pdsStav)) ||
    (v.sendOnlyStav && SEND_ONLY_V_PROCESE.has(v.sendOnlyStav))
  ) {
    return {
      rozsah: "v_procese",
      poznamka:
        v.sendOnlyStav && SEND_ONLY_V_PROCESE.has(v.sendOnlyStav) ? "žiada len odosielanie" : null,
    };
  }
  if (v.pdsStav === "cudzi_poskytovatel") {
    return { rozsah: "cudzi_poskytovatel", poznamka: v.cudziPoskytovatel ?? null };
  }
  if (
    v.pdsStav === "zamietnuta" ||
    v.pdsStav === "chyba" ||
    v.sendOnlyStav === "zamietnuta" ||
    v.sendOnlyStav === "chyba"
  ) {
    return { rozsah: "nefunkcne", poznamka: null };
  }
  return { rozsah: "bez_portalu", poznamka: v.maProfil ? "testovacie / sandbox napojenie" : null };
}
