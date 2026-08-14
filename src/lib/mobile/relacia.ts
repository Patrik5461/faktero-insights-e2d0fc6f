/**
 * Uložená relácia priamo z úložiska prehliadača.
 *
 * `getSession()` vo WebView občas neodpovie vôbec a appka by potom prihláseného
 * človeka posielala prihlásiť sa znova. Supabase si reláciu ukladá pod kľúčom
 * `sb-<projekt>-auth-token`, takže sa dá prečítať aj bez neho. Je to núdzová
 * cesta — nič sa ňou neoveruje, len sa appka nezasekne na prihlasovaní.
 */
export function nacitajUlozenuRelaciu(): { user?: { id: string; email?: string } } | null {
  try {
    if (typeof localStorage === "undefined") return null;
    for (let i = 0; i < localStorage.length; i++) {
      const kluc = localStorage.key(i);
      if (!kluc || !/^sb-.*-auth-token$/.test(kluc)) continue;
      const surove = localStorage.getItem(kluc);
      if (!surove) continue;
      const ulozene = JSON.parse(surove);
      const relacia = ulozene?.currentSession ?? ulozene;
      if (relacia?.user?.id) return relacia;
    }
  } catch {
    /* poškodený obsah úložiska nie je dôvod appku zhodiť */
  }
  return null;
}
