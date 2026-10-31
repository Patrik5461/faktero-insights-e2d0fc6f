import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Zámok uzavretého obdobia na bločkoch a úprava zmazanej faktúry — proti
 * skutočnej databáze (oboje stráži SQL, nie aplikácia).
 *
 * Spúšťa sa len cez `npm run test:db`. Test si založí vlastnú firmu a na
 * konci ju zmaže; zvyšky po spadnutom behu (staršie než hodinu) uprace ďalší.
 */
const URL_DB = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const KLUC = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ZAPNUTE = process.env.FAKTERO_DB_TESTY === "1";
const bezPristupu = !ZAPNUTE || !URL_DB || !KLUC;

const PREDPONA = "QA zamok ";
const ZAMOK = "2026-09-30";

async function uprac(db: SupabaseClient, firma: string) {
  // Zámok najprv preč, inak spúšťač nepustí zmazať spracované bločky.
  await db
    .from("companies")
    .update({ locked_until: null } as never)
    .eq("id", firma);
  for (const t of ["expense_documents", "invoices", "number_series", "company_users"]) {
    await db.from(t).delete().eq("company_id", firma);
  }
  await db.from("companies").delete().eq("id", firma);
}

describe.skipIf(bezPristupu)("zámok obdobia na bločkoch a zmazaná faktúra", () => {
  let db: SupabaseClient;
  let firma: string;

  async function blocek(status: string, datum: string) {
    const { data, error } = await db
      .from("expense_documents")
      .insert({
        company_id: firma,
        status,
        issue_date: datum,
        total_amount: 10,
        payment_method: "karta",
      } as never)
      .select("id")
      .single();
    return { id: (data as { id: string } | null)?.id ?? null, error };
  }

  beforeAll(async () => {
    db = createClient(URL_DB, KLUC, { auth: { persistSession: false } });
    const hodinaSpat = new Date(Date.now() - 3600_000).toISOString();
    const { data: stare } = await db
      .from("companies")
      .select("id")
      .like("name", `${PREDPONA}%`)
      .lt("created_at", hodinaSpat);
    for (const { id } of (stare ?? []) as { id: string }[]) await uprac(db, id);

    const { data, error } = await db
      .from("companies")
      .insert({ name: `${PREDPONA}${Date.now()}`, default_currency: "EUR" } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    firma = (data as { id: string }).id;
  });

  afterAll(async () => {
    if (firma) await uprac(db, firma);
  });

  it("spracovaný bloček v uzavretom období sa nedá meniť ani zmazať, zaúčtovanie áno", async () => {
    const b = await blocek("processed", "2026-09-15");
    expect(b.error).toBeNull();
    await db
      .from("companies")
      .update({ locked_until: ZAMOK } as never)
      .eq("id", firma);

    const suma = await db
      .from("expense_documents")
      .update({ total_amount: 12 } as never)
      .eq("id", b.id!);
    expect(suma.error?.message).toMatch(/uzamknuté/);

    const zmaz = await db.from("expense_documents").delete().eq("id", b.id!);
    expect(zmaz.error?.message).toMatch(/uzamknuté/);

    const volne = await db
      .from("expense_documents")
      .update({ note: "QA", pohoda_predkontacia: "5Pv", payment_method: "hotovost" } as never)
      .eq("id", b.id!);
    expect(volne.error).toBeNull();
  });

  it("nový spracovaný bloček do uzavretého obdobia nejde, nespracovaný áno", async () => {
    const spracovany = await blocek("processed", "2026-09-20");
    expect(spracovany.error?.message).toMatch(/uzamknuté/);

    const novy = await blocek("new", "2026-09-20");
    expect(novy.error).toBeNull();
    // Spracovanie ho vloží do účtovníctva — to už zámok odmietne.
    const spracuj = await db
      .from("expense_documents")
      .update({ status: "processed" } as never)
      .eq("id", novy.id!);
    expect(spracuj.error?.message).toMatch(/uzamknuté/);
    // Nespracovaný sa dá zmazať (napr. presun do Nespracovaných dokladov).
    const zmaz = await db.from("expense_documents").delete().eq("id", novy.id!);
    expect(zmaz.error).toBeNull();
  });

  it("bloček po uzávierke sa dá meniť, ale nie presunúť do uzavretého obdobia", async () => {
    const b = await blocek("processed", "2026-10-10");
    expect(b.error).toBeNull();
    expect(
      (
        await db
          .from("expense_documents")
          .update({ total_amount: 15 } as never)
          .eq("id", b.id!)
      ).error,
    ).toBeNull();
    const presun = await db
      .from("expense_documents")
      .update({ issue_date: "2026-09-01" } as never)
      .eq("id", b.id!);
    expect(presun.error?.message).toMatch(/uzamknuté/);
  });

  it("uloz_upravu_faktury odmietne zmazanú faktúru", async () => {
    const { data, error } = await db
      .from("invoices")
      .insert({
        company_id: firma,
        invoice_number: `QA${Date.now()}`,
        issue_date: "2026-10-20",
        deleted_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const r = await db.rpc("uloz_upravu_faktury", {
      p_id: (data as { id: string }).id,
      p_hlavicka: { notes: "QA" },
      p_polozky: [],
      p_povodne_upravena: null,
    } as never);
    expect(r.error?.message).toMatch(/zmazaná/);
  });
});
