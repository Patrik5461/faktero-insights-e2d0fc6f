import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MovementForm } from "@/components/faktero/StockMovementForm";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/vydaj")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Výdaj zo skladu — Faktero") }],
  }),
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
  const { t } = useT();
  const nav = useNavigate();
  const { polozka } = Route.useSearch();
  return (
    <MovementForm
      type="vydaj"
      title={t("Výdaj zo skladu")}
      polozkaId={polozka}
      onDone={() => nav({ to: "/sklad/pohyby" })}
    />
  );
}
