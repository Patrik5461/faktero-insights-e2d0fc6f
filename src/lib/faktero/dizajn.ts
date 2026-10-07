/**
 * Dizajn aplikácie — Faktero (zelený) alebo „ako v Doklado" (modrý, väčšie
 * zaoblenia, modrošedé pozadie). Nezávisí od svetlého či tmavého režimu
 * (`motiv.ts`): ten rozhoduje o tme, toto o farbách a tvaroch.
 *
 * Nasadzuje sa ako `data-dizajn` na `<html>`; farby prepíše `styles.css`.
 * Voľba sa drží v `localStorage` (aby sa nasadila hneď, bez bliknutia) aj
 * v účte používateľa (aby platila na každom zariadení).
 */

export type Dizajn = "faktero" | "doklado";

export const KLUC_DIZAJNU = "faktero.dizajn";

export function jeDizajn(v: unknown): v is Dizajn {
  return v === "faktero" || v === "doklado";
}

export function nacitajDizajn(): Dizajn {
  try {
    const v = localStorage.getItem(KLUC_DIZAJNU);
    return jeDizajn(v) ? v : "faktero";
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
    const v = data.user?.user_metadata?.dizajn;
    if (jeDizajn(v) && v !== nacitajDizajn()) {
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
export const SKRIPT_DIZAJNU = `(function(){try{var d=localStorage.getItem(${JSON.stringify(KLUC_DIZAJNU)});if(d==="doklado")document.documentElement.dataset.dizajn=d;}catch(e){}})();`;
