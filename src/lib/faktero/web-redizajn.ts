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

/*
 * Počet pripojených komponentov, ktoré atribút chcú. Pri prechode medzi
 * stránkou mimo rámu (napr. /onboarding presmeruje na /dashboard) by inak
 * upratanie odchádzajúcej stránky zmazalo atribút, ktorý rám práve nastavil,
 * a okná/ponuky/toasty by do obnovenia stránky stratili vzhľad webu.
 */
let pocetPouzivatelov = 0;

/** Nasadí atribút na `<html>`, kým je pripojený aspoň jeden komponent, ktorý ho chce. */
export function useWebRedizajn(zapnute = true): void {
  useEffect(() => {
    if (!zapnute) return;
    const koren = document.documentElement;
    pocetPouzivatelov += 1;
    koren.setAttribute(ATRIBUT_WEB_REDIZAJNU, "");
    return () => {
      pocetPouzivatelov = Math.max(0, pocetPouzivatelov - 1);
      if (pocetPouzivatelov === 0) koren.removeAttribute(ATRIBUT_WEB_REDIZAJNU);
    };
  }, [zapnute]);
}
