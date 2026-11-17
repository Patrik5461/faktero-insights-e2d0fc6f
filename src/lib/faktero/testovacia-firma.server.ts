/*
  Serverová strana testovacej firmy (pozri testovacia-firma.ts).

  `zastavAkTestovacia` patrí na začiatok každej cesty, ktorá ide mimo Faktera
  (e-mail, eFaktúra, banka, Pohoda, push, webhooky, platby). Keď sa stav
  firmy nedá zistiť, akcia sa radšej zastaví (fail-closed) — rovnako ako
  strážca odosielania.
*/
import {
  HLASKA_TESTOVACIA_AKCIA,
  TestovaciaFirmaZastavene,
} from "./testovacia-firma";

/** Minimum klienta, ktoré treba (supabaseAdmin aj podvrh v testoch). */
type KlientFiriem = {
  from: (t: "companies") => any;
};

async function predvolenyKlient(): Promise<KlientFiriem> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as KlientFiriem;
}

/** Je firma testovacia? Pri chybe DB vyhodí (volajúci rozhodne, či fail-closed). */
export async function jeTestovaciaFirma(
  companyId: string,
  klient?: KlientFiriem,
): Promise<boolean> {
  const k = klient ?? (await predvolenyKlient());
  const { data, error } = await k
    .from("companies")
    .select("testovacia_pre")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(`Firmu sa nepodarilo overiť: ${error.message}`);
  return !!(data as { testovacia_pre?: string | null } | null)?.testovacia_pre;
}

/**
 * Vyhodí `TestovaciaFirmaZastavene`, keď je firma testovacia. Pri chybe DB
 * vyhodí tiež (fail-closed) — akcia mimo Faktera sa vtedy nespustí.
 */
export async function zastavAkTestovacia(
  companyId: string,
  sprava: string = HLASKA_TESTOVACIA_AKCIA,
  klient?: KlientFiriem,
): Promise<void> {
  let test: boolean;
  try {
    test = await jeTestovaciaFirma(companyId, klient);
  } catch (e) {
    console.error("[testovacia-firma]", companyId, (e as Error)?.message);
    throw new TestovaciaFirmaZastavene(
      "Nepodarilo sa overiť firmu, akcia sa nevykonala. Skúste to o chvíľu znova.",
    );
  }
  if (test) throw new TestovaciaFirmaZastavene(sprava);
}

/** Id testovacích firiem z daného zoznamu (na filtrovanie v cronoch). */
export async function testovacieZoZoznamu(
  companyIds: string[],
  klient?: KlientFiriem,
): Promise<Set<string>> {
  if (!companyIds.length) return new Set();
  const k = klient ?? (await predvolenyKlient());
  const { data, error } = await k
    .from("companies")
    .select("id")
    .in("id", companyIds)
    .not("testovacia_pre", "is", null);
  if (error) throw new Error(`Firmy sa nepodarilo overiť: ${error.message}`);
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}
