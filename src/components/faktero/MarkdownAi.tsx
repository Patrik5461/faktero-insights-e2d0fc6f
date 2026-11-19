import { useMemo, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useRouter } from "@tanstack/react-router";
import {
  BEZPECNY_MARKDOWN,
  internaCesta,
  prelinkujCesty,
  prvyUsekCesty,
} from "@/lib/faktero/markdown-ai";

/**
 * Odpoveď AI asistenta v markdowne. Odkazy na stránky aplikácie (aj holé
 * cesty v texte či v `kóde`, napr. /nastavenia/pohoda) sa otvoria routerom
 * v tej istej karte; cudzie odkazy idú do novej karty. Obrázky sa nekreslia
 * (pozri BEZPECNY_MARKDOWN).
 */
export function MarkdownAi({
  children,
  onNavigate,
}: {
  children: string;
  /** Po kliknutí na odkaz v aplikácii — napr. zavrieť plávajúce okno na telefóne. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const prveUseky = useMemo(() => {
    const s = new Set<string>();
    for (const cesta of Object.keys(router.routesByPath ?? {})) {
      const u = prvyUsekCesty(cesta);
      if (u && !u.startsWith("$") && !u.startsWith("_")) s.add(u);
    }
    return s;
  }, [router]);
  const povod = typeof window !== "undefined" ? window.location.origin : undefined;
  const text = useMemo(() => prelinkujCesty(children, prveUseky), [children, prveUseky]);

  const otvor = (cesta: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/Cmd/stredné tlačidlo — nech si prehliadač otvorí novú kartu sám.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    router.history.push(cesta);
    onNavigate?.();
  };

  return (
    <ReactMarkdown
      {...BEZPECNY_MARKDOWN}
      components={{
        a: ({ href, children: obsah }) => {
          const cesta = internaCesta(href, prveUseky, povod);
          if (cesta)
            return (
              <a href={cesta} onClick={otvor(cesta)}>
                {obsah}
              </a>
            );
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {obsah}
            </a>
          );
        },
        code: ({ className, children: obsah }) => {
          const kod: ReactNode = <code className={className}>{obsah}</code>;
          // Len inline `kód` bez jazyka, ktorý je celý cestou aplikácie.
          if (className || typeof obsah !== "string" || obsah.includes("\n")) return kod;
          const cesta = internaCesta(obsah.trim(), prveUseky);
          return cesta ? (
            <a href={cesta} onClick={otvor(cesta)}>
              {kod}
            </a>
          ) : (
            kod
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
