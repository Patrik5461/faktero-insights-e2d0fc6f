import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, PauseCircle, PlayCircle, UserCog } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveDialog } from "@/components/faktero/ResponsiveDialog";
import { getAdminCompany, suspendCompany, reactivateCompany } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/companies/$id")({
  head: () => ({ meta: [{ title: "Admin · Detail firmy — Faktero" }] }),
  component: AdminCompanyDetailPage,
});

type Detail = Awaited<ReturnType<typeof getAdminCompany>>;

function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("sk-SK");
  } catch {
    return "—";
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value ?? "—"}</div>
    </div>
  );
}

function AdminCompanyDetailPage() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getAdminCompany);
  const doSuspend = useServerFn(suspendCompany);
  const doReactivate = useServerFn(reactivateCompany);

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchDetail({ data: { id } });
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchDetail, id, nonce]);

  async function confirmSuspend() {
    setBusy(true);
    try {
      await doSuspend({ data: { id, reason: reason.trim() || "—" } });
      toast.success("Firma pozastavená");
      setSuspending(false);
      setReason("");
      setNonce((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    try {
      await doReactivate({ data: { id } });
      toast.success("Firma obnovená");
      setNonce((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  if (loading && !data) {
    return (
      <>
        <AdminPageHeader title="Načítavam…" />
        <AdminPageBody>
          <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
        </AdminPageBody>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <AdminPageHeader title="Firma" />
        <AdminPageBody>
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error ?? "Firma nenájdená."}
          </div>
          <Link
            to="/admin/companies"
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Späť na zoznam
          </Link>
        </AdminPageBody>
      </>
    );
  }

  const c = data.company;
  const isSuspended = !!c.suspended_at;

  return (
    <>
      <AdminPageHeader
        title={c.name}
        description={`IČO ${c.ico ?? "—"} · DIČ ${c.dic ?? "—"}`}
        action={
          <>
            <Link
              to="/admin/companies"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Späť
            </Link>
            {isSuspended ? (
              <button
                onClick={handleReactivate}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <PlayCircle className="h-4 w-4" /> Obnoviť
              </button>
            ) : (
              <button
                onClick={() => setSuspending(true)}
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >
                <PauseCircle className="h-4 w-4" /> Pozastaviť
              </button>
            )}
            <button
              disabled
              title="Bude pripravené po spustení GoPay"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm opacity-60"
            >
              Zmeniť plán
            </button>
            <button
              disabled
              title="Impersonácia zatiaľ neaktívna"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm opacity-60"
            >
              <UserCog className="h-4 w-4" /> Impersonovať
            </button>
          </>
        }
      />
      <AdminPageBody>
        {isSuspended && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>Pozastavená</strong> od {fmtDateTime(c.suspended_at)}
            {c.suspended_reason ? ` — ${c.suspended_reason}` : ""}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Firma
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Názov" value={c.name} />
              <Field label="IČO" value={c.ico} />
              <Field label="DIČ" value={c.dic} />
              <Field label="IČ DPH" value={c.ic_dph} />
              <Field label="Krajina" value={c.country} />
              <Field label="Mena" value={c.default_currency} />
              <Field label="E-mail" value={c.email} />
              <Field label="Telefón" value={c.phone} />
              <Field
                label="Adresa"
                value={[c.street, c.zip, c.city].filter(Boolean).join(", ") || "—"}
              />
              <Field label="IBAN (maskovaný)" value={c.iban} />
              <Field label="Vytvorená" value={fmtDateTime(c.created_at)} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Sumár
            </h2>
            <div className="space-y-3">
              <Field label="Faktúry spolu" value={data.invoicesCount} />
              <Field label="Posledná faktúra" value={fmtDateTime(data.lastInvoiceAt)} />
              <Field label="Posledné API volanie" value={fmtDateTime(data.lastApiAt)} />
              <Field label="Používatelia" value={data.users.length} />
            </div>
          </section>

          <section className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Používatelia
            </h2>
            {data.users.length === 0 ? (
              <div className="text-sm text-muted-foreground">Žiadni používatelia.</div>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.users.map((u) => (
                  <li key={u.user_id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.full_name ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">{u.email ?? "—"}</div>
                    </div>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase">
                      {u.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Predplatné
            </h2>
            {data.subscription ? (
              <div className="space-y-3">
                <Field label="Plán" value={data.subscription.plan} />
                <Field label="Stav" value={data.subscription.status} />
                <Field label="Trial do" value={fmtDateTime(data.subscription.trial_ends_at)} />
                <Field
                  label="Ďalšia fakturácia"
                  value={fmtDateTime(data.subscription.next_billing_at)}
                />
                <Field
                  label="Mesačná cena"
                  value={
                    data.subscription.monthly_price_cents != null
                      ? `${(data.subscription.monthly_price_cents / 100).toFixed(2)} €`
                      : "—"
                  }
                />
                <Field label="Poskytovateľ" value={data.subscription.payment_provider ?? "—"} />
                <Field
                  label="GoPay ID (maskované)"
                  value={data.subscription.external_subscription_id ?? "—"}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Bez predplatného.</div>
            )}
          </section>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Citlivé údaje (IBAN, GoPay ID, API kľúče, bankové tokeny, webhook secrets, FinStat kľúče)
          sú maskované a nezobrazujú sa v plnej forme.
        </p>

        <ResponsiveDialog
          open={suspending}
          onOpenChange={(v) => {
            if (!v) {
              setSuspending(false);
              setReason("");
            }
          }}
          title={`Pozastaviť ${c.name}`}
          description="Firma stratí prístup k aplikácii. Akcia bude zaznamenaná v audit logu."
          footer={
            <>
              <button
                onClick={() => setSuspending(false)}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Zrušiť
              </button>
              <button
                disabled={busy}
                onClick={confirmSuspend}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              >
                {busy ? "Pozastavujem…" : "Pozastaviť"}
              </button>
            </>
          }
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Dôvod</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </ResponsiveDialog>
      </AdminPageBody>
    </>
  );
}
