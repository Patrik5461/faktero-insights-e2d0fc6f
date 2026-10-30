/*
  Nastavenia Nespracovaných dokladov pre firmu — správanie pri vyťažení,
  kontrole a vytvorení dokladu. Ukladajú sa v `companies.uctovanie_nastavenia`
  pod kľúčom `nespracovane` (nový stĺpec netreba, kopírovanie nastavení do
  iných firiem ich prenesie samo).

  Predvolené hodnoty zodpovedajú tomu, ako Faktero fungovalo doteraz —
  okrem `zauctovat`: vytvorením z Nespracovaných je doklad skontrolovaný,
  zaúčtovaný a pripravený na export, keď sa preň dá určiť predkontácia aj
  členenie DPH (vlastné, z pravidla, z kategórie alebo predvolené firmy).
*/

export type NastaveniaNespracovanych = {
  /** Vytvorená prijatá faktúra je rovno zaúčtovaná (pripravená na export). */
  zauctovat: boolean;
  /** Po vytvorení otvoriť ďalší nespracovaný doklad, inak zoznam. */
  dalsi: boolean;
  /** Splatnosť pred dátumom vystavenia doklad zastaví. */
  kontrolaSplatnosti: boolean;
  /**
   * Odchýlka súčtu položiek od sumy dokladu (v centoch), pri ktorej sa doklad
   * dá vytvoriť — rozdiel sa doplní vyrovnávacou položkou.
   */
  toleranciaCenty: number;
  /** Položky faktúr sa použijú hneď po vyťažení (inak čakajú vypnuté). */
  polozkyFaktur: boolean;
  /** Položky bločkov sa použijú hneď po vyťažení. */
  polozkyBlockov: boolean;
  /** Číslo dodacieho listu sa z dokladu preberá. */
  dodaciList: boolean;
  /**
   * Doklad so sumami vo viacerých menách (napr. CZK aj EUR, alebo EUR
   * s prepočtom na CZK) sa vyťaží v domácej mene firmy (SK EUR, CZ CZK).
   */
  domacaMena: boolean;
  /**
   * Faktúra, na ktorej je ako príjemca platby IBAN niektorého účtu firmy, je
   * vystavená faktúra firmy — upozorní sa a medzi prijaté ide len po potvrdení.
   */
  typPodlaIban: boolean;
  /**
   * Predpony čísla objednávky (napr. „OBJ-", „PO") — podľa nich sa na doklade
   * spozná číslo objednávky firmy (AI ich dostane v pokyne, výsledok sa overí).
   */
  predponyObjednavky: string[];
};

export const PREDVOLENE_NESPRACOVANE: NastaveniaNespracovanych = {
  zauctovat: true,
  dalsi: true,
  kontrolaSplatnosti: true,
  toleranciaCenty: 0,
  polozkyFaktur: true,
  polozkyBlockov: true,
  dodaciList: true,
  domacaMena: true,
  typPodlaIban: true,
  predponyObjednavky: [],
};

/** Najviac toľko predpôn a takú dĺžku jednej — viac je už preklep, nie predpona. */
export const MAX_PREDPON = 10;
export const MAX_DLZKA_PREDPONY = 20;

/** Predpony z nastavení — orezané, bez prázdnych a duplicít (bez ohľadu na veľkosť písmen). */
export function upravPredpony(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const p = String(x ?? "")
      .trim()
      .slice(0, MAX_DLZKA_PREDPONY);
    if (p && !out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
    if (out.length >= MAX_PREDPON) break;
  }
  return out;
}

/** Najväčšia povolená tolerancia — viac by už nebolo zaokrúhlenie, ale chyba v sumách. */
export const MAX_TOLERANCIA_CENTOV = 100;

const ano = (v: unknown, predvolene: boolean) => (typeof v === "boolean" ? v : predvolene);

/** Nastavenia z `companies.uctovanie_nastavenia` (chýbajúce = predvolené). */
export function nastaveniaNespracovanych(uctovanieNastavenia: unknown): NastaveniaNespracovanych {
  const vsetko =
    uctovanieNastavenia && typeof uctovanieNastavenia === "object"
      ? (uctovanieNastavenia as Record<string, unknown>)
      : {};
  const n =
    vsetko.nespracovane && typeof vsetko.nespracovane === "object"
      ? (vsetko.nespracovane as Record<string, unknown>)
      : {};
  const p = PREDVOLENE_NESPRACOVANE;
  const tol = Math.round(Number(n.toleranciaCenty));
  return {
    zauctovat: ano(n.zauctovat, p.zauctovat),
    dalsi: ano(n.dalsi, p.dalsi),
    kontrolaSplatnosti: ano(n.kontrolaSplatnosti, p.kontrolaSplatnosti),
    toleranciaCenty: Number.isFinite(tol) ? Math.min(MAX_TOLERANCIA_CENTOV, Math.max(0, tol)) : 0,
    polozkyFaktur: ano(n.polozkyFaktur, p.polozkyFaktur),
    polozkyBlockov: ano(n.polozkyBlockov, p.polozkyBlockov),
    dodaciList: ano(n.dodaciList, p.dodaciList),
    domacaMena: ano(n.domacaMena, p.domacaMena),
    typPodlaIban: ano(n.typPodlaIban, p.typPodlaIban),
    predponyObjednavky: upravPredpony(n.predponyObjednavky),
  };
}

/**
 * Úprava vyťažených údajov podľa nastavení firmy: položky čakajú vypnuté
 * (dajú sa jedným prepínačom zapnúť), číslo dodacieho listu sa nepreberie.
 * Čo už človek rozhodol (`polozkyVypnute` je vyplnené), sa nemení.
 */
export function upravVytazeneUdaje<
  U extends {
    polozky: unknown[];
    polozkyVypnute?: boolean;
    dodaciList?: string;
    objednavka?: string;
  },
>(
  u: U,
  druh: string | null | undefined,
  n: NastaveniaNespracovanych,
  /** Texty z vyťaženia (odpoveď AI), v ktorých sa hľadá číslo objednávky podľa predpôn. */
  texty: string[] = [],
): U {
  let out = u;
  const predpony = n.predponyObjednavky ?? [];
  if (predpony.length && !maPredponu(out.objednavka, predpony)) {
    const cislo = cisloObjednavkyPodlaPredpon([out.objednavka ?? "", ...texty], predpony);
    if (cislo) out = { ...out, objednavka: cislo };
  }
  const blocek = druh === "blocek";
  const vytazovat = blocek ? n.polozkyBlockov : n.polozkyFaktur;
  if (!vytazovat && out.polozky.length && out.polozkyVypnute === undefined)
    out = { ...out, polozkyVypnute: true };
  if (!n.dodaciList && out.dodaciList) out = { ...out, dodaciList: "" };
  return out;
}

/**
 * Dá sa pre prijatú faktúru určiť predkontácia aj členenie DPH? Rovnaké
 * poradie ako kontrola pred exportom (`prekazkaDokladu`): vlastný kód,
 * kód podľa kategórie, predvolený kód firmy.
 */
export function kodyPrijatejUrcene(
  p: {
    pohoda_predkontacia?: string | null;
    pohoda_clenenie_dph?: string | null;
    category?: string | null;
    reverse_charge?: boolean | null;
  },
  firma: Record<string, any> | null | undefined,
  podlaKategorie: Record<string, { predkontacia?: string | null; clenenie?: string | null }> = {},
): boolean {
  const k = (v: unknown) => String(v ?? "").trim();
  const kat = podlaKategorie[k(p.category)] ?? {};
  const pk =
    k(p.pohoda_predkontacia) || k(kat.predkontacia) || k(firma?.pohoda_predkontacia_prijata);
  const cl =
    k(p.pohoda_clenenie_dph) ||
    k(kat.clenenie) ||
    (p.reverse_charge ? k(firma?.pohoda_clenenie_dph_prijata_pdp) : "") ||
    k(firma?.pohoda_clenenie_dph_prijata);
  return Boolean(pk && cl);
}

/**
 * Je bloček vytvorený z Nespracovaných zaúčtovaný? Rovnako ako ručná
 * predkontácia bločku (`zauctujDokladyFn`): určená predkontácia = zaúčtovaný.
 * Kód, ktorý vybral človek (hlavička alebo všetky položky), zaúčtuje vždy;
 * kód, ktorý doplnilo pravidlo až pri zápise, len pri zapnutom „Vytvoriť =
 * zaúčtovať“ a bez nepotvrdeného návrhu AI. Bez toho by bloček ostal
 * nezaúčtovaný a automatické zaúčtovanie by ho vzalo ako nový.
 */
export function blocekZauctovanyPriVytvoreni(a: {
  /** Predkontácia, ktorú zadal človek (hlavička), alebo kódy na všetkých položkách. */
  odCloveka: boolean;
  /** Predkontácia na uloženom bločku (vrátane tej od spúšťača pravidla). */
  predkontaciaPoZapise: string | null | undefined;
  zauctovat: boolean;
  nepotvrdenychNavrhov: number;
}): boolean {
  if (a.odCloveka) return true;
  return Boolean(
    String(a.predkontaciaPoZapise ?? "").trim() && a.zauctovat && a.nepotvrdenychNavrhov === 0,
  );
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Dátum „12.10.2026" za predponou nie je číslo objednávky („Po 12.10.2026" = pondelok). */
const JE_DATUM = /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/;

/** Začína hodnota niektorou predponou (bez ohľadu na veľkosť písmen)? */
export function maPredponu(hodnota: string | null | undefined, predpony: string[]): boolean {
  const h = String(hodnota ?? "")
    .trim()
    .toLowerCase();
  return Boolean(h) && predpony.some((p) => p && h.startsWith(p.toLowerCase()));
}

/**
 * Číslo objednávky podľa predpôn firmy — prvý výskyt v textoch (v poradí, ako
 * prišli). Za predponou môže byť oddeľovač („PO: 4500123", „OBJ- 15") a číslo
 * musí obsahovať aspoň jednu číslicu. Vráti sa predpona, ako je vytlačená,
 * a hneď za ňou číslo („OBJ-2026-015", „PO4500123").
 */
export function cisloObjednavkyPodlaPredpon(
  texty: (string | null | undefined)[],
  predpony: string[],
): string | null {
  const zoznam = upravPredpony(predpony).sort((a, b) => b.length - a.length);
  if (!zoznam.length) return null;
  for (const text of texty) {
    const t = String(text ?? "");
    if (!t.trim()) continue;
    let najskor: { poz: number; cislo: string } | null = null;
    for (const p of zoznam) {
      // Pred predponou nesmie byť písmeno ani číslica — „SPO123" nie je „PO123".
      const vzor = new RegExp(
        `(?<![\\p{L}\\d])${escapeRegex(p)}[\\s:#.\\-/]{0,3}([\\p{L}\\d][\\p{L}\\d\\-/._]*)`,
        "giu",
      );
      for (const m of t.matchAll(vzor)) {
        const zvysok = m[1].replace(/[._\-/]+$/, "");
        if (!/\d/.test(zvysok) || JE_DATUM.test(zvysok)) continue;
        const poz = m.index ?? 0;
        if (!najskor || poz < najskor.poz) {
          // Predpona tak, ako je vytlačená; z oddeľovača ostane len pomlčka,
          // lomka či bodka („PO: 4500123" → „PO4500123", „OBJ-15" ostane).
          const vytlacena = m[0].slice(0, p.length);
          const oddelovac = m[0].slice(p.length, m[0].length - m[1].length).replace(/[\s:#]/g, "");
          najskor = { poz, cislo: `${vytlacena}${oddelovac}${zvysok}` };
        }
        break;
      }
    }
    if (najskor) return najskor.cislo;
  }
  return null;
}

/**
 * Texty z odpovede AI, v ktorých sa hľadá číslo objednávky podľa predpôn:
 * najprv samotné `order_number`, potom popis, nadpis, zhrnutie a položky.
 * Číslo faktúry, VS ani dodací list sa neberú — tie objednávkou nie sú.
 */
export function textyPreObjednavku(ai: Record<string, unknown> | null | undefined): string[] {
  if (!ai || typeof ai !== "object") return [];
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const polozky = Array.isArray(ai.items)
    ? (ai.items as unknown[]).map((p) => s((p as Record<string, unknown> | null)?.name))
    : [];
  return [
    s(ai.order_number),
    s(ai.description),
    s(ai.document_title),
    s(ai.summary),
    s(ai.other_subject),
    s(ai.note),
    ...polozky,
  ].filter(Boolean);
}
