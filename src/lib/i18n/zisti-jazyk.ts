/**
 * Jazyk z adresy (`?lang=de`) alebo z cookie — na serveri z požiadavky,
 * v prehliadači z `location` a `document.cookie`. Parameter v adrese prebije
 * cookie, aby vyhľadávač (bez cookie) videl aj nemeckú a českú verziu.
 *
 * Je v samostatnom súbore, lebo `createIsomorphicFn` ťahá serverové jadro
 * TanStack Start. Mobilná appka zdieľa obrazovky (a s nimi `jazyk.ts`), ale
 * stavia sa čistým Vite bez servera — import odtiaľ by jej build zhodil.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { jazykZCookie, type Jazyk } from "./jazyk";
import { jazykZAdresy } from "./jazyk-adresa";

export const zistiJazyk = createIsomorphicFn()
  .server(async (): Promise<Jazyk> => {
    const { getRequest, getRequestHeader } = await import("@tanstack/react-start/server");
    let zAdresy: Jazyk | null = null;
    try {
      zAdresy = jazykZAdresy(getRequest().url);
    } catch {
      /* bez požiadavky (prerender) — ostane cookie */
    }
    return zAdresy ?? jazykZCookie(getRequestHeader("cookie"));
  })
  .client(
    async (): Promise<Jazyk> =>
      jazykZAdresy(window.location.search) ?? jazykZCookie(document.cookie),
  );
