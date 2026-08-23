import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Ban, Building2, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveDialog } from "@/components/faktero/ResponsiveDialog";
import {
  adminDetailUctu,
  adminZakazPrihlasenie,
  adminZmazUcet,
  adminZrusPlanovaneZrusenie,
} from "@/lib/faktero/admin-ucty.functions";
import {
  adminSetCompanyPlan,
  adminExtendTrial,
  adminCancelSubscription,
  adminReactivateSubscription,
  suspendCompany,
  reactivateCompany,
} from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/users/$id")({
  head: () => ({ meta: [{ title: "Admin · Účet — Faktero" }] }),
  component: AdminUcetPage,
});

type Detail = Awaited<ReturnType<typeof adminDetailUctu>>;

const PLANY = ["starter", "premium", "enterprise"] as const;

function datum(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("sk-SK");
  } catch {
    return "—";
  }
}

function Udaj({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value ?? "—"}</div>
    </div>
  );
}

function AdminUcetPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const nacitaj = useServerFn(adminDetailUctu);
  const zakazFn = useServerFn(adminZakazPrihlasenie);
  const zmazFn = useServerFn(adminZmazUcet);
  const odvolajFn = useServerFn(adminZrusPlanovaneZrusenie);
  const planFn = useServerFn(adminSetCompanyPlan);
  const predlzFn = useServerFn(adminExtendTrial);
  const zrusPredplatneFn = useServerFn(adminCancelSubscription);
  const obnovPredplatneFn = useServerFn(adminReactivateSubscription);
  const pozastavFn = useServerFn(suspendCompany);
  const obnovFirmuFn = useServerFn(reactivateCompany);

  const [data, setData] = useState<Detail | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mazanie, setMazanie] = useState(false);
  const [prepis, setPrepis] = useState("");

  const obnov = useCallback(async () => {
    try {
      setData(await nacitaj({ data: { userId: id } }));
      setChyba(null);
    } catch (e: any) {
      setChyba(e?.message ?? "Chyba");
    }
  }, [nacitaj, id]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  /** Každý zásah vyzerá rovnako: sprav, povedz, načítaj znova. */
  async function zasah(co: () => Promise<unknown>, hlaska: string) {
    setBusy(true);
    try {
      await co();
      toast.success(hlaska);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa to.");
    } finally {
      setBusy(false);
    }
  }

  async function zmaz() {
    setBusy(true);
    try {
      const v: any = await zmazFn({ data: { userId: id, potvrdEmail: prepis.trim() } });
      toast.success(
        v?.zmazaneFirmy?.length
          ? `Účet zmazaný aj s firmami: ${v.zmazaneFirmy.join(", ")}`
          : "Účet zmazaný.",
      );
      navigate({ to: "/admin/users" });
    } catch (e: any) {
      toast.error(e?.message ?? "Zmazať sa to nepodarilo.");
      setBusy(false);
    }
  }

  if (chyba) {
    return (
      <>
        <AdminPageHeader title="Účet" />
        <AdminPageBody>
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chyba}
          </div>
        </AdminPageBody>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AdminPageHeader title="Načítavam…" />
        <AdminPageBody>
          <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
        </AdminPageBody>
      </>
    );
  }

  const zanikajuce = data.firmy.filter((f) => f.zanikneSUctom);

  return (
    <>
      <AdminPageHeader
        title={data.profil.email ?? "Účet"}
        description={data.profil.full_name ?? "Bez mena"}
      />
      <AdminPageBody>
        <Link
          to="/admin/users"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Späť na používateľov
        </Link>

        {data.jeAdmin && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Toto je účet administrátora platformy. Deaktivovať ani zmazať sa nedá — aby sa nedal
              omylom odstrániť prístup do administrácie.
            </span>
          </div>
        )}

        {data.profil.deletion_scheduled_for && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <span>
              Používateľ požiadal o zrušenie účtu. Vykoná sa{" "}
              <strong>{datum(data.profil.deletion_scheduled_for)}</strong>.
            </span>
            <button
              disabled={busy}
              onClick={() => zasah(() => odvolajFn({ data: { userId: id } }), "Zrušenie odvolané.")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            >
              <Undo2 className="h-3.5 w-3.5" /> Odvolať zrušenie
            </button>
          </div>
        )}

        <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Udaj label="E-mail" value={data.profil.email} />
          <Udaj
            label="Stav"
            value={
              data.zakazane ? (
                <span className="font-medium text-destructive">Prihlásenie zakázané</span>
              ) : data.email_potvrdeny ? (
                "Aktívny"
              ) : (
                "E-mail nepotvrdený"
              )
            }
          />
          <Udaj label="Registrovaný" value={datum(data.profil.created_at)} />
          <Udaj label="Naposledy prihlásený" value={datum(data.posledne_prihlasenie)} />
        </div>

        {/* ── Firmy a predplatné ─────────────────────────────────────────── */}
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Firmy a predplatné
        </h2>
        {data.firmy.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Účet zatiaľ nepatrí do žiadnej firmy — predplatné teda nemá kde nastaviť.
          </p>
        ) : (
          <div className="space-y-3">
            {data.firmy.map((f) => (
              <div key={f.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      to="/admin/companies/$id"
                      params={{ id: f.id }}
                      className="inline-flex items-center gap-2 font-medium hover:underline"
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground" /> {f.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.rola} · {f.clenov === 1 ? "jediný člen" : `${f.clenov} členov`}
                      {f.ico ? ` · IČO ${f.ico}` : ""}
                      {f.suspended_at ? " · firma pozastavená" : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {f.predplatne ? (
                      <>
                        <div className="text-sm font-medium text-foreground">
                          {f.predplatne.plan} · {f.predplatne.status}
                        </div>
                        {f.predplatne.trial_ends_at && (
                          <div>skúšobné do {datum(f.predplatne.trial_ends_at)}</div>
                        )}
                        {f.predplatne.current_period_end && (
                          <div>obdobie do {datum(f.predplatne.current_period_end)}</div>
                        )}
                      </>
                    ) : (
                      "bez predplatného"
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {PLANY.map((p) => (
                    <button
                      key={p}
                      disabled={busy || f.predplatne?.plan === p}
                      onClick={() =>
                        zasah(
                          () => planFn({ data: { companyId: f.id, planSlug: p } }),
                          `Plán zmenený na ${p}.`,
                        )
                      }
                      className="rounded-md border border-border px-2.5 py-1 text-xs capitalize hover:bg-secondary disabled:border-primary disabled:bg-primary/10 disabled:text-primary disabled:opacity-100"
                    >
                      {p}
                    </button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border" />
                  {[14, 30].map((d) => (
                    <button
                      key={d}
                      disabled={busy}
                      onClick={() =>
                        zasah(
                          () => predlzFn({ data: { companyId: f.id, days: d } }),
                          `Skúšobné obdobie predĺžené o ${d} dní.`,
                        )
                      }
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                    >
                      +{d} dní skúšobného
                    </button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border" />
                  {f.predplatne?.status === "cancelled" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        zasah(
                          () => obnovPredplatneFn({ data: { companyId: f.id } }),
                          "Predplatné obnovené.",
                        )
                      }
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                    >
                      Obnoviť predplatné
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        zasah(
                          () => zrusPredplatneFn({ data: { companyId: f.id } }),
                          "Predplatné zrušené ku koncu obdobia.",
                        )
                      }
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                    >
                      Zrušiť predplatné
                    </button>
                  )}
                  {f.suspended_at ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        zasah(() => obnovFirmuFn({ data: { id: f.id } }), "Firma obnovená.")
                      }
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                    >
                      Obnoviť firmu
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const dovod = window.prompt("Dôvod pozastavenia firmy:");
                        if (!dovod) return;
                        void zasah(
                          () => pozastavFn({ data: { id: f.id, reason: dovod } }),
                          "Firma pozastavená.",
                        );
                      }}
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                    >
                      Pozastaviť firmu
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Zásahy do účtu ─────────────────────────────────────────────── */}
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Účet
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
            <div>
              <p className="text-sm font-medium">
                {data.zakazane ? "Prihlásenie je zakázané" : "Zakázať prihlásenie"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Dáta ostávajú nedotknuté, človek sa len nedostane dnu. Platí to okamžite aj na
                otvorenú reláciu — appka v telefóne vypadne pri najbližšom volaní servera.
                Kedykoľvek sa to dá vrátiť.
              </p>
            </div>
            <button
              disabled={busy || data.jeAdmin}
              onClick={() =>
                zasah(
                  () => zakazFn({ data: { userId: id, zakazat: !data.zakazane } }),
                  data.zakazane ? "Prihlásenie povolené." : "Prihlásenie zakázané.",
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Ban className="h-4 w-4" />
              {data.zakazane ? "Povoliť prihlásenie" : "Zakázať prihlásenie"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
            <div>
              <p className="text-sm font-medium text-destructive">Zmazať účet natrvalo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {zanikajuce.length
                  ? `Zmaže sa aj ${zanikajuce.length === 1 ? "firma" : "firmy"} ${zanikajuce
                      .map((f) => f.name)
                      .join(", ")} vrátane dokladov a príloh — nikto iný v nej nie je.`
                  : "Firmy ostanú kolegom, zmaže sa členstvo, profil a prihlásenie."}{" "}
                Vrátiť sa to nedá.
              </p>
            </div>
            <button
              disabled={busy || data.jeAdmin || !data.mozeMazat}
              onClick={() => {
                setPrepis("");
                setMazanie(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Zmazať účet
            </button>
          </div>
          {!data.mozeMazat && (
            <p className="text-xs text-muted-foreground">
              Mazať účty smie len superadmin. Deaktivácia je dostupná aj vám.
            </p>
          )}
        </div>

        <ResponsiveDialog
          open={mazanie}
          onOpenChange={(o: boolean) => !busy && setMazanie(o)}
          title="Zmazať účet natrvalo"
          description="Toto sa nedá vrátiť. Prepíšte e-mail účtu, aby bolo isté, že mažete ten správny."
        >
          <div className="space-y-3">
            {zanikajuce.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                So zmazaním zaniknú aj tieto firmy so všetkými dokladmi a prílohami:{" "}
                <strong>{zanikajuce.map((f) => f.name).join(", ")}</strong>.
              </div>
            )}
            <input
              value={prepis}
              onChange={(e) => setPrepis(e.target.value)}
              placeholder={data.profil.email ?? ""}
              autoComplete="off"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMazanie(false)}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm"
              >
                Späť
              </button>
              <button
                onClick={zmaz}
                disabled={
                  busy || prepis.trim().toLowerCase() !== (data.profil.email ?? "").toLowerCase()
                }
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              >
                {busy ? "Mažem…" : "Zmazať natrvalo"}
              </button>
            </div>
          </div>
        </ResponsiveDialog>
      </AdminPageBody>
    </>
  );
}
