/*
  Pod poľom „Dátum prijatia“ prijatého dokladu: varovanie, keď je prijatie
  skôr než vystavenie, a obdobie odpočtu DPH (neskorší z DUZP a prijatia).
  Rovnaké pravidlo počítajú výkazy DPH aj export do Pohody (`datum-prijatia.ts`).
*/
import { obdobieOdpoctu, prijatieSkorNezVystavenie } from "@/lib/faktero/datum-prijatia";
import { useT } from "@/lib/i18n/useT";
import { NapovedaOtaznik } from "@/components/faktero/NapovedaOtaznik";

/**
 * Ikona „?“ pri popise poľa „Dátum prijatia“ — formuláre aj detaily prijatých
 * dokladov, klasické aj kompaktné rozloženie. Pravidlo je v `datum-prijatia.ts`.
 */
export function DatumPrijatiaOtaznik({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <NapovedaOtaznik
      velkost="mala"
      popis={t("Vysvetlivka: Dátum prijatia")}
      className={`ml-1 align-[-2px] ${className}`}
    >
      <span className="block space-y-1.5">
        <span className="block">
          {t(
            "Deň, keď firma doklad prijala — prišiel e-mailom, bol nahratý alebo doručený poštou.",
          )}
        </span>
        <span className="block">
          {t(
            "Rozhoduje o období odpočtu DPH: odpočet patrí do neskoršieho mesiaca z dátumu dodania (DUZP) a dátumu prijatia. Podľa toho istého obdobia sa doklad zaradí do priznania k DPH a do kontrolného výkazu.",
          )}
        </span>
        <span className="block text-muted-foreground">
          {t(
            "Používa sa vo výkazoch DPH, v kontrolnom výkaze a v exporte do Pohody. Predvyplní sa dňom doručenia e-mailu alebo nahratia. Pri samozdanení (prenesenie daňovej povinnosti) ostáva odpočet na DUZP.",
          )}
        </span>
      </span>
    </NapovedaOtaznik>
  );
}

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
