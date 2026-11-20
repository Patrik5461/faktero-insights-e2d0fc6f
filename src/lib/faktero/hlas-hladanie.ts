/*
  Hľadanie pre hlasové ovládanie — čisté funkcie (server aj testy).

  Prepis reči má chyby („Orendž“, „orange slovensko a s“, bez diakritiky),
  preto sa názov partnera ani firmy neporovnáva presne: bez diakritiky, bez
  právnej formy, po slovách, časť slova stačí a pár preklepov sa odpustí.
*/

/* Spoločné s hlavným hľadaním v hlavičke (`hladanie-text.ts`). */
import { normalizuj, slovaNazvu } from "./hladanie-text";
export { normalizuj, slovaNazvu };

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let pred = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const akt = [i];
    for (let j = 1; j <= b.length; j++)
      akt[j] = Math.min(akt[j - 1] + 1, pred[j] + 1, pred[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    pred = akt;
  }
  return pred[b.length];
}

/** Hlásky, ktoré prepis zamieňa (Tobify → tobifi, Wolt → volt, Philips → filips). */
function zjednotHlasky(s: string): string {
  return s
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/x/g, "ks");
}

function podobnostSlov(q0: string, t0: string): number {
  if (t0 === q0) return 1;
  const q = zjednotHlasky(q0);
  const t = zjednotHlasky(t0);
  if (t === q) return 0.97;
  if (q.length >= 3 && t.startsWith(q)) return 0.95;
  if (q.length >= 4 && t.includes(q)) return 0.9;
  const cele = 1 - levenshtein(q, t) / Math.max(q.length, t.length);
  // Začiatok dlhšieho slova („orang“ ~ „orange“, „telekom“ ~ „telekomunikacie“).
  const zaciatok =
    t.length > q.length ? 1 - levenshtein(q, t.slice(0, q.length)) / q.length - 0.05 : 0;
  return Math.max(cele, q.length >= 4 ? zaciatok : 0);
}

/** Hranica, od ktorej sa názov berie ako zhoda. */
export const PRAH_ZHODY = 0.75;

/**
 * Ako dobre sedí dotaz na názov (0–1). Každé slovo dotazu hľadá najlepšie
 * slovo názvu; výsledok je priemer, ale jedno úplne cudzie slovo ho zrazí.
 */
export function skoreZhody(dotaz: string, nazov: string | null | undefined): number {
  const nd = normalizuj(dotaz);
  const nn = normalizuj(nazov);
  if (!nd || !nn) return 0;
  if (nd.length >= 2 && (` ${nn} `.includes(` ${nd} `) || nn === nd)) return 1;
  const kd = nd.replace(/ /g, "");
  if (kd.length >= 4 && nn.replace(/ /g, "").includes(kd)) return 0.97;
  const q = slovaNazvu(dotaz);
  const t = slovaNazvu(nazov);
  if (!q.length || !t.length) return 0;
  const najlepsie = q.map((x) => Math.max(...t.map((y) => podobnostSlov(x, y))));
  const priemer = najlepsie.reduce((a, b) => a + b, 0) / najlepsie.length;
  return Math.min(priemer, Math.min(...najlepsie) + 0.25);
}

/* ---------- Doklady ---------- */

export type RiadokHladania = {
  id: string;
  cislo: string | null;
  partner: string | null;
  suma: number | null;
  mena: string | null;
  datum: string | null;
  splatnost?: string | null;
  vs?: string | null;
  /** null = neuhrádza sa (bloček, ponuka). */
  uhradena?: boolean | null;
  zauctovana?: boolean | null;
};

export type StavHladania = "vsetky" | "neuhradene" | "po_splatnosti" | "nezauctovane";

export type FilterHladania = {
  partner?: string | null;
  cislo?: string | null;
  suma?: number | null;
  datumOd?: string | null;
  datumDo?: string | null;
  stav?: StavHladania;
};

const alnum = (s: string | null | undefined) => normalizuj(s).replace(/ /g, "");

export function sedySuma(hladana: number, suma: number | null | undefined): boolean {
  if (suma == null || !Number.isFinite(hladana)) return false;
  const a = Math.abs(Number(suma));
  const h = Math.abs(hladana);
  return Math.abs(a - h) <= Math.max(0.5, h * 0.01);
}

/**
 * Doklady podľa filtra — najlepšia zhoda partnera hore, potom najnovšie.
 * `dnes` (YYYY-MM-DD) pre „po splatnosti“.
 */
export function filtrujDoklady<T extends RiadokHladania>(
  riadky: T[],
  f: FilterHladania,
  dnes: string,
): (T & { skore: number })[] {
  const out: (T & { skore: number })[] = [];
  const cislo = f.cislo ? alnum(f.cislo) : "";
  for (const r of riadky) {
    if (f.datumOd && (!r.datum || r.datum < f.datumOd)) continue;
    if (f.datumDo && (!r.datum || r.datum > f.datumDo)) continue;
    if (f.suma != null && !sedySuma(f.suma, r.suma)) continue;
    if (cislo && !(alnum(r.cislo).includes(cislo) || alnum(r.vs).includes(cislo))) continue;
    if (f.stav === "neuhradene" && r.uhradena !== false) continue;
    if (f.stav === "po_splatnosti" && !(r.uhradena === false && r.splatnost && r.splatnost < dnes))
      continue;
    if (f.stav === "nezauctovane" && r.zauctovana !== false) continue;
    let skore = 1;
    if (f.partner && f.partner.trim()) {
      skore = skoreZhody(f.partner, r.partner);
      // Číslo dokladu povedané namiesto mena („faktúra dvestopäť“).
      if (
        skore < PRAH_ZHODY &&
        alnum(f.partner).length >= 3 &&
        alnum(r.cislo).includes(alnum(f.partner))
      )
        skore = 0.8;
      if (skore < PRAH_ZHODY) continue;
    }
    out.push({ ...r, skore });
  }
  return out.sort(
    (a, b) => b.skore - a.skore || String(b.datum ?? "").localeCompare(String(a.datum ?? "")),
  );
}

/* ---------- Obdobia ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

export function obdobieMesiaca(rok: number, mesiac: number): { od: string; do: string } {
  const posledny = new Date(Date.UTC(rok, mesiac, 0)).getUTCDate();
  return { od: `${rok}-${pad(mesiac)}-01`, do: `${rok}-${pad(mesiac)}-${pad(posledny)}` };
}

const NAZVY_DNI = ["nedeľa", "pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota"];

/**
 * Hotové obdobia pre model — Haiku sa v kalendári mýli, tak ich dostane
 * vypočítané („minulý mesiac“, „tento rok“, mesiac bez roka).
 */
export function obdobiaPreModel(dnes: string): string {
  const [r, m] = dnes.split("-").map(Number);
  const tento = obdobieMesiaca(r, m);
  const minuly = m === 1 ? obdobieMesiaca(r - 1, 12) : obdobieMesiaca(r, m - 1);
  const den = NAZVY_DNI[new Date(`${dnes}T12:00:00Z`).getUTCDay()];
  return [
    `Dnes je ${dnes} (${den}).`,
    `Tento mesiac: ${tento.od} až ${tento.do}. Minulý mesiac: ${minuly.od} až ${minuly.do}.`,
    `Tento rok: ${r}-01-01 až ${r}-12-31. Minulý rok: ${r - 1}-01-01 až ${r - 1}-12-31.`,
    `Mesiac bez roka („za október“) = posledný taký mesiac, ktorý už začal (mesiac ≤ ${m} → rok ${r}, inak rok ${r - 1}).`,
  ].join("\n");
}

/* ---------- Firmy (prepínanie) ---------- */

export type FirmaNaVyber = {
  id: string;
  name: string;
  ico?: string | null;
  testovacia_pre?: string | null;
};

/**
 * Firma podľa vysloveného názvu alebo IČO. Testovaciu („Test – …“) vyberie
 * len vtedy, keď človek povie „test/testovaciu“; inak má prednosť skutočná.
 * `presna` = jednoznačná voľba, inak `kandidati` na výber v paneli.
 */
export function najdiFirmu<F extends FirmaNaVyber>(
  firmy: F[],
  dotaz: string,
): { presna: F | null; kandidati: F[] } {
  const nd = normalizuj(dotaz);
  const chceTest = /\btest/.test(nd);
  const bezTestu = nd
    .replace(/\btest\w*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const ico = dotaz.replace(/\D/g, "");
  const ohodnotene = firmy
    .map((f) => {
      const meno = String(f.name ?? "").replace(/^Test\s*[–-]\s*/i, "");
      let skore = bezTestu ? skoreZhody(bezTestu, meno) : 0;
      if (ico.length >= 6 && String(f.ico ?? "").replace(/\D/g, "") === ico) skore = 1;
      const test = Boolean(f.testovacia_pre);
      // Skutočná firma pred testovacou a naopak, podľa toho, čo človek povedal.
      if (test !== chceTest) skore -= 0.15;
      return { f, skore };
    })
    .filter((x) => x.skore >= PRAH_ZHODY - 0.15)
    .sort((a, b) => b.skore - a.skore);
  const kandidati = ohodnotene.map((x) => x.f).slice(0, 8);
  const [prva, druha] = ohodnotene;
  const jasna =
    prva &&
    prva.skore >= PRAH_ZHODY &&
    (!druha || prva.skore - druha.skore >= 0.1 || druha.skore < PRAH_ZHODY);
  return { presna: jasna ? prva.f : null, kandidati };
}
