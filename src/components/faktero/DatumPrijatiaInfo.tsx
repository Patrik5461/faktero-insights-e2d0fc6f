/*
  Pod poľom „Dátum prijatia“ prijatého dokladu: varovanie, keď je prijatie
  skôr než vystavenie, a obdobie odpočtu DPH (neskorší z DUZP a prijatia).
  Rovnaké pravidlo počítajú výkazy DPH aj export do Pohody (`datum-prijatia.ts`).
*/
import { obdobieOdpoctu, prijatieSkorNezVystavenie } from "@/lib/faktero/datum-prijatia";
import { useT } from "@/lib/i18n/useT";

export function DatumPrijatiaInfo({
  vystavenie,
  dodanie,
  prijatie,
  dobropis = false,
  samozdanenie = false,
  bezOdpoctu = false,
  kompaktne = false,
}: {
  vystavenie: string | null | undefined;
  dodanie: string | null | undefined;
  prijatie: string | null | undefined;
  dobropis?: boolean;
  samozdanenie?: boolean;
  /** Zálohová faktúra — nie je daňový doklad, odpočet z nej nie je. */
  bezOdpoctu?: boolean;
  kompaktne?: boolean;
}) {
  const { t } = useT();
  const skoro = prijatieSkorNezVystavenie(prijatie, vystavenie);
  const obdobie = bezOdpoctu
    ? null
    : obdobieOdpoctu({
        issue_date: vystavenie,
        delivery_date: dodanie,
        received_date: prijatie,
        opravuje_cislo: dobropis ? "x" : null,
        dph_rezim: samozdanenie ? "samozdanenie" : null,
      });
  if (!skoro && !obdobie) return null;
  return (
    <span className={`mt-1 flex flex-col gap-1 ${kompaktne ? "text-[11px]" : "text-xs"}`}>
      {skoro ? (
        <span role="alert" className="dk-pozor rounded-md border px-2 py-1">
          {t("Dátum prijatia je skôr než dátum vystavenia — skontrolujte ho.")}
        </span>
      ) : null}
      {obdobie ? (
        <span className="text-muted-foreground" data-testid="odpocet-dph">
          {t("Odpočet DPH: {obdobie}", { obdobie })}
        </span>
      ) : null}
    </span>
  );
}
