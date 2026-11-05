/*
  Import číselníka zo screenshotu Pohody (AI) — čisté funkcie bez databázy.

  Pohoda nevie vyexportovať napríklad „Členenie kontrolného výkazu DPH“, takže
  ho účtovníčka odfotí (screenshot tabuľky) a AI z obrázka prečíta riadky.
  Tu je pokyn pre model, overenie jeho odpovede (zod), odvodenie smeru
  dokladu a stav každého riadku oproti tomu, čo firma v číselníku už má.

  Import z obrázka je len ďalší zdroj vedľa konektora Pohody, XML/CSV súboru
  a ručného zadania — tie sa tu nemenia. Pravidlá zápisu:
   - nový kód sa založí so zdroj='obrazok' (agenda ''),
   - existujúci kód sa len doplní/zmení (nič sa nemaže, zdroj sa nemení),
   - kód z Pohody alebo ručne zadaný sa prepíše len na výslovné zaškrtnutie.
*/

import { z } from "zod";
import type { DruhCiselnika } from "./predkontacie";

/** Druhy číselníka, ktoré sa dajú čítať z obrázka. */
export const DRUHY_Z_OBRAZKA = ["predkontacia", "clenenie_dph", "kv_clenenie"] as const;
export type DruhZObrazka = (typeof DRUHY_Z_OBRAZKA)[number];

export const NAZVY_DRUHOV_Z_OBRAZKA: Record<DruhZObrazka, string> = {
  predkontacia: "Predkontácie",
  clenenie_dph: "Členenie DPH",
  kv_clenenie: "Členenie KV DPH",
};

/** Smer dokladu pri členení DPH a KV; null = všetky doklady. */
export type SmerDokladu = "vydane" | "prijate";

/* ------------------------------------------------------------- KV DPH */

/**
 * Oficiálne sekcie kontrolného výkazu DPH a ich podkódy v Pohode:
 * A1, A2*, B1*, B2, B3, C1*, C2*, D1, D2 a KN (nezahŕňať).
 * Podkód = sekcia + písmená/číslice/pomlčka (A2CN, B1-0, C2B1-0).
 */
const KV_KOD = /^(?:A1|B2|B3|D1|D2|KN|(?:A2|B1|C1|C2)(?:[A-Z0-9][A-Z0-9-]*|-[A-Z0-9-]+)?)$/;

export function jeKodKv(kod: string | null | undefined): boolean {
  return KV_KOD.test(String(kod ?? "").trim());
}

/** Smer dokladu podľa kódu KV: A*, C1*, D* = vydané; B*, C2* = prijaté; KN = všetky. */
export function typDokladuKv(kod: string | null | undefined): SmerDokladu | null {
  const k = String(kod ?? "").trim().toUpperCase();
  if (!k || k === "KN") return null;
  if (/^C2/.test(k) || /^B/.test(k)) return "prijate";
  if (/^C1/.test(k) || /^A/.test(k) || /^D/.test(k)) return "vydane";
  return null;
}

/** Kľúče druhov dokladov (`PREDVOLENE`) pre smer — podľa nich existujúce výbery filtrujú. */
export function druhyDokladovPreSmer(smer: SmerDokladu | null): string[] {
  if (smer === "vydane") return ["faktura", "pdp", "zaloha", "dobropis"];
  if (smer === "prijate") return ["prijata", "prijata_pdp", "doklady"];
  return [];
}

/* ------------------------------------------------------------ pokyn AI */

/** Značka v pokyne — podľa nej sa volanie dá rozpoznať (meranie, demo). */
export const ZNACKA_POKYNU = "FAKTERO-CISELNIK-Z-OBRAZKA";

export function pokynPreAi(druh: DruhZObrazka | "auto"): string {
  const KV = `Číselník „Členenie kontrolného výkazu DPH“ z programu POHODA (stĺpce Skratka, Text, Typ):
kod = Skratka (napr. A1, A2CN, B1-0, C2B1-0, KN), popis = Text, kategoria = Typ (celý text stĺpca Typ, napr. „A1 Dodanie - Vydané faktúry“).`;
  const CLENENIE = `Číselník „Členenie DPH“ z programu POHODA:
kod = Skratka, popis = Text/Názov, kategoria = Typ alebo Druh (ak je stĺpec), typ_dokladu = „vydane“ pre výstup/vydané plnenia, „prijate“ pre vstup/prijaté, inak null.`;
  const PREDKONTACIE = `Číselník „Predkontácie“ z programu POHODA:
kod = Skratka/Označenie, popis = Text/Popis, ucet_md = účet MD (Má dať), ucet_d = účet D (Dal), kategoria = Agenda alebo Typ dokladu (ak je stĺpec).`;
  const ciel =
    druh === "kv_clenenie"
      ? `Na obrázku je ${KV}`
      : druh === "clenenie_dph"
        ? `Na obrázku je ${CLENENIE}`
        : druh === "predkontacia"
          ? `Na obrázku je ${PREDKONTACIE}`
          : `Na obrázku je jeden z týchto číselníkov — urči, ktorý, a vráť ho v poli "druh":
1. "kv_clenenie" — ${KV}
2. "clenenie_dph" — ${CLENENIE}
3. "predkontacia" — ${PREDKONTACIE}`;
  return `${ZNACKA_POKYNU}
Si presný prepisovač (OCR) tabuliek. Text prepisuješ doslovne, znak po znaku — nič neopravuješ, nedopĺňaš ani nevylepšuješ.
${ciel}

Pravidlá:
- Čítaj IBA riadky tabuľky (dáta). Hlavičku tabuľky, menu, tlačidlá, súčty a texty mimo tabuľky ignoruj.
- Nič nevymýšľaj ani nedopĺňaj. Čo v riadku nie je alebo sa nedá prečítať, daj null.
- Skratky (kod) prepíš PRESNE, znak po znaku: zachovaj veľké a malé písmená, pomlčky, číslice a bodky (napr. "B1-0", "C2B1-0", "UDpdp"). Medzery na začiatku a konci vynechaj.
- Aj texty (popis, kategoria) prepíš doslovne tak, ako sú na obrázku — neopravuj pravopis, diakritiku, skratky ani slovosled, aj keď sa ti zdajú chybné, a nič neprekladaj.
- Každý riadok tabuľky práve raz, v poradí zhora nadol. Ak je riadok orezaný okrajom obrázka, vynechaj ho.
- typ_dokladu: "vydane", "prijate" alebo null.

Vráť IBA JSON bez komentárov v tvare:
{"druh": "kv_clenenie" | "clenenie_dph" | "predkontacia", "riadky": [{"kod": "...", "popis": "..." | null, "kategoria": "..." | null, "ucet_md": "..." | null, "ucet_d": "..." | null, "typ_dokladu": "vydane" | "prijate" | null}]}`;
}

/** Schéma odpovede pre Gemini (podmnožina OpenAPI). */
export const SCHEMA_ODPOVEDE: Record<string, unknown> = {
  type: "object",
  properties: {
    druh: { type: "string", enum: ["kv_clenenie", "clenenie_dph", "predkontacia"] },
    riadky: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kod: { type: "string" },
          popis: { type: "string", nullable: true },
          kategoria: { type: "string", nullable: true },
          ucet_md: { type: "string", nullable: true },
          ucet_d: { type: "string", nullable: true },
          typ_dokladu: { type: "string", nullable: true },
        },
        required: ["kod"],
      },
    },
  },
  required: ["riadky"],
};

/* ---------------------------------------------------- overenie odpovede */

const textNull = (n: number) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      const t = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
      return t ? t.slice(0, n) : null;
    });

const RiadokAi = z.object({
  kod: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  popis: textNull(200),
  kategoria: textNull(120),
  ucet_md: textNull(20),
  ucet_d: textNull(20),
  typ_dokladu: textNull(20),
});

const OdpovedAi = z.union([
  z.object({
    druh: z.string().nullish(),
    riadky: z.array(z.unknown()),
  }),
  z.array(z.unknown()).transform((riadky) => ({ druh: null as string | null | undefined, riadky })),
]);

/** Riadok číselníka rozpoznaný z obrázka (po overení). */
export type RiadokZObrazka = {
  kod: string;
  popis: string | null;
  kategoria: string | null;
  ucet_md: string | null;
  ucet_d: string | null;
  typ_dokladu: string | null;
  /** Kód nesedí na druh číselníka (pri KV mimo oficiálnych sekcií) — predvolene sa neuloží. */
  podozrivy: boolean;
  dovod: string | null;
};

function smerZTextu(t: string | null): SmerDokladu | null {
  const s = String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/vyd|vyst|vystup|output|issued/.test(s)) return "vydane";
  if (/prij|vstup|input|receiv|dosl/.test(s)) return "prijate";
  return null;
}

/** Typ dokladu pre uloženie podľa druhu (CHECK v DB: faktura/blocek pre predkontácie, vydane/prijate inak). */
export function typDokladuPreDruh(druh: DruhZObrazka, kod: string, text: string | null): string | null {
  if (druh === "kv_clenenie") return typDokladuKv(kod);
  if (druh === "clenenie_dph") return smerZTextu(text);
  const s = String(text ?? "").toLowerCase();
  if (s === "faktura" || s === "blocek") return s;
  return null;
}

/**
 * Rozpozná druh, keď ho človek nechal „automaticky“: väčšina kódov ako KV
 * sekcie → KV; riadky s účtami → predkontácie; inak členenie DPH. Odpoveď
 * modelu sa berie, len keď sedí na dáta.
 */
export function rozpoznajDruh(
  riadky: { kod: string; ucet_md?: string | null; ucet_d?: string | null }[],
  odhadAi?: string | null,
): DruhZObrazka {
  const n = riadky.length || 1;
  const kv = riadky.filter((r) => jeKodKv(r.kod)).length / n;
  const ucty = riadky.filter((r) => r.ucet_md || r.ucet_d).length / n;
  if (kv >= 0.6) return "kv_clenenie";
  if (ucty >= 0.5) return "predkontacia";
  if (odhadAi === "predkontacia" || odhadAi === "clenenie_dph") return odhadAi;
  return "clenenie_dph";
}

/**
 * Odpoveď modelu (text) → overené riadky. Neplatný JSON alebo tvar = chyba;
 * jednotlivý pokazený riadok sa vynechá. Rovnaký kód dvakrát = prvý vyhráva.
 */
export function rozoberOdpovedAi(
  text: string,
  druhVolba: DruhZObrazka | "auto",
): { druh: DruhZObrazka; riadky: RiadokZObrazka[]; vynechanych: number } {
  const cisty = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cisty);
  } catch {
    const m = /[[{][\s\S]*[\]}]/.exec(cisty);
    if (!m) throw new Error("AI nevrátila čitateľný zoznam riadkov.");
    try {
      json = JSON.parse(m[0]);
    } catch {
      throw new Error("AI nevrátila čitateľný zoznam riadkov.");
    }
  }
  const o = OdpovedAi.safeParse(json);
  if (!o.success) throw new Error("AI vrátila odpoveď v nesprávnom tvare.");
  let vynechanych = 0;
  const surove: z.infer<typeof RiadokAi>[] = [];
  for (const r of o.data.riadky) {
    const p = RiadokAi.safeParse(r);
    if (!p.success || !p.data.kod || p.data.kod.length > 30) {
      vynechanych++;
      continue;
    }
    surove.push(p.data);
  }
  const druh = druhVolba === "auto" ? rozpoznajDruh(surove, o.data.druh ?? null) : druhVolba;
  return { druh, riadky: normalizujRiadky(surove, druh), vynechanych };
}

/** Riadky (z AI alebo upravené v náhľade) → riadky na uloženie s príznakom podozrivých. */
export function normalizujRiadky(
  riadky: {
    kod: string;
    popis?: string | null;
    kategoria?: string | null;
    ucet_md?: string | null;
    ucet_d?: string | null;
    typ_dokladu?: string | null;
  }[],
  druh: DruhZObrazka,
): RiadokZObrazka[] {
  const videne = new Set<string>();
  const out: RiadokZObrazka[] = [];
  const t = (v: unknown, n: number) => {
    const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
    return s ? s.slice(0, n) : null;
  };
  for (const r of riadky) {
    const kod = String(r.kod ?? "").trim().slice(0, 30);
    if (!kod || videne.has(kod)) continue;
    videne.add(kod);
    const kv = druh === "kv_clenenie";
    const podozrivy = kv ? !jeKodKv(kod) : /\s/.test(kod);
    out.push({
      kod,
      popis: t(r.popis, 200),
      kategoria: t(r.kategoria, 120),
      ucet_md: druh === "predkontacia" ? t(r.ucet_md, 20) : null,
      ucet_d: druh === "predkontacia" ? t(r.ucet_d, 20) : null,
      typ_dokladu: typDokladuPreDruh(druh, kod, t(r.typ_dokladu, 20)),
      podozrivy,
      dovod: podozrivy
        ? kv
          ? "Kód nie je sekciou kontrolného výkazu (A1, A2…, B1…, B2, B3, C1…, C2…, D1, D2, KN)."
          : "Kód obsahuje medzeru — skontrolujte, či je prečítaný správne."
        : null,
    });
  }
  return out;
}

/* --------------------------------------------------------- stav riadku */

export type ExistujuciZaznam = {
  id: string;
  druh: string;
  kod: string;
  agenda: string;
  popis: string | null;
  kategoria: string | null;
  ucet_md: string | null;
  ucet_d: string | null;
  typ_dokladu: string | null;
  zdroj: string;
};

/** Nový / Zmena / Existuje (z Pohody alebo ručne zadaný — chránený) / Bez zmeny. */
export type StavRiadku = "novy" | "zmena" | "existuje_pohoda" | "existuje_rucne" | "bez_zmeny";

export const NAZOV_STAVU: Record<StavRiadku, string> = {
  novy: "Nový",
  zmena: "Zmena",
  existuje_pohoda: "Existuje (z Pohody)",
  existuje_rucne: "Existuje (ručne zadaný)",
  bez_zmeny: "Bez zmeny",
};

const POLIA = ["popis", "kategoria", "ucet_md", "ucet_d", "typ_dokladu"] as const;
type Pole = (typeof POLIA)[number];

/** Zdroj, ktorý import z obrázka sám neprepíše. */
export const jeChranenyZdroj = (zdroj: string | null | undefined) => zdroj === "pohoda" || zdroj === "rucne";

/**
 * Čo by sa na existujúcom zázname zmenilo. Prázdne pole z obrázka nič
 * nezmaže — doplní sa len to, čo AI naozaj prečítala.
 */
export function zmenyOprotiExistujucemu(
  r: Pick<RiadokZObrazka, Pole>,
  e: Pick<ExistujuciZaznam, Pole>,
): Partial<Record<Pole, string>> {
  const out: Partial<Record<Pole, string>> = {};
  for (const p of POLIA) {
    const nova = r[p];
    if (nova == null || nova === "") continue;
    if (String(e[p] ?? "").trim() !== nova) out[p] = nova;
  }
  return out;
}

/** Existujúce záznamy firmy s rovnakým kódom (párovanie company_id + druh + kod, agenda hocijaká). */
export function existujuceKodu(existujuce: ExistujuciZaznam[], druh: string, kod: string): ExistujuciZaznam[] {
  return existujuce.filter((e) => e.druh === druh && e.kod === kod);
}

export function stavRiadku(r: RiadokZObrazka, druh: DruhZObrazka, existujuce: ExistujuciZaznam[]): StavRiadku {
  const zhodne = existujuceKodu(existujuce, druh, r.kod);
  if (!zhodne.length) return "novy";
  const chraneny = zhodne.find((e) => jeChranenyZdroj(e.zdroj));
  if (chraneny) return chraneny.zdroj === "pohoda" ? "existuje_pohoda" : "existuje_rucne";
  return zhodne.some((e) => Object.keys(zmenyOprotiExistujucemu(r, e)).length) ? "zmena" : "bez_zmeny";
}

/** Predvolené zaškrtnutie v náhľade: nové a zmenené, nie podozrivé ani chránené. */
export function predvoleneVybrany(stav: StavRiadku, podozrivy: boolean): boolean {
  if (podozrivy) return false;
  return stav === "novy" || stav === "zmena";
}

export type RiadokNahladu = RiadokZObrazka & { stav: StavRiadku; vybrany: boolean };

export function nahlad(riadky: RiadokZObrazka[], druh: DruhZObrazka, existujuce: ExistujuciZaznam[]): RiadokNahladu[] {
  return riadky.map((r) => {
    const stav = stavRiadku(r, druh, existujuce);
    return { ...r, stav, vybrany: predvoleneVybrany(stav, r.podozrivy) };
  });
}

/** Spojí riadky z viacerých obrázkov — rovnaký kód len raz (prvý vyhráva). */
export function spojRiadky<T extends { kod: string }>(...zoznamy: T[][]): T[] {
  const videne = new Set<string>();
  const out: T[] = [];
  for (const z of zoznamy)
    for (const r of z) {
      if (videne.has(r.kod)) continue;
      videne.add(r.kod);
      out.push(r);
    }
  return out;
}

/* ------------------------------------------------------- plán zápisu */

export type NovyZaznam = {
  company_id: string;
  druh: DruhCiselnika;
  kod: string;
  agenda: string;
  popis: string | null;
  kategoria: string | null;
  ucet_md: string | null;
  ucet_d: string | null;
  typ_dokladu: string | null;
  druhy_dokladov: string[];
  zdroj: "obrazok";
  aktivne: true;
};

export type PlanUlozenia = {
  vlozit: NovyZaznam[];
  upravit: { id: string; zmeny: Partial<Record<Pole, string>> }[];
  /** Kódy, ktoré sa nezapísali: chránené bez výslovného prepisu alebo bez zmeny. */
  preskocene: { kod: string; dovod: "chraneny" | "bez_zmeny" | "neplatny" }[];
};

/**
 * Plán zápisu vybraných riadkov. Stav sa počíta znova z aktuálnych dát
 * (nie z toho, čo poslal prehliadač): kód z Pohody či ručne zadaný sa zmení
 * len s `prepisat: true`, zdroj existujúceho záznamu sa nikdy nemení a nič sa
 * nemaže ani nevypína.
 */
export function planUlozenia(
  companyId: string,
  druh: DruhZObrazka,
  riadky: (RiadokZObrazka & { prepisat?: boolean })[],
  existujuce: ExistujuciZaznam[],
): PlanUlozenia {
  const plan: PlanUlozenia = { vlozit: [], upravit: [], preskocene: [] };
  const prepisat = new Set(riadky.filter((x) => x.prepisat).map((x) => String(x.kod ?? "").trim()));
  for (const n of normalizujRiadky(riadky, druh)) {
    const r = { ...n, prepisat: prepisat.has(n.kod) };
    // KV DPH len s oficiálnymi sekciami — podozrivý kód treba v náhľade opraviť.
    if (druh === "kv_clenenie" && r.podozrivy) {
      plan.preskocene.push({ kod: r.kod, dovod: "neplatny" });
      continue;
    }
    const zhodne = existujuceKodu(existujuce, druh, r.kod);
    if (!zhodne.length) {
      plan.vlozit.push({
        company_id: companyId,
        druh,
        kod: r.kod,
        agenda: "",
        popis: r.popis,
        kategoria: r.kategoria,
        ucet_md: r.ucet_md,
        ucet_d: r.ucet_d,
        typ_dokladu: r.typ_dokladu,
        druhy_dokladov: druh === "predkontacia" ? [] : druhyDokladovPreSmer(r.typ_dokladu as SmerDokladu | null),
        zdroj: "obrazok",
        aktivne: true,
      });
      continue;
    }
    if (zhodne.some((e) => jeChranenyZdroj(e.zdroj)) && !r.prepisat) {
      plan.preskocene.push({ kod: r.kod, dovod: "chraneny" });
      continue;
    }
    let niecoZmenene = false;
    for (const e of zhodne) {
      const zmeny = zmenyOprotiExistujucemu(r, e);
      if (!Object.keys(zmeny).length) continue;
      niecoZmenene = true;
      plan.upravit.push({ id: e.id, zmeny });
    }
    if (!niecoZmenene) plan.preskocene.push({ kod: r.kod, dovod: "bez_zmeny" });
  }
  return plan;
}

/* ------------------------------------------------ ponuka KV na doklade */

export type MoznostKv = { kod: string; nazov: string };

/**
 * Ponuka „Členenie KV DPH“ z číselníka firmy (druh kv_clenenie) pre smer
 * dokladu; prázdne = firma nič nenaimportovala → volajúci použije systémový
 * zoznam. Kódy pre iný smer sa neponúknu, KN (všetky) áno.
 */
export function ponukaKvFirmy(
  zaznamy: { druh: string; kod: string; popis?: string | null; aktivne?: boolean | null; typ_dokladu?: string | null }[],
  smer: SmerDokladu,
): MoznostKv[] {
  const videne = new Set<string>();
  return zaznamy
    .filter((z) => z.druh === "kv_clenenie" && z.aktivne !== false)
    .filter((z) => {
      const s = z.typ_dokladu === "vydane" || z.typ_dokladu === "prijate" ? z.typ_dokladu : typDokladuKv(z.kod);
      return !s || s === smer;
    })
    .filter((z) => (videne.has(z.kod) ? false : (videne.add(z.kod), true)))
    .sort((a, b) => a.kod.localeCompare(b.kod, "sk"))
    .map((z) => ({ kod: z.kod, nazov: z.popis ? `${z.kod} — ${z.popis}` : z.kod }));
}

/**
 * Výber pre select: číselník firmy (+ „nezahŕňať“, ak v ňom nie je KN),
 * inak systémový zoznam. Hodnota uložená na doklade, ktorá v ponuke nie je,
 * sa pridá, aby ju select ukázal.
 */
export function moznostiKv(
  firmy: MoznostKv[] | null | undefined,
  systemove: readonly MoznostKv[],
  hodnota?: string | null,
): MoznostKv[] {
  let out: MoznostKv[] = firmy?.length
    ? [
        ...firmy,
        ...(firmy.some((k) => k.kod === "KN" || k.kod === "X")
          ? []
          : systemove.filter((k) => k.kod === "X")),
      ]
    : [...systemove];
  const h = String(hodnota ?? "").trim();
  if (h && h !== "auto" && !out.some((k) => k.kod === h)) out = [...out, { kod: h, nazov: h }];
  return out;
}

/**
 * Kód KV z číselníka firmy pre systémovo určenú sekciu (resolveVatClassification):
 * presná zhoda → ten kód; jediný podkód sekcie → ten; inak systémový kód.
 */
export function kvKodFirmy(kod: string | null, kodyFirmy: readonly string[] | null | undefined): string | null {
  if (!kod || !kodyFirmy?.length) return kod;
  if (kodyFirmy.includes(kod)) return kod;
  const sekcia = (k: string) => {
    const m = /^(A2|B1|C1|C2)/.exec(k);
    return m ? m[1] : k;
  };
  const kandidati = kodyFirmy.filter((k) => jeKodKv(k) && k !== "KN" && sekcia(k) === kod);
  return kandidati.length === 1 ? kandidati[0] : kod;
}
