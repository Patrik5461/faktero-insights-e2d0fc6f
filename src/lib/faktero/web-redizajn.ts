import { useEffect } from "react";

/**
 * Vrstva vzhľadu webu (redizajn 2026-11).
 *
 * Všetky pravidlá v `src/styles/web.css` platia len pod týmto atribútom.
 * Nastavuje ho rám webovej aplikácie (`AppShell`) — na svojom koreni (aby
 * prvé vykreslenie zo servera vyzeralo rovnako) a na `<html>` (aby ho mali aj
 * okná, ponuky a toasty, ktoré Radix a sonner kreslia mimo rámu do `<body>`).
 *
 * Mobilná appka (`/app`, `src/mobile/*`) `AppShell` nemá, atribút sa jej preto
 * nikdy nenastaví a jej vzhľad sa nemení.
 */
export const ATRIBUT_WEB_REDIZAJNU = "data-web-redizajn";

/** Nasadí atribút na `<html>`, kým je komponent pripojený. */
export function useWebRedizajn(zapnute = true): void {
  useEffect(() => {
    if (!zapnute) return;
    const koren = document.documentElement;
    koren.setAttribute(ATRIBUT_WEB_REDIZAJNU, "");
    return () => koren.removeAttribute(ATRIBUT_WEB_REDIZAJNU);
  }, [zapnute]);
}
