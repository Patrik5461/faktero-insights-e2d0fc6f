import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  jeTah,
  nacitajPolohu,
  ohranicPolohu,
  ulozPolohu,
  type Poloha,
} from "@/lib/faktero/ai-okno-poloha";

const useIzomorfnyLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Moznosti = {
  /** Kľúč v localStorage, kde sa poloha pamätá. */
  kluc: string;
  /** Vypnuté (úzka obrazovka): žiadne ťahanie a uložená poloha sa nepoužije. */
  povolene: boolean;
  /** Stlačenie na tlačidle vnútri úchytu (zavrieť, minimalizovať…) ťahanie nezačne. */
  ignorujTlacidla?: boolean;
};

/**
 * Presúvanie plávajúceho prvku ťahaním za úchyt, myšou aj dotykom (pointer
 * events). Poloha sa pamätá v localStorage a pri zmene veľkosti prehliadača
 * (alebo prvku) sa prvok udrží na obrazovke.
 *
 * Klik a ťahanie sa nepletú: ťahanie začne až po pohybe o pár pixelov a klik,
 * ktorý príde po ťahaní, treba zahodiť cez `boloTahanie()`.
 */
export function usePresuvanie({ kluc, povolene, ignorujTlacidla }: Moznosti) {
  const [ulozena, setUlozena] = useState<Poloha | null>(null);
  // Presúvaný prvok (s `position: fixed`), z neho sa berie veľkosť. Callback ref,
  // aby sa sledovanie veľkosti presunulo na nový prvok, keď sa znova pripojí.
  const prvok = useRef<HTMLElement | null>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const nastavPrvok = useCallback((n: HTMLElement | null) => {
    prvok.current = n;
    setEl(n);
  }, []);
  const tah = useRef<{
    id: number;
    startX: number;
    startY: number;
    odX: number;
    odY: number;
    tahame: boolean;
  } | null>(null);
  const poTahu = useRef(false);

  // localStorage až v prehliadači, aby sa server a prvé vykreslenie zhodli;
  // pred vykreslením, aby okno neprebliklo na pôvodnom mieste.
  useIzomorfnyLayoutEffect(() => {
    setUlozena(nacitajPolohu(kluc));
  }, [kluc]);

  const poloha = povolene ? ulozena : null;
  const mamePolohu = poloha !== null;

  const ohranic = useCallback((p: Poloha): Poloha => {
    const r = prvok.current?.getBoundingClientRect();
    const rozmer = r ? { sirka: r.width, vyska: r.height } : { sirka: 0, vyska: 0 };
    return ohranicPolohu(p, rozmer, { sirka: window.innerWidth, vyska: window.innerHeight });
  }, []);

  // Zmenšené okno prehliadača alebo okno chatu, ktoré narástlo o nové správy.
  useEffect(() => {
    if (!mamePolohu) return;
    const prepocitaj = () =>
      setUlozena((p) => {
        if (!p) return p;
        const n = ohranic(p);
        return n.x === p.x && n.y === p.y ? p : n;
      });
    prepocitaj();
    window.addEventListener("resize", prepocitaj);
    const sledovac =
      el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(prepocitaj) : null;
    if (el) sledovac?.observe(el);
    return () => {
      window.removeEventListener("resize", prepocitaj);
      sledovac?.disconnect();
    };
    // Stačí sledovať, či je poloha zadaná; súradnice by obnovovali poslucháčov pri každom pohybe.
  }, [mamePolohu, ohranic, el]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      poTahu.current = false;
      if (!povolene || e.button !== 0) return;
      if (ignorujTlacidla && (e.target as HTMLElement).closest("button")) return;
      const r = prvok.current?.getBoundingClientRect();
      if (!r) return;
      tah.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        odX: r.left,
        odY: r.top,
        tahame: false,
      };
    },
    [povolene, ignorujTlacidla],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const t = tah.current;
      if (!t || t.id !== e.pointerId) return;
      const dx = e.clientX - t.startX;
      const dy = e.clientY - t.startY;
      if (!t.tahame) {
        if (!jeTah(dx, dy)) return;
        t.tahame = true;
        // Ťahaný prvok chytá pohyby, aj keď ukazovateľ ujde mimo neho.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Starší prehliadač bez capture: ťahá sa, kým je ukazovateľ nad prvkom.
        }
      }
      setUlozena(ohranic({ x: t.odX + dx, y: t.odY + dy }));
    },
    [ohranic],
  );

  const skonci = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const t = tah.current;
      if (!t || t.id !== e.pointerId) return;
      tah.current = null;
      if (!t.tahame) return;
      poTahu.current = true;
      const konecna = ohranic({
        x: t.odX + e.clientX - t.startX,
        y: t.odY + e.clientY - t.startY,
      });
      setUlozena(konecna);
      ulozPolohu(kluc, konecna);
    },
    [kluc, ohranic],
  );

  /** Vráti prvok na pôvodné miesto a zabudne uloženú polohu. */
  const vratit = useCallback(() => {
    setUlozena(null);
    ulozPolohu(kluc, null);
  }, [kluc]);

  /** Bol posledný úkon ťahaním? Klik po ňom sa má zahodiť. Volanie príznak zmaže. */
  const boloTahanie = useCallback(() => {
    const bolo = poTahu.current;
    poTahu.current = false;
    return bolo;
  }, []);

  return {
    poloha,
    prvok,
    nastavPrvok,
    vratit,
    boloTahanie,
    uchyt: {
      onPointerDown,
      onPointerMove,
      onPointerUp: skonci,
      onPointerCancel: skonci,
    },
  };
}
