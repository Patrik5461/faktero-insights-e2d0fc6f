import { createFileRoute } from "@tanstack/react-router";
import { KontaktyStranka } from "@/components/faktero/KontaktyStranka";

/** Dodávatelia — ten istý adresár ako Odberatelia, len kontakty označené ako dodávateľ. */
export const Route = createFileRoute("/_authenticated/dodavatelia")({
  head: () => ({ meta: [{ title: "Dodávatelia — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { new?: "1" } => ({
    new: s.new === "1" || s.new === 1 ? "1" : undefined,
  }),
  component: Dodavatelia,
});

function Dodavatelia() {
  const { new: novy } = Route.useSearch();
  return <KontaktyStranka rola="dodavatel" otvoritNovy={novy === "1"} />;
}
