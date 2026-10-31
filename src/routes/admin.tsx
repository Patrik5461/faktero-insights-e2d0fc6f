import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/faktero/AdminShell";
import { adminSmie } from "@/lib/faktero/admin-dvojfaktor";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user ?? (await supabase.auth.getUser()).data.user;
    if (!user) throw redirect({ to: "/prihlasenie" });
    const { data } = await supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const role = (data?.role as string | undefined) ?? null;
    /*
      Od ADMIN_2FA_POVINNE_OD len s reláciou aal2. Databáza adminovi bez aal2
      riadok v platform_admins už neukáže (is_platform_admin), preto sa úroveň
      overuje aj pri prázdnej role — inak by admin skončil na prehľade a
      nevedel prečo. Zapnutie 2FA admin práva nepotrebuje, nikto sa nezamkne.
    */
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!adminSmie(aal?.currentLevel ?? null)) {
      throw redirect({ to: "/nastavenia/zabezpecenie", search: { admin: 1 } });
    }
    if (!role) throw redirect({ to: "/dashboard" });
    return { adminRole: role };
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
