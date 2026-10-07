import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { poznamkySablonyFn } from "@/lib/faktero/expenses.functions";

/**
 * Výber z preddefinovaných poznámok firmy — tých istých, ktoré sa ukladajú
 * pri bločku („uložiť ako preddefinovanú"). Kým firma žiadne nemá, nezobrazí
 * sa nič.
 */
export function PreddefinovanaPoznamka({ companyId, onVyber }: { companyId: string | null; onVyber: (t: string) => void }) {
  const nacitaj = useServerFn(poznamkySablonyFn);
  const [poznamky, setPoznamky] = useState<string[]>([]);
  useEffect(() => {
    if (!companyId) return;
    nacitaj({ data: { company_id: companyId } })
      .then((r) => setPoznamky(r.zoznam))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  if (!poznamky.length) return null;
  return (
    <select
      aria-label="Vložiť preddefinovanú poznámku"
      value=""
      onChange={(e) => e.target.value && onVyber(e.target.value)}
      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground"
    >
      <option value="">Vložiť preddefinovanú poznámku…</option>
      {poznamky.map((p) => (
        <option key={p} value={p}>
          {p.length > 70 ? `${p.slice(0, 70)}…` : p}
        </option>
      ))}
    </select>
  );
}
