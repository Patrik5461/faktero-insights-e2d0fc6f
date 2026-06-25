import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/faktero/AppShell";
import { getActiveCompanyId, setActiveCompanyId, fetchMyCompanies } from "@/lib/faktero/active-company";
import { PlanGateBanner } from "@/components/faktero/PlanGateBanner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Use getSession() first — it reads from localStorage without a network
    // request, which avoids iOS Safari's "Load failed" errors that can happen
    // when /auth/v1/user is called immediately after /auth/v1/token.
    // Protected server functions revalidate the bearer via requireSupabaseAuth.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      return { user: sessionData.session.user };
    }
    // Fallback to network-backed getUser only if no local session exists.
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) return { user: data.user };
    } catch {
      // network error — treat as unauthenticated
    }
    throw redirect({ to: "/prihlasenie" });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<any[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let mounted = true;
    fetchMyCompanies()
      .then((list) => {
        if (!mounted) return;
        setCompanies(list);
        const stored = getActiveCompanyId();
        const next = list.find((c: any) => c.id === stored)?.id ?? list[0]?.id ?? null;
        if (next !== stored) setActiveCompanyId(next);
        setActiveId(next);
        if (list.length === 0 && !pathname.startsWith("/onboarding")) {
          navigate({ to: "/onboarding", replace: true });
        } else if (list.length > 0 && pathname.startsWith("/onboarding")) {
          navigate({ to: "/dashboard", replace: true });
        }
      })
      .catch(console.error);
    return () => { mounted = false; };
  }, [pathname]);

  if (companies === null) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Načítavam…</div>;
  }

  // Onboarding stands alone (no sidebar) when there is no company yet
  if (companies.length === 0 || pathname.startsWith("/onboarding")) {
    return <Outlet />;
  }

  return (
    <AppShell
      companies={companies}
      activeId={activeId}
      onChangeCompany={(id) => {
        setActiveCompanyId(id);
        setActiveId(id);
        window.location.reload();
      }}
    >
      <PlanGateBanner companyId={activeId} />
      <Outlet />
    </AppShell>
  );
}