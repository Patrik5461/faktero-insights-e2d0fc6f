/*
  MRP-K/S (aj MRP Autonómny podnik — ten istý formát ide cez jeho dátové
  rozhranie) — vystavené faktúry, prijaté faktúry a bločky so zaúčtovaním.

  Podľa oficiálnej dokumentácie MRP „XML MRP-K/S verze 2.0“
  (faq.mrp.cz, otázka 392: mrpks_xml_2_0_doc_fv.txt, _fp.txt, _pk.txt
  a vzorové súbory mrpks_invoices_2_0.XML, mrpks_incoming_invoices_2_0.XML,
  mrpks_cashvouchers_2_0.XML). XSD MRP nevydáva — schéma
  `schemy/mrp/mrpks-2-0.xsd` je vygenerovaná z tabuliek dokumentácie
  a vzorové súbory MRP ňou prechádzajú; test výstup overuje proti nej.

  Kam čo ide (import v MRP: modul → Funkce → Import ze souboru XML MRP-K/S 2.0):
  - vystavená faktúra → `IssuedInvoices/Invoice`
  - prijatá faktúra a bloček → `IncomingInvoices/Invoice`
  - bloček platený hotovosťou, keď je vyplnená pokladňa → `CashVouchers/CashVoucher`

  Čo MRP chce inak než ostatné programy:
  - Typ DPH (`TaxCode`) je číslo z číselníka „Typy DPH“ — slovenská verzia
    má tuzemské uskutočnené plnenie 10 a prijaté 40, česká 41 a 71, nedaňový
    doklad 19 / 39 (dokumentácia). Ostatné (prenesenie, EÚ, vývoz, dovoz)
    sa líšia podľa verzie a nastavenia, preto ich firma zadá v nastaveniach
    exportu; číselné členenie DPH na doklade či riadku má prednosť.
  - Predkontácia je číslo (`DoubleEntryBookkeepingCode`, decimal 15,3) a len
    jedna na doklad — rozúčtovanie na viac predkontácií import neunesie.
  - Dobropis má `DocType` „D“ a **záporné** sumy (vzor MRP 2019004), vrubopis „V“.
  - Sumy v hlavičke a v súčtoch sú v domácej mene, položky v mene dokladu;
    doklad v cudzej mene má kurz (`CurrRate` za `CurrRateAmount` jednotiek)
    a súčty aj v cudzej mene.
  - Prijaté plnenie v prenesení: základ v bežnej sadzbe, daň v poliach
    `ReverseCharge…` a odpočet v `TaxApplied` (vzor MRP FP19003).
  - Odpočet zálohy je riadok s `RowSumType` 2.
  - Databáza MRP je vo Windows-1250 — znaky mimo nej sa nahradia.
*/

import {
  prekazkaZaokruhlenia,
  type DokladUctovania,
  type RiadokUctovania,
} from "./zauctovanie-export";
import { domacaMena, domacejZaJednotku, kurzZaMnozstvo } from "./kurzy";
import { kodStatu } from "./company-autofill";

export type NastaveniaMrp = {
  /** Verzia programu — SK alebo CZ (predvolene podľa krajiny firmy). */
  verzia?: string | null;
  /** Typy DPH z číselníka MRP. */
  typDphVydane?: string | null;
  typDphVydanePdp?: string | null;
  typDphVydaneEu?: string | null;
  typDphVydaneVyvoz?: string | null;
  typDphVydaneNedanove?: string | null;
  typDphPrijate?: string | null;
  typDphPrijatePdp?: string | null;
  typDphPrijateEu?: string | null;
  typDphPrijateDovoz?: string | null;
  typDphPrijateNedanove?: string | null;
  /** Prefix číselného radu, do ktorého MRP prijatú faktúru pri importe zaradí. */
  radPrijate?: string | null;
  /** Identifikátor pokladne v MRP — bez neho idú bločky ako prijaté faktúry. */
  pokladna?: string | null;
};

type KlucTypu = Exclude<keyof NastaveniaMrp, "verzia" | "radPrijate" | "pokladna">;

/** Typy DPH, ktoré uvádza dokumentácia MRP; ostatné treba zadať. */
const PREDVOLENE_TYPY: Record<"SK" | "CZ", Partial<Record<KlucTypu, string>>> = {
  SK: {
    typDphVydane: "10",
    typDphPrijate: "40",
    typDphVydaneNedanove: "19",
    typDphPrijateNedanove: "39",
  },
  CZ: {
    typDphVydane: "41",
    typDphPrijate: "71",
    typDphVydaneNedanove: "19",
    typDphPrijateNedanove: "39",
  },
};

const POPIS_TYPU: Record<KlucTypu, string> = {
  typDphVydane: "vystavená faktúra",
  typDphVydanePdp: "vystavená faktúra v prenesení daňovej povinnosti",
  typDphVydaneEu: "dodanie do EÚ",
  typDphVydaneVyvoz: "vývoz",
  typDphVydaneNedanove: "zálohová faktúra (nedaňový doklad)",
  typDphPrijate: "prijatá faktúra",
  typDphPrijatePdp: "prijatá faktúra v prenesení daňovej povinnosti",
  typDphPrijateEu: "nadobudnutie tovaru z EÚ",
  typDphPrijateDovoz: "dovoz",
  typDphPrijateNedanove: "prijatá zálohová faktúra (nedaňový doklad)",
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
/** Číslo s pevným počtom desatinných miest; polovica sa zaokrúhli od nuly. */
const f = (n: unknown, des: number) => {
  const x = Number(n ?? 0) || 0;
  const v = (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 10 ** des)) / 10 ** des;
  return (v || 0).toFixed(des);
};

/** Znaky, ktoré Windows-1250 pozná (MRP-K/S v nej drží databázu). */
const CP1250 = (() => {
  try {
    return new Set(
      new TextDecoder("windows-1250").decode(Uint8Array.from({ length: 128 }, (_, i) => i + 128)),
    );
  } catch {
    return null;
  }
})();

/** Text pre MRP: len znaky z Windows-1250, ostatné bez diakritiky alebo „?“. */
export function textPreMrp(s: unknown): string {
  return [...String(s ?? "").replace(/[\r\n\t]+/g, " ")]
    .map((z) => {
      if (z.charCodeAt(0) < 0x80 || !CP1250 || CP1250.has(z)) return z;
      const bez = z.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if ([...bez].every((c) => c.charCodeAt(0) < 0x80 || CP1250.has(c))) return bez;
      return "?";
    })
    .join("");
}

const esc = (s: unknown) =>
  textPreMrp(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const skrat = (s: unknown, max: number) => textPreMrp(s).trim().slice(0, max).trim();
/** Element len keď má hodnotu. */
const el = (nazov: string, hodnota: unknown, o: string) => {
  const v = String(hodnota ?? "").trim();
  return v ? `\n${o}<${nazov}>${esc(v)}</${nazov}>` : "";
};

type Mena = {
  cudzia: boolean;
  kod: string;
  domaca: string;
  naDomacu: (x: number) => number;
  mnozstvo: number;
  kurz: number;
};

/** Riadok dokladu v MRP — sumy v mene dokladu, so znamienkom. */
type RiadokMrp = {
  popis: string;
  mj: string | null;
  mnozstvo: number;
  zaklad: number;
  /** Daň na doklade (pri prijatom prenesení 0). */
  dph: number;
  /** Daň, ktorú si príjemca v prenesení vypočíta sám. */
  dphRc: number;
  sadzba: number;
  typDph: number;
  /** 1 bežný, 2 odpočet zálohy. */
  sumacia: 1 | 2;
  /** Či si firma z riadku odpočíta daň (len prijaté). */
  odpocet: boolean;
};

/** Číselné členenie z dokladu sa berie ako typ DPH MRP („41“, „10“…). */
const ciselnyKod = (v: unknown): number | null => {
  const s = String(v ?? "").trim();
  return /^\d{1,4}$/.test(s) ? Number(s) : null;
};

/** Číslo predkontácie MRP (decimal 15,3) — iný kód MRP nepozná. */
const cisloPredkontacie = (v: unknown): string | null => {
  const s = String(v ?? "")
    .trim()
    .replace(",", ".");
  return /^\d{1,12}(\.\d{1,3})?$/.test(s) ? Number(s).toFixed(3) : null;
};

/** Hladiny sadzieb: základná (≥ 20 %), ostatné nenulové sú znížené. */
function zakladnaSadzba(riadky: RiadokMrp[]): number | undefined {
  return [...new Set(riadky.map((r) => r.sadzba))].filter((s) => s >= 20).sort((a, b) => b - a)[0];
}
const typSadzby = (sadzba: number, zakladna: number | undefined) =>
  !sadzba ? 3 : sadzba === zakladna ? 1 : 2;

/**
 * Typ DPH dokladu podľa režimu. Vráti chybu, keď ho firma v nastaveniach nemá
 * a dokumentácia MRP ho neuvádza.
 */
function typDokladu(
  d: DokladUctovania,
  nast: NastaveniaMrp,
  verzia: "SK" | "CZ",
): { typ: number; kluc: KlucTypu } | { chyba: string } {
  const vydana = d.agenda === "vystavena";
  let kluc: KlucTypu;
  if (d.druh === "zaloha") kluc = vydana ? "typDphVydaneNedanove" : "typDphPrijateNedanove";
  else if (vydana) {
    kluc = !d.prenesenieDph
      ? "typDphVydane"
      : d.prenosTyp === "eu_b2b"
        ? "typDphVydaneEu"
        : d.prenosTyp === "export"
          ? "typDphVydaneVyvoz"
          : "typDphVydanePdp";
  } else {
    kluc =
      d.dphRezim === "nadobudnutie"
        ? "typDphPrijateEu"
        : d.dphRezim === "dovoz"
          ? "typDphPrijateDovoz"
          : d.prenesenieDph
            ? "typDphPrijatePdp"
            : "typDphPrijate";
  }
  const hodnota = String(nast[kluc] ?? "").trim() || PREDVOLENE_TYPY[verzia][kluc] || "";
  const typ = ciselnyKod(hodnota);
  if (typ == null)
    return {
      chyba: `v nastaveniach exportu do MRP chýba typ DPH pre ${POPIS_TYPU[kluc]} (číslo z číselníka Typy DPH v MRP)`,
    };
  return { typ, kluc };
}

/** Vypočítaná daň príjemcu v prenesení — na doklade je daň 0, sadzba ostáva. */
const danRc = (zaklad: number, sadzba: number) => r2((zaklad * sadzba) / 100);

function riadkyMrp(d: DokladUctovania, typ: number): RiadokMrp[] {
  const s = d.druh === "dobropis" ? -1 : 1;
  const vydana = d.agenda === "vystavena";
  // Prijaté plnenie v prenesení: daň si vypočíta príjemca (riadok má sadzbu, daň 0).
  const rc = (r: { sadzba: number; dph: number }) =>
    !vydana && d.prenesenieDph && !r.dph && r.sadzba > 0;
  // Vystavená v prenesení ide v nulovej sadzbe (vzor MRP 2019007).
  const sadzbaVystavenej = (r: { sadzba: number; dph: number }) =>
    vydana && d.prenesenieDph && !r.dph ? 0 : Number(r.sadzba) || 0;
  const zRiadku = (r: RiadokUctovania, popis: string): RiadokMrp => {
    const odpocetZalohy =
      r.zaklad < 0 && d.odpocetVRiadkoch && /^Odpočet zálohy/.test(r.text ?? "");
    const sadzba = sadzbaVystavenej(r);
    return {
      popis: odpocetZalohy ? (r.text ?? popis) : popis,
      mj: null,
      mnozstvo: 1,
      zaklad: s * r.zaklad,
      dph: s * r.dph,
      dphRc: rc(r) ? s * danRc(r.zaklad, r.sadzba) : 0,
      sadzba,
      typDph: ciselnyKod(r.clenenie) ?? typ,
      sumacia: odpocetZalohy ? 2 : 1,
      odpocet: r.odpocet,
    };
  };

  const bezne = d.riadky.filter((r) => !(r.zaklad < 0 && /^Odpočet zálohy/.test(r.text ?? "")));
  const odpocty = d.riadky.filter((r) => !bezne.includes(r));
  /*
    Položky sa pošlú, len keď sedia so zaúčtovaním v každej sadzbe zvlášť
    v základe aj v dani — súčet s DPH by pustil položku, ktorá má celú
    sumu v základe a nulovú daň.
  */
  const poSadzbach = (rr: { sadzba: number; zaklad: number; dph: number }[]) => {
    const m = new Map<number, { zaklad: number; dph: number }>();
    for (const r of rr) {
      const x = m.get(Number(r.sadzba) || 0) ?? { zaklad: 0, dph: 0 };
      x.zaklad = r2(x.zaklad + r.zaklad);
      x.dph = r2(x.dph + r.dph);
      m.set(Number(r.sadzba) || 0, x);
    }
    return m;
  };
  const sedia = () => {
    const a = poSadzbach(d.polozky);
    const b = poSadzbach(bezne);
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k) ?? { zaklad: 0, dph: 0 };
      const y = b.get(k) ?? { zaklad: 0, dph: 0 };
      if (Math.abs(x.zaklad - y.zaklad) >= 0.01 || Math.abs(x.dph - y.dph) >= 0.01) return false;
    }
    return true;
  };
  const polozkySedia = d.polozky.length > 0 && sedia();

  let out: RiadokMrp[];
  if (vydana && d.polozky.length) {
    // Skutočné položky faktúry; zľavu na doklad dorovná riadok v každej sadzbe.
    out = d.polozky.map((p) => {
      const sadzba = sadzbaVystavenej(p);
      return {
        popis: p.nazov,
        mj: p.mj,
        mnozstvo: p.mnozstvo || 1,
        zaklad: s * p.zaklad,
        dph: s * p.dph,
        dphRc: 0,
        sadzba,
        typDph: ciselnyKod(p.clenenie) ?? ciselnyKod(d.clenenie) ?? typ,
        sumacia: 1 as const,
        odpocet: true,
      };
    });
    const sadzby = [...new Set(bezne.map((r) => sadzbaVystavenej(r)))];
    for (const sadzba of sadzby) {
      const ciel = bezne.filter((r) => sadzbaVystavenej(r) === sadzba);
      const maju = out.filter((r) => r.sadzba === sadzba);
      const dz = r2(
        s * ciel.reduce((a, r) => a + r.zaklad, 0) - maju.reduce((a, r) => a + r.zaklad, 0),
      );
      const dd = r2(s * ciel.reduce((a, r) => a + r.dph, 0) - maju.reduce((a, r) => a + r.dph, 0));
      if (Math.abs(dz) >= 0.01 || Math.abs(dd) >= 0.01)
        out.push({
          popis: s * dz < 0 ? "Zľava na doklad" : "Úprava sumy",
          mj: null,
          mnozstvo: 1,
          zaklad: dz,
          dph: dd,
          dphRc: 0,
          sadzba,
          typDph: ciselnyKod(ciel[0]?.clenenie) ?? typ,
          sumacia: 1,
          odpocet: true,
        });
    }
  } else if (!vydana && polozkySedia && !d.rozuctovany) {
    out = d.polozky.map((p) => ({
      popis: p.nazov,
      mj: p.mj,
      mnozstvo: p.mnozstvo || 1,
      zaklad: s * p.zaklad,
      dph: s * p.dph,
      dphRc: rc(p) ? s * danRc(p.zaklad, p.sadzba) : 0,
      sadzba: Number(p.sadzba) || 0,
      typDph: ciselnyKod(bezne[0]?.clenenie) ?? typ,
      sumacia: 1 as const,
      odpocet: bezne[0]?.odpocet !== false,
    }));
  } else {
    out = bezne.map((r) => zRiadku(r, r.text || d.text || "Plnenie"));
  }
  return [...out, ...odpocty.map((r) => zRiadku(r, r.text || "Odpočet zálohy"))];
}

/** Odberateľ či dodávateľ (`Company`). SK verzia: DIČ vo VatNumber, IČ DPH vo VatNumberSK. */
function partner(d: DokladUctovania, verzia: "SK" | "CZ", o: string): string {
  const p = d.partner;
  const nazov = textPreMrp(p.nazov).trim();
  const dic = verzia === "SK" ? p.dic : (p.icDph ?? p.dic);
  const iban = String(p.iban ?? "").replace(/\s/g, "");
  const ucet =
    d.agenda !== "vystavena" && iban && iban.length <= 34
      ? `\n${o}  <BankAccounts>\n${o}    <BankAccount>\n${o}      <IBAN>${esc(iban)}</IBAN>\n${o}      <DefaultForDoc>T</DefaultForDoc>\n${o}    </BankAccount>\n${o}  </BankAccounts>`
      : "";
  return `\n${o}<Company>${el("CompanyId", skrat(p.ico, 12), `${o}  `)}
${o}  <Name>${esc(nazov.slice(0, 50).trim())}</Name>${el("Name2", nazov.slice(50, 100), `${o}  `)}${el("Street", skrat(p.ulica, 30), `${o}  `)}${el("City", skrat(p.mesto, 30), `${o}  `)}${el("CountryCode", kodStatu(p.stat), `${o}  `)}${el("ZipCode", skrat(p.psc, 15), `${o}  `)}${el("VatNumber", skrat(dic, 17), `${o}  `)}${
    verzia === "SK" ? el("VatNumberSK", skrat(p.icDph, 14), `${o}  `) : ""
  }${String(p.email ?? "").length <= 256 ? el("Email", p.email, `${o}  `) : ""}${ucet}
${o}</Company>`;
}

/** Položky (`Items/Item`) — ceny za jednotku v mene dokladu bez DPH. */
function polozky(rr: RiadokMrp[], d: DokladUctovania, o: string): string {
  return rr
    .map((r) => {
      const mn = r.mnozstvo || 1;
      const mj = String(r.mj ?? "").trim();
      return `
${o}  <Item>
${o}    <Description>${esc(skrat(r.popis, 100) || "Plnenie")}</Description>
${o}    <RowType>1</RowType>
${o}    <TaxCode>${r.typDph}</TaxCode>${mj && textPreMrp(mj).length <= 3 ? el("UnitCode", mj, `${o}    `) : ""}
${o}    <Quantity>${f(mn, 6)}</Quantity>
${o}    <UnitPrice>${f(r.zaklad / mn, 6)}</UnitPrice>
${o}    <TaxPercent>${f(r.sadzba, 2)}</TaxPercent>
${o}    <TaxAmount>${f((r.dph || r.dphRc) / mn, 6)}</TaxAmount>${el("CostCentre", d.stredisko, `${o}    `)}${el("ContractNumber", d.zakazka, `${o}    `)}
${o}    <RowSumType>${r.sumacia}</RowSumType>
${o}  </Item>`;
    })
    .join("");
}

type Suhrn = {
  typDph: number;
  typSadzby: number;
  sadzba: number;
  zaklad: number;
  dph: number;
  dphRc: number;
  odpocet: number;
};

/** Súčty po type DPH a sadzbe (v mene dokladu). */
function suhrny(rr: RiadokMrp[], prijata: boolean): Suhrn[] {
  const zakladna = zakladnaSadzba(rr);
  const out = new Map<string, Suhrn>();
  for (const r of rr) {
    const k = `${r.typDph}|${r.sadzba}`;
    const x = out.get(k) ?? {
      typDph: r.typDph,
      typSadzby: typSadzby(r.sadzba, zakladna),
      sadzba: r.sadzba,
      zaklad: 0,
      dph: 0,
      dphRc: 0,
      odpocet: 0,
    };
    x.zaklad = r2(x.zaklad + r.zaklad);
    x.dph = r2(x.dph + r.dph);
    x.dphRc = r2(x.dphRc + r.dphRc);
    if (prijata && r.odpocet) x.odpocet = r2(x.odpocet + r.dph + r.dphRc);
    out.set(k, x);
  }
  return [...out.values()];
}

function suhrnyXml(
  sumy: Suhrn[],
  mena: string,
  prepocet: (x: number) => number,
  o: string,
): string {
  return sumy
    .map(
      (s) => `
${o}  <SumValue>
${o}    <TaxCode>${s.typDph}</TaxCode>
${o}    <TaxType>${s.typSadzby}</TaxType>
${o}    <TaxPercent>${f(s.sadzba, 2)}</TaxPercent>
${o}    <CurrencyCode>${esc(mena)}</CurrencyCode>
${o}    <Amount>${f(prepocet(s.zaklad), 2)}</Amount>
${o}    <Tax>${f(prepocet(s.dph), 2)}</Tax>
${o}    <ReverseChargeTax>${f(prepocet(s.dphRc), 2)}</ReverseChargeTax>
${o}    <TaxApplied>${f(prepocet(s.odpocet), 2)}</TaxApplied>
${o}  </SumValue>`,
    )
    .join("");
}

/** Spoločné sumy hlavičky v domácej mene: osvobodené, znížená a základná sadzba. */
function hlavickaSum(sumy: Suhrn[], m: Mena) {
  const v = (typ: number, pole: "zaklad" | "dph" | "dphRc") =>
    r2(sumy.filter((s) => s.typSadzby === typ).reduce((a, s) => a + m.naDomacu(s[pole]), 0));
  return {
    nulova: v(3, "zaklad"),
    znizenaZaklad: v(2, "zaklad"),
    zakladnaZaklad: v(1, "zaklad"),
    znizenaDph: v(2, "dph"),
    zakladnaDph: v(1, "dph"),
    znizenaRc: v(2, "dphRc"),
    zakladnaRc: v(1, "dphRc"),
  };
}

function doklad(
  d: DokladUctovania,
  m: Mena,
  typ: number,
  nast: NastaveniaMrp,
  verzia: "SK" | "CZ",
  pokladna: boolean,
  o: string,
): string {
  const vydana = d.agenda === "vystavena";
  const s = d.druh === "dobropis" ? -1 : 1;
  const rr = riadkyMrp(d, typ);
  const sumy = suhrny(rr, !vydana);
  const h = hlavickaSum(sumy, m);
  const pk = cisloPredkontacie(d.riadky[0]?.predkontacia ?? d.predkontacia);
  const docType = d.druh === "dobropis" ? "D" : vydana && d.opravuje ? "V" : "";
  /*
    Prijatá a bloček: dátum odpočtu dane podľa voľby „Dátum odpočtu" v
    nastaveniach exportu (`datumOdpoctu`, predvolene dodanie — ako Pohoda);
    nie dátum nahratia bločku.
  */
  const odpocetDane = d.datumOdpoctu ?? d.datumZauctovania ?? d.datumDodania ?? d.datumVystavenia;
  const vs = String(d.vs ?? "")
    .replace(/\D/g, "")
    .slice(0, 10);
  // Pokladňa prefix radu v importe nemá — doklad očísluje podľa pokladne.
  const prefix = pokladna || vydana ? null : nast.radPrijate;
  const sumyDomace = suhrnyXml(sumy, m.domaca, m.naDomacu, `${o}  `);
  const sumyCudzie = m.cudzia ? suhrnyXml(sumy, m.kod, (x) => x, `${o}  `) : "";
  const eu =
    vydana && d.prenesenieDph && d.prenosTyp === "eu_b2b"
      ? d.euPlnenie === "sluzba"
        ? "3"
        : d.euPlnenie === "trojstranny"
          ? "2"
          : "0"
      : "";
  const tag = pokladna ? "CashVoucher" : "Invoice";
  return `
${o}<${tag}>${vydana ? el("DocumentNumber", d.cislo, `${o}  `) : ""}${el("UUID", /^[0-9a-f-]{36}$/i.test(d.id) ? d.id : "", `${o}  `)}${el("IssueDate", d.datumVystavenia, `${o}  `)}
${o}  <CurrencyCode>${esc(m.kod)}</CurrencyCode>
${o}  <ValuesWithTax>F</ValuesWithTax>
${o}  <TaxCode>${typ}</TaxCode>${el("DocType", docType, `${o}  `)}
${o}  <ZeroTaxRateAmount>${f(h.nulova, 2)}</ZeroTaxRateAmount>
${o}  <ReducedTaxRateAmount>${f(h.znizenaZaklad, 2)}</ReducedTaxRateAmount>
${o}  <BaseTaxRateAmount>${f(h.zakladnaZaklad, 2)}</BaseTaxRateAmount>
${o}  <RoundingAmount>${f(m.naDomacu(s * d.zaokruhlenie), 2)}</RoundingAmount>
${o}  <ReducedTaxRateTax>${f(h.znizenaDph, 2)}</ReducedTaxRateTax>
${o}  <BaseTaxRateTax>${f(h.zakladnaDph, 2)}</BaseTaxRateTax>${
    m.cudzia ? `\n${o}  <TotalWithTaxCurr>${f(s * d.celkom, 2)}</TotalWithTaxCurr>` : ""
  }${el("TaxPointDate", vydana ? (d.datumDodania ?? d.datumVystavenia) : odpocetDane, `${o}  `)}${el(
    "DeliveryDate",
    d.datumDodania ?? d.datumVystavenia,
    `${o}  `,
  )}${pk ? `\n${o}  <DoubleEntryBookkeepingCode>${pk}</DoubleEntryBookkeepingCode>` : ""}${el(
    "OriginalDocumentNumber",
    skrat(d.cislo, 50),
    `${o}  `,
  )}${el("CostCentre", d.stredisko, `${o}  `)}${el("ContractNumber", d.zakazka, `${o}  `)}
${o}  <VatRegime>0</VatRegime>
${o}  <VatCountry>${verzia}</VatCountry>${el(
    "Note",
    [d.poznamka, d.intPoznamka].filter(Boolean).join(" · "),
    `${o}  `,
  )}
${o}  <ImportParams>
${o}    <ReCalcTotals>1</ReCalcTotals>
${o}  </ImportParams>${el("DocumentNumberPrefix", skrat(prefix, 10), `${o}  `)}${
    pokladna
      ? `${el("CashRegisterIdentif", skrat(nast.pokladna, 20), `${o}  `)}
${o}  <CashVoucherType>V</CashVoucherType>
${o}  <CashVoucherSubType>0</CashVoucherSubType>
${o}  <Description>${esc(skrat(d.text, 50) || "Výdaj")}</Description>
${o}  <CurrRate>${m.cudzia ? f(m.kurz, 6) : "1.000000"}</CurrRate>
${o}  <CurrRateAmount>${m.cudzia ? f(m.mnozstvo, 6) : "1.000000"}</CurrRateAmount>${el("TaxPointDate2", d.datumDodania ?? d.datumVystavenia, `${o}  `)}`
      : `${el("VariableSymbol", vs, `${o}  `)}${el("ConstantSymbol", skrat(d.ks, 8), `${o}  `)}${el(
          "CreditNoteOriginalNumber",
          docType ? skrat(d.opravuje, 50) : "",
          `${o}  `,
        )}${el("PaymentDueDate", d.datumSplatnosti, `${o}  `)}
${o}  <CurrRateAmount>${m.cudzia ? f(m.mnozstvo, 6) : "1.000000"}</CurrRateAmount>
${o}  <CurrRate>${m.cudzia ? f(m.kurz, 6) : "1.000000"}</CurrRate>${el("SpecificSymbol", skrat(d.ss, 10), `${o}  `)}
${o}  <InvoiceType>${d.druh === "zaloha" ? "X" : "F"}</InvoiceType>${vydana ? el("RecapitulativeStatementCode", eu, `${o}  `) : ""}${
          vydana
            ? ""
            : `
${o}  <ReverseChargeReducedTaxRateTax>${f(h.znizenaRc, 2)}</ReverseChargeReducedTaxRateTax>
${o}  <ReverseChargeBaseTaxRateTax>${f(h.zakladnaRc, 2)}</ReverseChargeBaseTaxRateTax>${el("TaxPointDate2", d.datumDodania ?? d.datumVystavenia, `${o}  `)}`
        }`
  }${partner(d, verzia, `${o}  `)}
${o}  <Items>${polozky(rr, d, `${o}  `)}
${o}  </Items>
${o}  <SumValues>${sumyDomace}${sumyCudzie}
${o}  </SumValues>
${o}</${tag}>`;
}

/** Kódy, ktoré MRP drží v krátkych poliach — dlhší by import odmietol. */
function prilisDlhy(d: DokladUctovania): string | null {
  if (String(d.stredisko ?? "").trim().length > 6)
    return `stredisko „${d.stredisko}“ má viac ako 6 znakov — MRP ho neprijme`;
  if (String(d.zakazka ?? "").trim().length > 15)
    return `zákazka „${d.zakazka}“ má viac ako 15 znakov — MRP ju neprijme`;
  return null;
}

/**
 * Dávka pre MRP-K/S (`MRPKSData` verzie 2.0). Doklad, ktorý formát neunesie,
 * sa vráti v `preskocene` („<číslo> — dôvod“) a dávku nezhodí; `upozornenia`
 * sú doklady v súbore, ktoré treba v MRP skontrolovať.
 */
export function buildMrpUctovanie(opts: {
  firma: Record<string, any>;
  doklady: DokladUctovania[];
  nastavenia?: NastaveniaMrp;
}): { xml: string; preskocene: string[]; upozornenia: string[] } {
  const nast = opts.nastavenia ?? {};
  const krajina = opts.firma?.country;
  const domaca = domacaMena(krajina);
  const verzia: "SK" | "CZ" =
    String(nast.verzia ?? "").toUpperCase() === "CZ"
      ? "CZ"
      : String(nast.verzia ?? "").toUpperCase() === "SK"
        ? "SK"
        : domaca === "CZK"
          ? "CZ"
          : "SK";
  const preskocene: string[] = [];
  const upozornenia: string[] = [];
  const vydane: string[] = [];
  const prijate: string[] = [];
  const pokladna: string[] = [];

  for (const d of opts.doklady) {
    const nazov = d.cislo || d.partner.nazov || d.id;
    if (!d.riadky.length) {
      preskocene.push(`${nazov} — doklad nemá sumy`);
      continue;
    }
    if (d.odpocetZalohy > 0 && !d.odpocetVRiadkoch) {
      preskocene.push(`${nazov} — odpočet zálohy treba v MRP zaúčtovať ručne`);
      continue;
    }
    // Aj pre export vystavených faktúr mimo zaúčtovania (MRP_XML) — vymyslené zaokrúhlenie nie.
    const zaokr = prekazkaZaokruhlenia(d);
    if (zaokr) {
      preskocene.push(zaokr);
      continue;
    }
    if (d.oss) {
      preskocene.push(`${nazov} — predaj cez OSS zaúčtujte v MRP ručne (režim DPH OSS)`);
      continue;
    }
    if (d.agenda === "vystavena" && d.cislo.length > 10) {
      preskocene.push(`${nazov} — číslo faktúry má viac ako 10 znakov, MRP ho neprijme`);
      continue;
    }
    const dlhy = prilisDlhy(d);
    if (dlhy) {
      preskocene.push(`${nazov} — ${dlhy}`);
      continue;
    }
    // Odpočet zálohy (RowSumType 2) si MRP zaúčtuje samo — jeho predkontácia sa nepočíta.
    const predkontacie = [
      ...new Set(
        d.riadky
          .filter(
            (r) => !(r.zaklad < 0 && d.odpocetVRiadkoch && /^Odpočet zálohy/.test(r.text ?? "")),
          )
          .map((r) => String(r.predkontacia ?? d.predkontacia ?? "").trim())
          .filter(Boolean),
      ),
    ];
    if (predkontacie.length > 1) {
      preskocene.push(
        `${nazov} — MRP prijme na doklad len jednu predkontáciu, doklad je rozúčtovaný na ${predkontacie.join(", ")}`,
      );
      continue;
    }
    if (predkontacie[0] && !cisloPredkontacie(predkontacie[0]))
      upozornenia.push(
        `${nazov} — predkontácia „${predkontacie[0]}“ nie je číslo predkontácie MRP, doklad príde bez nej`,
      );
    // Číselné členenie na doklade je priamo typ DPH z MRP; inak podľa režimu z nastavení.
    const vlastny = ciselnyKod(d.riadky[0]?.clenenie ?? d.clenenie);
    const typ = vlastny != null ? { typ: vlastny } : typDokladu(d, nast, verzia);
    if ("chyba" in typ) {
      preskocene.push(`${nazov} — ${typ.chyba}`);
      continue;
    }
    const mena = d.mena || domaca;
    const cudzia = mena !== domaca;
    const zaJednu = domacejZaJednotku(d.kurz, krajina);
    if (cudzia && !zaJednu) {
      preskocene.push(`${nazov} — doklad v mene ${mena} nemá kurz`);
      continue;
    }
    const kzm = kurzZaMnozstvo(d.kurz, krajina);
    const m: Mena = {
      cudzia,
      kod: mena,
      domaca,
      naDomacu: (x) => (cudzia ? Number(x ?? 0) * zaJednu : Number(x ?? 0)),
      mnozstvo: kzm.mnozstvo,
      kurz: kzm.kurz,
    };
    if (d.agenda === "vystavena") vydane.push(doklad(d, m, typ.typ, nast, verzia, false, "    "));
    // Pokladničný doklad len s identifikátorom pokladne MRP — inak ide bloček ako faktúra prijatá.
    else if (d.agenda === "doklad" && d.forma === "pokladna" && String(nast.pokladna ?? "").trim())
      pokladna.push(doklad(d, m, typ.typ, nast, verzia, true, "    "));
    else prijate.push(doklad(d, m, typ.typ, nast, verzia, false, "    "));
  }

  const zoznam = (tag: string, polozky: string[]) =>
    polozky.length ? `\n  <${tag}>${polozky.join("")}\n  </${tag}>` : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MRPKSData version="2.0" countryCode="${verzia}" currencyCode="${domaca}">${zoznam(
    "IssuedInvoices",
    vydane,
  )}${zoznam("IncomingInvoices", prijate)}${zoznam("CashVouchers", pokladna)}
</MRPKSData>`;
  return { xml, preskocene, upozornenia };
}
