/*
  Export prijatých do Pohody s upozorneniami: server najprv vráti `varovania`
  bez súboru, človek ich uvidí v okne a export potvrdí — až potom sa súbor
  vyrobí (`potvrdene_varovania`). Zrušenie = nič sa nevyvezie.
*/
import { potvrd } from "@/lib/potvrdenie";

type Vysledok = { varovania?: string[] } & Record<string, any>;

export async function exportSPotvrdenim<T extends Vysledok>(
  volaj: (potvrdene: boolean) => Promise<T>,
  t: (s: string, p?: Record<string, string | number>) => string,
): Promise<T | null> {
  const prvy = await volaj(false);
  const varovania = prvy.varovania ?? [];
  if (!varovania.length) return prvy;
  const zoznam = varovania.slice(0, 8).map((v) => `• ${v}`).join("\n");
  const viac = varovania.length > 8 ? `\n${t("…a ďalšie ({n})", { n: varovania.length - 8 })}` : "";
  const ok = await potvrd(
    `${t("Pred exportom do Pohody skontrolujte:")}\n\n${zoznam}${viac}\n\n${t("Exportovať aj tak?")}`,
    { potvrdit: t("Exportovať aj tak"), zrusit: t("Opravím to"), nebezpecne: false },
  );
  if (!ok) return null;
  return volaj(true);
}
