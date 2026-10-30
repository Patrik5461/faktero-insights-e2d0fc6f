/**
 * Admin → Využitie zdrojov: denné odhady z logov Supabase (čisté výpočty).
 *
 * Logy sú od 2026 v jednej ClickHouse tabuľke `logs`, zdroj je v stĺpci
 * `source` (edge_logs, realtime_logs, function_edge_logs…), polia v mape
 * `log_attributes['…']`. Overené proti projektu 2026-10-30:
 * - veľkosť odpovede je `log_attributes['response.headers.content_length']`,
 *   ale brána ju zapíše len pri odpovediach s pevnou dĺžkou — pri REST
 *   chýba asi pri polovici (komprimované / streamované odpovede);
 * - služba je druhý úsek cesty (`/rest/v1/…` → `rest`, `/storage/v1/…` → `storage`).
 *
 * Bez serverového kódu — používa ho hook, server aj stránka.
 */

/** Jeden dotaz na deň (limit rýchlosti Management API je prísny). */
export const SQL_DEN = [
  "select source,",
  "splitByChar('/', log_attributes['request.path'])[2] as sluzba,",
  "log_attributes['response.headers.cf_cache_status'] as cache,",
  "count() as pocet,",
  "countIf(log_attributes['response.headers.content_length'] != '') as s_dlzkou,",
  "sum(toUInt64OrZero(log_attributes['response.headers.content_length'])) as bajty",
  "from logs",
  "where source in ('edge_logs', 'realtime_logs', 'function_edge_logs')",
  "group by source, sluzba, cache",
].join(" ");

export type RiadokDetailu = {
  source: string;
  sluzba: string;
  cache: string;
  pocet: number;
  s_dlzkou: number;
  bajty: number;
};

export type DenZLogov = {
  egress_bytes: number;
  egress_measured_bytes: number;
  responses_total: number;
  responses_without_length: number;
  realtime_messages: number;
  edge_invocations: number;
  detail: RiadokDetailu[];
};

const n = (x: unknown): number => {
  const v = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

/**
 * Odpoveď endpointu `analytics/endpoints/logs` → súčty za deň.
 * API vracia `{ result: [...] }`, pri chybe dotazu `{ error: ... }` (aj s HTTP 200).
 */
export function spracujOdpovedLogov(odpoved: unknown): DenZLogov {
  const o = odpoved as { result?: unknown; error?: unknown } | null;
  if (!o || typeof o !== "object") throw new Error("neočakávaný tvar odpovede");
  if (o.error) {
    const sprava =
      typeof o.error === "string"
        ? o.error
        : typeof (o.error as any)?.message === "string"
          ? (o.error as any).message
          : "chyba dotazu";
    throw new Error(`logy: ${sprava}`);
  }
  if (!Array.isArray(o.result)) throw new Error("neočakávaný tvar odpovede");

  const detail: RiadokDetailu[] = o.result.map((r: any) => ({
    source: String(r?.source ?? ""),
    sluzba: String(r?.sluzba ?? ""),
    cache: String(r?.cache ?? ""),
    pocet: n(r?.pocet),
    s_dlzkou: n(r?.s_dlzkou),
    bajty: n(r?.bajty),
  }));

  const den: DenZLogov = {
    egress_bytes: 0,
    egress_measured_bytes: 0,
    responses_total: 0,
    responses_without_length: 0,
    realtime_messages: 0,
    edge_invocations: 0,
    detail,
  };

  // Priemer veľkosti odpovede po službách (cez všetky cache stavy).
  const sluzby = new Map<string, { pocet: number; s_dlzkou: number; bajty: number }>();
  for (const r of detail) {
    if (r.source === "realtime_logs") den.realtime_messages += r.pocet;
    else if (r.source === "function_edge_logs") den.edge_invocations += r.pocet;
    else if (r.source === "edge_logs") {
      den.responses_total += r.pocet;
      den.responses_without_length += Math.max(0, r.pocet - r.s_dlzkou);
      den.egress_measured_bytes += r.bajty;
      const s = sluzby.get(r.sluzba) ?? { pocet: 0, s_dlzkou: 0, bajty: 0 };
      s.pocet += r.pocet;
      s.s_dlzkou += r.s_dlzkou;
      s.bajty += r.bajty;
      sluzby.set(r.sluzba, s);
    }
  }
  // Odpovede bez content-length dopočíta priemer odpovedí tej istej služby.
  // Služba bez jedinej zmeranej odpovede (napr. realtime websocket) sa nedopočíta.
  let dopocitane = 0;
  for (const s of sluzby.values()) {
    const bez = Math.max(0, s.pocet - s.s_dlzkou);
    if (bez > 0 && s.s_dlzkou > 0) dopocitane += (s.bajty / s.s_dlzkou) * bez;
  }
  den.egress_bytes = Math.round(den.egress_measured_bytes + dopocitane);
  return den;
}

/** Deň v tvare YYYY-MM-DD (UTC). */
export function denUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Hranice dňa pre `iso_timestamp_start/end` (rozsah musí byť do 24 h). */
export function hraniceDna(den: string): { start: string; end: string } {
  return { start: `${den}T00:00:00Z`, end: `${den}T23:59:59.999Z` };
}

/**
 * Celé dni (včera a staršie, najviac `dni` dozadu), ktoré v tabuľke chýbajú,
 * od najnovšieho. Retencia logov na Pro je 7 dní, starší deň by bol neúplný.
 */
export function chybajuceDni(teraz: Date, ulozene: Iterable<string>, dni = 6): string[] {
  const mame = new Set(ulozene);
  const out: string[] = [];
  for (let i = 1; i <= dni; i++) {
    const d = denUtc(new Date(teraz.getTime() - i * 86400000));
    if (!mame.has(d)) out.push(d);
  }
  return out;
}

export type DenVyuzitia = {
  date: string;
  egress_bytes: number;
  realtime_messages: number;
  edge_invocations: number;
  egress_measured_bytes?: number;
  responses_total?: number;
  responses_without_length?: number;
};

export type SuctyMesiaca = {
  /** Prvý deň obdobia (kalendárny mesiac v UTC). */
  od: string;
  /** Posledný deň, za ktorý je uložený údaj (null = žiadny). */
  do: string | null;
  dni: number;
  egress_bytes: number;
  egress_measured_bytes: number;
  responses_total: number;
  responses_without_length: number;
  realtime_messages: number;
  edge_invocations: number;
};

/**
 * Súčet za aktuálny kalendárny mesiac (UTC). Fakturačný cyklus organizácie
 * Management API neposkytuje, preto kalendárny mesiac.
 */
export function suctyMesiaca(riadky: DenVyuzitia[], teraz: Date): SuctyMesiaca {
  const od = `${denUtc(teraz).slice(0, 7)}-01`;
  const dnes = denUtc(teraz);
  const s: SuctyMesiaca = {
    od,
    do: null,
    dni: 0,
    egress_bytes: 0,
    egress_measured_bytes: 0,
    responses_total: 0,
    responses_without_length: 0,
    realtime_messages: 0,
    edge_invocations: 0,
  };
  for (const r of riadky) {
    if (r.date < od || r.date > dnes) continue;
    s.dni++;
    if (!s.do || r.date > s.do) s.do = r.date;
    s.egress_bytes += n(r.egress_bytes);
    s.egress_measured_bytes += n(r.egress_measured_bytes ?? r.egress_bytes);
    s.responses_total += n(r.responses_total);
    s.responses_without_length += n(r.responses_without_length);
    s.realtime_messages += n(r.realtime_messages);
    s.edge_invocations += n(r.edge_invocations);
  }
  return s;
}

/**
 * Kartu „Volania edge funkcií“ ukázať, len keď projekt nejaké funkcie má.
 * Počet funkcií z API má prednosť; keď ho nevieme, rozhodnú volania z logov.
 */
export function zobrazitEdgeFunkcie(pocetFunkcii: number | null, volania: number | null): boolean {
  if (pocetFunkcii != null) return pocetFunkcii > 0;
  return (volania ?? 0) > 0;
}

/** Podiel dopočítaného egressu v percentách (0–100), null bez dát. */
export function podielDopocitaneho(
  s: Pick<SuctyMesiaca, "egress_bytes" | "egress_measured_bytes">,
): number | null {
  if (!(s.egress_bytes > 0)) return null;
  return Math.max(0, Math.min(100, (1 - s.egress_measured_bytes / s.egress_bytes) * 100));
}

export const ODKAZ_SUPABASE_USAGE = "https://supabase.com/dashboard/org/_/usage";
