import { createFileRoute } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { KontaktyStranka } from "@/components/faktero/KontaktyStranka";

/** Dodávatelia — ten istý adresár ako Odberatelia, len kontakty označené ako dodávateľ. */
export const Route = createFileRoute("/_authenticated/dodavatelia")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Dodávatelia — Faktero") }] }),
  /** `?q=` z hľadania v hlavičke — zoznam sa otvorí vyhľadaný. */
  validateSearch: (s: Record<string, unknown>): { new?: "1"; q?: string } => ({
    new: s.new === "1" || s.new === 1 ? "1" : undefined,
    q: typeof s.q === "string" && s.q.trim() ? s.q.slice(0, 100) : undefined,
  }),
  component: Dodavatelia,
});

function Dodavatelia() {
  const { new: novy, q } = Route.useSearch();
  return <KontaktyStranka rola="dodavatel" otvoritNovy={novy === "1"} hladat={q} />;
}
