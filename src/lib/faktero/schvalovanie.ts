/*
  Schvaľovanie dokladov — ako v Doklado.

  Cesta má úrovne od najnižšej po najvyššiu, v každej jeden či viac
  schvaľovateľov. Schválenie vyššou úrovňou platí aj za nižšie; doklad je
  schválený, keď ho schváli najvyššia úroveň. Bez cesty (jednoduché
  schvaľovanie) stačí jedno schválenie majiteľom, správcom alebo účtovníkom.

  Čisté funkcie bez databázy, aby sa dali skúšať.
*/

export type AgendaSchvalovania = "doklad" | "prijata" | "vystavena" | "nespracovany" | "vyuctovanie";

/** Všetky agendy v poradí, v akom sa ukazujú v nastavení. */
export const AGENDY_SCHVALOVANIA: AgendaSchvalovania[] = [
  "doklad",
  "vystavena",
  "prijata",
  "nespracovany",
  "vyuctovanie",
];
export type StavSchvalovania = "caka" | "schvaleny" | "zamietnuty" | "vrateny";
export type Urovne = string[][];

/** Zástupca v ceste: manažér zákazky, na ktorú je doklad (projektový manažér). */
export const MANAZER_ZAKAZKY = "manazer";

/**
 * Cesta pre konkrétny doklad: „manažér zákazky" sa nahradí skutočným
 * manažérom; keď doklad zákazku s manažérom nemá, z úrovne vypadne a
 * prázdna úroveň sa vynechá.
 */
export function rozvinUrovne(urovne: Urovne, manazerId: string | null | undefined): Urovne {
  return urovne
    .map((l) => [...new Set(l.flatMap((u) => (u === MANAZER_ZAKAZKY ? (manazerId ? [manazerId] : []) : [u])))])
    .filter((l) => l.length > 0);
}

export const NAZVY_AGEND: Record<AgendaSchvalovania, string> = {
  doklad: "Bločky a doklady",
  prijata: "Prijaté faktúry",
  vystavena: "Vystavené faktúry",
  nespracovany: "Nespracované doklady",
  vyuctovanie: "Vyúčtovanie výdavkov",
};

export const NAZVY_STAVOV: Record<StavSchvalovania, string> = {
  caka: "Čaká na schválenie",
  schvaleny: "Schválený",
  zamietnuty: "Zamietnutý",
  vrateny: "Vrátený na opravu",
};

/** Roly, ktoré schvaľujú pri jednoduchom schvaľovaní (bez cesty). */
export const ROLY_SCHVALOVATELOV = ["owner", "admin", "accountant"];

export type Podmienky = {
  agenda?: AgendaSchvalovania | "";
  ico?: string;
  suma_od?: number | null;
  predkontacia?: string;
};

export type Cesta = {
  id: string;
  nazov: string;
  urovne: Urovne;
  podmienky: Podmienky;
  predvolena: boolean;
  poradie?: number;
};

export type DokladNaSchvalenie = {
  agenda: AgendaSchvalovania;
  ico?: string | null;
  suma?: number | null;
  predkontacia?: string | null;
};

export function nacitajUrovne(v: unknown): Urovne {
  if (!Array.isArray(v)) return [];
  return v
    .map((u) => (Array.isArray(u) ? u.map((x) => String(x)).filter(Boolean) : []))
    .filter((u) => u.length > 0);
}

/** Pravidlo sedí, keď sedí každá vyplnená podmienka. */
export function cestaSedi(c: Cesta, d: DokladNaSchvalenie): boolean {
  const p = c.podmienky ?? {};
  if (p.agenda && p.agenda !== d.agenda) return false;
  if (p.ico?.trim() && p.ico.trim() !== String(d.ico ?? "").trim()) return false;
  if (p.suma_od != null && !(Math.abs(Number(d.suma ?? 0)) >= Number(p.suma_od))) return false;
  if (p.predkontacia?.trim() && p.predkontacia.trim() !== String(d.predkontacia ?? "").trim())
    return false;
  return true;
}

/**
 * Cesta pre doklad: prvé zhodné pravidlo (v poradí), inak predvolená,
 * inak žiadna (jednoduché schvaľovanie).
 */
export function vyberCestu(cesty: Cesta[], d: DokladNaSchvalenie): Cesta | null {
  const zoradene = [...cesty].sort((a, b) => (a.poradie ?? 0) - (b.poradie ?? 0));
  const pravidlo = zoradene.find(
    (c) => !c.predvolena && Object.values(c.podmienky ?? {}).some((x) => x !== "" && x != null) && cestaSedi(c, d),
  );
  if (pravidlo) return pravidlo;
  return zoradene.find((c) => c.predvolena && cestaSedi({ ...c, podmienky: { agenda: c.podmienky?.agenda } }, d)) ?? null;
}

/** Najvyššia úroveň (1…n), v ktorej je používateľ; 0 = v ceste nie je. */
export function urovenPouzivatela(urovne: Urovne, userId: string): number {
  let u = 0;
  urovne.forEach((l, i) => {
    if (l.includes(userId)) u = i + 1;
  });
  return u;
}

/*
  Povolenia po používateľoch (Nastavenia → Schvaľovanie). Nič neuložené =
  podľa roly ako doteraz: kto je v ceste, smie všetko; bez cesty rozhoduje
  majiteľ, správca a účtovník. Uložené povolenia sa správajú ako závora —
  odobratá „Zamietnutie" platí aj pre toho, kto je v ceste. Bez cesty
  uložené povolenie zároveň urobí z kohokoľvek schvaľovateľa. Majiteľ má
  vždy všetko.
*/
export type PravoSchvalovania = "schvalit" | "zrusit" | "vratit" | "zamietnut";
export type PravaSchvalovania = Record<PravoSchvalovania, boolean>;

export const PRAVA_SCHVALOVANIA: { kluc: PravoSchvalovania; nazov: string }[] = [
  { kluc: "schvalit", nazov: "Schvaľovanie" },
  { kluc: "zrusit", nazov: "Zrušenie schválenia" },
  { kluc: "vratit", nazov: "Vrátenie" },
  { kluc: "zamietnut", nazov: "Zamietnutie" },
];

const VSETKO: PravaSchvalovania = { schvalit: true, zrusit: true, vratit: true, zamietnut: true };

/** Uložené povolenia z `company_users.schvalovanie_prava`; čokoľvek iné = nič uložené. */
export function nacitajPrava(v: unknown): PravaSchvalovania | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return {
    schvalit: o.schvalit === true,
    zrusit: o.zrusit === true,
    vratit: o.vratit === true,
    zamietnut: o.zamietnut === true,
  };
}

/** Povolenia človeka a či sú výslovne nastavené (nie len podľa roly). */
export function pravaClena(
  rola: string | null | undefined,
  ulozene: unknown,
): { prava: PravaSchvalovania; vyslovne: boolean } {
  if (rola === "owner") return { prava: VSETKO, vyslovne: true };
  const p = nacitajPrava(ulozene);
  return p ? { prava: p, vyslovne: true } : { prava: VSETKO, vyslovne: false };
}

type Zaznam = { urovne: Urovne; schvalena_uroven: number; stav: StavSchvalovania };

/** Smie človek v tomto stave dokladu urobiť schválenie, vrátenie či zamietnutie? */
export function mozeRozhodnut(
  s: Zaznam,
  userId: string,
  rola: string | null | undefined,
  akcia: "schvalit" | "vratit" | "zamietnut",
  ulozenePrava?: unknown,
): boolean {
  if (s.stav === "schvaleny" || s.stav === "zamietnuty") return false;
  const { prava, vyslovne } = pravaClena(rola, ulozenePrava);
  if (!prava[akcia]) return false;
  if (!s.urovne.length) return ROLY_SCHVALOVATELOV.includes(String(rola ?? "")) || vyslovne;
  return urovenPouzivatela(s.urovne, userId) > s.schvalena_uroven;
}

export function mozeSchvalit(
  s: Zaznam,
  userId: string,
  rola: string | null | undefined,
  ulozenePrava?: unknown,
): boolean {
  return mozeRozhodnut(s, userId, rola, "schvalit", ulozenePrava);
}

/** Smie meniť už rozhodnutý doklad (zrušiť schválenie, zamietnutie)? */
export function mozeZrusit(
  s: { urovne: Urovne },
  userId: string,
  rola: string | null | undefined,
  ulozenePrava?: unknown,
): boolean {
  const { prava, vyslovne } = pravaClena(rola, ulozenePrava);
  if (!prava.zrusit) return false;
  if (["owner", "admin"].includes(String(rola ?? ""))) return true;
  if (!s.urovne.length) return ROLY_SCHVALOVATELOV.includes(String(rola ?? "")) || vyslovne;
  return urovenPouzivatela(s.urovne, userId) === s.urovne.length;
}

/** Stav po schválení používateľom. */
export function poSchvaleni(
  s: { urovne: Urovne; schvalena_uroven: number },
  userId: string,
): { schvalena_uroven: number; stav: StavSchvalovania } {
  if (!s.urovne.length) return { schvalena_uroven: 1, stav: "schvaleny" };
  const u = Math.max(s.schvalena_uroven, urovenPouzivatela(s.urovne, userId));
  return { schvalena_uroven: u, stav: u >= s.urovne.length ? "schvaleny" : "caka" };
}

/** Ikona stavu ako v Doklado: „2/3", „✓ 3/3", „0/0". */
export function odznak(s: { urovne: Urovne; schvalena_uroven: number; stav: StavSchvalovania }): string {
  const n = s.urovne.length || 1;
  const u = s.stav === "schvaleny" ? n : Math.min(s.schvalena_uroven, n);
  if (s.stav === "schvaleny") return `✓ ${u}/${n}`;
  if (s.stav === "zamietnuty") return "✗ zamietnutý";
  if (s.stav === "vrateny") return "← vrátený";
  return `${u}/${n}`;
}
