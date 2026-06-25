import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { MarketingShell } from "./MarketingShell";
import type { HubContent, DetailItem, ContentBlock } from "@/lib/faktero/marketing-content";

/* -------------------------------------------------------------------------- */
/* Hub page                                                                   */
/* -------------------------------------------------------------------------- */

export function HubPage({ hub }: { hub: HubContent }) {
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {hub.hubTitle}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
            {hub.hubDescription}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{hub.hubLead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/registracia"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Vyskúšať 2 mesiace zdarma <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/cennik"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-secondary"
            >
              Pozrieť cenník
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {hub.items.map((item) => (
            <a
              key={item.slug}
              href={`/${hub.hubSlug}/${item.slug}`}
              className="group rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-lg"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{item.label}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.summary}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary opacity-80 group-hover:opacity-100">
                Zistiť viac <ChevronRight className="h-4 w-4" />
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
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-4xl px-6 py-14 md:py-16">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <a href={`/${hub.hubSlug}`} className="hover:text-foreground">
              {hub.hubTitle}
            </a>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{item.label}</span>
          </nav>
          <div className="mt-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{item.label}</h1>
              <p className="mt-2 text-base text-muted-foreground md:text-lg">{item.summary}</p>
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
            Začať zdarma <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={`/${hub.hubSlug}`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Späť na {hub.hubTitle}
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}

function Block({ block }: { block: ContentBlock }) {
  if (block.type === "lead") {
    return <p className="text-lg leading-relaxed text-foreground">{block.text}</p>;
  }
  if (block.type === "section") {
    return (
      <div>
        <h2 className="text-xl font-semibold">{block.title}</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{block.body}</p>
      </div>
    );
  }
  if (block.type === "bullets") {
    return (
      <div>
        {block.title && <h2 className="text-xl font-semibold mb-3">{block.title}</h2>}
        <ul className="space-y-2">
          {block.items.map((it) => (
            <li key={it} className="flex gap-2.5 text-base">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="text-foreground/90">{it}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="text-sm font-semibold text-primary">{block.title}</div>
      <p className="mt-1.5 text-sm text-foreground/90">{block.body}</p>
    </div>
  );
}