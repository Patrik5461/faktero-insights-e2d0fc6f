import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { MarketingShell } from "./MarketingShell";
import type { HubContent, DetailItem, ContentBlock } from "@/lib/faktero/marketing-content";
import { useT } from "@/lib/i18n/useT";

/* -------------------------------------------------------------------------- */
/* Hub page                                                                   */
/* -------------------------------------------------------------------------- */

export function HubPage({ hub }: { hub: HubContent }) {
  const { t } = useT();
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        {/* Úvod je vycentrovaný — text len vľavo nechával pravú polovicu prázdnu. */}
        <div className="mx-auto max-w-6xl px-6 py-16 text-center md:py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t(hub.hubTitle)}
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t(hub.hubHeadline ?? hub.hubDescription)}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            {t(hub.hubHeadline ? hub.hubDescription : hub.hubLead)}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/registracia"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("Vyskúšať 30 dní zdarma")} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/cennik"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-secondary"
            >
              {t("Pozrieť cenník")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        {/* Flex so zarovnaním na stred namiesto mriežky: karta, ktorá ostane
            v poslednom riadku sama (5 alebo 7 položiek), nevisí vľavo. */}
        <div className="flex flex-wrap justify-center gap-5">
          {hub.items.map((item) => (
            <a
              key={item.slug}
              href={`/${hub.hubSlug}/${item.slug}`}
              className="group flex w-full flex-col rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-lg sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{t(item.label)}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{t(item.summary)}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary opacity-80 group-hover:opacity-100">
                {t("Zistiť viac")} <ChevronRight className="h-4 w-4" />
              </span>
            </a>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail page                                                                */
/* -------------------------------------------------------------------------- */

export function DetailPage({ hub, item }: { hub: HubContent; item: DetailItem }) {
  const { t } = useT();
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-4xl px-6 py-14 md:py-16">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <a href={`/${hub.hubSlug}`} className="hover:text-foreground">
              {t(hub.hubTitle)}
            </a>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{t(item.label)}</span>
          </nav>
          <div className="mt-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t(item.label)}</h1>
              <p className="mt-2 text-base text-muted-foreground md:text-lg">{t(item.summary)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex flex-col gap-8">
          {item.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-3 border-t border-border pt-8">
          <Link
            to="/registracia"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("Začať zdarma")} <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={`/${hub.hubSlug}`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            {t("Späť na {nazov}", { nazov: t(hub.hubTitle) })}
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}

/** Ten istý vzhľad blokov používa aj blog — nech sa web nerozpadne na dva štýly. */
export function BlogBlock({ block }: { block: ContentBlock }) {
  return <Block block={block} />;
}

function Block({ block }: { block: ContentBlock }) {
  const { t } = useT();
  if (block.type === "lead") {
    return <p className="text-lg leading-relaxed text-foreground">{t(block.text)}</p>;
  }
  if (block.type === "section") {
    return (
      <div>
        <h2 className="text-xl font-semibold">{t(block.title)}</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{t(block.body)}</p>
      </div>
    );
  }
  if (block.type === "bullets") {
    return (
      <div>
        {block.title && <h2 className="text-xl font-semibold mb-3">{t(block.title)}</h2>}
        <ul className="space-y-2">
          {block.items.map((it) => (
            <li key={it} className="flex gap-2.5 text-base">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="text-foreground/90">{t(it)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="text-sm font-semibold text-primary">{t(block.title)}</div>
      <p className="mt-1.5 text-sm text-foreground/90">{t(block.body)}</p>
    </div>
  );
}
