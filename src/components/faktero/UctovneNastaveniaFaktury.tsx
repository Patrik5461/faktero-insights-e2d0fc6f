import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookCheck, ChevronDown, ChevronUp, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import { KV_CLENENIA } from "@/lib/faktero/kv-clenenie";
import { upozornenieA1 } from "@/lib/faktero/kv-urcenie";
import { PAYMENT_METHODS } from "@/lib/faktero/payment-method";
import { prvePravidlo, type Pravidlo } from "@/lib/faktero/pravidla-uctovania";
import { useT } from "@/lib/i18n/useT";
import { KodPohody } from "./KodPohody";
import { MriezkaDokladu, PoleDokladu, VSTUP_DOKLADU, bunka } from "./PoleDokladu";
import type { Navrhy } from "./ZauctovaniePanel";

const KV_VYDANE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));

export type UctovneKody = { predkontacia: string; clenenie: string; kv: string };

/**
 * Účtovné nastavenia priamo vo formulári faktúry (zbalené na konci) — dátum
 * daňovej povinnosti, typ platby, predkontácia, členenie DPH a KV. Účtovník
 * tak faktúru nemusí po vystavení otvárať zvlášť kvôli zaúčtovaniu.
 *
 * Kódy idú do tých istých stĺpcov ako panel Zaúčtovanie v detaile
 * (`invoices.pohoda_predkontacia`, `pohoda_clenenie_dph`, `kv_clenenie`).
 * Prázdne pole znamená „predvolené“: pri uložení ho doplní pravidlo účtovania
 * (spúšťač v databáze), inak sa pri exporte vezme predvolený kód firmy. Čo
 * sa takto použije, ukazuje prvá voľba („predvolené: 3Fv“) — nič sa
 * neuloží natvrdo, kým to človek sám nezmení.
 */
export function UctovneNastaveniaFaktury({
  companyId,
  typ,
  odberatel,
  reverseCharge,
  kody,
  onKody,
  datumDane,
  onDatumDane,
  sposobPlatby,
  onSposobPlatby,
}: {
  companyId: string | null;
  typ: string;
  odberatel: {
    ico?: string | null;
    name?: string | null;
    dic?: string | null;
    icDph?: string | null;
  } | null;
  reverseCharge?: boolean;
  kody: UctovneKody;
  onKody: (k: UctovneKody) => void;
  /** Dátum daňovej povinnosti = dátum dodania faktúry (Pohoda `dateTax`). */
  datumDane: string;
  onDatumDane: (v: string) => void;
  sposobPlatby: string;
  onSposobPlatby: (v: string) => void;
}) {
  const { t } = useT();
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const [otvorene, setOtvorene] = useState(false);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [pravidla, setPravidla] = useState<(Pravidlo & { id: string })[]>([]);
  const [clenenieDphPdp, setClenenieDphPdp] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let zive = true;
    nacitajNavrhy({ data: { company_id: companyId, pre: "vystavena", typ } })
      .then((n) => zive && setNavrhy(n as Navrhy))
      .catch(() => {});
    return () => {
      zive = false;
    };
  }, [companyId, typ, nacitajNavrhy]);

  useEffect(() => {
    if (!companyId) return;
    let zive = true;
    // Tabuľka pravidiel nie je v generovaných typoch — číta sa ako vo VyberPravidla.
    (supabase as any)
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .eq("aktivne", true)
      .order("poradie")
      .then(({ data }: { data: unknown[] | null }) => zive && setPravidla((data ?? []) as any));
    supabase
      .from("companies")
      .select("pohoda_clenenie_dph_pdp")
      .eq("id", companyId)
      .maybeSingle()
      .then(
        ({ data }) =>
          zive &&
          setClenenieDphPdp(((data as any)?.pohoda_clenenie_dph_pdp as string | null) ?? null),
      );
    return () => {
      zive = false;
    };
  }, [companyId]);

  /* To isté pravidlo, ktoré pri uložení vyberie spúšťač v databáze. */
  const pravidlo = useMemo(
    () =>
      odberatel
        ? prvePravidlo(pravidla, {
            supplier_ico: odberatel.ico ?? null,
            supplier_name: odberatel.name ?? null,
            payment_method: null,
            druh: "vystavena",
            typ,
          })
        : null,
    [pravidla, odberatel?.ico, odberatel?.name, typ],
  );

  const predvolene = {
    predkontacia: pravidlo?.predkontacia || navrhy?.predvolenaPredkontacia || "",
    clenenie:
      pravidlo?.clenenie_dph ||
      (reverseCharge ? clenenieDphPdp : null) ||
      navrhy?.predvoleneClenenie ||
      "",
    kv: pravidlo?.kv_clenenie || navrhy?.predvoleneKv || "",
  };
  const vysledne = {
    predkontacia: kody.predkontacia || predvolene.predkontacia,
    clenenie: kody.clenenie || predvolene.clenenie,
    kv: kody.kv || predvolene.kv,
  };
  const suhrn = [vysledne.predkontacia, vysledne.clenenie, vysledne.kv && `KV ${vysledne.kv}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOtvorene((v) => !v)}
        aria-expanded={otvorene}
        className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 p-5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BookCheck className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-semibold uppercase tracking-wide">
            {t("Účtovné nastavenia")}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{suhrn || t("predvolené z nastavení firmy")}</span>
          {otvorene ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </span>
      </button>
      {otvorene && (
        <div className="p-5 pt-0">
          <MriezkaDokladu>
            <PoleDokladu
              label={t("Dátum daňovej povinnosti")}
              htmlFor="datum-danovej-povinnosti"
              napoveda={t(
                "Pri faktúre je to dátum dodania — zmena sa prejaví aj v Základných údajoch.",
              )}
              className={bunka.polovica}
            >
              <input
                id="datum-danovej-povinnosti"
                type="date"
                value={datumDane}
                onChange={(e) => onDatumDane(e.target.value)}
                className={VSTUP_DOKLADU}
              />
            </PoleDokladu>
            <PoleDokladu
              label={t("Typ platby")}
              htmlFor="typ-platby-uctovne"
              className={bunka.polovica}
            >
              <select
                id="typ-platby-uctovne"
                value={sposobPlatby}
                onChange={(e) => onSposobPlatby(e.target.value)}
                className={VSTUP_DOKLADU}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.label)}
                  </option>
                ))}
              </select>
            </PoleDokladu>
            <PoleDokladu
              label={t("Účtovná položka (predkontácia)")}
              htmlFor="predkontacia-faktury"
              className={bunka.cela}
            >
              <div id="predkontacia-faktury" className="min-w-0">
                <KodPohody
                  odkazNaCiselnik
                  ariaLabel="Predkontácia"
                  value={kody.predkontacia}
                  onChange={(v) => onKody({ ...kody, predkontacia: v })}
                  moznosti={navrhy?.predkontacie ?? []}
                  placeholder={predvolene.predkontacia || t("napr. 3Fv")}
                  className={VSTUP_DOKLADU}
                  vyber
                />
              </div>
            </PoleDokladu>
            <PoleDokladu
              label={t("Členenie DPH")}
              htmlFor="clenenie-faktury"
              className={bunka.polovica}
            >
              <div id="clenenie-faktury" className="min-w-0">
                <KodPohody
                  ariaLabel="Členenie DPH"
                  value={kody.clenenie}
                  onChange={(v) => onKody({ ...kody, clenenie: v })}
                  moznosti={navrhy?.clenenia ?? []}
                  placeholder={predvolene.clenenie || t("napr. UD")}
                  className={VSTUP_DOKLADU}
                  vyber
                />
              </div>
            </PoleDokladu>
            <PoleDokladu
              label={t("Členenie KV DPH")}
              htmlFor="kv-faktury"
              className={bunka.polovica}
            >
              <select
                id="kv-faktury"
                value={kody.kv}
                onChange={(e) => onKody({ ...kody, kv: e.target.value })}
                className={VSTUP_DOKLADU}
              >
                <option value="">
                  {predvolene.kv
                    ? t("predvolené: {kod}", { kod: predvolene.kv })
                    : t("automaticky")}
                </option>
                {KV_VYDANE.map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {t(k.nazov)}
                  </option>
                ))}
              </select>
              {/* A.1 pri občanovi (bez IČ DPH, IČO aj DIČ) — patrí do D.2 (kv-urcenie.ts). */}
              {odberatel && upozornenieA1({ kv: kody.kv, ...odberatel }) && (
                <p role="alert" className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {t(
                    "Odberateľ nemá IČ DPH, IČO ani DIČ — faktúra súkromnej osobe patrí do D.2, nie do A.1.",
                  )}
                </p>
              )}
            </PoleDokladu>
          </MriezkaDokladu>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {pravidlo ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <Star className="h-3.5 w-3.5 fill-current" />
                {t("Kódy doplní pravidlo „{nazov}“.", { nazov: pravidlo.nazov })}
              </span>
            ) : null}
            <span>
              {t("Prázdne pole = predvolené z")}{" "}
              <Link to="/uctovnictvo/predkontacie" className="underline">
                {t("nastavení predkontácií")}
              </Link>
              {t(
                ". Strediská, činnosti a účtovanie po položkách sú v detaile faktúry v časti Zaúčtovanie.",
              )}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
