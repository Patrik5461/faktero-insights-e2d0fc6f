import { citaj, zapis } from "./trvale-ulozisko";

/**
 * Prečo appka pri štarte vyhlásila, že nikto nie je prihlásený.
 *
 * Zvonku vyzerá „appka sa sama odhlásila" vždy rovnako, ale vetiev, ktoré k
 * tomu vedú, je niekoľko a z diagnostiky sa dosiaľ nedalo rozoznať ani jedna.
 * Z relácií na serveri pritom vidno, že token sa **úspešne obnovil** a appka
 * napriek tomu poslala človeka na prihlasovaciu obrazovku — teda relácia
 * neprepadla, len sme sa jej spýtali zle alebo priskoro.
 */
export type StopaPrihlasenia = {
  kedy: number;
  /** Čo povedalo `getSession()`: relácia / prázdno / strop / chyba. */
  overenie: string;
  /** Druhý pokus po dočítaní úložiska. */
  druhyPokus?: string;
  /** Či v úložisku vôbec ležal kľúč s reláciou. */
  ulozisko: string;
  /** Ako to dopadlo. */
  vysledok: "pustená dnu" | "poslaná na prihlásenie" | "dobehla neskôr";
};

const KLUC = "faktero.diag.prihlasenie";

export function zapisStopu(s: StopaPrihlasenia): void {
  try {
    zapis(KLUC, JSON.stringify(s));
  } catch {
    /* diagnostika nikdy nesmie zhodiť štart */
  }
}

export function nacitajStopu(): StopaPrihlasenia | null {
  try {
    const s = citaj(KLUC);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function popisStopy(s: StopaPrihlasenia | null): string {
  if (!s) return "zatiaľ nezaznamenané";
  const kedy = new Date(s.kedy).toLocaleString("sk-SK");
  const casti = [s.vysledok, `overenie: ${s.overenie}`];
  if (s.druhyPokus) casti.push(`druhý pokus: ${s.druhyPokus}`);
  casti.push(`úložisko: ${s.ulozisko}`);
  return `${kedy} — ${casti.join(", ")}`;
}
