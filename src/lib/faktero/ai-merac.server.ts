/**
 * Zápis jedného volania modelu.
 *
 * Merať sa musí na jednom mieste, lebo poskytovateľ sa vyberá až za behu:
 * z toho, čo si vypýtala agenda, sa nedá zistiť, či nakoniec odpovedal Gemini,
 * alebo sa platila náhrada u OpenAI.
 *
 * Zápis nesmie zhodiť ani zdržať samotné rozpoznávanie — keď sa nepodarí,
 * ostane len v logu.
 */

export type ZaznamAi = {
  poskytovatel: "gemini" | "openai";
  model: string;
  /** Agenda, ktorá si model vypýtala. Kľúče sú v `ai-cennik.ts`. */
  ucel?: string;
  firma?: string | null;
  vstupneTokeny?: number | null;
  vystupneTokeny?: number | null;
  trvanieMs?: number;
  ok: boolean;
  /** true, keď sa na tohto poskytovateľa šlo až po zlyhaní predošlého. */
  nahrada?: boolean;
  chyba?: string | null;
};

function maKamZapisovat(): boolean {
  // Testy bežia s ostrými premennými z `.env`, takže bez tejto poistky by si
  // meranie zapisovalo riadky do produkčnej tabuľky.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return false;
  return Boolean(
    process.env.SUPABASE_URL &&
    (process.env.FAKTERO_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

/** Záznam prepísaný na riadok tabuľky. */
export function naRiadok(z: ZaznamAi) {
  return {
    poskytovatel: z.poskytovatel,
    model: z.model,
    ucel: z.ucel || "neznáme",
    company_id: z.firma ?? null,
    vstupne_tokeny: z.vstupneTokeny ?? null,
    vystupne_tokeny: z.vystupneTokeny ?? null,
    trvanie_ms: z.trvanieMs ?? null,
    ok: z.ok,
    nahrada: z.nahrada ?? false,
    // Celé telo odpovede modelu do stĺpca nepatrí — na rozpoznanie príčiny
    // stačí začiatok hlášky.
    chyba: z.chyba ? String(z.chyba).slice(0, 500) : null,
  };
}

/** Nečaká sa naň — volajúci pokračuje ďalej. */
export function zapisPouzitie(z: ZaznamAi): void {
  if (!maKamZapisovat()) return;
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("ai_pouzitie").insert(naRiadok(z));
      if (error) console.warn("[ai] využitie sa nezapísalo:", error.message);
    } catch (e) {
      console.warn("[ai] využitie sa nezapísalo:", String((e as Error)?.message ?? e));
    }
  })();
}

export type Tokeny = { vstup?: number | null; vystup?: number | null };

/**
 * Obalí volanie poskytovateľa meraním. `volanie` dostane funkciu, ktorou
 * ohlási spotrebované tokeny — tie chodia až v odpovedi.
 */
export async function zmeraj<T>(
  meta: Omit<ZaznamAi, "ok" | "trvanieMs" | "vstupneTokeny" | "vystupneTokeny" | "chyba">,
  volanie: (ohlasTokeny: (t: Tokeny) => void) => Promise<T>,
): Promise<T> {
  const zaciatok = Date.now();
  let tokeny: Tokeny = {};
  try {
    const vysledok = await volanie((t) => {
      tokeny = t;
    });
    zapisPouzitie({
      ...meta,
      ok: true,
      trvanieMs: Date.now() - zaciatok,
      vstupneTokeny: tokeny.vstup ?? null,
      vystupneTokeny: tokeny.vystup ?? null,
    });
    return vysledok;
  } catch (e) {
    zapisPouzitie({
      ...meta,
      ok: false,
      trvanieMs: Date.now() - zaciatok,
      vstupneTokeny: tokeny.vstup ?? null,
      vystupneTokeny: tokeny.vystup ?? null,
      chyba: String((e as Error)?.message ?? e),
    });
    throw e;
  }
}
