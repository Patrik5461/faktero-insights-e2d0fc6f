import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, ArrowLeft, FileText } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import { formatujMenu } from "@/lib/faktero/mena";
import { rozberVypisFn, importujVypisFn } from "@/lib/faktero/import-vypisu.functions";

export const Route = createFileRoute("/_authenticated/bankove-ucty/import")({
  head: () => ({ meta: [{ title: "Nahrať výpis — Faktero" }] }),
  component: ImportVypisuPage,
});

const NOVY = "__novy__";

function ImportVypisuPage() {
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
      const text = await f.text();
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
          ? `Nahraných ${r.vlozenych} pohybov, ${r.preskocenych} už v evidencii bolo.`
          : `Nahraných ${r.vlozenych} pohybov.`,
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
        title="Nahrať bankový výpis"
        description="Pre banky, ktoré Faktero nepripojí priamo. Pohyby sa potom párujú rovnako ako tie načítané automaticky."
        action={
          <Link
            to="/bankove-ucty"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="block">
              <span className="text-sm font-medium">Súbor s výpisom</span>
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={(e) => vyberSubor(e.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              XML vo formáte camt.053 — v internetbankingu býva ako „SEPA XML“, „XML výpis“ alebo
              „ISO 20022“. Z PDF sa suma ani symboly spoľahlivo prečítať nedajú.
            </p>
            {citam && <p className="mt-2 text-sm text-muted-foreground">Čítam výpis…</p>}
          </div>

          {nahlad && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {nazovSuboru} · {nahlad.format}
              </div>

              <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Účet vo výpise</dt>
                  <dd className="font-mono text-xs">{nahlad.ucetVoVypise ?? "neuvedený"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Obdobie</dt>
                  <dd>
                    {nahlad.odDna} – {nahlad.doDna}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Pohybov</dt>
                  <dd className="font-medium">{nahlad.pocet}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Príjem / výdaj</dt>
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
                <span className="text-sm font-medium">Nahrať do účtu</span>
                <select
                  value={cielovyUcet}
                  onChange={(e) => setCielovyUcet(e.target.value)}
                  className="input mt-1"
                >
                  <option value={NOVY}>
                    Založiť nový účet {nahlad.ucetVoVypise ? `(${nahlad.ucetVoVypise})` : ""}
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
                    Vybraný účet nezodpovedá číslu vo výpise. Skontrolujte to, prosím.
                  </p>
                )}
              {cielovyUcet === NOVY && nahlad.navrhnutyUcetNazov && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Účet {nahlad.navrhnutyUcetNazov} už v evidencii je — vyberte ho, nech pohyby
                  neskončia na dvoch účtoch.
                </p>
              )}

              <button
                onClick={nahraj}
                disabled={zapisujem}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {zapisujem ? "Nahrávam…" : `Nahrať ${nahlad.pocet} pohybov`}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                Ten istý výpis sa dá nahrať znova — pohyby, ktoré už v evidencii sú, sa nezdvoja.
              </p>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
