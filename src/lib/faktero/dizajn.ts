/**
 * Rozloženie aplikácie — klasické Faktero alebo kompaktné (úzky pás ikon,
 * záložky sekcie, popisy polí v rámčeku, väčšie zaoblenia). Farby ostávajú
 * vždy Faktero. Nezávisí od svetlého či tmavého režimu (`motiv.ts`).
 *
 * Nasadzuje sa ako `data-dizajn` na `<html>`; tvary prepíše `styles.css`.
 * Voľba sa drží v `localStorage` (aby sa nasadila hneď, bez bliknutia) aj
 * v účte používateľa (aby platila na každom zariadení).
 */

export type Dizajn = "faktero" | "kompaktny";

export const KLUC_DIZAJNU = "faktero.dizajn";

export function jeDizajn(v: unknown): v is Dizajn {
  return v === "faktero" || v === "kompaktny";
}

/** Starší názov kompaktného rozloženia, ktorý môže ešte ležať v účte či prehliadači. */
export function normalizujDizajn(v: unknown): Dizajn | null {
  if (v === "doklado") return "kompaktny";
  return jeDizajn(v) ? v : null;
}

export function nacitajDizajn(): Dizajn {
  try {
    return normalizujDizajn(localStorage.getItem(KLUC_DIZAJNU)) ?? "faktero";
  } catch {
    return "faktero";
  }
}

export function nasadDizajn(d: Dizajn): void {
  try {
    if (d === "faktero") delete document.documentElement.dataset.dizajn;
    else document.documentElement.dataset.dizajn = d;
  } catch {
    /* bez DOM nie je čo nasadiť */
  }
}

/** Uloží voľbu na tomto zariadení, nasadí ju a pošle do účtu. */
export async function ulozDizajn(d: Dizajn): Promise<void> {
  try {
    localStorage.setItem(KLUC_DIZAJNU, d);
  } catch {
    /* súkromné okno — platí aspoň do zatvorenia */
  }
  nasadDizajn(d);
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.updateUser({ data: { dizajn: d } });
  } catch {
    /* bez prihlásenia ostane len na tomto zariadení */
  }
  window.dispatchEvent(new CustomEvent("faktero:dizajn", { detail: d }));
}

/**
 * Zosúladí zariadenie s účtom: kto si dizajn zmenil na inom počítači, má ho
 * po prihlásení aj tu.
 */
export async function zosuladDizajnSUctom(): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    const v = normalizujDizajn(data.user?.user_metadata?.dizajn);
    if (v && v !== nacitajDizajn()) {
      try {
        localStorage.setItem(KLUC_DIZAJNU, v);
      } catch {
        /* nič */
      }
      nasadDizajn(v);
      window.dispatchEvent(new CustomEvent("faktero:dizajn", { detail: v }));
    }
  } catch {
    /* offline — ostáva miestna voľba */
  }
}

/** Kúsok do skriptu v hlavičke — nasadí dizajn pred prvým vykreslením. */
export const SKRIPT_DIZAJNU = `(function(){try{var d=localStorage.getItem(${JSON.stringify(KLUC_DIZAJNU)});if(d==="kompaktny"||d==="doklado")document.documentElement.dataset.dizajn="kompaktny";}catch(e){}})();`;
