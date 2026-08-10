import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  deletePriceGroup,
  deleteProductPrice,
  listPriceGroups,
  listProductPrices,
  savePriceGroup,
  saveProductPrice,
} from "@/lib/faktero/ceny.functions";
import { cislo } from "@/lib/faktero/ceny";
import { Plus, Pencil, Trash2, Tag, Percent } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ceny/")({
  head: () => ({ meta: [{ title: "Cenník — Faktero" }] }),
  component: CennikPage,
});

function suma(n: unknown) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(cislo(n));
}

const pole = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const popis = "mb-1 block text-xs font-medium text-muted-foreground";

function CennikPage() {
  const nacitajSkupiny = useServerFn(listPriceGroups);
  const nacitajCeny = useServerFn(listProductPrices);
  const ulozSkupinu = useServerFn(savePriceGroup);
  const zmazSkupinu = useServerFn(deletePriceGroup);
  const ulozCenu = useServerFn(saveProductPrice);
  const zmazCenu = useServerFn(deleteProductPrice);

  const [skupiny, setSkupiny] = useState<any[]>([]);
  const [ceny, setCeny] = useState<any[]>([]);
  const [produkty, setProdukty] = useState<any[]>([]);
  const [odberatelia, setOdberatelia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [skupinaForm, setSkupinaForm] = useState<any | null>(null);
  const [cenaForm, setCenaForm] = useState<any | null>(null);

  const cid = useMemo(() => getActiveCompanyId(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      nacitajSkupiny({ data: { company_id: cid } }),
      nacitajCeny({ data: { company_id: cid } }),
      supabase
        .from("products")
        .select("id, name, unit, unit_price")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("name")
        .limit(2000),
      supabase
        .from("customers")
        .select("id, name")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("name")
        .limit(2000),
    ])
      .then(([s, c, p, o]: any[]) => {
        setSkupiny(s ?? []);
        setCeny(c ?? []);
        setProdukty(p.data ?? []);
        setOdberatelia(o.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [cid, nacitajSkupiny, nacitajCeny]);

  useEffect(nacitaj, [nacitaj]);

  async function ulozSkupinuKlik(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    try {
      await ulozSkupinu({
        data: {
          company_id: cid,
          id: skupinaForm.id || undefined,
          name: skupinaForm.name ?? "",
          discount_percent: skupinaForm.discount_percent === "" ? 0 : skupinaForm.discount_percent,
          note: skupinaForm.note || null,
        },
      });
      setSkupinaForm(null);
      nacitaj();
      toast.success("Cenová skupina uložená");
    } catch (err: any) {
      toast.error(err?.message ?? "Skupinu sa nepodarilo uložiť");
    }
  }

  async function ulozCenuKlik(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    try {
      await ulozCenu({
        data: {
          company_id: cid,
          id: cenaForm.id || undefined,
          product_id: cenaForm.product_id,
          customer_id: cenaForm.adresat === "odberatel" ? cenaForm.customer_id : null,
          price_group_id: cenaForm.adresat === "skupina" ? cenaForm.price_group_id : null,
          unit_price: cenaForm.unit_price === "" ? 0 : cenaForm.unit_price,
          min_quantity: cenaForm.min_quantity === "" ? 0 : cenaForm.min_quantity,
          note: cenaForm.note || null,
        },
      });
      setCenaForm(null);
      nacitaj();
      toast.success("Cena uložená");
    } catch (err: any) {
      toast.error(err?.message ?? "Cenu sa nepodarilo uložiť");
    }
  }

  const maProdukty = produkty.length > 0;

  return (
    <>
      <PageHeader
        title="Cenník"
        description="Dohodnuté ceny a zľavy pre odberateľov. Doklad ich doplní sám podľa toho, komu ho vystavujete."
        action={
          <div className="flex gap-2">
            <Link
              to="/ceny/akcie"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <Percent className="h-4 w-4" /> Cenové akcie
            </Link>
            <button
              type="button"
              disabled={!maProdukty}
              onClick={() =>
                setCenaForm({
                  adresat: skupiny.length ? "skupina" : "odberatel",
                  product_id: produkty[0]?.id ?? "",
                  price_group_id: skupiny[0]?.id ?? "",
                  customer_id: odberatelia[0]?.id ?? "",
                  unit_price: "",
                  min_quantity: 0,
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Nová cena
            </button>
          </div>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : (
          <div className="space-y-6">
            {!maProdukty && (
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                Cenník pracuje s produktmi z katalógu. Najprv založte aspoň jeden{" "}
                <Link to="/produkty" className="text-primary underline">
                  produkt alebo službu
                </Link>
                .
              </div>
            )}

            {/* Cenové skupiny */}
            <section className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Cenové skupiny</h2>
                  <p className="text-xs text-muted-foreground">
                    Spoločná zľava pre skupinu odberateľov — veľkoobchod, stáli zákazníci.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSkupinaForm({ name: "", discount_percent: 0 })}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Nová skupina
                </button>
              </div>
              {skupiny.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Zatiaľ žiadna cenová skupina.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left font-medium">Názov</th>
                      <th className="px-4 py-2 text-right font-medium">Zľava</th>
                      <th className="px-4 py-2 text-right font-medium">Odberateľov</th>
                      <th className="px-4 py-2 text-right font-medium">Dohodnutých cien</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {skupiny.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium">{s.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {cislo(s.discount_percent) > 0 ? `${cislo(s.discount_percent)} %` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.pocet_odberatelov}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.pocet_cien}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            aria-label="Upraviť skupinu"
                            onClick={() => setSkupinaForm({ ...s })}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Zmazať skupinu"
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Zmazať skupinu „${s.name}"? Odberatelia v nej stratia zľavu, dohodnuté ceny ostanú.`,
                                )
                              )
                                return;
                              await zmazSkupinu({ data: { company_id: cid!, id: s.id } });
                              nacitaj();
                            }}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Dohodnuté ceny */}
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Dohodnuté ceny</h2>
                <p className="text-xs text-muted-foreground">
                  Konkrétna cena produktu pre odberateľa alebo skupinu. Prebíja percentuálnu zľavu.
                </p>
              </div>
              {ceny.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Zatiaľ žiadna dohodnutá cena. Bez nej sa fakturuje základná cena z katalógu.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 text-left font-medium">Produkt</th>
                        <th className="px-4 py-2 text-left font-medium">Pre koho</th>
                        <th className="px-4 py-2 text-right font-medium">Od množstva</th>
                        <th className="px-4 py-2 text-right font-medium">Základná</th>
                        <th className="px-4 py-2 text-right font-medium">Dohodnutá</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {ceny.map((c) => {
                        const zakladna = cislo(c.products?.unit_price);
                        const dohodnuta = cislo(c.unit_price);
                        const rozdiel = zakladna - dohodnuta;
                        return (
                          <tr key={c.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2">{c.products?.name ?? "—"}</td>
                            <td className="px-4 py-2">
                              {c.customers?.name ? (
                                <span className="inline-flex items-center gap-1">
                                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                  {c.customers.name}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  skupina {c.price_groups?.name ?? "—"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {cislo(c.min_quantity) > 0 ? cislo(c.min_quantity) : "—"}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                              {suma(zakladna)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums font-medium">
                              {suma(dohodnuta)}
                              {rozdiel !== 0 && (
                                <span
                                  className={`ml-2 text-xs ${rozdiel > 0 ? "text-emerald-600" : "text-amber-600"}`}
                                >
                                  {rozdiel > 0 ? "−" : "+"}
                                  {suma(Math.abs(rozdiel))}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                aria-label="Upraviť cenu"
                                onClick={() =>
                                  setCenaForm({
                                    ...c,
                                    adresat: c.customer_id ? "odberatel" : "skupina",
                                  })
                                }
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label="Zmazať cenu"
                                onClick={async () => {
                                  if (!confirm("Zmazať dohodnutú cenu?")) return;
                                  await zmazCenu({ data: { company_id: cid!, id: c.id } });
                                  nacitaj();
                                }}
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </PageBody>

      {skupinaForm && (
        <Overlay onClose={() => setSkupinaForm(null)}>
          <h2 className="text-lg font-semibold">
            {skupinaForm.id ? "Upraviť cenovú skupinu" : "Nová cenová skupina"}
          </h2>
          <form onSubmit={ulozSkupinuKlik} className="mt-4 space-y-4">
            <div>
              <label className={popis}>Názov</label>
              <input
                className={pole}
                value={skupinaForm.name ?? ""}
                onChange={(e) => setSkupinaForm({ ...skupinaForm, name: e.target.value })}
                placeholder="Napríklad Veľkoobchod"
                required
                autoFocus
              />
            </div>
            <div>
              <label className={popis}>Zľava (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className={pole}
                value={skupinaForm.discount_percent ?? 0}
                onChange={(e) =>
                  setSkupinaForm({ ...skupinaForm, discount_percent: e.target.value })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Platí na produkty, pre ktoré skupina nemá dohodnutú konkrétnu cenu.
              </p>
            </div>
            <Tlacidla onClose={() => setSkupinaForm(null)} />
          </form>
        </Overlay>
      )}

      {cenaForm && (
        <Overlay onClose={() => setCenaForm(null)}>
          <h2 className="text-lg font-semibold">
            {cenaForm.id ? "Upraviť dohodnutú cenu" : "Nová dohodnutá cena"}
          </h2>
          <form onSubmit={ulozCenuKlik} className="mt-4 space-y-4">
            <div>
              <label className={popis}>Produkt</label>
              <select
                className={pole}
                value={cenaForm.product_id ?? ""}
                onChange={(e) => setCenaForm({ ...cenaForm, product_id: e.target.value })}
                required
              >
                {produkty.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {suma(p.unit_price)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={popis}>Cena platí pre</label>
              <select
                className={pole}
                value={cenaForm.adresat}
                onChange={(e) => setCenaForm({ ...cenaForm, adresat: e.target.value })}
              >
                <option value="skupina">cenovú skupinu</option>
                <option value="odberatel">konkrétneho odberateľa</option>
              </select>
            </div>
            {cenaForm.adresat === "skupina" ? (
              <div>
                <label className={popis}>Cenová skupina</label>
                {skupiny.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Najprv založte cenovú skupinu.
                  </p>
                ) : (
                  <select
                    className={pole}
                    value={cenaForm.price_group_id ?? ""}
                    onChange={(e) => setCenaForm({ ...cenaForm, price_group_id: e.target.value })}
                    required
                  >
                    {skupiny.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div>
                <label className={popis}>Odberateľ</label>
                <select
                  className={pole}
                  value={cenaForm.customer_id ?? ""}
                  onChange={(e) => setCenaForm({ ...cenaForm, customer_id: e.target.value })}
                  required
                >
                  {odberatelia.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>Cena bez DPH (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={pole}
                  value={cenaForm.unit_price ?? ""}
                  onChange={(e) => setCenaForm({ ...cenaForm, unit_price: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className={popis}>Od množstva</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className={pole}
                  value={cenaForm.min_quantity ?? 0}
                  onChange={(e) => setCenaForm({ ...cenaForm, min_quantity: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Nula znamená, že cena platí vždy.
                </p>
              </div>
            </div>
            <Tlacidla onClose={() => setCenaForm(null)} />
          </form>
        </Overlay>
      )}
    </>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Tlacidla({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
      >
        Zrušiť
      </button>
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Uložiť
      </button>
    </div>
  );
}
