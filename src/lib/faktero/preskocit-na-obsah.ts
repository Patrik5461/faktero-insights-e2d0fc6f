/**
 * Odkaz „Preskočiť na obsah“ (WCAG 2.4.1) — kam presunúť fokus.
 *
 * Rozloženia, ktoré to vedia, označia hlavný obsah `id="obsah"` (AppShell,
 * MarketingShell, titulka). Verejných stránok bez spoločného rozloženia je
 * však veľa, preto náhradou poslúži prvý `<main>` a nakoniec nadpis `<h1>`.
 */
export const ID_OBSAHU = "obsah";

type Prvok = {
  hasAttribute(meno: string): boolean;
  setAttribute(meno: string, hodnota: string): void;
};
type Dokument = {
  getElementById(id: string): Prvok | null;
  querySelector(selektor: string): Prvok | null;
};

export function cielObsahu<T extends Prvok>(dok: {
  getElementById(id: string): T | null;
  querySelector(selektor: string): T | null;
}): T | null {
  return (
    dok.getElementById(ID_OBSAHU) ??
    dok.querySelector("main, [role='main']") ??
    dok.querySelector("h1")
  );
}

/**
 * Presunie fokus na hlavný obsah. Prvok bez `tabindex` ho dostane (-1), inak
 * by `focus()` na `<main>` nič nespravil a ďalší Tab by začal znova od menu.
 */
export function preskocNaObsah(dok: Dokument): boolean {
  const ciel = cielObsahu(dok) as (Prvok & { focus?: () => void }) | null;
  if (!ciel) return false;
  if (!ciel.hasAttribute("tabindex")) ciel.setAttribute("tabindex", "-1");
  ciel.focus?.();
  return true;
}
