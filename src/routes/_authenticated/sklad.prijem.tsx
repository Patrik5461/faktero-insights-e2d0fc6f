import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MovementForm } from "@/components/faktero/StockMovementForm";
import { ScanLine } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/prijem")({
  head: () => ({ meta: [{ title: "Príjem na sklad — Faktero" }] }),
  component: PrijemPage,
});

function PrijemPage() {
  const nav = useNavigate();
  return (
    <>
      <div className="mx-auto mt-4 flex max-w-xl justify-end px-4">
        <Link
          to="/sklad/dodaci-list"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          <ScanLine className="h-4 w-4" /> 📷 Naskenovať dodací list
        </Link>
      </div>
      <MovementForm type="prijem" title="Príjem na sklad" onDone={() => nav({ to: "/sklad/pohyby" })} />
    </>
  );
}
