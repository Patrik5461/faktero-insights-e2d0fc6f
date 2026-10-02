import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical } from "lucide-react";
import { efakturaRezimFn } from "@/lib/faktero/efaktura/efaktura.functions";

/**
 * Režim eFaktúry sa nemení počas behu servera, tak sa pýta raz a pamätá si.
 * Kým odpoveď nepríde, počíta sa s ostrým režimom — upozornenie radšej
 * o chvíľu neskôr než falošne na každej stránke.
 */
export function useEfakturaTestovaciRezim(): boolean {
  const zisti = useServerFn(efakturaRezimFn);
  const { data } = useQuery({
    queryKey: ["efaktura-rezim"],
    queryFn: () => zisti(),
    staleTime: Infinity,
  });
  return data?.testovaci ?? false;
}

/** Pás nad stránkami eFaktúry, kým beží proti testovaciemu prostrediu. */
export function EfakturaTestovaciRezim({ className = "" }: { className?: string }) {
  const testovaci = useEfakturaTestovaciRezim();
  if (!testovaci) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm ${className}`}
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div>
        <div className="font-semibold text-foreground">eFaktúra beží v testovacom režime</div>
        <p className="mt-0.5 text-muted-foreground">
          Faktúry sa odosielajú do skúšobného prostredia, nie do skutočnej siete Peppol —{" "}
          <strong className="text-foreground">odberateľovi nepríde nič</strong>, hoci doklad bude
          vyzerať ako odoslaný. Faktúru mu pošlite e-mailom.
        </p>
      </div>
    </div>
  );
}
