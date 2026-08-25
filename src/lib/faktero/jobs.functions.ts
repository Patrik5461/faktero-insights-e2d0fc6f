import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dalsieCisloDokladu } from "./cislovanie";
import { vyhodnotZakazku, type Vyhodnotenie } from "./zakazky";
import { nacitajPouziteCisla } from "./cislovanie-nacitanie";

/**
 * Zákazky. Rovnako ako objednávky u dodávateľov ide všetko cez klienta viazaný
 * na prihláseného používateľa, takže členstvo vynúti RLS — `supabaseAdmin` sa
 * tu nepoužíva zámerne.
 *
 * Že zákazka patrí tej istej firme ako doklad, stráži databázový trigger
 * `jobs_guard_assignment`. Kontrola v aplikácii by sa dala obísť priamym
 * volaním PostgREST, kontrola v databáze nie.
 */

const CompanyScoped = z.object({ company_id: z.string().uuid() });

const STAVY = ["active", "closed", "cancelled"] as const;

async function nacitajZakazku(supabase: any, companyId: string, id: string) {
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!job) throw new Error("Zákazka nenájdená.");
  return job;
}

/** Číslovanie ZAK{rok}{poradie} — rovnaký tvar ako ponuky a objednávky. */
async function dalsieCislo(supabase: any, companyId: string): Promise<string> {
  const prefix = `ZAK${new Date().getFullYear()}`;
  const rows = await nacitajPouziteCisla(supabase, "jobs", "job_number", companyId, prefix);
  return dalsieCisloDokladu(prefix, rows);
}

/**
 * Podklady na vyhodnotenie pre zadané zákazky naraz. Robí sa to piatimi
 * dopytmi pre celý zoznam, nie piatimi na každú zákazku — pri dvadsiatich
 * zákazkách je to rozdiel medzi piatimi a stovkou dopytov.
 *
 * Objednávky u dodávateľov sa načítavajú len na zobrazenie. Objednaný tovar
 * ešte nie je náklad zákazky — ten vznikne až jeho výdajom zo skladu.
 */
async function podkladyKVyhodnoteniu(supabase: any, companyId: string, jobIds: string[]) {
  const prazdne = {
    faktury: new Map<string, any[]>(),
    prijate: new Map<string, any[]>(),
    pohyby: new Map<string, any[]>(),
    jazdy: new Map<string, any[]>(),
    objednavky: new Map<string, any[]>(),
  };
  if (!jobIds.length) return prazdne;

  const [faktury, prijate, pohyby, jazdy, objednavky] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, job_id, invoice_number, type, status, issue_date, subtotal, total, deleted_at")
      .eq("company_id", companyId)
      .in("job_id", jobIds),
    supabase
      .from("purchase_invoices")
      .select(
        "id, job_id, invoice_number, supplier_name, issue_date, amount_without_vat, amount_total, deleted_at",
      )
      .eq("company_id", companyId)
      .in("job_id", jobIds),
    supabase
      .from("stock_movements")
      .select("id, job_id, type, quantity, unit_cost, total_value, created_at, stock_item_id, note")
      .eq("company_id", companyId)
      .in("job_id", jobIds),
    supabase
      .from("trips")
      .select(
        "id, job_id, trip_date, distance_km, fuel_consumption, fuel_price, start_location, end_location, purpose",
      )
      .eq("company_id", companyId)
      .in("job_id", jobIds),
    supabase
      .from("purchase_orders")
      .select("id, job_id, order_number, supplier_name, order_date, expected_date, status")
      .eq("company_id", companyId)
      .in("job_id", jobIds),
  ]);

  const zoskup = (rows: any[] | null) => {
    const m = new Map<string, any[]>();
    (rows ?? []).forEach((r) => {
      const zoznam = m.get(r.job_id) ?? [];
      zoznam.push(r);
      m.set(r.job_id, zoznam);
    });
    return m;
  };

  return {
    faktury: zoskup(faktury.data),
    prijate: zoskup(prijate.data),
    pohyby: zoskup(pohyby.data),
    jazdy: zoskup(jazdy.data),
    objednavky: zoskup(objednavky.data),
  };
}

function vyhodnotenie(
  job: any,
  p: Awaited<ReturnType<typeof podkladyKVyhodnoteniu>>,
): Vyhodnotenie {
  return vyhodnotZakazku({
    faktury: p.faktury.get(job.id) ?? [],
    prijateFaktury: p.prijate.get(job.id) ?? [],
    pohyby: p.pohyby.get(job.id) ?? [],
    jazdy: p.jazdy.get(job.id) ?? [],
    planovanyVynos: job.planned_revenue,
    planovanyNaklad: job.planned_cost,
  });
}

export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ status: z.enum(STAVY).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("jobs")
      .select("*")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const jobs = rows ?? [];
    const podklady = await podkladyKVyhodnoteniu(
      context.supabase,
      data.company_id,
      jobs.map((j) => j.id),
    );
    return jobs.map((j) => ({ ...j, ...vyhodnotenie(j, podklady) }));
  });

/** Zoznam pre výber na doklade. Uzavreté zákazky sa ponúkať nesmú. */
export const listJobOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("jobs")
      .select("id, job_number, name, customer_id")
      .eq("company_id", data.company_id)
      .eq("status", "active")
      .order("job_number", { ascending: false })
      .limit(500);
    return rows ?? [];
  });

export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const job = await nacitajZakazku(context.supabase, data.company_id, data.id);
    const podklady = await podkladyKVyhodnoteniu(context.supabase, data.company_id, [job.id]);

    const pohyby = podklady.pohyby.get(job.id) ?? [];
    // Skladové pohyby nesú len id karty, na výpise treba meno.
    const kartyIds = [...new Set(pohyby.map((p: any) => p.stock_item_id).filter(Boolean))];
    const menaKariet = new Map<string, string>();
    if (kartyIds.length) {
      const { data: karty } = await context.supabase
        .from("stock_items")
        .select("id, sku, products(name)")
        .in("id", kartyIds);
      (karty ?? []).forEach((k: any) => {
        menaKariet.set(k.id, k.products?.name ?? k.sku ?? "—");
      });
    }

    return {
      job,
      vyhodnotenie: vyhodnotenie(job, podklady),
      faktury: (podklady.faktury.get(job.id) ?? []).filter((f: any) => !f.deleted_at),
      prijate_faktury: (podklady.prijate.get(job.id) ?? []).filter((f: any) => !f.deleted_at),
      pohyby: pohyby.map((p: any) => ({ ...p, nazov: menaKariet.get(p.stock_item_id) ?? "—" })),
      jazdy: podklady.jazdy.get(job.id) ?? [],
      objednavky: podklady.objednavky.get(job.id) ?? [],
    };
  });

const ZakazkaVstup = z.object({
  name: z.string().trim().min(1).max(255),
  customer_id: z.string().uuid().nullable().optional(),
  start_date: z.string().date().nullable().optional(),
  end_date: z.string().date().nullable().optional(),
  planned_revenue: z.coerce.number().nonnegative().nullable().optional(),
  planned_cost: z.coerce.number().nonnegative().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

async function menoOdberatela(
  supabase: any,
  companyId: string,
  customerId: string | null | undefined,
): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();
  // Cudzí odberateľ sa nesmie prilepiť na zákazku ani menom.
  if (!data) throw new Error("Odberateľ nepatrí tejto firme.");
  return data.name ?? null;
}

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.merge(ZakazkaVstup).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        company_id: data.company_id,
        job_number: await dalsieCislo(supabase, data.company_id),
        name: data.name,
        customer_id: data.customer_id ?? null,
        customer_name: await menoOdberatela(supabase, data.company_id, data.customer_id),
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        planned_revenue: data.planned_revenue ?? null,
        planned_cost: data.planned_cost ?? null,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error || !job) throw new Error(error?.message ?? "Zákazku sa nepodarilo vytvoriť.");
    return { id: job.id, job_number: job.job_number };
  });

export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({ id: z.string().uuid() }).merge(ZakazkaVstup).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const job = await nacitajZakazku(supabase, data.company_id, data.id);
    if (job.status !== "active") throw new Error("Upraviť sa dá len otvorená zákazka.");

    const { error } = await supabase
      .from("jobs")
      .update({
        name: data.name,
        customer_id: data.customer_id ?? null,
        customer_name: await menoOdberatela(supabase, data.company_id, data.customer_id),
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        planned_revenue: data.planned_revenue ?? null,
        planned_cost: data.planned_cost ?? null,
        note: data.note ?? null,
      })
      .eq("id", job.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Uzavretie zákazky. Od tej chvíle na ňu databázový trigger nepustí nový
 * doklad, takže vyhodnotenie hotovej stavby sa už nemení.
 */
export const setJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({ id: z.string().uuid(), status: z.enum(STAVY) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const job = await nacitajZakazku(context.supabase, data.company_id, data.id);
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: data.status,
        closed_at: data.status === "active" ? null : (job.closed_at ?? new Date().toISOString()),
      })
      .eq("id", job.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true, status: data.status };
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const job = await nacitajZakazku(context.supabase, data.company_id, data.id);
    // Zákazku s dokladmi odmietne aj trigger v databáze; toto je len preto, aby
    // sa človek dozvedel zrozumiteľný dôvod namiesto chyby z Postgresu.
    const { error } = await context.supabase
      .from("jobs")
      .delete()
      .eq("id", job.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
