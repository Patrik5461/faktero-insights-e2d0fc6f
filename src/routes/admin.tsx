import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/faktero/AdminShell";

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
    if (!role) throw redirect({ to: "/dashboard" });
    return { adminRole: role };
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
