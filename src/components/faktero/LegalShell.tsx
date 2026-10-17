import { Link } from "@tanstack/react-router";
import { MarketingShell } from "./MarketingShell";
import { useT } from "@/lib/i18n/useT";

const LINKS = [
  { to: "/pravne/obchodne-podmienky", label: "Obchodné podmienky" },
  { to: "/pravne/gdpr", label: "GDPR" },
  { to: "/pravne/spracovanie-udajov", label: "Spracúvanie údajov (čl. 28)" },
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
  const { t } = useT();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-10 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-24 md:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            {t("Právne")}
          </p>
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
                {t(l.label)}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Posledná aktualizácia: {updated} · Verzia {version}", { updated, version })}
          </p>
          {/* Plugin @tailwindcss/typography v projekte nie je, triedy `prose` by
              nerobili nič — typografiu právnych textov preto píšeme priamo. */}
          <div className="mt-8 max-w-none text-[15px] leading-relaxed text-foreground/90 [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-emerald-300 [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1.5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:marker:text-muted-foreground">
            {children}
          </div>
        </article>
      </div>
    </MarketingShell>
  );
}

/** Upozornenie na začiatku každej nemeckej verzie právneho dokumentu. */
export function DeUpozornenie() {
  return (
    <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <strong>
        Diese Übersetzung dient nur zur Information. Rechtsverbindlich ist die slowakische Fassung.
      </strong>
    </p>
  );
}

export { LEGAL_VERSION } from "@/lib/faktero/legal-verzia";
export const LEGAL_UPDATED = "13.06.2026";
export const LEGAL_COMPANY = {
  name: "Tobify s. r. o.",
  ico: "56607016",
  dic: "2122358579",
  icDph: "SK2122358579",
  address: "Športová 707/43, 919 26 Zavar, Slovenská republika",
  email: "info@faktero.sk",
  /* Jedno miesto pravdy pre kontaktné číslo. Zobrazuje sa s medzerami,
     do odkazu `tel:` ide cez `LEGAL_PHONE_TEL` bez nich. */
  phone: "+421 902 101 967",
  web: "https://www.faktero.sk",
  statutar: "Patrik Henček",
  incorporated: "31. októbra 2024",
};
export const LEGAL_PHONE_TEL = LEGAL_COMPANY.phone.replace(/\s/g, "");
