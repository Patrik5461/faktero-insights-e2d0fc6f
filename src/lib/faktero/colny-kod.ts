/*
  Colný kód tovaru — kombinovaná nomenklatúra (KN, anglicky CN): 8 číslic,
  prvých 6 je celosvetový HS kód. Pri vývoze mimo EÚ ho chce colné
  vyhlásenie aj obchodná faktúra, pri Intrastate sa podľa neho hlási.
  Ukladá sa len z číslic (6–10), ukazuje sa po skupinách „8517 13 00“.
*/

/** Z „8517.13.00“ / „8517 13 00“ spraví „85171300“; nezmysel vráti null. */
export function upravColnyKod(v: unknown): string | null {
  const s = String(v ?? "").replace(/[\s.\-/]/g, "");
  if (!s) return null;
  return /^\d{6,10}$/.test(s) ? s : null;
}

/** Je zadaná hodnota prázdna alebo platný kód? (na kontrolu vo formulári) */
export function jePlatnyColnyKod(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return !s || upravColnyKod(s) !== null;
}

/** „85171300“ → „8517 13 00“, „8517130000“ → „8517 13 00 00“. */
export function formatColnyKod(v: unknown): string {
  const s = upravColnyKod(v);
  if (!s) return "";
  return [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8), s.slice(8, 10)].filter(Boolean).join(" ");
}

/** Krajina pôvodu ako dvojpísmenový kód ISO (SK, CN, DE…); inak null. */
export function upravKrajinuPovodu(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** Hmotnosť v kg — kladné číslo s desatinnou čiarkou alebo bodkou; inak null. */
export function upravHmotnost(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
}

/** Riadok pod položkou na PDF — len to, čo je vyplnené. */
export function popisColnychUdajov(
  p: { colny_kod?: unknown; krajina_povodu?: unknown; hmotnost_kg?: unknown },
  t: { kod: string; povod: string; hmotnost: string } = {
    kod: "KN",
    povod: "pôvod",
    hmotnost: "hmotnosť",
  },
): string {
  const casti: string[] = [];
  const kod = formatColnyKod(p.colny_kod);
  if (kod) casti.push(`${t.kod} ${kod}`);
  const povod = upravKrajinuPovodu(p.krajina_povodu);
  if (povod) casti.push(`${t.povod} ${povod}`);
  const kg = upravHmotnost(p.hmotnost_kg);
  if (kg) casti.push(`${t.hmotnost} ${String(kg).replace(".", ",")} kg`);
  return casti.join(" · ");
}

/** Polia na zápis do databázy z voľného vstupu formulára. */
export function colneUdajeNaZapis(p: {
  colny_kod?: unknown;
  krajina_povodu?: unknown;
  hmotnost_kg?: unknown;
}) {
  return {
    colny_kod: upravColnyKod(p.colny_kod),
    krajina_povodu: upravKrajinuPovodu(p.krajina_povodu),
    hmotnost_kg: upravHmotnost(p.hmotnost_kg),
  };
}
