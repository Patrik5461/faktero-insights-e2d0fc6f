/**
 * Nemecké priznanie k DPH — Umsatzsteuer-Voranmeldung (UStVA), prehľad
 * Kennzahlen za mesiac alebo štvrťrok. Nepodáva sa odtiaľto (ELSTER), je to
 * podklad, z ktorého sa formulár vyplní alebo ktorý dostane poradca.
 *
 * Počíta sa z toho istého vstupu ako slovenské a české výkazy
 * (`nacitajVstup` — sumy už v domácej mene, teda v eurách). Pravidlá podľa
 * vzoru UStVA 2025/2026 (Vordruckmuster USt 1 A) a § 18 UStG:
 *
 *  - Bemessungsgrundlage v celých eurách — centy sa odrežú,
 *  - daň pri KZ 81 / 86 / 89 / 93 vypočíta formulár zo zaokrúhleného základu
 *    (19 % / 7 %), pri ostatných sa zapisuje daň z dokladov na centy,
 *  - Vorsteuer (KZ 66, 61, 62, 67) na centy,
 *  - KZ 83 = daň spolu − Vorsteuer − Sondervorauszahlung (KZ 39).
 *
 * Zatriedenie:
 *  - vystavené: 19 % → KZ 81, 7 % → KZ 86, iná sadzba → KZ 35/36,
 *    dodanie tovaru do EÚ → KZ 41, trojstranný obchod → KZ 42, služba do EÚ
 *    (§ 18b, miesto plnenia v inom štáte) → KZ 21, vývoz tovaru → KZ 43,
 *    služba mimo EÚ → KZ 45, tuzemské prenesenie § 13b → KZ 60,
 *  - prijaté: tuzemská faktúra → Vorsteuer KZ 66, nadobudnutie tovaru z EÚ
 *    → KZ 89/93 + KZ 61, služba od podnikateľa z EÚ (§ 13b ods. 1) → KZ
 *    46/47 + KZ 67, ostatné prenesenie (§ 13b ods. 2 — tuzemské stavebné
 *    práce, dodávateľ mimo EÚ) → KZ 84/85 + KZ 67, dovoz → KZ 62,
 *  - bločky: Vorsteuer KZ 66.
 *
 * Predaj cez OSS do UStVA nepatrí (podáva sa v OSS-Erklärung), zálohová
 * faktúra tiež nie. Čo sa z dokladov vyčítať nedá (oslobodené plnenia bez
 * prenesenia, KZ 48, Sondervorauszahlung), ide do `vytky` alebo do ručných
 * riadkov.
 */

import { jeEuIcDph, rozdelIcDph } from "./vies";
import type { PrijataFaktura, SadzbovyRiadok, Vstup, Vytka } from "./dph-vykazy";

/** Kennzahlen, ktoré prehľad vypĺňa. */
export type KzUstva =
  | "81"
  | "86"
  | "35"
  | "36"
  | "41"
  | "42"
  | "43"
  | "45"
  | "48"
  | "21"
  | "60"
  | "89"
  | "93"
  | "95"
  | "98"
  | "46"
  | "47"
  | "84"
  | "85"
  | "66"
  | "61"
  | "62"
  | "67"
  | "64"
  | "69"
  | "39"
  | "83";

/** Riadky, ktoré z dokladov nevyplývajú — dopĺňa ich človek. */
export const RUCNE_KZ = ["48", "64", "69", "39"] as const;
export type RucneKz = Partial<Record<(typeof RUCNE_KZ)[number], number>>;

export type Ustva = {
  /** Hodnota Kennzahl: základ v celých eurách, daň a Vorsteuer na centy. */
  kz: Partial<Record<KzUstva, number>>;
  /** Daň, ktorú formulár dopočíta k základu (KZ 81, 86, 89, 93). */
  danKZakladu: Partial<Record<"81" | "86" | "89" | "93", number>>;
  /** Daň spolu (Umsatzsteuer) a odpočet (Vorsteuer) pred KZ 39. */
  danSpolu: number;
  vorsteuerSpolu: number;
  vytky: Vytka[];
};

/** Poradie a popis riadkov prehľadu (slovenský kľúč prekladu, nemecký je v slovníku). */
export const RIADKY_USTVA: {
  kz: KzUstva;
  popis: string;
  /** Riadok so základom — vedľa neho sa ukáže daň. */
  danKz?: KzUstva | "vypocet";
  skupina: string;
}[] = [
  { kz: "81", popis: "Zdaniteľné plnenia 19 %", danKz: "vypocet", skupina: "ustva::Plnenia" },
  { kz: "86", popis: "Zdaniteľné plnenia 7 %", danKz: "vypocet", skupina: "ustva::Plnenia" },
  { kz: "35", popis: "Plnenia s inou sadzbou", danKz: "36", skupina: "ustva::Plnenia" },
  {
    kz: "41",
    popis: "Dodanie tovaru do EÚ odberateľom s IČ DPH",
    skupina: "ustva::Oslobodené plnenia",
  },
  {
    kz: "42",
    popis: "Trojstranný obchod — dodanie prvým odberateľom (§ 25b)",
    skupina: "ustva::Oslobodené plnenia",
  },
  {
    kz: "43",
    popis: "Ďalšie oslobodené plnenia s nárokom na odpočet (vývoz)",
    skupina: "ustva::Oslobodené plnenia",
  },
  {
    kz: "48",
    popis: "Oslobodené plnenia bez nároku na odpočet",
    skupina: "ustva::Oslobodené plnenia",
  },
  {
    kz: "21",
    popis: "Služby do EÚ s miestom plnenia v inom štáte (§ 18b)",
    skupina: "ustva::Nezdaniteľné plnenia",
  },
  { kz: "45", popis: "Ostatné plnenia mimo tuzemska", skupina: "ustva::Nezdaniteľné plnenia" },
  {
    kz: "60",
    popis: "Plnenia, pri ktorých daň platí odberateľ (§ 13b)",
    skupina: "ustva::Nezdaniteľné plnenia",
  },
  {
    kz: "89",
    popis: "Nadobudnutie tovaru z EÚ 19 %",
    danKz: "vypocet",
    skupina: "ustva::Nadobudnutie z EÚ",
  },
  {
    kz: "93",
    popis: "Nadobudnutie tovaru z EÚ 7 %",
    danKz: "vypocet",
    skupina: "ustva::Nadobudnutie z EÚ",
  },
  {
    kz: "95",
    popis: "Nadobudnutie tovaru z EÚ s inou sadzbou",
    danKz: "98",
    skupina: "ustva::Nadobudnutie z EÚ",
  },
  {
    kz: "46",
    popis: "Služby od podnikateľa z EÚ (§ 13b ods. 1)",
    danKz: "47",
    skupina: "ustva::Daň platí príjemca",
  },
  {
    kz: "84",
    popis: "Ostatné plnenia v prenesení (§ 13b ods. 2)",
    danKz: "85",
    skupina: "ustva::Daň platí príjemca",
  },
  { kz: "69", popis: "Daň nesprávne uvedená na faktúre", skupina: "ustva::Daň platí príjemca" },
  { kz: "66", popis: "Odpočet dane z faktúr iných podnikateľov", skupina: "ustva::Odpočet dane" },
  { kz: "61", popis: "Odpočet dane z nadobudnutia tovaru z EÚ", skupina: "ustva::Odpočet dane" },
  { kz: "62", popis: "Odpočet zaplatenej dovoznej DPH", skupina: "ustva::Odpočet dane" },
  { kz: "67", popis: "Odpočet dane z plnení podľa § 13b", skupina: "ustva::Odpočet dane" },
  { kz: "64", popis: "Oprava odpočtu (§ 15a)", skupina: "ustva::Odpočet dane" },
  {
    kz: "39",
    popis: "Odpočet mimoriadnej zálohy (Sondervorauszahlung)",
    skupina: "ustva::Výsledok",
  },
  { kz: "83", popis: "Zostávajúca záloha na DPH / nadmerný odpočet", skupina: "ustva::Výsledok" },
];

const centy = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
/** Základ dane v celých eurách — centy sa odrežú (aj pri zápornom základe). */
const celeEura = (n: number) => Math.trunc(centy(n));

/** 19 % a staré 16 % sú základná sadzba, 7 % a 5 % znížená — podľa výšky. */
type Pasmo = "19" | "7" | "ina" | null;
function pasmo(sadzba: number): Pasmo {
  const s = Number(sadzba);
  if (!(s > 0)) return null;
  if (s === 19) return "19";
  if (s === 7) return "7";
  return "ina";
}

/** Faktúra v prenesení prichádza bez dane — príjemca ju vyčísli sám (19 %). */
function samozdan(riadky: SadzbovyRiadok[]): SadzbovyRiadok[] {
  if (riadky.some((r) => Number(r.sadzba) > 0)) return riadky;
  return riadky.map((r) => ({ sadzba: 19, zaklad: r.zaklad, dan: centy((r.zaklad * 19) / 100) }));
}

/** Prijatá faktúra zo sumy bez rozpisu má sadzbu odhadnutú — 7 % sa rozpozná z podielu. */
function sadzbaRiadku(r: SadzbovyRiadok): number {
  const s = Number(r.sadzba) || 0;
  if (s === 19 || s === 7 || !r.zaklad || !r.dan) return s;
  const p = (r.dan / r.zaklad) * 100;
  if (Math.abs(p - 19) < 0.6) return 19;
  if (Math.abs(p - 7) < 0.6) return 7;
  return s;
}

/** Odkiaľ je dodávateľ v prenesení: tuzemsko, iný štát EÚ, alebo mimo EÚ. */
function povodDodavatela(icDph: string | null | undefined): "DE" | "EU" | "mimo" {
  const r = rozdelIcDph(icDph);
  if (!r) return "DE";
  if (r.kod === "DE") return "DE";
  return jeEuIcDph(icDph) ? "EU" : "mimo";
}

export function ustva(vstup: Vstup, rucne: RucneKz = {}): Ustva {
  const s: Partial<Record<KzUstva, number>> = {};
  const add = (k: KzUstva, v: number) => {
    if (!v) return;
    s[k] = centy((s[k] ?? 0) + v);
  };
  const vytky: Vytka[] = [];

  for (const f of vstup.vystavene) {
    if (f.typ === "proforma" || f.oss) continue;
    const zaklad = f.riadky.reduce((a, r) => a + r.zaklad, 0);
    if (f.prenosDane) {
      if (f.prenosTyp === "eu_b2b") {
        const r = rozdelIcDph(f.odberatelIcDph);
        if (!r || !jeEuIcDph(f.odberatelIcDph) || r.kod === "DE")
          vytky.push({
            doklad: f.cislo,
            text: "Dodanie do EÚ bez platného IČ DPH odberateľa z iného štátu EÚ — oslobodenie (KZ 41/21) ho vyžaduje.",
          });
        if (f.euPlnenie === "sluzba") add("21", zaklad);
        else if (f.euPlnenie === "trojstranny") add("42", zaklad);
        else add("41", zaklad);
      } else if (f.prenosTyp === "export") {
        add(f.euPlnenie === "sluzba" ? "45" : "43", zaklad);
      } else add("60", zaklad);
      continue;
    }
    let nulova = false;
    for (const r of f.riadky) {
      const p = pasmo(r.sadzba);
      if (p === "19") add("81", r.zaklad);
      else if (p === "7") add("86", r.zaklad);
      else if (p === "ina") {
        add("35", r.zaklad);
        add("36", r.dan);
      } else if (r.zaklad) nulova = true;
    }
    if (nulova)
      vytky.push({
        doklad: f.cislo,
        text: "Plnenie s nulovou sadzbou bez prenesenia — ak je oslobodené, doplňte ho ručne do KZ 43 alebo 48.",
      });
  }

  for (const p of vstup.prijate) {
    if (p.rezim === "bez_dane" || p.kv === "X") continue;
    const podiel =
      p.podielOdpoctu != null && p.podielOdpoctu < 1 ? Math.max(0, p.podielOdpoctu) : 1;
    const riadky = p.riadky.map((r) => ({ ...r, sadzba: sadzbaRiadku(r) }));
    const dan = (rr: SadzbovyRiadok[]) => rr.reduce((a, r) => a + r.dan, 0);
    const rezim: PrijataFaktura["rezim"] = p.rezim;
    if (rezim === "tuzemsko") {
      if (p.odpocet) add("66", dan(riadky) * podiel);
      continue;
    }
    if (rezim === "dovoz") {
      if (p.odpocet) add("62", dan(riadky) * podiel);
      continue;
    }
    const sam = samozdan(riadky);
    if (rezim === "nadobudnutie") {
      for (const r of sam) {
        const pp = pasmo(r.sadzba);
        if (pp === "19") add("89", r.zaklad);
        else if (pp === "7") add("93", r.zaklad);
        else if (pp === "ina") {
          add("95", r.zaklad);
          add("98", r.dan);
        }
      }
      if (p.odpocet) add("61", dan(sam) * podiel);
      continue;
    }
    // Samozdanenie (§ 13b): služba z EÚ → 46/47, ostatné → 84/85.
    const povod = povodDodavatela(p.dodavatelIcDph);
    const [kzZaklad, kzDan]: [KzUstva, KzUstva] = povod === "EU" ? ["46", "47"] : ["84", "85"];
    add(
      kzZaklad,
      sam.reduce((a, r) => a + r.zaklad, 0),
    );
    add(kzDan, dan(sam));
    if (p.odpocet) add("67", dan(sam) * podiel);
  }

  for (const d of vstup.doklady) {
    if (!d.odpocet || d.kv === "X") continue;
    const podiel =
      d.podielOdpoctu != null && d.podielOdpoctu < 1 ? Math.max(0, d.podielOdpoctu) : 1;
    add("66", d.riadky.reduce((a, r) => a + r.dan, 0) * podiel);
  }

  for (const k of RUCNE_KZ) {
    const v = Number(rucne[k] ?? 0);
    if (v) s[k] = centy(v);
  }

  // Základy v celých eurách.
  for (const k of [
    "81",
    "86",
    "35",
    "41",
    "42",
    "43",
    "45",
    "48",
    "21",
    "60",
    "89",
    "93",
    "95",
    "46",
    "84",
  ] as KzUstva[])
    if (s[k] != null) s[k] = celeEura(s[k]!);

  const danKZakladu: Ustva["danKZakladu"] = {};
  for (const [k, sadzba] of [
    ["81", 19],
    ["86", 7],
    ["89", 19],
    ["93", 7],
  ] as const)
    if (s[k]) danKZakladu[k] = centy((s[k]! * sadzba) / 100);

  const danSpolu = centy(
    Object.values(danKZakladu).reduce((a, x) => a + (x ?? 0), 0) +
      (s["36"] ?? 0) +
      (s["98"] ?? 0) +
      (s["47"] ?? 0) +
      (s["85"] ?? 0) +
      (s["69"] ?? 0),
  );
  const vorsteuerSpolu = centy(
    (s["66"] ?? 0) + (s["61"] ?? 0) + (s["62"] ?? 0) + (s["67"] ?? 0) + (s["64"] ?? 0),
  );
  s["83"] = centy(danSpolu - vorsteuerSpolu - (s["39"] ?? 0));

  return { kz: s, danKZakladu, danSpolu, vorsteuerSpolu, vytky };
}

/** Prehľad ako CSV (bodkočiarka, desatinná čiarka) — pre poradcu alebo Excel. */
export function ustvaNaCsv(
  u: Ustva,
  popisy: (popis: string) => string = (x) => x,
  hlavicka: { firma?: string | null; obdobie: string } = { obdobie: "" },
): string {
  const c = (n: number | undefined) => (n == null ? "" : n.toFixed(2).replace(".", ","));
  const pole = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const out = [
    ["UStVA", pole(hlavicka.firma ?? ""), pole(hlavicka.obdobie)].join(";"),
    ["Kennzahl", "Bezeichnung", "Bemessungsgrundlage", "Steuer"].join(";"),
  ];
  for (const r of RIADKY_USTVA) {
    const zaklad = u.kz[r.kz];
    const dan =
      r.danKz === "vypocet"
        ? u.danKZakladu[r.kz as "81" | "86" | "89" | "93"]
        : r.danKz
          ? u.kz[r.danKz]
          : undefined;
    if (zaklad == null && dan == null && r.kz !== "83") continue;
    // Riadky bez základu (Vorsteuer, výsledok) majú sumu v stĺpci daň.
    const lenDan = !r.danKz && ["66", "61", "62", "67", "64", "69", "39", "83"].includes(r.kz);
    out.push(
      [r.kz, pole(popisy(r.popis)), lenDan ? "" : c(zaklad), lenDan ? c(zaklad ?? 0) : c(dan)].join(
        ";",
      ),
    );
  }
  return out.join("\r\n") + "\r\n";
}
