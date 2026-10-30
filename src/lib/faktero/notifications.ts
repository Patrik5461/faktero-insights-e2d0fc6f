/**
 * Notifikácie sa nikde neukladajú — počítajú sa pri každom otvorení zvončeka
 * z toho, ako veci naozaj stoja. Ukladá sa len to, čo si kto prečítal.
 *
 * Dôvod: uložené notifikácie starnú. Faktúra sa medzitým zaplatí, transakcia
 * spáruje — a v zvončeku by ostalo visieť niečo, čo už neplatí. Takto zmizne
 * upozornenie v tej istej chvíli, ako pominie dôvod.
 *
 * `key` je zároveň identifikátor prečítania. Musí byť stabilný medzi behmi,
 * inak by sa prečítaná notifikácia vrátila ako nová.
 */

import { formatujMenu } from "./mena";
import { terminyNaRiesenie } from "./vozovy-park";
import { pohybyZastarane } from "./bank-stav-pohybov";

export type NotificationSeverity = "info" | "warning" | "danger";

export type AppNotification = {
  key: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  /** Cesta v aplikácii, kam sa má používateľ po kliknutí dostať. */
  to: string;
  /** Parametre adresy (`?q=…`) — `to` s otáznikom Link ticho zahodí. */
  search?: Record<string, string>;
  /** Hodnoty do `{…}` v `title` a `detail`, nech sa šablóna dá preložiť. */
  params?: Record<string, string | number>;
  /**
   * Zlúčená položka („3 nové eFaktúry“): kľúče jednotlivých upozornení, ktoré
   * zastupuje. Je prečítaná, keď sú prečítané všetky, a prečítaním sa označia.
   */
  kluceClenov?: string[];
  /** Dátum udalosti (YYYY-MM-DD) — podľa neho sa radí. */
  date: string;
  read?: boolean;
};

export type OverdueInvoice = {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  total: number | null;
  currency: string | null;
  due_date: string | null;
};

export type OverduePurchase = {
  id: string;
  invoice_number: string | null;
  supplier_name: string | null;
  amount_total: number | null;
  currency: string | null;
  due_date: string | null;
};

export type UnmatchedIncoming = {
  id: string;
  booking_date: string | null;
  amount: number | null;
  currency: string | null;
  counterparty: string | null;
  variable_symbol: string | null;
};

export type FailedPayment = {
  id: string;
  purchase_invoice_id: string | null;
  creditor_name: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  error_message: string | null;
  updated_at: string | null;
};

export type NotificationInput = {
  /** Dnešný dátum ako YYYY-MM-DD. Berie sa zvonku, nech sa dá testovať. */
  today: string;
  overdueInvoices: OverdueInvoice[];
  overduePurchases: OverduePurchase[];
  unmatchedIncoming: UnmatchedIncoming[];
  failedPayments: FailedPayment[];
  /** Aktívne vozidlá — termíny do 30 dní a prepadnuté. */
  vehicleDeadlines?: VehicleDeadlines[];
  /** Bankové účty, z ktorých sa nedarí sťahovať pohyby (vypršaný súhlas). */
  bankAccountsStale?: BankAccountStale[];
};

export type BankAccountStale = {
  id: string;
  iban: string | null;
  account_name: string | null;
  pohyby_ok_at: string | null;
  pohyby_chyba: string | null;
};

const SEVERITY_ORDER: Record<NotificationSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function formatMoney(amount: number | null, currency: string | null): string {
  // Neznámy kód meny rieši `formatujMenu` — vypíše číslo a kód vedľa neho
  // namiesto toho, aby `Intl` vyhodil výnimku a zvonček ostal prázdny.
  return formatujMenu(amount, currency || "EUR");
}

/** Počet celých dní medzi dvoma dátumami v tvare YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * „1 deň / {dni} dni / {dni} dní po splatnosti" ako šablóna na preklad — tri
 * tvary ako v slovenčine (čeština ich má rovnako, nemčina dva). Číslo ide do
 * `params.dni`.
 */
export function poSplatnosti(n: number): string {
  if (n === 1) return "1 deň po splatnosti";
  if (n >= 2 && n <= 4) return "{dni} dni po splatnosti";
  return "{dni} dní po splatnosti";
}

/** „platnosť končí o 1 deň / {dni} dni / {dni} dní" — šablóna termínu vozidla. */
function konciO(n: number): string {
  if (n === 1) return "{termin} {vozidlo}: platnosť končí o 1 deň";
  if (n >= 2 && n <= 4) return "{termin} {vozidlo}: platnosť končí o {dni} dni";
  return "{termin} {vozidlo}: platnosť končí o {dni} dní";
}

/** YYYY-MM-DD (aj s časom) → „01. 10. 2026“ — tvar, ktorý zvonček používal. */
function datumSk(d: string): string {
  return d.slice(0, 10).split("-").reverse().join(". ");
}

/** „3 dni", „1 deň", „12 dní" — slovenčina má tri tvary. */
export function dniText(n: number): string {
  if (n === 1) return "1 deň";
  if (n >= 2 && n <= 4) return `${n} dni`;
  return `${n} dní`;
}

/** Vozidlo z vozového parku s termínmi (STK, poistky, známka, servis). */
export type VehicleDeadlines = {
  id: string;
  name: string | null;
  license_plate: string | null;
  stk_do?: string | null;
  ek_do?: string | null;
  pzp_do?: string | null;
  havarijne_do?: string | null;
  dialnicna_znamka_do?: string | null;
  servis_datum?: string | null;
};

export function buildNotifications(input: NotificationInput): AppNotification[] {
  const out: AppNotification[] = [];

  for (const f of input.overdueInvoices) {
    if (!f.due_date) continue;
    const dni = daysBetween(f.due_date, input.today);
    if (dni <= 0) continue;
    out.push({
      key: `invoice_overdue:${f.id}`,
      // Mesiac po splatnosti je iná situácia než včerajšia splatnosť.
      severity: dni > 30 ? "danger" : "warning",
      // Šablóny s {…} namiesto hotového textu — inak by zvonček v CZ/DE ostal po slovensky.
      title: f.invoice_number
        ? `Faktúra {cislo} je ${poSplatnosti(dni)}`
        : `Faktúra je ${poSplatnosti(dni)}`,
      detail: f.customer_name ? "{odberatel} · {suma}" : "Neznámy odberateľ · {suma}",
      params: {
        cislo: f.invoice_number ?? "",
        dni,
        odberatel: f.customer_name ?? "",
        suma: formatMoney(f.total, f.currency),
      },
      to: `/faktury/${f.id}`,
      date: f.due_date,
    });
  }

  for (const f of input.overduePurchases) {
    if (!f.due_date) continue;
    const dni = daysBetween(f.due_date, input.today);
    if (dni <= 0) continue;
    out.push({
      key: `purchase_overdue:${f.id}`,
      severity: dni > 30 ? "danger" : "warning",
      title: f.invoice_number ? "Neuhradená prijatá faktúra {cislo}" : "Neuhradená prijatá faktúra",
      detail: f.supplier_name
        ? `{dodavatel} · {suma} · ${poSplatnosti(dni)}`
        : `Neznámy dodávateľ · {suma} · ${poSplatnosti(dni)}`,
      params: {
        cislo: f.invoice_number ?? "",
        dni,
        dodavatel: f.supplier_name ?? "",
        suma: formatMoney(f.amount_total, f.currency),
      },
      to: `/prijate-faktury/${f.id}`,
      date: f.due_date,
    });
  }

  for (const t of input.unmatchedIncoming) {
    if (!t.booking_date) continue;
    out.push({
      key: `bank_unmatched:${t.id}`,
      severity: "info",
      title: "Nepriradená platba {suma}",
      params: { suma: formatMoney(t.amount, t.currency) },
      detail: [
        t.counterparty ?? "Neznáma protistrana",
        t.variable_symbol ? `VS ${t.variable_symbol}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      to: "/bankove-ucty/transakcie",
      date: t.booking_date,
    });
  }

  for (const p of input.failedPayments) {
    const date = (p.updated_at ?? "").slice(0, 10) || input.today;
    out.push({
      key: `payment_failed:${p.id}`,
      severity: "danger",
      title: "Platba {suma} neprešla",
      // Dôvod ide ako hodnota do {dovod} — známe dôvody zvonček preloží, cudzí text banky ostane.
      detail: p.creditor_name ? "{prijemca} · {dovod}" : "Neznámy príjemca · {dovod}",
      params: {
        suma: formatMoney(p.amount, p.currency),
        prijemca: p.creditor_name ?? "",
        dovod: dovodNeuspesnejPlatby(p.error_message, p.status),
      },
      to: p.purchase_invoice_id ? `/prijate-faktury/${p.purchase_invoice_id}` : "/bankove-ucty",
      date,
    });
  }

  for (const u of input.bankAccountsStale ?? []) {
    if (!pohybyZastarane(u, new Date(`${input.today}T12:00:00Z`))) continue;
    const ucet = u.account_name || u.iban || "";
    out.push({
      // Dátum v kľúči: po obnovení súhlasu a ďalšom výpadku je to nový oznam.
      key: `bank_pohyby:${u.id}:${(u.pohyby_ok_at ?? "nikdy").slice(0, 10)}`,
      severity: "danger",
      // Šablóny — názov účtu a dôvod (z `popisChybyPohybov`) sú hodnoty, dôvod sa preloží.
      title: ucet ? "Z účtu {ucet} sa nesťahujú pohyby" : "Z účtu sa nesťahujú pohyby",
      detail: u.pohyby_ok_at ? "naposledy {naposledy} · {chyba}" : "{chyba}",
      params: {
        ucet,
        naposledy: u.pohyby_ok_at ? datumSk(u.pohyby_ok_at) : "",
        chyba: u.pohyby_chyba ?? "",
      },
      to: "/bankove-ucty",
      date: (u.pohyby_ok_at ?? input.today).slice(0, 10),
    });
  }

  for (const v of input.vehicleDeadlines ?? []) {
    // „vozidla“ s kontextom — samotné slovo by sa v slovníku bilo s iným „vozidla“.
    const vozidlo = v.license_plate || v.name || "zvoncek::vozidla";
    for (const t of terminyNaRiesenie(v, input.today)) {
      out.push({
        // Dátum v kľúči: po predĺžení STK je to nový termín, nie prečítaný starý.
        key: `vehicle_deadline:${v.id}:${t.kluc}:${t.datum}`,
        severity: t.stav === "prepadnute" ? "danger" : "warning",
        // „platnosť“ drží rod — STK, PZP aj servis majú rôzny a „prepadla“ by sedelo len na STK.
        // Názov termínu (STK, PZP …) je hodnota v {termin}, preloží sa zvlášť.
        title:
          t.stav === "prepadnute"
            ? "{termin} {vozidlo}: platnosť skončila"
            : t.dni === 0
              ? "{termin} {vozidlo}: platnosť končí dnes"
              : konciO(t.dni),
        detail: v.name ? "{nazov} · platnosť do {datum}" : "platnosť do {datum}",
        params: {
          termin: t.nazov,
          vozidlo,
          dni: t.dni,
          nazov: v.name ?? "",
          datum: datumSk(t.datum),
        },
        to: `/vozovy-park/${v.id}`,
        date: t.datum,
      });
    }
  }

  // Najprv to najhoršie. V rámci rovnakej závažnosti platí, že pri dlhoch je
  // najstarší dátum najhorší (najdlhšie po splatnosti), kým pri oznamoch je
  // zaujímavé to najčerstvejšie.
  out.sort((a, b) => {
    const podlaZavaznosti = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (podlaZavaznosti !== 0) return podlaZavaznosti;
    return a.severity === "info" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  return out;
}

/*
  Dôvody zamietnutia platby podľa ISO 20022 (reasonCode z banky). Banka ich
  niekedy pošle len ako kód, niekedy s textom za ním.
*/
const KODY_ZAMIETNUTIA: Record<string, string> = {
  AC01: "nesprávne číslo účtu",
  AC04: "účet je zrušený",
  AC06: "účet je zablokovaný",
  AG01: "na účte nie je táto platba povolená",
  AM02: "suma prekračuje povolený limit",
  AM04: "nedostatok prostriedkov na účte",
  AM05: "duplicitná platba",
  BE05: "neznámy príkazca",
  DUPL: "duplicitná platba",
  FF01: "neplatný formát platby",
  MS02: "dôvod neuviedol klient",
  MS03: "dôvod neuviedla banka",
  RC01: "nesprávny kód banky (BIC)",
  RR01: "chýbajú údaje vyžadované predpismi",
  RR02: "chýbajú údaje vyžadované predpismi",
  RR03: "chýbajú údaje vyžadované predpismi",
  RR04: "chýbajú údaje vyžadované predpismi",
  CUST: "zrušené na žiadosť klienta",
  FRAD: "podozrenie na podvod",
};

/*
  Stavy a hlášky platobnej brány (GoPay a pod.) a technické hlášky odoslania.
  Poradie je dôležité — prvá zhoda vyhráva.
*/
const VZORY_DOVODOV: [RegExp, string][] = [
  [/^\s*banka platbu zamietla\s*$/i, "banka platbu zamietla"],
  [/^\s*submit_failed\s*$/i, "odoslanie zlyhalo"],
  [/insufficient[_ ]funds|not enough (funds|money)/i, "nedostatok prostriedkov na účte"],
  [/(card|karta).*(expired)|expired[_ ]card/i, "platnosť karty vypršala"],
  [/^\s*TIMEOUTED\s*$/i, "platba vypršala"],
  [/timed?[_ ]?out/i, "banka neodpovedala včas"],
  [/^\s*CANCEL+ED\s*$|^\s*canceled by (the )?(payer|user|customer)\s*$/i, "platba bola zrušená"],
  [/^\s*REFUNDED\s*$/i, "platba bola vrátená"],
  [/^\s*(declined|rejected|RJCT)\s*$|card declined|payment declined/i, "banka platbu zamietla"],
  [/3-?d[- ]?secure|authentication failed|\bSCA\b/i, "overenie platby (3-D Secure) zlyhalo"],
];

/**
 * Dôvod neúspešnej platby ako text na preklad. Známe hodnoty (kódy ISO 20022,
 * stavy platobnej brány, hlášky odoslania) prevedie na slovenskú vetu, ktorú
 * slovník pozná; neznámy voľný text z banky či brány vráti nezmenený.
 */
export function dovodNeuspesnejPlatby(sprava: string | null, status: string | null): string {
  const s = String(sprava ?? "").trim();
  if (!s) return stavText(status);
  const kod = /^([A-Z]{2}\d{2}|DUPL|CUST|FRAD)\b/.exec(s)?.[1];
  if (kod && KODY_ZAMIETNUTIA[kod]) return KODY_ZAMIETNUTIA[kod];
  for (const [vzor, text] of VZORY_DOVODOV) if (vzor.test(s)) return text;
  return s;
}

function stavText(status: string | null): string {
  switch (status) {
    case "rejected":
      return "banka platbu zamietla";
    case "failed":
      return "odoslanie zlyhalo";
    case "cancelled":
      return "platba bola zrušená";
    default:
      return "neznámy stav";
  }
}

/**
 * Text notifikácie v jazyku rozhrania. Preloží sa šablóna aj textové hodnoty
 * v `params` — napríklad režim DPH („Neplatiteľ DPH“) je hodnota, nie šablóna.
 * Mená a čísla dokladov v slovníku nie sú, tie prejdú nezmenené.
 */
export function textNotifikacie(
  n: Pick<AppNotification, "title" | "detail" | "params">,
  pole: "title" | "detail",
  t: (text: string, params?: Record<string, string | number>) => string,
): string {
  const params = n.params
    ? Object.fromEntries(
        Object.entries(n.params).map(([k, v]) => [k, typeof v === "string" && v ? t(v) : v]),
      )
    : undefined;
  return t(n[pole], params);
}

/** Kľúče na zápis prečítania — pri zlúčenej položke aj kľúče jej členov. */
export function kluceNaPrecitanie(items: Pick<AppNotification, "key" | "kluceClenov">[]): string[] {
  return [...new Set(items.flatMap((n) => [n.key, ...(n.kluceClenov ?? [])]))];
}

/** Doplní príznak prečítania a spočíta neprečítané. */
export function applyReadState(
  items: AppNotification[],
  readKeys: Iterable<string>,
): { items: AppNotification[]; unread: number } {
  const read = new Set(readKeys);
  const withState = items.map((n) => ({
    ...n,
    read:
      read.has(n.key) ||
      (!!n.kluceClenov?.length && n.kluceClenov.every((k) => read.has(k))),
  }));
  return { items: withState, unread: withState.filter((n) => !n.read).length };
}

/**
 * Lehota z iného dokladu (predpis, exekúcia, list úradu) ako položka zvončeka.
 * Šablóny s {…} — druh dokladu sa preloží ako hodnota, odosielateľ a predmet
 * prejdú nezmenené. Kľúč nesie aj dátum: posunutá lehota je nový oznam.
 */
export function notifikaciaLehoty(
  d: {
    id: string;
    due_date: string | null;
    po: boolean;
    sender?: string | null;
    subject?: string | null;
  },
  druh: string,
): AppNotification {
  const datum = String(d.due_date ?? "");
  const detail =
    d.sender && d.subject
      ? "{odosielatel} · {predmet} · lehota {datum}"
      : d.sender
        ? "{odosielatel} · lehota {datum}"
        : d.subject
          ? "{predmet} · lehota {datum}"
          : "lehota {datum}";
  return {
    key: `ostatne-lehota:${d.id}:${datum}`,
    severity: d.po ? "danger" : "warning",
    title: d.po ? "Zmeškaná lehota: {druh}" : "Blíži sa lehota: {druh}",
    detail,
    params: {
      druh,
      odosielatel: d.sender ?? "",
      predmet: d.subject ?? "",
      datum: datumSk(datum),
    },
    to: "/ostatne-doklady",
    date: datum,
  };
}

/**
 * Odpoveď odberateľa na cenovú ponuku. Meno a poznámka odberateľa sú hodnoty,
 * zvyšok šablóna — inak by v CZ/DE ostal popis po slovensky.
 */
export function notifikaciaOdpovedeNaPonuku(q: {
  id: string;
  quote_number: string | null;
  status: string;
  responded_at: string | null;
  response_note?: string | null;
  customer_name?: string | null;
}): AppNotification {
  const prijata = q.status === "accepted";
  const meno = q.customer_name ?? "";
  const poznamka = q.response_note ? String(q.response_note).slice(0, 120) : "";
  return {
    key: `ponuka-odpoved:${q.id}:${q.status}`,
    severity: "info",
    title: prijata ? "Ponuka {cislo} bola prijatá" : "Ponuka {cislo} bola zamietnutá",
    detail: prijata
      ? meno
        ? "{odberatel} ponuku prijal — dá sa premeniť na faktúru."
        : "Odberateľ ponuku prijal — dá sa premeniť na faktúru."
      : poznamka
        ? meno
          ? "{odberatel}: {poznamka}"
          : "Odberateľ: {poznamka}"
        : meno
          ? "{odberatel} ponuku zamietol."
          : "Odberateľ ponuku zamietol.",
    params: { cislo: q.quote_number ?? "", odberatel: meno, poznamka },
    to: "/ponuky",
    date: String(q.responded_at ?? "").slice(0, 10),
  };
}

/** Zdroj nespracovaných dokladov: počet a najnovší riadok. */
export type ZdrojNespracovanych = {
  pocet: number;
  najnovsi: { id: string; created_at: string } | null;
} | null;

/**
 * Jedna položka „N nespracovaných dokladov“ zo všetkých zdrojov (doklady
 * z e-mailu a nahratia, bločky zo skenu) — rovnaký súčet ako odznak
 * Nespracované v menu. Vedie do Nespracovaných: `/doklady` sa otvára na
 * spracovaných bločkoch. Kľúč nesie najnovší doklad, takže po prečítaní sa
 * zvonček ozve znova až pri ďalšom.
 */
export function notifikaciaNespracovanych(zdroje: ZdrojNespracovanych[]): AppNotification[] {
  const platne = zdroje.filter((z): z is NonNullable<ZdrojNespracovanych> => Boolean(z));
  const count = platne.reduce((a, z) => a + Math.max(0, z.pocet), 0);
  const najnovsi = platne
    .map((z) => z.najnovsi)
    .filter((x): x is { id: string; created_at: string } => Boolean(x))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!count || !najnovsi) return [];
  return [
    {
      key: `doklady-nespracovane:${najnovsi.id}`,
      severity: "info",
      // Šablóna s {n}, nie hotové číslo v texte — inak by sa v CZ/DE nepreložila.
      title:
        count === 1
          ? "1 nespracovaný doklad"
          : count < 5
            ? "{n} nespracované doklady"
            : "{n} nespracovaných dokladov",
      params: { n: count },
      detail:
        count === 1
          ? "Čaká na kontrolu a označenie ako spracovaný."
          : "Čakajú na kontrolu a označenie ako spracované.",
      to: "/nespracovane",
      date: String(najnovsi.created_at).slice(0, 10),
    },
  ];
}
