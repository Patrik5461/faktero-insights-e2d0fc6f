import { Link } from "@tanstack/react-router";
import { useRezimDph } from "@/lib/faktero/krajina-firmy";
import { nazovSchemy } from "@/lib/faktero/dph-rezim";
import { useT } from "@/lib/i18n/useT";

/**
 * Prečo na doklade nie sú sadzby DPH.
 *
 * Bez tejto vety vyzerá zmiznutý stĺpec DPH ako chyba programu. Platiteľovi sa
 * nezobrazuje nič — jemu je všetko po starom.
 */
export function PoznamkaRezimuDph() {
  const rezim = useRezimDph();
  const { t, jazyk } = useT();
  if (rezim.platitel) return null;
  const schema = nazovSchemy(rezim.schema);
  return (
    <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {t("Firma je vedená ako {schema}, doklady sa preto vystavujú bez DPH.", {
        // Nemčina píše podstatné mená s veľkým písmenom, slovenčina a čeština nie.
        schema: jazyk === "de" ? t(schema) : t(schema).toLowerCase(),
      })}{" "}
      <Link to="/firma" className="underline">
        {t("Zmeniť v nastaveniach firmy")}
      </Link>
      .
    </p>
  );
}
