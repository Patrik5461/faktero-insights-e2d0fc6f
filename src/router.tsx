import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { sledujStareVydanie } from "./lib/faktero/stara-verzia";

export const getRouter = () => {
  // Karta otvorená pred nasadením si po ňom nedokáže dotiahnuť zvyšok stránky.
  sledujStareVydanie();

  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
