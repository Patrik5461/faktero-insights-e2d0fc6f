import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { EfakturaTestovaciRezim } from "@/components/faktero/EfakturaTestovaciRezim";

export const Route = createFileRoute("/_authenticated/efaktura")({
  component: EfakturaLayout,
});

const TABS = [
  { to: "/efaktura", label: "Prehľad" },
  { to: "/efaktura/odoslane", label: "smer::Odoslané" },
  { to: "/efaktura/prijate", label: "smer::Prijaté" },
  { to: "/efaktura/dorucenia", label: "Doručenia" },
  { to: "/efaktura/kontrola", label: "Kontrola XML" },
] as const;

function EfakturaLayout() {
  const { t } = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <div className="border-b border-border bg-card/30">
        <div className="flex gap-1 overflow-x-auto px-4 pt-3 sm:px-6">
          {TABS.map((tab) => {
            const active =
              tab.to === "/efaktura" ? pathname === "/efaktura" : pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(tab.label)}
              </Link>
            );
          })}
        </div>
      </div>
      <EfakturaTestovaciRezim className="mx-4 mt-4 sm:mx-6" />
      <Outlet />
    </>
  );
}
