/**
 * České priznanie k DPH (DPHDP3) a kontrolné hlásenie (DPHKH1).
 *
 * Počíta sa z toho istého vstupu ako slovenské výkazy (`nacitajVstup` —
 * sumy už v domácej mene, teda v korunách). Pravidlá podľa pokynov Finančnej
 * správy ČR k tlačivám 25 5401 (priznanie) a 25 5564 (kontrolné hlásenie):
 *
 *  - priznanie: základ aj daň v celých korunách,
 *  - kontrolné hlásenie: na halier; doklad nad 10 000 Kč vrátane dane ide
 *    samostatne (A.4 / B.2), menšie sa sčítajú (A.5 / B.3),
 *  - prenesenie daňovej povinnosti § 92a: dodávateľ A.1 + ř. 25, odberateľ
 *    B.1 + ř. 10/11 a odpočet ř. 43/44,
 *  - nákup zo zahraničia: A.2 + ř. 3/4 (tovar z EÚ), 5/6 (služby z EÚ),
 *    12/13 (od osoby neusadenej mimo EÚ), odpočet ř. 43/44.
 *
 * Čo sa z dokladov vyčítať nedá (kód predmetu plnenia pri prenesení, nulová
 * sadzba bez prenesenia), ide do `vytky` — výkaz sa dá pozrieť, ale nemá sa
 * podať naslepo.
 */

import { jeEuIcDph, rozdelIcDph } from "./vies";
import { sadzbyKrajiny } from "./vat-rates";
import type { Obdobie, PrijataFaktura, SadzbovyRiadok, Vstup, Vytka } from "./dph-vykazy";

/** Hranica kontrolného hlásenia — hodnota dokladu vrátane dane. */
export const HRANICA_KH = 10_000;

/** Číselník „kód předmětu plnění“ pre A.1 / B.1 (platný od 1. 7. 2017). */
export const KODY_PREDMETU_PLNENI: { kod: string; nazov: string }[] = [
  { kod: "1", nazov: "Zlato" },
  { kod: "1a", nazov: "Zlato – zprostředkování dodání investičního zlata" },
  { kod: "3", nazov: "Dodání nemovité věci" },
  { kod: "3a", nazov: "Dodání nemovité věci v nuceném prodeji" },
  { kod: "4", nazov: "Stavební a montážní práce" },
  { kod: "4a", nazov: "Stavební a montážní práce – poskytnutí pracovníků" },
  { kod: "5", nazov: "Zboží uvedené v příloze č. 5" },
  { kod: "6", nazov: "Dodání zboží poskytnutého původně jako záruka" },
  { kod: "7", nazov: "Dodání zboží po postoupení výhrady vlastnictví" },
  { kod: "11", nazov: "Povolenky na emise skleníkových plynů" },
  { kod: "12", nazov: "Obiloviny a technické plodiny" },
  { kod: "13", nazov: "Kovy" },
  { kod: "14", nazov: "Mobilní telefony" },
  { kod: "15", nazov: "Integrované obvody" },
  { kod: "16", nazov: "Přenosná zařízení pro automatizované zpracování dat" },
  { kod: "17", nazov: "Videoherní konzole" },
  { kod: "18", nazov: "Dodání certifikátů elektřiny" },
  { kod: "19", nazov: "Dodání elektřiny soustavami nebo sítěmi obchodníkovi" },
  { kod: "20", nazov: "Dodání plynu soustavami nebo sítěmi obchodníkovi" },
  { kod: "21", nazov: "Poskytnutí vymezených služeb elektronických komunikací" },
];

export type RiadokA1 = { dic: string; doklad: string; duzp: string; zaklad: number };
export type RiadokA2 = {
  stat: string;
  vatId: string;
  doklad: string;
  dppd: string;
  zaklad1: number;
  dan1: number;
  zaklad2: number;
  dan2: number;
};
export type RiadokA4 = {
  dic: string;
  doklad: string;
  dppd: string;
  zaklad1: number;
  dan1: number;
  zaklad2: number;
  dan2: number;
};
export type RiadokB1 = RiadokA4 & { duzp: string };
export type RiadokB2 = RiadokA4 & { pomer: boolean };
export type Suhrn = { zaklad1: number; dan1: number; zaklad2: number; dan2: number };

export type KontrolniHlaseni = {
  a1: RiadokA1[];
  a2: RiadokA2[];
  a4: RiadokA4[];
  a5: Suhrn;
  b1: RiadokB1[];
  b2: RiadokB2[];
  b3: Suhrn;
  vytky: Vytka[];
};

/** Polia DPHDP3 (názvy atribútov tlačiva) → hodnota v celých korunách. */
export type PriznaniCz = Record<string, number>;

const nula = (): Suhrn => ({ zaklad1: 0, dan1: 0, zaklad2: 0, dan2: 0 });
const hal = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Základná sadzba (21 %) vs. znížená (12 %) — podľa výšky, nie natvrdo. */
function jeZakladna(sadzba: number): boolean {
  return sadzba >= 15;
}

/** Rozpis dokladu po sadzbách do polí 1 (základná) a 2 (znížená). */
function poSadzbach(riadky: SadzbovyRiadok[], podiel = 1): Suhrn {
  const s = nula();
  for (const r of riadky) {
    if (!(Number(r.sadzba) > 0)) continue;
    if (jeZakladna(Number(r.sadzba))) {
      s.zaklad1 += r.zaklad * podiel;
      s.dan1 += r.dan * podiel;
    } else {
      s.zaklad2 += r.zaklad * podiel;
      s.dan2 += r.dan * podiel;
    }
  }
  return { zaklad1: hal(s.zaklad1), dan1: hal(s.dan1), zaklad2: hal(s.zaklad2), dan2: hal(s.dan2) };
}

function pricitaj(a: Suhrn, b: Suhrn): void {
  a.zaklad1 = hal(a.zaklad1 + b.zaklad1);
  a.dan1 = hal(a.dan1 + b.dan1);
  a.zaklad2 = hal(a.zaklad2 + b.zaklad2);
  a.dan2 = hal(a.dan2 + b.dan2);
}

const spolu = (s: Suhrn) => s.zaklad1 + s.dan1 + s.zaklad2 + s.dan2;

/**
 * Kmeňová (číselná) časť českého DIČ — z „CZ12345678“ alebo z poľa DIČ.
 * Cudzie IČ DPH vráti prázdne (do A.4/B.2 nepatrí).
 */
export function dicCz(icDph?: string | null, dic?: string | null): string {
  for (const v of [icDph, dic]) {
    const s = String(v ?? "")
      .replace(/[\s.-]/g, "")
      .toUpperCase();
    if (!s) continue;
    if (/^CZ\d{8,10}$/.test(s)) return s.slice(2);
    if (/^\d{8,10}$/.test(s)) return s;
  }
  return "";
}

/** DD.MM.RRRR — tvar dátumu v podaní. */
export function datumCz(iso: string): string {
  const [r, m, d] = String(iso).slice(0, 10).split("-");
  return r && m && d ? `${d}.${m}.${r}` : "";
}

type Moznosti = {
  /** Kód predmetu plnenia pre riadky A.1 / B.1 (doklad ho nenesie). */
  kodPredmetu?: string | null;
  /** Vlastné DIČ firmy — v riadkoch sa nesmie objaviť. */
  vlastneDic?: string | null;
};

/**
 * Samozdanenie: faktúra zo zahraničia alebo v prenesení prichádza bez dane —
 * odberateľ ju vyčísli sám základnou sadzbou ku dňu plnenia.
 */
function samozdan(p: PrijataFaktura): SadzbovyRiadok[] {
  if (p.riadky.some((r) => Number(r.sadzba) > 0)) return p.riadky;
  const sz = sadzbyKrajiny("CZ", p.datumDodania)[0] ?? 21;
  return p.riadky.map((r) => ({ sadzba: sz, zaklad: r.zaklad, dan: hal((r.zaklad * sz) / 100) }));
}

function druhNakupu(
  p: PrijataFaktura,
): "tuzemsko_pdp" | "eu_sluzba" | "eu_tovar" | "mimo_eu" | "dovoz" | "tuzemsko" | null {
  if (p.rezim === "bez_dane") return null;
  if (p.rezim === "dovoz") return "dovoz";
  if (p.rezim === "tuzemsko") return "tuzemsko";
  const kod = rozdelIcDph(p.dodavatelIcDph)?.kod;
  if (p.rezim === "nadobudnutie") return "eu_tovar";
  // Samozdanenie: český dodávateľ = prenesenie § 92a, z EÚ = služba, inak mimo EÚ.
  if (kod === "CZ" || (!kod && dicCz(null, p.dodavatelDic))) return "tuzemsko_pdp";
  if (kod && jeEuIcDph(p.dodavatelIcDph)) return "eu_sluzba";
  return "mimo_eu";
}

/** Kontrolné hlásenie DPHKH1 — vždy za kalendárny mesiac (právnická osoba). */
export function kontrolniHlaseni(vstup: Vstup, m: Moznosti = {}): KontrolniHlaseni {
  const kh: KontrolniHlaseni = {
    a1: [],
    a2: [],
    a4: [],
    a5: nula(),
    b1: [],
    b2: [],
    b3: nula(),
    vytky: [],
  };
  const vlastne = String(m.vlastneDic ?? "").replace(/\D/g, "");
  const chybaKodu = () =>
    !m.kodPredmetu &&
    kh.vytky.push({
      doklad: "Kód předmětu plnění",
      text: "Doklady v prenesení daňovej povinnosti (§ 92a) potrebujú kód predmetu plnenia — vyberte ho nad výkazom.",
    });
  let kodOhlaseny = false;

  for (const f of vstup.vystavene) {
    if (f.typ === "proforma") continue;
    const dic = dicCz(f.odberatelIcDph, f.odberatelDic);
    if (f.prenosDane) {
      if (f.prenosTyp === "domestic_69" || !f.prenosTyp) {
        const zaklad = hal(f.riadky.reduce((a, r) => a + r.zaklad, 0));
        if (!dic) {
          kh.vytky.push({
            doklad: f.cislo,
            text: "Faktúra v prenesení (§ 92a) nemá české DIČ odberateľa — do A.1 ho treba doplniť.",
          });
        }
        kh.a1.push({ dic, doklad: f.cislo, duzp: f.datumDodania, zaklad });
        if (!kodOhlaseny) {
          chybaKodu();
          kodOhlaseny = true;
        }
      }
      // Dodanie do EÚ a vývoz kontrolné hlásenie nevykazuje (patria do priznania a súhrnného hlásenia).
      continue;
    }
    if (f.oss) continue;
    const s = poSadzbach(f.riadky);
    if (!spolu(s)) {
      if (f.riadky.some((r) => r.zaklad !== 0)) {
        kh.vytky.push({
          doklad: f.cislo,
          text: "Faktúra s nulovou sadzbou bez prenesenia — oslobodené plnenie doplňte do priznania ručne.",
        });
      }
      continue;
    }
    /*
      Nad hranicu (aj dobropis v absolútnej hodnote) a s českým DIČ → A.4, inak
      súhrnne A.5. A.4 platí pre plátcu aj neplátcu (osobu povinnú k dani či
      právnickú osobu) — neplátca sa uvádza DIČ podľa daňového poriadku (pokyny
      k DPHKH1, časť A.4), preto stačí DIČ aj bez IČ DPH.
    */
    if (dic && dic !== vlastne && Math.abs(spolu(s)) > HRANICA_KH) {
      kh.a4.push({ dic, doklad: f.cislo, dppd: f.datumDodania, ...s });
    } else {
      pricitaj(kh.a5, s);
    }
  }

  for (const p of vstup.prijate) {
    const druh = druhNakupu(p);
    if (!druh || druh === "dovoz" || p.kv === "X") continue;
    const podiel =
      p.podielOdpoctu != null && p.podielOdpoctu < 1 ? Math.max(0, p.podielOdpoctu) : 1;
    if (druh === "tuzemsko_pdp") {
      const s = poSadzbach(samozdan(p));
      const dic = dicCz(p.dodavatelIcDph, p.dodavatelDic);
      if (!dic)
        kh.vytky.push({
          doklad: p.cislo || "prijatá faktúra",
          text: "Prijatá faktúra v prenesení (§ 92a) nemá české DIČ dodávateľa — B.1 ho vyžaduje.",
        });
      kh.b1.push({ dic, doklad: p.cislo, duzp: p.datumDodania, dppd: p.datumDodania, ...s });
      if (!kodOhlaseny) {
        chybaKodu();
        kodOhlaseny = true;
      }
      continue;
    }
    if (druh === "eu_sluzba" || druh === "eu_tovar" || druh === "mimo_eu") {
      const s = poSadzbach(samozdan(p));
      const r = rozdelIcDph(p.dodavatelIcDph);
      const eu = druh !== "mimo_eu" && r;
      kh.a2.push({
        stat: eu ? (r!.kod === "GR" ? "EL" : r!.kod) : "",
        vatId: eu ? r!.cislo : "",
        doklad: p.cislo,
        dppd: p.datumDodania,
        ...s,
      });
      continue;
    }
    // Tuzemský nákup s odpočtom.
    if (!p.odpocet) continue;
    const plny = poSadzbach(p.riadky);
    const dic = dicCz(p.dodavatelIcDph, p.dodavatelDic);
    if (dic && dic !== vlastne && Math.abs(spolu(plny)) > HRANICA_KH) {
      kh.b2.push({
        dic,
        doklad: p.cislo,
        dppd: p.datumDodania,
        pomer: podiel < 1,
        ...poSadzbach(p.riadky, podiel),
      });
    } else {
      pricitaj(kh.b3, poSadzbach(p.riadky, podiel));
    }
  }

  for (const d of vstup.doklady) {
    if (!d.odpocet || d.kv === "X") continue;
    const podiel =
      d.podielOdpoctu != null && d.podielOdpoctu < 1 ? Math.max(0, d.podielOdpoctu) : 1;
    const plny = poSadzbach(d.riadky);
    const dic = dicCz(d.dodavatelIcDph, d.dodavatelDic);
    if (dic && dic !== vlastne && Math.abs(spolu(plny)) > HRANICA_KH && d.cislo) {
      kh.b2.push({
        dic,
        doklad: d.cislo,
        dppd: d.datum ?? "",
        pomer: podiel < 1,
        ...poSadzbach(d.riadky, podiel),
      });
    } else {
      pricitaj(kh.b3, poSadzbach(d.riadky, podiel));
    }
  }

  return kh;
}

/** Priznanie k DPH DPHDP3 — riadky v celých korunách. */
export function priznaniCz(vstup: Vstup): { riadky: PriznaniCz; vytky: Vytka[] } {
  const r: PriznaniCz = {};
  const vytky: Vytka[] = [];
  const add = (k: string, v: number) => {
    r[k] = (r[k] ?? 0) + v;
  };
  const sadzby = (riadky: SadzbovyRiadok[], podiel = 1) => poSadzbach(riadky, podiel);

  for (const f of vstup.vystavene) {
    if (f.typ === "proforma" || f.oss) continue;
    const zaklad = f.riadky.reduce((a, x) => a + x.zaklad, 0);
    if (f.prenosDane) {
      if (f.prenosTyp === "eu_b2b") {
        if (f.euPlnenie === "sluzba") add("pln_sluzby", zaklad);
        else if (f.euPlnenie === "trojstranny") add("tri_dozb", zaklad);
        else add("dod_zb", zaklad);
      } else if (f.prenosTyp === "export")
        // Služba s místem plnění mimo EU nie je vývoz zboží (ř. 22), ale ř. 26.
        add(f.euPlnenie === "sluzba" ? "pln_ost" : "pln_vyvoz", zaklad);
      else add("pln_rez_pren", zaklad);
      continue;
    }
    const s = sadzby(f.riadky);
    add("obrat23", s.zaklad1);
    add("dan23", s.dan1);
    add("obrat5", s.zaklad2);
    add("dan5", s.dan2);
  }

  for (const p of vstup.prijate) {
    const druh = druhNakupu(p);
    if (!druh) continue;
    const podiel =
      p.podielOdpoctu != null && p.podielOdpoctu < 1 ? Math.max(0, p.podielOdpoctu) : 1;
    const riadkyP = druh === "tuzemsko" || druh === "dovoz" ? p.riadky : samozdan(p);
    const s = sadzby(riadkyP);
    const odp = p.odpocet ? sadzby(riadkyP, podiel) : nula();
    if (druh === "tuzemsko") {
      if (!p.odpocet) continue;
      add("pln23", odp.zaklad1);
      add("odp_tuz23_nar", odp.dan1);
      add("pln5", odp.zaklad2);
      add("odp_tuz5_nar", odp.dan2);
      continue;
    }
    if (druh === "dovoz") {
      // Dovoz s daňou vyrubenou colným úradom — ř. 42.
      if (!p.odpocet) continue;
      add("dov_cu", odp.zaklad1 + odp.zaklad2);
      add("odp_cu_nar", odp.dan1 + odp.dan2);
      continue;
    }
    // Samozdanenie: daň na výstupe podľa druhu + odpočet ř. 43/44.
    const [z23, d23, z5, d5] =
      druh === "tuzemsko_pdp"
        ? ["rez_pren23", "dan_rpren23", "rez_pren5", "dan_rpren5"]
        : druh === "eu_tovar"
          ? ["p_zb23", "dan_pzb23", "p_zb5", "dan_pzb5"]
          : druh === "eu_sluzba"
            ? ["p_sl23_e", "dan_psl23_e", "p_sl5_e", "dan_psl5_e"]
            : ["p_sl23_z", "dan_psl23_z", "p_sl5_z", "dan_psl5_z"];
    add(z23, s.zaklad1);
    add(d23, s.dan1);
    add(z5, s.zaklad2);
    add(d5, s.dan2);
    if (p.odpocet) {
      add("nar_zdp23", odp.zaklad1);
      add("od_zdp23", odp.dan1);
      add("nar_zdp5", odp.zaklad2);
      add("od_zdp5", odp.dan2);
    }
  }

  for (const d of vstup.doklady) {
    if (!d.odpocet) continue;
    const podiel =
      d.podielOdpoctu != null && d.podielOdpoctu < 1 ? Math.max(0, d.podielOdpoctu) : 1;
    const s = sadzby(d.riadky, podiel);
    add("pln23", s.zaklad1);
    add("odp_tuz23_nar", s.dan1);
    add("pln5", s.zaklad2);
    add("odp_tuz5_nar", s.dan2);
  }

  // Celé koruny — každý riadok zvlášť, súčty z už zaokrúhlených riadkov.
  for (const k of Object.keys(r)) r[k] = Math.round(r[k]);

  const dan = [
    "dan23",
    "dan5",
    "dan_pzb23",
    "dan_pzb5",
    "dan_psl23_e",
    "dan_psl5_e",
    "dan_dzb23",
    "dan_dzb5",
    "dan_pdop_nrg",
    "dan_rpren23",
    "dan_rpren5",
    "dan_psl23_z",
    "dan_psl5_z",
  ].reduce((a, k) => a + (r[k] ?? 0), 0);
  const odpocet = [
    "odp_tuz23_nar",
    "odp_tuz5_nar",
    "odp_cu_nar",
    "od_zdp23",
    "od_zdp5",
    "odp_rez_nar",
  ].reduce((a, k) => a + (r[k] ?? 0), 0);
  if (odpocet) r.odp_sum_nar = odpocet;
  r.dan_zocelk = dan;
  r.odp_zocelk = odpocet;
  if (dan >= odpocet) r.dano_da = dan - odpocet;
  else r.dano_no = odpocet - dan;

  for (const f of vstup.vystavene) {
    if (
      !f.prenosDane &&
      !f.oss &&
      f.typ !== "proforma" &&
      f.riadky.some((x) => !(x.sadzba > 0) && x.zaklad !== 0)
    ) {
      vytky.push({
        doklad: f.cislo,
        text: "Plnenie s nulovou sadzbou bez prenesenia — ak je oslobodené, doplňte ho do ř. 26 alebo 50 ručne.",
      });
    }
  }
  return { riadky: r, vytky };
}

/** Kontrolné riadky C kontrolného hlásenia — súčty A a B na porovnanie s priznaním. */
export function kontrolniRadkyC(kh: KontrolniHlaseni) {
  const sum = <T>(xs: T[], f: (x: T) => number) => hal(xs.reduce((a, x) => a + f(x), 0));
  return {
    obrat23: hal(sum(kh.a4, (x) => x.zaklad1) + kh.a5.zaklad1),
    obrat5: hal(sum(kh.a4, (x) => x.zaklad2) + kh.a5.zaklad2),
    pln23: hal(sum(kh.b2, (x) => x.zaklad1) + kh.b3.zaklad1),
    pln5: hal(sum(kh.b2, (x) => x.zaklad2) + kh.b3.zaklad2),
    pln_rez_pren: sum(kh.a1, (x) => x.zaklad),
    rez_pren23: sum(kh.b1, (x) => x.zaklad1),
    rez_pren5: sum(kh.b1, (x) => x.zaklad2),
    celk_zd_a2: sum(kh.a2, (x) => x.zaklad1 + x.zaklad2),
  };
}

/* ─── Souhrnné hlášení (DPHSHV) ─────────────────────────────────────────── */

/**
 * Kód plnenia v súhrnnom hlásení: 0 dodanie tovaru do EÚ (§ 13 ods. 1, 2),
 * 2 trojstranný obchod (len prostredná osoba, § 17), 3 služba s miestom
 * plnenia v inom štáte (§ 9 ods. 1). Kód 1 (premiestnenie majetku) z faktúr
 * nevzniká.
 */
export type KodPlneniEu = 0 | 2 | 3;

export type RiadokSh = {
  /** Kód štátu podľa SH (Grécko = EL). */
  stat: string;
  /** DIČ pořizovatele bez kódu štátu. */
  vatId: string;
  kod: KodPlneniEu;
  /** Celková hodnota v celých korunách (dobropisy odpočítané, zaokrúhlené nahor). */
  hodnota: number;
  pocet: number;
};

export type SouhrnneHlaseni = { riadky: RiadokSh[]; vytky: Vytka[] };

/** Súhrnné hlásenie VIES — dodávky tovaru a služieb do EÚ podľa odberateľa a kódu plnenia. */
export function souhrnneHlaseni(vstup: Vstup): SouhrnneHlaseni {
  const vytky: Vytka[] = [];
  const mapa = new Map<
    string,
    { stat: string; vatId: string; kod: KodPlneniEu; suma: number; pocet: number }
  >();
  for (const f of vstup.vystavene) {
    if (f.typ === "proforma" || !f.prenosDane || f.prenosTyp !== "eu_b2b") continue;
    const r = rozdelIcDph(f.odberatelIcDph);
    if (!r || !jeEuIcDph(f.odberatelIcDph) || r.kod === "CZ") {
      vytky.push({
        doklad: f.cislo,
        text: "Dodanie do EÚ bez platného IČ DPH odberateľa z iného štátu EÚ — do súhrnného hlásenia ho treba doplniť.",
      });
      continue;
    }
    const kod: KodPlneniEu = f.euPlnenie === "sluzba" ? 3 : f.euPlnenie === "trojstranny" ? 2 : 0;
    const stat = r.kod === "GR" ? "EL" : r.kod;
    const kluc = `${stat}|${r.cislo}|${kod}`;
    const zaklad = f.riadky.reduce((a, x) => a + x.zaklad, 0);
    const z = mapa.get(kluc) ?? { stat, vatId: r.cislo, kod, suma: 0, pocet: 0 };
    z.suma += zaklad;
    // Dobropis plnenie nepridáva, len znižuje hodnotu.
    if (zaklad > 0) z.pocet += 1;
    mapa.set(kluc, z);
  }
  const riadky: RiadokSh[] = [...mapa.values()]
    .map((z) => ({
      stat: z.stat,
      vatId: z.vatId,
      kod: z.kod,
      // Pokyny: hodnota sa zaokrúhľuje na celé koruny nahor.
      hodnota: Math.ceil(Math.round(z.suma * 100) / 100),
      pocet: Math.max(z.pocet, 1),
    }))
    .filter((r) => r.hodnota !== 0)
    .sort(
      (a, b) => a.stat.localeCompare(b.stat) || a.vatId.localeCompare(b.vatId) || a.kod - b.kod,
    );
  return { riadky, vytky };
}

export type { Obdobie };
