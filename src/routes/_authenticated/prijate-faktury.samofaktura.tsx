import { createFileRoute } from "@tanstack/react-router";
import { SamofakturaForm } from "@/components/faktero/SamofakturaForm";

export const Route = createFileRoute("/_authenticated/prijate-faktury/samofaktura")({
  head: () => ({ meta: [{ title: "Samofaktúra — Faktero" }] }),
  /* `?id=` otvorí existujúcu samofaktúru na úpravu. */
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({
    id: typeof s.id === "string" && s.id ? s.id : undefined,
  }),
  component: SamofakturaPage,
});

function SamofakturaPage() {
  const { id } = Route.useSearch();
  return <SamofakturaForm key={id ?? "nova"} id={id} />;
}
