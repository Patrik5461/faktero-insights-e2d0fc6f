import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listBankData } from "@/lib/faktero/tatrabanka.functions";
import { JobPicker } from "@/components/faktero/JobPicker";
import {
  payPurchaseInvoice,
  listPayments,
  refreshPaymentStatus,
} from "@/lib/faktero/tatrabanka-payments.functions";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  Ban,
  Trash2,
  Wallet,
  Landmark,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";

const PAYMENT_STATUS_TEXT: Record<string, string> = {
  ACTC: "Pripravená na podpis",
  ACSP: "Banka spracováva",
  ACSC: "Zaplatená",
  ACCC: "Zaplatená",
  PDNG: "Čaká na dátum splatnosti",
  RJCT: "Zamietnutá bankou",
  CANC: "Zrušená",
};

/** Chyby zo servera sú kódy — používateľovi treba povedať, čo s tým. */
const PAY_ERRORS: Record<string, string> = {
  missing_supplier_iban: "Faktúra nemá IBAN dodávateľa. Doplňte ho a skúste znova.",
  invalid_supplier_iban: "IBAN dodávateľa nemá platný tvar.",
  invoice_already_paid: "Faktúra je už označená ako zaplatená.",
  payment_already_in_progress: "Platba tejto faktúry už prebieha.",
  unsupported_currency: "Cez banku sa dajú platiť len faktúry v eurách.",
  not_configured: "Napojenie na banku nie je nastavené.",
  Forbidden: "Na platby potrebujete rolu vlastníka alebo správcu.",
};

export const Route = createFileRoute("/_authenticated/prijate-faktury/$id/")({
  head: () => ({ meta: [{ title: "Detail prijatej faktúry — Faktero" }] }),
  component: PurchaseInvoiceDetail,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  received: "Prijaté",
  booked: "Zaúčtované",
  paid: "Zaplatené",
  cancelled: "Stornované",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  received: "bg-amber-100 text-amber-800",
  booked: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

function fmt(n: number, c = "EUR") {
  return formatovacMeny(c, "sk-SK")(n);
}

function PurchaseInvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<any | null>(null);
  // Náhľad prílohy priamo na stránke — podpísaný odkaz platí 10 minút.
  const [nahlad, setNahlad] = useState<string | null>(null);
  // Bez tohto ostal na neexistujúcom doklade navždy nápis „Načítavam…".
  const [nenajdene, setNenajdene] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [debtorAccountId, setDebtorAccountId] = useState<string>("");
  const [paying, setPaying] = useState(false);
  const bankData = useServerFn(listBankData);
  const payInvoice = useServerFn(payPurchaseInvoice);
  const loadPayments = useServerFn(listPayments);
  const refreshPayment = useServerFn(refreshPaymentStatus);

  async function load() {
    const { data } = await supabase
      .from("purchase_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setNenajdene(!data);
    setRow(data);
  }
  useEffect(() => {
    load();
  }, [id]);

  async function loadBankStuff() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const [b, p] = await Promise.all([
        bankData({ data: { company_id: cid } }),
        loadPayments({ data: { company_id: cid, invoice_id: id } }),
      ]);
      setAccounts(b.accounts ?? []);
      setPayments(p ?? []);
    } catch {
      // Banka nemusí byť pripojená — vtedy sa platobná časť jednoducho neponúkne.
    }
  }
  useEffect(() => {
    loadBankStuff();
  }, [id]);

  // Návrat z banky po podpise. Callback už platbu odoslal, tu len povieme ako dopadla.
  useEffect(() => {
    const url = new URL(window.location.href);
    const stav = url.searchParams.get("platba");
    const chyba = url.searchParams.get("platba_chyba");
    if (stav) {
      const text = PAYMENT_STATUS_TEXT[stav] ?? stav;
      if (stav === "RJCT") toast.error(`Platba zamietnutá bankou`);
      else toast.success(`Platba odoslaná do banky — ${text}`);
    }
    if (chyba) toast.error(`Platba zlyhala: ${chyba}`);
    if (stav || chyba) {
      window.history.replaceState({}, "", url.pathname);
      load();
      loadBankStuff();
    }
  }, []);

  async function payViaBank() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setPaying(true);
    try {
      const { authorize_url } = await payInvoice({
        data: {
          company_id: cid,
          invoice_id: id,
          debtor_account_id: debtorAccountId || undefined,
        },
      });
      // Z účtu sa zatiaľ nič nestrhlo — platbu vykoná až podpis v banke.
      window.location.href = authorize_url;
    } catch (e: any) {
      toast.error(PAY_ERRORS[e?.message] ?? e?.message ?? "Platbu sa nepodarilo založiť");
      setPaying(false);
    }
  }

  async function onRefreshPayment(rowId: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const r = await refreshPayment({ data: { company_id: cid, payment_row_id: rowId } });
      toast.success(PAYMENT_STATUS_TEXT[r.transaction_status] ?? r.transaction_status);
      load();
      loadBankStuff();
    } catch (e: any) {
      toast.error(e?.message ?? "Stav sa nepodarilo načítať");
    }
  }

  async function setStatus(status: string, extra: Record<string, any> = {}) {
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ status, ...extra })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Stav aktualizovaný");
    load();
  }

  async function nastavZakazku(jobId: string) {
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ job_id: jobId || null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(jobId ? "Zákazka priradená" : "Zákazka odobraná");
    load();
  }

  async function markPaid() {
    const d = prompt("Dátum úhrady (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!d) return;
    await setStatus("paid", { payment_date: d });
  }

  async function del() {
    if (!confirm("Naozaj vymazať túto prijatú faktúru?")) return;
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vymazané");
    navigate({ to: "/prijate-faktury" });
  }

  async function downloadPdf() {
    if (!row?.file_path) return toast.error("Bez prílohy");
    const { data, error } = await supabase.storage
      .from("purchase-invoices")
      // Bez koncovky sa súbor uloží ako „VS-2026-777" a systém ho nevie otvoriť.
      .createSignedUrl(row.file_path, 60, {
        download: `${(row.invoice_number ?? "faktura").replace(/[^A-Za-z0-9._-]+/g, "_")}.${(
          row.file_path.split(".").pop() ?? "pdf"
        ).toLowerCase()}`,
      });
    if (error || !data) return toast.error(error?.message ?? "Chyba");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // Odkaz sa pýta až keď doklad existuje a prílohu má.
  useEffect(() => {
    let zrusene = false;
    if (!row?.file_path) {
      setNahlad(null);
      return;
    }
    supabase.storage
      .from("purchase-invoices")
      .createSignedUrl(row.file_path, 600)
      .then(({ data }) => {
        if (!zrusene) setNahlad(data?.signedUrl ?? null);
      });
    return () => {
      zrusene = true;
    };
  }, [row?.file_path]);

  if (nenajdene)
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm">
          <p>Tento doklad v aktívnej firme neexistuje.</p>
          <p className="mt-1 text-muted-foreground">
            Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.
          </p>
          <Link to="/prijate-faktury" className="mt-4 inline-block text-primary underline">
            Späť na prijaté faktúry
          </Link>
        </div>
      </PageBody>
    );
  if (!row) return <PageBody>Načítavam…</PageBody>;

  return (
    <>
      <PageHeader
        title={`Prijatá faktúra ${row.invoice_number}`}
        description={`Dodávateľ: ${row.supplier_name} · Vystavená ${row.issue_date}`}
        action={
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[row.status] ?? ""}`}
            >
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
            {row.status !== "cancelled" && (
              <Link
                to="/prijate-faktury/$id/upravit"
                params={{ id }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Pencil className="h-4 w-4" /> Upraviť
              </Link>
            )}
            {row.status !== "received" && row.status !== "paid" && row.status !== "cancelled" && (
              <button
                onClick={() => setStatus("received")}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                Označiť ako prijaté
              </button>
            )}
            {row.status !== "paid" && row.status !== "cancelled" && (
              <button
                onClick={markPaid}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" /> Označiť ako zaplatené
              </button>
            )}
            {row.status !== "cancelled" && (
              <button
                onClick={() => setStatus("cancelled")}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
              >
                <Ban className="h-4 w-4" /> Storno
              </button>
            )}
            {row.file_path && (
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Download className="h-4 w-4" /> Stiahnuť PDF
              </button>
            )}
            <button
              onClick={del}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> Vymazať
            </button>
            <Link
              to="/prijate-faktury"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" /> Späť
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Dodávateľ
                </div>
                <div className="mt-1 font-medium">{row.supplier_name}</div>
                <div className="mt-2 text-sm">
                  IČO: {row.supplier_ico ?? "—"} · DIČ: {row.supplier_dic ?? "—"}
                </div>
                {row.supplier_ic_dph && (
                  <div className="text-sm">IČ DPH: {row.supplier_ic_dph}</div>
                )}
                {row.supplier_iban && (
                  <div className="mt-2 font-mono text-sm">{row.supplier_iban}</div>
                )}
                {row.variable_symbol && (
                  <div className="text-sm text-muted-foreground">VS: {row.variable_symbol}</div>
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Dátumy</div>
                <Row label="Vystavenie" value={row.issue_date} />
                <Row label="Prijatie" value={row.received_date} />
                <Row label="Splatnosť" value={row.due_date} />
                {row.payment_date && <Row label="Úhrada" value={row.payment_date} />}
              </div>
            </div>

            <PolozkyDokladu items={row.items} mena={row.currency} />

            <NahladPrilohy
              url={nahlad}
              mime={row.file_mime}
              maPrilohu={!!row.file_path}
              stiahni={downloadPdf}
            />

            {row.note && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">
                {row.note}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Sumár</div>
              <div className="mt-3 space-y-1 text-sm">
                <Row label="Bez DPH" value={fmt(Number(row.amount_without_vat), row.currency)} />
                <Row label="DPH" value={fmt(Number(row.vat_amount), row.currency)} />
              </div>
              <div className="mt-3 border-t border-border pt-3 text-lg font-semibold">
                {fmt(Number(row.amount_total), row.currency)}
              </div>
            </div>

            {/* Zákazku sa oplatí dať dodatočne aj na starší nákup — vtedy sa
                náklad prejaví vo vyhodnotení hneď po uložení. */}
            <div className="rounded-xl border border-border bg-card p-5">
              <JobPicker
                value={row.job_id ?? ""}
                onChange={(v) => nastavZakazku(v)}
                label="Zákazka"
              />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Platba
              </div>
              <div className="mt-2">Spôsob: {row.payment_method ?? "—"}</div>
              <div>Splatnosť: {row.due_date}</div>
              {row.payment_date && <div>Uhradené: {row.payment_date}</div>}
            </div>

            {accounts.length > 0 && row.status !== "cancelled" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/40">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  <Landmark className="h-3.5 w-3.5" /> Zaplatiť cez banku
                </div>

                {!row.supplier_iban ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Faktúra nemá IBAN dodávateľa — bez neho sa príkaz nedá zadať.
                  </p>
                ) : row.status === "paid" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Faktúra je označená ako zaplatená.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Príjemca</span>
                        <span className="text-right">{row.supplier_name}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">IBAN</span>
                        <span className="font-mono text-xs">{row.supplier_iban}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Suma</span>
                        <span className="font-semibold tabular-nums">
                          {fmt(Number(row.amount_total), row.currency)}
                        </span>
                      </div>
                      {row.variable_symbol && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">VS</span>
                          <span className="tabular-nums">{row.variable_symbol}</span>
                        </div>
                      )}
                    </div>

                    <label className="mt-3 block text-xs text-muted-foreground">
                      Z účtu
                      <select
                        value={debtorAccountId}
                        onChange={(e) => setDebtorAccountId(e.target.value)}
                        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      >
                        <option value="">Vyberiem v banke</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_name ?? a.iban}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      onClick={payViaBank}
                      disabled={paying}
                      className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Landmark className="h-4 w-4" />
                      {paying ? "Pripravujem…" : "Zaplatiť cez banku"}
                    </button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Presmerujeme vás do Tatra banky na podpis. Z účtu sa nič nestrhne, kým platbu
                      nepodpíšete.
                    </p>
                  </>
                )}

                {payments.length > 0 && (
                  <div className="mt-4 border-t border-emerald-200 pt-3 dark:border-emerald-900/40">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      História platieb
                    </div>
                    <ul className="mt-2 space-y-2">
                      {payments.map((p) => (
                        <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {PAYMENT_STATUS_TEXT[p.transaction_status] ??
                                p.transaction_status ??
                                p.status}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleString("sk-SK")} ·{" "}
                              {fmt(Number(p.amount), p.currency)}
                            </div>
                            {p.error_message && (
                              <div className="text-xs text-rose-700">{p.error_message}</div>
                            )}
                          </div>
                          <button
                            onClick={() => onRefreshPayment(p.id)}
                            title="Načítať aktuálny stav z banky"
                            className="rounded-md border border-border bg-background p-1.5 hover:bg-secondary"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Položky prečítané z dokladu.
 *
 * Sú informatívne — needitujú sa a nespájajú so skladom. Zmysel majú v tom, že
 * pri kontrole nemusí človek otvárať PDF, keď chce len vidieť, za čo to je.
 */
function PolozkyDokladu({ items, mena }: { items: unknown; mena?: string | null }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const cena = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? formatovacMeny(mena || "EUR", "sk-SK")(n) : "—";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium">Položky z dokladu</h2>
        <span className="text-xs text-muted-foreground">
          {items.length === 1 ? "1 položka" : `${items.length} položiek`} · prečítané z prílohy
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Položka</th>
              <th className="p-3 text-right">Množstvo</th>
              <th className="p-3 text-right">Cena za kus</th>
              <th className="p-3 text-right">DPH</th>
              <th className="p-3 text-right">Spolu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(items as any[]).map((p, i) => (
              <tr key={i}>
                <td className="p-3">{p?.name ?? "—"}</td>
                <td className="p-3 text-right tabular-nums">
                  {p?.quantity != null ? `${p.quantity}${p?.unit ? ` ${p.unit}` : ""}` : "—"}
                </td>
                <td className="p-3 text-right tabular-nums">{cena(p?.unit_price)}</td>
                <td className="p-3 text-right tabular-nums">
                  {p?.vat_rate != null ? `${p.vat_rate} %` : "—"}
                </td>
                <td className="p-3 text-right tabular-nums font-medium">{cena(p?.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        Položky sú len na prezretie — do skladu ani do účtovníctva nevstupujú. Rozhodujú sumy v
        hlavičke dokladu.
      </p>
    </div>
  );
}

/**
 * Náhľad prílohy priamo na stránke. PDF sa vloží cez `object`, fotka ako obrázok
 * — sťahovať sa nemusí nič. Keď to prehliadač nezvládne, ostáva tlačidlo.
 */
function NahladPrilohy({
  url,
  mime,
  maPrilohu,
  stiahni,
}: {
  url: string | null;
  mime?: string | null;
  maPrilohu: boolean;
  stiahni: () => void;
}) {
  if (!maPrilohu) return null;
  const jeObrazok = (mime ?? "").startsWith("image/");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium">Náhľad dokladu</h2>
        <button
          onClick={stiahni}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        >
          <Download className="h-3.5 w-3.5" /> Stiahnuť
        </button>
      </div>
      {!url ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Načítavam náhľad…</div>
      ) : jeObrazok ? (
        <img src={url} alt="Doklad" className="max-h-[70vh] w-full bg-muted/20 object-contain" />
      ) : (
        /* Vlastné vykreslenie — na zabudovaný prehliadač PDF sa spoľahnúť nedá. */
        <NahladPdf url={url} />
      )}
    </div>
  );
}
