import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { BookOpen, Calendar, Clock } from "lucide-react";
import { postsByDate } from "@/lib/faktero/blog-content";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Faktero" },
      {
        name: "description",
        content:
          "Návody, prípadové štúdie a novinky o fakturácii, eFaktúre 2027 a automatizácii pre slovenské firmy.",
      },
      { property: "og:title", content: "Faktero Blog" },
      { property: "og:description", content: "Návody, prípadové štúdie a novinky o fakturácii." },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Blog</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
            Návody, novinky a tipy o fakturácii
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            eFaktúra 2027, Pohoda export, REST API a praktické príklady zo života účtovníkov a SaaS
            firiem.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-6 py-14">
        <ul className="grid gap-5 md:grid-cols-2">
          {postsByDate().map((p) => (
            <li key={p.slug}>
              <Link
                to="/blog/$slug"
                params={{ slug: p.slug }}
                className="group block h-full rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-lg"
              >
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(p.date).toLocaleDateString("sk-SK", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {p.minuty} min
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold group-hover:text-primary">{p.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{p.excerpt}</p>
                <span className="mt-4 inline-block text-sm font-medium text-primary">
                  Čítať článok →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </MarketingShell>
  );
}
