import { createFileRoute } from "@tanstack/react-router";
import { PrijataFakturaForm } from "@/components/faktero/PrijataFakturaForm";

export const Route = createFileRoute("/_authenticated/prijate-faktury/nova")({
  head: () => ({ meta: [{ title: "Nová prijatá faktúra — Faktero" }] }),
  component: NewPurchaseInvoicePage,
});

function NewPurchaseInvoicePage() {
  return <PrijataFakturaForm />;
}
