/*
  Moje úlohy — čo čaká práve na prihláseného človeka.

  Tri zdroje, ktoré predtým boli každý inde: doklady na jeho schválenie,
  komentáre, v ktorých ho kolega označil, a nespracované doklady firmy. Nič
  z toho sa neukladá ako „úloha" — počíta sa to z dát pri otvorení, rovnako
  ako zvonček. Uložené je len vyriešenie komentára (`vyriesili`).

  Čisté funkcie bez databázy, aby sa dali skúšať.
*/

import {
  cestaNaDetail,
  odkazNaDetail,
  type AgendaSchvalovania,
  type OdkazNaDetail,
} from "./schvalovanie";
import { formatujMenu } from "./mena";

export type AgendaDokladu = AgendaSchvalovania;

export const NAZOV_AGENDY_DOKLADU: Record<AgendaDokladu, string> = {
  doklad: "Bloček / doklad",
  prijata: "Prijatá faktúra",
  vystavena: "Vystavená faktúra",
  nespracovany: "Nespracovaný doklad",
  vyuctovanie: "Vyúčtovanie výdavkov",
};

/**
 * Odkaz na detail dokladu pre `<Link>` — parametre zvlášť, router ich z
 * reťazca neprečíta. Mapa agend je spoločná so stránkou Na schválenie
 * (`ODKAZY_AGEND`), aby nespracovaný doklad a vyúčtovanie neviedli na faktúru.
 */
export function odkazNaDoklad(agenda: string, id: string): OdkazNaDetail {
  return odkazNaDetail(agenda, id);
}

/** Tá istá cesta ako reťazec — pre zvonček, ktorý nesie len `to`. */
export function cestaNaDoklad(agenda: string, id: string): string {
  return cestaNaDetail(agenda, id);
}

export type KomentarNaVyriesenie = {
  user_id: string;
  upozornit: string[] | null;
  vyriesili?: string[] | null;
};

/**
 * Čaká komentár na tohto človeka? Musí byť označený, nesmie byť autor (sám
 * seba sa neoznačuje) a ešte ho nesmie mať vyriešený. Vyriešenie je za
 * každého označeného zvlášť — Jana nevyrieši komentár za Petra.
 */
export function cakaNaMna(k: KomentarNaVyriesenie, userId: string): boolean {
  if (!userId || k.user_id === userId) return false;
  if (!(k.upozornit ?? []).includes(userId)) return false;
  return !(k.vyriesili ?? []).includes(userId);
}

/** Nové pole `vyriesili` po vyriešení (alebo vrátení medzi úlohy). Bez duplicít. */
export function zmenVyriesenie(
  vyriesili: string[] | null | undefined,
  userId: string,
  vyriesene: boolean,
): string[] {
  const bez = (vyriesili ?? []).filter((u) => u !== userId);
  return vyriesene ? [...bez, userId] : bez;
}

/** Literál poľa pre PostgREST (`{a,b}`) — na porovnanie pri súbežnom zápise. */
export function poleProPostgrest(pole: string[]): string {
  return `{${pole.join(",")}}`;
}

export type PoctyUloh = {
  schvalenie: number;
  komentare: number;
  nespracovane: number;
  /** Prijaté eFaktúry, ktoré ešte nikto nezaevidoval. */
  efaktury?: number;
};

export function spoluUloh(p: PoctyUloh): number {
  return (
    Math.max(0, p.schvalenie) +
    Math.max(0, p.komentare) +
    Math.max(0, p.nespracovane) +
    Math.max(0, p.efaktury ?? 0)
  );
}

export function nicNecaka(p: PoctyUloh): boolean {
  return spoluUloh(p) === 0;
}

/** Popis dokladu v zozname: „Prijatá faktúra 2026015 · Orange". */
export function popisDokladu(
  agenda: string,
  cislo?: string | null,
  partner?: string | null,
): string {
  const nazov = NAZOV_AGENDY_DOKLADU[agenda as AgendaDokladu] ?? "Doklad";
  const c = cislo?.trim() ? cislo.trim() : "bez čísla";
  return [`${nazov} ${c}`, partner?.trim() || null].filter(Boolean).join(" · ");
}

/** Stav čítania nespracovaného dokladu slovami (ako v zozname Nespracovaných). */
export function stavCitania(stav: string | null | undefined): {
  text: string;
  ton: "cita" | "chyba" | "ok";
} {
  if (stav === "cita") return { text: "Číta sa…", ton: "cita" };
  if (stav === "chyba") return { text: "Doplniť ručne", ton: "chyba" };
  return { text: "Vyťažené", ton: "ok" };
}

/** Najnovšie navrchu, najviac `n` — nespracované doklady a bločky v jednom zozname. */
export function najnovsie<T extends { vytvorene: string }>(zoznamy: T[][], n = 10): T[] {
  return zoznamy
    .flat()
    .sort((a, b) => String(b.vytvorene).localeCompare(String(a.vytvorene)))
    .slice(0, n);
}

/**
 * Suma úlohy na zobrazenie: doklad bez sumy (napr. vyúčtovanie či
 * nespracovaný doklad, ktorý sa ešte nevyťažil) je „—“, nie „0,00 €“.
 */
export function sumaUlohy(suma: unknown, mena: unknown, locale = "sk-SK"): string {
  if (suma == null || suma === "") return "—";
  const n = Number(suma);
  return Number.isFinite(n) ? formatujMenu(n, mena, locale) : "—";
}
