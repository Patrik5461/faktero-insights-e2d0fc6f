import { useT } from "@/lib/i18n/useT";

/**
 * Jedna veta namiesto rozpisu DPH prijatého dokladu neplatiteľa
 * (`neplatitel-dph.ts`, `VETA_NEPLATITEL_DPH`) — DPH sa neodpočítava, celá suma je náklad.
 */
export function PoznamkaNeplatitelaDph({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <p
      data-testid="neplatitel-dph"
      className={`rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${className}`}
    >
      {t("Neplatiteľ DPH — DPH sa neodpočítava, celá suma ide do nákladov.")}
    </p>
  );
}
