/*
  Ručný export do Pohody s upozorneniami: server najprv vráti `zavazne`
  (bývalé prekážky — doklad by Pohoda mohla zaúčtovať zle) a `varovania`
  bez súboru, človek ich uvidí v okne a export potvrdí — až potom sa súbor
  vyrobí (`potvrdene_varovania`) aj s dokladmi, ktoré majú závažnú chybu
  (Patrik 13. 11. 2026). Zrušenie = nič sa nevyvezie.
*/
import { potvrd } from "@/lib/potvrdenie";

type Vysledok = { varovania?: string[]; zavazne?: string[] } & Record<string, any>;
type T = (s: string, p?: Record<string, string | number>) => string;

const STROP = 8;

function zoznam(riadky: string[], t: T): string {
  const r = riadky.slice(0, STROP).map((v) => `• ${v}`).join("\n");
  return riadky.length > STROP ? `${r}\n${t("…a ďalšie ({n})", { n: riadky.length - STROP })}` : r;
}

/** Text okna — prvý riadok je nadpis, „Závažné“ pred „Upozornenia“. */
export function textPotvrdeniaExportu(zavazne: string[], varovania: string[], t: T): string {
  const casti: string[] = [t("Pred exportom do Pohody skontrolujte:")];
  if (zavazne.length)
    casti.push(`${t("Závažné ({n}) — Pohoda tieto doklady môže zaúčtovať zle:", { n: zavazne.length })}\n${zoznam(zavazne, t)}`);
  if (varovania.length)
    casti.push(`${t("Upozornenia ({n}):", { n: varovania.length })}\n${zoznam(varovania, t)}`);
  casti.push(t("Exportovať aj tak?"));
  return casti.join("\n\n");
}

export async function exportSPotvrdenim<R extends Vysledok>(
  volaj: (potvrdene: boolean) => Promise<R>,
  t: T,
): Promise<R | null> {
  const prvy = await volaj(false);
  const zavazne = prvy.zavazne ?? [];
  const varovania = prvy.varovania ?? [];
  if (!zavazne.length && !varovania.length) return prvy;
  const ok = await potvrd(textPotvrdeniaExportu(zavazne, varovania, t), {
    potvrdit: t("Exportovať aj tak"),
    zrusit: t("Opravím to"),
    nebezpecne: false,
  });
  if (!ok) return null;
  return volaj(true);
}
