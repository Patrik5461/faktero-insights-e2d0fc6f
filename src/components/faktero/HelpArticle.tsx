import { MarketingShell } from "@/components/faktero/MarketingShell";
import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

export type HelpSection = { id: string; title: string; body: ReactNode };

export function HelpArticle({
  category,
  title,
  intro,
  sections,
  pdf,
}: {
  category: string;
  title: string;
  intro?: ReactNode;
  sections: HelpSection[];
  /** Hotové PDF tohto manuálu (/docs/faktero-<pdf>-<jazyk>.pdf). */
  pdf?: string;
}) {
  const { t, jazyk } = useT();
  const j = jazyk === "cs" || jazyk === "de" ? jazyk : "sk";
  return (
    <MarketingShell>
      <div className="pomoc-manual mx-auto max-w-6xl px-4 py-12 lg:py-16 print:max-w-none print:p-0">
        <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-10">
          <article className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              {category}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
            {intro && <div className="mt-4 text-muted-foreground">{intro}</div>}
            {/* PDF: tento manuál (vlastné alebo cez tlač) a všetky manuály naraz. */}
            <div className="mt-5 flex flex-wrap gap-2 print:hidden">
              {pdf ? (
                <a
                  href={`/docs/faktero-${pdf}-${j}.pdf`}
                  download
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> {t("Stiahnuť PDF")}
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                <Printer className="h-4 w-4" />{" "}
                {pdf ? t("Tlačiť") : t("Tlačiť alebo uložiť ako PDF")}
              </button>
              <a
                href={`/docs/faktero-manualy-${j}.pdf`}
                download
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                <Download className="h-4 w-4" /> {t("Všetky manuály (PDF)")}
              </a>
            </div>
            <div className="mt-10 space-y-10">
              {sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-xl font-semibold tracking-tight">{s.title}</h2>
                  <div className="prose prose-sm mt-3 max-w-none text-foreground/90 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold">
                    {s.body}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-12 rounded-xl border border-border bg-card p-5 text-sm print:hidden">
              <p className="font-semibold">{t("Potrebujete ďalšiu pomoc?")}</p>
              <p className="mt-1 text-muted-foreground">
                {t("Napíšte nám na")}{" "}
                <a href="mailto:info@faktero.sk" className="text-primary underline">
                  info@faktero.sk
                </a>{" "}
                {t("alebo sa vráťte do")}{" "}
                <Link to="/pomoc" className="text-primary underline">
                  {t("centra pomoci")}
                </Link>
                .
              </p>
            </div>
          </article>
          <aside className="hidden lg:block print:hidden">
            <div className="sticky top-24 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Obsah")}
              </p>
              <nav className="mt-3 space-y-2 text-sm">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block text-foreground/80 hover:text-emerald-700"
                  >
                    {s.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </div>
    </MarketingShell>
  );
}
