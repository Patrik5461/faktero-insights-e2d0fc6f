import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MovementForm } from "@/components/faktero/StockMovementForm";

export const Route = createFileRoute("/_authenticated/sklad/prijem")({
  head: () => ({ meta: [{ title: "Príjem na sklad — Faktero" }] }),
  component: () => {
    const nav = useNavigate();
    return <MovementForm type="prijem" title="Príjem na sklad" onDone={() => nav({ to: "/sklad/pohyby" })} />;
  },
});