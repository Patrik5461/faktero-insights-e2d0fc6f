import { useId } from "react";
import type { MoznostKodu } from "@/lib/faktero/predkontacie";

/**
 * Políčko na kód Pohody — predkontáciu alebo členenie DPH.
 *
 * Píše sa voľne (kód nemusí byť v číselníku), ale ponúka sa zoznam s popisom,
 * ako v Doklado. Pod políčkom je popis vybraného kódu, nech je vidieť, čo
 * skratka znamená.
 */
export function KodPohody({
  value,
  onChange,
  moznosti,
  placeholder,
  className,
  bezPopisu,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  moznosti: MoznostKodu[];
  placeholder?: string;
  className?: string;
  bezPopisu?: boolean;
  ariaLabel?: string;
}) {
  const id = useId();
  const vybrany = moznosti.find((m) => m.kod === value.trim());
  const neznamy = value.trim() && moznosti.length > 0 && !vybrany;
  return (
    <>
      <input
        list={id}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"}
      />
      <datalist id={id}>
        {moznosti.map((m) => (
          <option key={m.kod} value={m.kod}>
            {[m.popis, m.ucty].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      {!bezPopisu && (vybrany?.popis || neznamy) ? (
        <span className={`mt-0.5 block truncate text-xs ${neznamy ? "text-amber-700" : "text-muted-foreground"}`}>
          {neznamy ? "Kód nie je v číselníku predkontácií" : [vybrany?.popis, vybrany?.ucty].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </>
  );
}
