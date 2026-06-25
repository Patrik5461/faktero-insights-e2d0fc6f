import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/jazdy/integracie")({
  component: () => <Outlet />,
});