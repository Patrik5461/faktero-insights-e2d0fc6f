import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { Duplicita, DruhDuplicity } from "@/lib/faktero/duplicita-zauctovania";
import { duplicityDokladuFn } from "@/lib/faktero/duplicita-zauctovania.functions";
import { useT } from "@/lib/i18n/useT";

/*
  Duplicitný doklad sa nezaúčtuje (duplicita-zauctovania.ts). Detail sa
  spýta servera, či rovnaký doklad v evidencii nie je, ukáže upozornenie
  s odkazom na druhý a vypne „Zaúčtovať“. Zaúčtovaný doklad sa nepýta.
*/

/** Duplicity dokladu (prázdne = žiadne alebo ešte nevieme). */
export function useDuplicitaDokladu(
  druh: DruhDuplicity,
  row: { id?: string | null; company_id?: string | null; zauctovane_at?: string | null; exported_at?: string | null; updated_at?: string | null } | null,
): Duplicita[] {
  const nacitaj = useServerFn(duplicityDokladuFn);
  const [druhe, setDruhe] = useState<Duplicita[]>([]);
  const zistovat = Boolean(row?.id && row?.company_id && !row?.zauctovane_at && !row?.exported_at);
  useEffect(() => {
    setDruhe([]);
    if (!zistovat) return;
    let zrusene = false;
    nacitaj({ data: { company_id: row!.company_id!, druh, id: row!.id! } })
      .then((d) => {
        if (!zrusene) setDruhe((d ?? []) as Duplicita[]);
      })
      .catch(() => {});
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zistovat, row?.id, row?.company_id, row?.updated_at, druh]);
  return druhe;
}

/** Upozornenie nad tlačidlom Zaúčtovať — s odkazmi na druhé doklady. */
export function UpozornenieDuplicity({
  druh,
  druhe,
  className = "",
}: {
  druh: DruhDuplicity;
  druhe: Duplicita[];
  className?: string;
}) {
  const { t } = useT();
  if (!druhe.length) return null;
  const zauctovany = druhe.some((d) => d.zauctovany);
  return (
    <div
      role="alert"
      data-duplicita
      className={`dk-pozor w-full rounded-md border px-3 py-2 text-xs ${className}`}
    >
      <div className="font-semibold">{t("Duplicitný doklad — zaúčtovať sa nedá")}</div>
      <div className="mt-0.5">
        {zauctovany
          ? t("Rovnaký doklad je už zaúčtovaný. Tento je navyše — zmažte ho.")
          : t("Rovnaký doklad je v evidencii viackrát. Zaúčtovať sa dá až po zmazaní jedného z nich.")}{" "}
        {druhe.map((d, i) => (
          <span key={d.id}>
            {i ? ", " : ""}
            {druh === "prijata" ? (
              <Link to="/prijate-faktury/$id" params={{ id: d.id }} className="font-medium underline">
                {d.cislo || t("Otvoriť")}
              </Link>
            ) : (
              <Link to="/doklady/novy" search={{ id: d.id } as any} className="font-medium underline">
                {d.cislo || t("Otvoriť")}
              </Link>
            )}
            {d.zauctovany ? ` (${t("zaúčtovaný")})` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────────── prijatá faktúra, ktorá už v evidencii je ───────────── */

/** Čo o existujúcej faktúre treba ukázať — `DuplicitaNespracovaneho` zo servera. */
export type UlozenaPrijata = {
  id: string | null;
  popis: string;
  /** true = tá istá faktúra (neuloží sa); false = rovnaké číslo, iná suma či rok. */
  blok: boolean;
};

/** Odznak „Duplicita“ v zozname Nespracovaných. */
export function DuplicitaZnak({ duplicita }: { duplicita: UlozenaPrijata | null | undefined }) {
  const { t } = useT();
  if (!duplicita) return null;
  const popis = duplicita.blok
    ? t("Táto faktúra už je v evidencii: {popis}", { popis: duplicita.popis })
    : t("Faktúra s rovnakým číslom od tohto dodávateľa už v evidencii je: {popis}", { popis: duplicita.popis });
  return (
    <span
      title={popis}
      data-duplicita-znak
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${
        duplicita.blok ? "dk-chyba" : "dk-pozor"
      }`}
    >
      {duplicita.blok ? t("Duplicita") : t("Možná duplicita")}
    </span>
  );
}

/**
 * Upozornenie na detaile nespracovaného dokladu (aj formulára prijatej):
 * „Táto faktúra už je v evidencii: číslo, dodávateľ, suma — Otvoriť“ a pri
 * nespracovanom voľba „Zmazať z Nespracovaných“.
 */
export function UpozornenieUlozenejPrijatej({
  duplicita,
  onZmaz,
  busy = false,
  className = "",
}: {
  duplicita: UlozenaPrijata | null | undefined;
  onZmaz?: () => void;
  busy?: boolean;
  className?: string;
}) {
  const { t } = useT();
  if (!duplicita) return null;
  return (
    <div
      role="alert"
      data-duplicita-prijatej
      className={`w-full rounded-md border px-3 py-2 text-sm ${duplicita.blok ? "dk-chyba" : "dk-pozor"} ${className}`}
    >
      <div className="font-semibold">
        {duplicita.blok
          ? t("Táto faktúra už je v evidencii")
          : t("Faktúra s rovnakým číslom od tohto dodávateľa už v evidencii je")}
      </div>
      <div className="mt-0.5 break-words">
        {duplicita.popis}
        {duplicita.id ? (
          <>
            {" — "}
            <Link to="/prijate-faktury/$id" params={{ id: duplicita.id }} className="font-semibold underline">
              {t("Otvoriť")}
            </Link>
          </>
        ) : null}
      </div>
      <div className="mt-1 text-xs">
        {duplicita.blok
          ? onZmaz
            ? t("Druhýkrát sa nevytvorí ani nezaúčtuje. Tento doklad zmažte z Nespracovaných.")
            : t("Druhýkrát sa neuloží ani nezaúčtuje.")
          : onZmaz
            ? t("Má inú sumu alebo je z iného roka — niektorí dodávatelia čísla opakujú. Pri vytvorení sa vás spýtame, či nejde o duplicitu.")
            : t("Má inú sumu alebo je z iného roka — niektorí dodávatelia čísla opakujú.")}
      </div>
      {onZmaz ? (
        <button
          type="button"
          disabled={busy}
          onClick={onZmaz}
          className="mt-2 inline-flex items-center rounded-md border border-current/40 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
        >
          {t("Zmazať z Nespracovaných")}
        </button>
      ) : null}
    </div>
  );
}
