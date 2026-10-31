/**
 * Fokus v ručne kreslenom modálnom okne (`role="dialog"` + `aria-modal`).
 *
 * Radix si fokus drží sám. Ručne kreslené okná (`fixed inset-0` + panel) ho
 * nedržali: Tab z posledného tlačidla odišiel do stránky pod oknom, fokus po
 * otvorení ostal na tlačidle, ktoré okno otvorilo, a po zatvorení sa stratil
 * na `<body>`. Človek s klávesnicou či čítačkou tak „vypadol“ z okna.
 *
 * `drzFokusVOkne` to napraví bez úpravy samotných okien: fokus presunie do
 * okna, Tab a Shift+Tab točí dokola v ňom a po zatvorení vráti fokus tam,
 * odkiaľ sa okno otvorilo. Volá ho `useZatvorNaEscape`, ktorý majú všetky
 * ručne kreslené okná.
 */

const FOKUSOVATELNE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/** Index prvku, na ktorý má skočiť Tab (alebo Shift+Tab) — dokola. */
export function dalsiIndex(pocet: number, aktualny: number, spat: boolean): number {
  if (pocet <= 0) return -1;
  if (aktualny < 0) return spat ? pocet - 1 : 0;
  return spat ? (aktualny - 1 + pocet) % pocet : (aktualny + 1) % pocet;
}

function viditelny(el: HTMLElement): boolean {
  if (el.closest("[inert],[aria-hidden='true']")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0 || el.getClientRects().length > 0;
}

export function fokusovatelnePrvky(okno: HTMLElement): HTMLElement[] {
  return [...okno.querySelectorAll<HTMLElement>(FOKUSOVATELNE)].filter(viditelny);
}

/** Najvrchnejšie otvorené modálne okno v stránke (posledné v DOM). */
export function vrchneOkno(doc: Document = document): HTMLElement | null {
  const okna = doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return okna.length ? okna[okna.length - 1] : null;
}

/**
 * Presunie fokus do okna a drží ho v ňom. Vráti upratanie, ktoré fokus vráti
 * na pôvodný prvok. Ak by bolo nad oknom ďalšie (napr. Radix), Tab nechá jemu.
 */
export function drzFokusVOkne(okno: HTMLElement): () => void {
  const doc = okno.ownerDocument;
  const predtym = doc.activeElement as HTMLElement | null;

  if (!okno.contains(doc.activeElement)) {
    const prvy =
      okno.querySelector<HTMLElement>("[autofocus],[data-autofocus]") ??
      fokusovatelnePrvky(okno)[0];
    if (prvy) prvy.focus();
    else {
      if (!okno.hasAttribute("tabindex")) okno.setAttribute("tabindex", "-1");
      okno.focus();
    }
  }

  const naKlaves = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || vrchneOkno(doc) !== okno) return;
    const prvky = fokusovatelnePrvky(okno);
    if (!prvky.length) {
      e.preventDefault();
      return;
    }
    const i = prvky.indexOf(doc.activeElement as HTMLElement);
    const naKraji = e.shiftKey ? i <= 0 : i === -1 || i === prvky.length - 1;
    if (!naKraji) return; // vnútri okna nech Tab funguje normálne
    e.preventDefault();
    prvky[dalsiIndex(prvky.length, i, e.shiftKey)].focus();
  };
  doc.addEventListener("keydown", naKlaves, true);

  return () => {
    doc.removeEventListener("keydown", naKlaves, true);
    // Fokus späť, len ak ostal v zatváranom okne alebo na <body> (nie keď ho
    // medzitým niekto presunul inam, napr. do ďalšieho okna).
    const kde = doc.activeElement;
    const strateny = !kde || kde === doc.body || okno.contains(kde) || !kde.isConnected;
    if (strateny && predtym && predtym.isConnected && predtym !== doc.body) {
      predtym.focus({ preventScroll: true });
    }
  };
}
