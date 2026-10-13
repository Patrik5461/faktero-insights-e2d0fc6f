import { createFileRoute } from "@tanstack/react-router";
import { KontaktyStranka } from "@/components/faktero/KontaktyStranka";

export const Route = createFileRoute("/_authenticated/odberatelia")({
  head: () => ({ meta: [{ title: "Odberatelia — Faktero" }] }),
  /** `?new=1` z menu („Nový odberateľ“) rovno otvorí formulár. */
  validateSearch: (s: Record<string, unknown>): { new?: "1" } => ({
    new: s.new === "1" || s.new === 1 ? "1" : undefined,
  }),
  component: Odberatelia,
});

function Odberatelia() {
  const { new: novy } = Route.useSearch();
  return <KontaktyStranka rola="odberatel" otvoritNovy={novy === "1"} />;
}
