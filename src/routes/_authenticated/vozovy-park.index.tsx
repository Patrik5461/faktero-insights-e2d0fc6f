import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Car, CreditCard, FileText, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useT } from "@/lib/i18n/useT";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { preloz } from "@/lib/i18n/jazyk";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { nazovVlastnictva, terminyNaRiesenie } from "@/lib/faktero/vozovy-park";
import { StitokTerminu } from "@/components/faktero/VozidloKarta";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
export const Route = createFileRoute("/_authenticated/vozovy-park/")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Vozový park — Faktero") }],
  }),
  component: VozovyPark,
});

function VozovyPark() {
  const { t } = useT();
  const navigate = useNavigate();
  const [vozidla, setVozidla] = useState<any[] | null>(null);
  const [dokumenty, setDokumenty] = useState<Record<string, number>>({});
  const [ajVyradene, setAjVyradene] = useState(false);
  const dnes = dnesBratislava();

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Len vozidlá a ich dokumenty — jazdy sa vo vozovom parku nenačítavajú.
    Promise.all([
      supabase.from("vehicles").select("*").eq("company_id", cid).order("name"),
      supabase.from("vehicle_documents").select("vehicle_id").eq("company_id", cid),
    ]).then(([{ data: v }, { data: d }]) => {
      setVozidla(v ?? []);
      const pocty: Record<string, number> = {};
      for (const x of d ?? []) pocty[x.vehicle_id] = (pocty[x.vehicle_id] ?? 0) + 1;
      setDokumenty(pocty);
    });
  }, []);

  const zobrazene = useMemo(
    () => (vozidla ?? []).filter((v) => ajVyradene || v.active !== false),
    [vozidla, ajVyradene],
  );
  const naRiesenie = zobrazene.reduce((s, v) => s + terminyNaRiesenie(v, dnes).length, 0);

  return (
    <>
      <PageHeader
        title={t("Vozový park")}
        description={t(
          "Vozidlá firmy s technickým preukazom, vlastníctvom, poistkami a termínmi STK. Tie isté vozidlá používa Kniha jázd.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/vozovy-park/palivove-karty"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
            >
              <CreditCard className="h-4 w-4" /> {t("Palivové karty")}
            </Link>
            <Link
              to="/vozovy-park/nove"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> {t("Nové vozidlo")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t("Vozidiel: {n}", { n: zobrazene.length })}
            {naRiesenie > 0 && (
              <span className="ml-3 font-semibold text-warning">
                {t("Termíny na riešenie: {n}", { n: naRiesenie })}
              </span>
            )}
          </span>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={ajVyradene}
              onChange={(e) => setAjVyradene(e.target.checked)}
            />
            {t("Zobraziť aj vyradené")}
          </label>
        </div>

        {vozidla === null ? (
          <NacitavanieStav className="rounded-xl border border-border bg-card" />
        ) : zobrazene.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
              <Car className="h-5 w-5" />
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              {t(
                "Zatiaľ žiadne vozidlo. Pridajte prvé a nahrajte k nemu technický preukaz — údaje sa z neho vyčítajú.",
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5">{t("Vozidlo")}</th>
                  <th className="whitespace-nowrap px-4 py-2.5">{t("ŠPZ")}</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 md:table-cell">{t("Vlastníctvo")}</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 lg:table-cell">{t("Vodič")}</th>
                  <th className="whitespace-nowrap px-4 py-2.5">{t("Termíny")}</th>
                  <th className="hidden whitespace-nowrap px-4 py-2.5 text-right md:table-cell">{t("Dokumenty")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {zobrazene.map((v) => {
                  const terminy = terminyNaRiesenie(v, dnes);
                  return (
                    <tr
                      key={v.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/40 ${v.active === false ? "opacity-60" : ""}`}
                      onClick={() => navigate({ to: "/vozovy-park/$id", params: { id: v.id } })}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold">{v.name}</div>
                        {(v.znacka || v.model) && (
                          <div className="text-xs text-muted-foreground">
                            {[v.znacka, v.model, v.rok_vyroby].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {v.active === false && (
                          <div className="text-xs text-muted-foreground">{t("vyradené")}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{v.license_plate ?? "—"}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {nazovVlastnictva(v.vlastnictvo)
                          ? t(nazovVlastnictva(v.vlastnictvo)!)
                          : "—"}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">{v.vodic ?? "—"}</td>
                      <td className="px-4 py-3">
                        {terminy.length ? (
                          <div className="flex flex-wrap gap-1">
                            {terminy.map((x) => (
                              <StitokTerminu key={x.kluc} t={x} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {v.stk_do
                              ? t("STK do {datum}", { datum: datumNaDoklade(v.stk_do) })
                              : t("bez termínov")}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-right md:table-cell">
                        {dokumenty[v.id] ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" /> {dokumenty[v.id]}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
