import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, AlertTriangle, FileText } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { nahrajNespracovaneFn, nespracovaneFn } from "@/lib/faktero/nespracovane.functions";
import { DRUHY_NESPRACOVANYCH } from "@/lib/faktero/nespracovane";

export const Route = createFileRoute("/_authenticated/nespracovane/")({
  head: () => ({ meta: [{ title: "Nespracované doklady — Faktero" }] }),
  component: Stranka,
});

const ZDROJ: Record<string, string> = {
  mail: "e-mail",
  nahratie: "nahraté",
  skener: "skener",
  apka: "appka",
  photo: "fotka",
  qr: "eKasa QR",
  upload: "nahraté",
  web: "web",
};

function naBase64(f: File): Promise<string> {
  return new Promise((ok, zle) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => zle(r.error);
    r.readAsDataURL(f);
  });
}

/**
 * Nespracované doklady (ako v Doklado): všetko, čo príde e-mailom alebo sa
 * nahrá, čaká tu. Kliknutím sa doklad otvorí — človek určí druh, skontroluje
 * údaje, zaúčtuje a vytvorí.
 */
function Stranka() {
  const navigate = useNavigate();
  const nacitaj = useServerFn(nespracovaneFn);
  const nahraj = useServerFn(nahrajNespracovaneFn);
  const [data, setData] = useState<Awaited<ReturnType<typeof nacitaj>> | null>(null);
  const [nahravam, setNahravam] = useState(0);
  const [nad, setNad] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function obnov() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      setData(await nacitaj({ data: { company_id: cid } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa načítať");
    }
  }
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kým sa niečo číta, zoznam sa obnovuje sám.
  const cita = data?.doklady.some((d: any) => d.stav === "cita");
  useEffect(() => {
    if (!cita) return;
    const t = setInterval(() => void obnov(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cita]);

  async function pridaj(subory: FileList | File[]) {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    const zoznam = Array.from(subory);
    for (const f of zoznam) {
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`${f.name}: súbor je väčší než 15 MB`);
        continue;
      }
      setNahravam((n) => n + 1);
      try {
        await nahraj({
          data: { company_id: cid, nazov: f.name, mime: f.type || "application/octet-stream", subor: await naBase64(f) },
        });
      } catch (e: any) {
        toast.error(`${f.name}: ${e?.message ?? "nepodarilo sa nahrať"}`);
      } finally {
        setNahravam((n) => n - 1);
      }
    }
    void obnov();
  }

  const riadky = [
    ...(data?.doklady ?? []).map((d: any) => ({ ...d, kluc: `n-${d.id}` })),
    ...(data?.blocky ?? []).map((b: any) => ({ ...b, kluc: `b-${b.id}`, stav: "vytazene", druh: "blocek", chyba: null, subor: null })),
  ].sort((a, b) => String(b.vytvorene).localeCompare(String(a.vytvorene)));

  return (
    <>
      <PageHeader
        title="Nespracované doklady"
        description="Všetko, čo príde e-mailom alebo nahráte, čaká tu. Otvorte doklad, určte druh, skontrolujte údaje, zaúčtujte a vytvorte."
        action={
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {nahravam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Nahrať doklady
          </button>
        }
      />
      <PageBody>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void pridaj(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setNad(true);
          }}
          onDragLeave={() => setNad(false)}
          onDrop={(e) => {
            e.preventDefault();
            setNad(false);
            void pridaj(e.dataTransfer.files);
          }}
          className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground ${nad ? "border-primary bg-primary/5" : "border-border"}`}
        >
          Pretiahnite sem faktúry, zálohové faktúry, bločky či iné doklady (PDF alebo fotky) — aj viac
          naraz. Faktero ich prečíta a počkajú tu na zaradenie.
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Druh</th>
                <th className="p-3">Dodávateľ</th>
                <th className="p-3">Číslo</th>
                <th className="p-3">Dátum</th>
                <th className="p-3 text-right">Suma</th>
                <th className="p-3">Zdroj</th>
                <th className="p-3">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {data && riadky.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    Všetko je spracované.
                  </td>
                </tr>
              )}
              {riadky.map((r) => (
                <tr
                  key={r.kluc}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() =>
                    r.typ === "blocek"
                      ? navigate({ to: "/doklady/novy", search: { id: r.id } as any })
                      : navigate({ to: "/nespracovane/$id", params: { id: r.id } })
                  }
                >
                  <td className="p-3">
                    {r.druh ? (
                      DRUHY_NESPRACOVANYCH.find((d) => d.kluc === r.druh)?.nazov
                    ) : (
                      <span className="text-muted-foreground">neurčený</span>
                    )}
                    {r.subor ? <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{r.subor}</div> : null}
                  </td>
                  <td className="p-3">{r.dodavatel ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3">{r.cislo ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{r.datum ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">
                    {r.suma != null ? `${Number(r.suma).toFixed(2)} ${r.mena}` : "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{ZDROJ[r.zdroj] ?? r.zdroj}</td>
                  <td className="p-3 text-xs">
                    {r.stav === "cita" ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Číta sa…
                      </span>
                    ) : r.stav === "chyba" ? (
                      <span className="inline-flex items-center gap-1 text-amber-700" title={r.chyba ?? undefined}>
                        <AlertTriangle className="h-3.5 w-3.5" /> Doplniť ručne
                      </span>
                    ) : (
                      <span className="text-emerald-700">Vyťažené</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
