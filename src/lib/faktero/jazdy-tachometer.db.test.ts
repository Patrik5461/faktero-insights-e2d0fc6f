import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * J-05: GPS jazda (web, appka, automatická detekcia) prichádza s tachometrom
 * od nuly. Spúšťač `trips_doplnit_tachometer` ju napojí na predchádzajúcu jazdu
 * vozidla. Beží v QA firme test2 cez `npm run test:db -- jazdy-tachometer`;
 * vozidlo aj jazdy po sebe zmaže.
 */
const URL_DB = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const KLUC = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const bezPristupu = process.env.FAKTERO_DB_TESTY !== "1" || !URL_DB || !KLUC;
const FIRMA = "dfe7e0d7-77a9-4ede-b978-d3ee8f896f15"; // QA firma test2

describe.skipIf(bezPristupu)("tachometer GPS jázd proti databáze", () => {
  let db: SupabaseClient;
  let vozidlo = "";

  beforeAll(async () => {
    db = createClient(URL_DB, KLUC, { auth: { persistSession: false } });
    const { data, error } = await db
      .from("vehicles")
      .insert({
        company_id: FIRMA,
        name: "QA tachometer",
        license_plate: "QA-TACH",
        initial_odometer: 1000,
      })
      .select("id")
      .single();
    if (error) throw error;
    vozidlo = data.id;
  });

  afterAll(async () => {
    if (!vozidlo) return;
    await db.from("trips").delete().eq("vehicle_id", vozidlo);
    await db.from("vehicles").delete().eq("id", vozidlo);
  });

  async function jazda(den: string, start: number, koniec: number, km: number) {
    const { data, error } = await db
      .from("trips")
      .insert({
        company_id: FIRMA,
        vehicle_id: vozidlo,
        trip_date: den,
        start_time: `${den}T08:00:00Z`,
        start_odometer: start,
        end_odometer: koniec,
        distance_km: km,
      })
      .select("start_odometer, end_odometer")
      .single();
    if (error) throw error;
    return [Number(data.start_odometer), Number(data.end_odometer)];
  }

  it("prvá GPS jazda nadviaže na počiatočný stav vozidla", async () => {
    expect(await jazda("2026-10-01", 0, 12.5, 12.5)).toEqual([1000, 1012.5]);
  });

  it("ďalšia GPS jazda nadviaže na koniec predchádzajúcej", async () => {
    expect(await jazda("2026-10-02", 0, 7.5, 7.5)).toEqual([1012.5, 1020]);
  });

  it("ručne zadaný tachometer ostane, ako je", async () => {
    expect(await jazda("2026-10-03", 2000, 2010, 10)).toEqual([2000, 2010]);
    expect(await jazda("2026-10-04", 0, 15, 10)).toEqual([0, 15]);
  });
});
