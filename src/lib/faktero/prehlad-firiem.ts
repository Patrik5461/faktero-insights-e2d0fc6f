/*
  Stav firiem v Správe firiem — jeden riadok z `prehlad_firiem_stav` na firmu.

  Databáza vráti NULL pri tom, čo prihlásený v danej firme vidieť nesmie
  (vlastný prístup bez oblasti, dvojfaktor neprejdený). Tu sa NULL nemení na
  nulu — zoznam bunku vtedy vôbec nezobrazí, aby to nevyzeralo ako „nič“.
  Čisté funkcie, aby sa dali skúšať.
*/

import { rozsahFirmy, type RozsahEfaktury } from "./efaktura-rozsah-firiem";

export type StavFirmy = {
  nespracovane: number | null;
  neodovzdaneBlocky: number | null;
  efakturyNezaevidovane: number | null;
  poSplatnosti: number | null;
  /** NULL, keď eFaktúru nesmie vidieť (oblasť Faktúry). */
  efaktura: { rozsah: RozsahEfaktury; poskytovatel: string | null } | null;
  /** NULL, keď nesmie vidieť banku. */
  banka: { spolu: number; napojene: number; problem: number; suhlas: number } | null;
};

const cislo = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Riadok z RPC → stav firmy. Bez práva na faktúry ostane eFaktúra prázdna. */
export function stavZRiadku(x: Record<string, unknown>): StavFirmy {
  const vidiFaktury = x.po_splatnosti !== null && x.po_splatnosti !== undefined;
  let efaktura: StavFirmy["efaktura"] = null;
  if (vidiFaktury) {
    const pdsStav = (x.efaktura_pds_stav as string | null) ?? null;
    const sendOnlyStav = (x.efaktura_odosielanie_stav as string | null) ?? null;
    const cudzi = (x.efaktura_cudzi_poskytovatel as string | null) ?? null;
    const prijem = (x.efaktura_prijem_poskytovatel as string | null) ?? null;
    const { rozsah } = rozsahFirmy({
      pdsStav,
      cudziPoskytovatel: cudzi,
      sendOnlyStav,
      prijemPoskytovatel: prijem,
      maProfil: Boolean(x.efaktura_profil),
    });
    efaktura = {
      rozsah,
      poskytovatel:
        rozsah === "len_odosielanie" ? prijem : rozsah === "cudzi_poskytovatel" ? cudzi : null,
    };
  }
  const spolu = cislo(x.ucty_spolu);
  return {
    nespracovane: cislo(x.nespracovane),
    neodovzdaneBlocky: cislo(x.neodovzdane_blocky),
    efakturyNezaevidovane: cislo(x.efaktury_nezaevidovane),
    poSplatnosti: cislo(x.po_splatnosti),
    efaktura,
    banka:
      spolu === null
        ? null
        : {
            spolu,
            napojene: cislo(x.ucty_napojene) ?? 0,
            problem: cislo(x.ucty_problem) ?? 0,
            suhlas: cislo(x.ucty_suhlas) ?? 0,
          },
  };
}

export type Ton = "ok" | "pozor" | "chyba" | "neutralny";

/** Štítok eFaktúry pre zákazníka — kratší než v administrácii. */
export const STITOK_EFAKTURY: Record<RozsahEfaktury, { text: string; ton: Ton }> = {
  odosielanie_prijimanie: { text: "Odosielanie aj prijímanie", ton: "ok" },
  len_odosielanie: { text: "Len odosielanie", ton: "ok" },
  v_procese: { text: "V procese", ton: "pozor" },
  cudzi_poskytovatel: { text: "U iného poskytovateľa", ton: "neutralny" },
  bez_portalu: { text: "Neregistrovaná", ton: "chyba" },
  nefunkcne: { text: "Zamietnutá / chyba", ton: "chyba" },
};

/**
 * eFaktúra (Peppol, povinnosť od 2027) je slovenská vec. Pri inej krajine sa
 * stav ukáže, len keď firma nejakú registráciu predsa má — inak by každá
 * česká firma svietila červeným „Neregistrovaná“.
 */
export function ukazatEfakturu(krajina: string | null | undefined, s: StavFirmy): boolean {
  if (!s.efaktura) return false;
  if (!krajina || krajina === "SK") return true;
  return s.efaktura.rozsah !== "bez_portalu";
}

export type StavBanky = { ton: Ton; text: string | null };

/**
 * Banka v jednej bunke: napojené/všetky a ako zle to je. Vypršaný súhlas je
 * horší než nenapojený účet — ten sa nesťahuje vôbec a človek o tom nevie.
 */
export function stavBanky(b: NonNullable<StavFirmy["banka"]>): StavBanky {
  if (b.suhlas > 0) return { ton: "chyba", text: "Vypršal súhlas banky" };
  if (b.problem > 0) return { ton: "chyba", text: "Pripojenie zlyhalo" };
  if (b.spolu === 0) return { ton: "pozor", text: "Bez bankového účtu" };
  if (b.napojene < b.spolu) return { ton: "pozor", text: "Niektorý účet nie je napojený" };
  return { ton: "ok", text: null };
}

/** Kam vedie ktoré číslo — po prepnutí do firmy. Parametre sú v adrese, prechod je celou stránkou. */
export const ODKAZY_PREHLADU = {
  nespracovane: "/nespracovane",
  neodovzdaneBlocky: "/doklady?stav=spracovane",
  efaktura: "/efaktura",
  efakturyNezaevidovane: "/efaktura/prijate",
  poSplatnosti: "/faktury?poSplatnosti=true",
  banka: "/bankove-ucty",
  pripojitBanku: "/bankove-ucty/pripojit",
  dokladyMailom: "/doklady/mailom",
} as const;

/** Po 500 firmách na jedno volanie, aby výsledok nenarazil na strop 1 000 riadkov. */
export function kusy<T>(pole: T[], velkost = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < pole.length; i += velkost) out.push(pole.slice(i, i + velkost));
  return out;
}
