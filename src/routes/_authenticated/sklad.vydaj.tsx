import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MovementForm } from "@/components/faktero/StockMovementForm";

export const Route = createFileRoute("/_authenticated/sklad/vydaj")({
  head: () => ({ meta: [{ title: "Výdaj zo skladu — Faktero" }] }),
  component: () => {
    const nav = useNavigate();
    return (
      <MovementForm
        type="vydaj"
        title="Výdaj zo skladu"
        onDone={() => nav({ to: "/sklad/pohyby" })}
      />
    );
  },
});
