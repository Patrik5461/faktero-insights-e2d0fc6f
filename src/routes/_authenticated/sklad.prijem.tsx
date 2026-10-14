import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MovementForm } from "@/components/faktero/StockMovementForm";
import { ScanLine } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/prijem")({
  head: () => ({ meta: [{ title: "Príjem na sklad — Faktero" }] }),
  /* `?polozka=` nesie skladovú kartu, z ktorej sa sem prišlo naskladniť. */
  validateSearch: (s: Record<string, unknown>): { polozka?: string } => ({
    polozka: typeof s.polozka === "string" && s.polozka ? s.polozka : undefined,
  }),
  component: PrijemPage,
});

function PrijemPage() {
  const nav = useNavigate();
  const { polozka } = Route.useSearch();
  return (
    <>
      <MovementForm
        action={
          <Link
            to="/sklad/dodaci-list"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            <ScanLine className="h-4 w-4" /> Naskenovať dodací list
          </Link>
        }
        type="prijem"
        title="Príjem na sklad"
        polozkaId={polozka}
        onDone={() => nav({ to: "/sklad/pohyby" })}
      />
    </>
  );
}
