import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { overPristup } from "./over-pristup";

/*
  Zálohy firmy: „Vytvoriť zálohu“ zabalí na pozadí všetky doklady firmy do
  ZIP (tabuľky CSV, PDF faktúr, skeny prijatých faktúr a bločkov) a uloží ho
  do súkromného koša. Zálohu vytvára a maže majiteľ alebo admin firmy —
  balík obsahuje všetko vrátane banky.
*/
const Firma = z.object({ company_id: z.string().uuid() });

export const zalohyFirmyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    const { data: riadky, error } = await (context.supabase as any)
      .from("zalohy_firmy")
      .select("id, stav, velkost, pocty, chyba, created_at, finished_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    const { bezi } = await import("./zalohy-firmy");
    return ((riadky ?? []) as any[]).map((r) => ({
      ...r,
      // Beh, ktorý sa po reštarte servera nedokončil, sa ukáže ako chyba.
      stav: r.stav === "bezi" && !bezi(r) ? "chyba" : (r.stav as string),
      chyba:
        r.stav === "bezi" && !bezi(r)
          ? "Záloha sa nedokončila, skúste ju vytvoriť znova."
          : r.chyba,
    })) as Array<{
      id: string;
      stav: string;
      velkost: number | null;
      pocty: Record<string, number>;
      chyba: string | null;
      created_at: string;
      finished_at: string | null;
    }>;
  });

export const vytvorZalohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { bezi } = await import("./zalohy-firmy");
    const { data: posledne } = await supabaseAdmin
      .from("zalohy_firmy")
      .select("id, stav, created_at")
      .eq("company_id", data.company_id)
      .eq("stav", "bezi")
      .limit(5);
    if ((posledne ?? []).some((r) => bezi(r)))
      throw new Error("Záloha sa už vytvára — počkajte, kým dobehne.");
    const { data: novy, error } = await supabaseAdmin
      .from("zalohy_firmy")
      .insert({ company_id: data.company_id, created_by: context.userId, stav: "bezi" })
      .select("id")
      .single();
    if (error || !novy) throw new Error(error?.message ?? "Zálohu sa nepodarilo založiť.");
    // Bez čakania — dlhý beh by nginx po 30 s prerušil; stránka sa doptáva.
    const { spustiZalohu } = await import("./zalohy-firmy.server");
    void spustiZalohu(novy.id, data.company_id);
    return { id: novy.id as string };
  });

export const stiahniZalohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: z1 } = await supabaseAdmin
      .from("zalohy_firmy")
      .select("cesta, stav")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!z1?.cesta || z1.stav !== "hotovo") throw new Error("Záloha nie je pripravená.");
    if (!z1.cesta.startsWith(`${data.company_id}/`)) throw new Error("Záloha nepatrí tejto firme.");
    // Krátka platnosť — odkaz je na stiahnutie hneď, nie na zdieľanie.
    const { data: odkaz, error } = await supabaseAdmin.storage
      .from("export-firmy")
      .createSignedUrl(z1.cesta, 3600, { download: true });
    if (error || !odkaz?.signedUrl)
      throw new Error(error?.message ?? "Odkaz sa nepodarilo vytvoriť.");
    return { url: odkaz.signedUrl };
  });

export const zmazZalohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: z1 } = await supabaseAdmin
      .from("zalohy_firmy")
      .select("id, cesta, stav, created_at")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!z1) throw new Error("Záloha sa nenašla.");
    const { bezi } = await import("./zalohy-firmy");
    if (bezi(z1)) throw new Error("Zálohu, ktorá sa ešte vytvára, nemožno zmazať.");
    if (z1.cesta && z1.cesta.startsWith(`${data.company_id}/`))
      await supabaseAdmin.storage.from("export-firmy").remove([z1.cesta]);
    await supabaseAdmin.from("zalohy_firmy").delete().eq("id", z1.id);
    return { ok: true };
  });
