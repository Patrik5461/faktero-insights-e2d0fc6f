import { Link } from "@tanstack/react-router";
import { MarketingShell } from "./MarketingShell";

const LINKS = [
  { to: "/pravne/obchodne-podmienky", label: "Obchodné podmienky" },
  { to: "/pravne/gdpr", label: "GDPR" },
  { to: "/pravne/reklamacny-poriadok", label: "Reklamačný poriadok" },
  { to: "/pravne/gopay-podmienky", label: "GoPay podmienky" },
  { to: "/pravne/opakovane-platby", label: "Opakované platby" },
  { to: "/pravne/cookies", label: "Cookies" },
  { to: "/pravne/tesla-podmienky", label: "Tesla Fleet API" },
] as const;

export function LegalShell({
  title,
  updated,
  version,
  children,
}: {
  title: string;
  updated: string;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-10 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-24 md:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Právne</p>
          <nav className="mt-3 space-y-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{
                  className:
                    "block rounded-md px-3 py-2 bg-emerald-50 text-emerald-900 font-medium",
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Posledná aktualizácia: {updated} · Verzia {version}
          </p>
          <div className="prose prose-slate mt-8 max-w-none text-foreground prose-headings:text-foreground prose-headings:font-semibold prose-h2:mt-10 prose-h2:text-xl prose-h3:mt-6 prose-h3:text-base prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground prose-a:text-emerald-700">
            {children}
          </div>
        </article>
      </div>
    </MarketingShell>
  );
}

export const LEGAL_VERSION = "1.0";
export const LEGAL_UPDATED = "13.06.2026";
export const LEGAL_COMPANY = {
  name: "Tobify s. r. o.",
  ico: "56607016",
  dic: "2122358579",
  icDph: "SK2122358579",
  address: "Športová 707/43, 919 26 Zavar, Slovenská republika",
  email: "info@faktero.sk",
  phone: "+421 902 101 967",
  web: "https://www.faktero.sk",
  statutar: "Patrik Henček",
  incorporated: "31. októbra 2024",
};
