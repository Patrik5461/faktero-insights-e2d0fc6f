/*
  Dátum daňovej povinnosti (`datum_dph`) — spoločná vysvetlivka a nápoveda
  pod poľom pre formuláre a detaily prijatých aj vystavených dokladov
  a Nespracované (klasické aj kompaktné rozloženie). Pravidlo je
  v `src/lib/faktero/datum-dph.ts`.
*/
import { datumDphSaLisiOdDodania } from "@/lib/faktero/datum-dph";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { NapovedaOtaznik } from "@/components/faktero/NapovedaOtaznik";

/** Popis poľa — rovnaký všade. */
export const POPIS_DATUM_DPH = "Dátum daňovej povinnosti";

/** Ikona „?“ pri popise poľa „Dátum daňovej povinnosti“. */
export function DatumDphOtaznik({
  druh = "prijata",
  className = "",
}: {
  druh?: "prijata" | "vystavena";
  className?: string;
}) {
  const { t } = useT();
  return (
    <NapovedaOtaznik
      velkost="mala"
      popis={t("Vysvetlivka: Dátum daňovej povinnosti")}
      className={`ml-1 align-[-2px] ${className}`}
    >
      <span className="block space-y-1.5">
        <span className="block">
          {druh === "prijata"
            ? t(
                "Deň, podľa ktorého doklad vstupuje do DPH — do obdobia odpočtu v priznaní, do kontrolného výkazu a do Pohody (dátum DPH a dátum KV DPH).",
              )
            : t(
                "Deň vzniku daňovej povinnosti — podľa neho faktúra patrí do obdobia v priznaní k DPH, v kontrolnom výkaze a v Pohode (dátum DPH).",
              )}
        </span>
        <span className="block text-muted-foreground">
          {druh === "prijata"
            ? t(
                "Predvyplní sa dátumom dodania (DUZP), pri dobropise dátumom prijatia. Ak je prázdny, platí neskorší z dátumu dodania a dátumu prijatia.",
              )
            : t(
                "Predvyplní sa dátumom dodania (DUZP), pri dobropise dátumom vystavenia a pri daňovom doklade k prijatej platbe dňom platby.",
              )}
        </span>
      </span>
    </NapovedaOtaznik>
  );
}

/**
 * Nápoveda pod poľom: keď sa dátum daňovej povinnosti líši od dátumu
 * dodania, ukáže DUZP a obdobie DPH. Inak nič (nezaberá miesto).
 */
export function DatumDphRozdiel({
  datumDph,
  dodanie,
  kompaktne = false,
}: {
  datumDph: string | null | undefined;
  dodanie: string | null | undefined;
  kompaktne?: boolean;
}) {
  const { t } = useT();
  if (!datumDphSaLisiOdDodania(datumDph, dodanie)) return null;
  const d = String(datumDph).slice(0, 10);
  const obdobie = `${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return (
    <span
      className={`mt-1 block text-muted-foreground ${kompaktne ? "text-[11px]" : "text-xs"}`}
      data-testid="datum-dph-rozdiel"
    >
      {t("Iný než dátum dodania ({duzp}) — DPH v období {obdobie}.", {
        duzp: datumNaDoklade(dodanie),
        obdobie,
      })}
    </span>
  );
}
