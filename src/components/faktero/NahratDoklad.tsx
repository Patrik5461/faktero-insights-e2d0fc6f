import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { nahrajPrijatuFakturuFn } from "@/lib/faktero/prijata-nahratie.functions";

/**
 * Nahratie prijatého dokladu súborom.
 *
 * Faktúru od dodávateľa býva najrýchlejšie hodiť sem tak, ako prišla — v
 * PDF alebo odfotenú. Prečíta ju tá istá AI ako doklady z pošty, uloží sa
 * aj s prílohou a otvorí sa detail, aby si človek prečítané údaje prešiel.
 *
 * `druh` hovorí, kam doklad patrí: zo zoznamu prijatých záloh chodí
 * `proforma` napevno, z prijatých faktúr `auto` — tam rozhodne papier.
 */
export function NahratDoklad({
  druh = "auto",
  label = "Nahrať doklad",
}: {
  druh?: "auto" | "regular" | "proforma";
  label?: string;
}) {
  const vstup = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const nahraj = useServerFn(nahrajPrijatuFakturuFn);
  const navigate = useNavigate();

  async function vyber(subor: File | null) {
    if (!subor) return;
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    if (subor.size > 15 * 1024 * 1024) return toast.error("Súbor je väčší než 15 MB.");

    setBusy(true);
    const cakanie = toast.loading("Čítam doklad…");
    try {
      const base64 = await naBase64(subor);
      const v: any = await nahraj({
        data: {
          company_id: cid,
          subor: base64,
          nazov: subor.name,
          mime: subor.type || "application/octet-stream",
          druh,
        },
      });
      toast.dismiss(cakanie);
      if (v.prazdny) {
        toast.warning("Doklad je uložený, ale nič sa z neho nedalo prečítať — doplňte údaje.");
      } else {
        toast.success(
          `${v.type === "proforma" ? "Zálohová faktúra" : "Faktúra"} ${v.invoice_number} od ${v.supplier_name} je zaevidovaná`,
        );
      }
      navigate({ to: "/prijate-faktury/$id", params: { id: v.id } });
    } catch (e: any) {
      toast.dismiss(cakanie);
      toast.error(e?.message ?? "Doklad sa nepodarilo nahrať.");
    } finally {
      setBusy(false);
      if (vstup.current) vstup.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={vstup}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => vyber(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => vstup.current?.click()}
        className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? "Čítam…" : label}
      </button>
    </>
  );
}

/** Súbor ako base64 bez dátovej hlavičky — server ho prevezme ako text. */
function naBase64(subor: File): Promise<string> {
  return new Promise((splnene, zlyhane) => {
    const citac = new FileReader();
    citac.onerror = () => zlyhane(new Error("Súbor sa nepodarilo prečítať."));
    citac.onload = () => {
      const v = String(citac.result ?? "");
      splnene(v.slice(v.indexOf(",") + 1));
    };
    citac.readAsDataURL(subor);
  });
}
