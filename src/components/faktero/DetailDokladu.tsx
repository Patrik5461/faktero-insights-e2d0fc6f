import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, X } from "lucide-react";
import { PrepinacStranyNahladu, RozlozenieSNahladom } from "./RozlozenieSNahladom";
import type { StranaNahladu } from "@/hooks/useStranaNahladu";
import { useT } from "@/lib/i18n/useT";

/*
  Spoločné kúsky detailu dokladu — rovnaký vzhľad ako pri nespracovanom
  doklade: náhľad na jednej strane (vľavo/vpravo podľa voľby používateľa),
  na druhej údaje a pod nimi karta „Zaúčtovanie“. Používa ich Nespracované,
  vystavená a zálohová faktúra, prijatá faktúra aj bloček.
*/

/**
 * Triedy mriežky — dva rovnako široké stĺpce, na úzkej obrazovke pod sebou.
 * `grid-cols-1` (= minmax(0, 1fr)) je nutné: bez neho je stĺpec na mobile
 * `auto` a rastie podľa najširšej tabuľky (položky nespracovaného dokladu
 * majú min. 30rem) — stránka sa potom posúvala do strany.
 */
export const MRIEZKA_DETAILU = "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";

/**
 * Náhľad a obsah vedľa seba. Na úzkej obrazovke sú pod sebou — poradie v DOM
 * (a teda aj tabulátor a čítačka) sa riadi voľbou strany: „vľavo“ = náhľad
 * hore, „vpravo“ = náhľad dole. Bez náhľadu vráti len obsah.
 */
export function RozlozenieDetailu({
  nahlad,
  children,
  strana,
}: {
  nahlad: ReactNode;
  children: ReactNode;
  /** Len keď volajúci stranu už pozná (inak podľa voľby používateľa). */
  strana?: StranaNahladu;
}) {
  return (
    <RozlozenieSNahladom
      className={MRIEZKA_DETAILU}
      stlpceVlavo=""
      stlpceVpravo=""
      nahlad={nahlad}
      strana={strana}
    >
      {children}
    </RozlozenieSNahladom>
  );
}

/**
 * Karta s náhľadom dokladu. Na širokej obrazovke sa drží pri vrchu a roluje
 * sama; výška podľa obsahu (`self-start`), nie podľa stĺpca s údajmi — inak
 * pod krátkym PDF ostával prázdny pruh; pod náhľadom je odkaz na súbor, prepínač strany a voliteľne
 * „Skryť náhľad“.
 *
 * `lenSiroka` — na úzkej obrazovke sa karta nekreslí (stránka tam má náhľad
 * po svojom, napr. bloček).
 */
export function KartaNahladu({
  nazov,
  odkaz,
  akcie,
  onSkryt,
  lenSiroka,
  children,
}: {
  /** Názov dokladu — pre čítačku (`aria-label` karty). */
  nazov?: string | null;
  /** Odkaz „Otvoriť …“ pod náhľadom. */
  odkaz?: { url: string; text: string } | null;
  /** Ďalšie tlačidlá do riadka pod náhľadom (napr. Stiahnuť). */
  akcie?: ReactNode;
  onSkryt?: () => void;
  lenSiroka?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <aside
      aria-label={nazov ? `${t("Náhľad dokladu")} — ${nazov}` : t("Náhľad dokladu")}
      data-karta-nahladu=""
      className={`min-w-0 max-h-[80vh] self-start overflow-auto rounded-xl border border-border bg-card p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] ${lenSiroka ? "hidden lg:block" : ""}`}
    >
      {children}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {odkaz ? (
            <a
              href={odkaz.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{odkaz.text}</span>
            </a>
          ) : null}
          {akcie}
        </div>
        <div className="flex items-center gap-1">
          <PrepinacStranyNahladu />
          {onSkryt ? (
            <button
              type="button"
              aria-label={t("Skryť náhľad")}
              title={t("Skryť náhľad")}
              onClick={onSkryt}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

/**
 * Karta „Zaúčtovanie“ — nadpis, vpravo stav (Nezaúčtovaná / Zaúčtovaná /
 * V Pohode), pod ním polia. Tú istú kartu má nespracovaný doklad, vystavená,
 * zálohová aj prijatá faktúra.
 */
export function SekciaZauctovania({
  stav,
  children,
  className = "",
}: {
  stav?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    <section
      id="zauctovanie"
      aria-labelledby="zauctovanie-nadpis"
      className={`scroll-mt-24 rounded-xl border border-border bg-card p-4 text-sm transition-shadow ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="zauctovanie-nadpis" className="text-base font-semibold">
          {t("Zaúčtovanie")}
        </h3>
        {stav}
      </div>
      {children}
    </section>
  );
}

/** „Prázdne pole = predvolené z nastavení predkontácií.“ + voliteľný dovetok. */
export function NapovedaPredkontacii({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {t("Prázdne pole = predvolené z")}{" "}
      <Link to="/uctovnictvo/predkontacie" className="underline">
        {t("nastavení predkontácií")}
      </Link>
      {children ? children : "."}
    </p>
  );
}
