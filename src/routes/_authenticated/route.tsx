import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, type ProductMode } from "@/components/faktero/AppShell";
import {
  getActiveCompanyId,
  setActiveCompanyId,
  fetchMyCompanies,
} from "@/lib/faktero/active-company";
import { PlanGateBanner } from "@/components/faktero/PlanGateBanner";
import { zapisOdlozeneSuhlasy } from "@/lib/faktero/pravne-suhlasy";
import { recordLegalAcceptance } from "@/lib/legal.functions";
import { ZrusenieBanner } from "@/components/faktero/ZrusenieBanner";
import { ProductModePicker } from "@/components/faktero/ProductModePicker";
import {
  ACTIVE_PRODUCT_EVENT,
  getActiveProduct,
  setActiveProduct,
  type ActiveProduct,
} from "@/lib/faktero/active-product";

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
  const [activeProduct, setActiveProductState] = useState<ActiveProduct | null>(() =>
    getActiveProduct(),
  );
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [zrusiSa, setZrusiSa] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const requestedProduct: ActiveProduct =
    activeProduct ?? (productMode === "logbook" ? "logbook" : "invoicing");
  const effectiveMode: ProductMode | null = productMode
    ? productMode === "both"
      ? "both"
      : requestedProduct !== productMode
        ? "both"
        : productMode
    : null;
  const shellActiveProduct: ActiveProduct =
    effectiveMode === "logbook" ? "logbook" : requestedProduct;
  const needsUpgrade = !!productMode && effectiveMode === "both" && productMode !== "both";

  useEffect(() => {
    const sync = () => setActiveProductState(getActiveProduct());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(ACTIVE_PRODUCT_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ACTIVE_PRODUCT_EVENT, sync);
    };
  }, []);

  /*
    Súhlasy udelené pri registrácii, ktorá vtedy ešte nemala reláciu — cez
    Google alebo pri registrácii čakajúcej na potvrdenie e-mailu. Zapíšu sa tu,
    lebo toto je prvé miesto, kde je isté, že je kto prihlásený. Keď nič
    nečaká, funkcia sa nespýta servera na nič.
  */
  useEffect(() => {
    void zapisOdlozeneSuhlasy(recordLegalAcceptance);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      supabase
        .from("profiles")
        .select("product_mode, deletion_scheduled_for")
        .eq("id", data.user.id)
        .maybeSingle()
        .then(({ data: p }) => {
          if (!mounted) return;
          setProductMode((p?.product_mode ?? null) as ProductMode | null);
          // Naplánované zrušenie musí byť vidieť pri každom prihlásení, nie až
          // v nastaveniach — inak sa človek dozvie o vlastnej chybe až potom.
          setZrusiSa((p?.deletion_scheduled_for ?? null) as string | null);
          setProfileLoaded(true);
        });
    });
    return () => {
      mounted = false;
    };
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
    return () => {
      mounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!profileLoaded || !productMode) return;
    if (activeProduct !== shellActiveProduct) setActiveProduct(shellActiveProduct);
  }, [activeProduct, productMode, profileLoaded, shellActiveProduct]);

  useEffect(() => {
    if (!needsUpgrade) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      await supabase.from("profiles").update({ product_mode: "both" }).eq("id", data.user.id);
      if (!cancelled) setProductMode("both");
    })();
    return () => {
      cancelled = true;
    };
  }, [needsUpgrade]);

  if (companies === null || !profileLoaded) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Načítavam…
      </div>
    );
  }

  // Onboarding stands alone (no sidebar) when there is no company yet
  if (companies.length === 0 || pathname.startsWith("/onboarding")) {
    return <Outlet />;
  }

  // After company exists, ask which product(s) to use
  if (!productMode) {
    return <ProductModePicker onPicked={(m) => setProductMode(m)} />;
  }

  // Pass the effective mode to AppShell so the switcher appears immediately
  // (without waiting for the DB round-trip above).
  const shellProductMode: ProductMode = effectiveMode ?? productMode;

  return (
    <AppShell
      companies={companies}
      activeId={activeId}
      productMode={shellProductMode}
      activeProduct={shellActiveProduct}
      onChangeCompany={(id) => {
        setActiveCompanyId(id);
        setActiveId(id);
        window.location.reload();
      }}
    >
      {zrusiSa && <ZrusenieBanner zrusiSa={zrusiSa} />}
      <PlanGateBanner companyId={activeId} />
      <Outlet />
    </AppShell>
  );
}
