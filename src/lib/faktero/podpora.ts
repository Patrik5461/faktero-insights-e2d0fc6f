/*
  Help desk — spoločné pre obrazovky aj server: stavy, kategórie, čísla
  požiadaviek a pravidlo, kedy je odpoveď „neprečítaná".
*/

export type StavPoziadavky = "nova" | "otvorena" | "caka_na_zakaznika" | "vyriesena";
export type KategoriaPoziadavky =
  "otazka" | "chyba" | "napad" | "predplatne" | "diagnostika" | "kontakt";

export const STAVY: { kod: StavPoziadavky; nazov: string; pre: "zakaznik" | "oba" }[] = [
  { kod: "nova", nazov: "Nová", pre: "oba" },
  { kod: "otvorena", nazov: "Rieši sa", pre: "oba" },
  { kod: "caka_na_zakaznika", nazov: "Čaká na vás", pre: "oba" },
  { kod: "vyriesena", nazov: "Vyriešená", pre: "oba" },
];

/** Ako stav vidí podpora — „Čaká na vás" je z pohľadu zákazníka. */
export const STAVY_PODPORA: Record<StavPoziadavky, string> = {
  nova: "Nová",
  otvorena: "Rieši sa",
  caka_na_zakaznika: "Čaká na zákazníka",
  vyriesena: "Vyriešená",
};

/** Kategórie, ktoré si človek vyberá sám. Diagnostika a kontakt vznikajú inak. */
export const KATEGORIE: { kod: KategoriaPoziadavky; nazov: string }[] = [
  { kod: "otazka", nazov: "Otázka, ako niečo spraviť" },
  { kod: "chyba", nazov: "Niečo nefunguje" },
  { kod: "napad", nazov: "Návrh na zlepšenie" },
  { kod: "predplatne", nazov: "Predplatné a platby" },
];

const NAZVY_KATEGORII: Record<KategoriaPoziadavky, string> = {
  otazka: "Otázka",
  chyba: "Chyba",
  napad: "Návrh",
  predplatne: "Predplatné",
  diagnostika: "Diagnostika z appky",
  kontakt: "Kontaktný formulár",
};

export function nazovStavu(s: string | null | undefined): string {
  return STAVY.find((x) => x.kod === s)?.nazov ?? String(s ?? "");
}

export function nazovKategorie(k: string | null | undefined): string {
  return NAZVY_KATEGORII[k as KategoriaPoziadavky] ?? String(k ?? "");
}

/** Číslo, pod ktorým sa na požiadavku odvoláva e-mail aj človek: P-1024. */
export function cisloPoziadavky(cislo: number | null | undefined): string {
  return `P-${cislo ?? "?"}`;
}

/** Predmet z prvého riadku správy, keď ho človek nenapísal (Nahlásiť chybu, appka). */
export function predmetZoSpravy(text: string, max = 80): string {
  const prvy =
    text
      .trim()
      .split(/\r?\n/)
      .find((r) => r.trim()) ?? "";
  const cisty = prvy.replace(/\s+/g, " ").trim();
  if (!cisty) return "Požiadavka bez predmetu";
  return cisty.length > max ? `${cisty.slice(0, max - 1).trimEnd()}…` : cisty;
}

type PrePrecitanie = {
  posledna_od: "zakaznik" | "podpora" | string;
  posledna_sprava_at: string;
  zakaznik_videl_at: string | null;
  podpora_videla_at: string | null;
};

/** Má zákazník neprečítanú odpoveď podpory? */
export function neprecitanaPreZakaznika(p: PrePrecitanie): boolean {
  if (p.posledna_od !== "podpora") return false;
  return !p.zakaznik_videl_at || p.zakaznik_videl_at < p.posledna_sprava_at;
}

/** Čaká na podporu nová správa od zákazníka? */
export function neprecitanaPrePodporu(p: PrePrecitanie): boolean {
  if (p.posledna_od !== "zakaznik") return false;
  return !p.podpora_videla_at || p.podpora_videla_at < p.posledna_sprava_at;
}

/**
 * Stav po novej správe. Odpoveď podpory čaká na zákazníka; keď zákazník
 * odpíše, požiadavka sa vráti podpore — aj vyriešená, lebo napísal, že to
 * vyriešené nie je.
 */
export function stavPoSprave(od: "zakaznik" | "podpora", stary: StavPoziadavky): StavPoziadavky {
  if (od === "podpora") return "caka_na_zakaznika";
  return stary === "nova" ? "nova" : "otvorena";
}

/** Kategória spätnej väzby z appky — diagnostiku posiela appka sama. */
export function kategoriaSpatnejVazby(kind: string, url?: string | null): KategoriaPoziadavky {
  if (url === "app://diagnostika") return "diagnostika";
  return kind === "napad" ? "napad" : "chyba";
}

/* ---------------- Odpovede e-mailom ---------------- */

const PREDPONA_ODPOVEDE = "podpora-";

/** Adresa, na ktorú odpoveď z e-mailu dorazí do vlákna požiadavky. */
export function adresaOdpovede(token: string, domena: string): string {
  return `${PREDPONA_ODPOVEDE}${token}@${domena}`;
}

/** Token z lokálnej časti adresy, alebo `null`, keď to nie je adresa help desku. */
export function tokenZAdresy(localPart: string | null | undefined): string | null {
  const l = String(localPart ?? "").toLowerCase();
  if (!l.startsWith(PREDPONA_ODPOVEDE)) return null;
  const t = l.slice(PREDPONA_ODPOVEDE.length);
  return /^[0-9a-f]{18}$/.test(t) ? t : null;
}

/** Je to (rezervovaná) adresa help desku? Doklady e-mailom si ju zabrať nesmú. */
export function jeAdresaPodpory(localPart: string): boolean {
  return String(localPart).toLowerCase().startsWith(PREDPONA_ODPOVEDE);
}

/** „Meno <adresa@x.sk>" → „adresa@x.sk". */
export function emailOdosielatela(od: string | null | undefined): string {
  const s = String(od ?? "");
  return (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
}

/*
  Riadky, od ktorých začína citovaná staršia korešpondencia. Poštoví klienti
  ju pripájajú pod odpoveď a do vlákna nepatrí — bola by tam každá správa
  znova a znova.
*/
const ZACIATOK_CITACIE = [
  /^on\s.+\swrote:\s*$/i,
  /^.{0,200}\s(napísal|napísala|napísal\(a\)|napsal|napsala|napsal\(a\)):\s*$/i,
  /^(dňa|dna|dne)\s.+$/i,
  /^-{2,}\s*(original message|pôvodná správa|původní zpráva|forwarded message|preposlaná správa)/i,
  /^_{10,}\s*$/,
  /^(from|od):\s.+@/i,
  /^podpora faktera odpovedala na vašu požiadavku/i,
  /^zákazník .+ odpísal na p-\d+/i,
];

/**
 * Z odpovede e-mailom nechá len to, čo človek napísal: bez citovanej staršej
 * pošty a bez podpisu za oddeľovačom „-- ".
 */
export function orezCitaciu(text: string): string {
  const riadky = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const out: string[] = [];
  for (let i = 0; i < riadky.length; i++) {
    const r = riadky[i]!;
    const t = r.trim();
    if (t === "--" || r === "-- ") break;
    if (t.startsWith(">")) break;
    // Gmail láme „On … <adresa@…> wrote:" na dva riadky.
    const sDalsim = `${t} ${(riadky[i + 1] ?? "").trim()}`;
    if (ZACIATOK_CITACIE.some((re) => re.test(t))) break;
    if (/^on\s/i.test(t) && /^on\s.+\swrote:\s*$/i.test(sDalsim)) break;
    out.push(r);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
