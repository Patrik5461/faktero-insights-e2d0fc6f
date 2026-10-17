/**
 * Jazyk z cookie — na serveri z požiadavky, v prehliadači z `document.cookie`.
 *
 * Je v samostatnom súbore, lebo `createIsomorphicFn` ťahá serverové jadro
 * TanStack Start. Mobilná appka zdieľa obrazovky (a s nimi `jazyk.ts`), ale
 * stavia sa čistým Vite bez servera — import odtiaľ by jej build zhodil.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { jazykZCookie, type Jazyk } from "./jazyk";

export const zistiJazyk = createIsomorphicFn()
  .server(async (): Promise<Jazyk> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    return jazykZCookie(getRequestHeader("cookie"));
  })
  .client(async (): Promise<Jazyk> => jazykZCookie(document.cookie));
