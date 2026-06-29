/**
 * "Active product" = which product view the user currently uses
 * (Fakturačný systém vs Kniha jázd). Independent of `profiles.product_mode`,
 * which represents access (invoicing | logbook | both).
 *
 * Stored in localStorage so it persists across logins on the same device.
 */

export type ActiveProduct = "invoicing" | "logbook";

const KEY = "faktero.active_product";

export function getActiveProduct(): ActiveProduct | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "invoicing" || v === "logbook" ? v : null;
}

export function setActiveProduct(p: ActiveProduct): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, p);
}

export function landingPathFor(p: ActiveProduct): string {
  return p === "logbook" ? "/jazdy" : "/dashboard";
}
