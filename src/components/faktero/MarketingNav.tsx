import { Link } from "@tanstack/react-router";
import { ChevronDown, Rocket, Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";

type Item = { label: string; href: string };
type Menu = { label: string; href: string; items: Item[] };

const menus: Menu[] = [
  {
    label: "Funkcie",
    href: "/funkcie",
    items: [
      { label: "Faktúry", href: "/funkcie/faktury" },
      { label: "Cenové ponuky", href: "/funkcie/cenove-ponuky" },
      { label: "Opakované faktúry", href: "/funkcie/opakovane-faktury" },
      { label: "Pohoda export", href: "/funkcie/pohoda-export" },
      { label: "Import zo SuperFaktúry", href: "/funkcie/import-superfaktura" },
      { label: "Multi-company", href: "/funkcie/multi-company" },
    ],
  },
  {
    label: "API",
    href: "/vyvojari",
    items: [
      { label: "Prehľad API", href: "/vyvojari" },
      { label: "Dokumentácia", href: "/docs/api" },
      { label: "Webhooky", href: "/vyvojari/webhooky" },
      { label: "API Playground", href: "/vyvojari/playground" },
    ],
  },
  {
    label: "eFaktúra",
    href: "/efakturacia",
    items: [
      { label: "Prehľad", href: "/efakturacia/prehlad" },
      { label: "Peppol", href: "/efakturacia/peppol" },
      { label: "Digitálny poštár", href: "/efakturacia/digitalny-postar" },
    ],
  },
  {
    label: "Účtovníci",
    href: "/uctovnici",
    items: [
      { label: "Pohoda export", href: "/uctovnici/pohoda-export" },
      { label: "Mesačné podklady", href: "/uctovnici/mesacne-podklady" },
      { label: "Integrácie", href: "/uctovnici/integracie" },
    ],
  },
];

const simpleLinks: Item[] = [
  { label: "Cenník", href: "/cennik" },
  { label: "Blog", href: "/blog" },
  { label: "Kontakt", href: "/kontakt" },
];


export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  return (
    <div className="border-b border-border/60 bg-background">
      {/* Announcement bar */}
      <Link
        to="/efaktura"
        className="block w-full bg-primary/10 text-center text-sm text-foreground hover:bg-primary/15 transition-colors"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6 py-2">
          <Rocket className="h-3.5 w-3.5 text-primary" />
          <span>
            Faktero je pripravené na povinnú eFaktúru od{" "}
            <span className="font-semibold text-primary">1.1.2027</span>
          </span>
        </div>
      </Link>

      {/* Main nav */}
      <header className="border-t border-border/40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
          <Link to="/" className="flex items-center shrink-0" aria-label="Faktero">
            <Logo className="h-9 w-[144px] md:h-10 md:w-[160px]" />
          </Link>

          <nav className="hidden lg:flex items-center gap-1 text-sm">
            {menus.map((menu) => (
              <div
                key={menu.label}
                className="relative group"
                onMouseEnter={() => setOpenMenu(menu.label)}
                onMouseLeave={() => setOpenMenu((v) => (v === menu.label ? null : v))}
              >
                <Link
                  to={menu.href}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  onClick={() => setOpenMenu(null)}
                >
                  {menu.label}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 group-hover:rotate-180 transition-transform" />
                </Link>
                <div className="invisible opacity-0 translate-y-1 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all absolute left-0 top-full pt-2 z-50">
                  <div className="min-w-[240px] rounded-xl border border-border bg-card p-2 shadow-lg shadow-black/5">
                    <Link
                      to={menu.href}
                      className="block rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary"
                    >
                      Prehľad — {menu.label}
                    </Link>
                    <div className="my-1 h-px bg-border" />
                    {menu.items.map((it) => (
                      <Link
                        key={it.label}
                        to={it.href}
                        className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-secondary"
                      >
                        {it.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {simpleLinks.map((l) => (
              <Link
                key={l.label}
                to={l.href}
                className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden md:inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              2 Mesiace zdarma
            </span>
            <Link
              to="/prihlasenie"
              className="hidden sm:inline-flex whitespace-nowrap px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              Prihlásenie
            </Link>
            <Link
              to="/registracia"
              className="whitespace-nowrap rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
            >
              Vyskúšať zdarma
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
              aria-label="Otvoriť menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-border bg-card">
            <div className="mx-auto max-w-6xl px-4 py-3">
              {menus.map((menu) => {
                const isOpen = openMenu === menu.label;
                return (
                  <div key={menu.label} className="border-b border-border/60 last:border-0">
                    <div className="flex items-center">
                      <Link
                        to={menu.href}
                        className="flex-1 py-3 text-sm font-medium text-foreground"
                      >
                        {menu.label}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setOpenMenu(isOpen ? null : menu.label)}
                        className="p-2 text-muted-foreground"
                        aria-label="Rozbaliť"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="pb-3 pl-3">
                        {menu.items.map((it) => (
                          <Link
                            key={it.label}
                            to={it.href}
                            className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                          >
                            {it.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {simpleLinks.map((l) => (
                <Link
                  key={l.label}
                  to={l.href}
                  className="block border-b border-border/60 py-3 text-sm font-medium text-foreground last:border-0"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>
    </div>
  );
}
