import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Na ktorej strane je náhľad dokladu (PDF, sken bločku) vedľa formulára,
 * detailu alebo zoznamu. Jedna voľba používateľa pre všetky obrazovky:
 * bloček, prijatá a vystavená faktúra, Nespracované doklady, náhľad vedľa
 * zoznamu.
 *
 * Drží sa ako dizajn aplikácie (`dizajn.ts`): v `localStorage`, aby platila
 * hneď bez bliknutia, a v metadátach účtu (`strana_nahladu`), aby platila na
 * každom zariadení. Predvolene je náhľad vľavo — tak to bolo všade doteraz.
 *
 * Na úzkej obrazovke sú stĺpce pod sebou: „vľavo“ znamená náhľad hore,
 * „vpravo“ náhľad dole (poradie v DOM sa riadi voľbou).
 */
export type StranaNahladu = "vlavo" | "vpravo";

export const PREDVOLENA_STRANA: StranaNahladu = "vlavo";
export const KLUC_STRANY = "faktero.stranaNahladu";
export const UDALOST_STRANY = "faktero:strana-nahladu";

export function normalizujStranu(v: unknown): StranaNahladu | null {
  return v === "vlavo" || v === "vpravo" ? v : null;
}

export function opacnaStrana(s: StranaNahladu): StranaNahladu {
  return s === "vlavo" ? "vpravo" : "vlavo";
}

export function nacitajStranu(): StranaNahladu {
  try {
    return normalizujStranu(window.localStorage.getItem(KLUC_STRANY)) ?? PREDVOLENA_STRANA;
  } catch {
    return PREDVOLENA_STRANA;
  }
}

function oznam(s: StranaNahladu) {
  try {
    window.dispatchEvent(new CustomEvent(UDALOST_STRANY, { detail: s }));
  } catch {
    /* bez okna nie je komu oznámiť */
  }
}

function ulozMiestne(s: StranaNahladu) {
  try {
    window.localStorage.setItem(KLUC_STRANY, s);
  } catch {
    /* súkromné okno — platí aspoň do obnovenia stránky */
  }
}

/** Uloží voľbu na tomto zariadení, oznámi ju otvoreným obrazovkám a pošle do účtu. */
export async function ulozStranu(s: StranaNahladu): Promise<void> {
  ulozMiestne(s);
  oznam(s);
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.updateUser({ data: { strana_nahladu: s } });
  } catch {
    /* bez prihlásenia či offline ostane len na tomto zariadení */
  }
}

let zosuladene = false;

/**
 * Raz za načítanie stránky prevezme voľbu z účtu — kto si stranu zmenil na
 * inom počítači, má ju po prihlásení aj tu.
 */
export async function zosuladStranuSUctom(): Promise<void> {
  if (zosuladene) return;
  zosuladene = true;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    const v = normalizujStranu(data.user?.user_metadata?.strana_nahladu);
    if (v && v !== nacitajStranu()) {
      ulozMiestne(v);
      oznam(v);
    }
  } catch {
    zosuladene = false;
  }
}

/** Len pre testy — aby sa zosúladenie dalo skúsiť znova. */
export function _resetZosuladenia() {
  zosuladene = false;
}

export function odoberajStranu(zmena: () => void): () => void {
  const priUdalosti = () => zmena();
  const priUlozisku = (e: StorageEvent) => {
    if (e.key === KLUC_STRANY) zmena();
  };
  window.addEventListener(UDALOST_STRANY, priUdalosti);
  window.addEventListener("storage", priUlozisku);
  return () => {
    window.removeEventListener(UDALOST_STRANY, priUdalosti);
    window.removeEventListener("storage", priUlozisku);
  };
}

/**
 * Strana náhľadu pre komponent. Všetky obrazovky aj prepínač v Nastaveniach
 * zdieľajú tú istú hodnotu, zmena sa prejaví hneď všade (aj v inej karte).
 */
export function useStranaNahladu() {
  const strana = useSyncExternalStore(odoberajStranu, nacitajStranu, () => PREDVOLENA_STRANA);
  useEffect(() => {
    void zosuladStranuSUctom();
  }, []);
  const zmen = useCallback((s: StranaNahladu) => void ulozStranu(s), []);
  const prepni = useCallback(() => void ulozStranu(opacnaStrana(nacitajStranu())), []);
  return { strana, zmen, prepni };
}
