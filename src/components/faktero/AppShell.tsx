import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/faktero/Logo";
import {
  LayoutDashboard,
  FileText,
  Users,
  FileSpreadsheet,
  KeyRound,
  Settings,
  ChevronDown,
  ChevronsUpDown,
  Plus,
  Search,
  HelpCircle,
  LogOut,
  Building2,
  CreditCard,
  User,
  Menu,
  X,
  Sparkles,
  Shield,
  Warehouse,
  Landmark,
  Car,
  ArrowRightLeft,
  HardHat,
  BookOpen,
} from "lucide-react";
import { setActiveProduct, landingPathFor, type ActiveProduct } from "@/lib/faktero/active-product";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CreateCompanyDialog } from "@/components/faktero/CreateCompanyDialog";
import { FloatingAIButton } from "@/components/faktero/FloatingAIButton";
import { NotificationBell } from "@/components/faktero/NotificationBell";
import { getMyAdminRole } from "@/lib/faktero/admin.functions";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { useIsNative } from "@/hooks/useIsNative";
import { initNativePlatform } from "@/lib/mobile/native-init";

type Company = { id: string; name: string; logo_url?: string | null; role: string };

/** `companyAdminOnly`: skryté pre bežných členov firmy — server tie dáta owner/adminovi
 *  vydá a členovi nie, takže položka by im aj tak skončila chybou. */
type NavChild = {
  to: string;
  /** Parametre adresy. Musia ísť zvlášť — router ich z reťazca v `to` neprečíta. */
  search?: Record<string, string>;
  label: string;
  companyAdminOnly?: boolean;
};
type NavGroup = {
  key: string;
  label: string;
  icon: any;
  match: string[]; // route prefixes
  children: NavChild[];
  exact?: boolean;
};

const NAV: NavGroup[] = [
  { key: "prehlad", label: "Prehľad", icon: LayoutDashboard, match: ["/dashboard"], children: [] },
  {
    key: "fakturacia",
    label: "Fakturácia",
    icon: FileText,
    match: [
      "/faktury",
      "/ponuky",
      "/opakovane",
      "/prijate-faktury",
      "/zalohove",
      "/faktury/skener",
      "/objednavky",
    ],
    children: [
      { to: "/faktury", label: "Faktúry" },
      { to: "/faktury/nova", label: "Nová faktúra" },
      { to: "/faktury/rychla", label: "Rýchla faktúra" },
      { to: "/zalohove", label: "Zálohové faktúry" },
      { to: "/ponuky", label: "Cenové ponuky" },
      { to: "/objednavky", label: "Prijaté objednávky" },
      { to: "/objednavky/nova", label: "Nová objednávka" },
      { to: "/opakovane", label: "Opakované faktúry" },
      { to: "/faktury", search: { type: "credit" }, label: "Dobropisy" },
      { to: "/prijate-faktury", label: "Prijaté faktúry" },
      { to: "/faktury", search: { status: "draft" }, label: "Koncepty" },
      { to: "/faktury/skener", label: "Skener dokladov" },
    ],
  },
  {
    key: "doklady",
    label: "Doklady",
    icon: FileText,
    match: ["/doklady", "/efaktura"],
    children: [
      { to: "/doklady", label: "Prehľad dokladov" },
      { to: "/doklady/novy", label: "Nový doklad (foto/QR/upload)" },
      { to: "/doklady/mailom", label: "Doklady e-mailom" },
      { to: "/efaktura", label: "Prehľad eFaktúry" },
      { to: "/efaktura/odoslane", label: "Odoslané eFaktúry" },
      { to: "/efaktura/prijate", label: "Prijaté eFaktúry" },
      { to: "/efaktura/dorucenia", label: "Doručenia eFaktúr" },
    ],
  },
  {
    key: "kontakty",
    label: "Kontakty",
    icon: Users,
    match: ["/odberatelia"],
    children: [
      { to: "/odberatelia", label: "Odberatelia" },
      { to: "/odberatelia", search: { new: "1" }, label: "Nový odberateľ" },
    ],
  },
  {
    key: "zakazky",
    label: "Zákazky",
    icon: HardHat,
    match: ["/zakazky"],
    children: [
      { to: "/zakazky", label: "Prehľad zákaziek" },
      { to: "/zakazky/nova", label: "Nová zákazka" },
    ],
  },
  {
    key: "sklad",
    label: "Sklad",
    icon: Warehouse,
    match: ["/sklad", "/produkty", "/ceny"],
    children: [
      { to: "/sklad", label: "Prehľad" },
      { to: "/produkty", label: "Produkty a služby" },
      { to: "/ceny", label: "Cenník a zľavy" },
      { to: "/ceny/akcie", label: "Cenové akcie" },
      { to: "/sklad/produkty", label: "Skladové položky" },
      { to: "/sklad/kategorie", label: "Kategórie" },
      { to: "/sklad/pohyby", label: "Pohyby" },
      { to: "/sklad/objednavky", label: "Objednávky u dodávateľov" },
      { to: "/sklad/minimum", label: "Pod minimom" },
      { to: "/sklad/inventura", label: "Inventúra" },
    ],
  },
  {
    key: "banka",
    label: "Banka",
    icon: Landmark,
    match: ["/bankove-ucty", "/financovanie"],
    children: [
      { to: "/bankove-ucty", label: "Bankové účty" },
      { to: "/bankove-ucty/transakcie", label: "Bankové transakcie" },
      { to: "/bankove-ucty/vypisy", label: "Bankové výpisy" },
      { to: "/financovanie", label: "Leasingy a úvery" },
      { to: "/financovanie/nova", label: "Nová zmluva o financovaní" },
      { to: "/bankove-ucty/pripojit", label: "Pripojiť banku" },
    ],
  },
  {
    key: "uctovnictvo",
    label: "Účtovníctvo",
    icon: FileSpreadsheet,
    match: ["/pokladna", "/exporty", "/importy", "/uctovnictvo"],
    children: [
      { to: "/pokladna", label: "Pokladňa" },
      { to: "/uctovnictvo/dph", label: "DPH prehľad" },
      { to: "/uctovnictvo/uzavierka", label: "Uzávierka" },
      { to: "/exporty", label: "Účtovné exporty" },
      { to: "/exporty", search: { tab: "history" }, label: "História exportov" },
      { to: "/uctovnictvo/pohoda", label: "Prepojenie s Pohodou" },
      { to: "/uctovnictvo/vypis-do-pohody", label: "Bankový výpis do Pohody" },
      { to: "/importy/superfaktura", label: "Import zo SuperFaktúry" },
      { to: "/importy/pohoda", label: "Import z Pohody a mPohody" },
      { to: "/importy/money-s3", label: "Import z Money S3" },
      { to: "/importy/omega", label: "Import z Omega" },
      { to: "/importy/idoklad", label: "Import z iDoklad" },
      { to: "/importy/kros", label: "Import z KROS" },
      { to: "/importy", label: "História importov" },
    ],
  },
  {
    key: "logbook-prehlad",
    label: "Prehľad",
    icon: LayoutDashboard,
    match: ["/jazdy/prehlad"],
    children: [],
  },
  {
    key: "jazdy",
    label: "Jazdy",
    icon: Car,
    match: ["/jazdy", "/jazdy/nova", "/jazdy/export"],
    exact: true,
    children: [
      { to: "/jazdy", label: "Jazdy" },
      { to: "/jazdy/nova", label: "Nová jazda" },
      { to: "/jazdy/export", label: "Export" },
    ],
  },
  {
    key: "vozidla",
    label: "Vozidlá",
    icon: Car,
    match: ["/jazdy/vozidla"],
    children: [{ to: "/jazdy/vozidla", label: "Vozidlá a tankovanie" }],
  },
  {
    key: "integracie",
    label: "Integrácie",
    icon: ArrowRightLeft,
    match: ["/jazdy/integracie"],
    children: [
      { to: "/jazdy/integracie", label: "Prehľad integrácií" },
      { to: "/jazdy/integracie/commander", label: "Commander GPS" },
      { to: "/jazdy/integracie/tesla", label: "Tesla Fleet API" },
    ],
  },
  {
    key: "viac",
    label: "Viac",
    icon: Menu,
    match: ["/ai-asistent", "/firmy", "/predplatne", "/diagnostika"],
    children: [
      { to: "/ai-asistent", label: "Faktero AI" },
      { to: "/firmy", label: "Správa firiem" },
      { to: "/predplatne", label: "Predplatné" },
      { to: "/diagnostika", label: "Diagnostika", companyAdminOnly: true },
    ],
  },
];

/** API a Nastavenia sa presunuli z hlavnej lišty do menu pod avatarom. */
const ACCOUNT_API_LINKS: NavChild[] = [
  { to: "/api-kluce", label: "API kľúče" },
  { to: "/api-dokumentacia", label: "API dokumentácia" },
  { to: "/api-playground", label: "API playground" },
  { to: "/webhooky", label: "Webhooky" },
  { to: "/webhooky-logy", label: "Webhook delivery logy" },
];

const ACCOUNT_SETTINGS_LINKS: NavChild[] = [
  { to: "/firma", label: "Firma" },
  { to: "/nastavenia/vzhlad-faktury", label: "Vzhľad faktúry" },
  { to: "/nastavenia/email-sablony", label: "Email šablóny" },
  { to: "/nastavenia", label: "Nastavenia systému" },
];

/**
 * Ktorá položka podmenu je práve otvorená. Rozhoduje aj podľa parametrov,
 * inak by na `/faktury?status=draft` svietili Faktúry aj Koncepty naraz.
 * Vracia kľúč položky, nie index — kľúče sú rovnaké ako pri vykresľovaní.
 */
function activeChildKey(
  children: NavChild[],
  pathname: string,
  search: Record<string, unknown>,
): string | null {
  const hit = children.find(
    (c) =>
      c.to === pathname &&
      c.search &&
      Object.entries(c.search).every(([k, v]) => String(search[k] ?? "") === v),
  );
  if (hit) return hit.to + hit.label;
  const plain = children.find((c) => c.to === pathname && !c.search);
  return plain ? plain.to + plain.label : null;
}

const QUICK_CREATE = [
  { to: "/faktury/nova", label: "Nová faktúra" },
  // Krátka cesta: odberateľ, suma, popis. Bez nej sa na ňu dalo dostať len
  // napísaním adresy, takže o nej nikto nevedel.
  { to: "/faktury/rychla", label: "Rýchla faktúra" },
  { to: "/ponuky/nova", label: "Nová cenová ponuka" },
  { to: "/odberatelia", search: { new: "1" }, label: "Nový odberateľ" },
  { to: "/produkty", search: { new: "1" }, label: "Nový produkt" },
  { to: "/opakovane/nova", label: "Nová opakovaná faktúra" },
];

function isPathActive(pathname: string, group: Pick<NavGroup, "match" | "exact">) {
  return group.match.some((m) => pathname === m || (!group.exact && pathname.startsWith(m + "/")));
}

export type ProductMode = "invoicing" | "logbook" | "both";

/** Kľúč, ktorý tu chýba, sa z lišty vytratí aj keď má skupina položky aj trasy —
 *  `filterNav` púšťa ďalej len to, čo je v jednej z týchto dvoch množín. */
const INVOICING_KEYS = new Set([
  "prehlad",
  "fakturacia",
  "doklady",
  "kontakty",
  "zakazky",
  "sklad",
  "banka",
  "uctovnictvo",
]);
const LOGBOOK_KEYS = new Set(["logbook-prehlad", "jazdy", "vozidla", "integracie"]);

/**
 * Resolve the *view* to render based on access (productMode) and the user's
 * currently selected product (activeProduct from localStorage). When the user
 * only has access to one product, that product wins regardless of activeProduct.
 */
function resolveView(productMode: ProductMode, activeProduct: ActiveProduct): ActiveProduct {
  if (productMode === "invoicing") return "invoicing";
  if (productMode === "logbook") return "logbook";
  return activeProduct;
}

function filterNav(view: ActiveProduct, isCompanyAdmin: boolean): NavGroup[] {
  const allowed = view === "invoicing" ? INVOICING_KEYS : LOGBOOK_KEYS;
  // "viac" je spoločné pre oba produkty a vždy ide na koniec lišty
  return NAV.filter((g) => allowed.has(g.key) || g.key === "viac").map((g) =>
    isCompanyAdmin ? g : { ...g, children: g.children.filter((c) => !c.companyAdminOnly) },
  );
}

export function AppShell({
  companies,
  activeId,
  onChangeCompany,
  children,
  productMode = "both",
  activeProduct = "invoicing",
}: {
  companies: Company[];
  activeId: string | null;
  onChangeCompany: (id: string) => void;
  children: ReactNode;
  productMode?: ProductMode;
  activeProduct?: ActiveProduct;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locSearch = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const active = companies.find((c) => c.id === activeId) ?? companies[0];
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const view = resolveView(productMode, activeProduct);
  const isCompanyAdmin = active?.role === "owner" || active?.role === "admin";
  const nav = filterNav(view, isCompanyAdmin);
  const homePath = landingPathFor(view);
  const canSwitch = productMode === "both";

  function switchProduct() {
    const next: ActiveProduct = view === "invoicing" ? "logbook" : "invoicing";
    setActiveProduct(next);
    navigate({ to: landingPathFor(next) as any });
    // Force a reload so the shell re-renders with the new view immediately.
    setTimeout(() => window.location.reload(), 0);
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user || cancelled) return;
        const { data } = await supabase
          .from("platform_admins")
          .select("role")
          .eq("user_id", u.user.id)
          .maybeSingle();
        if (!cancelled) setAdminRole((data?.role as string | undefined) ?? null);
      } catch {
        if (!cancelled) setAdminRole(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /*
    Ktorá kategória je rozbalená. Predtým tu bola plávajúca ponuka, ktorá
    zmizla pri prvom kliknutí — položky sa teda nedali porovnať a človek
    kategóriu otváral znova a znova. Rozbalený riadok ostáva pod lištou, kým
    ho sám nezavrie, takže vidno aj to, kde v skupine práve je.
  */
  const [otvorenaKategoria, setOtvorenaKategoria] = useState<string | null>(null);
  const otvorenaSkupina = nav.find((g) => g.key === otvorenaKategoria) ?? null;

  useEffect(() => {
    if (!otvorenaKategoria) return;
    const naEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOtvorenaKategoria(null);
    };
    window.addEventListener("keydown", naEscape);
    return () => window.removeEventListener("keydown", naEscape);
  }, [otvorenaKategoria]);

  const activeGroup = nav.find((g) => isPathActive(pathname, g));
  const activeKey = activeGroup ? activeChildKey(activeGroup.children, pathname, locSearch) : null;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/prihlasenie";
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate({ to: "/faktury", search: { q } as any });
  }

  // Deterministic accent color for the company avatar initial.
  const AVATAR_COLORS = [
    "from-emerald-500 to-teal-600",
    "from-emerald-600 to-green-700",
    "from-teal-500 to-emerald-700",
    "from-amber-500 to-orange-600",
    "from-lime-500 to-emerald-600",
    "from-emerald-400 to-cyan-600",
  ];
  function avatarGradient(name?: string) {
    const s = name ?? "";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      {/* Top header */}
      <header
        className={`sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] ${
          scrolled
            ? "border-b border-black/[0.06] bg-card/75 backdrop-blur-[8px] dark:border-white/[0.08]"
            : "border-b border-transparent bg-card"
        }`}
      >
        {/* Row 1 — identity, context, actions (48px) */}
        <div className="flex h-12 items-center gap-2.5 px-4">
          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary lg:hidden"
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto p-0">
              <MobileNav
                pathname={pathname}
                active={active}
                companies={companies}
                nav={nav}
                homePath={homePath}
                view={view}
                canSwitch={canSwitch}
                onSwitchProduct={switchProduct}
                onChangeCompany={onChangeCompany}
                onSignOut={signOut}
                onAddCompany={() => {
                  setMobileOpen(false);
                  setCreateOpen(true);
                }}
                onClose={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link to={homePath as any} className="flex shrink-0 items-center" aria-label="Faktero">
            <Logo variant="icon" className="h-7 w-7 sm:hidden" />
            <Logo className="hidden h-7 sm:block" />
          </Link>

          {/* Hairline divider */}
          <div className="hidden h-5 w-px bg-black/[0.08] md:block dark:bg-white/[0.12]" />

          {/* Product segmented control — separate axis from company switcher */}
          {canSwitch && (
            <div
              role="tablist"
              aria-label="Produkt"
              className="hidden h-7 shrink-0 items-center gap-0.5 rounded-full bg-muted/60 p-[2px] md:inline-flex"
            >
              {(
                [
                  { key: "invoicing" as ActiveProduct, label: "Fakturácia", Icon: FileText },
                  { key: "logbook" as ActiveProduct, label: "Kniha jázd", Icon: Car },
                ] satisfies { key: ActiveProduct; label: string; Icon: typeof FileText }[]
              ).map(({ key, label, Icon }) => {
                const isActive = view === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={label}
                    title={label}
                    onClick={() => {
                      if (!isActive) switchProduct();
                    }}
                    className={`flex items-center rounded-full px-[11px] py-[4px] text-[12px] leading-none transition ${
                      isActive
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "bg-transparent text-muted-foreground hover:bg-background/50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 min-[900px]:hidden" />
                    <span className="hidden min-[900px]:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Company switcher — pill */}
          {active && (
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden min-w-0 items-center gap-1.5 rounded-full border-[0.5px] border-border bg-background py-1 pl-1 pr-2 text-[12px] text-foreground hover:bg-secondary/60 md:inline-flex">
                <span
                  className={`grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-gradient-to-br ${avatarGradient(active.name)} text-[9px] font-semibold text-white`}
                >
                  {(active.name?.[0] ?? "F").toUpperCase()}
                </span>
                <span className="max-w-[160px] truncate font-medium">{active.name}</span>
                <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Firmy</DropdownMenuLabel>
                {companies.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => onChangeCompany(c.id)}
                    className={c.id === activeId ? "font-semibold" : ""}
                  >
                    <span
                      className={`mr-2 grid h-5 w-5 shrink-0 place-items-center rounded bg-gradient-to-br ${avatarGradient(c.name)} text-[10px] font-semibold text-white`}
                    >
                      {(c.name?.[0] ?? "F").toUpperCase()}
                    </span>
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{c.role}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" /> Pridať firmu
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Search — pill, max 400px */}
          {view !== "logbook" ? (
            <form onSubmit={submitSearch} className="hidden min-w-0 flex-1 md:block">
              <div className="relative max-w-[400px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hľadať"
                  className="h-8 w-full rounded-full bg-muted/60 pl-8 pr-12 text-[12.5px] placeholder:text-muted-foreground focus:bg-muted focus:outline-none"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
                  ⌘K
                </kbd>
              </div>
            </form>
          ) : (
            <div className="flex-1" />
          )}

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell />

            {/* Quick create — the only filled element */}
            {view !== "logbook" && (
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90">
                  <Plus className="h-3.5 w-3.5" />{" "}
                  <span className="hidden sm:inline">Vytvoriť</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                    <Sparkles className="h-3 w-3" /> Rýchle vytvorenie
                  </DropdownMenuLabel>
                  {QUICK_CREATE.map((c) => (
                    <DropdownMenuItem key={c.to + c.label} asChild>
                      <Link to={c.to as any} search={c.search as any}>
                        {c.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Profile avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-[12px] font-semibold text-primary ring-1 ring-border hover:ring-primary/40">
                {(active?.name?.[0] ?? "U").toUpperCase()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Účet</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to={"/nastavenia" as any}>
                    <User className="mr-2 h-3.5 w-3.5" /> Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/predplatne">
                    <CreditCard className="mr-2 h-3.5 w-3.5" /> Predplatné
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Settings className="h-3 w-3" /> Nastavenia
                </DropdownMenuLabel>
                {ACCOUNT_SETTINGS_LINKS.map((c) => (
                  <DropdownMenuItem key={c.to + c.label} asChild>
                    <Link to={c.to as any}>{c.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <KeyRound className="h-3 w-3" /> API
                </DropdownMenuLabel>
                {ACCOUNT_API_LINKS.map((c) => (
                  <DropdownMenuItem key={c.to + c.label} asChild>
                    <Link to={c.to as any}>{c.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={"/pomoc" as any}>
                    <HelpCircle className="mr-2 h-3.5 w-3.5" /> Pomoc
                  </Link>
                </DropdownMenuItem>
                {adminRole && (
                  <DropdownMenuItem asChild>
                    <Link to={"/admin" as any}>
                      <Shield className="mr-2 h-3.5 w-3.5 text-primary" /> Platform Admin
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Odhlásiť
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2 — primary navigation (36px) */}
        <div className="hidden lg:block">
          <nav className="flex h-9 items-center gap-1 overflow-x-auto px-3 pb-2">
            {nav.map((g) => {
              const isActive = isPathActive(pathname, g);
              const base = `inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-[5px] text-[12.5px] transition-colors ${
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted/70"
              }`;
              if (g.children.length === 0) {
                return (
                  <Link
                    key={g.key}
                    to={g.match[0]}
                    className={base}
                    onClick={() => setOtvorenaKategoria(null)}
                  >
                    {g.label}
                  </Link>
                );
              }
              const jeOtvorena = otvorenaKategoria === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-expanded={jeOtvorena}
                  aria-controls="podmenu-kategorie"
                  onClick={() => setOtvorenaKategoria(jeOtvorena ? null : g.key)}
                  className={`${base} ${jeOtvorena ? "bg-muted font-medium text-foreground" : ""} ${
                    g.key === "viac" ? "ml-auto" : ""
                  }`}
                >
                  {g.label}
                  <ChevronDown
                    className={`h-3 w-3 opacity-60 transition-transform ${jeOtvorena ? "rotate-180" : ""}`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Riadok 3 — položky otvorenej kategórie. Je tu, len kým je otvorená. */}
          {otvorenaSkupina && (
            <div id="podmenu-kategorie" className="border-t border-border bg-muted/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1">
                {otvorenaSkupina.children.map((c) => {
                  const isChildActive =
                    activeKey === c.to + c.label && activeGroup?.key === otvorenaSkupina.key;
                  return (
                    <Link
                      key={c.to + c.label}
                      to={c.to as any}
                      search={c.search as any}
                      className={`shrink-0 rounded-full px-3 py-[5px] text-[12.5px] transition-colors ${
                        isChildActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-background hover:text-foreground"
                      }`}
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Účtovník doklady zapisuje aj mení. Nedostane sa len k tomu, čo je
            správa firmy — nech to vie skôr, než to začne hľadať. */}
        {active?.role === "accountant" && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
            Ste vo firme <strong>{active.name}</strong> ako účtovník — doklady vediete v plnom
            rozsahu. Napojenie banky, platby, API kľúče a správu používateľov má na starosti majiteľ
            alebo administrátor.
          </div>
        )}
        {children}
      </main>
      <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <FloatingAIButton />
      <NativeShellExtras />
    </div>
  );
}

function NativeShellExtras() {
  const isNative = useIsNative();
  useEffect(() => {
    initNativePlatform();
  }, []);
  if (!isNative) return null;
  return <MobileBottomNav />;
}

function MobileNav({
  pathname,
  active,
  companies,
  nav,
  homePath,
  view,
  canSwitch,
  onSwitchProduct,
  onChangeCompany,
  onSignOut,
  onAddCompany,
  onClose,
}: {
  pathname: string;
  active: Company | undefined;
  companies: Company[];
  nav: NavGroup[];
  homePath: string;
  view: ActiveProduct;
  canSwitch: boolean;
  onSwitchProduct: () => void;
  onChangeCompany: (id: string) => void;
  onSignOut: () => void;
  onAddCompany: () => void;
  onClose: () => void;
}) {
  const locSearch = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Link to={homePath as any} onClick={onClose} className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
            F
          </span>
          <span className="font-semibold">Faktero</span>
        </Link>
        <button
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-md hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {canSwitch && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onSwitchProduct();
          }}
          className="flex items-center justify-center gap-1.5 border-b border-border bg-secondary/40 px-4 py-2 text-xs font-medium text-foreground/80 hover:bg-secondary"
        >
          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
          {view === "invoicing" ? "Prepnúť na Knihu jázd" : "Prepnúť na Fakturáciu"}
        </button>
      )}
      {active && (
        <div className="border-b border-border px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Firma</div>
          <select
            value={active.id}
            onChange={(e) => onChangeCompany(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onAddCompany();
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> Pridať firmu
          </button>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {nav.map((g) => (
          <div key={g.key} className="mb-3">
            <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </div>
            {g.children.length === 0 ? (
              <Link
                to={g.match[0]}
                onClick={onClose}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${pathname === g.match[0] ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`}
              >
                <g.icon className="h-4 w-4" /> {g.label}
              </Link>
            ) : (
              g.children.map((c) => {
                const isActive = activeChildKey(g.children, pathname, locSearch) === c.to + c.label;
                return (
                  <Link
                    key={c.to + c.label}
                    to={c.to as any}
                    search={c.search as any}
                    onClick={onClose}
                    className={`block rounded-md px-3 py-2 text-sm ${isActive ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`}
                  >
                    {c.label}
                  </Link>
                );
              })
            )}
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary"
        >
          <LogOut className="h-4 w-4" /> Odhlásiť
        </button>
      </div>
    </div>
  );
}

/**
 * Ku ktorej stránke patrí ktorý manuál. Odkaz sa vykreslí v hlavičke sám —
 * inak by ho bolo treba dopísať do osemdesiatich súborov a pri každej novej
 * stránke naň znova zabudnúť.
 *
 * Poradie nerozhoduje, hľadá sa **najdlhšia zhoda** predpony, takže
 * `/sklad/objednavky` nájde svoj vlastný manuál a nie ten skladový.
 */
const MANUALY: { prefix: string; to: string }[] = [
  // Párovanie platieb je bližšie k banke než k vystavovaniu faktúr.
  { prefix: "/faktury/parovanie", to: "/pomoc/banka" },
  { prefix: "/faktury", to: "/pomoc/faktury" },
  { prefix: "/zalohove", to: "/pomoc/faktury" },
  { prefix: "/ponuky", to: "/pomoc/ponuky" },
  { prefix: "/objednavky", to: "/pomoc/objednavky" },
  { prefix: "/opakovane", to: "/pomoc/opakovane" },
  { prefix: "/prijate-faktury", to: "/pomoc/prijate-faktury" },
  { prefix: "/doklady", to: "/pomoc/doklady" },
  { prefix: "/pokladna", to: "/pomoc/pokladna" },
  { prefix: "/efaktura", to: "/pomoc/efaktura" },
  { prefix: "/odberatelia", to: "/pomoc/odberatelia" },
  { prefix: "/zakazky", to: "/pomoc/zakazky" },
  { prefix: "/sklad", to: "/pomoc/sklad" },
  { prefix: "/sklad/objednavky", to: "/pomoc/objednavky-dodavatel" },
  { prefix: "/produkty", to: "/pomoc/sklad" },
  { prefix: "/ceny", to: "/pomoc/ceny" },
  { prefix: "/uctovnictvo/dph", to: "/pomoc/dph" },
  { prefix: "/uctovnictvo/uzavierka", to: "/pomoc/uzavierka" },
  { prefix: "/uctovnictvo/pohoda", to: "/pomoc/pohoda" },
  { prefix: "/uctovnictvo/vypis-do-pohody", to: "/pomoc/pohoda" },
  { prefix: "/exporty", to: "/pomoc/exporty" },
  { prefix: "/importy", to: "/pomoc/exporty" },
  { prefix: "/bankove-ucty", to: "/pomoc/banka" },
  { prefix: "/financovanie", to: "/pomoc/financovanie" },
  { prefix: "/jazdy", to: "/pomoc/jazdy" },
  { prefix: "/firmy", to: "/pomoc/role" },
  { prefix: "/api-kluce", to: "/pomoc/api" },
  { prefix: "/api-dokumentacia", to: "/pomoc/api" },
  { prefix: "/api-playground", to: "/pomoc/api" },
  { prefix: "/webhooky", to: "/pomoc/api" },
  { prefix: "/predplatne", to: "/pomoc/predplatne" },
];

export function manualPre(pathname: string): string | null {
  let najdlhsi: { prefix: string; to: string } | null = null;
  for (const m of MANUALY) {
    if (pathname === m.prefix || pathname.startsWith(m.prefix + "/")) {
      if (!najdlhsi || m.prefix.length > najdlhsi.prefix.length) najdlhsi = m;
    }
  }
  return najdlhsi?.to ?? null;
}

export function PageHeader({
  title,
  description,
  action,
  help,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Vlastný manuál, keď automatický odkaz nesedí. `false` ho skryje. */
  help?: string | false;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const manual = help === false ? null : (help ?? manualPre(pathname));

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card/40 px-4 py-4 sm:px-6 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-4 lg:px-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {manual && (
            <a
              href={manual}
              target="_blank"
              rel="noreferrer"
              title="Otvoriť manuál v novom okne"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <BookOpen className="h-3 w-3" /> Manuál
            </a>
          )}
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex w-full flex-wrap gap-2 lg:w-auto">{action}</div>}
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</div>;
}
