import { normVs } from "./parovanie";
import { zaokruhli } from "./financovanie";

/**
 * Kontokorentný úver — čistá časť (bez databázy a siete, dá sa otestovať).
 *
 * Kontokorent je iný než leasing a úver: **nemá splátkový kalendár**. Je to
 * úverový rámec na bežnom účte — firma ide do mínusu do výšky limitu, banka raz
 * za mesiac alebo štvrťrok strhne z účtu úrok z vyčerpanej sumy a prípadne
 * poplatok za rámec. Istina sa „spláca" každým príjmom na účet.
 *
 * Párovať sa teda nedá k splátkam, ale k samotným strhnutým úrokom a
 * poplatkom. A tu je pasca: „úrok" a „poplatok" sú na výpise všade — úrok zo
 * splátkového úveru, poplatok za vedenie účtu, daň z kreditného úroku. Preto
 * sa automaticky páruje len pohyb, ktorý
 *   1. je **z účtu, na ktorom rámec je**, a
 *   2. v texte **výslovne hovorí o kontokorente** (kontokorent, debetný úrok,
 *      povolené prečerpanie, úverový rámec…).
 * Holé „Úroky" na tom účte je len návrh pre človeka. Holý „Poplatok" nie je
 * ani návrh — poplatkov za vedenie účtu je na výpise každý mesiac viac.
 */

export type DruhFinancovania = "leasing" | "uver" | "kontokorent";

export const DRUHY_FINANCOVANIA: { kluc: DruhFinancovania; nazov: string }[] = [
  { kluc: "leasing", nazov: "Leasing" },
  { kluc: "uver", nazov: "Úver" },
  { kluc: "kontokorent", nazov: "Kontokorentný úver" },
];

export function nazovDruhuFinancovania(kind: string | null | undefined): string {
  return DRUHY_FINANCOVANIA.find((d) => d.kluc === kind)?.nazov ?? "Úver";
}

export function jeKontokorent(kind: string | null | undefined): boolean {
  return kind === "kontokorent";
}

export type ObdobieUrocenia = "mesacne" | "stvrtrocne";

export const OBDOBIA_UROCENIA: { kluc: ObdobieUrocenia; nazov: string }[] = [
  { kluc: "mesacne", nazov: "mesačne" },
  { kluc: "stvrtrocne", nazov: "štvrťročne" },
];

/* ------------------------------------------------------------------ *
 * Účet podľa IBAN
 * ------------------------------------------------------------------ */

export function normIban(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
}

/** Je to vôbec IBAN? Nech sa do zmluvy neuloží číslo zmluvy omylom. */
export function jeIban(v: string | null | undefined): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(normIban(v));
}

/**
 * Napojený účet firmy, na ktorom je rámec. Porovnáva sa celý IBAN — číslo
 * účtu bez predčíslia by sa mohlo zhodovať s iným účtom v inej banke.
 */
export function uctPodlaIban<T extends { id: string; iban: string | null }>(
  iban: string | null | undefined,
  ucty: T[],
): T | null {
  const hladany = normIban(iban);
  if (!jeIban(hladany)) return null;
  const zhody = ucty.filter((u) => normIban(u.iban) === hladany);
  return zhody.length === 1 ? zhody[0]! : null;
}

/* ------------------------------------------------------------------ *
 * Stav rámca
 * ------------------------------------------------------------------ */

export type StavRamca =
  | { znamy: false }
  | {
      znamy: true;
      zostatok: number;
      /** Koľko z rámca firma práve čerpá (kladné číslo). */
      cerpanie: number;
      volny: number;
      /**
       * Odkiaľ je zostatok. Disponibilný zostatok banky býva aj **s rámcom**
       * (vlastné peniaze + nevyčerpaný limit), takže sa berie len vtedy, keď
       * zaúčtovaný chýba — a človeku sa to povie.
       */
      zdroj: "zauctovany" | "disponibilny";
    };

function cisloAleboNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function stavRamca(
  limit: number | null | undefined,
  ucet: { balance?: unknown; booked_balance?: unknown } | null | undefined,
): StavRamca {
  if (!ucet) return { znamy: false };
  const zauctovany = cisloAleboNull(ucet.booked_balance);
  const disponibilny = cisloAleboNull(ucet.balance);
  const zostatok = zauctovany ?? disponibilny;
  if (zostatok === null) return { znamy: false };
  const ramec = Math.max(0, Number(limit) || 0);
  const cerpanie = zaokruhli(Math.max(0, -zostatok));
  return {
    znamy: true,
    zostatok: zaokruhli(zostatok),
    cerpanie,
    volny: zaokruhli(Math.max(0, ramec - cerpanie)),
    zdroj: zauctovany !== null ? "zauctovany" : "disponibilny",
  };
}

/* ------------------------------------------------------------------ *
 * Rozpoznanie úroku a poplatku z kontokorentu v pohybe
 * ------------------------------------------------------------------ */

/** Banky píšu bez diakritiky aj veľkými písmenami — porovnáva sa holý text. */
function holy(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Úrok — „úrok", „úroky", „úroku", „úročenie", české „úrok"; anglicky interest. */
const UROK = /\buro[kc]|\binterest\b/;
/** Poplatok, provízia (záväzková provízia = poplatok za nevyčerpaný rámec). */
const POPLATOK = /poplat|provizi|\bfee\b|\bcena za\b/;

/**
 * Text, ktorý **výslovne** hovorí o kontokorente. „Debet" sám nestačí — je aj
 * v „debetnej karte"; berie sa len v spojení s úrokom alebo zostatkom. Rámec
 * len ako celé slovo — „v rámci balíka" nie je úverový rámec.
 */
const KONTOKORENT =
  /kontokorent|\bktk\b|precerpa|povolen\w* debet|debetn\w* uro|uro\w* debetn|uro\w* z debetu|debetn\w* zostat|uverov\w* ram[ce]|\bramec\b|\bramca\b|revolving|overdraft|nevycerpan|zavazkov\w* provizi|commitment fee/;

/**
 * Čo s kontokorentom určite nemá nič: daň z úroku (zráža sa z kreditného
 * úroku), poplatky za kartu, splátka úveru (UZF = splátka podľa banky).
 */
const NIE_KONTOKORENT = /\bdan\b|\bdane\b|zrazkov|\bkart|kreditn\w* uro|uro\w* kreditn|\bpripisan/;

export type RozpoznanyPoplatok = {
  druh: "urok" | "poplatok";
  /** Text výslovne hovorí o kontokorente — smie sa párovať automaticky. */
  isty: boolean;
};

export function rozpoznajPoplatokKontokorentu(p: {
  description?: string | null;
  counterparty?: string | null;
}): RozpoznanyPoplatok | null {
  const popis = holy(p.description);
  const text = `${popis} ${holy(p.counterparty)}`.trim();
  if (!text) return null;
  if (/^\s*uzf/.test(popis)) return null;
  if (NIE_KONTOKORENT.test(text)) return null;

  const kontext = KONTOKORENT.test(text);
  // Splátka je splátka úveru alebo leasingu — pokiaľ výslovne nejde o kontokorent.
  if (!kontext && /splatk|leasing/.test(text)) return null;

  const urok = UROK.test(text);
  const poplatok = POPLATOK.test(text);

  if (kontext) {
    if (urok) return { druh: "urok", isty: true };
    if (poplatok) return { druh: "poplatok", isty: true };
    // „Kontokorent 09/2026" — banka nepovie, čo to je; najčastejšie úrok.
    return { druh: "urok", isty: false };
  }
  // Holý úrok na účte s rámcom — asi kontokorent, ale môže to byť aj úrok z
  // iného úveru strhnutý z toho istého účtu. Rozhodne človek.
  if (urok && !/\buver|\bpozick|hypotek|\bloan\b/.test(text)) return { druh: "urok", isty: false };
  return null;
}

/* ------------------------------------------------------------------ *
 * Párovanie
 * ------------------------------------------------------------------ */

export type PohybNaUcte = {
  id: string;
  bank_account_id: string | null;
  booking_date: string;
  /** Strhnutý úrok je odchádzajúci pohyb — záporná suma. */
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
};

export type KontokorentNaSparovanie = {
  id: string;
  name: string;
  bank_account_id: string | null;
  currency: string;
  status: string;
};

export type ZhodaPoplatku = {
  transactionId: string;
  contractId: string;
  druh: "urok" | "poplatok";
  suma: number;
  datum: string;
  istota: "auto" | "navrh";
  dovody: string[];
};

/**
 * Úroky a poplatky z kontokorentu medzi pohybmi.
 *
 * `vsZmluv` sú variabilné symboly leasingov a úverov firmy: pohyb s takým
 * symbolom je splátka zo splátkového kalendára a kontokorentu sa netýka, aj
 * keby v jeho texte bolo slovo „úrok".
 */
export function sparujPoplatkyKontokorentu(
  pohyby: PohybNaUcte[],
  zmluvy: KontokorentNaSparovanie[],
  vsZmluv: (string | null | undefined)[] = [],
): { auto: ZhodaPoplatku[]; navrhy: ZhodaPoplatku[] } {
  const symbolySplatok = new Set(vsZmluv.map((v) => normVs(v)).filter((v) => v.length >= 3));
  const aktivne = zmluvy.filter((z) => z.status === "active" && z.bank_account_id);
  const auto: ZhodaPoplatku[] = [];
  const navrhy: ZhodaPoplatku[] = [];

  for (const p of pohyby) {
    if (!(p.amount < 0) || !p.bank_account_id) continue;
    const vs = normVs(p.variable_symbol);
    if (vs && symbolySplatok.has(vs)) continue;

    const kandidati = aktivne.filter(
      (z) =>
        z.bank_account_id === p.bank_account_id && (z.currency || "EUR") === (p.currency || "EUR"),
    );
    if (kandidati.length === 0) continue;

    const r = rozpoznajPoplatokKontokorentu(p);
    if (!r) continue;

    const dovody = [
      r.druh === "urok" ? "úrok strhnutý z účtu s rámcom" : "poplatok strhnutý z účtu s rámcom",
    ];
    if (r.isty) dovody.push("text hovorí o kontokorente");
    else dovody.push("text kontokorent výslovne nespomína");
    // Banka si úrok strhne sama, bez symbolu. Pohyb so symbolom je skôr platba.
    if (vs) dovody.push(`pohyb má variabilný symbol ${p.variable_symbol}`);
    if (kandidati.length > 1) dovody.push("na účte je viac zmlúv o kontokorente");

    const iste = r.isty && !vs && kandidati.length === 1;
    for (const z of kandidati) {
      const zhoda: ZhodaPoplatku = {
        transactionId: p.id,
        contractId: z.id,
        druh: r.druh,
        suma: zaokruhli(Math.abs(p.amount)),
        datum: p.booking_date,
        istota: iste ? "auto" : "navrh",
        dovody,
      };
      (iste ? auto : navrhy).push(zhoda);
    }
  }
  return { auto, navrhy };
}

/** Súčty strhnutých úrokov a poplatkov — na detail zmluvy. */
export function suctyPoplatkov(riadky: { kind: string; amount: unknown }[]): {
  uroky: number;
  poplatky: number;
} {
  let uroky = 0;
  let poplatky = 0;
  for (const r of riadky) {
    const n = Number(r.amount) || 0;
    if (r.kind === "poplatok") poplatky += n;
    else uroky += n;
  }
  return { uroky: zaokruhli(uroky), poplatky: zaokruhli(poplatky) };
}
