/*
  Predmet e-mailu nie je číslo faktúry.

  Doklad zaevidovaný z mailu, na ktorom AI číslo nenašla, dostával ako číslo
  predmet mailu („Fwd: FW: Dožiadanie_MaxiTicket s.r.o.“). Také „číslo“ potom
  išlo do Pohody aj do kontrolného výkazu. Z predmetu (a z mena súboru) sa
  teraz berie len to, čo naozaj vyzerá ako číslo dokladu.
*/

/** Predpony preposlaného/odpovedaného mailu: Fwd:, FW:, Re:, Odp:, AW:, WG:, TR:, VS:. */
const PREDPONA = /^\s*(?:(?:fwd?|fw|re|odp|aw|wg|tr|vs|sv|ref)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** Zhodí z predmetu Fwd:/Re:/… — aj opakované („Fwd: FW: …“). */
export function bezPredponMailu(text: string): string {
  return String(text ?? "")
    .replace(PREDPONA, "")
    .trim();
}

/** Vyzerá text ako predmet preposlaného či odpovedaného mailu? */
export function vyzeraAkoPredmetMailu(text: unknown): boolean {
  const t = String(text ?? "");
  return t.trim() !== "" && PREDPONA.test(t);
}

/** Token, ktorý vyzerá ako číslo dokladu — nie dátum ani obdobie. */
function jeCisloDokladu(token: string): boolean {
  if ((token.match(/\d/g) ?? []).length < 3) return false;
  if (!/^[A-Z]{0,5}[-/]?\d[\w\-/]*$/i.test(token)) return false;
  // Dátum („1.7.2026“, „2026-07-01“) a obdobie („08/2026“, „7/2026“) nie sú čísla dokladu.
  if (/^\d{1,2}[./-]\d{1,2}[./-](\d{2}|\d{4})$/.test(token)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return false;
  if (/^(0?[1-9]|1[0-2])[/.-](19|20)\d{2}$/.test(token)) return false;
  return true;
}

const SLOVO_DOKLADU =
  /(?:^|[^\p{L}])(?:fakt[uú]r\p{L}*|faktura|invoice|rechnung|fa|doklad\p{L}*|dobropis\p{L}*|vrubopis\p{L}*|[čc]\.|[čc]íslo|cislo|no\.|nr\.)(?![\p{L}])/iu;

/**
 * Číslo dokladu z predmetu mailu — len keď predmet hovorí o faktúre či
 * doklade a nesie token s aspoň tromi číslicami („Faktúra 2026123“,
 * „FA č. 26/0042“). „Elektronická faktúra za obdobie 1.7.2026“ číslo nemá.
 */
export function cisloZPredmetu(predmet: string | null | undefined): string | null {
  const t = bezPredponMailu(predmet ?? "");
  if (!t) return null;
  const tokeny = t
    .split(/[\s,;:()\[\]„“"']+/)
    .map((x) => x.replace(/[.\-/]+$/, ""))
    .filter(Boolean);
  // Celý predmet je jedno číslo („2026123“, „FV-2026/0042“).
  if (tokeny.length === 1) return jeCisloDokladu(tokeny[0]!) ? tokeny[0]!.slice(0, 60) : null;
  if (!SLOVO_DOKLADU.test(t)) return null;
  const najdene = tokeny.find(jeCisloDokladu);
  return najdene ? najdene.slice(0, 60) : null;
}

/**
 * Číslo dokladu z mena súboru — meno bez prípony, keď je to jedno slovo
 * s aspoň tromi číslicami („FA-2026123.pdf“), inak ako z predmetu.
 * „faktura.pdf“ či „Dožiadanie.pdf“ číslo nemajú.
 */
export function cisloZMenaSuboru(meno: string | null | undefined): string | null {
  const t = bezPredponMailu(String(meno ?? "").replace(/\.[a-z0-9]{2,5}$/i, "")).trim();
  if (!t) return null;
  if (!/\s/.test(t)) return (t.match(/\d/g) ?? []).length >= 3 ? t.slice(0, 60) : null;
  return cisloZPredmetu(t);
}
