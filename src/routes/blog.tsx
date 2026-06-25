import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { BookOpen, Calendar } from "lucide-react";

const POSTS = [
  {
    slug: "efaktura-2027-co-potrebujete-vediet",
    title: "eFaktúra 2027: čo musíte stihnúť pred 1.1.2027",
    excerpt: "Od januára 2027 budú firmy v SR povinné posielať B2B faktúry štruktúrovane. Vysvetľujeme Peppol, Digitálneho poštára a čo to znamená pre vaše procesy.",
    date: "2026-05-12",
  },
  {
    slug: "ako-prejst-zo-superfaktury-do-faktero",
    title: "Ako prejsť zo SuperFaktúry do Faktero za 15 minút",
    excerpt: "Krok za krokom: export odberateľov, import faktúr, zachovanie číselných radov a kontrola otvorených pohľadávok.",
    date: "2026-04-22",
  },
  {
    slug: "pohoda-export-bez-rucnej-prace",
    title: "Pohoda export bez ručného prepisovania",
    excerpt: "Ako odovzdať účtovníčke mesačný balík faktúr jediným klikom — XML, PDF a sumár DPH.",
    date: "2026-03-30",
  },
  {
    slug: "api-fakturacia-saas",
    title: "API fakturácia pre SaaS: idempotencia, webhooky a opakované faktúry",
    excerpt: "Architektúra automatizovanej fakturácie pre SaaS produkty na Slovensku — vzory, ktoré fungujú v produkcii.",
    date: "2026-02-18",
  },
];

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Faktero" },
      { name: "description", content: "Návody, prípadové štúdie a novinky o fakturácii, eFaktúre 2027 a automatizácii pre slovenské firmy." },
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
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Návody, novinky a tipy o fakturácii</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            eFaktúra 2027, Pohoda export, REST API a praktické príklady zo života účtovníkov a SaaS firiem.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-6 py-14">
        <ul className="grid gap-5 md:grid-cols-2">
          {POSTS.map((p) => (
            <li key={p.slug}>
              <article className="group h-full rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-lg">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(p.date).toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold group-hover:text-primary">{p.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{p.excerpt}</p>
                <span className="mt-4 inline-block text-sm font-medium text-primary opacity-70">Čoskoro k dispozícii →</span>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </MarketingShell>
  );
}