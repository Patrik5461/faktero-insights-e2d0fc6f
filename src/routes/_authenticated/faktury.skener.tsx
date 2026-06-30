import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { aiParseReceiptFn } from "@/lib/faktero/ai-receipt.functions";
import { captureReceipt } from "@/lib/mobile/receipt-scanner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/faktury/skener")({
  head: () => ({ meta: [{ title: "Skener dokladov — Faktero" }] }),
  component: ScannerPage,
});

function ScannerPage() {
  const navigate = useNavigate();
  const parseFn = useServerFn(aiParseReceiptFn);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function scan() {
    const cap = await captureReceipt();
    if (!cap) return;
    setPreview(cap.dataUrl);
    setLoading(true);
    setResult(null);
    try {
      const parsed = await parseFn({ data: { image_data_url: cap.dataUrl } });
      setResult(parsed);
    } catch (e: any) {
      toast.error(e?.message ?? "Spracovanie zlyhalo");
    } finally {
      setLoading(false);
    }
  }

  function createInvoice() {
    if (!result) return;
    const params = new URLSearchParams();
    if (result.supplier) params.set("supplier_hint", result.supplier);
    if (result.total) params.set("total_hint", String(result.total));
    navigate({ to: "/faktury/nova", search: Object.fromEntries(params) as any });
  }

  return (
    <>
      <PageHeader title="Skener dokladov" description="Odfoťte doklad a AI vyplní polia faktúry." />
      <PageBody>
        <div className="mx-auto max-w-xl space-y-4">
          <button onClick={scan} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-medium text-primary-foreground hover:opacity-90">
            <Camera className="h-5 w-5" /> Odfotiť doklad
          </button>
          {preview && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <img src={preview} alt="náhľad" className="max-h-72 w-full object-contain" />
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Spracovávam…</div>
          )}
          {result && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <Row label="Dodávateľ" value={result.supplier ?? "—"} />
              <Row label="Suma" value={result.total ? `${result.total} ${result.currency ?? "EUR"}` : "—"} />
              <Row label="DPH" value={result.vat_rate != null ? `${result.vat_rate}%` : "—"} />
              <Row label="Dátum" value={result.date ?? "—"} />
              <Row label="Položiek" value={String(result.items?.length ?? 0)} />
              <button onClick={createInvoice} className="mt-2 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Vytvoriť faktúru z údajov
              </button>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
