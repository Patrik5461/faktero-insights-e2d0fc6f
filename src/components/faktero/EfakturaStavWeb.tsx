import { triedaStavu } from "@/components/faktero/web/Stav";
import { AlertTriangle, CheckCircle2, FileCheck2, Send, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import type { StavEfaktury } from "@/lib/faktero/efaktura/stav-efaktury";
import {
  jeChybaEfaktury,
  textCasuEfaktury,
  textDovoduEfaktury,
  textOdpovedeEfaktury,
  textStavuEfaktury,
  ukazatDetailEfaktury,
} from "@/lib/faktero/efaktura/stav-efaktury-texty";
import { kanalDorucenia, kratkyCas } from "./EfakturaStatusBadge";

/*
  Stav eFaktúry na webe — rovnaké pravidlá aj texty ako appka
  (`lib/faktero/efaktura/stav-efaktury.ts` + `stav-efaktury-texty.ts`).
*/

/** Popis stavu s časom („eFaktúra doručená · 31. 10. 2026 14:05“) pre `title`. */
export function usePopisEfaktury() {
  const { t } = useT();
  return (s: StavEfaktury) => {
    const casy = [
      s.stav !== "odoslana" && s.kedy ? `${t(textCasuEfaktury(s))} ${kratkyCas(s.kedy)}` : null,
      s.odoslana ? `${t("Odoslaná")} ${kratkyCas(s.odoslana)}` : null,
    ].filter(Boolean);
    const dovod = textDovoduEfaktury(s);
    const odpoved = textOdpovedeEfaktury(s);
    return [t(textStavuEfaktury(s)), ...casy, dovod ? t(dovod) : null, odpoved ? t(odpoved) : null]
      .filter(Boolean)
      .join(" · ");
  };
}

export function IkonaEfaktury({ stav, className }: { stav: StavEfaktury; className?: string }) {
  const Ikona =
    stav.stav === "zlyhala"
      ? AlertTriangle
      : stav.stav === "zamietnuta"
        ? XCircle
        : stav.stav === "odoslana"
          ? Send
          : CheckCircle2;
  return <Ikona className={className ?? "h-3 w-3"} aria-hidden="true" />;
}

/** Štítok pri čísle faktúry v zozname. Bez eFaktúry sa nekreslí nič. */
export function OdznakEfakturyWeb({ stav }: { stav: StavEfaktury | null | undefined }) {
  const { t } = useT();
  const popis = usePopisEfaktury();
  if (!stav) return null;
  const chyba = jeChybaEfaktury(stav);
  const text = popis(stav);
  return (
    <span
      data-efaktura-stav={stav.stav}
      className={triedaStavu(chyba ? "chyba" : "informacia", true)}
      title={text}
      aria-label={text}
    >
      {chyba ? (
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      ) : (
        <FileCheck2 className="h-3 w-3" aria-hidden="true" />
      )}{" "}
      {stav.stav === "zlyhala"
        ? t("eFaktúra neodišla")
        : stav.stav === "zamietnuta"
          ? t("eFaktúra zamietnutá")
          : t("eFaktúra")}
    </span>
  );
}

/** Krátky stav do bunky tabuľky (Odoslané eFaktúry, Doručenia). */
export function BunkaStavuEfaktury({ stav }: { stav: StavEfaktury | null | undefined }) {
  const { t } = useT();
  const popis = usePopisEfaktury();
  if (!stav) return <span className="text-xs text-muted-foreground">{t("Neodoslaná")}</span>;
  const chyba = jeChybaEfaktury(stav);
  const dovod = textDovoduEfaktury(stav);
  return (
    <span
      data-efaktura-stav={stav.stav}
      className={`block text-xs ${chyba ? "text-destructive" : "text-primary"}`}
      title={popis(stav)}
    >
      <span className="inline-flex items-center gap-1 font-medium">
        <IkonaEfaktury stav={stav} /> {t(textStavuEfaktury(stav))}
      </span>
      {dovod && (
        <span
          className="mt-0.5 block max-w-[280px] whitespace-normal text-foreground"
          data-efaktura-dovod
        >
          {t(dovod)}
        </span>
      )}
      {(stav.kedy ?? stav.odoslana) && (
        <span className="block whitespace-nowrap text-muted-foreground">
          {kratkyCas(stav.kedy ?? stav.odoslana)}
        </span>
      )}
    </span>
  );
}

/**
 * Výrazné upozornenie v detaile faktúry: eFaktúra neodišla (alebo ju odberateľ
 * zamietol) — s dôvodom ľudskou rečou a pri zlyhaní s „Odoslať znova“.
 */
export function UpozornenieEfaktury({
  stav,
  onZnova,
  zaneprazdnene,
}: {
  stav: StavEfaktury | null | undefined;
  onZnova?: () => void;
  zaneprazdnene?: boolean;
}) {
  const { t } = useT();
  if (!stav || !jeChybaEfaktury(stav)) return null;
  const dovod = textDovoduEfaktury(stav);
  const kanal = stav.kanal ? t(kanalDorucenia(stav.kanal)) : null;
  return (
    <div
      role="alert"
      data-efaktura-upozornenie={stav.stav}
      className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold text-destructive">
          <IkonaEfaktury stav={stav} className="h-4 w-4 shrink-0" />
          {t(textStavuEfaktury(stav))}
        </div>
        {dovod && <p className="mt-1">{t(dovod)}</p>}
        {ukazatDetailEfaktury(stav) && (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {t("Podrobnosti: {text}", { text: stav.detail ?? "" })}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            stav.kedy ? `${t(textCasuEfaktury(stav))} ${kratkyCas(stav.kedy)}` : null,
            kanal ? `${t("Kanál")}: ${kanal}` : null,
            stav.pokusov > 1 ? `${t("Pokusov o doručenie")}: ${stav.pokusov}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {stav.stav === "zlyhala" && onZnova && (
        <button
          type="button"
          onClick={onZnova}
          disabled={zaneprazdnene}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" /> {t("Odoslať znova")}
        </button>
      )}
    </div>
  );
}
