import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getApprovalInvoice, respondToApproval } from "@/lib/faktero/invoice-approval.functions";
import { CheckCircle2, XCircle, Loader2, FileText } from "lucide-react";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/schvalit/$token")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "Schválenie faktúry — Faktero") },
        { name: "robots", content: "noindex,nofollow" },
      ],
    };
  },
  component: ApprovalPage,
});

function fmt(n: number, currency: string | null | undefined = "EUR") {
  return formatujMenu(n, currency);
}

function ApprovalPage() {
  const { t, jazyk } = useT();
  const { token } = Route.useParams();
  const fetchInv = useServerFn(getApprovalInvoice);
  const respond = useServerFn(respondToApproval);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchInv({ data: { token } });
        if (!cancelled) setData(r);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? t("Chyba pri načítaní."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(decision: "approved" | "rejected") {
    if (decision === "rejected" && !note.trim()) {
      setErr(t("Prosím uveďte dôvod zamietnutia."));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await respond({
        data: { token, decision, note: decision === "rejected" ? note.trim() : undefined },
      });
      setDone(decision);
    } catch (e: any) {
      setErr(e?.message ?? t("Chyba pri odosielaní odpovede."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
        </div>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 text-lg font-semibold">{t("Odkaz nie je dostupný")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t(err)}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          {done === "approved" ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h1 className="mt-4 text-lg font-semibold">{t("Ďakujeme, faktúra je schválená")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("Dodávateľ dostal upozornenie o schválení.")}
              </p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="mt-4 text-lg font-semibold">{t("Faktúra bola zamietnutá")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("Váš dôvod bol odoslaný dodávateľovi.")}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const inv = data?.invoice;
  const items: any[] = data?.items ?? [];
  const company = data?.company;
  const alreadyDone = inv?.approval_status && inv.approval_status !== "pending";

  return (
    <div className="min-h-screen bg-muted/30 py-10">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-6 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <FileText className="h-4 w-4" /> {t("Žiadosť o schválenie faktúry")}
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("Dodávateľ")}
              </div>
              <div className="mt-1 text-base font-semibold">{company?.name ?? "—"}</div>
              <div className="text-sm text-muted-foreground">
                {company?.street}
                {company?.street && <br />}
                {company?.zip} {company?.city}
                {company?.country ? `, ${company.country}` : ""}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t("IČO:")} {company?.ico ?? "—"} {t("· DIČ:")} {company?.dic ?? "—"}
                {company?.ic_dph ? ` · ${t("IČ DPH:")} ${company.ic_dph}` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("Faktúra")}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{inv.invoice_number}</div>
              <div className="text-xs text-muted-foreground">
                {t("Vystavená")} {datumNaDoklade(inv.issue_date)} {t("· splatná")}{" "}
                {datumNaDoklade(inv.due_date)}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("Odberateľ")}
            </div>
            <div className="mt-1 font-medium">{inv.customer_name}</div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("Popis")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Množ.")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Cena")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("DPH")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Spolu")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                      {t("Žiadne položky.")}
                    </td>
                  </tr>
                ) : (
                  items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <span className="block">{it.name}</span>
                        {it.description && (
                          <span className="block text-xs text-muted-foreground">
                            {it.description}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(it.quantity ?? 0)} {it.unit ?? ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(Number(it.unit_price ?? 0), inv.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(it.vat_rate ?? 0)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(Number(it.total ?? 0), inv.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-muted/20">
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    {t("Základ")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(Number(inv.subtotal ?? 0), inv.currency)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    {t("DPH")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(Number(inv.vat_total ?? 0), inv.currency)}
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-3 py-3 text-right text-sm font-semibold">
                    {t("Celkom na úhradu")}
                  </td>
                  <td className="px-3 py-3 text-right text-lg font-bold tabular-nums">
                    {fmt(Number(inv.total ?? 0), inv.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {inv.notes && (
            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground whitespace-pre-wrap">
              {inv.notes}
            </div>
          )}

          {alreadyDone ? (
            <div
              className={`mt-6 rounded-xl border p-4 text-sm ${inv.approval_status === "approved" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-destructive/40 bg-destructive/5 text-destructive"}`}
            >
              {t(
                inv.approval_status === "approved"
                  ? "Táto faktúra už bola schválená"
                  : "Táto faktúra už bola zamietnutá",
              )}
              {inv.approval_responded_at
                ? ` (${new Date(inv.approval_responded_at).toLocaleString(lokalJazyka(jazyk))})`
                : ""}
              .
              {inv.approval_note && (
                <div className="mt-2 whitespace-pre-wrap">
                  {t("Dôvod:")} {inv.approval_note}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-8 border-t border-border pt-6">
              {rejecting ? (
                <div>
                  <label className="block text-sm font-medium">{t("Dôvod zamietnutia")}</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder={t("Napíšte prosím dôvod, ktorý bude odoslaný dodávateľovi…")}
                  />
                  {err && <div className="mt-2 text-sm text-destructive">{t(err)}</div>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() => submit("rejected")}
                      className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {t("Potvrdiť zamietnutie")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setRejecting(false);
                        setErr(null);
                      }}
                      className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
                    >
                      {t("Späť")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    disabled={busy}
                    onClick={() => submit("approved")}
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {t("Schvaľujem")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setRejecting(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-destructive/50 px-5 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> {t("Zamietam")}
                  </button>
                  {err && <div className="w-full text-sm text-destructive">{t(err)}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {t("Odkaz je platný 7 dní od odoslania žiadosti.")}
        </div>
      </div>
    </div>
  );
}
