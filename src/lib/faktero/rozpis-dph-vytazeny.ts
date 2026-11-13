/**
 * Rozpis DPH z vyťaženia prijatého dokladu (faktúra, bloček, doklad z mailu).
 *
 * Prečo samostatne: 5. 11. 2026 prišla faktúra RISS Plus s rozpisom
 * 0 % 26,90 a 23 % 116,87 / 26,88. AI dala položky so sumou riadku BEZ DPH,
 * starý `rozpisZAi` ich bral ako sumy S DPH, súčet nesedel a spadol na jeden
 * riadok so sadzbou dopočítanou z pomeru 26,88 / 143,77 = 18,7 % → „19 %“.
 * Celý základ tak ticho dostala sadzba, ktorá na doklade vôbec nebola.
 *
 * Teraz sa rozpis skladá v tomto poradí a berie sa prvý, ktorý prejde
 * kontrolou (`skontrolujRozpisDph`):
 *   1. tabuľka „Rozpis DPH“ / rekapitulácia z dokladu (`vat_breakdown` od AI),
 *   2. položky po sadzbách — skúsi sa výklad sumy riadku bez DPH aj s DPH,
 *   3. jedna sadzba, ale len keď daň zo základu pri nej naozaj vychádza.
 * Keď neprejde nič, vráti sa najlepší kandidát spolu s chybami kontroly —
 * doklad potom ide na kontrolu, nikdy sa neuloží potichu.
 *
 * Čistá logika bez I/O.
 */
import {
  jeKategoriaDph,
  jePrenesenieZTextu,
  kategoriaRiadku,
  skontrolujRozpisDph,
  TOLERANCIA_DPH,
  type KategoriaDph,
  type VysledokKontroly,
} from "./rozpis-dph-kontrola";
import { jePolozkaZaokruhlenia } from "./zaokruhlenie-blocku";
import { krajinaDane, sadzbyKrajiny, zoradPodlaSadzby } from "./vat-rates";
import { lenZakonneSadzby, napravRozpisDph } from "./napravy-dph-vytazenia";
import { krajinaDodavatelaDph, skontrolujDph, zakonneSadzby } from "./dph-pravidlo";
import { sadzbyStatuSHistoriou } from "./sadzby-eu";

/** Riadok rozpisu v tvare nespracovaných dokladov a `vat_breakdown`. */
export type RiadokRozpisuVytazeny = {
  sadzba: number;
  zaklad: number;
  dph: number;
  vat_category: KategoriaDph;
};

export type ZdrojRozpisu = "doklad" | "polozky" | "sumy" | "ziadny";

export type VysledokRozpisu = {
  rozpis: RiadokRozpisuVytazeny[];
  zdroj: ZdrojRozpisu;
  kontrola: VysledokKontroly;
  /** Sumy dokladu, voči ktorým sa kontrolovalo (kladné). */
  sumy: { bezDph: number; dph: number } | null;
  /** Celá faktúra je v prenesení daňovej povinnosti. */
  prenesenie: boolean;
  /** Čo sa na rozpise deterministicky opravilo (`napravy-dph-vytazenia.ts`). */
  naprava?: string;
};

export type KontextRozpisu = { krajina?: string | null; datumDodania?: string | null };

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
};

const OK: VysledokKontroly = { ok: true, chyby: [] };

/** Text dokladu, v ktorom sa hľadá zmienka o prenesení. */
function textPrenesenia(ai: Record<string, unknown>): string {
  return [ai.reverse_charge_text, ai.vat_note, ai.note]
    .filter((x) => typeof x === "string")
    .join(" ");
}

/**
 * Vyzerá doklad, na ktorom sa „celkom“ rovná základu a DPH je nenulová, ako
 * samozdanenie (prenesenie)? Príznak alebo veta o prenesení, zmienka
 * „samozdanenie“ / „reverse charge“ v texte, riadok rozpisu či položka
 * v prenesení, alebo DPH presne zo základu × zákonná sadzba.
 */
function jeSamozdanenie(ai: Record<string, unknown>, zaklad: number, dph: number, krajina?: string | null): boolean {
  if (dokladSPrenesenim(ai)) return true;
  const texty = [
    textPrenesenia(ai),
    ...(Array.isArray(ai.items) ? (ai.items as any[]).map((p) => String(p?.description ?? p?.name ?? "")) : []),
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/samozdan|samovymer|self[\s-]?assess|reverse[\s-]?charge|prenesen\w*\s+danov|prenesenie/.test(texty)) return true;
  const riadky = [
    ...(Array.isArray(ai.vat_breakdown) ? (ai.vat_breakdown as any[]) : []),
    ...(Array.isArray(ai.items) ? (ai.items as any[]) : []),
  ];
  if (riadky.some((r) => r?.vat_category === "reverse_charge" || r?.reverse_charge === true || r?.pdp === true))
    return true;
  const dod = krajinaDodavatela(ai);
  const sadzby = new Set([
    ...zakonneSadzby(krajinaDane(krajina ?? "SK"), null),
    ...(dod ? sadzbyStatuSHistoriou(dod) : []),
  ]);
  return [...sadzby].some((s) => s > 0 && Math.abs((Math.abs(zaklad) * s) / 100 - Math.abs(dph)) <= 0.02 + 1e-9);
}

/** Doklad hovorí o prenesení daňovej povinnosti (príznak alebo veta). */
function dokladSPrenesenim(ai: Record<string, unknown>): boolean {
  return ai.reverse_charge === true || jePrenesenieZTextu(textPrenesenia(ai));
}

/**
 * Kategória riadku z vyťaženia. Uvedená od AI má prednosť (okrem „standard“
 * pri 0 %, to je protirečenie); položka v prenesení je `reverse_charge`;
 * 0 % pri doklade s vetou o prenesení tiež. Ostatné 0 % bez dôvodu →
 * `needs_review`, nad nulou `standard`.
 */
function kategoria(
  sadzba: number,
  uvedena: unknown,
  pdp: boolean,
  prenesenieDokladu: boolean,
  /** Riadok bez dane — pri doklade s prenesením je to prenesená časť. */
  bezDane = false,
): KategoriaDph {
  if (pdp) return "reverse_charge";
  if (prenesenieDokladu && bezDane && sadzba > 0 && !jeKategoriaDph(uvedena))
    return "reverse_charge";
  if (jeKategoriaDph(uvedena) && !(uvedena === "standard" && sadzba === 0)) return uvedena;
  if (sadzba === 0 && prenesenieDokladu) return "reverse_charge";
  return kategoriaRiadku({ rate: sadzba });
}

/** Znamienko súčtu (−1 len keď je súčet záporný — dobropis). */
function znamienkoCelku(sumy: number[]): 1 | -1 {
  return sumy.reduce((a, x) => a + x, 0) < 0 ? -1 : 1;
}

/** Zlúči riadky s rovnakou sadzbou a kategóriou. */
function zluc(riadky: RiadokRozpisuVytazeny[]): RiadokRozpisuVytazeny[] {
  const po = new Map<string, RiadokRozpisuVytazeny>();
  for (const r of riadky) {
    const k = `${r.sadzba}|${r.vat_category}`;
    const x = po.get(k) ?? { sadzba: r.sadzba, zaklad: 0, dph: 0, vat_category: r.vat_category };
    x.zaklad += r.zaklad;
    x.dph += r.dph;
    po.set(k, x);
  }
  return [...po.values()].map((r) => ({ ...r, zaklad: r2(r.zaklad), dph: r2(r.dph) }));
}

/**
 * Tabuľka rozpisu priamo z dokladu (`vat_breakdown` od AI). Stĺpcová
 * rekapitulácia („Nie je predmetom DPH | Oslobodené | Znížená | Základná |
 * Celkom“) prichádza už rozložená po riadkoch s kategóriou; stĺpec „Celkom“
 * nie je riadok sadzby — keby ho AI predsa poslala, vypadne.
 */
function zDokladu(
  ai: Record<string, unknown>,
  prenesenie: boolean,
): RiadokRozpisuVytazeny[] | null {
  const pole = Array.isArray(ai.vat_breakdown) ? (ai.vat_breakdown as any[]) : [];
  /*
    Znamienko celého rozpisu: dobropis má záporné všetky riadky (otočia sa),
    no záporný riadok medzi kladnými (odpočet zdanenej zálohy, zľava v
    sadzbe) odpočítava — predtým sa z neho stal kladný a rozpis narástol.
  */
  const zn = znamienkoCelku(pole.map((x) => num(x?.base ?? x?.zaklad) ?? 0));
  const riadky: RiadokRozpisuVytazeny[] = [];
  for (const x of pole) {
    if (/celkom|spolu|total|celkem/i.test(String(x?.label ?? x?.column ?? ""))) continue;
    const sadzba = num(x?.rate ?? x?.sadzba);
    const zaklad = num(x?.base ?? x?.zaklad);
    const dph = num(x?.vat ?? x?.dph);
    if (sadzba === null || zaklad === null) return null;
    // Prázdne stĺpce rekapitulácie (bez základu aj dane) sa vynechajú.
    if (!zaklad && !dph) continue;
    riadky.push({
      sadzba,
      zaklad: zn * zaklad,
      dph: zn * (dph ?? 0),
      vat_category: kategoria(
        sadzba,
        x?.vat_category ?? x?.category,
        x?.reverse_charge === true,
        prenesenie,
        !Math.abs(dph ?? 0),
      ),
    });
  }
  return riadky.length ? zluc(riadky) : null;
}

/**
 * Rozpis z položiek. Suma riadku (`total`) býva raz bez DPH, raz s DPH —
 * podľa toho, aký stĺpec na doklade AI prečítala. Skúsia sa oba výklady
 * a platí ten, ktorého súčet sedí so sumou dokladu.
 */
function zPoloziek(
  ai: Record<string, unknown>,
  z: number | null,
  d: number | null,
  spolu: number | null,
  prenesenie: boolean,
): RiadokRozpisuVytazeny[] | null {
  const polozky = (Array.isArray(ai.items) ? (ai.items as any[]) : []).filter(
    (p) => !jePolozkaZaokruhlenia(p),
  );
  if (!polozky.length) return null;
  // Záporné položky (zľava, vrátenie obalu, odpočet zálohy) odpočítavajú; dobropis s celým záporným zoznamom sa otočí.
  const zn = znamienkoCelku(
    polozky.map((p) => num(p?.total) ?? (num(p?.quantity) ?? 1) * (num(p?.unit_price) ?? 0)),
  );
  const riadky: { sadzba: number; suma: number; kat: KategoriaDph }[] = [];
  for (const p of polozky) {
    const s = num(p?.vat_rate);
    let suma = num(p?.total);
    if (suma === null) {
      const q = num(p?.quantity) ?? 1;
      const c = num(p?.unit_price);
      suma = c === null ? null : q * c;
    }
    if (s === null || suma === null) return null;
    // Celá faktúra v prenesení: každá položka je prenesená.
    const pdp = p?.reverse_charge === true || p?.pdp === true || ai.reverse_charge === true;
    riadky.push({
      sadzba: s,
      suma: zn * suma,
      kat: kategoria(s, p?.vat_category, pdp, prenesenie),
    });
  }
  // Daň nesie len zdaniteľné plnenie (a neurčené, kým ho človek neurčí).
  const sDani = (k: KategoriaDph) => k === "standard" || k === "needs_review";
  const tol = Math.max(0.03, 0.01 * riadky.length);
  const sucet = riadky.reduce((a, r) => a + r.suma, 0);
  const bezDph = z !== null ? Math.abs(z) : null;
  const sDph =
    spolu !== null ? Math.abs(spolu) : bezDph !== null && d !== null ? bezDph + Math.abs(d) : null;

  const vyklady: ("netto" | "brutto")[] = [];
  if (bezDph !== null && Math.abs(sucet - bezDph) <= tol) vyklady.push("netto");
  // Brutto: základ riadku = suma / (1 + sadzba); porovná sa súčet základov.
  const zakladyBrutto = riadky.reduce(
    (a, r) => a + (sDani(r.kat) ? r.suma / (1 + r.sadzba / 100) : r.suma),
    0,
  );
  if (
    (bezDph !== null && Math.abs(zakladyBrutto - bezDph) <= tol) ||
    (bezDph === null && sDph !== null && Math.abs(sucet - sDph) <= tol)
  )
    vyklady.push("brutto");
  if (!vyklady.length) return null;
  // Sedia oba (napr. všetko v 0 %)? Rozhodne, čo AI povedala o stĺpci.
  const vyklad = vyklady.length > 1 && ai.items_total_with_vat === true ? "brutto" : vyklady[0]!;

  const out = zluc(
    riadky.map((r) => {
      const dani = sDani(r.kat);
      const zaklad = vyklad === "netto" || !dani ? r.suma : r.suma / (1 + r.sadzba / 100);
      const dph = !dani ? 0 : vyklad === "netto" ? (zaklad * r.sadzba) / 100 : r.suma - zaklad;
      return { sadzba: r.sadzba, zaklad, dph, vat_category: r.kat };
    }),
  ).sort((a, b) => a.sadzba - b.sadzba);
  /*
    Centy dorovná najnižšia sadzba (ako doteraz), daň ale len zdaniteľný
    riadok — 0 % či oslobodené s daňou by bol nezmysel.
  */
  if (bezDph !== null) {
    const rozdiel = r2(bezDph - out.reduce((a, r) => a + r.zaklad, 0));
    if (rozdiel && Math.abs(rozdiel) <= tol) out[0]!.zaklad = r2(out[0]!.zaklad + rozdiel);
  }
  if (d !== null) {
    const rozdiel = r2(Math.abs(d) - out.reduce((a, r) => a + r.dph, 0));
    const ciel = out.find((r) => r.sadzba > 0 && sDani(r.vat_category));
    if (ciel && rozdiel && Math.abs(rozdiel) <= tol) ciel.dph = r2(ciel.dph + rozdiel);
  }
  return out;
}

/**
 * Jeden riadok zo súm dokladu — len povolená sadzba, pri ktorej daň zo
 * základu naozaj vychádza. Sadzba sa NIKDY nedopočítava ako DPH / základ
 * (tak vzniklo „1,46 %“ aj „19 %“): keď nesedí žiadna, riadok je
 * `needs_review` a doklad ide na kontrolu.
 */
function zoSum(
  z: number,
  d: number,
  kontext: KontextRozpisu,
  prenesenie: boolean,
  /** Dodávateľ bez IČ DPH a doklad bez dane — DPH v ňom nie je, do priznania nejde. */
  neplatitel: boolean,
): RiadokRozpisuVytazeny {
  const krajina = krajinaDane(kontext.krajina ?? "SK");
  const den = kontext.datumDodania || null;
  const zz = r2(Math.abs(z));
  const dd = r2(Math.abs(d));
  if (!dd)
    return {
      sadzba: 0,
      zaklad: zz,
      dph: 0,
      vat_category: prenesenie ? "reverse_charge" : neplatitel ? "out_of_scope" : "needs_review",
    };
  const sedia = zz
    ? sadzbyKrajiny(krajina, den).filter(
        (s) => s > 0 && Math.abs((zz * s) / 100 - dd) <= TOLERANCIA_DPH + 1e-9,
      )
    : [];
  if (sedia.length === 1)
    return { sadzba: sedia[0]!, zaklad: zz, dph: dd, vat_category: "standard" };
  return { sadzba: 0, zaklad: zz, dph: dd, vat_category: "needs_review" };
}

/** Krajina dodávateľa z vyťaženia (ISO kód), keď ju doklad uvádza. */
function krajinaDodavatela(ai: Record<string, unknown>): string | null {
  return krajinaDodavatelaDph(
    ai.supplier_country as string | null | undefined,
    (ai.supplier_ic_dph ?? ai.ic_dph) as string | null | undefined,
  );
}

/**
 * Rozpis DPH z výstupu AI. `kontext.krajina` je krajina firmy (sadzby),
 * `datumDodania` deň, ku ktorému sa sadzby overujú — bez neho sa vezme
 * dátum dodania či vystavenia z dokladu.
 */
export function rozpisZVytazenia(
  ai: Record<string, unknown> | null | undefined,
  kontext: KontextRozpisu = {},
): VysledokRozpisu {
  if (!ai) return { rozpis: [], zdroj: "ziadny", kontrola: OK, sumy: null, prenesenie: false };
  const dph = num(ai.vat_amount);
  /*
    Suma dokladu je po zaokrúhlení („Zaokrúhlenie“, haliérové vyrovnanie) —
    rozpis DPH je bez neho, tak sa porovnáva so sumou pred zaokrúhlením.
  */
  const zaokr = num(ai.rounding);
  const spoluSurove = num(ai.amount_total);
  const spolu =
    spoluSurove !== null && zaokr !== null && Math.abs(zaokr) <= 0.05 ? r2(spoluSurove - zaokr) : spoluSurove;
  let zaklad = num(ai.amount_without_vat);
  /*
    (b) Základ hlavičky = suma s DPH (AI prečítala „Celkom“ ako základ):
    základ sa rovná sume dokladu a DPH je nenulová → základ = suma − DPH.
    NIE pri prenesení: tam je „celkom“ naozaj základ a vytlačená DPH je
    samozdanená (odberateľ ju priznáva sám) — preto ani vtedy, keď DPH sedí
    na základ × zákonná sadzba (presne to je samozdanenie).
  */
  if (
    zaklad !== null &&
    spolu !== null &&
    dph !== null &&
    Math.abs(dph) > 0.004 &&
    Math.abs(zaklad - spolu) <= 0.02 &&
    !jeSamozdanenie(ai, zaklad, dph, kontext.krajina)
  )
    zaklad = r2(spolu - dph);
  const z = zaklad ?? (spolu !== null && dph !== null ? spolu - dph : null);
  const d = dph ?? (spolu !== null && z !== null ? spolu - z : null);
  const datum =
    kontext.datumDodania ??
    ([ai.delivery_date, ai.issue_date].find(
      (x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x),
    ) as string | undefined) ??
    null;
  const kx = { krajina: kontext.krajina ?? "SK", datumDodania: datum, krajinaDodavatela: krajinaDodavatela(ai) };

  const sPrenesenim = dokladSPrenesenim(ai);
  const neplatitel =
    !String(ai.supplier_ic_dph ?? ai.ic_dph ?? "").trim() && !Math.abs(d ?? 0) && !sPrenesenim;
  const kandidati: { zdroj: ZdrojRozpisu; rozpis: RiadokRozpisuVytazeny[] }[] = [];
  const doklad = zDokladu(ai, sPrenesenim);
  if (doklad) kandidati.push({ zdroj: "doklad", rozpis: doklad });
  const polozky = zPoloziek(ai, z, d, spolu, sPrenesenim);
  if (polozky) kandidati.push({ zdroj: "polozky", rozpis: polozky });
  if (z !== null || d !== null)
    kandidati.push({ zdroj: "sumy", rozpis: [zoSum(z ?? 0, d ?? 0, kx, sPrenesenim, neplatitel)] });
  if (!kandidati.length)
    return { rozpis: [], zdroj: "ziadny", kontrola: OK, sumy: null, prenesenie: false };

  /*
    Sumy dokladu: čo uviedol doklad; keď chýbajú, súčet prvého kandidáta
    (tabuľka rozpisu je spoľahlivejšia než nič).
  */
  const prvy = kandidati[0]!.rozpis;
  const sumy = {
    bezDph: z !== null ? Math.abs(z) : r2(prvy.reduce((a, r) => a + r.zaklad, 0)),
    dph: d !== null ? Math.abs(d) : r2(prvy.reduce((a, r) => a + r.dph, 0)),
  };
  const vyhodnotene = kandidati.map((k) => ({
    ...k,
    kontrola: skontrolujRozpisDph(
      k.rozpis.map((r) => ({
        rate: r.sadzba,
        base: r.zaklad,
        vat: r.dph,
        vat_category: r.vat_category,
      })),
      sumy,
      kx,
    ),
  }));
  let vybrany: (typeof vyhodnotene)[number] & { naprava?: string } =
    vyhodnotene.find((k) => k.kontrola.ok) ?? vyhodnotene[0]!;
  /*
    Žiadny kandidát neprešiel — deterministická náprava (základ s DPH,
    chýbajúci riadok bez dane). Prejde len taká, po ktorej kontrola sedí;
    inak ostáva pôvodný kandidát s chybami a doklad ide na kontrolu.
  */
  if (!vybrany.kontrola.ok) {
    const poloziek = Array.isArray(ai.items) ? (ai.items as unknown[]).length : 0;
    for (const k of vyhodnotene) {
      const n = napravRozpisDph(k.rozpis, sumy, ai, poloziek);
      if (!n) continue;
      const kontrola = skontrolujRozpisDph(
        n.rozpis.map((r) => ({ rate: r.sadzba, base: r.zaklad, vat: r.dph, vat_category: r.vat_category })),
        sumy,
        kx,
      );
      if (kontrola.ok) {
        vybrany = { zdroj: k.zdroj, rozpis: n.rozpis, kontrola, naprava: n.naprava };
        break;
      }
      /*
        Súčty po náprave sedia a ostal len neurčený dôvod nulovej dane
        doplneného riadku — taký rozpis je úplný a veta pre človeka konkrétna
        („Riadok 0 % so základom 8,50 nemá dôvod…“); doklad ide na kontrolu.
      */
      if (!vybrany.naprava && kontrola.chyby.every((c) => c.kod === "neplatna_kategoria"))
        vybrany = { zdroj: k.zdroj, rozpis: n.rozpis, kontrola, naprava: n.naprava };
    }
  }
  /*
    Poistka: sadzba mimo zákonných sa neuloží nikdy — ani keď doklad ide na
    kontrolu. Kontrola (a dôvod na kontrolu) ostáva z pôvodného rozpisu.
  */
  const rozpis = zoradPodlaSadzby(
    lenZakonneSadzby(vybrany.rozpis, {
      krajina: kx.krajina,
      den: kx.datumDodania,
      krajinaDodavatela: krajinaDodavatela(ai),
    }),
    "sadzba",
  );
  /*
    Spoločné pravidlo (`dph-pravidlo.ts`) — to isté, čo stráži zápis do
    databázy. Keď kontrola rozpisu prešla, no pravidlo nie, doklad ide na
    kontrolu s jeho vetou (inak by ho zápis odmietol).
  */
  let kontrola = vybrany.kontrola;
  /* Poistka vynulovala DPH riadku 0 % (sadzbu nikto neuviedol) — rozpis nie je úplný. */
  const dphPred = r2(vybrany.rozpis.reduce((a, r) => a + r.dph, 0));
  const dphPo = r2(rozpis.reduce((a, r) => a + r.dph, 0));
  if (kontrola.ok && Math.abs(dphPred - dphPo) > 0.004)
    kontrola = {
      ok: false,
      chyby: [
        {
          kod: "neplatna_sadzba",
          sprava: "Pri časti DPH doklad neuvádza sadzbu a žiadna zákonná sadzba na ňu nesedí — doplňte rozpis DPH po sadzbách.",
        },
      ],
    };
  if (kontrola.ok && rozpis.length) {
    const chyby = skontrolujDph({
      rozpis,
      zaklad: sumy.bezDph,
      dph: sumy.dph,
      krajina: krajinaDane(kx.krajina),
      den: kx.datumDodania,
      poloziek: Array.isArray(ai.items) ? (ai.items as unknown[]).length : undefined,
      krajinaDodavatela: krajinaDodavatela(ai),
    });
    if (chyby.length)
      kontrola = {
        ok: false,
        chyby: chyby.map((c) => ({
          kod: c.kod === "sadzba" ? "neplatna_sadzba" : c.kod === "dph" ? "riadok_dph" : "suma_zakladov",
          sprava: c.text,
        })),
      };
  }
  const prenesenie = rozpis.length > 0 && rozpis.every((r) => r.vat_category === "reverse_charge");
  return {
    rozpis,
    zdroj: vybrany.zdroj,
    kontrola,
    sumy,
    prenesenie,
    ...(vybrany.naprava ? { naprava: vybrany.naprava } : {}),
  };
}

/**
 * Pokyn pre AI k rozpisu DPH — spoločný pre faktúry aj bločky. `sadzby` sú
 * platné sadzby krajiny; keď krajina nie je známa, vymenujú sa SK aj CZ.
 */
export function pokynRozpisuDph(sadzby?: number[] | null): string {
  const zoznam = sadzby?.length
    ? `Povolené sadzby DPH sú LEN ${[...sadzby].sort((a, b) => b - a).join(", ")} %.`
    : "Povolené sadzby DPH sú LEN: na Slovensku od 1. 1. 2025 23, 19, 5 a 0 %, v Česku 21, 12 a 0 %.";
  return `ROZPIS DPH: pridaj "vat_breakdown": [{"rate": number, "base": number, "vat": number,
"vat_category": "standard"|"out_of_scope"|"exempt"|"reverse_charge"}] — presne podľa tabuľky „Rozpis DPH“ /
„Rekapitulácia DPH“ na doklade, jeden riadok za každú sadzbu a druh plnenia, ktorý má nenulový základ.
${zoznam} Sadzbu ber VŽDY z dokladu — nikdy ju nedopočítavaj ako DPH / základ, nikdy nedopĺňaj
predvolenú (ani 19, ani 23) a nikdy nedávaj celý základ jednej sadzbe, keď doklad má viac sadzieb.
"vat_category": "standard" = zdaniteľné plnenie s DPH; "out_of_scope" = „Nie je predmetom DPH“ (správne,
registračné a súdne poplatky, kolky; rate 0, vat 0); "exempt" = „Oslobodené“ (rate 0, vat 0);
"reverse_charge" = prenesenie daňovej povinnosti / „§ 69 ods. 12“ (CZ „přenesení daňové povinnosti“,
§ 92a; vat 0). 0 % bez uvedeného dôvodu nechaj bez "vat_category" (null).
Rekapitulácia v STĹPCOCH (napr. „Nie je predmetom DPH | Oslobodené | 1. znížená | 2. znížená | Základná |
Celkom“) mapuj podľa TEXTU hlavičky stĺpca, nie podľa poradia: „Nie je predmetom“ → out_of_scope,
„Oslobodené“ → exempt, „Základná“ → 23 %, „1. znížená“ / „Znížená“ → 19 %, „2. znížená“ → 5 % (SK od 2025;
keď je pri stĺpci vytlačené percento, ber to). Stĺpec „Celkom“ / „Spolu“ NIKDY nie je riadok rozpisu — je
len na kontrolu súčtov. ZÁPORNÁ suma v stĺpci „Nie je predmetom DPH“ / „Oslobodené“ / 0 %, ktorá je
odpočtom zálohy („Odpočítané na zálohách“, „ZF …“), NIE JE riadok rozpisu — patrí do "advance_deduction".
Riadok v prenesení daňovej povinnosti má "vat": 0 a "rate" takú, aká je vytlačená (0 alebo sadzba
plnenia, napr. 23); "base" je vždy BEZ DPH, nikdy suma s DPH. Súčet "base" všetkých riadkov sa musí rovnať "amount_without_vat" a súčet "vat"
"vat_amount" (v tej istej mene). Pri každej položke v "items" pridaj aj "vat_category" (rovnaké hodnoty)
a položky v prenesení majú "reverse_charge": true.
Pri každej položke uveď v "total" sumu riadku a do "items_total_with_vat" (true/false) napíš, či sú
sumy riadkov s DPH alebo bez DPH.`;
}

/**
 * Kontrola rozpisu uloženého bločku/dokladu (`expense_documents`): rozpis
 * z `vat_breakdown`, inak jediná sadzba hlavičky so základom a DPH. Bez súm
 * (ručný zápis len so sumou spolu) nie je čo kontrolovať.
 */
export function kontrolaUlozenehoBlocku(
  d: {
    net_amount?: unknown;
    vat_amount?: unknown;
    vat_rate?: unknown;
    vat_breakdown?: unknown;
    issue_date?: string | null;
    supplier_ic_dph?: string | null;
    supplier_country?: string | null;
  },
  krajina?: string | null,
): VysledokKontroly {
  const zaklad = num(d.net_amount);
  const dph = num(d.vat_amount);
  const pole = Array.isArray(d.vat_breakdown) ? (d.vat_breakdown as any[]) : [];
  const rozpis = pole.length
    ? pole.map((r) => ({
        rate: num(r?.sadzba ?? r?.rate) ?? 0,
        base: Math.abs(num(r?.zaklad ?? r?.base) ?? 0),
        vat: Math.abs(num(r?.dph ?? r?.vat) ?? 0),
        vat_category: jeKategoriaDph(r?.vat_category) ? r.vat_category : null,
      }))
    : num(d.vat_rate) !== null &&
        zaklad !== null &&
        dph !== null &&
        (num(d.vat_rate)! > 0 || dph !== 0)
      ? [{ rate: num(d.vat_rate)!, base: Math.abs(zaklad), vat: Math.abs(dph) }]
      : [];
  if (!rozpis.length) return OK;
  // Doklad od neplatiteľa (bez IČ DPH, bez dane) — DPH v ňom nie je, niet čo kontrolovať.
  if (!String(d.supplier_ic_dph ?? "").trim() && rozpis.every((r) => !r.vat)) return OK;
  const sumy = {
    bezDph: zaklad !== null ? Math.abs(zaklad) : r2(rozpis.reduce((a, r) => a + r.base, 0)),
    dph: dph !== null ? Math.abs(dph) : r2(rozpis.reduce((a, r) => a + r.vat, 0)),
  };
  return skontrolujRozpisDph(rozpis, sumy, {
    krajina: krajina ?? "SK",
    datumDodania: d.issue_date ?? null,
    // Zahraničný bloček (HU palivo 27 %) nesie sadzby svojho štátu — ako spúšťač.
    krajinaDodavatela: d.supplier_country ?? null,
    icDphDodavatela: d.supplier_ic_dph ?? null,
  });
}
