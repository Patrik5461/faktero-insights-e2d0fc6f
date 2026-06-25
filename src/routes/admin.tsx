import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/faktero/AdminShell";
import { getMyAdminRole } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.user) throw redirect({ to: "/prihlasenie" });
    try {
      const { role } = await getMyAdminRole();
      if (!role) throw redirect({ to: "/dashboard" });
      return { adminRole: role };
    } catch (e: any) {
      if (e?.options?.to) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});