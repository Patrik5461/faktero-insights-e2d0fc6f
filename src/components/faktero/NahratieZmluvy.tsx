import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { precitajZmluvuFn } from "@/lib/faktero/financovanie.functions";
import type { SplatkaZoZmluvy, ZmluvaNaUpravu } from "./FormularZmluvy";

/**
 * Nahratie zmluvy alebo splátkového kalendára a jeho vyčítanie.
 *
 * Cieľom nie je ušetriť pár klikov — je to jediný spôsob, ako dostať do
 * Faktera **presné** riadky kalendára. Dopočítaný kalendár sa od predpisu
 * banky vždy o pár centov líši a v účtovníctve ten rozdiel visí navždy.
 *
 * Prečítané údaje sa nikam neukladajú samy: naplnia formulár a človek ich
 * potvrdí. Model sa mýli a zmluva je záväzný dokument.
 */
export type PrecitanyDokument = {
  document_path: string | null;
  predvyplnene: Partial<ZmluvaNaUpravu>;
  splatky: SplatkaZoZmluvy[];
  vyhrady: string[];
};

async function naDataUrl(f: File): Promise<string> {
  return await new Promise((hotovo, chyba) => {
    const r = new FileReader();
    r.onload = () => hotovo(String(r.result));
    r.onerror = () => chyba(new Error("Súbor sa nepodarilo načítať."));
    r.readAsDataURL(f);
  });
}

export function NahratieZmluvy({
  companyId,
  onPrecitane,
}: {
  companyId: string;
  onPrecitane: (d: PrecitanyDokument) => void;
}) {
  const citaj = useServerFn(precitajZmluvuFn);
  const vstup = useRef<HTMLInputElement>(null);
  const [pracujem, setPracujem] = useState(false);

  async function spracuj(f: File | undefined) {
    if (!f) return;
    setPracujem(true);
    try {
      const subor = await naDataUrl(f);
      const r = await citaj({ data: { company_id: companyId, subor, nazov: f.name } });
      onPrecitane({
        document_path: r.document_path,
        splatky: r.splatky,
        vyhrady: r.vyhrady,
        predvyplnene: {
          kind: r.kind ?? "leasing",
          // Názov v zmluve nebýva — nech je aspoň podľa čoho ju v zozname spoznať.
          name: [r.provider_name, r.contract_number].filter(Boolean).join(" ") || f.name,
          provider_name: r.provider_name,
          contract_number: r.contract_number,
          variable_symbol: r.variable_symbol,
          principal: r.principal ?? "",
          interest_rate: r.interest_rate ?? "",
          term_months: r.term_months ?? r.splatky.length,
          first_due_date: r.first_due_date ?? new Date().toISOString().slice(0, 10),
          payment_amount: r.payment_amount,
          vat_rate: r.vat_rate ?? 0,
          down_payment: r.down_payment ?? 0,
          residual_value: r.residual_value ?? 0,
          interest_from: r.interest_from,
        },
      });
      toast.success(
        r.splatky.length
          ? `Prečítané, kalendár má ${r.splatky.length} splátok. Skontrolujte údaje a uložte.`
          : "Údaje sú prečítané. Kalendár v dokumente nebol — Faktero ho dopočíta.",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Dokument sa nepodarilo prečítať.");
    } finally {
      setPracujem(false);
      if (vstup.current) vstup.current.value = "";
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-dashed bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Máte zmluvu v PDF?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nahrajte zmluvu alebo splátkový kalendár. Faktero z neho vyčíta údaje a keď je v ňom
            kalendár, prevezme ho riadok po riadku — presne tak, ako ho predpísala banka.
          </p>
        </div>
        <button
          onClick={() => vstup.current?.click()}
          disabled={pracujem}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {pracujem ? "Čítam dokument…" : "Nahrať zmluvu"}
        </button>
        <input
          ref={vstup}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => void spracuj(e.target.files?.[0])}
        />
      </div>
      {pracujem && (
        <p className="mt-3 text-xs text-muted-foreground">
          Viacstranový kalendár trvá aj pol minúty — stránku nezatvárajte.
        </p>
      )}
    </div>
  );
}
