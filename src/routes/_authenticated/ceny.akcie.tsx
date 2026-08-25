import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { deletePriceAction, listPriceActions, savePriceAction } from "@/lib/faktero/ceny.functions";
import { akciaPlati, cislo } from "@/lib/faktero/ceny";
import { ArrowLeft, Plus, Pencil, Trash2, X } from "lucide-react";
import { PRODUKTY, sPoctom } from "@/lib/faktero/mnozne";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { formatovacMeny } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/ceny/akcie")({
  head: () => ({ meta: [{ title: "Cenové akcie — Faktero" }] }),
  component: AkciePage,
});

function suma(n: unknown) {
  return formatovacMeny("EUR", "sk-SK")(cislo(n));
}

/** Dnešok v miestnom čase. `toISOString()` by po polnoci vrátil včerajšok. */
function dnes(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${den}`;
}

function formatDatum(s?: string | null) {
  if (!s) return "bez konca";
  const [r, m, d] = s.split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
}

const pole = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const popis = "mb-1 block text-xs font-medium text-muted-foreground";

type Polozka = { product_id: string; unit_price: string };

function AkciePage() {
  const nacitajAkcie = useServerFn(listPriceActions);
  const ulozAkciu = useServerFn(savePriceAction);
  const zmazAkciu = useServerFn(deletePriceAction);

  const [akcie, setAkcie] = useState<any[]>([]);
  const [produkty, setProdukty] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any | null>(null);
  useZatvorNaEscape(form ? () => setForm(null) : null);
  const [chyba, setChyba] = useState<string | null>(null);

  const cid = useMemo(() => getActiveCompanyId(), []);
  const dnesok = useMemo(dnes, []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      nacitajAkcie({ data: { company_id: cid } }),
      supabase
        .from("products")
        .select("id, name, unit_price")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("name")
        .limit(2000),
    ])
      .then(([a, p]: any[]) => {
        setAkcie(a ?? []);
        setProdukty(p.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [cid, nacitajAkcie]);

  useEffect(nacitaj, [nacitaj]);

  function novaAkcia() {
    setChyba(null);
    setForm({
      name: "",
      valid_from: dnesok,
      valid_to: "",
      discount_percent: 10,
      applies_to_all: false,
      active: true,
      polozky: [] as Polozka[],
    });
  }

  function upravAkciu(a: any) {
    setChyba(null);
    setForm({
      id: a.id,
      name: a.name,
      valid_from: a.valid_from,
      valid_to: a.valid_to ?? "",
      discount_percent: cislo(a.discount_percent),
      applies_to_all: a.applies_to_all,
      active: a.active,
      polozky: (a.price_action_products ?? []).map((p: any) => ({
        product_id: p.product_id,
        unit_price: p.unit_price == null ? "" : String(p.unit_price),
      })),
    });
  }

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    setChyba(null);
    try {
      await ulozAkciu({
        data: {
          company_id: cid,
          id: form.id || undefined,
          name: form.name ?? "",
          valid_from: form.valid_from,
          valid_to: form.valid_to || null,
          discount_percent: form.discount_percent === "" ? 0 : form.discount_percent,
          applies_to_all: !!form.applies_to_all,
          active: !!form.active,
          produkty: form.applies_to_all
            ? []
            : form.polozky.map((p: Polozka) => ({
                product_id: p.product_id,
                unit_price: p.unit_price === "" ? null : p.unit_price,
              })),
        },
      });
      setForm(null);
      nacitaj();
      toast.success("Cenová akcia uložená");
    } catch (err: any) {
      setChyba(err?.message ?? "Akciu sa nepodarilo uložiť");
    }
  }

  const volneProdukty = form
    ? produkty.filter((p) => !form.polozky.some((x: Polozka) => x.product_id === p.id))
    : [];

  return (
    <>
      <PageHeader
        title="Cenové akcie"
        description="Časovo ohraničená zľava alebo akciová cena. Doklad ju použije len vtedy, keď je pre odberateľa výhodnejšia než jeho dohodnutá cena."
        action={
          <div className="flex gap-2">
            <Link
              to="/ceny"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Cenník
            </Link>
            <button
              type="button"
              onClick={novaAkcia}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nová akcia
            </button>
          </div>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : akcie.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Zatiaľ žiadna cenová akcia.
          </div>
        ) : (
          <div className="space-y-3">
            {akcie.map((a) => {
              const bezi = akciaPlati(
                { valid_from: a.valid_from, valid_to: a.valid_to, active: a.active },
                dnesok,
              );
              const skoncila = !!a.valid_to && a.valid_to < dnesok;
              return (
                <div key={a.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            bezi
                              ? "bg-emerald-500/10 text-emerald-600"
                              : skoncila
                                ? "bg-muted text-muted-foreground"
                                : "bg-blue-500/10 text-blue-600"
                          }`}
                        >
                          {bezi ? "beží" : skoncila ? "skončila" : !a.active ? "vypnutá" : "čaká"}
                        </span>
                        {cislo(a.discount_percent) > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            −{cislo(a.discount_percent)} %
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDatum(a.valid_from)} – {formatDatum(a.valid_to)} ·{" "}
                        {a.applies_to_all
                          ? "celý sortiment"
                          : sPoctom((a.price_action_products ?? []).length, PRODUKTY)}
                      </p>
                      {!a.applies_to_all && (a.price_action_products ?? []).length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {(a.price_action_products ?? []).slice(0, 6).map((p: any) => (
                            <li key={p.id}>
                              {p.products?.name ?? "—"}
                              {p.unit_price != null ? (
                                <>
                                  {" "}
                                  →{" "}
                                  <span className="font-medium text-foreground">
                                    {suma(p.unit_price)}
                                  </span>
                                  {cislo(p.products?.unit_price) > 0 && (
                                    <span className="ml-1 line-through">
                                      {suma(p.products.unit_price)}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <> — zľava akcie</>
                              )}
                            </li>
                          ))}
                          {(a.price_action_products ?? []).length > 6 && (
                            <li>a ďalších {(a.price_action_products ?? []).length - 6}…</li>
                          )}
                        </ul>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label="Upraviť akciu"
                        onClick={() => upravAkciu(a)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Zmazať akciu"
                        onClick={async () => {
                          if (!confirm(`Zmazať akciu „${a.name}"?`)) return;
                          await zmazAkciu({ data: { company_id: cid!, id: a.id } });
                          nacitaj();
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageBody>

      {form && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setForm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cenová akcia"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {form.id ? "Upraviť cenovú akciu" : "Nová cenová akcia"}
            </h2>
            <form onSubmit={uloz} className="mt-4 space-y-4">
              {chyba && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {chyba}
                </div>
              )}
              <div>
                <label className={popis}>Názov akcie</label>
                <input
                  className={pole}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Napríklad Letný výpredaj"
                  required
                  autoFocus
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={popis}>Platí od</label>
                  <input
                    type="date"
                    className={pole}
                    value={form.valid_from}
                    onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className={popis}>Platí do</label>
                  <input
                    type="date"
                    className={pole}
                    value={form.valid_to}
                    onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Prázdne = bez konca.</p>
                </div>
                <div>
                  <label className={popis}>Zľava (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className={pole}
                    value={form.discount_percent}
                    onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.applies_to_all}
                  onChange={(e) => setForm({ ...form, applies_to_all: e.target.checked })}
                />
                Akcia platí na celý sortiment
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Akcia je zapnutá
              </label>

              {!form.applies_to_all && (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-2 text-sm font-medium">Produkty v akcii</div>
                  {form.polozky.length === 0 && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Zatiaľ žiadny. Bez produktov by akcia nemala na čo platiť.
                    </p>
                  )}
                  <div className="space-y-2">
                    {form.polozky.map((p: Polozka, i: number) => {
                      const produkt = produkty.find((x) => x.id === p.product_id);
                      return (
                        <div key={p.product_id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {produkt?.name ?? "—"}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {suma(produkt?.unit_price)}
                            </span>
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="akciová cena"
                            className="w-36 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            value={p.unit_price}
                            onChange={(e) => {
                              const polozky = [...form.polozky];
                              polozky[i] = { ...p, unit_price: e.target.value };
                              setForm({ ...form, polozky });
                            }}
                          />
                          <button
                            type="button"
                            aria-label="Odobrať produkt"
                            onClick={() =>
                              setForm({
                                ...form,
                                polozky: form.polozky.filter((_: Polozka, j: number) => j !== i),
                              })
                            }
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {volneProdukty.length > 0 && (
                    <select
                      className={`${pole} mt-3`}
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setForm({
                          ...form,
                          polozky: [
                            ...form.polozky,
                            { product_id: e.target.value, unit_price: "" },
                          ],
                        });
                      }}
                    >
                      <option value="">+ pridať produkt do akcie</option>
                      {volneProdukty.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {suma(p.unit_price)}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Prázdna akciová cena znamená, že na produkt platí zľava akcie v percentách.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  Zrušiť
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Uložiť akciu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
