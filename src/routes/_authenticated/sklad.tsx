import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/sklad")({
  head: () => ({ meta: [{ title: "Sklad — Faktero" }] }),
  component: () => <Outlet />,
});
