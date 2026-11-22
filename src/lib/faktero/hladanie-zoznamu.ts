/**
 * Hľadanie v zoznamoch dokladov (vystavené, zálohové, prijaté, bločky,
 * nespracované, ostatné) — rovnako ako hlavné vyhľadávanie v hlavičke
 * (Patrik 22. 11.): číslo dokladu / VS, partner (odberateľ, dodávateľ) bez
 * diakritiky, IČO/DIČ, IČ DPH a suma s desatinnou čiarkou („123,45“,
 * „1 234,50 €“, aj záporná pri dobropise).
 *
 * - Zoznamy, ktoré sa načítavajú z databázy po stránkach: `orHladania()` →
 *   reťazec do `.or()` (podmienky zo skupín hlavného vyhľadávania).
 * - Zoznamy, ktoré sú v pamäti celé: `zhodaHladania()`.
 */
import {
  filterSkupiny,
  rozoberDotaz,
  type RozborDotazu,
  type SkupinaHladania,
} from "./globalne-hladanie";
import { normalizuj } from "./hladanie-text";

/** Podmienka do `.or()` pre tabuľku skupiny; null = bez hľadania. */
export function orHladania(skupina: SkupinaHladania, q: string | null | undefined): string | null {
  const r = rozoberDotaz(q);
  if (!r.text) return null;
  return filterSkupiny(skupina, r) ?? null;
}

export type PoliaHladania = {
  /** Mená partnerov, predmety, názvy súborov — bez diakritiky, časť slova stačí. */
  nazvy?: (string | null | undefined)[];
  /** Čísla dokladov, VS — časť stačí, bez medzier. */
  cisla?: (string | null | undefined)[];
  /** IČO, DIČ, IČ DPH, IBAN — porovnáva sa bez medzier. */
  identifikatory?: (string | null | undefined)[];
  /** Sumy (celkom, aj záporné) — zhoda ± 0,01 v absolútnej hodnote. */
  sumy?: (number | string | null | undefined)[];
};

/** Doklad v pamäti zodpovedá hľadaniu? Prázdne hľadanie = áno. */
export function zhodaHladania(
  q: string | null | undefined,
  polia: PoliaHladania,
  r: RozborDotazu = rozoberDotaz(q),
): boolean {
  if (!r.text) return true;
  const n = normalizuj(r.text);
  if (n && (polia.nazvy ?? []).some((v) => normalizuj(v ?? "").includes(n))) return true;
  const bezMedzier = (v: string | null | undefined) => String(v ?? "").replace(/\s/g, "").toLowerCase();
  if (r.cislo) {
    const c = r.cislo.toLowerCase();
    if ((polia.cisla ?? []).some((v) => bezMedzier(v).includes(c))) return true;
  }
  const id = (r.icDph ?? r.iban ?? r.cifry ?? "").toLowerCase();
  if (id && (polia.identifikatory ?? []).some((v) => bezMedzier(v).includes(id))) return true;
  if (r.suma != null) {
    const s = r.suma;
    if (
      (polia.sumy ?? []).some((v) => {
        const x = typeof v === "string" ? Number(v.replace(",", ".")) : v;
        return x != null && Number.isFinite(x) && Math.abs(Math.abs(Number(x)) - s) <= 0.01;
      })
    )
      return true;
  }
  return false;
}
