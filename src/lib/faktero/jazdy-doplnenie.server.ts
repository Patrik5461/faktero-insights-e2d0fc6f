/**
 * Doplnenie automaticky rozpoznaných jázd: odkiaľ, kam a kto šoféroval.
 *
 * Detekcia v telefóne ukladá trasu, nie adresy — súradnice na adresu prekladá
 * až server (kľúč k službe do telefónu nepatrí a telefón býva pri ukladaní bez
 * signálu). Meno vodiča vie server tiež: jazdu zapísal prihlásený človek a to
 * je pri jednom aute na jedného človeka presne ten, kto šoféroval.
 *
 * Obe polia sú obyčajný text — keď adresa netrafí alebo auto viedol niekto iný,
 * jazda sa dá prepísať v knihe jázd.
 */
import type { TablesUpdate } from "@/integrations/supabase/types";
import { dekoduj } from "./polyline";
import { adresaZBodu } from "./geokodovanie.server";

/** Zdroje, ktorých jazdy si adresy nenesú so sebou. */
const ZDROJE = ["drive_detector"];

/*
  Jazdu, ktorú sa doplniť nedarí (bez trasy, adresa netrafí, autor bez mena),
  by cron čítal a geokódoval každých 5 minút donekonečna. Po neúspešnom pokuse
  sa preto zapíše počet a čas: ďalší pokus najskôr o hodinu a po
  `MAX_POKUSOV` už nikdy — ostane na ručné doplnenie v knihe jázd.
*/
export const MAX_POKUSOV = 6;
export const PAUZA_MEDZI_POKUSMI_MS = 60 * 60 * 1000;

export type VysledokDoplnenia = {
  prezreté: number;
  adresy: number;
  vodici: number;
  chyby: number;
};

async function menoVodica(supabaseAdmin: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const meno = data?.full_name?.trim();
  if (meno) return meno;
  // E-mail je horšia menovka, ale stále lepšia než prázdno.
  return data?.email?.trim() || null;
}

export async function doplnJazdy(limit = 200): Promise<VysledokDoplnenia> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const v: VysledokDoplnenia = { prezreté: 0, adresy: 0, vodici: 0, chyby: 0 };

  const skorNez = new Date(Date.now() - PAUZA_MEDZI_POKUSMI_MS).toISOString();
  // Dve `or` sa v PostgREST spoja cez AND. Stĺpce pokusov typy ešte nepoznajú.
  const { data: jazdy } = await (supabaseAdmin as any)
    .from("trips")
    .select("id, route, created_by, start_location, end_location, driver_name, doplnenie_pokusy")
    .in("external_source", ZDROJE)
    .or("start_location.is.null,end_location.is.null,driver_name.is.null")
    .lt("doplnenie_pokusy", MAX_POKUSOV)
    .or(`doplnenie_skusane_at.is.null,doplnenie_skusane_at.lt.${skorNez}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  const menaPodlaPouzivatela = new Map<string, string | null>();

  for (const j of (jazdy ?? []) as any[]) {
    v.prezreté++;
    const zmena: TablesUpdate<"trips"> & {
      doplnenie_pokusy?: number;
      doplnenie_skusane_at?: string;
    } = {};

    try {
      if (!j.start_location || !j.end_location) {
        const body = dekoduj(j.route);
        if (body.length) {
          const prvy = body[0];
          const posledny = body[body.length - 1];
          if (!j.start_location) {
            const a = await adresaZBodu(supabaseAdmin, prvy.lat, prvy.lng);
            if (a) zmena.start_location = a;
          }
          if (!j.end_location) {
            const a = await adresaZBodu(supabaseAdmin, posledny.lat, posledny.lng);
            if (a) zmena.end_location = a;
          }
        }
      }

      if (!j.driver_name && j.created_by) {
        if (!menaPodlaPouzivatela.has(j.created_by)) {
          menaPodlaPouzivatela.set(j.created_by, await menoVodica(supabaseAdmin, j.created_by));
        }
        const meno = menaPodlaPouzivatela.get(j.created_by) ?? null;
        if (meno) zmena.driver_name = meno;
      }

      const doplnene = Boolean(Object.keys(zmena).length);
      if (ostaneNedoplnena(j, zmena)) {
        zmena.doplnenie_pokusy = (j.doplnenie_pokusy ?? 0) + 1;
        zmena.doplnenie_skusane_at = new Date().toISOString();
      }
      if (!Object.keys(zmena).length) continue;

      const { error } = await (supabaseAdmin as any).from("trips").update(zmena).eq("id", j.id);
      if (error) {
        v.chyby++;
        console.error(`[jazdy-doplnenie] jazda ${j.id}: ${error.message}`);
        continue;
      }
      if (!doplnene) continue;
      if (zmena.start_location || zmena.end_location) v.adresy++;
      if (zmena.driver_name) v.vodici++;
    } catch (e: any) {
      v.chyby++;
      console.error(`[jazdy-doplnenie] jazda ${j.id} zlyhala: ${e?.message ?? e}`);
      // Aj výnimka (napr. poškodená trasa) je neúspešný pokus — inak by sa opakovala stále.
      await (supabaseAdmin as any)
        .from("trips")
        .update({
          doplnenie_pokusy: (j.doplnenie_pokusy ?? 0) + 1,
          doplnenie_skusane_at: new Date().toISOString(),
        })
        .eq("id", j.id)
        .then(
          () => {},
          () => {},
        );
    }
  }

  return v;
}

type PoliaJazdy = {
  start_location?: string | null;
  end_location?: string | null;
  driver_name?: string | null;
};

/** Bude jazde po zápise `zmena` ešte niečo chýbať? Vtedy je to neúspešný pokus. */
export function ostaneNedoplnena(jazda: PoliaJazdy, zmena: PoliaJazdy): boolean {
  return (
    !(zmena.start_location ?? jazda.start_location) ||
    !(zmena.end_location ?? jazda.end_location) ||
    !(zmena.driver_name ?? jazda.driver_name)
  );
}
