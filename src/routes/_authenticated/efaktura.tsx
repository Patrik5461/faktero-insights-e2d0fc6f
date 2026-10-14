import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { EfakturaTestovaciRezim } from "@/components/faktero/EfakturaTestovaciRezim";

export const Route = createFileRoute("/_authenticated/efaktura")({
  component: EfakturaLayout,
});

const TABS = [
  { to: "/efaktura", label: "Prehľad" },
  { to: "/efaktura/odoslane", label: "Odoslané" },
  { to: "/efaktura/prijate", label: "Prijaté" },
  { to: "/efaktura/dorucenia", label: "Doručenia" },
] as const;

function EfakturaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <div className="border-b border-border bg-card/30">
        <div className="flex gap-1 overflow-x-auto px-4 pt-3 sm:px-6">
          {TABS.map((t) => {
            const active =
              t.to === "/efaktura" ? pathname === "/efaktura" : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
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
