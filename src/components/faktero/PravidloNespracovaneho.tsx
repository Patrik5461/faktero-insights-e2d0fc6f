import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Pravidlo } from "@/lib/faktero/pravidla-uctovania";
import type { DruhNespracovaneho, UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import {
  porovnanieNespracovaneho,
  uplatniPravidlo,
  zhodnePravidla,
} from "@/lib/faktero/nespracovane-pravidlo";
import { useT } from "@/lib/i18n/useT";

type PravidloSId = Pravidlo & { id: string };

/**
 * Pravidlo účtovania pri spracovaní dokladu. Keď doklad spĺňa podmienky
 * pravidla, jeho kódy sa doplnia samy (hviezdička pri poli); po zmene
 * dodávateľa sa pravidlo vyhodnotí znova. Keď sedí viac pravidiel, človek
 * vyberie iné. Bez pravidla ponúkne jeho vytvorenie pre tohto dodávateľa.
 */
export function PravidloNespracovaneho({
  companyId,
  druh,
  u,
  setU,
  createdBy,
  predmetMailu,
  aktivne = true,
}: {
  companyId: string;
  druh: DruhNespracovaneho | "";
  u: UdajeNespracovaneho;
  setU: (f: (p: UdajeNespracovaneho | null) => UdajeNespracovaneho | null) => void;
  createdBy?: string | null;
  predmetMailu?: string | null;
  /** Kým AI doklad číta, pravidlo sa neuplatňuje (dodávateľ ešte nie je známy). */
  aktivne?: boolean;
}) {
  const { t } = useT();
  const [pravidla, setPravidla] = useState<PravidloSId[] | null>(null);
  const [vybrane, setVybrane] = useState("");

  useEffect(() => {
    let zrusene = false;
    // Tabuľka nie je v generovaných typoch — pravidlá číta aj stránka pravidiel takto.
    (supabase as any)
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .eq("aktivne", true)
      .order("poradie")
      .then(({ data }: { data: unknown[] | null }) => {
        if (!zrusene) setPravidla((data ?? []) as PravidloSId[]);
      });
    return () => {
      zrusene = true;
    };
  }, [companyId]);

  const porovnanie = useMemo(
    () => porovnanieNespracovaneho(u, druh, { createdBy, predmetMailu }),
    // Pravidlo závisí len od týchto polí — nie od každého písmena v poznámke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [u.dodavatel.ico, u.dodavatel.nazov, u.platba, u.opravuje, druh, createdBy, predmetMailu],
  );
  const zhodne = useMemo(() => zhodnePravidla(pravidla ?? [], porovnanie), [pravidla, porovnanie]);

  /*
    Samé uplatnenie: platí pravidlo, ktoré doklad už má, kým naň sedí;
    inak prvé zhodné (ako spúšťač). Nesedí žiadne = kódy z pravidla ustúpia.
  */
  useEffect(() => {
    if (!pravidla || !aktivne || !porovnanie) return;
    const terajsie = zhodne.find((p) => p.id === u.pravidloId);
    if (terajsie) return;
    const nove = zhodne[0] ?? null;
    if (!nove && !u.pravidloId && !u.zPravidla) return;
    setU((p) => (p ? uplatniPravidlo(p, nove) : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pravidla, zhodne, aktivne]);

  if (!porovnanie) return null;
  const pouzite = zhodne.find((p) => p.id === u.pravidloId) ?? null;
  const ine = zhodne.filter((p) => p.id !== pouzite?.id);
  const partner = u.dodavatel.nazov.trim();
  const ico = u.dodavatel.ico.replace(/\D/g, "");
  const druhPravidla = druh === "blocek" ? "blocek" : "prijata";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {pouzite ? (
        <span
          className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"
          title={t("Kódy doplnilo pravidlo účtovania")}
        >
          <Star className="h-3.5 w-3.5 fill-current" />{" "}
          {t("Pravidlo „{nazov}“", { nazov: pouzite.nazov })}
        </span>
      ) : null}
      {ine.length ? (
        <>
          <select
            aria-label={t("Pravidlo účtovania")}
            value={vybrane}
            onChange={(e) => setVybrane(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">{pouzite ? t("Iné pravidlo…") : t("Použiť pravidlo…")}</option>
            {ine.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nazov}
                {p.predkontacia ? ` — ${p.predkontacia}` : ""}
                {p.clenenie_dph ? ` / ${p.clenenie_dph}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!vybrane}
            onClick={() => {
              const p = ine.find((x) => x.id === vybrane);
              if (p) setU((x) => (x ? uplatniPravidlo(x, p, true) : x));
              setVybrane("");
            }}
            className="rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50"
          >
            {t("Použiť")}
          </button>
        </>
      ) : null}
      {!pouzite && !ine.length && (partner || ico) ? (
        <Link
          to="/uctovnictvo/pravidla"
          search={
            {
              novy: druhPravidla,
              nazov: partner || undefined,
              ico: ico.length >= 6 ? ico : undefined,
              predkontacia: u.kody.predkontacia || undefined,
              clenenie: u.kody.clenenie || undefined,
              kv: u.kody.kv || undefined,
              kategoria: u.kategoria || undefined,
            } as any
          }
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />{" "}
          {t("Vytvoriť pravidlo pre {partner}", { partner: partner || t("IČO {ico}", { ico }) })}
        </Link>
      ) : null}
    </div>
  );
}
