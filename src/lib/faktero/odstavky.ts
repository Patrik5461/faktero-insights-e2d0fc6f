/**
 * Plánované odstávky elektronických služieb inštitúcií (FAK-523, 26. 11. 2026).
 *
 * Tabuľka `odstavky_institucii`. Zdroje (overené 26. 11.):
 *  - fs     Finančná správa — RSS https://www.financnasprava.sk/sk/rss/rss-technicke-informacie
 *           a /sk/rss/rss-novinky; čas v texte „dňa 26.11.2026 od 20:00 hod. do 23:00 hod.“
 *  - upvs   slovensko.sk — tabuľka https://www.slovensko.sk/sk/oznamy/plan-odstavok
 *           (Dátum / Začiatok / Koniec / Plánované aktivity; „Odstávka sa neuskutočnila“)
 *  - sp     Sociálna poisťovňa — RSS https://www.socpoist.sk/rss.xml (odstávky zriedka, voľný text)
 *  - vszp, dovera, union — len tlačové správy, zriedka; zadávajú sa ručne v admine
 *  - rucne  zadané adminom
 *
 * Používatelia vidia len `stav = 'schvalene'` (RLS). Spoločné typy pre server,
 * admin aj pás v aplikácii.
 */

export type ZdrojOdstavky = "fs" | "upvs" | "sp" | "vszp" | "dovera" | "union" | "rucne";
export type StavOdstavky = "navrh" | "schvalene" | "zamietnute";

export type Odstavka = {
  id: string;
  zdroj: ZdrojOdstavky;
  guid: string | null;
  institucia: string;
  sluzba: string | null;
  nazov: string;
  popis: string | null;
  url: string | null;
  zaciatok: string | null;
  koniec: string | null;
  stav: StavOdstavky;
  automaticky: boolean;
  created_at: string;
};

export const INSTITUCIE: Record<ZdrojOdstavky, string> = {
  fs: "Finančná správa",
  upvs: "slovensko.sk",
  sp: "Sociálna poisťovňa",
  vszp: "VšZP",
  dovera: "Dôvera",
  union: "Union ZP",
  rucne: "Iná inštitúcia",
};

/** Odstávka sa ukazuje od 3 dní pred začiatkom do konca (bez konca 24 h od začiatku). */
export const DNI_VOPRED = 3;

export function koniecOdstavky(o: Pick<Odstavka, "zaciatok" | "koniec">): number | null {
  if (o.koniec) return Date.parse(o.koniec);
  if (o.zaciatok) return Date.parse(o.zaciatok) + 24 * 3600_000;
  return null;
}

/** Má sa odstávka teraz ukázať v aplikácii? */
export function jeAktualna(o: Pick<Odstavka, "zaciatok" | "koniec" | "stav">, teraz = Date.now()): boolean {
  if (o.stav !== "schvalene" || !o.zaciatok) return false;
  const od = Date.parse(o.zaciatok);
  const doo = koniecOdstavky(o);
  if (!Number.isFinite(od) || doo == null) return false;
  return teraz <= doo && teraz >= od - DNI_VOPRED * 24 * 3600_000;
}

/**
 * Upozornenie na termín: odstávka Finančnej správy v dňoch 20.–25. v mesiaci
 * padá pred lehotu podania priznania a kontrolného výkazu DPH (25. deň).
 */
export function kolizia(o: Pick<Odstavka, "zdroj" | "zaciatok" | "koniec">): string | null {
  if (o.zdroj !== "fs" || !o.zaciatok) return null;
  const od = new Date(o.zaciatok);
  const doo = new Date(koniecOdstavky(o as any) ?? od.getTime());
  for (let d = new Date(od); d <= doo; d = new Date(d.getTime() + 24 * 3600_000)) {
    const den = Number(new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", day: "numeric" }).format(d));
    if (den >= 20 && den <= 25) return "dph";
  }
  return null;
}
