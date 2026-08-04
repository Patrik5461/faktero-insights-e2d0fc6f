import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/faktero/Logo";
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  FileSpreadsheet,
  FileCheck2,
  KeyRound,
  Settings,
  ChevronDown,
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
  Landmark,
  Shield,
  Warehouse,
  Car,
  ArrowRightLeft,
  Bell,
} from "lucide-react";
import { setActiveProduct, landingPathFor, type ActiveProduct } from "@/lib/faktero/active-product";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, type ReactNode } from "react";
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
import { getMyAdminRole } from "@/lib/faktero/admin.functions";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { useIsNative } from "@/hooks/useIsNative";
import { initNativePlatform } from "@/lib/mobile/native-init";

type Company = { id: string; name: string; logo_url?: string | null; role: string };

type NavChild = { to: string; label: string };
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
    match: ["/faktury", "/ponuky", "/opakovane", "/prijate-faktury", "/zalohove"],
    children: [
      { to: "/faktury", label: "Faktúry" },
      { to: "/faktury/nova", label: "Nová faktúra" },
      { to: "/zalohove", label: "Zálohové faktúry" },
      { to: "/ponuky", label: "Cenové ponuky" },
      { to: "/opakovane", label: "Opakované faktúry" },
      { to: "/faktury?type=credit", label: "Dobropisy" },
      { to: "/prijate-faktury", label: "Prijaté faktúry" },
      { to: "/faktury?status=draft", label: "Koncepty" },
    ],
  },
  {
    key: "kontakty",
    label: "Kontakty",
    icon: Users,
    match: ["/odberatelia"],
    children: [
      { to: "/odberatelia", label: "Odberatelia" },
      { to: "/odberatelia?new=1", label: "Nový odberateľ" },
    ],
  },
  {
    key: "sklad",
    label: "Sklad",
    icon: Warehouse,
    match: ["/sklad", "/produkty"],
    children: [
      { to: "/sklad", label: "Prehľad" },
      { to: "/produkty", label: "Produkty a služby" },
      { to: "/sklad/produkty", label: "Skladové položky" },
      { to: "/sklad/pohyby", label: "Pohyby" },
      { to: "/sklad/inventura", label: "Inventúra" },
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
    key: "doklady",
    label: "Doklady",
    icon: FileText,
    match: ["/doklady"],
    children: [
      { to: "/doklady", label: "Prehľad dokladov" },
      { to: "/doklady/novy", label: "Nový doklad (foto/QR/upload)" },
    ],
  },
  {
    key: "uctovnictvo",
    label: "Účtovníctvo",
    icon: FileSpreadsheet,
    match: ["/exporty", "/importy", "/uctovnictvo"],
    children: [
      { to: "/uctovnictvo/dph", label: "DPH prehľad" },
      { to: "/exporty", label: "Účtovné exporty" },
      { to: "/exporty?provider=pohoda", label: "Pohoda export" },
      { to: "/exporty?tab=history", label: "História exportov" },
      { to: "/importy/superfaktura", label: "Import zo SuperFaktúry" },
      { to: "/importy/money-s3", label: "Import z Money S3" },
      { to: "/importy/omega", label: "Import z Omega" },
      { to: "/importy/idoklad", label: "Import z iDoklad" },
      { to: "/importy/kros", label: "Import z KROS" },
      { to: "/importy", label: "História importov" },
    ],
  },
  {
    key: "efaktura",
    label: "eFaktúra",
    icon: FileCheck2,
    match: ["/efaktura"],
    children: [
      { to: "/efaktura", label: "Prehľad eFaktúry" },
      { to: "/efaktura/odoslane", label: "Odoslané eFaktúry" },
      { to: "/efaktura/prijate", label: "Prijaté eFaktúry" },
      { to: "/efaktura/dorucenia", label: "Doručenia" },
    ],
  },
  {
    key: "banka",
    label: "Bankové účty",
    icon: Landmark,
    match: ["/bankove-ucty"],
    children: [
      { to: "/bankove-ucty", label: "Prehľad účtov" },
      { to: "/bankove-ucty/transakcie", label: "Transakcie" },
      { to: "/bankove-ucty/pripojit", label: "Pripojiť banku" },
    ],
  },
  {
    key: "api",
    label: "API",
    icon: KeyRound,
    match: ["/api-kluce", "/api-dokumentacia", "/api-playground", "/webhooky", "/webhooky-logy"],
    children: [
      { to: "/api-kluce", label: "API kľúče" },
      { to: "/api-dokumentacia", label: "API dokumentácia" },
      { to: "/api-playground", label: "API playground" },
      { to: "/webhooky", label: "Webhooky" },
      { to: "/webhooky-logy", label: "Webhook delivery logy" },
    ],
  },
  {
    key: "nastavenia",
    label: "Nastavenia",
    icon: Settings,
    match: ["/firma", "/firmy", "/predplatne", "/nastavenia", "/diagnostika"],
    children: [
      { to: "/firma", label: "Firma" },
      { to: "/nastavenia/vzhlad-faktury", label: "Vzhľad faktúry" },
      { to: "/nastavenia/email-sablony", label: "Email šablóny" },
      { to: "/firmy", label: "Správa firiem" },
      { to: "/predplatne", label: "Predplatné" },
      { to: "/nastavenia/online-platby", label: "Online platby" },

      { to: "/nastavenia", label: "Nastavenia systému" },
      { to: "/diagnostika", label: "Diagnostika" },
    ],
  },
];

const QUICK_CREATE = [
  { to: "/faktury/nova", label: "Nová faktúra" },
  { to: "/ponuky/nova", label: "Nová cenová ponuka" },
  { to: "/odberatelia?new=1", label: "Nový odberateľ" },
  { to: "/produkty?new=1", label: "Nový produkt" },
  { to: "/opakovane/nova", label: "Nová opakovaná faktúra" },
];

function isPathActive(pathname: string, group: Pick<NavGroup, "match" | "exact">) {
  return group.match.some((m) => pathname === m || (!group.exact && pathname.startsWith(m + "/")));
}

export type ProductMode = "invoicing" | "logbook" | "both";

const INVOICING_KEYS = new Set([
  "prehlad",
  "fakturacia",
  "kontakty",
  "produkty",
  "sklad",
  "doklady",
  "uctovnictvo",
  "efaktura",
  "banka",
  "api",
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

function filterNav(view: ActiveProduct): NavGroup[] {
  const allowed = view === "invoicing" ? INVOICING_KEYS : LOGBOOK_KEYS;
  // "nastavenia" je spoločné pre oba produkty
  return NAV.filter((g) => allowed.has(g.key) || g.key === "nastavenia");
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
  const navigate = useNavigate();
  const active = companies.find((c) => c.id === activeId) ?? companies[0];
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);

  const view = resolveView(productMode, activeProduct);
  const nav = filterNav(view);
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

  const activeGroup = nav.find((g) => isPathActive(pathname, g));

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
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        {/* Row 1 — identity, context, actions */}
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary lg:hidden"
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
            <Logo variant="icon" className="sm:hidden" />
            <Logo className="hidden h-8 sm:block" />
          </Link>

          {/* Divider */}
          <div className="hidden h-6 w-px bg-border md:block" />

          {/* Company switcher with colored avatar */}
          {active && (
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm hover:bg-secondary md:inline-flex">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br ${avatarGradient(active.name)} text-[11px] font-semibold text-white shadow-sm`}
                >
                  {(active.name?.[0] ?? "F").toUpperCase()}
                </span>
                <span className="max-w-[180px] truncate font-medium">{active.name}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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

          {/* Search — expanded */}
          {view !== "logbook" && (
            <form onSubmit={submitSearch} className="hidden flex-1 md:block">
              <div className="relative mx-auto max-w-2xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Vyhľadať faktúru, odberateľa, ponuku, produkt…"
                  className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </form>
          )}
          {view === "logbook" && <div className="flex-1" />}

          {/* Right cluster */}
          <div className="flex items-center gap-1.5">
            {/* Product switcher — ghost */}
            {canSwitch && (
              <button
                type="button"
                onClick={switchProduct}
                title={view === "invoicing" ? "Prepnúť na Knihu jázd" : "Prepnúť na Fakturáciu"}
                className="hidden h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground/70 hover:bg-secondary hover:text-foreground sm:inline-flex"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">
                  {view === "invoicing" ? "Prepnúť na Knihu jázd" : "Prepnúť na Fakturáciu"}
                </span>
                <span className="lg:hidden">
                  {view === "invoicing" ? "Kniha jázd" : "Fakturácia"}
                </span>
              </button>
            )}

            {/* Quick create — the only filled button */}
            {view !== "logbook" && (
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90">
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Vytvoriť</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                    <Sparkles className="h-3 w-3" /> Rýchle vytvorenie
                  </DropdownMenuLabel>
                  {QUICK_CREATE.map((c) => (
                    <DropdownMenuItem key={c.to} asChild>
                      <Link to={c.to as any}>{c.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Notifications */}
            <button
              type="button"
              aria-label="Notifikácie"
              className="relative hidden h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground md:grid"
            >
              <Bell className="h-4 w-4" />
            </button>

            {/* Profile avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-semibold text-primary ring-1 ring-border hover:ring-primary/40">
                {(active?.name?.[0] ?? "U").toUpperCase()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Účet</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to={"/nastavenia" as any}>
                    <User className="mr-2 h-3.5 w-3.5" /> Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/firma">
                    <Building2 className="mr-2 h-3.5 w-3.5" /> Firma
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/predplatne">
                    <CreditCard className="mr-2 h-3.5 w-3.5" /> Predplatné
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={"/api-dokumentacia" as any}>
                    <HelpCircle className="mr-2 h-3.5 w-3.5" /> Pomoc
                  </Link>
                </DropdownMenuItem>
                {adminRole && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={"/admin" as any}>
                        <Shield className="mr-2 h-3.5 w-3.5 text-primary" /> Platform Admin
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Odhlásiť
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2 — primary navigation (own subtle strip) */}
        <div className="hidden border-t border-border bg-muted/30 lg:block">
          <nav className="flex h-11 items-center gap-1 overflow-x-auto px-4 lg:px-6">
            {nav.map((g) => {
              const isActive = isPathActive(pathname, g);
              const base = `relative inline-flex shrink-0 items-center gap-1 px-3 py-1.5 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors ${
                isActive
                  ? "text-primary after:bg-primary"
                  : "text-foreground/70 hover:text-foreground after:bg-transparent"
              }`;
              if (g.children.length === 0) {
                return (
                  <Link key={g.key} to={g.match[0]} className={base}>
                    {g.label}
                  </Link>
                );
              }
              return (
                <DropdownMenu key={g.key}>
                  <DropdownMenuTrigger className={base}>
                    {g.label}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {g.children.map((c) => (
                      <DropdownMenuItem key={c.to + c.label} asChild>
                        <Link to={c.to as any}>{c.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>
        </div>

        {/* Secondary nav (active group children) */}
        {activeGroup && activeGroup.children.length > 0 && (
          <div className="border-t border-border bg-background/60">
            <div className="flex h-11 items-center gap-1 overflow-x-auto px-4 lg:px-6">
              {activeGroup.children.map((c) => {
                const base = c.to.split("?")[0];
                const isActive = pathname === base;
                return (
                  <Link
                    key={c.to + c.label}
                    to={c.to as any}
                    className={`relative shrink-0 px-3 py-1.5 text-xs font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full ${
                      isActive
                        ? "text-primary after:bg-primary"
                        : "text-muted-foreground hover:text-foreground after:bg-transparent"
                    }`}
                  >
                    {c.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
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
                const base = c.to.split("?")[0];
                const isActive = pathname === base;
                return (
                  <Link
                    key={c.to + c.label}
                    to={c.to as any}
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

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card/40 px-4 py-4 sm:px-6 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-4 lg:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex w-full flex-wrap gap-2 lg:w-auto">{action}</div>}
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</div>;
}
