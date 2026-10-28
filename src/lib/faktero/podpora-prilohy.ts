/**
 * Prílohy k požiadavke v help desku — snímka obrazovky, fotka z mobilu, PDF.
 *
 * Pravidlá platia rovnako v prehliadači aj na serveri: človek sa o zamietnutom
 * súbore dozvie hneď pri výbere, nie až po odoslaní, a server ich aj tak
 * overí znova (prehliadaču sa veriť nedá).
 */

/** 10 MB na súbor — toľko znesie aj kôš `podpora-prilohy`. */
export const MAX_PRILOHA_PODPORY = 10 * 1024 * 1024;

/** Najviac súborov naraz pri jednom hlásení. */
export const MAX_PRILOH_NARAZ = 5;

/** Strop na celú požiadavku — aby sa vlákno nestalo úložiskom. */
export const MAX_PRILOH_NA_POZIADAVKU = 20;

/** Kôš v úložisku; súkromný, číta a píše doň len server. */
export const KOS_PODPORY = "podpora-prilohy";

/** Čo sa dá priložiť: obrázky (aj HEIC z iPhonu) a PDF. */
export const TYPY_PODPORY: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/** Prípony, ktoré sa k typu ešte hlásia, hoci ich `TYPY_PODPORY` nepíše. */
const DALSIE_PRIPONY: Record<string, string> = { jpeg: "image/jpeg" };

/** Hodnota `accept` pre pole na výber súboru. */
export const ACCEPT_PODPORY = [
  ...Object.keys(TYPY_PODPORY),
  ...Object.values(TYPY_PODPORY).map((p) => `.${p}`),
  ".jpeg",
].join(",");

/**
 * Typ súboru — z MIME, a keď ho prehliadač nepošle alebo pošle
 * `application/octet-stream` (bežné pri .heic), tak z prípony.
 */
export function typPrilohyPodpory(mime: string, nazov: string): string | null {
  const m = (mime || "").toLowerCase().split(";")[0]!.trim();
  if (TYPY_PODPORY[m]) return m;
  const pripona = (nazov || "").toLowerCase().split(".").pop() ?? "";
  if (DALSIE_PRIPONY[pripona]) return DALSIE_PRIPONY[pripona]!;
  const podlaPripony = Object.entries(TYPY_PODPORY).find(([, p]) => p === pripona);
  return podlaPripony ? podlaPripony[0] : null;
}

/** Je to obrázok, ktorý prehliadač vie ukázať ako náhľad? HEIC väčšinou nie. */
export function jeNahladovyObrazok(mime: string | null): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
}

export type ChybaPrilohy =
  | { kod: "vela"; max: number }
  | { kod: "prazdny"; nazov: string }
  | { kod: "velky"; nazov: string }
  | { kod: "typ"; nazov: string };

/**
 * Prečo sa súbor priložiť nedá — alebo `null`, keď je v poriadku.
 * Vracia kód, nie hotovú vetu: text si okno preloží samo.
 */
export function chybaPrilohyPodpory(
  subor: { name: string; size: number; type: string },
  uzJeIch: number,
  max = MAX_PRILOH_NARAZ,
): ChybaPrilohy | null {
  if (uzJeIch >= max) return { kod: "vela", max };
  if (!subor.size) return { kod: "prazdny", nazov: subor.name };
  if (subor.size > MAX_PRILOHA_PODPORY) return { kod: "velky", nazov: subor.name };
  if (!typPrilohyPodpory(subor.type, subor.name)) return { kod: "typ", nazov: subor.name };
  return null;
}

/**
 * Rozdelí vybrané súbory na prijaté a odmietnuté. Počíta s tými, ktoré už
 * v okne sú — piaty súbor prejde, šiesty sa odmietne.
 */
export function roztriedPrilohy<T extends { name: string; size: number; type: string }>(
  nove: T[],
  uzJeIch: number,
  max = MAX_PRILOH_NARAZ,
): { prijate: T[]; chyby: ChybaPrilohy[] } {
  const prijate: T[] = [];
  const chyby: ChybaPrilohy[] = [];
  for (const s of nove) {
    const ch = chybaPrilohyPodpory(s, uzJeIch + prijate.length, max);
    if (ch) {
      // Hlásenie o prekročenom počte stačí raz.
      if (ch.kod !== "vela" || !chyby.some((c) => c.kod === "vela")) chyby.push(ch);
    } else prijate.push(s);
  }
  return { prijate, chyby };
}

/**
 * Snímka vložená zo schránky (Ctrl+V) prichádza ako „image.png" — pri viacerých
 * by sa nedali rozlíšiť, tak dostane meno s časom.
 */
export function menoVlozenejSnimky(mime: string, teraz: Date = new Date()): string {
  const p = TYPY_PODPORY[mime] ?? "png";
  const d = (n: number) => String(n).padStart(2, "0");
  return `snimka-${teraz.getFullYear()}${d(teraz.getMonth() + 1)}${d(teraz.getDate())}-${d(
    teraz.getHours(),
  )}${d(teraz.getMinutes())}${d(teraz.getSeconds())}.${p}`;
}

/**
 * Cesta v koši. Pôvodný názov (diakritika, medzery) drží databáza; v kľúči
 * je náhodné meno pod priečinkom požiadavky.
 */
export function cestaPrilohyPodpory(poziadavkaId: string, mime: string): string {
  return `${poziadavkaId}/${crypto.randomUUID()}.${TYPY_PODPORY[mime] ?? "bin"}`;
}
