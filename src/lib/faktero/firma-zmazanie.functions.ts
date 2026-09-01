import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Zmazanie jednej firmy.
 *
 * Firmu sa dalo doteraz len založiť — skúšobná či omylom vytvorená firma
 * ostávala v prepínači navždy a jediná cesta preč viedla cez zrušenie celého
 * účtu. Mazanie robí tá istá RPC ako pri rušení účtu: `faktero_zmaz_firmu` si
 * na to zapne výnimku z nemennosti skladových pohybov, prílohy treba zmazať
 * cez Storage API zvlášť (kaskáda v SQL na ne nesiaha).
 *
 * Poistky sú tri: firmu maže len jej majiteľ, poslednú firmu takto zmazať
 * nejde (na to je zrušenie účtu s odkladom) a názov treba prepísať ručne.
 */
export const zmazFirmuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), potvrdenie: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: clenstvo } = await supabase
      .from("company_users")
      .select("role")
      .eq("company_id", data.company_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!clenstvo) throw new Error("K tejto firme nemáte prístup.");
    if (clenstvo.role !== "owner") throw new Error("Zmazať firmu môže len jej majiteľ.");

    const { count: mojeFirmy } = await supabase
      .from("company_users")
      .select("company_id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((mojeFirmy ?? 0) <= 1) {
      throw new Error(
        "Toto je vaša jediná firma. Ak chcete skončiť, zrušte účet v Nastaveniach — má odklad, počas ktorého sa to dá vziať späť.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: firma } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");
    if (data.potvrdenie.trim() !== (firma.name ?? "").trim()) {
      throw new Error("Názov firmy nesedí — prepíšte ho presne tak, ako je uvedený.");
    }

    const { zmazSuboryFirmy } = await import("@/lib/faktero/ucet-zrusenie.server");
    const subory = await zmazSuboryFirmy(data.company_id);
    const { error } = await (supabaseAdmin as any).rpc("faktero_zmaz_firmu", {
      _company_id: data.company_id,
    });
    if (error) throw new Error(`Firmu sa nepodarilo zmazať: ${error.message}`);

    return { ok: true, subory };
  });
