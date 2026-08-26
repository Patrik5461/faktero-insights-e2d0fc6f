import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import {
  getProductStockDetail,
  updateStockProduct,
  listStockCategories,
  createStockCategory,
  listSuppliers,
} from "@/lib/faktero/stock.functions";
import { useStockPermissions } from "@/hooks/useStockPermissions";
import { ArrowLeft, Save, Upload, X } from "lucide-react";
import { vatRateOptions } from "@/lib/faktero/vat-rates";

import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
export const Route = createFileRoute("/_authenticated/sklad/produkty/$id/upravit")({
  head: () => ({ meta: [{ title: "Upraviť skladovú kartu — Faktero" }] }),
  component: EditStockProduct,
});

const UNITS = ["ks", "bal", "kg", "g", "l", "ml", "m", "cm", "m²", "m³", "h", "deň"];

function EditStockProduct() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { canManage } = useStockPermissions();
  const fetchDetail = useServerFn(getProductStockDetail);
  const doUpdate = useServerFn(updateStockProduct);
  const fetchCategories = useServerFn(listStockCategories);
  const addCategory = useServerFn(createStockCategory);
  const fetchSuppliers = useServerFn(listSuppliers);

  /* Sadzby DPH vyplývajú z krajiny registrácie firmy, nenastavujú sa ručne. */

  const krajina = useKrajinaDane();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    Karta, ktorá sa nenačítala. Predtým sa vykreslil celý prázdny formulár
    s červeným pásikom navrchu — vyzeralo to ako karta bez vyplnených údajov,
    nie ako neexistujúci produkt.
  */
  const [nenajdene, setNenajdene] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [form, setForm] = useState({
    name: "",
    name_en: "",
    description: "",
    code: "",
    sku: "",
    barcode: "",
    unit: "ks",
    vat_rate: 23,
    sale_price: 0,
    purchase_price: 0,
    min_stock: 0,
    optimal_stock: 0,
    track_stock: true,
    category_id: "" as string,
    supplier_id: "" as string,
    location: "",
    photo_url: "" as string,
    active: true,
  });

  const cid = useMemo(() => getActiveCompanyId(), []);

  useEffect(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetchDetail({ data: { company_id: cid, product_id: id } }),
      fetchCategories({ data: { company_id: cid } }),
      fetchSuppliers({ data: { company_id: cid } }),
    ])
      .then(([detail, cats, sups]: any) => {
        setCategories(cats ?? []);
        setSuppliers(sups ?? []);
        const p = detail.product;
        const si = detail.stockItem;
        if (!p && !si) setNenajdene(true);
        setPhotoPreview(detail.photoSignedUrl ?? null);
        setForm({
          name: p?.name ?? "",
          name_en: si?.name_en ?? "",
          description: si?.description ?? p?.description ?? "",
          code: p?.code ?? "",
          sku: si?.sku ?? "",
          barcode: si?.barcode ?? "",
          unit: si?.unit ?? p?.unit ?? "ks",
          vat_rate: Number(si?.vat_rate ?? p?.vat_rate ?? 23),
          sale_price: Number(si?.sale_price ?? p?.unit_price ?? 0),
          purchase_price: Number(si?.purchase_price ?? 0),
          min_stock: Number(si?.min_stock ?? 0),
          optimal_stock: Number(si?.optimal_stock ?? 0),
          track_stock: si?.track_stock ?? true,
          category_id: si?.category_id ?? "",
          supplier_id: si?.supplier_id ?? "",
          location: si?.location ?? "",
          photo_url: si?.photo_url ?? "",
          active: p?.active ?? true,
        });
      })
      .catch((e) => {
        setError(e?.message ?? "Chyba načítania");
        setNenajdene(true);
      })
      .finally(() => setLoading(false));
  }, [cid, id, fetchDetail, fetchCategories, fetchSuppliers]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !cid) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Max 5 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${cid}/${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      set("photo_url", path);
      const { data: signed } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(path, 60 * 60);
      setPhotoPreview(signed?.signedUrl ?? null);
    } catch (err: any) {
      setError(err?.message ?? "Upload zlyhal");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddCategory() {
    if (!cid || !newCategoryName.trim()) return;
    try {
      const created: any = await addCategory({
        data: { company_id: cid, name: newCategoryName.trim() },
      });
      setCategories((c) => [...c, created].sort((a, b) => a.name.localeCompare(b.name)));
      set("category_id", created.id);
      setNewCategoryName("");
    } catch (e: any) {
      setError(e?.message ?? "Nepodarilo sa vytvoriť kategóriu");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    setError(null);
    try {
      await doUpdate({
        data: {
          company_id: cid,
          product_id: id,
          ...form,
          category_id: form.category_id || null,
          supplier_id: form.supplier_id || null,
          photo_url: form.photo_url || null,
        },
      });
      nav({ to: "/sklad/produkty/$id", params: { id } });
    } catch (err: any) {
      setError(err?.message ?? "Uloženie zlyhalo");
      setSaving(false);
    }
  }

  if (loading)
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      </PageBody>
    );
  if (nenajdene)
    return (
      <PageBody>
        <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
          Skladová karta sa nenašla. Možno bola zmazaná alebo patrí inej firme.{" "}
          <Link to="/sklad/produkty" className="text-primary hover:underline">
            Späť na produkty
          </Link>
        </div>
      </PageBody>
    );
  if (!canManage)
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">
          Nemáte oprávnenie upravovať skladové karty.
        </div>
      </PageBody>
    );

  return (
    <>
      <PageHeader
        title="Upraviť skladovú kartu"
        description={form.name || "Produkt"}
        action={
          <div className="flex gap-2">
            <Link
              to="/sklad/produkty/$id"
              params={{ id }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" /> Späť
            </Link>
          </div>
        }
      />
      <PageBody>
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            {/* Photo */}
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Fotografia
              </div>
              {photoPreview ? (
                <div className="relative">
                  <img
                    src={photoPreview}
                    alt="produkt"
                    className="aspect-square w-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      set("photo_url", "");
                      setPhotoPreview(null);
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                  Bez fotografie
                </div>
              )}
              <label className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-secondary px-3 py-2 text-sm hover:bg-secondary/70">
                <Upload className="h-4 w-4" /> {uploading ? "Nahrávam…" : "Nahrať fotku"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhoto}
                  disabled={uploading}
                />
              </label>
              <p className="mt-1 text-[11px] text-muted-foreground">JPG/PNG do 5 MB.</p>
            </div>

            {/* Basics */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Základné údaje</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Názov (SK)" required>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Názov (EN)">
                  <input
                    value={form.name_en}
                    onChange={(e) => set("name_en", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Kód">
                  <input
                    value={form.code}
                    onChange={(e) => set("code", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="SKU">
                  <input
                    value={form.sku}
                    onChange={(e) => set("sku", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Čiarový kód / EAN">
                  <input
                    value={form.barcode}
                    onChange={(e) => set("barcode", e.target.value)}
                    className="input"
                    placeholder="napr. 8588001234567"
                  />
                </Field>
                <Field label="Jednotka">
                  <select
                    value={form.unit}
                    onChange={(e) => set("unit", e.target.value)}
                    className="input"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Popis" full>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Prices & VAT */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Ceny a DPH (2025)</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nákupná cena (€)">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.purchase_price}
                  onChange={(e) => set("purchase_price", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Predajná cena (€)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.sale_price}
                  onChange={(e) => set("sale_price", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="DPH sadzba (%)">
                <select
                  value={form.vat_rate}
                  onChange={(e) => set("vat_rate", Number(e.target.value))}
                  className="input"
                >
                  {vatRateOptions(krajina, form.vat_rate).map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {form.sale_price > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                S DPH: {(form.sale_price * (1 + form.vat_rate / 100)).toFixed(2)} € · Marža:{" "}
                {form.purchase_price > 0
                  ? (((form.sale_price - form.purchase_price) / form.purchase_price) * 100).toFixed(
                      1,
                    )
                  : "—"}{" "}
                %
              </p>
            )}
          </div>

          {/* Category & supplier */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Zaradenie</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kategória">
                <div className="flex gap-2">
                  <select
                    value={form.category_id}
                    onChange={(e) => set("category_id", e.target.value)}
                    className="input flex-1"
                  >
                    <option value="">— bez kategórie —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nová kategória…"
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="rounded-md border border-border bg-secondary px-3 py-2 text-xs hover:bg-secondary/70"
                  >
                    Pridať
                  </button>
                </div>
              </Field>
              <Field label="Dodávateľ">
                <select
                  value={form.supplier_id}
                  onChange={(e) => set("supplier_id", e.target.value)}
                  className="input"
                >
                  <option value="">— bez dodávateľa —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.ico ? ` (${s.ico})` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Dodávatelia sa spravujú v Zákazníci.
                </p>
              </Field>
            </div>
          </div>

          {/* Stock */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Sklad</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Minimálna zásoba">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.min_stock}
                  onChange={(e) => set("min_stock", Number(e.target.value))}
                  className="input"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Pod touto hranicou sa zásoba hlási ako nedostatková.
                </p>
              </Field>
              <Field label="Optimálna zásoba">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.optimal_stock}
                  onChange={(e) => set("optimal_stock", Number(e.target.value))}
                  className="input"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Stav, na ktorý sa doobjednáva. Keď je 0, dopĺňa sa len po minimum.
                </p>
              </Field>
              <Field label="Lokácia (regál/pozícia)">
                <input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  className="input"
                  placeholder="napr. A-3-12"
                />
              </Field>
              <Field label="Sledovať zásoby">
                <label className="flex h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.track_stock}
                    onChange={(e) => set("track_stock", e.target.checked)}
                  />
                  <span className="text-sm">Áno, upozorňovať pod min.</span>
                </label>
              </Field>
              <Field label="Stav produktu">
                <label className="flex h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => set("active", e.target.checked)}
                  />
                  <span className="text-sm">Aktívny</span>
                </label>
              </Field>
            </div>
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
            <Link
              to="/sklad/produkty/$id"
              params={{ id }}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              Zrušiť
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "Ukladám…" : "Uložiť zmeny"}
            </button>
          </div>
        </form>

        <style>{`.input { width: 100%; border-radius: 0.375rem; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.875rem; } .input:focus { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }`}</style>
      </PageBody>
    </>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}
