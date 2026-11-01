import { useCallback } from "react";
import { useRouter, type NavigateOptions } from "@tanstack/react-router";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

/**
 * Klik kdekoľvek na riadok zoznamu otvorí detail.
 *
 * Pravidlá (schválené 2026-11):
 * - klik na bunku/text riadku → detail (router, bez znovunačítania),
 * - klik na interaktívny prvok v riadku (zaškrtávadlo, tlačidlo, odkaz,
 *   výber, vstup, štítok s `role=button`…) → len jeho vlastná akcia,
 * - Ctrl/Cmd/Shift + klik a stredné tlačidlo → detail v novej karte,
 * - Enter/medzerník na zameranom riadku → detail (Ctrl/Cmd+Enter → nová karta),
 * - označenie textu myšou (drag) detail neotvorí,
 * - klik, ktorý len prebubláva cez React portál (dialóg, menu otvorené
 *   z riadku), riadok ignoruje — nie je v jeho DOM.
 *
 * Hlavný odkaz riadku (číslo/názov) ostáva obyčajný `<Link>` — čítačka ho
 * ohlási ako odkaz a Ctrl+klik/stredné tlačidlo naň funguje natívne. Klik
 * na zvyšok riadku ho len „zastúpi“.
 */

/** Prvky, ktoré si klik nechávajú pre seba. Jedno pravidlo pre celý web. */
export const NEOTVARAT_SELEKTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role=button]",
  "[role=checkbox]",
  "[role=switch]",
  "[role=menuitem]",
  "[role=combobox]",
  "[role=link]",
  "[role=tab]",
  "[contenteditable=true]",
  "[data-neotvarat]",
].join(",");

/** Kam vedie detail — to isté, čo dostáva `navigate()` / `<Link>`. */
export type CielDetailu = NavigateOptions;

export type VysledokKliku = "nic" | "otvor" | "novaKarta";

/** Minimum z udalosti, ktoré rozhodovanie potrebuje (kvôli testom bez DOM). */
export interface UdalostKliku {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
}

export interface UdalostKlavesy {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
  repeat?: boolean;
}

/** Minimum z `Selection`. */
export interface VyberTextu {
  isCollapsed: boolean;
  anchorNode: unknown;
  focusNode?: unknown;
  toString(): string;
}

type ElementLike = {
  closest?: (sel: string) => unknown;
  contains?: (n: unknown) => boolean;
  parentElement?: unknown;
};

function akoElement(t: unknown): ElementLike | null {
  if (!t || typeof t !== "object") return null;
  const el = t as ElementLike;
  if (typeof el.closest === "function") return el;
  // Textový uzol — rozhoduje jeho rodič.
  const rodic = el.parentElement as ElementLike | undefined;
  return rodic && typeof rodic.closest === "function" ? rodic : null;
}

/** Je cieľ udalosti (alebo jeho predok vnútri riadku) interaktívny prvok? */
export function jeInteraktivny(target: unknown, riadok: unknown): boolean {
  const el = akoElement(target);
  const r = riadok as ElementLike | null;
  if (!el || !r) return true;
  // Klik prišiel cez React portál (dialóg/menu z riadku) — nie je náš.
  if (typeof r.contains === "function" && !r.contains(el)) return true;
  const zasah = el.closest!(NEOTVARAT_SELEKTOR);
  if (!zasah || zasah === riadok) return false;
  // `closest` mohol nájsť predka mimo riadku (napr. celá tabuľka v <label>).
  return typeof r.contains === "function" ? r.contains(zasah) : true;
}

/** Používateľ práve označil text v riadku (drag myšou)? */
export function oznacujeText(vyber: VyberTextu | null | undefined, riadok: unknown): boolean {
  if (!vyber || vyber.isCollapsed) return false;
  if (!vyber.toString().trim()) return false;
  const r = riadok as ElementLike | null;
  if (!r || typeof r.contains !== "function") return true;
  return r.contains(vyber.anchorNode) || (vyber.focusNode != null && r.contains(vyber.focusNode));
}

/** Čo má urobiť klik myšou na riadok. */
export function rozhodniKlik(e: UdalostKliku, vyber?: VyberTextu | null): VysledokKliku {
  if (e.defaultPrevented) return "nic";
  if (e.button !== 0 && e.button !== 1) return "nic";
  if (jeInteraktivny(e.target, e.currentTarget)) return "nic";
  if (oznacujeText(vyber, e.currentTarget)) return "nic";
  if (e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey) return "novaKarta";
  if (e.altKey) return "nic";
  return "otvor";
}

/** Čo má urobiť stlačený kláves na riadku. Reaguje len keď je zameraný riadok sám. */
export function rozhodniKlaves(e: UdalostKlavesy): VysledokKliku {
  if (e.defaultPrevented || e.repeat) return "nic";
  if (e.target !== e.currentTarget) return "nic";
  if (e.key !== "Enter" && e.key !== " ") return "nic";
  if (e.altKey) return "nic";
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.shiftKey)) return "novaKarta";
  return "otvor";
}

export interface MoznostiRiadku {
  /**
   * Vlastná akcia obyčajného kliku/Enteru namiesto navigácie — napr. bočný
   * náhľad vo Faktúrach alebo riadok, ktorý otvára okno. Nová karta
   * (Ctrl/stredné tlačidlo) ide stále na `ciel`, ak je zadaný.
   */
  naKlik?: () => void;
  /** Riadok dostane `tabIndex=0` a reaguje na Enter/medzerník. Predvolene áno. */
  klavesnica?: boolean;
  /** Vypne celé správanie (napr. riadok v koši). */
  vypnute?: boolean;
}

export interface PropsRiadku {
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  onAuxClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  onMouseDown?: (e: ReactMouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  tabIndex?: number;
  className?: string;
  "data-klik-riadok"?: "";
}

/** Vzhľad klikateľného riadku — len kurzor, jemný hover a viditeľné zameranie. */
export const TRIEDA_KLIK_RIADKU =
  "cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export interface RouterPreRiadok {
  navigate: (o: NavigateOptions) => unknown;
  buildLocation: (o: NavigateOptions) => { href: string; publicHref?: string };
}

/**
 * Jadro bez hookov — zostaví props riadku. Hook `useKlikNaRiadok` ho len
 * napojí na router; testy ho volajú priamo s falošným routerom.
 */
export function propsKlikuNaRiadok(
  router: RouterPreRiadok,
  ciel: CielDetailu | null | undefined,
  moznosti: MoznostiRiadku = {},
  prostredie: {
    vyber?: () => VyberTextu | null;
    otvorOkno?: (href: string) => void;
  } = {},
): PropsRiadku {
  const { naKlik, klavesnica = true, vypnute } = moznosti;
  if (vypnute || (!ciel && !naKlik)) return {};

  const vyber =
    prostredie.vyber ??
    (() => (typeof window !== "undefined" ? (window.getSelection() as VyberTextu | null) : null));
  const otvorOkno =
    prostredie.otvorOkno ??
    ((href: string) => {
      if (typeof window !== "undefined") window.open(href, "_blank", "noopener");
    });

  const vykonaj = (v: VysledokKliku) => {
    if (v === "otvor") {
      if (naKlik) naKlik();
      else if (ciel) void router.navigate(ciel);
    } else if (v === "novaKarta" && ciel) {
      const loc = router.buildLocation(ciel);
      otvorOkno(loc.publicHref ?? loc.href);
    }
  };

  return {
    "data-klik-riadok": "",
    className: TRIEDA_KLIK_RIADKU,
    tabIndex: klavesnica ? 0 : undefined,
    onClick: (e) => {
      if (e.button !== 0) return;
      vykonaj(rozhodniKlik(e, vyber()));
    },
    onAuxClick: (e) => {
      if (e.button !== 1) return;
      const v = rozhodniKlik(e, vyber());
      if (v !== "nic") {
        e.preventDefault();
        vykonaj("novaKarta");
      }
    },
    // Stredné tlačidlo by inak zaplo automatické posúvanie stránky.
    onMouseDown: (e) => {
      if (e.button === 1 && ciel && !jeInteraktivny(e.target, e.currentTarget)) e.preventDefault();
    },
    onKeyDown: klavesnica
      ? (e) => {
          const v = rozhodniKlaves(e);
          if (v === "nic") return;
          e.preventDefault(); // medzerník by posunul stránku
          vykonaj(v);
        }
      : undefined,
  };
}

/**
 * Hook pre zoznamy: vráti funkciu, ktorá pre daný riadok zostaví props.
 * Volá sa raz v komponente zoznamu (nie v `.map`), funkcia sa potom volá
 * pre každý riadok:
 *
 *   const klik = useKlikNaRiadok();
 *   <tr {...klik({ to: "/faktury/$id", params: { id: r.id } })}>
 *
 * Ak riadok už má vlastný `className`, spoj ich: `cn(p.className, "…")`,
 * alebo použi `<KlikatelnyRiadok>`, ktorý to robí sám.
 */
export function useKlikNaRiadok() {
  const router = useRouter();
  return useCallback(
    (ciel: CielDetailu | null | undefined, moznosti?: MoznostiRiadku) =>
      propsKlikuNaRiadok(router as unknown as RouterPreRiadok, ciel, moznosti),
    [router],
  );
}

/** Najprv obsluha volajúceho, potom riadok — ak ju volajúci nezastavil (`preventDefault`). */
export function spoj<E extends { defaultPrevented: boolean }>(
  prva?: (e: E) => void,
  druha?: (e: E) => void,
): ((e: E) => void) | undefined {
  if (!prva) return druha;
  if (!druha) return prva;
  return (e) => {
    prva(e);
    if (!e.defaultPrevented) druha(e);
  };
}
