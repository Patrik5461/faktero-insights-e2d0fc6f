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
  // product their profile doesn't currently grant, upgrade their access to
  // "both" so the choice actually takes effect (same account, two products).
  const stored = getActiveProduct();
  let activeProduct: ActiveProduct;
  if (productMode === "both") {
    activeProduct = stored ?? "invoicing";
  } else if (stored && stored !== productMode) {
    // Explicit cross-product login — grant access to both, honor the choice.
    activeProduct = stored;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from("profiles")
          .update({ product_mode: "both" })
          .eq("id", data.user.id)
          .then(() => {});
      }
    });
    // Reflect locally without waiting for the round-trip.
    setProductMode("both");
  } else {
    activeProduct = productMode as ActiveProduct;
  }
  if (stored !== activeProduct) setActiveProduct(activeProduct);

  return (
    <AppShell
      companies={companies}
      activeId={activeId}
      productMode={productMode}
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