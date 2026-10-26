/*
  Návrh zaúčtovania od AI pre doklad od nového dodávateľa.

  Keď doklad nemá predkontáciu či členenie DPH a nevyplní ich ani ručné
  pravidlo, ani naučený návyk dodávateľa, spýta sa Faktero modelu — ale
  model smie vybrať LEN z kódov, ktoré firma naozaj má: z číselníka
  predkontácií a z kódov, ktoré už použila na iných dokladoch. Čo model
  vráti mimo nich, sa zahodí (`spracujOdpoved`).

  Je to len návrh. Doklad sa podľa neho nikdy nezaúčtuje sám — človek ho
  potvrdí (jedným klikom) alebo zmení. Poradie zdrojov je vždy
  pravidlo > návyk > AI (`zlucNavrhy`).

  Čisté funkcie — databáza a volanie modelu sú v `ai-predkontacia.server.ts`.
*/

import { poliaZPravidla } from "./nespracovane-pravidlo";
import { odpovedNaJson } from "./json-odpoved";
import type { MoznostKodu } from "./predkontacie";
import { staleNaucene, type DruhUcenia, type PoleUcenia } from "./ucenie-z-oprav";
import type { UdajeNespracovaneho } from "./nespracovane";

/** Polia, ktoré AI navrhuje. */
export type PoleNavrhu = Extract<PoleUcenia, "predkontacia" | "clenenie" | "kv" | "kategoria">;
export const POLIA_NAVRHU: PoleNavrhu[] = ["predkontacia", "clenenie", "kv", "kategoria"];

/** Odkiaľ hodnota pochádza — v poradí priority. */
export type ZdrojNavrhu = "doklad" | "pravidlo" | "navyk" | "ai";

export type HodnotaNavrhu = { hodnota: string; zdroj: ZdrojNavrhu };
export type ZlucenyNavrh = Partial<Record<PoleNavrhu, HodnotaNavrhu>>;

export type StavNavrhu =
  /** Návrh je (aspoň jedno pole od pravidla, návyku alebo AI). */
  | "navrh"
  /** Doklad je vyplnený alebo zaúčtovaný — netreba nič. */
  | "netreba"
  /** Model nič použiteľné nenavrhol. */
  | "prazdny"
  /** Firma nemá číselník ani použité kódy. */
  | "bez_ciselnika"
  /** AI neodpovedala — skúsi sa pri ďalšom otvorení. */
  | "nedostupny"
  /** Krajina firmy, pre ktorú sa návrh nerobí (DE — DATEV predkontácie nepoužíva). */
  | "nepodporovane"
  /** Človek nemá právo doklady meniť — návrh by nemal kto potvrdiť. */
  | "bez_prava";

export type VysledokNavrhu = {
  stav: StavNavrhu;
  /** Navrhnuté polia (bez tých, ktoré už na doklade sú). */
  polia: ZlucenyNavrh;
  dovod: string | null;
  zPamate?: boolean;
  /** Istota modelu 0–100, keď návrh pochádza od AI. */
  istota?: number | null;
};

/** Platný návrh modelu (len kódy z povolených zoznamov). */
export type NavrhAi = Partial<Record<PoleNavrhu, string>> & { dovod?: string; istota?: number };

/** Typ dokladu, ku ktorému sa návrh pamätá. */
export type TypDokladuNavrhu = "prijata" | "doklad" | "nespracovany";

/** Kódy, z ktorých smie model vyberať. Prázdny zoznam = pole sa nenavrhuje. */
export type PovoleneKody = {
  predkontacia: MoznostKodu[];
  clenenie: MoznostKodu[];
  kv: { kod: string; nazov: string }[];
  kategoria: { kod: string; nazov: string }[];
};

export type Krajina = "SK" | "CZ";

/** Čo o doklade vie model — len to, čo na zaúčtovanie treba (cena!). */
export type VstupNavrhu = {
  krajina: Krajina;
  druh: DruhUcenia;
  dodavatel: { nazov: string; ico: string; icDph: string; krajina: string };
  popis: string;
  polozky: string[];
  mena: string;
  zaklad: number;
  dph: number;
  celkom: number;
  sadzby: number[];
  prenesenie: boolean;
  platba: string;
};

/** Koľko kódov z číselníka ide do pokynu — dlhší zoznam len predraží volanie. */
export const MAX_PREDKONTACII = 80;
export const MAX_CLENENI = 40;
const MAX_POLOZIEK = 12;

/** Strop dokladov na jedno volanie hromadného návrhu (30 s nginxu). */
export const MAX_HROMADNE = 50;

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const txt = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Krajina dodávateľa: zo stĺpca, inak z predpony IČ DPH. */
function krajinaDodavatela(stlpec: unknown, icDph: unknown, krajinaFirmy: Krajina): string {
  const k = txt(stlpec, 2).toUpperCase();
  if (/^[A-Z]{2}$/.test(k)) return k;
  const p = txt(icDph, 20).toUpperCase().slice(0, 2);
  if (/^[A-Z]{2}$/.test(p)) return p === "EL" ? "GR" : p;
  return krajinaFirmy;
}

function nazvyPoloziek(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const x of items) {
    const n = txt((x as any)?.name, 60);
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= MAX_POLOZIEK) break;
  }
  return out;
}

const sadzbyZ = (rozpis: { sadzba?: unknown }[] | null | undefined): number[] =>
  [...new Set((rozpis ?? []).map((r) => Number(r?.sadzba)).filter((n) => Number.isFinite(n)))].sort(
    (a, b) => b - a,
  );

/**
 * Vstup z riadka `purchase_invoices` (alebo z `prijataZUdajov` — rovnaký tvar,
 * aby odtlačok nespracovaného dokladu sedel s odtlačkom vytvorenej faktúry).
 */
export function vstupZPrijatej(
  p: Record<string, any>,
  krajina: Krajina,
  rozpis: { sadzba: number; pdp?: boolean }[],
): VstupNavrhu {
  const druh: DruhUcenia =
    p.type === "proforma"
      ? "zalohova"
      : txt(p.opravuje_cislo, 60) || Number(p.amount_total ?? 0) < 0
        ? "dobropis"
        : "faktura";
  return {
    krajina,
    druh,
    dodavatel: {
      nazov: txt(p.supplier_name, 120),
      ico: txt(p.supplier_ico, 20),
      icDph: txt(p.supplier_ic_dph, 20),
      krajina: krajinaDodavatela(p.supplier_country, p.supplier_ic_dph, krajina),
    },
    popis: txt(p.intro_note, 160),
    polozky: nazvyPoloziek(p.items),
    mena: txt(p.currency || "EUR", 3).toUpperCase(),
    zaklad: r2(p.amount_without_vat),
    dph: r2(p.vat_amount),
    celkom: r2(p.amount_total),
    sadzby: sadzbyZ(rozpis),
    prenesenie:
      Boolean(p.reverse_charge) ||
      p.dph_rezim === "samozdanenie" ||
      p.dph_rezim === "nadobudnutie" ||
      rozpis.some((r) => r.pdp),
    platba: txt(p.payment_method, 20),
  };
}

/** Vstup z riadka `expense_documents` (alebo z `blocekZUdajov`). */
export function vstupZBlocku(b: Record<string, any>, krajina: Krajina): VstupNavrhu {
  const rozpis = Array.isArray(b.vat_breakdown) ? b.vat_breakdown : [];
  const sadzby = sadzbyZ(rozpis);
  if (
    !sadzby.length &&
    b.vat_rate !== null &&
    b.vat_rate !== undefined &&
    Number.isFinite(Number(b.vat_rate))
  )
    sadzby.push(Number(b.vat_rate));
  return {
    krajina,
    druh: "blocek",
    dodavatel: {
      nazov: txt(b.supplier_name, 120),
      ico: txt(b.supplier_ico, 20),
      icDph: txt(b.supplier_ic_dph, 20),
      krajina: krajinaDodavatela(null, b.supplier_ic_dph, krajina),
    },
    popis: "",
    polozky: nazvyPoloziek(b.items),
    mena: txt(b.currency || "EUR", 3).toUpperCase(),
    zaklad: r2(b.net_amount),
    dph: r2(b.vat_amount),
    celkom: r2(b.total_amount),
    sadzby,
    prenesenie: false,
    platba: txt(b.payment_method, 20),
  };
}

/** FNV-1a — krátky stabilný odtlačok; nie je to bezpečnostný hash. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Odtlačok vstupu — keď sa doklad zmení (iný dodávateľ, sumy, položky),
 * zapamätaný návrh neplatí a počíta sa znova. Kódy číselníka v ňom nie sú:
 * zmenu číselníka zachytí kontrola pri čítaní (`platnyZPamate`).
 */
export function odtlacok(v: VstupNavrhu): string {
  const s = JSON.stringify([
    v.krajina,
    v.druh,
    v.dodavatel.nazov.toLowerCase(),
    v.dodavatel.ico,
    v.dodavatel.icDph.toUpperCase(),
    v.dodavatel.krajina,
    v.popis.toLowerCase(),
    v.polozky.map((p) => p.toLowerCase()),
    v.mena,
    v.zaklad,
    v.dph,
    v.celkom,
    v.sadzby,
    v.prenesenie,
    v.druh === "blocek" ? v.platba : "",
  ]);
  return `v1:${fnv(s)}${fnv(s.split("").reverse().join(""))}`;
}

/**
 * Zlúči zdroje pre každé pole: čo už na doklade je, nechá tak; inak pravidlo,
 * potom naučený návyk, až nakoniec AI. Prázdna hodnota zdroja sa preskočí.
 */
export function zlucNavrhy(z: {
  doklad?: Partial<Record<PoleNavrhu, string | null | undefined>>;
  pravidlo?: Partial<Record<PoleNavrhu, string | null | undefined>>;
  navyk?: Partial<Record<PoleNavrhu, string | null | undefined>>;
  ai?: Partial<Record<PoleNavrhu, string | null | undefined>> | null;
}): ZlucenyNavrh {
  const out: ZlucenyNavrh = {};
  const poradie: [
    ZdrojNavrhu,
    Partial<Record<PoleNavrhu, string | null | undefined>> | null | undefined,
  ][] = [
    ["doklad", z.doklad],
    ["pravidlo", z.pravidlo],
    ["navyk", z.navyk],
    ["ai", z.ai],
  ];
  for (const pole of POLIA_NAVRHU) {
    for (const [zdroj, hodnoty] of poradie) {
      const h = String(hodnoty?.[pole] ?? "").trim();
      if (h) {
        out[pole] = { hodnota: h, zdroj };
        break;
      }
    }
  }
  return out;
}

/**
 * Treba sa pýtať AI? Len keď predkontácia alebo členenie DPH ostanú prázdne
 * aj po doklade, pravidle a návyku — a aspoň pre jedno z nich má firma kódy.
 */
export function potrebujeAi(z: ZlucenyNavrh, povolene: PovoleneKody): boolean {
  const chybaPk = !z.predkontacia && povolene.predkontacia.length > 0;
  const chybaCl = !z.clenenie && povolene.clenenie.length > 0;
  return chybaPk || chybaCl;
}

/** Polia, ktoré sa od modelu pýtajú — tie, čo zatiaľ nič nevyplnilo. */
export function poliaPreAi(z: ZlucenyNavrh, povolene: PovoleneKody): PoleNavrhu[] {
  return POLIA_NAVRHU.filter((p) => !z[p] && povolene[p].length > 0);
}

/**
 * Povolené kódy. Číselník predkontácií má prednosť; kódy, ktoré firma už
 * použila (na dokladoch, v pravidlách, v nastaveniach), sa pridajú za neho.
 * Predkontácia z cudzej agendy (vydané faktúry…) sa nepovolí. Členenie KV
 * a kategória sa navrhujú len firme, ktorá ich na dokladoch naozaj vypĺňa.
 */
export function povoleneKody(args: {
  ciselnik: {
    druh: string;
    kod: string;
    popis: string | null;
    agenda: string | null;
    ucet_md?: string | null;
    ucet_d?: string | null;
    aktivne?: boolean | null;
    druhy_dokladov?: string[] | null;
  }[];
  agendy: string[];
  /** Kľúč druhu dokladu z PREDVOLENE (`prijata`, `doklady`) — kód obmedzený na iné druhy sa nepovolí. */
  kluc?: string;
  pouzitePredkontacie: string[];
  pouziteClenenia: string[];
  pouziteKv: string[];
  pouziteKategorie: string[];
  kvMoznosti: { kod: string; nazov: string }[];
  kategorieMoznosti: { kod: string; nazov: string }[];
}): PovoleneKody {
  const zCiselnika = (druh: string, agendy: string[] | null): MoznostKodu[] => {
    const videne = new Set<string>();
    const out: MoznostKodu[] = [];
    for (const z of args.ciselnik) {
      if (z.druh !== druh || z.aktivne === false) continue;
      const kod = txt(z.kod, 30);
      if (!kod || videne.has(kod)) continue;
      if (agendy && z.agenda && !agendy.includes(z.agenda)) continue;
      if (args.kluc && z.druhy_dokladov?.length && !z.druhy_dokladov.includes(args.kluc)) continue;
      videne.add(kod);
      out.push({
        kod,
        popis: z.popis ? txt(z.popis, 80) : null,
        agenda: z.agenda ?? "",
        ucty: z.ucet_md || z.ucet_d ? `${z.ucet_md ?? "—"}/${z.ucet_d ?? "—"}` : null,
      });
    }
    return out;
  };
  const doplnPouzite = (zoz: MoznostKodu[], pouzite: string[], max: number): MoznostKodu[] => {
    const zname = new Set(zoz.map((m) => m.kod));
    const out = [...zoz];
    for (const k of pouzite) {
      const kod = txt(k, 30);
      if (!kod || zname.has(kod)) continue;
      zname.add(kod);
      out.push({ kod, popis: null, agenda: "", ucty: null });
    }
    return out.slice(0, max);
  };
  const kvPouzite = new Set(args.pouziteKv.map((k) => txt(k, 5)).filter(Boolean));
  const katPouzite = new Set(args.pouziteKategorie.map((k) => txt(k, 40)).filter(Boolean));
  return {
    predkontacia: doplnPouzite(
      zCiselnika("predkontacia", args.agendy),
      args.pouzitePredkontacie,
      MAX_PREDKONTACII,
    ),
    clenenie: doplnPouzite(zCiselnika("clenenie_dph", null), args.pouziteClenenia, MAX_CLENENI),
    kv: kvPouzite.size ? args.kvMoznosti : [],
    kategoria: katPouzite.size ? args.kategorieMoznosti : [],
  };
}

/** Firma nemá žiadne kódy — namiesto návrhu sa ukáže odkaz na číselník. */
export const bezCiselnika = (p: PovoleneKody) => !p.predkontacia.length && !p.clenenie.length;

const DRUH_TEXT: Record<DruhUcenia, string> = {
  faktura: "prijatá faktúra",
  zalohova: "prijatá zálohová faktúra (preddavok, nie je to náklad)",
  dobropis: "prijatý dobropis (opravný doklad)",
  blocek: "pokladničný bloček / zjednodušená faktúra",
};

const OSNOVA: Record<Krajina, string> = {
  SK: "Slovensko, účtová osnova podľa Opatrenia MF SR (napr. 501 materiál, 502 energie, 511 opravy, 512 cestovné, 513 reprezentácia, 518 ostatné služby, 548 ostatné náklady, 314 preddavky, 042 obstaranie DM), DPH podľa zákona 222/2004 Z. z.",
  CZ: "Česko, směrná účtová osnova (např. 501 spotřeba materiálu, 502 energie, 511 opravy, 512 cestovné, 513 reprezentace, 518 ostatní služby, 548 ostatní provozní náklady, 314 zálohy, 042 pořízení DM), DPH podle zákona 235/2004 Sb.",
};

const riadok = (m: MoznostKodu) =>
  [m.kod, m.popis ?? "", m.ucty ?? ""].map((s) => s.replace(/\|/g, "/")).join(" | ");

/**
 * Pokyn pre model — krátky, len potrebné polia, číselník ako zoznam riadkov.
 * Odpoveď je čistý JSON (`SCHEMA_ODPOVEDE`).
 */
export function pokynAi(v: VstupNavrhu, povolene: PovoleneKody, polia: PoleNavrhu[]): string {
  const casti: string[] = [
    "Si skúsený účtovník. Navrhni zaúčtovanie prijatého dokladu do programu POHODA.",
    `Firma: ${OSNOVA[v.krajina]}`,
    "Vyber VÝHRADNE kód zo zoznamov nižšie (presne, ako je napísaný). Ak si nie si istý alebo žiadny nesedí, daj null. Nikdy si kód nevymýšľaj.",
    'Odpovedz len JSON: {"predkontacia": string|null, "clenenie": string|null, "kv": string|null, "kategoria": string|null, "dovod": string, "istota": number}. "dovod" je krátke zdôvodnenie po slovensky, najviac 80 znakov, napr. "telekomunikačné služby → 518". "istota" je celé číslo 0–100: ako veľmi si istý predkontáciou (90+ len pri jednoznačnom doklade).',
    "",
    "DOKLAD",
    `Druh: ${DRUH_TEXT[v.druh]}`,
    `Dodávateľ: ${v.dodavatel.nazov || "neznámy"}${v.dodavatel.ico ? `, IČO ${v.dodavatel.ico}` : ""}${v.dodavatel.icDph ? `, IČ DPH ${v.dodavatel.icDph}` : ""}, krajina ${v.dodavatel.krajina}`,
  ];
  if (v.popis) casti.push(`Text: ${v.popis}`);
  if (v.polozky.length) casti.push(`Položky: ${v.polozky.join("; ")}`);
  casti.push(
    `Suma: základ ${v.zaklad}, DPH ${v.dph}, spolu ${v.celkom} ${v.mena}; sadzby DPH: ${v.sadzby.length ? v.sadzby.map((s) => `${s} %`).join(", ") : "bez DPH"}`,
  );
  if (v.prenesenie) casti.push("Prenesenie daňovej povinnosti: áno (daň platí odberateľ).");
  if (v.druh === "blocek" && v.platba) casti.push(`Úhrada: ${v.platba}`);
  const pole = (nazov: string, zoz: string[]) => {
    casti.push("", nazov, ...zoz);
  };
  if (polia.includes("predkontacia") && povolene.predkontacia.length)
    pole("PREDKONTÁCIE (kód | popis | účty MD/D)", povolene.predkontacia.map(riadok));
  else casti.push("", "predkontacia: vráť null");
  if (polia.includes("clenenie") && povolene.clenenie.length)
    pole("ČLENENIE DPH (kód | popis)", povolene.clenenie.map(riadok));
  else casti.push("", "clenenie: vráť null");
  if (polia.includes("kv") && povolene.kv.length)
    pole(
      "ČLENENIE KONTROLNÉHO VÝKAZU (kód | popis) — vyplň len, keď doklad nepatrí do bežného riadku",
      povolene.kv.map((k) => `${k.kod} | ${k.nazov}`),
    );
  else casti.push("kv: vráť null");
  if (polia.includes("kategoria") && povolene.kategoria.length)
    pole(
      "KATEGÓRIA NÁKLADU (kód | názov)",
      povolene.kategoria.map((k) => `${k.kod} | ${k.nazov}`),
    );
  else casti.push("kategoria: vráť null");
  return casti.join("\n");
}

/** Schéma odpovede pre model (podmnožina OpenAPI, ako ju berie Gemini). */
export const SCHEMA_ODPOVEDE = {
  type: "object",
  properties: {
    predkontacia: { type: "string", nullable: true },
    clenenie: { type: "string", nullable: true },
    kv: { type: "string", nullable: true },
    kategoria: { type: "string", nullable: true },
    dovod: { type: "string" },
    istota: { type: "integer" },
  },
  required: ["predkontacia", "clenenie", "kv", "kategoria", "dovod", "istota"],
} as const;

/** Kód z odpovede preložený na kód zo zoznamu — presne, inak bez ohľadu na veľkosť písmen. */
function najdiKod(h: unknown, zoz: { kod: string }[]): string | null {
  if (typeof h !== "string") return null;
  const t = h.trim();
  if (!t || t.length > 40) return null;
  const presne = zoz.find((z) => z.kod === t);
  if (presne) return presne.kod;
  const male = t.toLowerCase();
  const podobne = zoz.filter((z) => z.kod.toLowerCase() === male);
  // Dva kódy, ktoré sa líšia len veľkosťou písmen, sa hádať nedajú.
  return podobne.length === 1 ? podobne[0]!.kod : null;
}

/**
 * Odpoveď modelu → platný návrh. Zlý JSON, prázdna odpoveď či kódy mimo
 * povolených zoznamov dajú `null` (alebo návrh bez neznámych polí). Pole,
 * ktoré sa od modelu nepýtalo, sa zahodí aj vtedy, keď ho vráti.
 */
export function spracujOdpoved(
  raw: string | null | undefined,
  povolene: PovoleneKody,
  polia: PoleNavrhu[] = POLIA_NAVRHU,
): NavrhAi | null {
  const j = odpovedNaJson<Record<string, unknown>>(raw);
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const out: NavrhAi = {};
  for (const pole of polia) {
    const kod = najdiKod(j[pole], povolene[pole]);
    if (kod) out[pole] = kod;
  }
  if (!POLIA_NAVRHU.some((p) => out[p])) return null;
  const dovod = txt(j.dovod, 120);
  if (dovod) out.dovod = dovod;
  const istota = istotaZ(j.istota);
  if (istota !== null) out.istota = istota;
  return out;
}

/** Istota z odpovede: celé číslo 0–100, inak nič. */
function istotaZ(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Zapamätaný návrh, ak ešte platí: odtlačok dokladu sedí a kódy sú stále
 * v povolených zoznamoch. Vráti `undefined`, keď treba počítať znova
 * (`null` = zapamätané „model nič nenavrhol" — znova sa nepýta).
 */
export function platnyZPamate(
  ulozeny: { odtlacok: string; stav: string; navrh: unknown } | null | undefined,
  odtl: string,
  povolene: PovoleneKody,
): NavrhAi | null | undefined {
  if (!ulozeny || ulozeny.odtlacok !== odtl) return undefined;
  if (ulozeny.stav === "prazdny") return null;
  const n = (ulozeny.navrh ?? {}) as Record<string, unknown>;
  const out: NavrhAi = {};
  let zahodene = false;
  for (const pole of POLIA_NAVRHU) {
    if (n[pole] === undefined || n[pole] === null || n[pole] === "") continue;
    const kod = najdiKod(n[pole], povolene[pole]);
    if (kod) out[pole] = kod;
    else zahodene = true;
  }
  // Kód z číselníka medzitým zmizol — návrh treba spočítať znova.
  if (zahodene && !POLIA_NAVRHU.some((p) => out[p])) return undefined;
  if (!POLIA_NAVRHU.some((p) => out[p])) return null;
  if (typeof n.dovod === "string" && n.dovod.trim()) out.dovod = txt(n.dovod, 120);
  const istota = istotaZ(n.istota);
  if (istota !== null) out.istota = istota;
  return out;
}

/** Návyk pre pole: ustálená voľba, inak aspoň posledná neprázdna voľba. */
export function navykPola(
  volby: { h: string }[] | null | undefined,
  ustalena: string | null,
): string | null {
  if (ustalena) return ustalena;
  const v = (volby ?? []).filter((x) => x && typeof x.h === "string");
  const posl = v[v.length - 1]?.h?.trim();
  return posl || null;
}

/* ---------- Nespracované doklady: návrh v údajoch formulára ---------- */

/** Hodnota poľa návrhu v údajoch nespracovaného dokladu. */
export function hodnotaVUdajoch(u: UdajeNespracovaneho, pole: PoleNavrhu): string {
  if (pole === "kategoria") return u.kategoria ?? "";
  return (u.kody?.[pole] as string | undefined) ?? "";
}

function nastavVUdajoch(u: UdajeNespracovaneho, pole: PoleNavrhu, h: string): UdajeNespracovaneho {
  if (pole === "kategoria") return { ...u, kategoria: h };
  return { ...u, kody: { ...u.kody, [pole]: h } };
}

/**
 * Doplní návrh do PRÁZDNYCH polí formulára. AI hodnoty sa označia v
 * `navrhAi` (nepotvrdené), návykové v `naucene` (ako učenie z opráv).
 */
export function doplnNavrhDoUdajov(
  u: UdajeNespracovaneho,
  navrh: ZlucenyNavrh,
  dovod?: string | null,
): UdajeNespracovaneho {
  let out = u;
  const ai: Record<string, string> = { ...(u.navrhAi ?? {}) };
  const naucene: Record<string, string> = { ...(u.naucene ?? {}) };
  for (const pole of POLIA_NAVRHU) {
    const n = navrh[pole];
    if (!n || (n.zdroj !== "ai" && n.zdroj !== "navyk")) continue;
    if (hodnotaVUdajoch(out, pole).trim()) continue;
    out = nastavVUdajoch(out, pole, n.hodnota);
    if (n.zdroj === "ai") ai[pole] = n.hodnota;
    else naucene[pole] = n.hodnota;
  }
  if (Object.keys(ai).length) {
    out = { ...out, navrhAi: ai };
    if (dovod) out = { ...out, navrhAiDovod: dovod };
  }
  if (Object.keys(naucene).length) out = { ...out, naucene };
  return out;
}

/** Polia, v ktorých je stále nepotvrdený návrh AI (človek ich nezmenil). */
export function nepotvrdeneAi(u: UdajeNespracovaneho): PoleNavrhu[] {
  return Object.entries(u.navrhAi ?? {})
    .filter(
      ([pole, h]) =>
        POLIA_NAVRHU.includes(pole as PoleNavrhu) &&
        h &&
        hodnotaVUdajoch(u, pole as PoleNavrhu) === h,
    )
    .map(([pole]) => pole as PoleNavrhu);
}

/** Potvrdenie návrhu — hodnoty ostanú, sú odteraz voľbou človeka. */
export function potvrdNavrhAi(u: UdajeNespracovaneho): UdajeNespracovaneho {
  const { navrhAi: _a, navrhAiDovod: _d, ...zvysok } = u;
  return zvysok as UdajeNespracovaneho;
}

/** Zahodenie návrhu — nepotvrdené hodnoty sa vyprázdnia. */
export function zahodNavrhAi(u: UdajeNespracovaneho): UdajeNespracovaneho {
  let out = u;
  for (const pole of nepotvrdeneAi(u)) out = nastavVUdajoch(out, pole, "");
  return potvrdNavrhAi(out);
}

/**
 * Pred zápisom dokladu: nepotvrdený návrh AI do dokladu nejde (doklad by
 * sa ním zaúčtoval bez človeka). Návrh sa prenesie k vytvorenému dokladu,
 * kde ho človek potvrdí v zaúčtovaní.
 */
export function bezNepotvrdenehoAi(u: UdajeNespracovaneho): UdajeNespracovaneho {
  return zahodNavrhAi(u);
}

/** Štítky pri poliach formulára: nepotvrdený návrh AI a nezmenené naučené hodnoty. */
export function oznaceniaZUdajov(
  u: UdajeNespracovaneho,
): Partial<Record<PoleNavrhu, "ai" | "navyk" | "pravidlo">> {
  const out: Partial<Record<PoleNavrhu, "ai" | "navyk" | "pravidlo">> = {};
  for (const p of staleNaucene(u))
    if ((POLIA_NAVRHU as string[]).includes(p)) out[p as PoleNavrhu] = "navyk";
  for (const p of nepotvrdeneAi(u)) out[p] = "ai";
  // Pravidlo má prednosť — hodnota z neho je zaúčtovanie, nie návrh.
  for (const p of poliaZPravidla(u)) out[p] = "pravidlo";
  return out;
}
