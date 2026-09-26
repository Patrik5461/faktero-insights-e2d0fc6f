import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MovementForm } from "@/components/faktero/StockMovementForm";

export const Route = createFileRoute("/_authenticated/sklad/vydaj")({
  head: () => ({ meta: [{ title: "Výdaj zo skladu — Faktero" }] }),
  /* `?polozka=` nesie skladovú kartu, z ktorej sa sem prišlo vydávať. */
  validateSearch: (s: Record<string, unknown>): { polozka?: string } => ({
    polozka: typeof s.polozka === "string" && s.polozka ? s.polozka : undefined,
  }),
  component: IssueStockPage,
});

// Pomenovaný komponent namiesto anonymnej šípkovej funkcie priamo v `component`:
// inak React ani eslint-plugin-react-hooks nevedia, že ide o komponent, a
// pravidlá hookov sa v ňom nedajú staticky overiť.
function IssueStockPage() {
  const nav = useNavigate();
  const { polozka } = Route.useSearch();
  return (
    <MovementForm
      type="vydaj"
      title="Výdaj zo skladu"
      polozkaId={polozka}
      onDone={() => nav({ to: "/sklad/pohyby" })}
    />
  );
}
