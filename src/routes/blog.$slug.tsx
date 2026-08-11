import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Calendar, Clock } from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { BlogBlock } from "@/components/faktero/MarketingSectionPage";
import { getPost, postsByDate } from "@/lib/faktero/blog-content";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ params }) => {
    const p = getPost(params.slug);
    if (!p) return { meta: [{ title: "Článok — Faktero" }] };
    return {
      meta: [
        { title: `${p.title} — Faktero` },
        { name: "description", content: p.excerpt },
        { property: "og:type", content: "article" },
        { property: "og:title", content: p.title },
        { property: "og:description", content: p.excerpt },
        { property: "article:published_time", content: p.date },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getPost(params.slug)) throw notFound();
  },
  component: ClanokPage,
});

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ClanokPage() {
  const { slug } = Route.useParams();
  const clanok = getPost(slug);
  if (!clanok) return null;
  const dalsie = postsByDate()
    .filter((p) => p.slug !== slug)
    .slice(0, 2);

  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-3xl px-6 py-14 md:py-16">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Blog
          </Link>
          <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">{clanok.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> {datum(clanok.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {clanok.minuty} min čítania
            </span>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex flex-col gap-8">
          {clanok.blocks.map((b, i) => (
            <BlogBlock key={i} block={b} />
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-3 border-t border-border pt-8">
          <Link
            to="/registracia"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Vyskúšať Faktero zdarma <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Ďalšie články
          </Link>
        </div>

        {dalsie.length > 0 && (
          <div className="mt-12">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Čítajte ďalej
            </h2>
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {dalsie.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/blog/$slug"
                    params={{ slug: p.slug }}
                    className="block h-full rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
                  >
                    <div className="text-xs text-muted-foreground">{datum(p.date)}</div>
                    <div className="mt-2 font-semibold">{p.title}</div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{p.excerpt}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </MarketingShell>
  );
}
