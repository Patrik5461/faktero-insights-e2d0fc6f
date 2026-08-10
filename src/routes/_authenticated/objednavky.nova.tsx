import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { JobPicker } from "@/components/faktero/JobPicker";
import { getSalesOrder, saveSalesOrder } from "@/lib/faktero/sales-orders.functions";
import { getPriceContext } from "@/lib/faktero/ceny.functions";
import { cenaZPodkladov, type Podklady } from "@/lib/faktero/ceny";
import { suctyObjednavky } from "@/lib/faktero/objednavky-odberatel";
import { SK_VAT_RATES, DEFAULT_VAT_RATE } from "@/lib/faktero/vat-rates";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/objednavky/nova")({
  head: () => ({ meta: [{ title: "Nová objednávka — Faktero" }] }),
  /**
   * Úprava existujúcej objednávky používa ten istý formulár. Keď parameter
   * nie je, musí sa vrátiť prázdny objekt — inak router vyžaduje `search` pri
   * každom odkaze na „novú objednávku".
   */
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" && s.id ? { id: s.id } : {},
  component: NewOrder,
});

type Polozka = {
  product_id?: string | null;
  name: string;
  description?: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  vat_rate: number;
  _dovod?: string;
  _cena_rucne?: boolean;
};

const PRAZDNA: Polozka = {
  name: "",
  quantity: 1,
  unit: "ks",
  unit_price: 0,
  vat_rate: DEFAULT_VAT_RATE,
};

const pole = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const popis = "mb-1 block text-xs font-medium text-muted-foreground";

/** Dnešok v miestnom čase — `toISOString()` by po polnoci vrátil včerajšok. */
function dnesLokalne(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function suma(n: unknown) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
}

function NewOrder() {
  const nav = useNavigate();
  const { id } = Route.useSearch();
  const uloz = useServerFn(saveSalesOrder);
  const nacitajObjednavku = useServerFn(getSalesOrder);
  const nacitajCennik = useServerFn(getPriceContext);

  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [podklady, setPodklady] = useState<Podklady | null>(null);
  const [saving, setSaving] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitava, setNacitava] = useState(!!id);

  const [form, setForm] = useState({
    customer_id: "",
    customer_order_number: "",
    order_date: dnesLokalne(),
    requested_date: "",
    job_id: "",
    reserve_stock: false,
    note: "",
  });
  const [polozky, setPolozky] = useState<Polozka[]>([{ ...PRAZDNA }]);

  const cid = useMemo(() => getActiveCompanyId(), []);

  useEffect(() => {
    if (!cid) return;
    supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => setCustomers(data ?? []));
    supabase
      .from("products")
      .select("id, name, unit, unit_price, vat_rate, description")
      .eq("company_id", cid)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setProducts(data ?? []));
  }, [cid]);

  // Úprava existujúcej objednávky
  useEffect(() => {
    if (!cid || !id) return;
    nacitajObjednavku({ data: { company_id: cid, id } })
      .then((o: any) => {
        setForm({
          customer_id: o.customer_id ?? "",
          customer_order_number: o.customer_order_number ?? "",
          order_date: o.order_date,
          requested_date: o.requested_date ?? "",
          job_id: o.job_id ?? "",
          reserve_stock: !!o.reserve_stock,
          note: o.note ?? "",
        });
        setPolozky(
          (o.sales_order_items ?? []).map((p: any) => ({
            product_id: p.product_id,
            name: p.name,
            description: p.description ?? "",
            quantity: Number(p.quantity),
            unit: p.unit,
            unit_price: Number(p.unit_price),
            vat_rate: Number(p.vat_rate),
            // Ceny už raz dohodnuté sa cenníkom neprepisujú.
            _cena_rucne: true,
          })),
        );
      })
      .catch((e: any) => setChyba(e?.message ?? "Objednávku sa nepodarilo načítať"))
      .finally(() => setNacitava(false));
  }, [cid, id, nacitajObjednavku]);

  // Podklady cenníka pre odberateľa a dátum objednávky
  useEffect(() => {
    if (!cid || !form.order_date) return;
    let zrusene = false;
    nacitajCennik({
      data: { company_id: cid, customer_id: form.customer_id || null, datum: form.order_date },
    })
      .then((p: any) => !zrusene && setPodklady(p))
      .catch(() => !zrusene && setPodklady(null));
    return () => {
      zrusene = true;
    };
  }, [cid, form.customer_id, form.order_date, nacitajCennik]);

  const cenaProduktu = useCallback(
    (productId: string, mnozstvo: number | string) => {
      const produkt = products.find((p) => p.id === productId);
      if (!produkt) return null;
      if (!podklady) return { cena: Number(produkt.unit_price ?? 0), dovod: undefined as string | undefined };
      const r = cenaZPodkladov(podklady, { id: productId, unit_price: produkt.unit_price }, mnozstvo);
      return { cena: r.cena, dovod: r.zdroj === "zakladna" ? undefined : r.dovod };
    },
    [podklady, products],
  );

  function nastavPolozku(i: number, patch: Partial<Polozka>) {
    setPolozky((arr) =>
      arr.map((p, j) => {
        if (i !== j) return p;
        const novy = { ...p, ...patch };
        // Zmena množstva môže preklopiť riadok do inej množstevnej ceny.
        if (patch.quantity !== undefined && patch.unit_price === undefined && novy.product_id && !novy._cena_rucne) {
          const c = cenaProduktu(novy.product_id, patch.quantity);
          if (c) return { ...novy, unit_price: c.cena, _dovod: c.dovod };
        }
        return novy;
      }),
    );
  }

  function pridajProdukt(productId: string) {
    const produkt = products.find((p) => p.id === productId);
    if (!produkt) return;
    const c = cenaProduktu(productId, 1);
    const nova: Polozka = {
      product_id: produkt.id,
      name: produkt.name,
      description: produkt.description ?? "",
      quantity: 1,
      unit: produkt.unit ?? "ks",
      unit_price: c?.cena ?? Number(produkt.unit_price ?? 0),
      vat_rate: Number(produkt.vat_rate ?? DEFAULT_VAT_RATE),
      _dovod: c?.dovod,
    };
    setPolozky((arr) => {
      const posl = arr[arr.length - 1];
      if (posl && !posl.name && !Number(posl.unit_price)) return [...arr.slice(0, -1), nova];
      return [...arr, nova];
    });
  }

  const sucty = useMemo(() => suctyObjednavky(polozky as any), [polozky]);

  async function odosli(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    setChyba(null);
    const platne = polozky.filter((p) => p.name.trim() && Number(p.quantity) > 0);
    if (!platne.length) {
      setChyba("Objednávka musí mať aspoň jednu položku s názvom a množstvom.");
      return;
    }
    setSaving(true);
    try {
      const r: any = await uloz({
        data: {
          company_id: cid,
          id: id || undefined,
          customer_id: form.customer_id || null,
          customer_order_number: form.customer_order_number || null,
          order_date: form.order_date,
          requested_date: form.requested_date || null,
          job_id: form.job_id || null,
          reserve_stock: form.reserve_stock,
          note: form.note || null,
          polozky: platne.map((p) => ({
            product_id: p.product_id ?? null,
            name: p.name.trim(),
            description: p.description || null,
            quantity: p.quantity,
            unit: p.unit || "ks",
            unit_price: p.unit_price === "" ? 0 : p.unit_price,
            vat_rate: p.vat_rate,
          })),
        },
      });
      nav({ to: "/objednavky/$id", params: { id: r.id } });
    } catch (err: any) {
      setChyba(err?.message ?? "Objednávku sa nepodarilo uložiť");
    } finally {
      setSaving(false);
    }
  }

  if (nacitava) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title={id ? "Upraviť objednávku" : "Nová prijatá objednávka"}
        description="Číslo pridelí Faktero. Objednávku vybavíte faktúrou — aj po častiach."
        action={
          <Link
            to="/objednavky"
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={odosli} className="space-y-4">
          {chyba && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {chyba}
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>Odberateľ</label>
                <select
                  className={pole}
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                >
                  <option value="">— bez odberateľa —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={popis}>Číslo objednávky u odberateľa</label>
                <input
                  className={pole}
                  value={form.customer_order_number}
                  onChange={(e) => setForm({ ...form, customer_order_number: e.target.value })}
                  placeholder="Napíše sa na faktúru"
                />
              </div>
              <div>
                <label className={popis}>Dátum objednávky</label>
                <input
                  type="date"
                  required
                  className={pole}
                  value={form.order_date}
                  onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>Požadovaný termín dodania</label>
                <input
                  type="date"
                  min={form.order_date}
                  className={pole}
                  value={form.requested_date}
                  onChange={(e) => setForm({ ...form, requested_date: e.target.value })}
                />
              </div>
              <JobPicker
                className="sm:col-span-2"
                label="Zákazka"
                value={form.job_id}
                onChange={(v) => setForm({ ...form, job_id: v || "" })}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Položky</div>
              {products.length > 0 && (
                <select
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) pridajProdukt(e.target.value);
                  }}
                >
                  <option value="">+ pridať z katalógu</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {suma(p.unit_price)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Názov</th>
                    <th className="py-2 pl-3 text-left font-medium">Množstvo</th>
                    <th className="py-2 pl-3 text-left font-medium">MJ</th>
                    <th className="py-2 pl-3 text-right font-medium">Cena bez DPH</th>
                    <th className="py-2 pl-3 text-left font-medium">DPH</th>
                    <th className="py-2 pl-3 text-right font-medium">Spolu</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {polozky.map((p, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2">
                        <input
                          className="w-full min-w-40 rounded-md border border-transparent bg-transparent px-2 py-1.5 hover:border-input focus:border-input focus:bg-background"
                          value={p.name}
                          onChange={(e) => nastavPolozku(i, { name: e.target.value })}
                          placeholder="Názov položky"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          className="w-20 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-right hover:border-input focus:border-input focus:bg-background"
                          value={p.quantity}
                          onChange={(e) => nastavPolozku(i, { quantity: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          className="w-14 rounded-md border border-transparent bg-transparent px-2 py-1.5 hover:border-input focus:border-input focus:bg-background"
                          value={p.unit}
                          onChange={(e) => nastavPolozku(i, { unit: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-24 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-right hover:border-input focus:border-input focus:bg-background"
                          value={p.unit_price}
                          onChange={(e) =>
                            nastavPolozku(i, { unit_price: e.target.value, _cena_rucne: true })
                          }
                        />
                        {p._dovod && (
                          <div className="pr-2 text-right text-[10px] leading-tight text-emerald-600">
                            {p._dovod}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pl-3">
                        <select
                          className="rounded-md border border-transparent bg-transparent px-2 py-1.5 hover:border-input focus:border-input focus:bg-background"
                          value={p.vat_rate}
                          onChange={(e) => nastavPolozku(i, { vat_rate: Number(e.target.value) })}
                        >
                          {SK_VAT_RATES.map((r) => (
                            <option key={r} value={r}>
                              {r} %
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {suma(Number(p.quantity) * Number(p.unit_price))}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          type="button"
                          aria-label="Odobrať položku"
                          onClick={() => setPolozky(polozky.filter((_, j) => j !== i))}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => setPolozky([...polozky, { ...PRAZDNA }])}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Pridať riadok
            </button>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Základ</span>
                  <span className="tabular-nums">{suma(sucty.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>DPH</span>
                  <span className="tabular-nums">{suma(sucty.vat_total)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-medium">
                  <span>Spolu</span>
                  <span className="tabular-nums">{suma(sucty.total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.reserve_stock}
                onChange={(e) => setForm({ ...form, reserve_stock: e.target.checked })}
              />
              Po potvrdení rezervovať tovar na sklade
            </label>
            <label className={`${popis} mt-4`}>Poznámka</label>
            <textarea
              className={`${pole} min-h-20`}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Ukladám…" : id ? "Uložiť zmeny" : "Založiť objednávku"}
          </button>
        </form>
      </PageBody>
    </>
  );
}
