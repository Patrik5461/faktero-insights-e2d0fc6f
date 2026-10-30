/**
 * Každé `toast.error` prejde cez `technickaChyba`.
 *
 * Hlášky ako „TypeError: Failed to fetch“ sa do toastu dostávali na stovkách
 * miest naraz (`toast.error(e.message)`), takže oprava pri zdroji by nikdy
 * nebola úplná. `toast` zo `sonner` je jeden objekt pre celú aplikáciu —
 * nahradením jeho metódy `error` sa preložia všetky naraz. Vlastné vety
 * aplikácie (aj už preložené do češtiny či nemčiny) prejdú bez zmeny.
 */
import { toast } from "sonner";
import { jazykZCookie, preloz } from "@/lib/i18n/jazyk";
import { technickaChyba } from "./chyba-pre-ludi";

const ZNACKA = "__faktero_chyby";

export function prelozHlaskuChyby(sprava: unknown, jazyk = jazykPrehliadaca()): unknown {
  if (typeof sprava !== "string") return sprava;
  const veta = technickaChyba(sprava);
  return veta ? preloz(jazyk, veta) : sprava;
}

function jazykPrehliadaca() {
  try {
    return jazykZCookie(typeof document === "undefined" ? "" : document.cookie);
  } catch {
    return "sk" as const;
  }
}

export function nainstalujPrekladChyb() {
  const t = toast as unknown as Record<string, unknown>;
  if (t[ZNACKA]) return;
  const povodna = toast.error;
  const nova = ((
    sprava: Parameters<typeof toast.error>[0],
    data?: Parameters<typeof toast.error>[1],
  ) => {
    // Technický text sa nestratí úplne — ostane v konzole na ladenie.
    const preklad = prelozHlaskuChyby(sprava);
    if (preklad !== sprava) console.warn("[chyba]", sprava);
    return povodna(preklad as typeof sprava, data);
  }) as typeof toast.error;
  t.error = nova;
  t[ZNACKA] = true;
}

nainstalujPrekladChyb();
