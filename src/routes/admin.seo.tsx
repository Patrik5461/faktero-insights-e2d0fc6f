import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Save, Trash2, Plus } from "lucide-react";
import {
  listSeoPages,
  upsertSeoPage,
  deleteSeoPage,
  generateSeoAi,
} from "@/lib/seo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";

export const Route = createFileRoute("/admin/seo")({
  component: Page,
});

const DEFAULT_PATHS = ["/", "/cennik", "/kontakt", "/funkcie"];

type SeoRow = {
  path: string;
  title: string | null;
  description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  canonical: string | null;
  robots: string | null;
  google_verification: string | null;
  ga_measurement_id: string | null;
  priority: number | null;
};

function emptyRow(path: string): SeoRow {
  return {
    path,
    title: null,
    description: null,
    og_title: null,
    og_description: null,
    og_image: null,
    canonical: null,
    robots: "index,follow",
    google_verification: null,
    ga_measurement_id: null,
    priority: null,
  };
}

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSeoPages);
  const upsertFn = useServerFn(upsertSeoPage);
  const deleteFn = useServerFn(deleteSeoPage);
  const genFn = useServerFn(generateSeoAi);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-seo"],
    queryFn: () => listFn(),
  });

  const [selected, setSelected] = useState<string>("/");
  const [newPath, setNewPath] = useState("");

  const global: SeoRow = useMemo(
    () => rows.find((r: any) => r.path === "_global") ?? emptyRow("_global"),
    [rows],
  );
  const current: SeoRow = useMemo(
    () => rows.find((r: any) => r.path === selected) ?? emptyRow(selected),
    [rows, selected],
  );

  const [form, setForm] = useState<SeoRow>(current);
  const [globalForm, setGlobalForm] = useState<SeoRow>(global);

  // Sync form when selection or data changes
  useEffect(() => setForm(current), [current.path, rows]);
  useEffect(() => setGlobalForm(global), [rows]);

  const save = useMutation({
    mutationFn: (row: SeoRow) => upsertFn({ data: row as any }),
    onSuccess: () => {
      toast.success("Uložené");
      qc.invalidateQueries({ queryKey: ["admin-seo"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const del = useMutation({
    mutationFn: (path: string) => deleteFn({ data: { path } }),
    onSuccess: () => {
      toast.success("Zmazané");
      setSelected("/");
      qc.invalidateQueries({ queryKey: ["admin-seo"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const gen = useMutation({
    mutationFn: (path: string) => genFn({ data: { path } }),
    onSuccess: (out) => {
      setForm((f) => ({ ...f, title: out.title, description: out.description }));
      toast.success("AI návrh doplnený, ešte ulož");
    },
    onError: (e: any) => toast.error(e.message ?? "AI chyba"),
  });

  const paths = useMemo(() => {
    const all = new Set<string>(DEFAULT_PATHS);
    for (const r of rows as any[]) if (r.path !== "_global") all.add(r.path);
    return Array.from(all).sort();
  }, [rows]);

  return (
    <>
      <AdminPageHeader
        title="SEO správa"
        description="Meta tagy, sitemap, robots.txt, Google Search Console a Analytics"
      />
      <AdminPageBody>
        <div className="space-y-8">
          {/* Global settings */}
          <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <h2 className="font-semibold mb-1">Globálne — Google Search Console & Analytics</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Vloží sa do <code>&lt;head&gt;</code> na každej stránke.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Google Search Console verifikačný kód</Label>
                <Input
                  placeholder="napr. abc123xyz..."
                  value={globalForm.google_verification ?? ""}
                  onChange={(e) => setGlobalForm({ ...globalForm, google_verification: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Content atribút meta name="google-site-verification"
                </p>
              </div>
              <div>
                <Label>Google Analytics (GA4) Measurement ID</Label>
                <Input
                  placeholder="G-XXXXXXXXXX"
                  value={globalForm.ga_measurement_id ?? ""}
                  onChange={(e) => setGlobalForm({ ...globalForm, ga_measurement_id: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={() => save.mutate({ ...globalForm, path: "_global" })} disabled={save.isPending}>
                <Save className="h-4 w-4 mr-2" /> Uložiť globálne
              </Button>
            </div>
          </section>

          {/* Per-page */}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4 flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">Stránky</h2>
              <div className="ml-auto flex items-center gap-2">
                <Input
                  placeholder="/nova-stranka"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="w-52"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!newPath.startsWith("/")) {
                      toast.error("Cesta musí začínať /");
                      return;
                    }
                    save.mutate(emptyRow(newPath));
                    setNewPath("");
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Pridať
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-[240px_1fr]">
              {/* List */}
              <aside className="border-r border-border p-2 max-h-[600px] overflow-y-auto">
                {isLoading && <div className="p-3 text-sm text-muted-foreground">Načítavam...</div>}
                {paths.map((p) => {
                  const r = rows.find((x: any) => x.path === p);
                  const active = selected === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setSelected(p)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium truncate">{p}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {(r as any)?.title ?? "— bez title —"}
                      </div>
                    </button>
                  );
                })}
              </aside>

              {/* Editor */}
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Cesta:</div>
                  <div className="font-mono text-sm">{form.path}</div>
                </div>

                <Field
                  label="Meta title"
                  value={form.title ?? ""}
                  onChange={(v) => setForm({ ...form, title: v })}
                  max={60}
                />
                <Field
                  label="Meta description"
                  value={form.description ?? ""}
                  onChange={(v) => setForm({ ...form, description: v })}
                  max={160}
                  textarea
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => gen.mutate(form.path)}
                    disabled={gen.isPending}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {gen.isPending ? "Generujem..." : "Generovať AI"}
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border">
                  <Field label="OG title" value={form.og_title ?? ""} onChange={(v) => setForm({ ...form, og_title: v })} />
                  <Field label="OG description" value={form.og_description ?? ""} onChange={(v) => setForm({ ...form, og_description: v })} textarea />
                  <Field label="OG image URL" value={form.og_image ?? ""} onChange={(v) => setForm({ ...form, og_image: v })} />
                  <Field label="Canonical URL" value={form.canonical ?? ""} onChange={(v) => setForm({ ...form, canonical: v })} />
                  <div>
                    <Label>Robots</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.robots ?? "index,follow"}
                      onChange={(e) => setForm({ ...form, robots: e.target.value })}
                    >
                      <option value="index,follow">index, follow</option>
                      <option value="index,nofollow">index, nofollow</option>
                      <option value="noindex,follow">noindex, follow</option>
                      <option value="noindex,nofollow">noindex, nofollow</option>
                    </select>
                  </div>
                  <div>
                    <Label>Priority (sitemap)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={form.priority ?? ""}
                      onChange={(e) => setForm({ ...form, priority: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                  <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                    <Save className="h-4 w-4 mr-2" /> Uložiť
                  </Button>
                  {!DEFAULT_PATHS.includes(form.path) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => del.mutate(form.path)}
                      disabled={del.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Zmazať
                    </Button>
                  )}
                </div>

                {/* OG Preview */}
                <div className="pt-4 border-t border-border">
                  <div className="text-sm font-semibold mb-2">Náhľad zdieľania (Facebook / LinkedIn)</div>
                  <div className="max-w-lg rounded-lg overflow-hidden border border-border bg-background">
                    {form.og_image ? (
                      <img
                        src={form.og_image}
                        alt="OG preview"
                        className="w-full aspect-[1.91/1] object-cover bg-muted"
                      />
                    ) : (
                      <div className="w-full aspect-[1.91/1] bg-muted grid place-items-center text-xs text-muted-foreground">
                        Bez obrázka
                      </div>
                    )}
                    <div className="p-3">
                      <div className="text-[11px] uppercase text-muted-foreground">faktero.sk</div>
                      <div className="font-semibold text-sm truncate">
                        {form.og_title || form.title || "Bez title"}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {form.og_description || form.description || "Bez description"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Info */}
          <section className="rounded-xl border border-border bg-card p-4 sm:p-6 text-sm space-y-2">
            <div className="font-semibold">Automaticky generované</div>
            <div>
              <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="text-primary hover:underline">/sitemap.xml</a>
              {" — "}všetky verejné stránky s priority a lastmod.
            </div>
            <div>
              <a href="/robots.txt" target="_blank" rel="noreferrer" className="text-primary hover:underline">/robots.txt</a>
              {" — "}Allow: /, Disallow: /admin/, /api/, /diagnostika.
            </div>
          </section>
        </div>
      </AdminPageBody>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  max,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  textarea?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {max && (
          <span className={`text-[11px] ${value.length > max ? "text-destructive" : "text-muted-foreground"}`}>
            {value.length}/{max}
          </span>
        )}
      </div>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
