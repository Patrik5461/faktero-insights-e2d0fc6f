/**
 * Partneri v páse na hlavnej stránke.
 *
 * Čítanie je verejné a zámerne ide cez vlastného klienta s publikovateľným
 * kľúčom — hlavnú stránku číta aj ten, kto prihlásený nie je, a pás sa vykresľuje
 * na serveri, takže sa relácia z prehliadača nemá odkiaľ vziať. Politika
 * `partners_public_read` pritom pustí len zapnuté riadky, takže vypnutý partner
 * sa von nedostane ani takto.
 *
 * Zápis je len pre platformového admina a kontroluje sa pri každom volaní —
 * `context.supabase` síce beží pod jeho právami a RLS by ho zastavila tiež,
 * ale odpoveď „Forbidden" je zrozumiteľnejšia než prázdny výsledok.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type Partner = {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  sort_order: number;
  active: boolean;
};

const VstupPartnera = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Názov je povinný").max(80),
  logo_url: z.string().trim().max(500).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

function verejnyKlient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

type Kontext = { supabase: SupabaseClient; userId: string };

async function overAdmina(context: Kontext) {
  const { data } = await context.supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Pre hlavnú stránku: len zapnutí, v poradí, aké si admin nastavil. */
export const zoznamPartnerovPublic = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = verejnyKlient();
  const { data, error } = await supabase
    .from("partners" as never)
    .select("id, name, logo_url, website, sort_order, active")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Partner[];
});

/** Pre admin obrazovku: aj vypnutí. */
export const zoznamPartnerov = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Kontext;
    await overAdmina(ctx);
    const { data, error } = await ctx.supabase
      .from("partners")
      .select("id, name, logo_url, website, sort_order, active")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return (data ?? []) as Partner[];
  });

export const ulozPartnera = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => VstupPartnera.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Kontext;
    await overAdmina(ctx);
    const supabase = ctx.supabase;
    const riadok = {
      name: data.name,
      logo_url: data.logo_url || null,
      website: data.website || null,
      sort_order: data.sort_order ?? 0,
      active: data.active ?? true,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabase.from("partners").update(riadok).eq("id", data.id)
      : await supabase.from("partners").insert(riadok);
    if (error) throw error;
    return { ok: true };
  });

export const zmazPartnera = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Kontext;
    await overAdmina(ctx);
    const { error } = await ctx.supabase.from("partners").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
