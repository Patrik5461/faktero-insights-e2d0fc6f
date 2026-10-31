import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { nacitajSlovnik } from "./lib/i18n/jazyk";
import { sledujNoveVydanie, sledujStareVydanie } from "./lib/faktero/stara-verzia";

export const getRouter = () => {
  // Karta otvorená pred nasadením si po ňom nedokáže dotiahnuť zvyšok stránky.
  sledujStareVydanie();

  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    /*
      Pri hydratácii sa `beforeLoad` koreňa znova nespúšťa (kontext príde zo
      servera), takže slovník jazyka treba načítať tu — inak by prehliadač
      prvýkrát nakreslil slovenčinu namiesto toho, čo poslal server.
    */
    hydrate: () =>
      typeof document === "undefined" ? undefined : nacitajSlovnik(document.documentElement.lang),
  });

  // Karta zo starého vydania volá serverové funkcie, ktoré už neexistujú.
  sledujNoveVydanie(router);

  return router;
};
