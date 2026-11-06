import type { PolozkaPaty } from "@/lib/faktero/pata-dokladu";

/**
 * Pätička dokladu v HTML (verejný odkaz, náhľad vo Vzhľade faktúry) — tá
 * istá ako v PDF: čiara v akcentovej farbe, pod ňou stĺpce rovnakej šírky
 * s malým sivým popisom nad hodnotou. Dlhá hodnota sa zalomí.
 */
export function PataDokladu({
  polozky,
  farba,
  className = "mt-6",
  male = false,
}: {
  polozky: PolozkaPaty[];
  /** Akcentová farba dokladu; bez nej farba témy. */
  farba?: string;
  className?: string;
  /** Zmenšený náhľad (Vzhľad faktúry). */
  male?: boolean;
}) {
  if (!polozky.length) return null;
  return (
    <div
      className={`${className} grid gap-3 border-t pt-2 ${farba ? "" : "border-primary"}`}
      style={{
        gridTemplateColumns: `repeat(${polozky.length}, minmax(0, 1fr))`,
        ...(farba ? { borderTopColor: farba } : {}),
      }}
    >
      {polozky.map((p) => (
        <div key={p.popis} className="min-w-0">
          <div className={`${male ? "text-[8px]" : "text-[11px]"} text-muted-foreground`}>
            {p.popis}
          </div>
          <div className={`${male ? "text-[9px]" : "text-xs"} break-words [overflow-wrap:anywhere]`}>
            {p.odkaz ? (
              <a href={p.odkaz} className="hover:underline" target={p.odkaz.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                {p.hodnota}
              </a>
            ) : (
              p.hodnota
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
