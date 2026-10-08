/*
  KROS Omega — zaúčtované doklady (Evidencia účtovných dokladov, typ údajov T00).

  Podľa oficiálnej štruktúry ImportExport_28_00_2025.xls, hárok „EUD", a
  číselníka typov súm platného pre doklady od roku 2025 (typy_sum_2025.xlsx):

  - riadok `R00 T00` otvára dávku,
  - `R01` je hlavička dokladu — stĺpce 1 až 29 sú povinné (žlté podfarbenie
    končí značkou „>>" v stĺpci 30),
  - `R02` s typom položky 0 je účtovný zápis: MD a Dal (syntetika + analytika),
    suma a **kód typu sumy**, ktorý určuje riadok priznania a oddiel KV DPH.

  Omega neprijíma kód predkontácie ako Pohoda — chce hotový účtovný zápis.
  Účty sa preto berú z číselníka predkontácií (stĺpce MD/Dal), protiúčet
  partnera, pokladne a DPH z nastavení firmy.

  Sadzby od roku 2025: „vyššia" (základná) 23 %, „nižšia" (znížená) 19 %,
  „znížená 2" 5 % — tak ich pomenúva aj typ sumy („základný / znížený /
  znížený 2"). Doklady spred roka 2025 majú iné typy súm, preto sa
  vynechajú s vysvetlením.

  Dobropis (OD, DD) ide so **zápornými** sumami a typmi súm pre opravu
  (§ 25 pri dodaní, § 53 pri odpočte) — tak ich Omega aj vyváža. Výdavkový
  pokladničný doklad (PD) má znamienko „-" v stĺpci 35.

  Súbor sa ukladá vo Windows-1250; prevod robí až sťahovanie, tu je reťazec.
*/

import { rozdelUcet, type DokladUctovania, type KodUctovania, type RiadokUctovania } from "./zauctovanie-export";

export type DruhOmega = "OF" | "OD" | "OPF" | "DF" | "DD" | "DPF" | "PD" | "ID";

export type NastaveniaOmega = {
  /** Kód evidencie a kód číselného radu v Omege podľa druhu dokladu (musia v Omege existovať). */
  evidencie?: Partial<Record<DruhOmega, { evidencia?: string | null; rad?: string | null }>>;
  /** Odberatelia — protiúčet vystavených faktúr. Predvolene 311. */
  ucetOdberatelia?: string | null;
  /** Dodávatelia — protiúčet prijatých faktúr. Predvolene 321. */
  ucetDodavatelia?: string | null;
  /** Pokladnica — protiúčet výdavkového pokladničného dokladu. Predvolene 211. */
  ucetPokladna?: string | null;
  /** Protiúčet interného dokladu (bloček platený kartou). Predvolene ako dodávatelia. */
  ucetInterne?: string | null;
  /** DPH na vstupe (prijaté doklady). Predvolene 343. */
  ucetDphVstup?: string | null;
  /** DPH na výstupe (vystavené faktúry). Predvolene 343. */
  ucetDphVystup?: string | null;
  /** Výnosový účet, keď predkontácia nemá účty (napr. 602). Bez neho sa doklad vynechá. */
  ucetVynosy?: string | null;
  /** Nákladový účet, keď predkontácia nemá účty (napr. 501). Bez neho sa doklad vynechá. */
  ucetNaklady?: string | null;
  /** Zaokrúhlenie nahor/nadol — predvolene 548 (náklad) a 648 (výnos). */
  ucetZaokruhlenieNaklad?: string | null;
  ucetZaokruhlenieVynos?: string | null;
};

/** Číselný typ dokladu v stĺpci 2 hlavičky R01 (hárok EUD). */
export const TYP_DOKLADU_OMEGA: Record<DruhOmega, number> = {
  OF: 100,
  OPF: 110,
  OD: 120,
  DF: 130,
  DPF: 140,
  DD: 150,
  PD: 160,
  ID: 180,
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function datumSk(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** Desatinná čiarka ako v slovenskom Exceli (z neho KROS import vyrába). */
function cislaSk(n: unknown): string {
  return r2(Number(n ?? 0)).toFixed(2).replace(".", ",");
}

/** Text do stĺpca s obmedzenou dĺžkou; tabulátor a nový riadok by rozbili vetu. */
function pole(v: unknown, max = 0): string {
  const s = String(v ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .trim();
  return max > 0 ? s.slice(0, max) : s;
}

/** Druh dokladu v Omege podľa agendy, druhu a formy. */
export function druhOmega(d: DokladUctovania): DruhOmega {
  if (d.agenda === "vystavena") return d.druh === "dobropis" ? "OD" : d.druh === "zaloha" ? "OPF" : "OF";
  if (d.agenda === "doklad") return d.forma === "pokladna" ? "PD" : d.forma === "interny" ? "ID" : "DF";
  return d.druh === "dobropis" ? "DD" : d.druh === "zaloha" ? "DPF" : "DF";
}

type Priehradka = "vyssia" | "nizsia" | "znizena2";

/** Sadzby od 1. 1. 2025: 23 vyššia, 19 nižšia, 5 znížená 2. */
function priehradka(sadzba: number): Priehradka | null {
  if (sadzba === 23) return "vyssia";
  if (sadzba === 19) return "nizsia";
  if (sadzba === 5) return "znizena2";
  return null;
}

/**
 * Kód typu sumy pre základ a daň jedného riadku (typy_sum_2025.xlsx).
 *
 * Vystavené: R01–R04 dodanie § 8, 9 (01/02 znížená, Y01/Y02 znížená 2,
 * 03/04 základná); oprava pri dodaní § 25 (2401/2502, 24Y01/25Y02,
 * 2403/2504); tuzemské prenesenie § 69 ods. 12 len základ (OA2, oprava OC1).
 * Prijaté: kúpa v tuzemsku § 49 ods. 2a (XA/18A, YA/18YA, A/19A), bez
 * nároku na odpočet (XKV/KV19, YKV/KV05, KV/KV23), oprava odpočítanej dane
 * § 53 (XAo/28XAo, YAo/28YAo, Ao/28Ao, bez odpočtu XAno/28XAno …).
 */
export function typySumy(
  smer: "vystup" | "vstup",
  p: Priehradka,
  opts: { oprava: boolean; odpocet: boolean; prenesenie: boolean },
): { zaklad: string; dan: string | null } {
  if (smer === "vystup") {
    if (opts.prenesenie) return { zaklad: opts.oprava ? "OC1" : "OA2", dan: null };
    if (opts.oprava)
      return p === "vyssia"
        ? { zaklad: "2403", dan: "2504" }
        : p === "nizsia"
          ? { zaklad: "2401", dan: "2502" }
          : { zaklad: "24Y01", dan: "25Y02" };
    return p === "vyssia"
      ? { zaklad: "03", dan: "04" }
      : p === "nizsia"
        ? { zaklad: "01", dan: "02" }
        : { zaklad: "Y01", dan: "Y02" };
  }
  if (opts.oprava) {
    const n = opts.odpocet ? "o" : "no";
    return p === "vyssia"
      ? { zaklad: `A${n}`, dan: `28A${n}` }
      : p === "nizsia"
        ? { zaklad: `XA${n}`, dan: `28XA${n}` }
        : { zaklad: `YA${n}`, dan: `28YA${n}` };
  }
  if (!opts.odpocet)
    return p === "vyssia"
      ? { zaklad: "KV", dan: "KV23" }
      : p === "nizsia"
        ? { zaklad: "XKV", dan: "KV19" }
        : { zaklad: "YKV", dan: "KV05" };
  return p === "vyssia"
    ? { zaklad: "A", dan: "19A" }
    : p === "nizsia"
      ? { zaklad: "XA", dan: "18A" }
      : { zaklad: "YA", dan: "18YA" };
}

/** Oddiely KV DPH, ktoré typ sumy pripúšťa (stĺpec „Oddiel KV DPH" číselníka). */
function oddielyTypu(typ: string): string[] {
  if (/^(0[1-4]|Y0[12]|2[45]0[1-4]|24Y01|25Y02)$/.test(typ)) return typ.startsWith("2") ? ["C1", "D1", "D2"] : ["A1", "C1", "D1", "D2"];
  if (typ === "OA2") return ["A2"];
  if (typ === "OC1") return ["C1"];
  if (/^(X?A|YA|18A|18YA|19A|X?KV|YKV|KV\d\d)$/.test(typ)) return ["B2", "B3", "C2"];
  if (/^(28)?[XY]?An?o$/.test(typ)) return ["C2"];
  return [];
}

type Zapis = {
  md: string;
  dal: string;
  suma: number;
  typ: string;
  text: string;
  oddiel: string;
};

export function buildOmegaUctovanie(opts: {
  firma: { name?: string | null; ico?: string | null; street?: string | null; zip?: string | null; city?: string | null };
  doklady: DokladUctovania[];
  kody: Record<string, KodUctovania>;
  nastavenia?: NastaveniaOmega;
}): { obsah: string; preskocene: string[] } {
  const { firma, doklady, kody } = opts;
  const n = opts.nastavenia ?? {};
  const preskocene: string[] = [];
  const riadky: string[] = [
    ["R00", "T00", "", pole(firma?.name), pole(firma?.ico, 12), pole(firma?.street, 40), pole(firma?.zip, 6), pole(firma?.city, 40)]
      .join("\t")
      .replace(/\t+$/, ""),
  ];

  for (const d of doklady) {
    const cislo = d.cislo || d.id;
    const druh = druhOmega(d);
    const ev = n.evidencie?.[druh];
    const evidencia = pole(ev?.evidencia, 5);
    const rad = pole(ev?.rad, 5);
    if (!evidencia || !rad) {
      preskocene.push(`${cislo} — v nastaveniach Omegy chýba kód evidencie alebo číselného radu pre ${druh}`);
      continue;
    }
    /*
      Cudzia mena: zápisy idú v eurách (TM) aj v mene dokladu (CM), v hlavičke
      kurz voči 1 € (množstvo jednotky 1). `kurz` je počet jednotiek meny za 1 €.
    */
    const cudzia = d.mena !== "EUR";
    const kurz = Number(d.kurz ?? 0) || 0;
    if (cudzia && !(kurz > 0)) {
      preskocene.push(`${cislo} — doklad v mene ${d.mena} nemá kurz, do Omegy by išiel v nesprávnej sume`);
      continue;
    }
    const tm = (x: number) => (cudzia ? r2(x / kurz) : r2(x));
    const datum = d.datumDodania ?? d.datumVystavenia;
    if (!datum || datum < "2025-01-01") {
      preskocene.push(`${cislo} — doklad spred roka 2025 má v Omege iné typy súm, zaúčtujte ho ručne`);
      continue;
    }
    if (d.dokladKPlatbe) {
      preskocene.push(`${cislo} — daňový doklad k prijatej platbe zaúčtujte v Omege ručne (len DPH, 324 / 343)`);
      continue;
    }
    if (d.odpocetZalohy > 0 && !d.odpocetVRiadkoch) {
      preskocene.push(`${cislo} — odpočet zálohy treba v Omege zaúčtovať ručne`);
      continue;
    }
    const vystup = d.agenda === "vystavena";
    if (!vystup && d.prenesenieDph) {
      preskocene.push(`${cislo} — samozdanenie (prenesenie daňovej povinnosti) zaúčtujte v Omege ručne`);
      continue;
    }
    const zle = d.riadky.find((r) => r.sadzba !== 0 && !priehradka(r.sadzba));
    if (zle) {
      preskocene.push(`${cislo} — sadzba ${zle.sadzba} % nie je platná od roku 2025`);
      continue;
    }

    const oprava = d.druh === "dobropis";
    // Dobropis ide so zápornými sumami (oprava zníži základ a daň).
    const zn = oprava ? -1 : 1;
    const partner = vystup
      ? (n.ucetOdberatelia || "311")
      : druh === "PD"
        ? (n.ucetPokladna || "211")
        : druh === "ID"
          ? (n.ucetInterne || n.ucetDodavatelia || "321")
          : (n.ucetDodavatelia || "321");
    const ucetDph = vystup ? n.ucetDphVystup || "343" : n.ucetDphVstup || "343";
    const kvDokladu =
      d.kv && d.kv !== "X"
        ? d.kv
        : d.kv === "X"
          ? ""
          : vystup
            ? d.prenesenieDph
              ? oprava
                ? "C1"
                : "A2"
              : oprava
                ? "C1"
                : "A1"
            : oprava
              ? "C2"
              : d.agenda === "doklad"
                ? "B3"
                : "B2";

    const zapisy: Zapis[] = [];
    let chyba: string | null = null;
    for (const r of d.riadky as RiadokUctovania[]) {
      const kod = r.predkontacia ? kody[r.predkontacia] : undefined;
      // Výnos/náklad z predkontácie; protistrana je partner (pri PD a ID pokladňa či interný účet).
      const vlastny = vystup ? (kod?.ucetD ?? n.ucetVynosy) : (kod?.ucetMd ?? n.ucetNaklady);
      if (!vlastny || !rozdelUcet(vlastny)) {
        chyba = r.predkontacia
          ? `predkontácia ${r.predkontacia} nemá v číselníku účty MD/Dal`
          : "chýba predkontácia s účtami (alebo náhradný účet v nastaveniach Omegy)";
        break;
      }
      const protiucet =
        druh === "PD" || druh === "ID" ? partner : (vystup ? kod?.ucetMd : kod?.ucetD) || partner;
      const text = pole(r.text || d.text, 60);
      const kv = r.kv && r.kv !== "X" ? r.kv : r.kv === "X" ? "" : kvDokladu;
      const p = priehradka(r.sadzba);
      if (!p) {
        // Nulová sadzba alebo plnenie mimo DPH — voľný základ, do priznania nevstupuje.
        zapisy.push({
          md: vystup ? protiucet : vlastny,
          dal: vystup ? vlastny : protiucet,
          suma: zn * r.zaklad,
          typ: "V",
          text,
          oddiel: "",
        });
        continue;
      }
      const typ = typySumy(vystup ? "vystup" : "vstup", p, {
        oprava,
        odpocet: r.odpocet,
        prenesenie: vystup && d.prenesenieDph,
      });
      const oddielZ = oddielyTypu(typ.zaklad).includes(kv) ? kv : "";
      zapisy.push({
        md: vystup ? protiucet : vlastny,
        dal: vystup ? vlastny : protiucet,
        suma: zn * r.zaklad,
        typ: typ.zaklad,
        text,
        oddiel: oddielZ,
      });
      if (typ.dan && r.dph) {
        // Daň bez nároku na odpočet sa neodpočíta — zostáva v náklade.
        const dphUcet = !vystup && !r.odpocet ? vlastny : ucetDph;
        zapisy.push({
          md: vystup ? protiucet : dphUcet,
          dal: vystup ? ucetDph : protiucet,
          suma: zn * r.dph,
          typ: typ.dan,
          text,
          oddiel: oddielyTypu(typ.dan).includes(kv) ? kv : "",
        });
      }
    }
    if (chyba) {
      preskocene.push(`${cislo} — ${chyba}`);
      continue;
    }

    // Halierové vyrovnanie: rozdiel celkovej sumy a súčtu riadkov.
    const vyr = r2(d.zaokruhlenie);
    if (vyr) {
      const naklad = n.ucetZaokruhlenieNaklad || "548";
      const vynos = n.ucetZaokruhlenieVynos || "648";
      const plus = vyr > 0;
      // Pri vystavenej zvýšenie pohľadávky je výnos; pri prijatej zvýšenie záväzku náklad.
      const ucet = vystup ? (plus ? vynos : naklad) : plus ? naklad : vynos;
      zapisy.push({
        md: vystup ? partner : ucet,
        dal: vystup ? ucet : partner,
        suma: zn * vyr,
        typ: plus ? "Vk" : "Vz",
        text: "Zaokrúhlenie",
        oddiel: "",
      });
    }

    const zlyUcet = zapisy.flatMap((z) => [z.md, z.dal]).find((u) => !rozdelUcet(u));
    if (zlyUcet) {
      preskocene.push(`${cislo} — neplatný účet „${zlyUcet}" (čakáme 3 číslice syntetiky a najviac 6 analytiky)`);
      continue;
    }

    const sucet = r2(zapisy.reduce((a, z) => a + z.suma, 0));
    if (sucet !== r2(zn * d.celkom)) {
      preskocene.push(`${cislo} — súčet zápisov (${sucet}) nesedí so sumou dokladu (${zn * d.celkom})`);
      continue;
    }

    // Hlavička: sumy po sadzbách (stĺpce 21–29 a 69–71).
    const zaSadzbu = (p: Priehradka) => {
      const rr = d.riadky.filter((r) => priehradka(r.sadzba) === p);
      return { zaklad: zn * rr.reduce((a, r) => a + r.zaklad, 0), dan: zn * rr.reduce((a, r) => a + r.dph, 0) };
    };
    const vy = zaSadzbu("vyssia");
    const ni = zaSadzbu("nizsia");
    const z2 = zaSadzbu("znizena2");
    const nulova = zn * d.riadky.filter((r) => !priehradka(r.sadzba)).reduce((a, r) => a + r.zaklad, 0);
    // Súčet v eurách zo zápisov prevedených po jednom — inak by sa o halier rozišiel s R02.
    const celkomTm = r2(zapisy.reduce((a, z) => a + tm(z.suma), 0));

    const r01: string[] = new Array(71).fill("");
    const set = (stlpec: number, hodnota: string) => {
      r01[stlpec - 1] = hodnota;
    };
    set(1, "R01");
    set(2, String(TYP_DOKLADU_OMEGA[druh]));
    set(3, evidencia);
    set(4, rad);
    // Interné číslo: vystavená nesie číslo z Faktera, ostatné si Omega pridelí z radu.
    set(5, vystup ? pole(d.cislo, 20) : "");
    set(6, pole(vystup ? d.vs || d.cislo : d.cislo, 20));
    set(7, pole(d.partner.nazov, 75));
    set(8, pole(d.partner.ico, 12));
    set(9, pole(d.partner.dic, 12));
    set(10, datumSk(d.datumVystavenia));
    set(11, datumSk(d.datumPrijatia ?? d.datumVystavenia));
    set(12, datumSk(d.datumSplatnosti ?? d.datumVystavenia));
    set(13, datumSk(d.datumDodania ?? d.datumVystavenia));
    // DUUP — dátum účtovného prípadu; z uzamknutého obdobia ide na deň po uzávierke.
    set(14, datumSk(d.datumZauctovania ?? d.datumDodania ?? d.datumVystavenia));
    set(15, cudzia ? pole(d.mena, 5) : "EUR");
    set(16, "1");
    // Kurz ECB a kurz pre DPH — Faktero pozná jeden, ten zo dňa pred dodaním.
    set(17, cudzia ? String(kurz).replace(".", ",") : "1");
    set(18, cudzia ? String(kurz).replace(".", ",") : "1");
    set(19, cudzia ? cislaSk(zn * d.celkom) : "");
    set(20, cislaSk(cudzia ? celkomTm : zn * d.celkom));
    set(21, "19");
    set(22, "23");
    set(23, cislaSk(tm(ni.zaklad)));
    set(24, cislaSk(tm(vy.zaklad)));
    set(25, cislaSk(tm(nulova)));
    set(26, cislaSk(0));
    set(27, cislaSk(tm(ni.dan)));
    set(28, cislaSk(tm(vy.dan)));
    set(29, cislaSk(tm(zn * vyr)));
    set(30, "Faktero");
    set(31, pole(d.ks, 5));
    set(32, pole(d.ss));
    if (druh === "PD") set(35, "-");
    set(36, pole(d.partner.iban));
    set(40, pole([d.poznamka, d.intPoznamka].filter(Boolean).join(" · ")));
    set(41, pole(d.text, 60));
    if (druh === "PD") set(43, pole(d.partner.nazov));
    const icDph = pole(d.partner.icDph, 50);
    if (/^[A-Z]{2}/i.test(icDph)) {
      set(44, icDph.slice(0, 2).toUpperCase());
      set(45, icDph);
    }
    // Do KV DPH ide číslo dokladu od dodávateľa, pri vystavenej naše.
    set(54, pole(d.cislo, 32));
    if (oprava && d.opravuje) set(55, pole(d.opravuje));
    set(59, "Faktero");
    set(62, pole(d.partner.iban, 50));
    set(69, "5");
    set(70, cislaSk(tm(z2.zaklad)));
    set(71, cislaSk(tm(z2.dan)));
    riadky.push(r01.join("\t").replace(/\t+$/, ""));

    for (const z of zapisy) {
      const md = rozdelUcet(z.md)!;
      const dal = rozdelUcet(z.dal)!;
      const r02: string[] = new Array(26).fill("");
      const s2 = (stlpec: number, hodnota: string) => {
        r02[stlpec - 1] = hodnota;
      };
      s2(1, "R02");
      s2(2, "0");
      s2(3, md.synteticky);
      s2(4, md.analyticky);
      s2(5, dal.synteticky);
      s2(6, dal.analyticky);
      s2(7, cislaSk(tm(z.suma)));
      s2(8, cudzia ? cislaSk(z.suma) : "");
      s2(9, pole(z.text, 60));
      s2(10, z.typ);
      s2(13, pole(d.stredisko, 5));
      s2(17, pole(d.cinnost, 5));
      // Zákazka cez interné číslo (stĺpec 23) — kód zákazky má len 5 znakov.
      s2(23, pole(d.zakazka, 20));
      s2(26, z.oddiel);
      riadky.push(r02.join("\t").replace(/\t+$/, ""));
    }
  }

  return { obsah: riadky.join("\r\n") + "\r\n", preskocene };
}
