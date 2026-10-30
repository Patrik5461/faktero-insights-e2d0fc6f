import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { Upload, FileText } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import { formatujMenu } from "@/lib/faktero/mena";
import { rozberVypisFn, importujVypisFn } from "@/lib/faktero/import-vypisu.functions";

export const Route = createFileRoute("/_authenticated/bankove-ucty/import")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Nahrať výpis — Faktero") }] }),
  component: ImportVypisuPage,
});

const NOVY = "__novy__";

function ImportVypisuPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ucty, setUcty] = useState<any[]>([]);
  const [obsah, setObsah] = useState<string | null>(null);
  const [nazovSuboru, setNazovSuboru] = useState<string | null>(null);
  const [nahlad, setNahlad] = useState<any | null>(null);
  const [cielovyUcet, setCielovyUcet] = useState<string>(NOVY);
  const [citam, setCitam] = useState(false);
  const [zapisujem, setZapisujem] = useState(false);

  const rozober = useServerFn(rozberVypisFn);
  const importuj = useServerFn(importujVypisFn);

  useEffect(() => setCompanyId(getActiveCompanyId()), []);
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("bank_accounts")
      .select("id, iban, account_name, currency")
      .eq("company_id", companyId)
      .then(({ data }) => setUcty(data ?? []));
  }, [companyId]);

  async function vyberSubor(f: File | null) {
    if (!f || !companyId) return;
    setNahlad(null);
    setCitam(true);
    try {
      // CSV z českých brán býva vo Windows-1250; XML si kódovanie nesie samo.
      const text = /\.csv$/i.test(f.name)
        ? (await import("@/lib/faktero/vypis-brany")).dekodujCsv(await f.arrayBuffer())
        : await f.text();
      setObsah(text);
      setNazovSuboru(f.name);
      const r: any = await rozober({ data: { company_id: companyId, obsah: text } });
      setNahlad(r);
      // Keď účet z výpisu poznáme, ponúkne sa on — nie zakladanie ďalšieho.
      setCielovyUcet(r.navrhnutyUcetId ?? NOVY);
    } catch (e) {
      setObsah(null);
      setNazovSuboru(null);
      toast.error((e as Error).message);
    } finally {
      setCitam(false);
    }
  }

  async function nahraj() {
    if (!companyId || !obsah) return;
    setZapisujem(true);
    try {
      const r: any = await importuj({
        data: {
          company_id: companyId,
          obsah,
          bank_account_id: cielovyUcet === NOVY ? null : cielovyUcet,
        },
      });
      toast.success(
        r.preskocenych
          ? t("Nahraných {n} pohybov, {m} už v evidencii bolo.", { n: r.vlozenych, m: r.preskocenych })
          : t("Nahraných {n} pohybov.", { n: r.vlozenych }),
        r.sparovanych
          ? { description: t("Automaticky spárovaných: {n}.", { n: r.sparovanych }) }
          : undefined,
      );
      navigate({ to: "/bankove-ucty" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setZapisujem(false);
    }
  }

  const mena = nahlad?.mena ?? "EUR";

  return (
    <>
      <PageHeader
        title={t("Nahrať bankový výpis")}
        description={t("Pre banky, ktoré Faktero nepripojí priamo. Pohyby sa potom párujú rovnako ako tie načítané automaticky.")}
      />
      <PageBody>
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <span className="block text-sm font-medium">{t("Súbor s výpisom")}</span>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-within:ring-2 focus-within:ring-ring">
                <Upload className="h-4 w-4" /> {t("Vybrať súbor")}
                <input
                  type="file"
                  accept=".xml,text/xml,application/xml,.csv,text/csv"
                  onChange={(e) => vyberSubor(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
              <span className="min-w-0 break-words text-sm text-muted-foreground">
                {nazovSuboru || t("Nie je vybraný žiadny súbor")}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("XML vo formáte camt.053 — v internetbankingu býva ako „SEPA XML“, „XML výpis“ alebo „ISO 20022“. Z PDF sa suma ani symboly spoľahlivo prečítať nedajú.")}
              <br />
              {t("Funguje aj")} <strong>{t("CSV export platobnej brány")}</strong>{" "}
              {t("(Stripe, PayPal, GoPay, Comgate, Barion): brána sa založí ako ďalší účet, platby sa spárujú s faktúrami a poplatky aj výbery na bankový účet budú vo výpise zvlášť.")}
            </p>
            {citam && <p className="mt-2 text-sm text-muted-foreground">{t("Čítam výpis…")}</p>}
          </div>

          {nahlad && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {nazovSuboru} · {nahlad.format}
              </div>

              <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Účet vo výpise")}</dt>
                  <dd className="font-mono text-xs">{nahlad.ucetVoVypise ?? t("neuvedený")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Obdobie")}</dt>
                  <dd>
                    {nahlad.odDna} – {nahlad.doDna}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Pohybov")}</dt>
                  <dd className="font-medium">{nahlad.pocet}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Príjem / výdaj")}</dt>
                  <dd className="tabular-nums">
                    {formatujMenu(nahlad.prijem, mena)} / {formatujMenu(nahlad.vydaj, mena)}
                  </dd>
                </div>
              </dl>

              {nahlad.varovanie && (
                <p className="mt-3 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
                  {nahlad.varovanie}
                </p>
              )}

              <label className="mt-4 block">
                <span className="text-sm font-medium">{t("Nahrať do účtu")}</span>
                <select
                  value={cielovyUcet}
                  onChange={(e) => setCielovyUcet(e.target.value)}
                  className="input mt-1"
                >
                  <option value={NOVY}>
                    {t("Založiť nový účet")} {nahlad.ucetVoVypise ? `(${nahlad.ucetVoVypise})` : ""}
                  </option>
                  {ucty.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.account_name ?? u.iban} · {u.currency}
                    </option>
                  ))}
                </select>
              </label>

              {/*
                Nezhoda účtu nie je chyba — výpis môže mať číslo v inom tvare.
                Ale nahrať cudzí výpis do vlastného účtu je chyba, ktorú vidno
                až pri párovaní, tak nech je varovanie tu.
              */}
              {cielovyUcet !== NOVY &&
                nahlad.navrhnutyUcetId &&
                cielovyUcet !== nahlad.navrhnutyUcetId && (
                  <p className="mt-2 text-xs text-destructive">
                    {t("Vybraný účet nezodpovedá číslu vo výpise. Skontrolujte to, prosím.")}
                  </p>
                )}
              {cielovyUcet === NOVY && nahlad.navrhnutyUcetNazov && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("Účet {nazov} už v evidencii je — vyberte ho, nech pohyby neskončia na dvoch účtoch.", { nazov: nahlad.navrhnutyUcetNazov })}
                </p>
              )}

              <button
                onClick={nahraj}
                disabled={zapisujem}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {zapisujem ? t("Nahrávam…") : t("Nahrať {n} pohybov", { n: nahlad.pocet })}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("Ten istý výpis sa dá nahrať znova — pohyby, ktoré už v evidencii sú, sa nezdvoja.")}
              </p>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
