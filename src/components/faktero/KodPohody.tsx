import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
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
  vyber,
  odkazNaCiselnik,
}: {
  value: string;
  onChange: (v: string) => void;
  moznosti: MoznostKodu[];
  placeholder?: string;
  className?: string;
  bezPopisu?: boolean;
  ariaLabel?: string;
  /**
   * Rozbaľovacie menu namiesto písania — kódy z číselníka, posledná voľba
   * „Iný kód…“ prepne na písanie. Bez číselníka ostane políčko na písanie.
   */
  vyber?: boolean;
  /** Pri prázdnom číselníku ukáže odkaz na jeho načítanie (len pri hlavnej predkontácii). */
  odkazNaCiselnik?: boolean;
}) {
  const id = useId();
  const [pisat, setPisat] = useState(false);
  const vybrany = moznosti.find((m) => m.kod === value.trim());
  const neznamy = value.trim() && moznosti.length > 0 && !vybrany;
  /*
    Kód, ktorý v ponuke nie je (zadaný ručne alebo z pravidla), sa ukáže ako
    ďalšia voľba — inak by sa menu prepínalo na písanie a po kliknutí by sa
    nič neponúklo.
  */
  if (vyber && moznosti.length > 0 && !pisat) {
    return (
      <>
        <select
          aria-label={ariaLabel}
          value={value.trim()}
          onChange={(e) => {
            if (e.target.value === "__iny__") {
              setPisat(true);
              onChange("");
            } else onChange(e.target.value);
          }}
          className={
            className ??
            "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          }
        >
          <option value="">
            {placeholder && /^[\w.\-]{1,20}$/.test(placeholder) && placeholder !== "nemeniť"
              ? `predvolené: ${placeholder}`
              : placeholder === "nemeniť"
                ? "nemeniť"
                : "—"}
          </option>
          {neznamy ? (
            <option value={value.trim()}>{value.trim()} — nie je v číselníku</option>
          ) : null}
          {moznosti.map((m) => (
            <option key={m.kod} value={m.kod}>
              {m.kod}
              {m.popis ? ` — ${m.popis}` : ""}
              {m.ucty ? ` (${m.ucty})` : ""}
            </option>
          ))}
          <option value="__iny__">Iný kód…</option>
        </select>
        {!bezPopisu && neznamy ? (
          <span className="mt-0.5 block truncate text-xs text-amber-700">
            Kód nie je v číselníku — skontrolujte, či ho Pohoda pozná
          </span>
        ) : null}
      </>
    );
  }
  return (
    <>
      <input
        list={id}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ?? "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        }
      />
      <datalist id={id}>
        {moznosti.map((m) => (
          <option key={m.kod} value={m.kod}>
            {[m.popis, m.ucty].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      {!bezPopisu && (vybrany?.popis || neznamy) ? (
        <span
          className={`mt-0.5 block truncate text-xs ${neznamy ? "text-amber-700" : "text-muted-foreground"}`}
        >
          {neznamy
            ? "Kód nie je v číselníku predkontácií"
            : [vybrany?.popis, vybrany?.ucty].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {vyber && odkazNaCiselnik && !moznosti.length && !bezPopisu ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          <Link to="/uctovnictvo/predkontacie" className="text-primary hover:underline">
            Načítať číselník z Pohody
          </Link>
        </span>
      ) : null}
    </>
  );
}
