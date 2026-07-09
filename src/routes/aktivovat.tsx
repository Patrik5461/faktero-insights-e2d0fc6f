import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/aktivovat")({
  beforeLoad: () => {
    throw redirect({ to: "/objednavka" });
  },
});
