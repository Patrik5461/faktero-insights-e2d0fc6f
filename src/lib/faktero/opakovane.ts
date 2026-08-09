/**
 * Posun termínu opakovanej faktúry.
 *
 * Čistá logika zámerne mimo `recurring.server.ts` — ten na prvom riadku
 * načítava servisného klienta a v teste by sa nedal importovať.
 */

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

function dvojcifre(n: number): string {
  return String(n).padStart(2, "0");
}

function naISO(d: Date): string {
  return `${d.getUTCFullYear()}-${dvojcifre(d.getUTCMonth() + 1)}-${dvojcifre(d.getUTCDate())}`;
}

/** Počet dní v mesiaci; `mesiac` je 0–11 ako v `Date`. */
export function dniVMesiaci(rok: number, mesiac: number): number {
  return new Date(Date.UTC(rok, mesiac + 1, 0)).getUTCDate();
}

/**
 * Pripočíta mesiace a **oreže deň na koniec mesiaca**, keď v cieľovom mesiaci
 * neexistuje.
 *
 * `setUTCMonth` sám o sebe pretečie: z 31. januára spraví 31. február, čo je
 * 3. marec. Mesačná faktúra vystavovaná na konci mesiaca by tak február úplne
 * preskočila a odvtedy by chodila 3. v mesiaci.
 */
export function pripocitajMesiace(datum: string, mesiacov: number): string {
  const d = new Date(datum + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return datum;
  const den = d.getUTCDate();
  const cielovyMesiac = d.getUTCMonth() + mesiacov;
  const rok = d.getUTCFullYear() + Math.floor(cielovyMesiac / 12);
  const mesiac = ((cielovyMesiac % 12) + 12) % 12;
  return naISO(new Date(Date.UTC(rok, mesiac, Math.min(den, dniVMesiaci(rok, mesiac)))));
}

/** Ďalší termín podľa frekvencie. */
export function advanceNextRun(base: string | Date, freq: Frequency): string {
  const iso = typeof base === "string" ? base.slice(0, 10) : naISO(base);
  switch (freq) {
    case "weekly": {
      const d = new Date(iso + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 7);
      return naISO(d);
    }
    case "monthly":
      return pripocitajMesiace(iso, 1);
    case "quarterly":
      return pripocitajMesiace(iso, 3);
    case "yearly":
      return pripocitajMesiace(iso, 12);
    default:
      return iso;
  }
}
