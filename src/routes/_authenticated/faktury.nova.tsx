import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PAYMENT_METHODS } from "@/lib/faktero/payment-method";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import {
  Trash2,
  Plus,
  Sparkles,
  Search,
  ChevronDown,
  ChevronUp,
  User,
  Package,
  Calendar,
  FileText,
  Loader2,
  Command,
  UserPlus,
  X,
  AlertTriangle,
  CreditCard,
  Link2,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { triggerEventFn } from "@/lib/faktero/email.functions";
import { aiParseInvoiceFn } from "@/lib/faktero/ai-invoice.functions";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";
import { findCustomerByIcoFn } from "@/lib/faktero/company-lookup.functions";
import { ConstantSymbolCombobox } from "@/components/faktero/ConstantSymbolCombobox";
import { JobPicker } from "@/components/faktero/JobPicker";
import { DEFAULT_VAT_RATE, SK_VAT_RATES } from "@/lib/faktero/vat-rates";

export const Route = createFileRoute("/_authenticated/faktury/nova")({
  head: () => ({ meta: [{ title: "Nová faktúra — Faktero" }] }),
  /**
   * `supplier_hint` a `total_hint` posiela skener dokladov. Bez nich by sa po
   * naskenovaní otvoril prázdny formulár a celé ťaženie by vyšlo nazmar.
   */
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    type?: "proforma" | "credit_note";
    supplier_hint?: string;
    total_hint?: string;
  } => ({
    type: (s.type === "proforma" || s.type === "credit_note" ? s.type : undefined) as
      "proforma" | "credit_note" | undefined,
    supplier_hint:
      typeof s.supplier_hint === "string" && s.supplier_hint.trim() ? s.supplier_hint : undefined,
    // Router si číselný parameter sám prevedie na number, takže "42.50" sem
    // nepríde ako reťazec — kontrola na typ string by sumu ticho zahodila.
    total_hint:
      (typeof s.total_hint === "string" || typeof s.total_hint === "number") &&
      Number.isFinite(Number(s.total_hint))
        ? String(s.total_hint)
        : undefined,
  }),
  component: NewInvoice,
});

type Item = {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  product_id?: string | null;
  stock_item_id?: string | null;
  // UI hints (not persisted):
  _track_stock?: boolean;
  _available?: number;
  _sku?: string | null;
};
const EMPTY_ITEM: Item = {
  name: "",
  quantity: 1,
  unit: "ks",
  unit_price: 0,
  vat_rate: DEFAULT_VAT_RATE,
};

type StockMeta = {
  stock_item_id: string;
  track_stock: boolean;
  available: number;
  sku: string | null;
};

function NewInvoice() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const triggerEvt = useServerFn(triggerEventFn);
  const aiParse = useServerFn(aiParseInvoiceFn);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, StockMeta>>({});
  const [warehouseName, setWarehouseName] = useState<string>("");
  const [company, setCompany] = useState<any>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: (search.type ?? "regular") as "regular" | "proforma" | "credit_note",
    customer_id: "",
    issue_date: new Date().toISOString().slice(0, 10),
    delivery_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    variable_symbol: "",
    constant_symbol: "",
    specific_symbol: "",
    order_number: "",
    currency: "EUR",
    payment_method: "bank_transfer",
    delivery_method: "",
    rounding_mode: "per_document" as "per_item" | "per_document" | "retail",
    reverse_charge: false,
    reverse_charge_type: "" as "" | "domestic_69" | "eu_b2b" | "export",
    advance_invoice_id: "" as string | "",
    advance_amount: 0,
    job_id: "",
    notes: "",
  });
  const [items, setItems] = useState<Item[]>(() => {
    // Predvyplnenie zo skenera dokladov. Suma ide ako jedna položka za 1 ks —
    // rozpis položiek z dokladu nemáme, len celkovú sumu.
    const total = Number(search.total_hint);
    if (!search.supplier_hint && !Number.isFinite(total)) return [{ ...EMPTY_ITEM }];
    return [
      {
        ...EMPTY_ITEM,
        name: search.supplier_hint ? `Doklad — ${search.supplier_hint}` : "Naskenovaný doklad",
        unit_price: Number.isFinite(total) ? total : 0,
      },
    ];
  });
  const [pickerOpen, setPickerOpen] = useState<null | "copy" | "advance">(null);

  const CURRENCIES: { code: string; symbol: string; flag: string; name: string }[] = [
    { code: "EUR", symbol: "€", flag: "🇪🇺", name: "Euro" },
    { code: "CZK", symbol: "Kč", flag: "🇨🇿", name: "Česká koruna" },
    { code: "USD", symbol: "$", flag: "🇺🇸", name: "US dolár" },
    { code: "GBP", symbol: "£", flag: "🇬🇧", name: "Libra" },
    { code: "PLN", symbol: "zł", flag: "🇵🇱", name: "Zlotý" },
    { code: "HUF", symbol: "Ft", flag: "🇭🇺", name: "Forint" },
    { code: "CHF", symbol: "₣", flag: "🇨🇭", name: "Frank" },
  ];

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("customers")
      .select("id, name, ico, dic, ic_dph, street, city, zip, country, email")
      .eq("company_id", cid)
      .order("name")
      .then(({ data }) => setCustomers(data ?? []));
    supabase
      .from("products")
      .select("id, name, unit, unit_price, vat_rate, description")
      .eq("company_id", cid)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setProducts(data ?? []));
    supabase
      .from("companies")
      .select("*")
      .eq("id", cid)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompany(data);
          setForm((f) => ({ ...f, currency: data.default_currency || "EUR" }));
        }
      });
    // Build product_id → stock metadata map
    (async () => {
      const [{ data: si }, { data: lvl }, { data: wh }] = await Promise.all([
        supabase
          .from("stock_items")
          .select("id, product_id, sku, track_stock")
          .eq("company_id", cid),
        supabase.from("stock_levels").select("stock_item_id, quantity").eq("company_id", cid),
        supabase
          .from("warehouses")
          .select("id, name")
          .eq("company_id", cid)
          .eq("active", true)
          .order("created_at")
          .limit(1),
      ]);
      const totals = new Map<string, number>();
      (lvl ?? []).forEach((l: any) =>
        totals.set(l.stock_item_id, (totals.get(l.stock_item_id) ?? 0) + Number(l.quantity)),
      );
      const m: Record<string, StockMeta> = {};
      (si ?? []).forEach((s: any) => {
        if (!s.product_id) return;
        m[s.product_id] = {
          stock_item_id: s.id,
          track_stock: !!s.track_stock,
          available: totals.get(s.id) ?? 0,
          sku: s.sku ?? null,
        };
      });
      setStockByProduct(m);
      if (wh?.[0]) setWarehouseName(wh[0].name);
    })();
  }, []);
  void company;

  // Keyboard shortcuts: Cmd/Ctrl+Enter submit, Cmd/Ctrl+K AI, Cmd/Ctrl+I new item
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("invoice-submit")?.click();
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiOpen(true);
      } else if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        setItems((arr) => [...arr, { ...EMPTY_ITEM }]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totals = useMemo(() => {
    const mode = form.rounding_mode;
    const rc = form.reverse_charge;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let sub = 0,
      vat = 0;
    for (const it of items) {
      let s = Number(it.quantity) * Number(it.unit_price);
      let v = rc ? 0 : s * (Number(it.vat_rate) / 100);
      if (mode === "per_item") {
        s = r2(s);
        v = r2(v);
      }
      sub += s;
      vat += v;
    }
    let total = sub + vat;
    if (mode === "per_document") {
      sub = r2(sub);
      vat = r2(vat);
      total = r2(sub + vat);
    }
    if (mode === "retail") {
      sub = r2(sub);
      vat = r2(vat);
      total = Math.round((sub + vat) * 20) / 20;
    }
    const advance = Number(form.advance_amount) || 0;
    const payable = r2(total - advance);
    return { subtotal: sub, vat_total: vat, total, advance, payable };
  }, [items, form.rounding_mode, form.advance_amount, form.reverse_charge]);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function generateNumber(companyId: string, issueDate: string) {
    // Server-side, transactional (SELECT ... FOR UPDATE) — supports {YYYY} {YY} {MM} {NN}-{NNNN}
    const { data, error } = await supabase.rpc("faktero_next_invoice_number", {
      _company_id: companyId,
      _issue_date: issueDate,
    });
    if (error) throw new Error(error.message);
    const row = data as unknown as { invoice_number: string; sequence_number: number } | null;
    if (!row?.invoice_number) throw new Error("Nepodarilo sa vygenerovať číslo faktúry.");
    return { invoice_number: row.invoice_number, sequence_number: Number(row.sequence_number) };
  }

  async function runAi() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const r = await aiParse({ data: { prompt: aiPrompt } });
      if (r.items.length) {
        setItems(r.items.map((it) => ({ ...EMPTY_ITEM, ...it })));
      }
      if (r.notes) setForm((f) => ({ ...f, notes: r.notes! }));
      if (r.currency) setForm((f) => ({ ...f, currency: r.currency! }));
      if (r.customer_hint) {
        const match = customers.find((c) =>
          c.name.toLowerCase().includes(r.customer_hint!.toLowerCase()),
        );
        if (match) setForm((f) => ({ ...f, customer_id: match.id }));
      }
      toast.success("Položky vyplnené pomocou AI");
      setAiOpen(false);
      setAiPrompt("");
    } catch (e: any) {
      toast.error(e?.message ?? "AI chyba");
    } finally {
      setAiLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const cust = customers.find((c) => c.id === form.customer_id);
    if (!cust) return toast.error("Vyberte odberateľa");
    if (!items.length || !items[0].name) return toast.error("Pridajte aspoň jednu položku");
    // Reverse charge validations
    if (form.reverse_charge && form.reverse_charge_type === "eu_b2b") {
      const vat = (cust.ic_dph || "").trim();
      if (!vat) {
        return toast.error(
          "Pri intrakomunitárnom dodaní (EÚ B2B) je IČ DPH odberateľa povinné. Doplňte ho v karte odberateľa.",
        );
      }
      if (!/^[A-Z]{2}[A-Z0-9]{2,}$/i.test(vat)) {
        return toast.error("IČ DPH odberateľa musí byť v platnom EU formáte (napr. CZ12345678).");
      }
      if (/^SK/i.test(vat)) {
        return toast.error(
          "Pri intrakomunitárnom dodaní musí byť odberateľ z iného členského štátu EÚ (nie SK).",
        );
      }
    }
    // Block submit if any stock-tracked line exceeds available
    const offending = items.find(
      (it) =>
        it.stock_item_id && it._track_stock && Number(it.quantity) > Number(it._available ?? 0),
    );
    if (offending) {
      toast.error(
        `Na sklade nie je dostatok kusov pre „${offending.name}". Dostupné: ${offending._available ?? 0}.`,
      );
      return;
    }
    setSubmitting(true);

    try {
      const { invoice_number, sequence_number } = await generateNumber(cid, form.issue_date);
      const variable_symbol = form.variable_symbol || invoice_number.replace(/\D/g, "");

      const { data: inv, error } = await supabase
        .from("invoices")
        .insert({
          company_id: cid,
          customer_id: cust.id,
          type: form.type,
          status: "issued",
          invoice_number,
          sequence_number,
          variable_symbol,
          constant_symbol: form.constant_symbol || null,
          specific_symbol: form.specific_symbol || null,
          order_number: form.order_number || null,
          delivery_method: form.delivery_method || null,
          rounding_mode: form.rounding_mode,
          reverse_charge: form.reverse_charge,
          reverse_charge_type: form.reverse_charge
            ? form.reverse_charge_type || "domestic_69"
            : null,
          advance_invoice_id: form.advance_invoice_id || null,
          advance_amount: form.advance_amount ? Number(form.advance_amount) : null,
          job_id: form.job_id || null,
          issue_date: form.issue_date,
          delivery_date: form.delivery_date,
          due_date: form.due_date,
          currency: form.currency,
          payment_method: form.payment_method,
          customer_name: cust.name,
          customer_ico: cust.ico,
          customer_dic: cust.dic,
          customer_ic_dph: cust.ic_dph,
          customer_street: cust.street,
          customer_city: cust.city,
          customer_zip: cust.zip,
          customer_country: cust.country,
          customer_email: cust.email,
          subtotal: Number(totals.subtotal.toFixed(2)),
          vat_total: Number(totals.vat_total.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          notes: form.notes,
        })
        .select()
        .single();
      if (error || !inv) {
        const { friendlyError } = await import("@/lib/faktero/plan-error");
        toast.error(friendlyError(error));
        setSubmitting(false);
        return;
      }

      const rows = items.map((it, idx) => {
        const s = Number(it.quantity) * Number(it.unit_price);
        const effRate = form.reverse_charge ? 0 : Number(it.vat_rate);
        const v = s * (effRate / 100);
        return {
          invoice_id: inv.id,
          position: idx,
          name: it.name,
          description: it.description,
          product_id: it.product_id ?? null,
          stock_item_id: it.stock_item_id ?? null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          vat_rate: effRate,
          subtotal: Number(s.toFixed(2)),
          vat_amount: Number(v.toFixed(2)),
          total: Number((s + v).toFixed(2)),
        };
      });
      const { error: e2 } = await supabase.from("invoice_items").insert(rows);
      if (e2) {
        toast.error(e2.message);
        setSubmitting(false);
        return;
      }

      try {
        await triggerEvt({
          data: {
            companyId: cid,
            event: "invoice.created",
            data: {
              invoice_id: inv.id,
              invoice_number: inv.invoice_number,
              status: inv.status,
              total: Number(inv.total),
              currency: inv.currency,
              external_id: inv.external_id ?? null,
              customer_id: inv.customer_id ?? null,
              customer_name: inv.customer_name,
              customer_email: inv.customer_email,
            },
          },
        });
      } catch (e) {
        console.warn("[webhook] invoice.created trigger zlyhal", e);
      }

      toast.success("Faktúra vytvorená");
      navigate({ to: "/faktury/$id", params: { id: inv.id } });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Nová faktúra"
        description="Vytvorte faktúru za menej než 30 sekúnd."
        action={
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-gradient-to-r from-primary/15 to-primary/5 px-3 py-2 text-sm font-medium text-primary hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> AI vytvorenie
            <kbd className="ml-1 hidden rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono sm:inline">
              ⌘K
            </kbd>
          </button>
        }
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto max-w-5xl space-y-6">
          {/* SECTION 1 — basic info */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={FileText} title="Základné údaje" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Odberateľ *</label>
                <CustomerSearch
                  customers={customers}
                  value={form.customer_id}
                  onChange={(id) => setForm({ ...form, customer_id: id })}
                  onCreated={(c) => {
                    setCustomers((prev) => [c, ...prev]);
                    setForm((f) => ({ ...f, customer_id: c.id }));
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Typ dokladu</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="regular">Faktúra</option>
                  <option value="proforma">Zálohová faktúra</option>
                  <option value="credit_note">Dobropis</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Dátum vystavenia
                </label>
                <input
                  type="date"
                  value={form.issue_date}
                  onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Dátum dodania</label>
                <input
                  type="date"
                  value={form.delivery_date}
                  onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Splatnosť</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-1">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            due_date: new Date(Date.now() + d * 86400000)
                              .toISOString()
                              .slice(0, 10),
                          })
                        }
                        className="rounded-md border border-border px-2 text-xs hover:bg-secondary"
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Variabilný symbol
                </label>
                <input
                  value={form.variable_symbol}
                  onChange={(e) => setForm({ ...form, variable_symbol: e.target.value })}
                  placeholder="Automaticky podľa čísla faktúry"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Spôsob platby</label>
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mena</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} {c.symbol} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick action links */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4 text-sm">
              <button
                type="button"
                onClick={() => setPickerOpen("copy")}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <FileDown className="h-4 w-4" /> Načítať položky z dokladu
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen("advance")}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Link2 className="h-4 w-4" />{" "}
                {form.advance_invoice_id ? "Zmeniť zálohovú faktúru" : "Pridať zálohovú faktúru"}
              </button>
              {form.advance_invoice_id && (
                <span className="text-xs text-muted-foreground">
                  Záloha odpočítaná:{" "}
                  <strong>
                    {Number(form.advance_amount).toFixed(2)} {form.currency}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, advance_invoice_id: "", advance_amount: 0 })}
                    className="ml-2 text-destructive hover:underline"
                  >
                    Zrušiť
                  </button>
                </span>
              )}
            </div>
          </section>

          {/* SECTION 1b — payment & symbols */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={CreditCard} title="Platobné údaje a symboly" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Konštantný symbol
                </label>
                <div className="mt-1">
                  <ConstantSymbolCombobox
                    value={form.constant_symbol}
                    onChange={(v) => setForm({ ...form, constant_symbol: v })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Špecifický symbol
                </label>
                <input
                  value={form.specific_symbol}
                  onChange={(e) => setForm({ ...form, specific_symbol: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Číslo objednávky
                </label>
                <input
                  value={form.order_number}
                  onChange={(e) => setForm({ ...form, order_number: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Spôsob dodania</label>
                <select
                  value={form.delivery_method}
                  onChange={(e) => setForm({ ...form, delivery_method: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— nevyplnené —</option>
                  <option value="personal">Osobne</option>
                  <option value="courier">Kuriér</option>
                  <option value="post">Pošta</option>
                  <option value="electronic">Elektronicky</option>
                </select>
              </div>
              <JobPicker
                className="sm:col-span-2"
                value={form.job_id}
                onChange={(v) => setForm((f) => ({ ...f, job_id: v }))}
                customerId={form.customer_id || null}
              />
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Spôsob zaokrúhľovania
                </label>
                <select
                  value={form.rounding_mode}
                  onChange={(e) => setForm({ ...form, rounding_mode: e.target.value as any })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="per_item">Po položkách (zaokrúhli každú položku zvlášť)</option>
                  <option value="per_document">Za celý doklad (zaokrúhli až finálny súčet)</option>
                  <option value="retail">Maloobchod (na 0,05 €, SK pravidlá)</option>
                </select>
              </div>
              <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.reverse_charge}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        reverse_charge: e.target.checked,
                        reverse_charge_type: e.target.checked
                          ? form.reverse_charge_type || "domestic_69"
                          : "",
                      })
                    }
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <strong>Prenos daňovej povinnosti (PDP)</strong>
                    <span className="block text-xs text-muted-foreground">
                      DPH neúčtujem — daň odvedie odberateľ. Sadzba na položkách bude 0 %.
                    </span>
                  </span>
                </label>
                {form.reverse_charge && (
                  <>
                    <select
                      value={form.reverse_charge_type || "domestic_69"}
                      onChange={(e) =>
                        setForm({ ...form, reverse_charge_type: e.target.value as any })
                      }
                      className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="domestic_69">
                        Tuzemský prenos podľa §69 zákona o DPH (stavebné práce, kovový odpad…)
                      </option>
                      <option value="eu_b2b">
                        Intrakomunitárne dodanie do EÚ (B2B, odberateľ má IČ DPH)
                      </option>
                      <option value="export">Vývoz mimo EÚ (oslobodené podľa §47)</option>
                    </select>
                    {form.reverse_charge_type === "eu_b2b" &&
                      (() => {
                        const cust = customers.find((c) => c.id === form.customer_id);
                        const vat = (cust?.ic_dph || "").trim();
                        const ok = vat && /^[A-Z]{2}[A-Z0-9]{2,}$/i.test(vat) && !/^SK/i.test(vat);
                        if (ok) return null;
                        return (
                          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {!cust
                              ? "Vyberte odberateľa s platným IČ DPH z iného členského štátu EÚ."
                              : !vat
                                ? "Odberateľ nemá vyplnené IČ DPH. Pri intrakomunitárnom dodaní je povinné — doplňte ho v karte odberateľa."
                                : /^SK/i.test(vat)
                                  ? "Odberateľ má slovenské IČ DPH. Intrakomunitárne dodanie sa vzťahuje len na iné členské štáty EÚ."
                                  : "IČ DPH odberateľa nie je v platnom EU formáte (napr. CZ12345678)."}
                          </p>
                        );
                      })()}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 2 — items */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Package} title="Položky">
              <ProductSearch
                products={products}
                onPick={(p) => {
                  setItems((arr) => {
                    const next = [...arr];
                    const last = next[next.length - 1];
                    const meta = stockByProduct[p.id];
                    const newItem: Item = {
                      name: p.name,
                      description: p.description ?? "",
                      quantity: 1,
                      unit: p.unit ?? "ks",
                      unit_price: Number(p.unit_price ?? 0),
                      vat_rate: Number(p.vat_rate ?? DEFAULT_VAT_RATE),
                      product_id: p.id,
                      stock_item_id: meta?.stock_item_id ?? null,
                      _track_stock: meta?.track_stock ?? false,
                      _available: meta?.available ?? 0,
                      _sku: meta?.sku ?? null,
                    };
                    if (last && !last.name && !last.unit_price) next[next.length - 1] = newItem;
                    else next.push(newItem);
                    return next;
                  });
                }}
                stockByProduct={stockByProduct}
              />
            </SectionHeader>

            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 font-medium">Názov</th>
                    <th className="py-2 pl-3 font-medium">Mn.</th>
                    <th className="py-2 pl-3 font-medium">MJ</th>
                    <th className="py-2 pl-3 font-medium text-right">Cena</th>
                    <th className="py-2 pl-3 font-medium">DPH</th>
                    <th className="py-2 pl-3 font-medium text-right">Spolu</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        <input
                          value={it.name}
                          onChange={(e) => setItem(idx, { name: e.target.value })}
                          placeholder="Názov položky"
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        />
                        <StockHint item={it} warehouseName={warehouseName} />
                      </td>
                      <td className="py-2 pl-3">
                        <CellNum
                          value={it.quantity}
                          onChange={(v) => setItem(idx, { quantity: v })}
                          w="w-16"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          value={it.unit}
                          onChange={(e) => setItem(idx, { unit: e.target.value })}
                          className="w-14 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <CellNum
                          value={it.unit_price}
                          onChange={(v) => setItem(idx, { unit_price: v })}
                          w="w-24"
                          align="right"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        {form.reverse_charge ? (
                          <span
                            className="inline-block rounded bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900"
                            title="Prenesenie daňovej povinnosti"
                          >
                            PDP
                          </span>
                        ) : (
                          <select
                            value={it.vat_rate}
                            onChange={(e) => setItem(idx, { vat_rate: Number(e.target.value) })}
                            className="rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                          >
                            {SK_VAT_RATES.map((r) => (
                              <option key={r} value={r}>
                                {r}%
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums font-medium">
                        {(
                          it.quantity *
                          it.unit_price *
                          (form.reverse_charge ? 1 : 1 + it.vat_rate / 100)
                        ).toFixed(2)}
                      </td>
                      <td className="py-2 pl-2">
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <div className="space-y-3 md:hidden">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3">
                  <input
                    value={it.name}
                    onChange={(e) => setItem(idx, { name: e.target.value })}
                    placeholder="Názov položky"
                    className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <StockHint item={it} warehouseName={warehouseName} />
                  <div className="grid grid-cols-4 gap-2">
                    <CellNum value={it.quantity} onChange={(v) => setItem(idx, { quantity: v })} />
                    <input
                      value={it.unit}
                      onChange={(e) => setItem(idx, { unit: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <CellNum
                      value={it.unit_price}
                      onChange={(v) => setItem(idx, { unit_price: v })}
                    />
                    {form.reverse_charge ? (
                      <span className="inline-flex items-center justify-center rounded bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">
                        PDP
                      </span>
                    ) : (
                      <select
                        value={it.vat_rate}
                        onChange={(e) => setItem(idx, { vat_rate: Number(e.target.value) })}
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      >
                        {SK_VAT_RATES.map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-medium tabular-nums">
                      {(
                        it.quantity *
                        it.unit_price *
                        (form.reverse_charge ? 1 : 1 + it.vat_rate / 100)
                      ).toFixed(2)}{" "}
                      {form.currency}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Pridať položku
              <kbd className="ml-1 hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono sm:inline">
                ⌘I
              </kbd>
            </button>
          </section>

          {/* SECTION 3 — totals */}
          <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/[0.03] p-5">
            <div className="ml-auto max-w-sm space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bez DPH</span>
                <span className="tabular-nums">
                  {totals.subtotal.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DPH</span>
                <span className="tabular-nums">
                  {totals.vat_total.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Celkom</span>
                <span className="tabular-nums">
                  {totals.total.toFixed(2)} {form.currency}
                </span>
              </div>
              {totals.advance > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Odpočet zálohy</span>
                    <span className="tabular-nums">
                      −{totals.advance.toFixed(2)} {form.currency}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                    <span>K úhrade</span>
                    <span className="tabular-nums text-primary">
                      {totals.payable.toFixed(2)} {form.currency}
                    </span>
                  </div>
                </>
              )}
              {totals.advance === 0 && (
                <div className="flex justify-between text-lg font-bold">
                  <span>K úhrade</span>
                  <span className="tabular-nums text-primary">
                    {totals.total.toFixed(2)} {form.currency}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 4 — advanced */}
          <section className="rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between p-5 text-left"
            >
              <SectionHeader icon={Calendar} title="Rozšírené nastavenia" />
              {advancedOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {advancedOpen && (
              <div className="grid gap-4 p-5 pt-0">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Poznámka</span>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Voliteľná poznámka, ktorá sa zobrazí na faktúre"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}
          </section>

          {/* SECTION 5 — actions */}
          <div className="sticky bottom-4 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-border bg-card/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">⌘↵</kbd> uložiť ·
              <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono">⌘K</kbd> AI
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/faktury" })}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                id="invoice-submit"
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Vystaviť faktúru
              </button>
            </div>
          </div>
        </form>

        {aiOpen && (
          <AiModal
            prompt={aiPrompt}
            setPrompt={setAiPrompt}
            loading={aiLoading}
            onClose={() => setAiOpen(false)}
            onRun={runAi}
          />
        )}

        {pickerOpen && (
          <InvoicePickerModal
            mode={pickerOpen}
            onClose={() => setPickerOpen(null)}
            onPickCopy={(loaded) => {
              setItems(loaded.map((it) => ({ ...EMPTY_ITEM, ...it })));
              toast.success(`Načítaných ${loaded.length} položiek`);
              setPickerOpen(null);
            }}
            onPickAdvance={(inv) => {
              setForm((f) => ({
                ...f,
                advance_invoice_id: inv.id,
                advance_amount: Number(inv.total),
              }));
              toast.success(`Záloha pripojená: ${inv.invoice_number}`);
              setPickerOpen(null);
            }}
          />
        )}
      </PageBody>
    </>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function CellNum({
  value,
  onChange,
  w = "w-20",
  align = "left",
}: {
  value: number;
  onChange: (v: number) => void;
  w?: string;
  align?: "left" | "right";
}) {
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${w} rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums hover:border-input focus:border-input focus:bg-background ${align === "right" ? "text-right" : ""}`}
    />
  );
}

function CustomerSearch({
  customers,
  value,
  onChange,
  onCreated,
}: {
  customers: any[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (c: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = customers.find((c) => c.id === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = q
    ? customers
        .filter((c) =>
          `${c.name} ${c.ico ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 8)
    : customers.slice(0, 8);

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
      >
        <User className="h-4 w-4 text-muted-foreground" />
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.name : "Vyhľadať odberateľa…"}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať podľa mena, IČO, e-mailu…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3">
                <div className="text-sm text-muted-foreground mb-2">Nenašli ste odberateľa?</div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setModalOpen(true);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <UserPlus className="h-4 w-4" /> Vytvoriť nového odberateľa
                </button>
              </li>
            )}
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.ico, c.email].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > 0 && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <UserPlus className="h-4 w-4" /> Vytvoriť nového odberateľa
              </button>
            </div>
          )}
        </div>
      )}
      {modalOpen && (
        <NewCustomerModal
          defaultName={q}
          onClose={() => setModalOpen(false)}
          onCreated={(c) => {
            onCreated(c);
            setModalOpen(false);
            setQ("");
          }}
        />
      )}
    </div>
  );
}

function NewCustomerModal({
  defaultName,
  onClose,
  onCreated,
}: {
  defaultName?: string;
  onClose: () => void;
  onCreated: (c: any) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<null | {
    id: string;
    name: string;
    ico: string | null;
    email: string | null;
  }>(null);
  const findDup = useServerFn(findCustomerByIcoFn);
  const [f, setF] = useState({
    name: defaultName ?? "",
    ico: "",
    dic: "",
    ic_dph: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    zip: "",
    country: "SK",
  });
  useEffect(() => {
    const cid = getActiveCompanyId();
    const ico = f.ico.replace(/\s+/g, "");
    if (!cid || !/^\d{6,8}$/.test(ico)) {
      setDup(null);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const r = await findDup({ data: { ico, companyId: cid } });
        setDup(r.match ?? null);
      } catch {
        setDup(null);
      }
    }, 500);
    return () => clearTimeout(h);
  }, [f.ico]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error("Zadajte názov firmy");
    if (!f.ico.trim()) return toast.error("Zadajte IČO");
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Nie je vybraná firma");
    if (dup) {
      toast.error(`Odberateľ s týmto IČO už existuje: ${dup.name}`);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        company_id: cid,
        name: f.name.trim(),
        ico: f.ico.trim(),
        dic: f.dic.trim() || null,
        ic_dph: f.ic_dph.trim() || null,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        street: f.street.trim() || null,
        city: f.city.trim() || null,
        zip: f.zip.trim() || null,
        country: f.country.trim() || "SK",
      })
      .select("id, name, ico, dic, ic_dph, street, city, zip, country, email")
      .single();
    setSaving(false);
    if (error || !data) return toast.error(error?.message ?? "Nepodarilo sa vytvoriť odberateľa");
    toast.success("Odberateľ bol vytvorený.");
    onCreated(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Nový odberateľ</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4 p-5">
          {dup && (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
              Odberateľ s týmto IČO už existuje: <strong>{dup.name}</strong>.
              <button
                type="button"
                onClick={() => onCreated(dup)}
                className="ml-2 underline hover:no-underline"
              >
                Použiť existujúceho
              </button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Názov firmy *">
              <CompanyNameAutocomplete
                autoFocus
                value={f.name}
                onChange={(v) => setF((p) => ({ ...p, name: v }))}
                onPick={(d, { auto }) =>
                  setF((p) =>
                    mergeCompanyAutofill(p, d, { mode: auto ? "fill-empty" : "overwrite" }),
                  )
                }
                className={modalInput}
              />
            </Field>
            <Field label="IČO *">
              <div className="flex -space-x-px items-start">
                <input
                  value={f.ico}
                  onChange={(e) => setF({ ...f, ico: e.target.value })}
                  className={`${modalInput} rounded-l-md focus:z-10`}
                />
                <IcoLookupButton
                  ico={f.ico}
                  onResult={(d, { auto }) =>
                    setF((prev) =>
                      mergeCompanyAutofill(prev, d, { mode: auto ? "fill-empty" : "overwrite" }),
                    )
                  }
                />
              </div>
            </Field>
            <Field label="DIČ">
              <input
                value={f.dic}
                onChange={(e) => setF({ ...f, dic: e.target.value })}
                className={modalInput}
              />
            </Field>
            <Field label="IČ DPH">
              <input
                value={f.ic_dph}
                onChange={(e) => setF({ ...f, ic_dph: e.target.value })}
                className={modalInput}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
                className={modalInput}
              />
            </Field>
            <Field label="Telefón">
              <input
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
                className={modalInput}
              />
            </Field>
            <Field label="Ulica" className="sm:col-span-2">
              <input
                value={f.street}
                onChange={(e) => setF({ ...f, street: e.target.value })}
                className={modalInput}
              />
            </Field>
            <Field label="Mesto">
              <input
                value={f.city}
                onChange={(e) => setF({ ...f, city: e.target.value })}
                className={modalInput}
              />
            </Field>
            <Field label="PSČ">
              <input
                value={f.zip}
                onChange={(e) => setF({ ...f, zip: e.target.value })}
                className={modalInput}
              />
            </Field>
            <Field label="Krajina">
              <input
                value={f.country}
                onChange={(e) => setF({ ...f, country: e.target.value })}
                className={modalInput}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Vytvoriť odberateľa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const modalInput =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ProductSearch({
  products,
  onPick,
  stockByProduct,
}: {
  products: any[];
  onPick: (p: any) => void;
  stockByProduct: Record<string, StockMeta>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = q
    ? products.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : products.slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
      >
        <Search className="h-3.5 w-3.5" /> Z katalógu
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať produkt…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Žiadne produkty</li>
            )}
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="flex flex-col">
                    <span>{p.name}</span>
                    {stockByProduct[p.id]?.track_stock && (
                      <span
                        className={`text-[11px] ${stockByProduct[p.id].available <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        Sklad: {stockByProduct[p.id].available} {p.unit ?? "ks"}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {Number(p.unit_price).toFixed(2)} €
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StockHint({ item, warehouseName }: { item: Item; warehouseName: string }) {
  if (!item.stock_item_id || !item._track_stock) return null;
  const available = Number(item._available ?? 0);
  const insufficient = Number(item.quantity) > available;
  return (
    <div
      className={`mt-1 inline-flex items-center gap-1 text-[11px] ${insufficient ? "text-destructive" : "text-muted-foreground"}`}
    >
      {insufficient && <AlertTriangle className="h-3 w-3" />}
      {insufficient ? (
        <>
          Na sklade nie je dostatok kusov. Dostupné: {available}
          {warehouseName ? ` · ${warehouseName}` : ""}
        </>
      ) : (
        <>
          Sklad: {available} {item.unit}
          {warehouseName ? ` · ${warehouseName}` : ""}
          {item._sku ? ` · ${item._sku}` : ""}
        </>
      )}
    </div>
  );
}

function AiModal({
  prompt,
  setPrompt,
  loading,
  onClose,
  onRun,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onRun: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/60 p-4 pt-24 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI vytvorenie faktúry</h3>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Opíšte faktúru bežnou rečou — AI vyplní položky, ceny a DPH.
        </p>
        <textarea
          autoFocus
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun();
          }}
          placeholder="Napr. 10 hodín konzultácií po 60 € pre Acme s.r.o. + licencia softvéru 240 € s DPH"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            <Command className="inline h-3 w-3" />↵ spustiť
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              type="button"
              onClick={onRun}
              disabled={loading || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Vygenerovať
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoicePickerModal({
  mode,
  onClose,
  onPickCopy,
  onPickAdvance,
}: {
  mode: "copy" | "advance";
  onClose: () => void;
  onPickCopy: (items: Partial<Item>[]) => void;
  onPickAdvance: (inv: { id: string; invoice_number: string; total: number }) => void;
}) {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    let query = supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, total, currency, issue_date, type, status")
      .eq("company_id", cid)
      .order("issue_date", { ascending: false })
      .limit(50);
    if (mode === "advance") query = query.eq("type", "proforma");
    query.then(({ data }) => {
      setList(data ?? []);
      setLoading(false);
    });
  }, [mode]);

  const filtered = q
    ? list.filter((i) =>
        `${i.invoice_number} ${i.customer_name ?? ""}`.toLowerCase().includes(q.toLowerCase()),
      )
    : list;

  async function handlePick(inv: any) {
    if (mode === "advance") {
      onPickAdvance({ id: inv.id, invoice_number: inv.invoice_number, total: Number(inv.total) });
      return;
    }
    const { data } = await supabase
      .from("invoice_items")
      .select("name, description, quantity, unit, unit_price, vat_rate")
      .eq("invoice_id", inv.id)
      .order("position");
    onPickCopy((data ?? []) as Partial<Item>[]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">
            {mode === "copy" ? "Načítať položky z dokladu" : "Vybrať zálohovú faktúru"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať podľa čísla alebo odberateľa…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <ul className="max-h-96 overflow-auto">
          {loading && <li className="p-4 text-sm text-muted-foreground">Načítavam…</li>}
          {!loading && filtered.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              {mode === "advance" ? "Žiadne zálohové faktúry." : "Žiadne faktúry."}
            </li>
          )}
          {filtered.map((inv) => (
            <li key={inv.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => handlePick(inv)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/60"
              >
                <div>
                  <div className="font-medium">{inv.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {inv.customer_name} · {inv.issue_date}
                  </div>
                </div>
                <div className="tabular-nums font-medium">
                  {Number(inv.total).toFixed(2)} {inv.currency}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
