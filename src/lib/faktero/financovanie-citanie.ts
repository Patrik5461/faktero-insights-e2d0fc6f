/**
 * Prečítané údaje zo zmluvy o financovaní — čistá časť.
 *
 * Model vracia čísla ako string, riadky v ľubovoľnom poradí a občas aj riadok
 * navyše (hlavičku tabuľky, akontáciu). Táto vrstva to upratuje a je bez
 * databázy aj bez siete, takže sa dá otestovať. Volanie modelu je vedľa v
 * `financovanie-citanie.server.ts`.
 */

export type PrecitanaSplatka = {
  number: number;
  due_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  vat_amount: number;
  remaining_principal: number;
};

export type PrecitanaZmluva = {
  kind: "leasing" | "uver" | null;
  provider_name: string | null;
  contract_number: string | null;
  variable_symbol: string | null;
  currency: string | null;
  principal: number | null;
  interest_rate: number | null;
  term_months: number | null;
  first_due_date: string | null;
  interest_from: string | null;
  payment_amount: number | null;
  vat_rate: number | null;
  down_payment: number | null;
  residual_value: number | null;
  splatky: PrecitanaSplatka[];
  /** Čo v dokumente nesedelo — ukáže sa človeku, nie je to chyba. */
  vyhrady: string[];
};

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function cislo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function datum(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  return DATUM.test(s) ? s : null;
}

function text(v: unknown, max = 200): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

/** Zaokrúhlenie na centy — model občas vráti 12.340000000000002. */
function centy(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Riadky kalendára: zoradia sa, prečíslujú od jednotky a doplnia sa nuly.
 * Číslovanie z dokumentu sa nepreberá — pri kalendároch, kde je prvý riadok
 * akontácia alebo hlavička, by sa poradie rozsypalo.
 */
export function normalizujSplatky(surove: unknown): PrecitanaSplatka[] {
  if (!Array.isArray(surove)) return [];
  return surove
    .map((r: any) => ({
      due_date: datum(r?.due_date),
      amount: cislo(r?.amount),
      principal_part: cislo(r?.principal_part) ?? 0,
      interest_part: cislo(r?.interest_part) ?? 0,
      vat_amount: cislo(r?.vat_amount) ?? 0,
      remaining_principal: cislo(r?.remaining_principal) ?? 0,
      poradie: cislo(r?.number) ?? 0,
    }))
    .filter((r) => r.due_date && r.amount !== null && r.amount > 0)
    .sort((a, b) =>
      a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : a.poradie - b.poradie,
    )
    .map((r, i) => ({
      number: i + 1,
      due_date: r.due_date!,
      amount: centy(r.amount!),
      principal_part: centy(r.principal_part),
      interest_part: centy(r.interest_part),
      vat_amount: centy(r.vat_amount),
      remaining_principal: centy(r.remaining_principal),
    }));
}

/**
 * Kontroly, ktoré vie spraviť aj človek očami — a preto ich má vidieť.
 * Nič neopravujú, len povedia, čo v prečítanom nesedí.
 */
export function vyhradyKuKalendaru(z: {
  principal: number | null;
  splatky: PrecitanaSplatka[];
  term_months: number | null;
}): string[] {
  const vyhrady: string[] = [];
  if (z.splatky.length === 0) {
    vyhrady.push("V dokumente sa nenašiel splátkový kalendár — kalendár dopočíta Faktero.");
    return vyhrady;
  }
  const istiny = centy(z.splatky.reduce((s, r) => s + r.principal_part, 0));
  if (z.principal && Math.abs(istiny - z.principal) > 1) {
    vyhrady.push(
      `Súčet istín v kalendári je ${istiny.toFixed(2)}, financovaná suma ${z.principal.toFixed(2)} — skontrolujte to.`,
    );
  }
  if (z.term_months && z.term_months !== z.splatky.length) {
    vyhrady.push(
      `Zmluva hovorí o ${z.term_months} splátkach, kalendár má ${z.splatky.length} riadkov.`,
    );
  }
  const bezRozpadu = z.splatky.filter(
    (r) => r.principal_part === 0 && r.interest_part === 0,
  ).length;
  if (bezRozpadu === z.splatky.length) {
    vyhrady.push(
      "Kalendár nemá rozpad na istinu a úrok — na zaúčtovanie ho budete musieť doplniť.",
    );
  }
  return vyhrady;
}

export function normalizujOdpoved(parsed: any): PrecitanaZmluva {
  const riadky = normalizujSplatky(parsed?.splatky);
  const principal = cislo(parsed?.principal);
  const term = cislo(parsed?.term_months);

  const zmluva: PrecitanaZmluva = {
    kind: parsed?.kind === "uver" || parsed?.kind === "leasing" ? parsed.kind : null,
    provider_name: text(parsed?.provider_name),
    contract_number: text(parsed?.contract_number, 100),
    variable_symbol: text(parsed?.variable_symbol, 30),
    currency: text(parsed?.currency, 3) ?? "EUR",
    principal,
    interest_rate: cislo(parsed?.interest_rate),
    // Počet mesiacov z kalendára je spoľahlivejší než veta v zmluve.
    term_months: riadky.length || (term ? Math.round(term) : null),
    first_due_date: riadky[0]?.due_date ?? datum(parsed?.first_due_date),
    interest_from: datum(parsed?.interest_from),
    payment_amount: cislo(parsed?.payment_amount) ?? riadky[0]?.amount ?? null,
    vat_rate: cislo(parsed?.vat_rate),
    down_payment: cislo(parsed?.down_payment),
    residual_value: cislo(parsed?.residual_value),
    splatky: riadky,
    vyhrady: [],
  };

  zmluva.vyhrady = vyhradyKuKalendaru({
    principal: zmluva.principal,
    splatky: riadky,
    term_months: term ? Math.round(term) : null,
  });
  if (!zmluva.first_due_date) {
    zmluva.vyhrady.push(
      "Splatnosť prvej splátky sa v dokumente nenašla — doplňte ju, inak sa kalendár dopočíta od zlého dátumu.",
    );
  }
  return zmluva;
}

/** Prázdna odpoveď vyzerá ako úspech, ale nie je. */
export function jePouzitelna(z: PrecitanaZmluva): boolean {
  return !!z.principal || z.splatky.length > 0 || !!z.provider_name;
}
