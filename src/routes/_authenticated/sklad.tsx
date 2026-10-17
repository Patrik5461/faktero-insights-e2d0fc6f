import { createFileRoute, Outlet } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Sklad — Faktero") }] }),
  component: () => <Outlet />,
});
