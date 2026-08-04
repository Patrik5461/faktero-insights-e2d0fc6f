import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MovementForm } from "@/components/faktero/StockMovementForm";

export const Route = createFileRoute("/_authenticated/sklad/vydaj")({
  head: () => ({ meta: [{ title: "Výdaj zo skladu — Faktero" }] }),
  component: IssueStockPage,
});

// Pomenovaný komponent namiesto anonymnej šípkovej funkcie priamo v `component`:
// inak React ani eslint-plugin-react-hooks nevedia, že ide o komponent, a
// pravidlá hookov sa v ňom nedajú staticky overiť.
function IssueStockPage() {
  const nav = useNavigate();
  return (
    <MovementForm
      type="vydaj"
      title="Výdaj zo skladu"
      onDone={() => nav({ to: "/sklad/pohyby" })}
    />
  );
}
