/**
 * Referenčné úrokové sadzby — sťahovanie do `referencne_sadzby` a čítanie.
 *
 * Volá ho denný hook kurzov (`/api/public/hooks/kurzy-ecb`). Každý zdroj sa
 * sťahuje zvlášť: výpadok ČNB nesmie zastaviť EURIBOR a nič z toho nesmie
 * zhodiť kurzy. Históriu od roku 2020 nahrá raz `scripts/nahraj-referencne-sadzby.mjs`.
 */
import {
  CNB_PRIBOR_ROK,
  ECB_SERIE,
  citajCnbPriborRok,
  citajEcbCsv,
  ecbUrl,
} from "./referencne-sadzby";
import {
  jePohybliva,
  sadzbaKDnu,
  pridajDni,
  type NastavenieSadzby,
  type ReferencnaSadzba,
  type ReferencnyIndex,
  type RucnaSadzba,
  type SadzbaObdobia,
} from "./pohybliva-sadzba";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
async function stiahniText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "text/csv, text/plain, */*" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

async function uloz(riadky: ReferencnaSadzba[], zdroj: string): Promise<number> {
  if (riadky.length === 0) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < riadky.length; i += 1000) {
    const { error } = await (supabaseAdmin as any).from("referencne_sadzby").upsert(
      riadky.slice(i, i + 1000).map((r) => ({ ...r, zdroj })),
      { onConflict: "index,druh,datum" },
    );
    if (error) throw new Error(error.message);
  }
  return riadky.length;
}

/**
 * Stiahne referenčné sadzby od dátumu `od` (predvolene posledných 70 dní —
 * mesačný priemer za september ECB zverejní až začiatkom októbra).
 */
export async function stiahniReferencneSadzby(od?: string): Promise<{
  ulozenych: number;
  chyby: string[];
}> {
  const zaciatok = od ?? pridajDni(dnesBratislava(), -70);
  let ulozenych = 0;
  const chyby: string[] = [];

  // Zdroje bežia súbežne — hook kurzov má nad sebou strop nginxu.
  const ulohy: Promise<void>[] = [];
  for (const index of Object.keys(ECB_SERIE) as ReferencnyIndex[]) {
    ulohy.push(
      (async () => {
        const riadky = citajEcbCsv(
          await stiahniText(ecbUrl(index, zaciatok)!),
          index,
          ECB_SERIE[index]!.druh,
        );
        ulozenych += await uloz(riadky, "ECB");
      })().catch((e: any) => {
        chyby.push(`${index}: ${String(e?.message ?? e)}`);
      }),
    );
  }
  const rokOd = Number(zaciatok.slice(0, 4));
  const rokDo = new Date().getUTCFullYear();
  for (let rok = rokOd; rok <= rokDo; rok++) {
    ulohy.push(
      (async () => {
        const riadky = citajCnbPriborRok(await stiahniText(`${CNB_PRIBOR_ROK}?year=${rok}`)).filter(
          (r) => r.datum >= zaciatok,
        );
        ulozenych += await uloz(riadky, "CNB");
      })().catch((e: any) => {
        chyby.push(`PRIBOR ${rok}: ${String(e?.message ?? e)}`);
      }),
    );
  }
  await Promise.all(ulohy);
  return { ulozenych, chyby };
}

/** Hodnoty jedného indexu od dátumu — po stránkach (strop 1 000 riadkov). */
export async function nacitajReferencneSadzby(
  klient: any,
  index: string | null | undefined,
  od: string,
): Promise<ReferencnaSadzba[]> {
  if (!index) return [];
  const vysledok: ReferencnaSadzba[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await klient
      .from("referencne_sadzby")
      .select("index, druh, datum, hodnota")
      .eq("index", index)
      .gte("datum", od)
      .order("datum", { ascending: true })
      .order("druh", { ascending: true })
      .range(a, a + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as any[]) {
      vysledok.push({ index: r.index, druh: r.druh, datum: r.datum, hodnota: Number(r.hodnota) });
    }
    if (!data || data.length < 1000) return vysledok;
  }
}

/** Ručne zadané sadzby zmluvy. */
export async function nacitajRucneSadzby(
  klient: any,
  companyId: string,
  contractId: string,
): Promise<(RucnaSadzba & { id: string })[]> {
  const { data } = await klient
    .from("financing_rate_periods")
    .select("id, period_start, rate, source, note")
    .eq("company_id", companyId)
    .eq("contract_id", contractId)
    .order("period_start", { ascending: true });
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    period_start: r.period_start,
    rate: Number(r.rate),
    source: r.source,
    note: r.note,
  }));
}

/**
 * Dnešná celková sadzba pohyblivej zmluvy. Keď index nie je známy vôbec,
 * vráti `null` a ostáva to, čo zmluva mala.
 */
export async function dnesnaSadzba(
  klient: any,
  nast: NastavenieSadzby,
  rucne: RucnaSadzba[] = [],
): Promise<SadzbaObdobia | null> {
  if (!jePohybliva(nast)) return null;
  const dnes = dnesBratislava();
  const sadzby = await nacitajReferencneSadzby(klient, nast.reference_index, pridajDni(dnes, -800));
  const s = sadzbaKDnu(nast, dnes, sadzby, rucne);
  return s.sadzba === null ? null : s;
}

/**
 * Po stiahnutí indexov prepíše `interest_rate` pohyblivých kontokorentov na
 * dnešnú celkovú sadzbu — nech zoznam a náhľady ukazujú aktuálne číslo.
 * Leasingy a úvery sa nemenia: ich kalendár je spočítaný z uloženej sadzby a
 * tichá zmena by ho rozišla so splátkami.
 */
export async function aktualizujSadzbyZmluv(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("financing_contracts")
    .select(
      "id, company_id, kind, interest_rate, rate_type, reference_index, rate_margin, index_floor, fixing_rule, fixing_offset_days, rate_reset, day_count",
    )
    .eq("rate_type", "pohybliva")
    .eq("kind", "kontokorent")
    .eq("status", "active");
  let zmenenych = 0;
  const pamat = new Map<string, ReferencnaSadzba[]>();
  const dnes = dnesBratislava();
  for (const z of (data ?? []) as any[]) {
    const idx = String(z.reference_index ?? "");
    if (!pamat.has(idx))
      pamat.set(idx, await nacitajReferencneSadzby(db, idx, pridajDni(dnes, -800)));
    const rucne = await nacitajRucneSadzby(db, z.company_id, z.id);
    const s = sadzbaKDnu(z, dnes, pamat.get(idx)!, rucne);
    if (s.sadzba === null) continue;
    if (Math.abs(Number(z.interest_rate) - s.sadzba) < 0.00005) continue;
    const { error } = await db
      .from("financing_contracts")
      .update({ interest_rate: s.sadzba })
      .eq("id", z.id);
    if (!error) zmenenych++;
  }
  return zmenenych;
}
