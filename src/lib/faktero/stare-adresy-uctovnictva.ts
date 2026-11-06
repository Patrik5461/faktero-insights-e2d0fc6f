/**
 * Staré adresy sekcie Účtovníctvo (pred zlúčením stránok 2026-11) a kam vedú.
 *
 * Staré trasy ostávajú ako presmerovacie súbory — odkazy v starých e-mailoch,
 * záložky v prehliadači, notifikácie aj PravidloZDokladu so svojimi
 * parametrami (`novy`, `nazov`, `ico`, …) nesmú skončiť na slepej adrese ani
 * prísť o predvyplnenie. Preto sa **všetky** parametre prenášajú a pridá sa
 * len `tab`.
 */
export type CielPresmerovania = { to: string; search: Record<string, unknown> };

const bezPrazdnych = (s: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => v !== undefined));

export function presmerovanieZauctovania(
  tab: "kontrola" | "pravidla",
  search: Record<string, unknown>,
): CielPresmerovania {
  return { to: "/uctovnictvo/zauctovanie", search: { ...bezPrazdnych(search), tab } };
}

/** Konvertor Excel a výpis do Pohody; `?zdroj=brana` je záložka platobnej brány. */
export function presmerovanieKonvertora(
  odkial: "konvertor" | "vypis",
  search: Record<string, unknown>,
): CielPresmerovania {
  const { zdroj, ...ostatne } = bezPrazdnych(search);
  const tab = odkial === "konvertor" ? "excel" : zdroj === "brana" ? "brana" : "vypis";
  return {
    to: "/uctovnictvo/konvertory",
    // Iný `zdroj` než brána nikdy neexistoval; ak by prišiel, nech nezmizne.
    search: { ...ostatne, ...(zdroj !== undefined && zdroj !== "brana" ? { zdroj } : {}), tab },
  };
}

export function presmerovanieImportov(search: Record<string, unknown>): CielPresmerovania {
  return { to: "/importy/novy", search: { ...bezPrazdnych(search), tab: "historia" } };
}

/** Prevod starých adries na nové aj s parametrami — pre odkazy v texte (e-maily, notifikácie). */
export function novaAdresaUctovnictva(href: string): string {
  const [cesta = "", dotaz = ""] = href.split("?");
  const p = Object.fromEntries(new URLSearchParams(dotaz));
  let ciel: CielPresmerovania | null = null;
  if (cesta === "/uctovnictvo/na-kontrolu") ciel = presmerovanieZauctovania("kontrola", p);
  else if (cesta === "/uctovnictvo/pravidla") ciel = presmerovanieZauctovania("pravidla", p);
  else if (cesta === "/uctovnictvo/konvertor") ciel = presmerovanieKonvertora("konvertor", p);
  else if (cesta === "/uctovnictvo/vypis-do-pohody") ciel = presmerovanieKonvertora("vypis", p);
  else if (cesta === "/importy" || cesta === "/importy/") ciel = presmerovanieImportov(p);
  if (!ciel) return href;
  const q = new URLSearchParams(
    Object.entries(ciel.search).map(([k, v]) => [k, String(v)]),
  ).toString();
  return q ? `${ciel.to}?${q}` : ciel.to;
}
