import { createFileRoute } from "@tanstack/react-router";
import { PrijataFakturaForm } from "@/components/faktero/PrijataFakturaForm";

export const Route = createFileRoute("/_authenticated/prijate-faktury/nova")({
  head: () => ({ meta: [{ title: "Nová prijatá faktúra — Faktero" }] }),
  /* `?typ=proforma` otvorí formulár rovno ako prijatú zálohovú faktúru. */
  validateSearch: (s: Record<string, unknown>): { typ?: "proforma" } => ({
    typ: s.typ === "proforma" ? "proforma" : undefined,
  }),
  component: NewPurchaseInvoicePage,
});

function NewPurchaseInvoicePage() {
  const { typ } = Route.useSearch();
  return <PrijataFakturaForm druh={typ === "proforma" ? "proforma" : "regular"} />;
}
