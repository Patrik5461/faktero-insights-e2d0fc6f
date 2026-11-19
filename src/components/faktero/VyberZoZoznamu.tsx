import { useT } from "@/lib/i18n/useT";
import { VyberKodu } from "./VyberKodu";

/** Voľba výberu — hodnota, ktorú vráti `onChange`, a preložený text. */
export type MoznostZoznamu = { value: string; label: string; popis?: string | null };

/** Od koľkých volieb sa namiesto obyčajného výberu ukáže výber s hľadaním. */
export const PRAH_HLADANIA = 10;

/*
  Výber do hlavičiek dokladov (dodávateľ, odberateľ, pokladňa, rad,
  kategória…). Pri pár voľbách ostane obyčajný <select>; keď ich je viac
  ako PRAH_HLADANIA, je to ten istý výber s hľadaním ako pri kódoch
  (VyberKodu) — písaním sa filtruje bez ohľadu na diakritiku, šípky a Enter
  vyberajú, Escape zavrie.

  Hodnoty sa pred VyberKodu obalia predponou, lebo VyberKodu berie prázdnu
  hodnotu ako „nič nevybraté“ — tu je prázdna hodnota bežná voľba
  („— vyberte —“, predvolený rad).
*/
const obal = (v: string) => `v:${v}`;

export function VyberZoZoznamu({
  value,
  onChange,
  moznosti,
  ariaLabel,
  id,
  className,
  disabled,
  title,
  prah = PRAH_HLADANIA,
}: {
  value: string;
  onChange: (v: string) => void;
  moznosti: MoznostZoznamu[];
  /** Preložený názov poľa — pre čítačku a popis hľadania. */
  ariaLabel: string;
  id?: string;
  /** Trieda políčka — rovnaká ako mal <select>. */
  className?: string;
  disabled?: boolean;
  title?: string;
  prah?: number;
}) {
  const { t } = useT();
  if (moznosti.length <= prah) {
    return (
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        {moznosti.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    );
  }
  const vybrana = moznosti.find((m) => m.value === value);
  return (
    <VyberKodu
      id={id}
      ariaLabel={ariaLabel}
      hodnota={obal(value)}
      moznosti={moznosti.map((m) => ({
        hodnota: obal(m.value),
        text: m.label,
        popis: m.popis,
        bezHodnotyVHladani: true,
      }))}
      textHodnoty={vybrana ? vybrana.label : value || "—"}
      disabled={disabled}
      placeholderHladania={t("Hľadať…")}
      onVyber={(v) => onChange(v.startsWith("v:") ? v.slice(2) : v)}
      className={`${className ?? "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"} vyber-zo-zoznamu`}
    />
  );
}
