import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Trash2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createReservationsFromQuote } from "@/lib/faktero/reservations.functions";
import { nextQuoteNumberFn } from "@/lib/faktero/quote.functions";
import { NewCustomerModal } from "@/components/faktero/NewCustomerModal";
import { JobPicker } from "@/components/faktero/JobPicker";
import { getPriceContext } from "@/lib/faktero/ceny.functions";
import { cenaZPodkladov, type Podklady } from "@/lib/faktero/ceny";
import { MENY } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/ponuky/nova")({
  head: () => ({ meta: [{ title: "Nová cenová ponuka — Faktero" }] }),
  component: NewQuote,
});

type Item = {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  /** Väzba na katalóg — z nej žije cenník aj rezervácia tovaru. */
  product_id?: string | null;
  /** Do ceny siahol človek, cenník ju už neprepíše. */
  _cena_rucne?: boolean;
  _dovod?: string;
};
const EMPTY: Item = { name: "", quantity: 1, unit: "ks", unit_price: 0, vat_rate: 23 };

function NewQuote() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({
    customer_id: "",
    issue_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: "EUR",
    notes: "",
    job_id: "",
  });
  const [items, setItems] = useState<Item[]>([{ ...EMPTY }]);
  const [produkty, setProdukty] = useState<any[]>([]);
  const [podklady, setPodklady] = useState<Podklady | null>(null);
  const nacitajCennik = useServerFn(getPriceContext);
  const cennikPrvyRaz = useRef(true);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [reserveStock, setReserveStock] = useState(false);
  const reserveFn = useServerFn(createReservationsFromQuote);
  const dalsieCislo = useServerFn(nextQuoteNumberFn);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("customers")
      .select("id, name, ico, dic, ic_dph, street, city, zip, country, email")
      .eq("company_id", cid)
      .then(({ data }) => setCustomers(data ?? []));
    supabase
      .from("products")
      .select("id, name, unit, unit_price, vat_rate")
      .eq("company_id", cid)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => setProdukty(data ?? []));
  }, []);

  /* Cenník sa načíta pre vybraného odberateľa — dohodnuté ceny a akcie
     patria na ponuku rovnako ako na faktúru. */
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !form.issue_date) return;
    let zrusene = false;
    nacitajCennik({
      data: { company_id: cid, customer_id: form.customer_id || null, datum: form.issue_date },
    })
      .then((p: any) => {
        if (!zrusene) setPodklady(p);
      })
      .catch(() => {
        if (!zrusene) setPodklady(null);
      });
    return () => {
      zrusene = true;
    };
  }, [form.customer_id, form.issue_date, nacitajCennik]);

  // Po zmene odberateľa sa prepočítajú riadky z katalógu, do ktorých sa nesiahlo.
  useEffect(() => {
    if (!podklady) return;
    if (cennikPrvyRaz.current) {
      cennikPrvyRaz.current = false;
      return;
    }
    setItems((arr) =>
      arr.map((it) => {
        if (!it.product_id || it._cena_rucne) return it;
        const produkt = produkty.find((p) => p.id === it.product_id);
        if (!produkt) return it;
        const r = cenaZPodkladov(
          podklady,
          { id: it.product_id, unit_price: produkt.unit_price },
          Number(it.quantity) || 0,
        );
        return { ...it, unit_price: r.cena, _dovod: r.zdroj === "zakladna" ? undefined : r.dovod };
      }),
    );
  }, [podklady, produkty]);

  /** Vloží položku z katalógu aj s cenou pre tohto odberateľa. */
  function zKatalogu(produktId: string) {
    const p = produkty.find((x) => x.id === produktId);
    if (!p) return;
    const r = podklady ? cenaZPodkladov(podklady, { id: p.id, unit_price: p.unit_price }, 1) : null;
    const novy: Item = {
      name: p.name,
      quantity: 1,
      unit: p.unit ?? "ks",
      unit_price: r ? r.cena : Number(p.unit_price),
      vat_rate: Number(p.vat_rate ?? 23),
      product_id: p.id,
      _dovod: r && r.zdroj !== "zakladna" ? r.dovod : undefined,
    };
    setItems((arr) => {
      const posledny = arr[arr.length - 1];
      if (posledny && !posledny.name && !posledny.unit_price) return [...arr.slice(0, -1), novy];
      return [...arr, novy];
    });
  }

  const totals = useMemo(() => {
    let sub = 0,
      vat = 0;
    for (const it of items) {
      const s = Number(it.quantity) * Number(it.unit_price);
      sub += s;
      vat += s * (Number(it.vat_rate) / 100);
    }
    return { subtotal: sub, vat_total: vat, total: sub + vat };
  }, [items]);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((arr) =>
      arr.map((it, idx) => {
        if (idx !== i) return it;
        const novy = { ...it, ...patch };
        // Množstevná cena sa mení s množstvom — presne ako na faktúre.
        if (patch.quantity != null && novy.product_id && !novy._cena_rucne && podklady) {
          const produkt = produkty.find((p) => p.id === novy.product_id);
          if (produkt) {
            const r = cenaZPodkladov(
              podklady,
              { id: novy.product_id, unit_price: produkt.unit_price },
              Number(novy.quantity) || 0,
            );
            novy.unit_price = r.cena;
            novy._dovod = r.zdroj === "zakladna" ? undefined : r.dovod;
          }
        }
        return novy;
      }),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return;
    const cust = customers.find((c) => c.id === form.customer_id);
    if (!cust) return toast.error("Vyberte odberateľa");
    const { quote_number } = await dalsieCislo({ data: { company_id: cid } });
    const { data: q, error } = await supabase
      .from("quotes")
      .insert({
        company_id: cid,
        customer_id: cust.id,
        status: "draft",
        quote_number,
        issue_date: form.issue_date,
        valid_until: form.valid_until,
        currency: form.currency,
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
        reserve_stock: reserveStock,
        notes: form.notes,
        job_id: form.job_id || null,
      })
      .select()
      .single();
    if (error || !q) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      return toast.error(friendlyError(error));
    }

    const rows = items.map((it, i) => {
      const s = Number(it.quantity) * Number(it.unit_price);
      const v = s * (Number(it.vat_rate) / 100);
      return {
        quote_id: q.id,
        position: i,
        product_id: it.product_id ?? null,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        subtotal: +s.toFixed(2),
        vat_amount: +v.toFixed(2),
        total: +(s + v).toFixed(2),
      };
    });
    const { error: e2 } = await supabase.from("quote_items").insert(rows);
    if (e2) return toast.error(e2.message);
    if (reserveStock) {
      try {
        const r = await reserveFn({ data: { company_id: cid, quote_id: q.id } });
        if ((r as any).created > 0) toast.success(`Rezervovaných ${(r as any).created} položiek.`);
        else if ((r as any).reason === "no_warehouse")
          toast.warning("Chýba aktívny sklad — rezervácie neboli vytvorené.");
        else toast.info("Rezervácia: žiadne položky nebolo možné napárovať na sklad.");
      } catch (err: any) {
        toast.error(`Rezervácia zlyhala: ${err?.message ?? err}`);
      }
    }
    toast.success("Ponuka vytvorená");
    navigate({ to: "/ponuky/$id", params: { id: q.id } });
  }

  return (
    <>
      <PageHeader title="Nová cenová ponuka" description="Vyplňte údaje a pridajte položky." />
      <PageBody>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="text-sm font-medium">Odberateľ *</span>
              <div className="mt-1 flex gap-2">
                <select
                  required
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Vyberte odberateľa…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setNewCustOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
                >
                  <UserPlus className="h-4 w-4" /> Nový
                </button>
              </div>
            </label>
            <In
              label="Dátum vystavenia"
              type="date"
              required
              value={form.issue_date}
              onChange={(v) => setForm({ ...form, issue_date: v })}
            />
            <In
              label="Platnosť do"
              type="date"
              required
              value={form.valid_until}
              onChange={(v) => setForm({ ...form, valid_until: v })}
            />
            {/*
              Mena bola voľný text, takže sa do databázy dalo napísať čokoľvek
              — a nezmyselný kód potom zhodil formátovanie na každej stránke,
              kde sa taká ponuka objavila. Rovnaký výber ako na faktúre.
            */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mena</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {MENY.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.flag} {m.code} {m.symbol} — {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Položky</h3>
              <div className="flex items-center gap-2">
                {produkty.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) zKatalogu(e.target.value);
                    }}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">Z katalógu…</option>
                    {produkty.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {Number(p.unit_price).toFixed(2)} €
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setItems([...items, { ...EMPTY }])}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5" /> Pridať
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[2fr_80px_80px_100px_80px_120px_auto] sm:items-end"
                >
                  <In label="Názov" value={it.name} onChange={(v) => setItem(idx, { name: v })} />
                  <In
                    label="Mn."
                    type="number"
                    value={String(it.quantity)}
                    onChange={(v) => setItem(idx, { quantity: Number(v) })}
                  />
                  <In label="MJ" value={it.unit} onChange={(v) => setItem(idx, { unit: v })} />
                  <div>
                    <In
                      label="Cena"
                      type="number"
                      value={String(it.unit_price)}
                      onChange={(v) => setItem(idx, { unit_price: Number(v), _cena_rucne: true })}
                    />
                    {it._dovod && (
                      <div className="mt-1 text-[10px] leading-tight text-emerald-600">
                        {it._dovod}
                      </div>
                    )}
                  </div>
                  <In
                    label="DPH %"
                    type="number"
                    value={String(it.vat_rate)}
                    onChange={(v) => setItem(idx, { vat_rate: Number(v) })}
                  />
                  <div className="text-right text-sm font-medium">
                    {(it.quantity * it.unit_price * (1 + it.vat_rate / 100)).toFixed(2)}{" "}
                    {form.currency}
                  </div>
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 text-right text-sm">
              <div>
                Bez DPH:{" "}
                <span className="font-medium">
                  {totals.subtotal.toFixed(2)} {form.currency}
                </span>
              </div>
              <div>
                DPH:{" "}
                <span className="font-medium">
                  {totals.vat_total.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="text-lg font-semibold">
                Spolu: {totals.total.toFixed(2)} {form.currency}
              </div>
            </div>
          </div>
          <JobPicker
            className="rounded-xl border border-border bg-card p-5"
            value={form.job_id}
            onChange={(v) => setForm((f) => ({ ...f, job_id: v }))}
            customerId={form.customer_id || null}
            label="Zákazka (prenesie sa na faktúru pri premene ponuky)"
          />
          <label className="block rounded-xl border border-border bg-card p-5">
            <span className="text-sm font-medium">Poznámka</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <input
              type="checkbox"
              checked={reserveStock}
              onChange={(e) => setReserveStock(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <div className="font-medium">Rezervovať tovar na sklade</div>
              <div className="text-xs text-muted-foreground">
                Vytvorí aktívne rezervácie pre napárované položky. Platnosť sa nastaví podľa dátumu
                „Platnosť do“.
              </div>
            </span>
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Vytvoriť ponuku
            </button>
          </div>
        </form>
        {newCustOpen && (
          <NewCustomerModal
            onClose={() => setNewCustOpen(false)}
            onCreated={(c) => {
              setCustomers((prev) => [...prev, c]);
              setForm((prev) => ({ ...prev, customer_id: c.id }));
              setNewCustOpen(false);
            }}
          />
        )}
      </PageBody>
    </>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
