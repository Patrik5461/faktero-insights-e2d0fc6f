import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Jeden systém stavových odznakov webu (redizajn 2026-11).
 *
 * Tón = význam, nie farba: rovnaký tón má „Uhradená“ faktúra, „Doručená“
 * eFaktúra aj „Schválený“ doklad. Farby sú v `styles/web.css` (`.stav-*`,
 * premenné `--stav-*`) pre svetlý aj tmavý motív, kontrast textu ≥ 6,8:1.
 *
 * Len web — mobilná appka má vlastné odznaky v `mobil/ui.tsx`.
 */
export type TonStavu =
  | "neutralny" // koncept, nevytvorené, bez stavu
  | "informacia" // vystavené, vygenerované
  | "priebeh" // odoslané, čaká na druhú stranu
  | "uspech" // uhradené, doručené, schválené
  | "pozor" // čiastočne, čaká na kontrolu/schválenie
  | "chyba" // po splatnosti, zlyhalo, zamietnuté
  | "zruseny"; // stornované

export function triedaStavu(ton: TonStavu, maly = false): string {
  return cn(
    "stav",
    ton !== "neutralny" && ton !== "zruseny" && `stav-${ton}`,
    ton === "zruseny" && "stav-zruseny",
    maly && "stav-maly",
  );
}

export function StavOdznak({
  ton,
  children,
  ikona,
  maly,
  className,
  title,
}: {
  ton: TonStavu;
  children: ReactNode;
  /** Ikona namiesto bodky (lucide, veľkosť dodá CSS). */
  ikona?: ReactNode;
  maly?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn(triedaStavu(ton, maly), className)} title={title}>
      {ikona}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/* ---- Mapovanie stavov z databázy na tón (texty ostávajú pri komponentoch) ---- */

/** Stav vystaveného dokladu (`invoices.status`, po splatnosti dopočítané). */
export const TON_DOKLADU: Record<string, TonStavu> = {
  draft: "neutralny",
  issued: "informacia",
  sent: "priebeh",
  paid: "uspech",
  partially_paid: "pozor",
  overdue: "chyba",
  cancelled: "zruseny",
};

/** Úhrada (prijaté aj vystavené doklady). */
export const TON_PLATBY: Record<string, TonStavu> = {
  unpaid: "neutralny",
  partially_paid: "pozor",
  partial: "pozor",
  paid: "uspech",
  overdue: "chyba",
};

/** eFaktúra — stav dokumentu (`deriveEfakturaUiStatus`) aj doručenia. */
export const TON_EFAKTURY: Record<string, TonStavu> = {
  not_created: "neutralny",
  generated: "informacia",
  validation_failed: "chyba",
  ready_to_send: "uspech",
  pending: "priebeh",
  sent: "priebeh",
  accepted: "uspech",
  delivered: "uspech",
  failed: "chyba",
  rejected: "chyba",
};

/** Schvaľovanie dokladov (`approval_status`). */
export const TON_SCHVALOVANIA: Record<string, TonStavu> = {
  pending: "pozor",
  approved: "uspech",
  rejected: "chyba",
};

export function tonStavu(mapa: Record<string, TonStavu>, stav: unknown): TonStavu {
  return mapa[String(stav ?? "")] ?? "neutralny";
}
