import { Logo } from "@/components/faktero/Logo";
import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Gauge,
  AlertTriangle,
  ScrollText,
  ArrowLeftToLine,
  ShieldAlert,
  
  FileText,
  HeartPulse,
  Wallet,
  Search,
  Receipt,
} from "lucide-react";

const NAV = [
  { to: "/admin", label: "Prehľad", icon: LayoutDashboard, exact: true },
  { to: "/admin/health", label: "Health check", icon: HeartPulse },
  { to: "/admin/companies", label: "Firmy", icon: Building2 },
  { to: "/admin/users", label: "Používatelia", icon: Users },
  { to: "/admin/subscriptions", label: "Predplatné", icon: CreditCard },
  { to: "/admin/gopay", label: "GoPay (predplatné)", icon: Wallet },
  { to: "/admin/platform-invoices", label: "Platformové faktúry", icon: Receipt },
  { to: "/admin/usage", label: "Využitie", icon: Gauge },
  { to: "/admin/errors", label: "Chyby", icon: AlertTriangle },
  { to: "/admin/audit-log", label: "Audit log", icon: ScrollText },
  { to: "/admin/legal", label: "Právne dokumenty", icon: FileText },
  { to: "/admin/seo", label: "SEO", icon: Search },
];


function isActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <Logo variant="icon" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">Faktero</div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
              <ShieldAlert className="h-3 w-3" /> Platform admin
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {NAV.map((n) => {
              const active = isActive(pathname, n.to, n.exact);
              const Icon = n.icon;
              return (
                <li key={n.to}>
                  <Link
                    to={n.to as any}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{n.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ArrowLeftToLine className="h-3.5 w-3.5" />
            Späť do aplikácie
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/70 font-bold text-primary-foreground">F</span>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Admin</div>
          </Link>
          <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground">
            Späť do app
          </Link>
        </header>
        {/* Mobile nav strip */}
        <nav className="sticky top-14 z-20 flex gap-1 overflow-x-auto border-b border-border bg-card/80 px-3 py-2 backdrop-blur lg:hidden">
          {NAV.map((n) => {
            const active = isActive(pathname, n.to, n.exact);
            return (
              <Link
                key={n.to}
                to={n.to as any}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${
                  active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export function AdminPageHeader({
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

export function AdminPageBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</div>;
}