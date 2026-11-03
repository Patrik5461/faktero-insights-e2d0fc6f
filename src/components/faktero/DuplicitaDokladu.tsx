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
