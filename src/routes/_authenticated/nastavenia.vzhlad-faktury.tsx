import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { ImageUp, Loader2, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/nastavenia/vzhlad-faktury")({
  head: () => ({
    meta: [
      { title: "Vzhľad faktúry — Faktero" },
      {
        name: "description",
        content:
          "Nastavte logo, farbu akcentu a pätičku, ktoré sa použijú na PDF faktúrach a cenových ponukách.",
      },
      { property: "og:title", content: "Vzhľad faktúry — Faktero" },
      {
        property: "og:description",
        content: "Logo, farba a pätička na faktúrach vašej firmy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoiceAppearancePage,
});

const PRESETS = [
  { label: "Faktero zelená", value: "#0F7A4D" },
  { label: "Tmavomodrá", value: "#1E3A8A" },
  { label: "Petrolová", value: "#0E7490" },
  { label: "Grafitová", value: "#334155" },
  { label: "Bordová", value: "#9F1239" },
  { label: "Fialová", value: "#6D28D9" },
  { label: "Oranžová", value: "#C2410C" },
];

function InvoiceAppearancePage() {
  const [companyId] = useState<string | null>(() => getActiveCompanyId());
  const [c, setC] = useState<any>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single()
      .then(({ data }) => setC(data));
  }, [companyId]);

  useEffect(() => {
    const path = (c as any)?.logo_url;
    if (!path) return setLogoPreview(null);
    supabase.storage
      .from("company-logos")
      .createSignedUrl(path, 600)
      .then(({ data }) => setLogoPreview(data?.signedUrl ?? null));
  }, [c?.logo_url]);

  if (!companyId) return <PageBody>Chýba aktívna firma.</PageBody>;
  if (!c) return <PageBody>Načítavam…</PageBody>;

  const accent: string = c.invoice_accent_color ?? "#0F7A4D";

  async function onUpload(file: File) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      toast.error("Podporované sú len PNG alebo JPG obrázky.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo môže mať najviac 2 MB.");
      return;
    }
    setUploading(true);
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${companyId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (error) {
      setUploading(false);
      return toast.error(error.message);
    }
    const old = c.logo_url as string | null;
    const { error: upErr } = await supabase
      .from("companies")
      .update({ logo_url: path })
      .eq("id", companyId);
    setUploading(false);
    if (upErr) return toast.error(upErr.message);
    if (old && old !== path) await supabase.storage.from("company-logos").remove([old]);
    setC({ ...c, logo_url: path });
    toast.success("Logo nahraté");
  }

  async function removeLogo() {
    const old = c.logo_url as string | null;
    const { error } = await supabase
      .from("companies")
      .update({ logo_url: null })
      .eq("id", companyId);
    if (error) return toast.error(error.message);
    if (old) await supabase.storage.from("company-logos").remove([old]);
    setC({ ...c, logo_url: null });
    toast.success("Logo odstránené");
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        invoice_accent_color: accent,
        invoice_show_logo: c.invoice_show_logo ?? true,
        invoice_footer: c.invoice_footer ?? null,
      } as any)
      .eq("id", companyId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Uložené — nové PDF sa vygenerujú s týmto vzhľadom.");
  }

  return (
    <>
      <PageHeader
        title="Vzhľad faktúry"
        description="Logo, farba akcentu a pätička na PDF faktúrach a cenových ponukách."
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,320px)]">
          <div className="grid gap-6">
            {/* Logo */}
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold">Logo firmy</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                PNG alebo JPG, max. 2 MB. Zobrazí sa v ľavom hornom rohu dokladu.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 p-2">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo firmy na faktúre"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Bez loga</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageUp className="h-4 w-4" />
                    )}
                    Nahrať logo
                  </button>
                  {c.logo_url && (
                    <button
                      onClick={removeLogo}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm"
                    >
                      <Trash2 className="h-4 w-4" /> Odstrániť
                    </button>
                  )}
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.invoice_show_logo ?? true}
                  onChange={(e) => setC({ ...c, invoice_show_logo: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Zobrazovať logo na dokladoch
              </label>
            </section>

            {/* Farba */}
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold">Farba akcentu</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Používa sa na linky, hlavičku tabuľky a sumu k úhrade.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setC({ ...c, invoice_accent_color: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
                  aria-label="Farba akcentu"
                />
                <input
                  value={accent}
                  onChange={(e) => setC({ ...c, invoice_accent_color: e.target.value })}
                  className="h-9 w-32 rounded-md border border-input bg-background px-3 font-mono text-sm"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setC({ ...c, invoice_accent_color: p.value })}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: p.value }}
                      aria-hidden
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Pätička */}
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold">Pätička dokladu</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Napr. zápis v OR SR, poznámka o prenose daňovej povinnosti, ďakovná veta.
              </p>
              <textarea
                value={c.invoice_footer ?? ""}
                onChange={(e) => setC({ ...c, invoice_footer: e.target.value })}
                rows={3}
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </section>

            <div>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Uložiť vzhľad
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                Už vygenerované PDF sa prepíšu pri ďalšom otvorení alebo cez „Pregenerovať PDF“ v
                detaile faktúry.
              </p>
            </div>
          </div>

          {/* Live náhľad */}
          <aside className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Náhľad
            </div>
            <div className="mt-3 rounded-lg border border-border bg-background p-4 text-[10px] leading-relaxed">
              <div className="h-[3px] w-12 rounded-full" style={{ backgroundColor: accent }} />
              <div className="mt-3 flex items-start justify-between gap-3">
                {(c.invoice_show_logo ?? true) && logoPreview ? (
                  <img src={logoPreview} alt="Náhľad loga" className="h-8 object-contain" />
                ) : (
                  <span className="text-[11px] font-semibold">{c.name}</span>
                )}
                <div className="text-right">
                  <div className="text-sm font-bold">FAKTÚRA</div>
                  <div className="text-muted-foreground">č. 2026001</div>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded">
                <div
                  className="px-2 py-1 text-[9px] font-semibold uppercase text-white"
                  style={{ backgroundColor: accent }}
                >
                  Položka
                </div>
                <div className="border-b border-border px-2 py-1">Konzultácia · 1 ks · 120,00 €</div>
                <div className="px-2 py-1">Vývoj · 4 h · 400,00 €</div>
              </div>
              <div
                className="mt-3 flex items-center justify-between rounded px-2 py-1.5 text-white"
                style={{ backgroundColor: accent }}
              >
                <span className="font-semibold">SPOLU K ÚHRADE</span>
                <span className="font-bold">624,00 €</span>
              </div>
              {c.invoice_footer && (
                <div className="mt-3 text-muted-foreground">{c.invoice_footer}</div>
              )}
            </div>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
