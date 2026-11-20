import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Admin → Podpora → Manuály podpory. Interné manuály (`docs/podpora`) dostane
  len platformový admin s reláciou aal2 — rovnako ako ostatné admin funkcie.
  Obsah sa číta až vnútri obsluhy, aby sa nepribalil do prehliadača.
*/
export const adminManualyPodporyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_admins")
      .select("role")
      .eq("user_id", (context as { userId: string }).userId)
      .maybeSingle();
    if (!data) throw new Error("Forbidden: not a platform admin");
    // Od ADMIN_2FA_POVINNE_OD len s reláciou aal2 (admin-dvojfaktor.ts).
    (await import("@/lib/faktero/admin-dvojfaktor.server")).vyzadujAal2Admina();
    const { nacitajManualyPodpory } = await import("./manualy-podpory.server");
    return { manualy: await nacitajManualyPodpory() };
  });
