import { MarketingShell } from "@/components/faktero/MarketingShell";
import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";

export type HelpSection = { id: string; title: string; body: ReactNode };

export function HelpArticle({
  category,
  title,
  intro,
  sections,
}: {
  category: string;
  title: string;
  intro?: ReactNode;
  sections: HelpSection[];
}) {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
        <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-10">
          <article className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              {category}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
            {intro && <div className="mt-4 text-muted-foreground">{intro}</div>}
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
            <div className="mt-12 rounded-xl border border-border bg-card p-5 text-sm">
              <p className="font-semibold">Potrebujete ďalšiu pomoc?</p>
              <p className="mt-1 text-muted-foreground">
                Napíšte nám na{" "}
                <a href="mailto:info@faktero.sk" className="text-primary underline">
                  info@faktero.sk
                </a>{" "}
                alebo sa vráťte do{" "}
                <Link to="/pomoc" className="text-primary underline">
                  centra pomoci
                </Link>
                .
              </p>
            </div>
          </article>
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Obsah
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
