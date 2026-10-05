import { createFileRoute } from "@tanstack/react-router";
import { SamofakturaForm } from "@/components/faktero/SamofakturaForm";

export const Route = createFileRoute("/_authenticated/prijate-faktury/samofaktura")({
  head: () => ({ meta: [{ title: "Samofaktúra — Faktero" }] }),
  /* `?id=` otvorí existujúcu samofaktúru na úpravu, `?opravuje=` založí k nej dobropis. */
  validateSearch: (s: Record<string, unknown>): { id?: string; opravuje?: string } => ({
    id: typeof s.id === "string" && s.id ? s.id : undefined,
    opravuje: typeof s.opravuje === "string" && s.opravuje ? s.opravuje : undefined,
  }),
  component: SamofakturaPage,
});

function SamofakturaPage() {
  const { id, opravuje } = Route.useSearch();
  return <SamofakturaForm key={id ?? opravuje ?? "nova"} id={id} opravuje={opravuje} />;
}
