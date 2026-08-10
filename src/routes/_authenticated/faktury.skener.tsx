import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { nacitajBlocekFn, type BlocekVysledok } from "@/lib/faktero/blocek.functions";
import { captureReceipt } from "@/lib/mobile/receipt-scanner";
import { scanQrCode, scanQrFromImage } from "@/lib/mobile/qr-scanner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Camera, Loader2, QrCode, BadgeCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/faktury/skener")({
  head: () => ({ meta: [{ title: "Skener dokladov — Faktero" }] }),
  component: ScannerPage,
});

function fmt(n?: number, mena = "EUR") {
  if (n == null) return "—";
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: mena }).format(n);
}

function ScannerPage() {
  const navigate = useNavigate();
  const nacitaj = useServerFn(nacitajBlocekFn);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BlocekVysledok | null>(null);

  async function spracuj(qr?: string, dataUrl?: string) {
    setLoading(true);
    setResult(null);
    try {
      const r = (await nacitaj({ data: { qr, image_data_url: dataUrl } })) as BlocekVysledok;
      setResult(r);
      if (r.zdroj === "ekasa") toast.success("Doklad načítaný z Finančnej správy");
      else if (r.zdroj === "nic") toast.error(r.poznamka ?? "Nepodarilo sa prečítať nič");
    } catch (e: any) {
      toast.error(e?.message ?? "Spracovanie zlyhalo");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fotka doklad odfotí aj s QR kódom — ten sa z nej skúsi prečítať ešte pred
   * odoslaním. Keď sa podarí, údaje prídu priamo z Finančnej správy a nič sa
   * nemusí odhadovať z obrázka.
   */
  async function odfot() {
    const cap = await captureReceipt();
    if (!cap) return;
    setPreview(cap.dataUrl);
    const qr = await scanQrFromImage(cap.dataUrl);
    await spracuj(qr?.raw, cap.dataUrl);
  }

  async function nasnimajQr() {
    const res = await scanQrCode();
    if (!res) {
      toast.error("QR skener nie je dostupný alebo bol zrušený. Skúste doklad odfotiť.");
      return;
    }
    setPreview(null);
    await spracuj(res.raw);
  }

  function vytvorVydavok() {
    if (!result) return;
    const s = new URLSearchParams();
    if (result.supplier) s.set("supplier", result.supplier);
    if (result.supplier_ico) s.set("ico", result.supplier_ico);
    if (result.total != null) s.set("total", String(result.total));
    if (result.vat_amount != null) s.set("vat", String(result.vat_amount));
    if (result.date) s.set("date", result.date);
    if (result.document_number) s.set("number", result.document_number);
    navigate({ to: "/doklady/novy", search: Object.fromEntries(s) as any });
  }

  return (
    <>
      <PageHeader
        title="Skener dokladov"
        description="Bloček s QR kódom sa načíta priamo z Finančnej správy — aj s položkami."
      />
      <PageBody>
        <div className="mx-auto max-w-xl space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={odfot}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Camera className="h-5 w-5" /> Odfotiť doklad
            </button>
            <button
              onClick={nasnimajQr}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-4 text-base font-medium hover:bg-secondary disabled:opacity-50"
            >
              <QrCode className="h-5 w-5" /> Nasnímať QR kód
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Odfoťte doklad celý aj s QR kódom. Keď sa QR prečítať nedá, údaje sa odhadnú z fotky —
            vtedy ich pred uložením skontrolujte.
          </p>

          {preview && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <img src={preview} alt="náhľad dokladu" className="max-h-72 w-full object-contain" />
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Čítam doklad…
            </div>
          )}

          {result && result.zdroj !== "nic" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
              <Povod result={result} />

              <div className="space-y-2">
                <Riadok label="Predajca" value={result.supplier ?? "—"} />
                <Riadok label="IČO" value={result.supplier_ico ?? "—"} />
                <Riadok label="IČ DPH" value={result.supplier_ic_dph ?? "—"} />
                <Riadok label="Dátum" value={result.date ?? "—"} />
                <Riadok label="Číslo dokladu" value={result.document_number ?? "—"} />
                <Riadok label="Suma" value={fmt(result.total, result.currency ?? "EUR")} />
                <Riadok
                  label="z toho DPH"
                  value={
                    result.vat_amount != null
                      ? `${fmt(result.vat_amount, result.currency ?? "EUR")}${result.vat_rate != null ? ` (${result.vat_rate} %)` : ""}`
                      : "—"
                  }
                />
              </div>

              {result.items.length > 0 && (
                <div className="rounded-lg border border-border">
                  <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Položky ({result.items.length})
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {result.items.map((p, i) => (
                        <tr key={i} className="border-t border-border first:border-t-0">
                          <td className="px-3 py-1.5">{p.name || "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {p.quantity} × {fmt(p.unit_price, result.currency ?? "EUR")}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{p.vat_rate} %</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                            {fmt(p.total ?? p.quantity * p.unit_price, result.currency ?? "EUR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                onClick={vytvorVydavok}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Uložiť ako výdavok
              </button>
            </div>
          )}

          {result && result.zdroj === "nic" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <p className="font-medium">Doklad sa nepodarilo prečítať</p>
                  <p className="text-muted-foreground">{result.poznamka}</p>
                  <p className="mt-2 text-muted-foreground">
                    Údaje sa dajú zapísať aj ručne v{" "}
                    <Link to="/doklady/novy" className="underline">
                      novom doklade
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}

/** Odkiaľ údaje pochádzajú — úradný doklad verzus odhad z fotky. */
function Povod({ result }: { result: BlocekVysledok }) {
  if (result.zdroj === "ekasa") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
        <div>
          <p className="font-medium text-emerald-800 dark:text-emerald-300">
            Načítané z Finančnej správy
          </p>
          <p className="text-xs text-muted-foreground">
            Doklad je zaevidovaný v systéme eKasa, údaje sedia s tým, čo predajca odoslal.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-600" />
      <div>
        <p className="font-medium">
          {result.zdroj === "qr" ? "Len z QR kódu" : "Odhadnuté z fotky"}
        </p>
        <p className="text-xs text-muted-foreground">
          {result.poznamka ?? "Údaje pred uložením skontrolujte."}
        </p>
      </div>
    </div>
  );
}

function Riadok({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
