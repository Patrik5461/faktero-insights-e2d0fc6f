import { Link } from "@tanstack/react-router";
import { useRezimDph } from "@/lib/faktero/krajina-firmy";
import { nazovSchemy } from "@/lib/faktero/dph-rezim";

/**
 * Prečo na doklade nie sú sadzby DPH.
 *
 * Bez tejto vety vyzerá zmiznutý stĺpec DPH ako chyba programu. Platiteľovi sa
 * nezobrazuje nič — jemu je všetko po starom.
 */
export function PoznamkaRezimuDph() {
  const rezim = useRezimDph();
  if (rezim.platitel) return null;
  return (
    <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      Firma je vedená ako {nazovSchemy(rezim.schema).toLowerCase()}, doklady sa preto vystavujú bez
      DPH.{" "}
      <Link to="/firma" className="underline">
        Zmeniť v nastaveniach firmy
      </Link>
      .
    </p>
  );
}
