import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Blog je len rozcestník pre `/blog` a `/blog/$slug`.
 *
 * Bez tohto `Outlet`u by rodičovská trasa pochovala detail článku — otvorila
 * by sa adresa článku, ale vykreslil by sa zoznam. Chyba sa navyše nehlási
 * ako 404, takže sa hľadá ťažko.
 */
export const Route = createFileRoute("/blog")({
  component: () => <Outlet />,
});
