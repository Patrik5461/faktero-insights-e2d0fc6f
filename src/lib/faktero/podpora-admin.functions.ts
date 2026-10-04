import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Help desk — strana podpory (platform admin). Všetko ide cez servisný kľúč,
  preto každé volanie najprv overí, že volajúci je v `platform_admins`.
*/

async function admin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a platform admin");
  return supabaseAdmin;
}

const STAVY = ["nova", "otvorena", "caka_na_zakaznika", "vyriesena"] as const;

export const adminPoziadavkyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        filter: z.enum(["aktivne", "vsetky", ...STAVY]).default("aktivne"),
        hladat: z.string().trim().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    let q = db
      .from("podpora_poziadavky" as any)
      .select(
        "id, cislo, email, meno, predmet, kategoria, stav, zdroj, company_id, posledna_sprava_at, posledna_od, zakaznik_videl_at, podpora_videla_at, created_at",
      )
      .order("posledna_sprava_at", { ascending: false })
      .limit(300);
    if (data.filter === "aktivne") q = q.neq("stav", "vyriesena");
    else if (data.filter !== "vsetky") q = q.eq("stav", data.filter);
    if (data.hladat) {
      const h = data.hladat.replace(/[%,()]/g, " ");
      const cislo = Number(h.replace(/\D/g, ""));
      q = q.or(
        [`predmet.ilike.%${h}%`, `email.ilike.%${h}%`, cislo ? `cislo.eq.${cislo}` : ""]
          .filter(Boolean)
          .join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const zoznam = (rows ?? []) as any[];

    const firmyIds = [...new Set(zoznam.map((r) => r.company_id).filter(Boolean))];
    const { data: firmy } = firmyIds.length
      ? await db.from("companies").select("id, name").in("id", firmyIds)
      : { data: [] as any[] };
    const menoFirmy = new Map((firmy ?? []).map((f: any) => [f.id, f.name]));

    const { data: vsetky } = await db
      .from("podpora_poziadavky" as any)
      .select("stav")
      .limit(5000);
    const pocty: Record<string, number> = {};
    for (const r of (vsetky ?? []) as any[]) pocty[r.stav] = (pocty[r.stav] ?? 0) + 1;

    return {
      rows: zoznam.map((r) => ({
        ...r,
        firma: r.company_id ? (menoFirmy.get(r.company_id) ?? null) : null,
      })),
      pocty,
    };
  });

export const adminPoziadavkaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { data: p, error } = await db
      .from("podpora_poziadavky" as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Požiadavka sa nenašla.");
    const poz = p as any;
    const { data: spravy } = await db
      .from("podpora_spravy" as any)
      .select("id, autor_id, od_podpory, interna, text, created_at, cez_email")
      .eq("poziadavka_id", data.id)
      .order("created_at");
    const autori = [...new Set(((spravy ?? []) as any[]).map((s) => s.autor_id).filter(Boolean))];
    const { data: profily } = autori.length
      ? await db.from("profiles").select("id, email, full_name").in("id", autori)
      : { data: [] as any[] };
    const meno = new Map((profily ?? []).map((x: any) => [x.id, x.full_name || x.email]));
    const { data: firma } = poz.company_id
      ? await db.from("companies").select("id, name, ico").eq("id", poz.company_id).maybeSingle()
      : { data: null };

    // Otvorením podpora požiadavku videla.
    await db
      .from("podpora_poziadavky" as any)
      .update({ podpora_videla_at: new Date().toISOString() })
      .eq("id", data.id);

    return {
      poziadavka: poz,
      firma: firma as { id: string; name: string; ico: string | null } | null,
      spravy: ((spravy ?? []) as any[]).map((s) => ({
        ...s,
        autor: s.autor_id ? (meno.get(s.autor_id) ?? null) : null,
      })),
    };
  });

export const adminOdpovedzFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        text: z.string().trim().min(1).max(10000),
        interna: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await admin(userId);
    const { nacitajPoziadavku, pridajSpravu } = await import("./podpora.server");
    const p = await nacitajPoziadavku(data.id);
    if (!p) throw new Error("Požiadavka sa nenašla.");
    await pridajSpravu({
      poziadavka: p,
      autorId: userId,
      od: "podpora",
      text: data.text,
      interna: data.interna,
    });
    return { ok: true };
  });

export const adminStavFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), stav: z.enum(STAVY) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { error } = await db
      .from("podpora_poziadavky" as any)
      .update({ stav: data.stav, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Počet požiadaviek, na ktoré podpora ešte nereagovala — do menu administrácie. */
export const adminPocetNovychFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { data } = await db
      .from("podpora_poziadavky" as any)
      .select("posledna_od, posledna_sprava_at, podpora_videla_at, stav")
      .neq("stav", "vyriesena")
      .limit(1000);
    const n = ((data ?? []) as any[]).filter(
      (p) =>
        p.posledna_od === "zakaznik" &&
        (!p.podpora_videla_at || p.podpora_videla_at < p.posledna_sprava_at),
    ).length;
    return { n };
  });
