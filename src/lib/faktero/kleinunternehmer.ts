/**
 * Hranice obratu pre Kleinunternehmer (§ 19 UStG), platné od 1. 1. 2025.
 *
 * Malý podnikateľ smie fakturovať bez dane, len kým:
 *  - obrat za **minulý** rok nepresiahol **25 000 €** a
 *  - obrat v **bežnom** roku nepresiahne **100 000 €**.
 *
 * Od roku 2025 sa hranica 100 000 € posudzuje priebežne: faktúra, ktorou ju
 * firma prekročí, už musí byť s DPH (predtým sa rozhodovalo až na budúci rok
 * podľa odhadu). Prekročenie 25 000 € v bežnom roku nič nemení hneď — firma
 * ostáva Kleinunternehmer do konca roka a od 1. januára už nie.
 *
 * Obrat sa tu počíta z vystavených faktúr (bez dane, v eurách, podľa dátumu
 * dodania, s dobropismi odpočítanými a bez zálohových faktúr) — je to
 * upozornenie, nie výpočet pre Finanzamt; ten počíta Gesamtumsatz podľa
 * § 19 Abs. 2 UStG a niektoré oslobodené plnenia z neho vynecháva.
 */
import { jeZapocitatelny, znamienkoDokladu, type DokladRiadok } from "./faktury-sumy";

export const KU_HRANICA_MINULY_ROK = 25_000;
export const KU_HRANICA_BEZNY_ROK = 100_000;
/** Od koľkých percent hranice sa upozorňuje vopred. */
export const KU_PRAH_UPOZORNENIA = 0.8;

export type DokladObratu = DokladRiadok & {
  issue_date?: string | null;
  delivery_date?: string | null;
  subtotal?: unknown;
  subtotal_eur?: unknown;
  currency?: string | null;
  total?: unknown;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Obrat za kalendárny rok z vystavených dokladov (bez dane, v eurách). */
export function obratZaRok(doklady: DokladObratu[], rok: number): number {
  let s = 0;
  for (const f of doklady) {
    if (!jeZapocitatelny(f)) continue;
    const den = String(f.delivery_date || f.issue_date || "");
    if (Number(den.slice(0, 4)) !== rok) continue;
    const cudzia = f.currency && f.currency !== "EUR" && f.subtotal_eur != null;
    const suma = Number(cudzia ? f.subtotal_eur : f.subtotal) || 0;
    s += znamienkoDokladu(f.type, f.total ?? suma) * suma;
  }
  return r2(s);
}

export type UpozornenieKu = {
  /** Slovenský text s `{premennými}` — kľúč pre `t`. */
  sprava: string;
  parametre: Record<string, string | number>;
  /** `koniec` = režim už neplatí, `vystraha` = platí, ale končí / blíži sa koniec. */
  zavaznost: "koniec" | "vystraha";
};

export type StavKu = {
  rok: number;
  obratMinulyRok: number;
  obratBeznyRok: number;
  upozornenia: UpozornenieKu[];
};

/** Stav hraníc § 19 UStG k danému dňu. */
export function stavKleinunternehmer(
  doklady: DokladObratu[],
  dnesISO: string,
  sumaNaText: (n: number) => string = (n) => `${n.toFixed(2)} €`,
): StavKu {
  const rok = Number(dnesISO.slice(0, 4));
  const minuly = obratZaRok(doklady, rok - 1);
  const bezny = obratZaRok(doklady, rok);
  const u: UpozornenieKu[] = [];

  if (minuly > KU_HRANICA_MINULY_ROK) {
    u.push({
      sprava:
        "Obrat za rok {minuly} bol {suma} — viac ako 25 000 €. V roku {rok} už nemôžete fakturovať ako Kleinunternehmer; prepnite režim DPH na Regelbesteuerung.",
      parametre: { minuly: rok - 1, rok, suma: sumaNaText(minuly) },
      zavaznost: "koniec",
    });
  }
  if (bezny > KU_HRANICA_BEZNY_ROK) {
    u.push({
      sprava:
        "Obrat v roku {rok} je {suma} — prekročil 100 000 €. Od faktúry, ktorou ste hranicu prekročili, musíte fakturovať s DPH (§ 19 Abs. 1 UStG).",
      parametre: { rok, suma: sumaNaText(bezny) },
      zavaznost: "koniec",
    });
  } else if (bezny >= KU_HRANICA_BEZNY_ROK * KU_PRAH_UPOZORNENIA) {
    u.push({
      sprava:
        "Obrat v roku {rok} je {suma} — blíži sa k 100 000 €. Faktúra, ktorou hranicu prekročíte, už musí byť s DPH.",
      parametre: { rok, suma: sumaNaText(bezny) },
      zavaznost: "vystraha",
    });
  }
  if (bezny > KU_HRANICA_MINULY_ROK && bezny <= KU_HRANICA_BEZNY_ROK) {
    u.push({
      sprava:
        "Obrat v roku {rok} je {suma} — viac ako 25 000 €. Tento rok ostávate Kleinunternehmer, od 1. 1. {buduci} už fakturujete s DPH.",
      parametre: { rok, buduci: rok + 1, suma: sumaNaText(bezny) },
      zavaznost: "vystraha",
    });
  } else if (
    bezny >= KU_HRANICA_MINULY_ROK * KU_PRAH_UPOZORNENIA &&
    bezny <= KU_HRANICA_MINULY_ROK
  ) {
    u.push({
      sprava:
        "Obrat v roku {rok} je {suma} — blíži sa k 25 000 €. Ak ich prekročí, od 1. 1. {buduci} už nebudete Kleinunternehmer.",
      parametre: { rok, buduci: rok + 1, suma: sumaNaText(bezny) },
      zavaznost: "vystraha",
    });
  }
  return { rok, obratMinulyRok: minuly, obratBeznyRok: bezny, upozornenia: u };
}
