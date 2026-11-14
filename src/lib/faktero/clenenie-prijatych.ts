/*
  Automatické členenie DPH a KV DPH prijatej faktúry a bločku — to isté,
  čo `resolveVatClassification` (clenenie-vystavenej.ts) robí pre vystavené
  doklady. Zapisuje ho fronta automatického účtovania
  (`clenenie-prijatych.server.ts`), formulár a detail ho potom ukazujú ako
  predvyplnené.

  Poradie pre každé pole:
    a) ručne zadaná hodnota na doklade (neprepisuje sa — `*_zdroj = 'rucne'`,
       alebo hodnota, ktorá sa nezhoduje s automatikou ani s pravidlom),
    b) pravidlo automatického účtovania (uplatnil ho spúšťač v DB, `pravidlo_id`),
    c) predvolené firmy (Predkontácie → Predvolené): bežné tuzemské plnenie
       `pohoda_clenenie_dph_prijata` / `_doklady`, prenesenie
       `pohoda_clenenie_dph_prijata_pdp`; KV `kv_clenenie_prijata` / `_doklady`,
    d) systém podľa režimu dane — členenie `odvodClenenia` (z číselníka firmy,
       od B1-1 vždy aspoň systémový zoznam SK Pohody), KV `kvAutoPrijatej` /
       `kvAutoBlocku` (to isté pravidlo ako výkaz a export do Pohody).

  Neplatiteľ DPH nedostane nič, KV len slovenská firma, nemecká firma ani
  členenie (účtuje cez DATEV), zálohová faktúra (proforma) nič.
*/

import {
  odvodClenenia,
  znakyPreneseniaPrijatej,
  type KodCiselnika,
  type VstupClenenia,
} from "./auto-uctovanie";
import { kvKodFirmy } from "./ciselnik-obrazok";
import { jeRucna, type ZdrojHodnoty } from "./clenenie-vystavenej";
import { rezimFirmy } from "./dph-rezim";
import { kvAutoBlocku, kvAutoPrijatej } from "./kv-auto";
import { typPrijatej } from "./pravidla-uctovania";
import { SYSTEMOVE_CLENENIA_DPH } from "./predkontacie-systemove";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Riadok = Record<string, any>;

export type DruhPrijateho = "prijata" | "blocek";

export type FirmaClenPrijatych = {
  country?: string | null;
  vat_payer?: boolean | null;
  vat_scheme?: string | null;
  ic_dph?: string | null;
  pohoda_clenenie_dph_prijata?: string | null;
  pohoda_clenenie_dph_doklady?: string | null;
  pohoda_clenenie_dph_prijata_pdp?: string | null;
  kv_clenenie_prijata?: string | null;
  kv_clenenie_doklady?: string | null;
};

export type KontextPrijatych = {
  /** Pravidlo, ktoré na doklad uplatnil spúšťač (`pravidlo_id`). */
  pravidlo?: { clenenie_dph?: string | null; kv_clenenie?: string | null } | null;
  /** Aktívne členenia DPH firmy (systémové + vlastné). */
  ciselnik?: KodCiselnika[];
  /** Kódy členenia KV firmy pre prijaté doklady (prázdne = systémové kódy). */
  kvCiselnik?: string[];
};

type Pole = "clenenie" | "kv";

export type VysledokPrijatych = {
  pohoda_clenenie_dph: string | null;
  kv_clenenie: string | null;
  zdroj: Record<Pole, ZdrojHodnoty | null>;
  rucne: Record<Pole, boolean>;
  auto: { pohoda_clenenie_dph: string | null; kv_clenenie: string | null };
};

const txt = (v: unknown) => String(v ?? "").trim() || null;

/** Vstup pre `odvodClenenia` — to isté ako `vstupClenenia` v auto-uctovanie.server.ts. */
export function vstupPrijatych(
  druh: DruhPrijateho,
  row: Riadok,
  firma: { krajina: string; platitel: boolean },
): VstupClenenia {
  const zaklad = { krajinaFirmy: firma.krajina, firmaPlatitel: firma.platitel };
  if (druh === "blocek")
    return {
      ...zaklad,
      smer: "prijate",
      blocek: true,
      opravny: Number(row.total_amount ?? 0) < 0,
      dph: Number(row.vat_amount ?? 0),
      odpocet: row.odpocet,
      partnerIcDph: row.supplier_ic_dph,
    };
  const pdpPolozky =
    Array.isArray(row.items) &&
    row.items.length > 0 &&
    row.items.every((x: Riadok) => x?.pdp || x?.reverse_charge);
  return {
    ...zaklad,
    smer: "prijate",
    opravny: typPrijatej(row.type, row.amount_total, row.opravuje_cislo) === "credit_note",
    dph: Number(row.vat_amount ?? 0),
    reverseCharge: Boolean(row.reverse_charge) || pdpPolozky,
    reverseChargeType: row.reverse_charge_type,
    dphRezim: row.dph_rezim,
    euPlnenie: row.eu_plnenie,
    osobitnaUprava: row.osobitna_uprava,
    odpocet: row.odpocet,
    partnerIcDph: row.supplier_ic_dph,
    partnerKrajina: row.supplier_country,
    zaklad: row.amount_without_vat == null ? null : Number(row.amount_without_vat),
    znakyPrenesenia: znakyPreneseniaPrijatej(row),
  };
}

export function resolveVatClassificationPrijatej(
  firma: FirmaClenPrijatych,
  druh: DruhPrijateho,
  row: Riadok,
  ctx: KontextPrijatych = {},
): VysledokPrijatych {
  const krajina = (txt(firma.country) ?? "SK").toUpperCase();
  const platitel = rezimFirmy(firma).platitel;
  const proforma = druh === "prijata" && row.type === "proforma";
  const pr = ctx.pravidlo ?? null;

  // ── členenie DPH
  let clenenie: string | null = null;
  let zdrojCl: ZdrojHodnoty | null = null;
  const vstup = vstupPrijatych(druh, row, { krajina, platitel });
  const odvodene = odvodClenenia(vstup, ctx.ciselnik ?? []);
  if (!proforma && krajina !== "DE" && platitel) {
    const predvolene =
      druh === "blocek"
        ? (txt(firma.pohoda_clenenie_dph_doklady) ?? txt(firma.pohoda_clenenie_dph_prijata))
        : txt(firma.pohoda_clenenie_dph_prijata);
    if (txt(pr?.clenenie_dph)) [clenenie, zdrojCl] = [txt(pr?.clenenie_dph), "pravidlo"];
    else if (odvodene.rezim === "pdp_tuzemsko" && txt(firma.pohoda_clenenie_dph_prijata_pdp))
      [clenenie, zdrojCl] = [txt(firma.pohoda_clenenie_dph_prijata_pdp), "firma"];
    // Predvolené firmy je pre bežné tuzemské plnenie s odpočtom — nie pre EÚ, dovoz či doklad bez DPH.
    else if ((odvodene.rezim === "tuzemsko" || odvodene.rezim === "blocek") && predvolene)
      [clenenie, zdrojCl] = [predvolene, "firma"];
    else if (odvodene.clenenieDph) [clenenie, zdrojCl] = [odvodene.clenenieDph, "system"];
  }
  const rucneCl = jeRucna(row.pohoda_clenenie_dph, row.clenenie_zdroj, clenenie, [pr?.clenenie_dph]);
  const clenenieFinal = rucneCl ? txt(row.pohoda_clenenie_dph) : clenenie;

  // ── KV DPH — len slovenský výkaz a len platiteľ.
  let kv: string | null = null;
  let zdrojKv: ZdrojHodnoty | null = null;
  if (!proforma && krajina === "SK" && platitel) {
    const kvPr = txt(pr?.kv_clenenie)?.toUpperCase() ?? null;
    const predvolene = druh === "blocek" ? txt(firma.kv_clenenie_doklady) : txt(firma.kv_clenenie_prijata);
    if (kvPr) [kv, zdrojKv] = [kvPr, "pravidlo"];
    else {
      // Bez uloženého KV, aby sa pravidlo vyhodnotilo z údajov dokladu (nie zo starej automatickej hodnoty).
      const bezKodov = { ...row, kv_clenenie: null, pohoda_clenenie_dph: null };
      const k =
        druh === "blocek"
          ? kvAutoBlocku(bezKodov, { predvolene, clenenie: clenenieFinal })
          : kvAutoPrijatej(bezKodov, { predvolene, clenenie: clenenieFinal });
      if (k)
        [kv, zdrojKv] = [
          kvKodFirmy(k, ctx.kvCiselnik),
          predvolene && k === predvolene.toUpperCase() ? "firma" : "system",
        ];
    }
  }
  const rucneKv = jeRucna(row.kv_clenenie, row.kv_zdroj, kv, [pr?.kv_clenenie]);

  return {
    pohoda_clenenie_dph: clenenieFinal,
    kv_clenenie: rucneKv ? txt(row.kv_clenenie) : kv,
    zdroj: { clenenie: rucneCl ? "rucne" : zdrojCl, kv: rucneKv ? "rucne" : zdrojKv },
    rucne: { clenenie: rucneCl, kv: rucneKv },
    auto: { pohoda_clenenie_dph: clenenie, kv_clenenie: kv },
  };
}

/**
 * Zmena riadku, ktorú výsledok vyžaduje. `lenDoplnit` (zaúčtovaný doklad):
 * vyplnené pole ostáva, prázdne sa doplní.
 */
export function zmenaClenePrijatych(row: Riadok, v: VysledokPrijatych, o: { lenDoplnit: boolean }): Riadok {
  const zmena: Riadok = {};
  const polia = [
    ["pohoda_clenenie_dph", "clenenie_zdroj", "clenenie"],
    ["kv_clenenie", "kv_zdroj", "kv"],
  ] as const;
  for (const [stlpec, zdrojStlpec, pole] of polia) {
    const teraz = txt(row[stlpec]);
    const rucne = v.rucne[pole];
    const nova = rucne ? teraz : v.auto[stlpec];
    const zdroj = rucne ? "rucne" : nova ? "auto" : null;
    if (o.lenDoplnit && teraz) continue;
    if (nova !== teraz) zmena[stlpec] = nova;
    if ((row[zdrojStlpec] ?? null) !== zdroj) zmena[zdrojStlpec] = zdroj;
  }
  return zmena;
}

// ───────────── export do Pohody: členenie režimu bez kódu na doklade ─────────────

/*
  Prijatý doklad, ktorý ide do Pohody bez vlastného členenia DPH (nezaúčtovaný,
  starší, bez behu automatiky), nesmie dostať predvolené tuzemské členenie
  firmy (PD), keď jeho režim hovorí inak:

   - nadobudnutie tovaru z EÚ (`dph_rezim = 'nadobudnutie'`) → PDnadEU
     „Nadobudnutie tovaru z iného štátu EU“ (1303 P04; bez nároku PBnadEU P06).
     POHODA SK z tohto členenia samozdaní daň (r. 05–08, riadok D01) aj
     odpočet a doklad patrí do KV B.1 — ako výkazy Faktera (nález V6;
     predtým PD s DPH 0 = žiadne samozdanenie).
   - tuzemský doklad bez nároku na odpočet (`odpocet = false`) → PB
     „Tuzemské plnenia - bez nároku“ (1302 P03) — POHODA DPH neodpočíta
     a doklad nejde do KV B.2/B.3 (nález V5; predtým PD s plnou DPH).

  Kódy zo štandardného číselníka POHODY SK (predkontacie-systemove.ts);
  firma s vlastným číselníkom dostane rovnaký kód alebo kód podľa popisu.
  `null` = režim nič osobitné nechce (rieši volajúci ako doteraz).
*/

type KodPrijatych = { kod: string; popis?: string | null; agenda?: string | null; druh?: string | null; aktivne?: boolean | null };

function prijateKody(zoznam: KodPrijatych[]): { kod: string; popis: string }[] {
  return zoznam
    .filter((z) => (z.druh ?? "clenenie_dph") === "clenenie_dph" && z.aktivne !== false && String(z.kod ?? "").trim())
    .filter((z) => {
      const a = String(z.agenda ?? "");
      const riadok = /\b([PUD])\d{2}\b/i.exec(a)?.[1] ?? /^\d+\s+([PUD])$/i.exec(a.trim())?.[1];
      return (riadok ?? String(z.kod).charAt(0)).toUpperCase() === "P";
    })
    .map((z) => ({ kod: String(z.kod).trim(), popis: String(z.popis ?? "") }));
}

function kodPrijatych(
  presny: string,
  re: RegExp[],
  ciselnik: KodPrijatych[] | null | undefined,
  krajina: string,
): string | null {
  const hladaj = (zoznam: { kod: string; popis: string }[]) => {
    const p = zoznam.find((z) => z.kod === presny);
    if (p) return p.kod;
    for (const r of re) {
      const hit = zoznam.filter((z) => r.test(z.popis));
      if (hit.length) return [...hit].sort((a, b) => a.popis.length - b.popis.length)[0].kod;
    }
    return null;
  };
  const vlastne = hladaj(prijateKody(ciselnik ?? []));
  if (vlastne || krajina !== "SK") return vlastne;
  return hladaj(prijateKody(SYSTEMOVE_CLENENIA_DPH.map(([kod, popis, agenda]) => ({ kod, popis, agenda }))));
}

export function clenenieRezimuPrijatej(
  d: Riadok,
  firma: { krajina?: string | null; platitel: boolean },
  ciselnik?: KodPrijatych[] | null,
): string | null {
  if (!firma.platitel) return null;
  const krajina = String(firma.krajina || "SK").toUpperCase();
  if (krajina === "DE") return null;
  const rezim = String(d?._rezim ?? d?.dph_rezim ?? "").trim();
  const bezNaroku = d?.odpocet === false;
  if (rezim === "nadobudnutie")
    return bezNaroku
      ? kodPrijatych("PBnadEU", [/nadobud.*tovar.*bez n[áa]roku/i], ciselnik, krajina)
      : kodPrijatych("PDnadEU", [/^nadobudnutie tovaru z in/i, /nadobud.*tovar.*(e[uú]|člensk)/i], ciselnik, krajina);
  if (!bezNaroku) return null;
  // Bez nároku len tuzemský doklad s DPH — prenesenie, dovoz a cudzia DPH majú vlastné kódy.
  if (rezim && rezim !== "tuzemsko") return null;
  if (d?._pdp || d?.reverse_charge) return null;
  const dodavatel = String(d?.supplier_country ?? "").trim().toUpperCase();
  const icDph = String(d?.supplier_ic_dph ?? "").trim().toUpperCase();
  if ((dodavatel && dodavatel !== krajina) || (/^[A-Z]{2}/.test(icDph) && icDph.slice(0, 2) !== krajina)) return null;
  const rozpis = Array.isArray(d?.vat_breakdown) ? d.vat_breakdown : [];
  const dph = rozpis.length
    ? rozpis.reduce((a: number, x: Riadok) => a + Math.abs(Number(x?.dph ?? 0)), 0)
    : Math.abs(Number(d?.vat_amount ?? 0));
  if (dph < 0.005) return null;
  return kodPrijatych("PB", [/tuzem.*bez n[áa]roku/i, /bez n[áa]roku/i], ciselnik, krajina);
}
