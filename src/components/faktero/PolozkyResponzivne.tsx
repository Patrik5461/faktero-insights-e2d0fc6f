import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Položky dokladu, ktoré sa prispôsobia šírke KONTAJNERA, nie okna.
 *
 * Rovnaký editor položiek žije v bočnom paneli (~360–420 px), v kompaktnom
 * detaile aj na celej stránke — hranice `sm:`/`md:` podľa okna tu klamú, panel
 * môže byť úzky aj na širokom monitore. Preto `@container` a `@min-[560px]:`.
 *
 * - Pod 560 px je položka karta: mriežka 12 stĺpcov, každá bunka si povie, koľko
 *   z nich zaberie (`uzky`), a popis má malý label nad poľom. Hlavička sa skryje.
 * - Od 560 px je to tabuľkový riadok so stĺpcami `stlpce` (grid-template-columns)
 *   a popisy sú v hlavičke (pri poli zostanú len pre čítačky).
 *
 * Nikde pevná minimálna šírka ani `overflow-hidden`: bunky majú `min-w-0`, polia
 * `w-full`, selecty `truncate` (pozri `POLE_POLOZKY`, `VYBER_POLOZKY`).
 */

/** Hranica tabuľkového režimu — drž v súlade s triedami `@min-[560px]:` nižšie. */
export const SIRKA_TABULKY_PX = 560;

/** Triedy textového/číselného poľa v položke. */
export const POLE_POLOZKY =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm";
/** Triedy selectu v položke — dlhý text sa skráti, nerozťahuje bunku. */
export const VYBER_POLOZKY =
  "h-8 w-full min-w-0 truncate rounded-md border border-input bg-background pl-1.5 pr-6 text-sm";

// Tailwind triedy musia byť v zdrojáku celé — preto mapy, nie `col-span-${n}`.
const UZKY: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
};
const SIROKY: Record<number, string> = {
  1: "@min-[560px]:col-span-1",
  2: "@min-[560px]:col-span-2",
  3: "@min-[560px]:col-span-3",
  4: "@min-[560px]:col-span-4",
  5: "@min-[560px]:col-span-5",
  6: "@min-[560px]:col-span-6",
  7: "@min-[560px]:col-span-7",
  8: "@min-[560px]:col-span-8",
  9: "@min-[560px]:col-span-9",
  10: "@min-[560px]:col-span-10",
  11: "@min-[560px]:col-span-11",
  12: "@min-[560px]:col-span-12",
};
const PORADIE: Record<number, string> = {
  1: "order-1",
  2: "order-2",
  3: "order-3",
  4: "order-4",
  5: "order-5",
  6: "order-6",
  7: "order-7",
  8: "order-8",
  9: "order-9",
  10: "order-10",
  11: "order-11",
  12: "order-12",
};

/** Obal zoznamu položiek. `stlpce` = grid-template-columns tabuľkového režimu. */
export function PolozkyKontajner({
  stlpce,
  className,
  children,
}: {
  stlpce: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // `relative`: opora pre sr-only popisy, inak roztiahnu stránku (styles.css).
    <div
      className={cn("@container relative min-w-0", className)}
      style={{ "--polozky-stlpce": stlpce } as CSSProperties}
    >
      {children}
    </div>
  );
}

export type StlpecHlavicky = {
  text: ReactNode;
  vpravo?: boolean;
  stred?: boolean;
  /** Len pre čítačky (napr. stĺpec s tlačidlami). */
  skryty?: boolean;
  title?: string;
};

/** Hlavička tabuľkového režimu; v úzkom kontajneri sa skryje. */
export function PolozkyHlavicka({ stlpce }: { stlpce: StlpecHlavicky[] }) {
  return (
    <div
      aria-hidden
      className="hidden gap-x-2 pb-1 text-xs text-muted-foreground @min-[560px]:grid @min-[560px]:grid-cols-[var(--polozky-stlpce)]"
    >
      {stlpce.map((s, i) => (
        <span
          key={i}
          title={s.title}
          className={cn(
            "min-w-0 truncate",
            s.vpravo && "text-right",
            s.stred && "text-center",
            s.skryty && "invisible",
          )}
        >
          {s.text}
        </span>
      ))}
    </div>
  );
}

/** Jedna položka: v úzkom režime karta (12 stĺpcov), v širokom riadok tabuľky. */
export function RiadokPolozky({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-12 items-end gap-x-2 gap-y-1.5 border-t border-border py-2",
        "@min-[560px]:grid-cols-[var(--polozky-stlpce)] @min-[560px]:gap-y-1 @min-[560px]:py-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Bunka položky.
 * - `uzky`: koľko z 12 stĺpcov zaberie v úzkom režime (predvolene 12).
 * - `siroky`: koľko stĺpcov v širokom režime (predvolene 1; v `PodriadokPolozky` z 12).
 * - `poradie`: poradie v úzkom režime (1–12), keď sa má líšiť od tabuľky —
 *   ak ho použiješ, daj ho všetkým bunkám riadku.
 * - `popis`: malý label nad poľom v úzkom režime; široko len pre čítačky,
 *   s `vzdyPopis` viditeľný aj široko.
 * - `ako="label"`: bunka je `<label>` (klik na popis zameria pole).
 */
export function BunkaPolozky({
  popis,
  uzky = 12,
  siroky,
  poradie,
  vzdyPopis,
  skrytyPopis,
  ako = "div",
  vpravo,
  stred,
  className,
  children,
}: {
  popis?: ReactNode;
  uzky?: number;
  siroky?: number;
  poradie?: number;
  vzdyPopis?: boolean;
  /** Popis len pre čítačky aj v úzkom režime (napr. tlačidlo koša). */
  skrytyPopis?: boolean;
  ako?: "div" | "label";
  vpravo?: boolean;
  stred?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Tag = ako;
  return (
    <Tag
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        UZKY[uzky] ?? "col-span-12",
        siroky ? SIROKY[siroky] : "@min-[560px]:col-span-1",
        poradie ? cn(PORADIE[poradie], "@min-[560px]:order-none") : null,
        vpravo && "items-end text-right",
        stred && "items-center text-center",
        className,
      )}
    >
      {popis != null ? (
        <span
          className={cn(
            "truncate text-[11px] leading-tight text-muted-foreground",
            skrytyPopis ? "sr-only" : !vzdyPopis && "@min-[560px]:sr-only",
          )}
        >
          {popis}
        </span>
      ) : null}
      {children}
    </Tag>
  );
}

/** Druhý riadok položky (napr. zaúčtovanie) cez celú šírku; vnútri mriežka 12 stĺpcov. */
export function PodriadokPolozky({
  poradie,
  className,
  children,
}: {
  poradie?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "col-span-12 grid min-w-0 grid-cols-12 gap-x-2 gap-y-1.5 @min-[560px]:col-[1/-1] @min-[560px]:pt-0.5",
        poradie ? cn(PORADIE[poradie], "@min-[560px]:order-none") : null,
        className,
      )}
    >
      {children}
    </div>
  );
}
