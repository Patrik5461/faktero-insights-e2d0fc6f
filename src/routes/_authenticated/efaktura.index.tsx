import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CheckCircle2, Circle, Clock, Info, Mail, AlertTriangle, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  getEfakturaReadinessFn,
  sparujEpostakFirmuFn,
} from "@/lib/faktero/efaktura/efaktura.functions";

/**
 * Spárovanie firmy s jej záznamom u ePoštáka.
 *
 * Páruje sa podľa IČO. Keď firma u nich nie je, povie sa to rovno aj so
 * zoznamom toho, čo tam je — inak sa len háda, prečo sa nič nenašlo.
 */
function SparovanieSPostakom({ companyId }: { companyId: string | null }) {
  const sparuj = useServerFn(sparujEpostakFirmuFn);
  const [stav, setStav] = useState<any>(null);
  const [bezi, setBezi] = useState(false);

  async function spusti() {
    if (!companyId) return;
    setBezi(true);
    try {
      const r: any = await sparuj({ data: { company_id: companyId } });
      setStav(r);
      if (r.sparovane) toast.success(`Spárované s ${r.name}.`);
      else toast.error("Vaša firma u ePoštáka nie je — treba ju tam najprv zaregistrovať.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Odosielanie cez ePoštáka</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bez spárovania sa eFaktúra nemá ako odoslať. Páruje sa podľa IČO vašej firmy.
          </p>
        </div>
        <button
          onClick={spusti}
          disabled={bezi || !companyId}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" /> {bezi ? "Overujem…" : "Spárovať"}
        </button>
      </div>

      {stav?.sparovane && (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Spárované s <span className="font-medium">{stav.name}</span>
          {stav.peppolId ? (
            <>
              {" "}
              · Peppol <span className="font-mono text-xs">{stav.peppolId}</span> (
              {stav.peppolStatus})
            </>
          ) : null}
        </div>
      )}
      {stav && !stav.sparovane && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          Firmu s IČO <span className="font-mono">{stav.ico}</span> ePošták nepozná.
          {stav.dostupne?.length ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Registrované sú: {stav.dostupne.map((f: any) => `${f.name} (${f.ico})`).join(", ")}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/efaktura/")({
  head: () => ({ meta: [{ title: "eFaktúra — Faktero" }] }),
  component: EFakturaPage,
});

type Status = "done" | "missing" | "soon";

function StatusPill({ status }: { status: Status }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" /> Hotovo
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
        <Circle className="h-3.5 w-3.5" /> Chýba
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Clock className="h-3.5 w-3.5" /> Pripravujeme
    </span>
  );
}

function EFakturaPage() {
  const [company, setCompany] = useState<any | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const id = getActiveCompanyId();
    setCompanyId(id);
    if (!id) return;
    supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setCompany(data));
  }, []);

  const readinessFn = useServerFn(getEfakturaReadinessFn);
  const readinessQuery = useQuery({
    queryKey: ["efaktura-readiness", companyId],
    queryFn: () => readinessFn({ data: { companyId: companyId! } }),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const checklist = useMemo(() => {
    const has = (v: any) => typeof v === "string" && v.trim().length > 0;
    const hasCompanyDetails =
      !!company && has(company.name) && (has(company.street) || has(company.city));
    return [
      {
        label: "Firemné údaje vyplnené",
        status: hasCompanyDetails ? "done" : ("missing" as Status),
      },
      { label: "IČO vyplnené", status: has(company?.ico) ? "done" : ("missing" as Status) },
      { label: "DIČ vyplnené", status: has(company?.dic) ? "done" : ("missing" as Status) },
      {
        label: "IČ DPH vyplnené, ak je firma platiteľ DPH",
        status: has(company?.ic_dph) ? "done" : ("missing" as Status),
      },
      { label: "IBAN vyplnený", status: has(company?.iban) ? "done" : ("missing" as Status) },
      { label: "Peppol ID pripravené", status: "soon" as Status },
      { label: "eFaktúra režim aktivovaný", status: "soon" as Status },
    ];
  }, [company]);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error("Zadajte platný e-mail.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("efaktura_interest_signups").insert({
      email: value,
      company_id: getActiveCompanyId(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ďakujeme! Ozveme sa s novinkami k eFaktúre.");
    setEmail("");
  }

  return (
    <>
      <PageHeader
        title="eFaktúra"
        description="Pripravte sa na povinnú elektronickú fakturáciu od 1.1.2027."
      />
      <PageBody>
        {/*
          Spárovanie s ePoštákom je prvá vec, bez ktorej sa neodošle nič —
          ich API chce identifikátor firmy pri každom volaní. Preto je nad
          skóre pripravenosti, nie zapadnuté v nastaveniach.
        */}
        <SparovanieSPostakom companyId={companyId} />
        {readinessQuery.data && (
          <div className="mb-6 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Skóre pripravenosti</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Komplexné vyhodnotenie firemných údajov, DPH, Peppol a XML pipeliny.
                </p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold text-primary">
                  {readinessQuery.data.score}%
                </div>
                <div className="text-xs text-muted-foreground">EN 16931 + Peppol BIS 3.0</div>
              </div>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${readinessQuery.data.score}%` }}
              />
            </div>
            {readinessQuery.data.blockers.length > 0 && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Blokujúce nedostatky (
                  {readinessQuery.data.blockers.length})
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {readinessQuery.data.blockers.map((b) => (
                    <li key={b.key} className="flex items-center justify-between">
                      <span>{b.label}</span>
                      {b.fixUrl && (
                        <Link to={b.fixUrl} className="text-xs text-primary hover:underline">
                          Opraviť →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {readinessQuery.data.missing.filter((m) => m.severity === "warning").length > 0 && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-sm font-medium">Upozornenia</div>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {readinessQuery.data.missing
                    .filter((m) => m.severity === "warning")
                    .map((m) => (
                      <li key={m.key}>
                        • {m.label}
                        {m.hint ? ` — ${m.hint}` : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {readinessQuery.isError && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Skóre pripravenosti sa nepodarilo načítať: {(readinessQuery.error as Error).message}
          </div>
        )}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Čo je eFaktúra?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                eFaktúra nie je PDF ani sken faktúry. Ide o štruktúrovaný XML formát, ktorému
                rozumejú účtovné a podnikové systémy.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
            <h2 className="font-semibold">Checklist pripravenosti</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Skontrolujeme, či máte vyplnené všetko potrebné na prechod na eFaktúru.
            </p>
            <ul className="mt-4 divide-y divide-border">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center justify-between py-3">
                  <span className="text-sm">{item.label}</span>
                  <StatusPill status={item.status} />
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <Link
                to="/firma"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50"
              >
                Upraviť firemné údaje
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold">Koho sa bude eFaktúra týkať</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>Platitelia DPH</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>Neplatitelia DPH pri prijímaní eFaktúr</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>B2B a B2G transakcie</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <Circle className="mt-0.5 h-4 w-4" />
                <span>B2C transakcie zatiaľ nie</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="font-semibold">Chcem dostávať novinky k eFaktúre</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pošleme vám e-mail, keď bude eFaktúra v Faktero k dispozícii a pri každom dôležitom
                kroku.
              </p>
              <form onSubmit={onSignup} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vas@email.sk"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? "Odosielam…" : "Chcem novinky k eFaktúre"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
