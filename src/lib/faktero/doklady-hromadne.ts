/*
  Hromadné a riadkové úpravy dokladov v zoznamoch — čisté pravidlá, ktoré
  zdieľa prehliadač (zámok v riadku) aj server (hromadná akcia).

  Účtovné údaje (predkontácia, členenie DPH a KV, typ platby, účtovná
  poznámka) sa na doklade odovzdanom do Pohody, zamknutom alebo v uzavretom
  období nemenia — v Pohode či v podanom priznaní by sa rozišli. Pracovné
  značky (vlastný stav, štítky, komentár) zámok nepozná: do účtovníctva nejdú.
*/

export type AgendaDokladu = "prijata" | "doklad" | "vystavena" | "ostatny";

export type DovodZamku = "odovzdany" | "zamknuty" | "obdobie";

export const NAZOV_ZAMKU: Record<DovodZamku, string> = {
  odovzdany: "Odovzdaný do účtovníctva — najprv ho vráťte z Pohody",
  zamknuty: "Zamknutý doklad",
  obdobie: "Uzavreté obdobie — doklad sa už nedá meniť",
};

/** Dátum, podľa ktorého doklad patrí do obdobia (ako spúšťač `guard_locked_period`). */
export function datumObdobia(r: { issue_date?: string | null }): string | null {
  return r.issue_date ? String(r.issue_date).slice(0, 10) : null;
}

/**
 * Prečo sa účtovné údaje dokladu nedajú meniť (alebo `null`, keď sa dajú).
 * `vPohode` je pri vystavenej faktúre história odovzdania (export_logs).
 */
export function dovodZamku(
  r: { exported_at?: string | null; locked_at?: string | null; issue_date?: string | null },
  zamknuteDo: string | null | undefined,
  vPohode = false,
): DovodZamku | null {
  if (r.exported_at || vPohode) return "odovzdany";
  if (r.locked_at) return "zamknuty";
  const d = datumObdobia(r);
  if (zamknuteDo && d && d <= String(zamknuteDo).slice(0, 10)) return "obdobie";
  return null;
}

export const MAX_STITKOV = 5;

/** Štítky po pridaní a odobratí — bez duplicít (bez ohľadu na veľkosť písmen), najviac päť. */
export function upravStitky(
  povodne: string[] | null | undefined,
  pridat?: string | null,
  odobrat?: string | null,
): { stitky: string[]; plne: boolean } {
  let s = (povodne ?? []).filter(Boolean);
  const o = odobrat?.trim().toLowerCase();
  if (o) s = s.filter((x) => x.toLowerCase() !== o);
  const p = pridat?.trim().slice(0, 40);
  if (p && !s.some((x) => x.toLowerCase() === p.toLowerCase())) {
    if (s.length >= MAX_STITKOV) return { stitky: s, plne: true };
    s = [...s, p];
  }
  return { stitky: s, plne: false };
}

/** Stav po označení za uhradenú / neuhradenú (null = nemeniť, doklad sa preskočí). */
export function stavPoUhrade(
  agenda: "prijata" | "vystavena",
  r: { status?: string | null; zauctovane_at?: string | null; sent_at?: string | null },
  uhradene: boolean,
): string | null {
  const s = String(r.status ?? "");
  if (s === "cancelled" || s === "draft") return null;
  if (uhradene) return s === "paid" ? null : "paid";
  if (s !== "paid") return null;
  if (agenda === "prijata") return r.zauctovane_at ? "booked" : "received";
  return r.sent_at ? "sent" : "issued";
}

/* --------------------------------------------------------------- stavy */

export type FarbaStavu = "siva" | "modra" | "zelena" | "oranzova" | "cervena" | "fialova";

export const FARBY_STAVU: { kod: FarbaStavu; nazov: string; trieda: string }[] = [
  { kod: "siva", nazov: "Sivá", trieda: "bg-secondary text-foreground/80" },
  { kod: "modra", nazov: "Modrá", trieda: "bg-sky-500/15 text-sky-800 dark:text-sky-300" },
  {
    kod: "zelena",
    nazov: "Zelená",
    trieda: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  },
  {
    kod: "oranzova",
    nazov: "Oranžová",
    trieda: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  { kod: "cervena", nazov: "Červená", trieda: "bg-red-500/15 text-red-800 dark:text-red-300" },
  {
    kod: "fialova",
    nazov: "Fialová",
    trieda: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  },
];

export function triedaFarby(farba: string | null | undefined): string {
  return (FARBY_STAVU.find((f) => f.kod === farba) ?? FARBY_STAVU[0]).trieda;
}

export type StavDokladu = {
  id: string;
  nazov: string;
  farba: string;
  poradie: number;
  aktivne: boolean;
};

/** Stavy, ktoré firma začína používať — ponúkne ich nastavenie jedným klikom. */
export const NAVRHY_STAVOV: { nazov: string; farba: FarbaStavu }[] = [
  { nazov: "Čaká na doklad od klienta", farba: "oranzova" },
  { nazov: "Skontrolovať", farba: "modra" },
  { nazov: "Pripravené na export", farba: "zelena" },
  { nazov: "Sporné", farba: "cervena" },
];

/** Typ platby z hodnoty v databáze (bločky a prijaté majú slovenské, vystavené anglické kódy). */
export function platbaPreZoradenie(
  platba: string | null | undefined,
): "hotovost" | "karta" | "prevod" | null {
  const p = String(platba ?? "");
  if (p === "hotovost" || p === "cash") return "hotovost";
  if (p === "karta" || p === "card") return "karta";
  if (p === "prevod" || p === "bank_transfer") return "prevod";
  return null;
}

/** Typy platby na výber podľa agendy — kódy presne ako v databáze. */
export function typyPlatby(agenda: AgendaDokladu): { kod: string; nazov: string }[] {
  if (agenda === "vystavena")
    return [
      { kod: "bank_transfer", nazov: "Prevod" },
      { kod: "card", nazov: "Karta" },
      { kod: "cash", nazov: "Hotovosť" },
    ];
  return [
    { kod: "prevod", nazov: "Prevod" },
    { kod: "karta", nazov: "Karta" },
    { kod: "hotovost", nazov: "Hotovosť" },
  ];
}

/** Jedna zmena hromadnej akcie (tvar overuje `hromadneDokladyFn`). */
export type AkciaHromadna =
  | { typ: "predkontacia" | "clenenie" | "kv" | "platba"; kod: string | null }
  | { typ: "uctovnaPoznamka" | "komentar"; text: string | null }
  | { typ: "stav"; stavId: string | null }
  | { typ: "stitok"; pridat?: string; odobrat?: string }
  | { typ: "uhrada"; uhradene: boolean; datum?: string };

/** Filtre zoznamu podľa vlastného stavu a štítku (hodnota „_bez" = bez stavu). */
export function filtreStavuAStitkov(
  stavy: StavDokladu[],
  stitky: string[],
): { key: string; label: string; type: "select"; options: { value: string; label: string }[] }[] {
  const f: {
    key: string;
    label: string;
    type: "select";
    options: { value: string; label: string }[];
  }[] = [];
  if (stavy.length)
    f.push({
      key: "stavDokladu",
      label: "Stav dokladu",
      type: "select",
      options: [
        { value: "_bez", label: "Bez stavu" },
        ...stavy.map((s) => ({ value: s.id, label: s.nazov })),
      ],
    });
  if (stitky.length)
    f.push({
      key: "stitok",
      label: "Štítok",
      type: "select",
      options: stitky.map((s) => ({ value: s, label: s })),
    });
  return f;
}

/** Zodpovedá riadok filtru stavu a štítku? (pre zoznamy filtrované v prehliadači) */
export function splnaStavAStitok(
  r: { stav_id?: string | null; stitky?: string[] | null },
  stav: string,
  stitok: string,
): boolean {
  if (stav === "_bez" ? r.stav_id : stav && r.stav_id !== stav) return false;
  if (stitok && !(r.stitky ?? []).includes(stitok)) return false;
  return true;
}
