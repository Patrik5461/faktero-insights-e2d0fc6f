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

  const { data: jazdy } = await supabaseAdmin
    .from("trips")
    .select("id, route, created_by, start_location, end_location, driver_name")
    .in("external_source", ZDROJE)
    .or("start_location.is.null,driver_name.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);

  const menaPodlaPouzivatela = new Map<string, string | null>();

  for (const j of jazdy ?? []) {
    v.prezreté++;
    const zmena: TablesUpdate<"trips"> = {};

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

      if (!Object.keys(zmena).length) continue;

      const { error } = await supabaseAdmin.from("trips").update(zmena).eq("id", j.id);
      if (error) {
        v.chyby++;
        console.error(`[jazdy-doplnenie] jazda ${j.id}: ${error.message}`);
        continue;
      }
      if (zmena.start_location || zmena.end_location) v.adresy++;
      if (zmena.driver_name) v.vodici++;
    } catch (e: any) {
      v.chyby++;
      console.error(`[jazdy-doplnenie] jazda ${j.id} zlyhala: ${e?.message ?? e}`);
    }
  }

  return v;
}
