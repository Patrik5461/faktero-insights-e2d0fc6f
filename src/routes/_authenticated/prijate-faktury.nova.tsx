import { preloz } from "@/lib/i18n/jazyk";
import { createFileRoute } from "@tanstack/react-router";
import { PrijataFakturaForm } from "@/components/faktero/PrijataFakturaForm";

export const Route = createFileRoute("/_authenticated/prijate-faktury/nova")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Nová prijatá faktúra — Faktero") }] }),
  /*
    `?typ=proforma` otvorí formulár rovno ako prijatú zálohovú faktúru,
    `?typ=advance_payment` ako daňový doklad k prijatej platbe.
  */
  validateSearch: (s: Record<string, unknown>): { typ?: "proforma" | "advance_payment" } => ({
    typ: s.typ === "proforma" || s.typ === "advance_payment" ? s.typ : undefined,
  }),
  component: NewPurchaseInvoicePage,
});

function NewPurchaseInvoicePage() {
  const { typ } = Route.useSearch();
  return <PrijataFakturaForm druh={typ ?? "regular"} />;
}
