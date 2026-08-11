import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { dniDoZrusenia, terminSlovom } from "@/lib/faktero/ucet-zrusenie";
import { DNI, sPoctom } from "@/lib/faktero/mnozne";

/**
 * Pripomienka, že účet má naplánované zrušenie.
 *
 * Odklad má zmysel len vtedy, keď je o ňom vidieť. Preto to nie je schované v
 * nastaveniach, ale nad každou stránkou, kým lehota beží.
 */
export function ZrusenieBanner({ zrusiSa }: { zrusiSa: string }) {
  const dni = dniDoZrusenia(zrusiSa);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0">
        Účet je naplánovaný na zrušenie <strong>{terminSlovom(zrusiSa)}</strong> — o{" "}
        {sPoctom(dni, DNI)}. Do vtedy sa nič nemaže.
      </span>
      <Link
        to="/nastavenia"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        Odvolať žiadosť
      </Link>
    </div>
  );
}
