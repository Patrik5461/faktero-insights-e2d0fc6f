import { createFileRoute, useParams } from "@tanstack/react-router";
import { PrijataFakturaForm } from "@/components/faktero/PrijataFakturaForm";

export const Route = createFileRoute("/_authenticated/prijate-faktury/$id/upravit")({
  head: () => ({ meta: [{ title: "Úprava prijatej faktúry — Faktero" }] }),
  component: EditPurchaseInvoicePage,
});

function EditPurchaseInvoicePage() {
  const { id } = useParams({ from: "/_authenticated/prijate-faktury/$id/upravit" });
  return <PrijataFakturaForm id={id} />;
}
