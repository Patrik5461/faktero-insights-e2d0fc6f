/**
 * Uložená relácia priamo z úložiska prehliadača.
 *
 * `getSession()` vo WebView občas neodpovie vôbec a appka by potom prihláseného
 * človeka posielala prihlásiť sa znova. Supabase si reláciu ukladá pod kľúčom
 * `sb-<projekt>-auth-token`, takže sa dá prečítať aj bez neho. Je to núdzová
 * cesta — nič sa ňou neoveruje, len sa appka nezasekne na prihlasovaní.
 */
import { citaj, klucePamate } from "./trvale-ulozisko";

export function nacitajUlozenuRelaciu(): { user?: { id: string; email?: string } } | null {
  try {
    // Najprv trvalé úložisko — v telefóne je jediné, o ktorom vieme, že
    // zatvorenie appky prežije. Prehliadačové sa prezrie ako druhé.
    for (const kluc of klucePamate()) {
      if (!/^sb-.*-auth-token$/.test(kluc)) continue;
      const relacia = rozober(citaj(kluc));
      if (relacia) return relacia;
    }
    if (typeof localStorage === "undefined") return null;
    for (let i = 0; i < localStorage.length; i++) {
      const kluc = localStorage.key(i);
      if (!kluc || !/^sb-.*-auth-token$/.test(kluc)) continue;
      const relacia = rozober(localStorage.getItem(kluc));
      if (relacia) return relacia;
    }
  } catch {
    /* poškodený obsah úložiska nie je dôvod appku zhodiť */
  }
  return null;
}

function rozober(surove: string | null): { user?: { id: string; email?: string } } | null {
  if (!surove) return null;
  try {
    const ulozene = JSON.parse(surove);
    const relacia = ulozene?.currentSession ?? ulozene;
    return relacia?.user?.id ? relacia : null;
  } catch {
    return null;
  }
}
