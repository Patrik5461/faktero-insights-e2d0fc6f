import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bezpecnyNavrat } from "@/lib/faktero/navrat-po-prihlaseni";
import { EfakturaOznam } from "@/components/faktero/EfakturaOznam";
import { AppShell, type ProductMode } from "@/components/faktero/AppShell";
import {
  getActiveCompanyId,
  setActiveCompanyId,
  fetchMyCompanies,
  firmyZastarane,
  FIRMY_ZMENENE,
} from "@/lib/faktero/active-company";
import { PlanGateBanner } from "@/components/faktero/PlanGateBanner";
import { zapisOdlozeneSuhlasy } from "@/lib/faktero/pravne-suhlasy";
import { recordLegalAcceptance } from "@/lib/legal.functions";
import { ZrusenieBanner } from "@/components/faktero/ZrusenieBanner";
import { ProductModePicker } from "@/components/faktero/ProductModePicker";
import {
  ACTIVE_PRODUCT_EVENT,
  getActiveProduct,
  landingPathFor,
  setActiveProduct,
  type ActiveProduct,
} from "@/lib/faktero/active-product";
import { KrajinaFirmyProvider, useT } from "@/lib/i18n/useT";
import { krajinaDane } from "@/lib/faktero/vat-rates";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      // Zapnuté dvojfaktorové overenie: bez kódu sa ďalej nepokračuje (databáza
      // by aj tak nevydala nič). Kód sa pýta raz za prihlásenie.
      const { potrebujeKod } = await import("@/lib/faktero/dvojfaktor");
      if (await potrebujeKod()) {
        throw redirect({ to: "/overenie", search: { next: location.href } });
      }
      return { user: sessionData.session.user };
    }
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) return { user: data.user };
    } catch {
      // network error — treat as unauthenticated
    }
    // Po prihlásení späť tam, kde človek bol (napr. k rozpísanej faktúre).
    const dalej = bezpecnyNavrat(location.href);
    throw redirect({ to: "/prihlasenie", search: (dalej ? { dalej } : {}) as never });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { t } = useT();
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

  /* Stránky Knihy jázd ukazujú jej menu, aj keď sa na ne prišlo z Fakturácie
     odkazom — inak svieti „Fakturácia“ a v menu nie je nič z toho, kde človek je.
     Voľba sa neukladá, odchodom z /jazdy sa vráti tá zvolená. */
  const zCesty: ActiveProduct | null =
    productMode === "both" && (pathname === "/jazdy" || pathname.startsWith("/jazdy/"))
      ? "logbook"
      : null;
  const requestedProduct: ActiveProduct =
    zCesty ?? activeProduct ?? (productMode === "logbook" ? "logbook" : "invoicing");
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
    // `getSession` stačí: id je z relácie v pamäti a riadok aj tak stráži RLS.
    // `getUser` by sa pri každom otvorení pýtal servera.
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!mounted || !uid) return;
      supabase
        .from("profiles")
        .select("product_mode, deletion_scheduled_for")
        .eq("id", uid)
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

  /*
    Firmy sa načítajú raz, nie pri každom prechode na inú stránku. Znova sa
    pýtajú, keď:
    - niekto oznámi zmenu (`oznamZmenuFiriem` — uloženie údajov firmy),
    - človek sa vráti na kartu prehliadača (rolu mu mohol zmeniť kolega),
    - pri prechode, ak je zoznam prázdny (onboarding práve založil firmu)
      alebo starší než minúta.
    Presmerovanie na onboarding a z neho beží pri každom prechode nad
    zoznamom v pamäti — tak ako doteraz.
  */
  const firmyRef = useRef<any[] | null>(null);
  const nacitaneOd = useRef(0);
  const presmeruj = useCallback(
    (list: any[], cesta: string) => {
      if (list.length === 0 && !cesta.startsWith("/onboarding")) {
        navigate({ to: "/onboarding", replace: true });
      } else if (list.length > 0 && cesta.startsWith("/onboarding")) {
        navigate({ to: "/dashboard", replace: true });
      }
    },
    [navigate],
  );
  const nacitajFirmy = useCallback(async () => {
    const list = await fetchMyCompanies();
    nacitaneOd.current = Date.now();
    firmyRef.current = list;
    setCompanies(list);
    const stored = getActiveCompanyId();
    const next = list.find((c: any) => c.id === stored)?.id ?? list[0]?.id ?? null;
    if (next !== stored) setActiveCompanyId(next);
    setActiveId(next);
    return list;
  }, []);

  useEffect(() => {
    let mounted = true;
    const list = firmyRef.current;
    if (list && list.length > 0 && !firmyZastarane(nacitaneOd.current, Date.now())) {
      presmeruj(list, pathname);
      return;
    }
    nacitajFirmy()
      .then((nove) => {
        if (mounted) presmeruj(nove, pathname);
      })
      .catch(console.error);
    return () => {
      mounted = false;
    };
  }, [pathname, nacitajFirmy, presmeruj]);

  useEffect(() => {
    const znova = () => void nacitajFirmy().catch(console.error);
    const naKarte = () => {
      if (document.visibilityState === "visible") znova();
    };
    window.addEventListener(FIRMY_ZMENENE, znova);
    document.addEventListener("visibilitychange", naKarte);
    return () => {
      window.removeEventListener(FIRMY_ZMENENE, znova);
      document.removeEventListener("visibilitychange", naKarte);
    };
  }, [nacitajFirmy]);

  useEffect(() => {
    if (!profileLoaded || !productMode) return;
    if (zCesty) return;
    if (activeProduct !== shellActiveProduct) setActiveProduct(shellActiveProduct);
  }, [activeProduct, productMode, profileLoaded, shellActiveProduct, zCesty]);

  useEffect(() => {
    if (!needsUpgrade) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid || cancelled) return;
      await supabase.from("profiles").update({ product_mode: "both" }).eq("id", uid);
      if (!cancelled) setProductMode("both");
    })();
    return () => {
      cancelled = true;
    };
  }, [needsUpgrade]);

  if (companies === null || !profileLoaded) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        {t("Načítavam…")}
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
  /* Nemecké názvoslovie dobropisu (Rechnungskorrektur) len pre firmu z Nemecka. */
  const aktivna = companies.find((c: any) => c.id === activeId) ?? companies[0];

  return (
    <KrajinaFirmyProvider krajina={krajinaDane(aktivna?.country)}>
      <AppShell
        companies={companies}
        activeId={activeId}
        productMode={shellProductMode}
        activeProduct={shellActiveProduct}
        onChangeCompany={(id) => {
          setActiveCompanyId(id);
          setActiveId(id);
          /*
          Po prepnutí na prehľad, nie na otvorenú stránku — detail faktúry či
          rozpracovaný formulár patria predchádzajúcej firme a v novej by
          ukazovali „nenájdené“ alebo by sa uložili do nesprávnej firmy.
        */
          window.location.assign(landingPathFor(shellActiveProduct));
        }}
      >
        {zrusiSa && <ZrusenieBanner zrusiSa={zrusiSa} />}
        <PlanGateBanner companyId={activeId} />
        {/* Oznam o e-fakturácii 2027 — okno alebo pás; rozhoduje efaktura-oznam.ts. */}
        <EfakturaOznam
          companyId={aktivna?.id ?? null}
          rola={aktivna?.role ?? null}
          krajina={krajinaDane(aktivna?.country)}
        />
        <Outlet />
      </AppShell>
    </KrajinaFirmyProvider>
  );
}
