import { Link, useRouterState } from "@tanstack/react-router";
import { Home, FileText, Camera, Car, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

type Tab = { to: string; label: string; icon: any; match: string[] };

const TABS: Tab[] = [
  { to: "/dashboard", label: "Prehľad", icon: Home, match: ["/dashboard"] },
  { to: "/faktury", label: "Faktúry", icon: FileText, match: ["/faktury", "/zalohove", "/ponuky"] },
  // index 2 — Skenovať (centrálne FAB)
  { to: "/jazdy", label: "Jazdy", icon: Car, match: ["/jazdy"] },
];

const MORE_LINKS: { to: string; label: string }[] = [
  { to: "/odberatelia", label: "Odberatelia" },
  { to: "/produkty", label: "Produkty" },
  { to: "/sklad", label: "Sklad" },
  { to: "/efaktura", label: "eFaktúra" },
  { to: "/bankove-ucty", label: "Bankové účty" },
  { to: "/exporty", label: "Účtovníctvo / Exporty" },
  { to: "/api-kluce", label: "API kľúče" },
  { to: "/nastavenia", label: "Nastavenia" },
  { to: "/firma", label: "Firma" },
  { to: "/predplatne", label: "Predplatné" },
];

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (m: string[]) => m.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <>
      {/* Spacer aby obsah nebol pod fixed barom */}
      <div aria-hidden className="h-20 shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Hlavná navigácia"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 items-end px-2 pt-2">
          <TabButton tab={TABS[0]} active={isActive(TABS[0].match)} />
          <TabButton tab={TABS[1]} active={isActive(TABS[1].match)} />

          {/* Centrálny FAB — Skenovať doklad */}
          <Link
            to="/faktury/nova"
            search={{ scan: 1 } as any}
            className="flex flex-col items-center justify-end gap-0.5 pb-1"
          >
            <span className="grid h-14 w-14 -translate-y-3 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background">
              <Camera className="h-6 w-6" />
            </span>
            <span className="text-[10px] font-medium text-foreground/70">Skenovať</span>
          </Link>

          <TabButton tab={TABS[2]} active={isActive(TABS[2].match)} />

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-foreground/70"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span>Viac</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Viac</SheetTitle>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {MORE_LINKS.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to as any}
                    onClick={() => setMoreOpen(false)}
                    className="rounded-lg border border-border bg-card px-3 py-3 text-sm font-medium hover:bg-secondary"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      to={tab.to as any}
      className={`flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
        active ? "text-primary" : "text-foreground/70"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span>{tab.label}</span>
    </Link>
  );
}
