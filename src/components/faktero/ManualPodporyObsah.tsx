import { Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Lock, Printer } from "lucide-react";
import { BEZPECNY_MARKDOWN } from "@/lib/faktero/markdown-ai";
import {
  nadpisyManualu,
  prelinkujManualy,
  slugNadpisu,
  slugZOdkazu,
  type ManualPodpory,
} from "@/lib/faktero/manualy-podpory";

/**
 * Jeden interný manuál podpory (Admin → Podpora → Manuály podpory): pás
 * „Interné“, tlač do PDF, obsah z nadpisov a markdown s tabuľkami (GFM).
 * Nadpisy majú kotvy, odkazy na iné manuály (`03-….md`) sa otvoria v admine.
 */
export function ManualPodporyObsah({
  manual,
  slugy,
}: {
  manual: ManualPodpory;
  slugy: ReadonlySet<string>;
}) {
  const nadpisy = useMemo(() => nadpisyManualu(manual.obsah), [manual.obsah]);
  const text = useMemo(() => prelinkujManualy(manual.obsah, slugy), [manual.obsah, slugy]);
  const obsahManualu = nadpisy.filter((n) => n.uroven === 2);

  const components = useMemo<Components>(() => {
    const idPodlaRiadku = new Map(nadpisy.map((n) => [n.riadok, n.id]));
    const nadpis =
      (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6", trieda: string): Components["h1"] =>
      ({ node, children }) => {
        const riadok = node?.position?.start.line;
        const id = (riadok && idPodlaRiadku.get(riadok)) || slugNadpisu(String(textDeti(children)));
        return (
          <Tag id={id} className={`group scroll-mt-20 ${trieda}`}>
            {children}
            {Tag !== "h1" && (
              <a
                href={`#${id}`}
                aria-label="Odkaz na túto časť"
                className="ml-2 text-muted-foreground/50 no-underline opacity-0 hover:text-primary group-hover:opacity-100 print:hidden"
              >
                #
              </a>
            )}
          </Tag>
        );
      };
    return {
      h1: nadpis("h1", "mb-4 text-2xl font-semibold tracking-tight"),
      h2: nadpis("h2", "mb-3 mt-8 border-b border-border pb-1 text-xl font-semibold"),
      h3: nadpis("h3", "mb-2 mt-6 text-base font-semibold"),
      h4: nadpis("h4", "mb-2 mt-4 text-sm font-semibold"),
      h5: nadpis("h5", "mb-2 mt-4 text-sm font-semibold"),
      h6: nadpis("h6", "mb-2 mt-4 text-sm font-semibold"),
      p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
      ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
      ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-4 border-primary/30 bg-secondary/40 px-3 py-1 text-sm text-muted-foreground">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-6 border-border" />,
      table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-md border border-border print:overflow-visible">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-muted/50 text-left">{children}</thead>,
      th: ({ children }) => (
        <th className="border-b border-border px-3 py-2 font-medium align-bottom">{children}</th>
      ),
      td: ({ children }) => (
        <td className="border-b border-border px-3 py-2 align-top">{children}</td>
      ),
      a: ({ href, children }) => {
        const slug = href?.startsWith("?m=") ? href.slice(3) : null;
        if (slug && slugy.has(slug))
          return (
            <Link
              to="/admin/podpora/manualy"
              search={{ m: slug }}
              className="text-primary underline underline-offset-2"
            >
              {children}
            </Link>
          );
        if (href?.startsWith("#"))
          return (
            <a href={href} className="text-primary underline underline-offset-2">
              {children}
            </a>
          );
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {children}
          </a>
        );
      },
      code: ({ className, children }) => {
        const obsah = typeof children === "string" ? children : null;
        const slug = !className && obsah ? slugZOdkazu(obsah, slugy) : null;
        const kod = (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
        );
        return slug ? (
          <Link to="/admin/podpora/manualy" search={{ m: slug }} className="text-primary">
            {kod}
          </Link>
        ) : (
          kod
        );
      },
    };
  }, [nadpisy, slugy]);

  return (
    <article className="max-w-4xl text-sm text-foreground sm:text-[0.95rem]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4" /> Interné — nezdieľať so zákazníkmi
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary print:hidden"
        >
          <Printer className="h-4 w-4" /> Stiahnuť ako PDF
        </button>
      </div>
      {obsahManualu.length > 2 && (
        <nav
          aria-label="Obsah manuálu"
          className="mb-6 rounded-lg border border-border bg-card/50 p-3 print:hidden"
        >
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Obsah
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {obsahManualu.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className="text-primary hover:underline">
                  {n.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <ReactMarkdown {...BEZPECNY_MARKDOWN} remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </article>
  );
}

function textDeti(deti: ReactNode): string {
  if (deti == null || typeof deti === "boolean") return "";
  if (typeof deti === "string" || typeof deti === "number") return String(deti);
  if (Array.isArray(deti)) return deti.map(textDeti).join("");
  if (typeof deti === "object" && "props" in deti)
    return textDeti((deti as { props: { children?: ReactNode } }).props.children);
  return "";
}
