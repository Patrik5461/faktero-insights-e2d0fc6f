/**
 * Serverové funkcie GPS integrácií (GPS Dozor, Webdispečink, Webfleet, …).
 * Commander a Tesla majú vlastné súbory.
 *
 * Serverový kód (adaptéry, šifrovanie, supabaseAdmin) sa načítava len vnútri
 * handlerov — obyčajný export by ho pritiahol do prehliadača.
 * Prihlasovacie údaje nikdy neodchádzajú späť: formulár dostane len netajné
 * polia a zoznam tajných, ktoré sú uložené („••••“).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Hodnoty = z.record(z.string(), z.string().max(4000));

async function pristup(ctx: any, companyId: string, spravca = false) {
  const { overPristup } = await import("./over-pristup");
  await overPristup(ctx, companyId, { oblast: "jazdy", zapis: true, spravca });
}

async function nacitajPripojenie(companyId: string, pripojenieId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("gps_pripojenia")
    .select("id, company_id, poskytovatel, prihlasenie_sifrovane")
    .eq("id", pripojenieId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) throw new Error("Pripojenie neexistuje.");
  return data as {
    id: string;
    company_id: string;
    poskytovatel: string;
    prihlasenie_sifrovane: string;
  };
}

/** Zoznam podporovaných poskytovateľov (bez kódu adaptérov). */
export const gpsKatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { ADAPTERY } = await import("./gps/register");
    return ADAPTERY.map((a) => ({
      id: a.id,
      nazov: a.nazov,
      web: a.web,
      dokumentacia: a.dokumentacia,
      polia: a.polia,
      vieTankovania: !!a.tankovania,
      vieZapis: !!a.oznacSukromnu,
    }));
  });

export const gpsStav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), poskytovatel: z.string().min(1).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    const rola = await overPristup(context as any, data.companyId, { oblast: "jazdy" });
    const { adapterPodlaId } = await import("./gps/register");
    const a = adapterPodlaId(data.poskytovatel);
    if (!a) throw new Error("Neznámy poskytovateľ.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canDecryptSecret } = await import("./payment-crypto.server");
    const sb = context.supabase as any;

    const { data: pripojenia } = await sb
      .from("gps_pripojenia")
      .select(
        "id, nazov, prihlasenie_verejne, aktivne, auto_sync, stav, neuplne, posledna_sync_at, posledna_chyba, created_at",
      )
      .eq("company_id", data.companyId)
      .eq("poskytovatel", a.id)
      .order("created_at", { ascending: true });
    const ids = (pripojenia ?? []).map((p: any) => p.id);

    // Dá sa uložené prihlásenie dešifrovať? (po výmene kľúča treba zadať znova)
    const neplatne = new Set<string>();
    if (ids.length) {
      const { data: sif } = await (supabaseAdmin as any)
        .from("gps_pripojenia")
        .select("id, prihlasenie_sifrovane")
        .in("id", ids);
      for (const s of sif ?? []) if (!canDecryptSecret(s.prihlasenie_sifrovane)) neplatne.add(s.id);
    }

    const [{ data: vazby }, { data: logy }, { data: vozidla }] = await Promise.all([
      ids.length
        ? sb
            .from("gps_vozidla_vazby")
            .select("id, pripojenie_id, externe_id, nazov, spz, vin, vehicle_id, jazdy_do")
            .in("pripojenie_id", ids)
            .order("nazov", { ascending: true })
        : Promise.resolve({ data: [] }),
      ids.length
        ? sb
            .from("gps_sync_logy")
            .select("id, pripojenie_id, druh, stav, sprava, created_at")
            .in("pripojenie_id", ids)
            .order("created_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] }),
      sb
        .from("vehicles")
        .select("id, name, license_plate, active")
        .eq("company_id", data.companyId)
        .order("name", { ascending: true }),
    ]);

    const tajne = a.polia.filter((p) => p.typ === "heslo").map((p) => p.kluc);
    return {
      poskytovatel: {
        id: a.id,
        nazov: a.nazov,
        web: a.web,
        dokumentacia: a.dokumentacia,
        polia: a.polia,
        vieTankovania: !!a.tankovania,
        vieZapis: !!a.oznacSukromnu,
      },
      spravca: rola === "owner" || rola === "admin",
      pripojenia: (pripojenia ?? []).map((p: any) => ({
        ...p,
        prihlasenieNeplatne: neplatne.has(p.id),
        ulozeneTajne: neplatne.has(p.id) ? [] : tajne,
      })),
      vazby: vazby ?? [],
      logy: logy ?? [],
      vozidla: vozidla ?? [],
    };
  });

const UlozSchema = z.object({
  companyId: z.string().uuid(),
  poskytovatel: z.string().min(1).max(40),
  pripojenieId: z.string().uuid().optional(),
  nazov: z.string().trim().max(120).optional(),
  hodnoty: Hodnoty,
  auto_sync: z.boolean().optional(),
});

/** Overí prihlásenie u poskytovateľa (neuloží nič). Prázdne tajné pole = uložená hodnota. */
export const gpsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UlozSchema.parse(d))
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId, true);
    const { adapterPodlaId } = await import("./gps/register");
    const a = adapterPodlaId(data.poskytovatel);
    if (!a) throw new Error("Neznámy poskytovateľ.");
    const { zlucPrihlasenie, chybajucePolia } = await import("./gps/gps-logika");
    const { desifrujPrihlasenie, spravaChyby, zapisLog } = await import("./gps/gps-sync.server");
    let ulozene: Record<string, string> = {};
    let pr: { id: string; company_id: string } | null = null;
    if (data.pripojenieId) {
      const row = await nacitajPripojenie(data.companyId, data.pripojenieId);
      pr = row;
      try {
        ulozene = desifrujPrihlasenie(row.prihlasenie_sifrovane);
      } catch {
        ulozene = {};
      }
    }
    const p = zlucPrihlasenie(a.polia, data.hodnoty, ulozene);
    const chyba = chybajucePolia(a.polia, p);
    if (chyba.length) return { ok: false as const, chyba: `Vyplňte: ${chyba.join(", ")}.` };
    try {
      await a.test(p);
      if (pr) await zapisLog(pr, "test", "ok", "Pripojenie funguje.");
      return { ok: true as const };
    } catch (e) {
      const { sprava } = spravaChyby(e, a, p);
      if (pr) await zapisLog(pr, "test", "chyba", sprava);
      return { ok: false as const, chyba: sprava };
    }
  });

/** Uloží pripojenie (najprv overí prihlásenie) a stiahne zoznam vozidiel. */
export const gpsUloz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UlozSchema.parse(d))
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId, true);
    const { adapterPodlaId } = await import("./gps/register");
    const a = adapterPodlaId(data.poskytovatel);
    if (!a) throw new Error("Neznámy poskytovateľ.");
    const { zlucPrihlasenie, chybajucePolia, rozdelPrihlasenie } = await import("./gps/gps-logika");
    const { desifrujPrihlasenie, spravaChyby, synchronizujVozidla, zapisLog } =
      await import("./gps/gps-sync.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    let ulozene: Record<string, string> = {};
    if (data.pripojenieId) {
      const row = await nacitajPripojenie(data.companyId, data.pripojenieId);
      if (row.poskytovatel !== a.id) throw new Error("Pripojenie patrí inému poskytovateľovi.");
      try {
        ulozene = desifrujPrihlasenie(row.prihlasenie_sifrovane);
      } catch {
        ulozene = {};
      }
    }
    const p = zlucPrihlasenie(a.polia, data.hodnoty, ulozene);
    const chyba = chybajucePolia(a.polia, p);
    if (chyba.length) return { ok: false as const, chyba: `Vyplňte: ${chyba.join(", ")}.` };
    try {
      await a.test(p);
    } catch (e) {
      return { ok: false as const, chyba: spravaChyby(e, a, p).sprava };
    }

    const { vsetko, verejne } = rozdelPrihlasenie(a.polia, p);
    const patch = {
      nazov: data.nazov ?? "",
      prihlasenie_sifrovane: encryptSecret(JSON.stringify(vsetko)),
      prihlasenie_verejne: verejne,
      auto_sync: data.auto_sync ?? true,
      stav: "ok",
      posledna_chyba: null,
    };
    let id = data.pripojenieId ?? null;
    if (id) {
      const { error } = await db.from("gps_pripojenia").update(patch).eq("id", id);
      if (error) throw new Error("Uloženie zlyhalo.");
    } else {
      const { data: ins, error } = await db
        .from("gps_pripojenia")
        .insert({
          ...patch,
          company_id: data.companyId,
          poskytovatel: a.id,
          created_by: (context as any).userId,
          neuplne: true,
        })
        .select("id, company_id")
        .single();
      if (error || !ins) throw new Error("Uloženie zlyhalo.");
      id = ins.id;
    }

    // Vozidlá hneď, aby sa dali spárovať; jazdy stiahne „Synchronizovať“ alebo cron.
    let vozidla = 0;
    let vozidlaChyba: string | null = null;
    try {
      const r = await synchronizujVozidla({ id: id!, company_id: data.companyId } as any, a, p);
      vozidla = r.vozidla;
      await zapisLog(
        { id: id!, company_id: data.companyId },
        "vozidla",
        "ok",
        `Vozidlá: ${r.vozidla}, nové: ${r.nove}.`,
      );
    } catch (e) {
      vozidlaChyba = spravaChyby(e, a, p).sprava;
      await zapisLog({ id: id!, company_id: data.companyId }, "vozidla", "chyba", vozidlaChyba);
    }
    return { ok: true as const, id: id!, vozidla, vozidlaChyba };
  });

export const gpsNastav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        pripojenieId: z.string().uuid(),
        aktivne: z.boolean().optional(),
        auto_sync: z.boolean().optional(),
        nazov: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId, true);
    await nacitajPripojenie(data.companyId, data.pripojenieId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.aktivne !== undefined) patch.aktivne = data.aktivne;
    if (data.auto_sync !== undefined) patch.auto_sync = data.auto_sync;
    if (data.nazov !== undefined) patch.nazov = data.nazov;
    if (Object.keys(patch).length)
      await (supabaseAdmin as any).from("gps_pripojenia").update(patch).eq("id", data.pripojenieId);
    return { ok: true };
  });

/** Odpojí účet. Naimportované jazdy a tankovania ostávajú v knihe jázd. */
export const gpsOdpoj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), pripojenieId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId, true);
    await nacitajPripojenie(data.companyId, data.pripojenieId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("gps_pripojenia")
      .delete()
      .eq("id", data.pripojenieId)
      .eq("company_id", data.companyId);
    if (error) throw new Error("Odpojenie zlyhalo.");
    return { ok: true };
  });

export const gpsSynchronizuj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), pripojenieId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId);
    await nacitajPripojenie(data.companyId, data.pripojenieId);
    const { synchronizujPripojenie } = await import("./gps/gps-sync.server");
    // Pod 30 s strop nginxu; zvyšok dokončí ďalšie kliknutie alebo cron.
    return synchronizujPripojenie(data.pripojenieId, {
      druh: "rucne",
      vynutVozidla: true,
      koniec: Date.now() + 22_000,
    });
  });

/** Spáruje vozidlo poskytovateľa s vozidlom firmy (null = zrušiť párovanie). */
export const gpsSparuj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        vazbaId: z.string().uuid(),
        vehicleId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: vazba } = await db
      .from("gps_vozidla_vazby")
      .select("id, vehicle_id")
      .eq("id", data.vazbaId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!vazba) throw new Error("Vozidlo integrácie neexistuje.");
    if (data.vehicleId) {
      const { data: auto } = await db
        .from("vehicles")
        .select("id")
        .eq("id", data.vehicleId)
        .eq("company_id", data.companyId)
        .maybeSingle();
      if (!auto) throw new Error("Vozidlo nepatrí tejto firme.");
    }
    const patch: Record<string, unknown> = { vehicle_id: data.vehicleId };
    // Nové párovanie stiahne posledných 30 dní (duplicity stráži external_id).
    if (data.vehicleId && data.vehicleId !== vazba.vehicle_id) patch.jazdy_do = null;
    await db.from("gps_vozidla_vazby").update(patch).eq("id", data.vazbaId);
    return { ok: true };
  });

/** Založí vo firme vozidlo podľa vozidla poskytovateľa a spáruje ho. */
export const gpsZalozVozidlo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), vazbaId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: vazba } = await db
      .from("gps_vozidla_vazby")
      .select("id, externe_id, nazov, spz, vin, vehicle_id")
      .eq("id", data.vazbaId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!vazba) throw new Error("Vozidlo integrácie neexistuje.");
    if (vazba.vehicle_id) return { ok: true, vehicleId: vazba.vehicle_id as string };
    const { data: auto, error } = await db
      .from("vehicles")
      .insert({
        company_id: data.companyId,
        name: vazba.nazov || vazba.spz || `GPS ${vazba.externe_id}`,
        license_plate: vazba.spz || null,
        vin: vazba.vin || null,
        initial_odometer: 0,
        active: true,
      })
      .select("id")
      .single();
    if (error || !auto) throw new Error("Vozidlo sa nepodarilo založiť.");
    await db
      .from("gps_vozidla_vazby")
      .update({ vehicle_id: auto.id, jazdy_do: null })
      .eq("id", vazba.id);
    return { ok: true, vehicleId: auto.id as string };
  });

/** Po prepnutí súkromná/služobná v knihe jázd zapíše zmenu aj do GPS, ak to API vie. */
export const gpsZapisZaradenie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        ids: z.array(z.string().uuid()).max(200),
        sukromna: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await pristup(context, data.companyId);
    const { zapisZaradenieSpat } = await import("./gps/gps-sync.server");
    return zapisZaradenieSpat(data.companyId, data.ids, data.sukromna);
  });
