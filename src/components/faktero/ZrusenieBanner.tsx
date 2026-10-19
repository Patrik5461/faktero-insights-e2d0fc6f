import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { dniDoZrusenia, terminSlovom } from "@/lib/faktero/ucet-zrusenie";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

/**
 * Pripomienka, že účet má naplánované zrušenie.
 *
 * Odklad má zmysel len vtedy, keď je o ňom vidieť. Preto to nie je schované v
 * nastaveniach, ale nad každou stránkou, kým lehota beží.
 */
export function ZrusenieBanner({ zrusiSa }: { zrusiSa: string }) {
  const { t, jazyk } = useT();
  const dni = dniDoZrusenia(zrusiSa);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0">
        {t("Účet je naplánovaný na zrušenie")}{" "}
        <strong>{terminSlovom(zrusiSa, lokalJazyka(jazyk))}</strong>{" "}
        {t(
          dni === 1
            ? "— o {n} deň. Do vtedy sa nič nemaže."
            : dni >= 2 && dni <= 4
              ? "— o {n} dni. Do vtedy sa nič nemaže."
              : "— o {n} dní. Do vtedy sa nič nemaže.",
          { n: dni },
        )}
      </span>
      <Link
        to="/nastavenia"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        {t("Odvolať žiadosť")}
      </Link>
    </div>
  );
}
