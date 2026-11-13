/*
  Výber sadzby a druhu plnenia v riadku rozpisu DPH („Čiastka a DPH“):
  0 / 5 / 19 / 23 % (CZ 0 / 12 / 21 %), „Nie je predmetom DPH“, „Oslobodené“,
  „Prenesenie DP“. Druh plnenia bez dane nastaví sadzbu 0 a daň 0; zmena
  sadzby prepočíta daň zo základu. Ponúkajú sa len zákonné sadzby — sadzba
  mimo nich (napr. 16,82 % dopočítaná z hlavičky) je len označená ako neplatná.
  Záporný riadok (odpočet zálohy, dobropis) a dobropis/opravný doklad ponúkne
  aj historické zákonné sadzby (SK 20/10, CZ 15/10) — pôvodné obdobie.
*/
import { useT } from "@/lib/i18n/useT";
import { zoradSadzby } from "@/lib/faktero/vat-rates";
import {
  kategoriaRiadku,
  NAZVY_KATEGORII_DPH,
  type KategoriaDph,
} from "@/lib/faktero/rozpis-dph-kontrola";
import { ponukaSadzieb } from "./dph-formular";

type Riadok = { sadzba: number; zaklad: number; dph: number; vat_category?: KategoriaDph };

const BEZ_DANE: { k: KategoriaDph; nazov: string }[] = [
  { k: "out_of_scope", nazov: "Nie je predmetom DPH" },
  { k: "exempt", nazov: "Oslobodené" },
  { k: "reverse_charge", nazov: "Prenesenie DP" },
];

/** Hodnota voľby pre riadok. */
export function hodnotaVolby(r: Riadok): string {
  const k = kategoriaRiadku({ rate: r.sadzba, vat_category: r.vat_category });
  if (k === "out_of_scope" || k === "exempt" || k === "reverse_charge") return `k:${k}`;
  return `s:${Number(r.sadzba) || 0}`;
}

/** Zmena riadku podľa zvolenej hodnoty. */
export function zmenaZVolby(r: Riadok, hodnota: string): Partial<Riadok> {
  if (hodnota.startsWith("k:")) {
    const k = hodnota.slice(2) as KategoriaDph;
    return { vat_category: k, sadzba: 0, dph: 0 };
  }
  const sadzba = Number(hodnota.slice(2)) || 0;
  return {
    sadzba,
    // 0 % bez dôvodu nie je zdaniteľné plnenie — človek musí vybrať dôvod.
    vat_category: sadzba > 0 ? "standard" : "needs_review",
    dph: Math.round((Number(r.zaklad) || 0) * sadzba) / 100,
  };
}

export function VolbaSadzbyDph({
  riadok,
  sadzby,
  historicke,
  dobropis = false,
  onChange,
  className = "",
}: {
  riadok: Riadok;
  /** Sadzby krajiny firmy (vrátane 0). */
  sadzby: number[];
  /** Všetky zákonné sadzby, čo v krajine platili — pre záporný riadok a dobropis. */
  historicke?: number[];
  /** Dobropis / opravný doklad — ponúkne aj sadzby pôvodného obdobia. */
  dobropis?: boolean;
  onChange: (z: Partial<Riadok>) => void;
  className?: string;
}) {
  const { t } = useT();
  const hodnota = hodnotaVolby(riadok);
  // Len zákonné sadzby (Patrik 13. 11.) — iná hodnota z dokladu sa ukáže ako neplatná a nedá sa vybrať.
  const ponuka = zoradSadzby(ponukaSadzieb(sadzby, historicke, riadok, dobropis));
  const aktualna = Number(riadok.sadzba) || 0;
  const neplatna = hodnota.startsWith("s:") && !ponuka.some((x) => Math.abs(x - aktualna) < 0.001);
  const naKontrolu =
    kategoriaRiadku({ rate: riadok.sadzba, vat_category: riadok.vat_category }) === "needs_review";
  return (
    <select
      aria-label={t("Sadzba")}
      value={hodnota}
      onChange={(e) => onChange(zmenaZVolby(riadok, e.target.value))}
      aria-invalid={naKontrolu || neplatna || undefined}
      className={`${className} ${naKontrolu || neplatna ? "dk-ramik-chyba" : ""}`}
    >
      {neplatna ? (
        <option value={hodnota} disabled>
          {t("{sadzba} % – neplatná", { sadzba: String(aktualna).replace(".", ",") })}
        </option>
      ) : null}
      {ponuka.map((x) => (
        <option key={x} value={`s:${x}`}>
          {x} %
        </option>
      ))}
      {BEZ_DANE.map((o) => (
        <option key={o.k} value={`k:${o.k}`}>
          {t(o.nazov)}
        </option>
      ))}
    </select>
  );
}

/**
 * Popisy polí riadku rozpisu — zdaniteľný „Základ dane 23 %“ / „Daň 23 %“,
 * plnenie bez dane jeho druhom („Nie je predmetom DPH“).
 */
export function popisyRiadkuDph(
  r: { sadzba: number; vat_category?: string | null; pdp?: boolean },
  t: (k: string, p?: Record<string, string | number>) => string,
): { zaklad: string; dan: string } {
  const k = r.pdp
    ? "reverse_charge"
    : kategoriaRiadku({ rate: r.sadzba, vat_category: r.vat_category });
  if (k === "standard" || k === "needs_review")
    return {
      zaklad: t("Základ dane {sadzba} %", { sadzba: r.sadzba }),
      dan: t("Daň {sadzba} %", { sadzba: r.sadzba }),
    };
  if (k === "reverse_charge" && Number(r.sadzba) > 0)
    return {
      zaklad: t("Základ dane {sadzba} % (PDP)", { sadzba: r.sadzba }),
      dan: t("Daň {sadzba} %", { sadzba: r.sadzba }),
    };
  return { zaklad: t(NAZVY_KATEGORII_DPH[k]), dan: t("Daň") };
}
