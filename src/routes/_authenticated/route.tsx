import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, type ProductMode } from "@/components/faktero/AppShell";
import { getActiveCompanyId, setActiveCompanyId, fetchMyCompanies } from "@/lib/faktero/active-company";
import { PlanGateBanner } from "@/components/faktero/PlanGateBanner";
import { ProductModePicker } from "@/components/faktero/ProductModePicker";
import { getActiveProduct, setActiveProduct, type ActiveProduct } from "@/lib/faktero/active-product";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      return { user: sessionData.session.user };
    }
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
  const [productMode, setProductMode] = useState<ProductMode | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      supabase.from("profiles").select("product_mode").eq("id", data.user.id).maybeSingle()
        .then(({ data: p }) => {
          if (!mounted) return;
          setProductMode((p?.product_mode ?? null) as ProductMode | null);
          setProfileLoaded(true);
        });
    });
    return () => { mounted = false; };
  }, []);

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

  if (companies === null || !profileLoaded) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Načítavam…</div>;
  }

  // Onboarding stands alone (no sidebar) when there is no company yet
  if (companies.length === 0 || pathname.startsWith("/onboarding")) {
    return <Outlet />;
  }

  // After company exists, ask which product(s) to use
  if (!productMode) {
    return <ProductModePicker onPicked={(m) => setProductMode(m)} />;
  }

  // Resolve which product view to render. The user's explicit choice on the
  // login screen (stored in localStorage) is authoritative: if they picked a
  // product their profile doesn't currently grant, treat them as having access
  // to both so the choice actually takes effect (same account, two products).
  const stored = getActiveProduct();
  const effectiveMode: ProductMode =
    productMode === "both"
      ? "both"
      : stored && stored !== productMode
        ? "both"
        : productMode;
  const activeProduct: ActiveProduct =
    effectiveMode === "both"
      ? (stored ?? "invoicing")
      : (effectiveMode as ActiveProduct);
  if (stored !== activeProduct) setActiveProduct(activeProduct);

  // Persist a cross-product login by upgrading the profile to "both" once.
  const needsUpgrade = effectiveMode === "both" && productMode !== "both";
  useEffect(() => {
    if (!needsUpgrade) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      await supabase.from("profiles").update({ product_mode: "both" }).eq("id", data.user.id);
      if (!cancelled) setProductMode("both");
    })();
    return () => { cancelled = true; };
  }, [needsUpgrade]);

  // Pass the effective mode to AppShell so the switcher appears immediately
  // (without waiting for the DB round-trip above).
  const shellProductMode: ProductMode = effectiveMode;

  return (
    <AppShell
      companies={companies}
      activeId={activeId}
      productMode={shellProductMode}
      activeProduct={activeProduct}
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