/**
 * Podklady pre tri výkazy k DPH: priznanie, kontrolný výkaz a súhrnný výkaz.
 *
 * Počíta sa tu len z dokladov — bez databázy a bez prehliadača, aby sa dalo
 * overiť príkladmi z metodického pokynu. Serializáciu do XML robí
 * `dph-vykazy-xml.ts`, načítanie dokladov `dph-vykazy.server.ts`.
 *
 * Dôležité je, čo z dokladu vyplynúť nevie a musí byť zapísané:
 *  - pri prijatej faktúre režim dane (kto ju platí),
 *  - pri dodaní do EÚ, či šlo o tovar, službu alebo trojstranný obchod,
 *  - pri opravnej faktúre číslo pôvodnej.
 * Bez nich by výkaz vyzeral hotovo a bol by nesprávny, preto sa chýbajúce
 * údaje zbierajú do `vytky` a obrazovka ich ukáže ešte pred odoslaním.
 */

import { najblizsiaSadzba, sadzbyKuDnu } from "./vat-rates";
import type { Oprava53b } from "./dph-nezaplatene";

export type Obdobie = {
  rok: number;
  /** Mesačný platiteľ vyplní mesiac, štvrťročný štvrťrok. Nikdy oboje. */
  mesiac?: number | null;
  stvrtrok?: number | null;
};

export type SadzbovyRiadok = { sadzba: number; zaklad: number; dan: number };

export type VystavenaFaktura = {
  cislo: string;
  /**
   * `regular`, `proforma`, `credit_note`, `advance_payment` — zálohová faktúra
   * do výkazov nevstupuje, doklad k prijatej platbe áno.
   */
  typ: string;
  /** Dátum dodania; keď chýba, dátum vyhotovenia. */
  datumDodania: string;
  odberatelIcDph?: string | null;
  odberatelNazov?: string | null;
  prenosDane?: boolean | null;
  /** `domestic_69` tuzemský prenos, `eu_b2b` dodanie do EÚ, `export` vývoz. */
  prenosTyp?: string | null;
  euPlnenie?: "tovar" | "sluzba" | "trojstranny" | null;
  /** Číslo faktúry, ktorú tento doklad opravuje (dobropis). */
  opravujeCislo?: string | null;
  /** Oprava základu dane podľa § 25a (nevymožiteľná pohľadávka) — r. 26/27, C.1 ONP. */
  oprava25a?: boolean | null;
  /** Predaj spotrebiteľovi v EÚ — daň sa odvádza cez OSS, nie tu. */
  oss?: boolean | null;
  ossStat?: string | null;
  riadky: SadzbovyRiadok[];
};

export type PrijataFaktura = {
  cislo: string;
  dodavatelNazov?: string | null;
  dodavatelIcDph?: string | null;
  dodavatelDic?: string | null;
  datumDodania: string;
  rezim: "tuzemsko" | "samozdanenie" | "nadobudnutie" | "dovoz" | "bez_dane";
  odpocet: boolean;
  opravujeCislo?: string | null;
  riadky: SadzbovyRiadok[];
  /** Ručne zvolené členenie KV (B1, B2, X = nezahŕňať); prázdne = automaticky. */
  kv?: string | null;
  /** Podiel odpočítateľnej DPH (účtovanie pomerom, napr. auto 50/50); chýba = celá. */
  podielOdpoctu?: number;
};

/** Zjednodušená faktúra — bloček z registračnej pokladnice, doklad za PHM a pod. */
export type PrijatyDoklad = {
  dodavatelNazov?: string | null;
  dodavatelIcDph?: string | null;
  dodavatelDic?: string | null;
  odpocet: boolean;
  riadky: SadzbovyRiadok[];
  /**
   * Ručne zvolené členenie KV: B2 = doklad je plnohodnotná faktúra (ide do
   * B.2 s číslom a IČ DPH), X = do výkazu nepatrí; inak B.3.
   */
  kv?: string | null;
  cislo?: string | null;
  datum?: string | null;
  /** Podiel odpočítateľnej DPH (účtovanie pomerom); chýba = celá. */
  podielOdpoctu?: number;
};

export type Vstup = {
  obdobie: Obdobie;
  vystavene: VystavenaFaktura[];
  prijate: PrijataFaktura[];
  doklady: PrijatyDoklad[];
  /** Opravy odpočtu podľa § 53b, ktoré patria do obdobia (r. 29, C.2 ONP). */
  opravy53b?: Oprava53b[];
};

/** Čo chýba alebo nesedí. Výkaz sa dá pozrieť, ale nemá sa podať naslepo. */
export type Vytka = { doklad: string; text: string };

export function hraniceObdobia(o: Obdobie): { od: string; do: string } {
  const den = (r: number, m: number, d: number) =>
    `${r}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (o.stvrtrok) {
    const prvy = (o.stvrtrok - 1) * 3 + 1;
    const posledny = prvy + 2;
    return { od: den(o.rok, prvy, 1), do: den(o.rok, posledny, dniVMesiaci(o.rok, posledny)) };
  }
  const m = o.mesiac ?? 1;
  return { od: den(o.rok, m, 1), do: den(o.rok, m, dniVMesiaci(o.rok, m)) };
}

function dniVMesiaci(rok: number, mesiac: number): number {
  return new Date(Date.UTC(rok, mesiac, 0)).getUTCDate();
}

/** Zaokrúhlenie na eurocenty — priznanie aj výkazy chodia na dve desatinné. */
export function centy(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Tlačivo priznania. Od obdobia 07/2025 platí vzor MF/007833/2025-731 (schéma
 * DPH2025) — riadky sú rozčlenené podľa sadzieb (19 % / 5 % / 23 %). Za staršie
 * obdobia (aj dodatočné priznanie) sa podáva pôvodné tlačivo DPH2021.
 */
export type VerziaPriznania = "2021" | "2025";

export function verziaPriznania(o: Obdobie): VerziaPriznania {
  return hraniceObdobia(o).od >= "2025-07-01" ? "2025" : "2021";
}

/**
 * Pásmo sadzby podľa § 27: základná (ods. 1), znížená (ods. 2 — 19 %) a
 * druhá znížená (ods. 3 — 5 %). Nula alebo neznáma sadzba nepatrí nikam.
 */
type Pasmo = "zakladna" | "znizena" | "znizena2";

function pasmoSadzby(sadzba: number, den: string | null | undefined): Pasmo | null {
  if (!(sadzba > 0)) return null;
  const t = sadzbyKuDnu("SK", den || undefined);
  if (sadzba === t.high) return "zakladna";
  if (t.third != null && sadzba === t.third) return "znizena2";
  return "znizena";
}

/**
 * Riadky priznania pre jedno pásmo sadzby. Na starom tlačive sa obe znížené
 * sadzby sčítavajú do spoločného riadku, na novom má každá vlastný.
 */
function riadkyPasma(
  pasmo: Pasmo,
  nove: boolean,
  riadky: { zakladna: [string, string]; znizena: [string, string]; znizena2: [string, string] },
): [string, string] {
  if (pasmo === "znizena2" && !nove) return riadky.znizena;
  return riadky[pasmo];
}

/**
 * Doklad, ktorý do výkazov nepatrí vôbec.
 *
 * Zálohová faktúra nie je daňový doklad a predaj cez OSS sa priznáva v
 * osobitnom priznaní k jednému kontaktnému miestu — do slovenského priznania
 * ani kontrolného výkazu nevstupuje.
 */
function doVykazov(f: VystavenaFaktura): boolean {
  return f.typ !== "proforma" && !f.oss;
}

/**
 * Odpočíta zálohu, ktorá už bola zdanená dokladom k prijatej platbe.
 *
 * Bez toho by sa tá istá daň priznala dvakrát: raz pri prijatí platby a znovu
 * pri dodaní. Vyúčtovacia faktúra nesie celé plnenie, do výkazu z nej má ísť
 * len rozdiel. Odpočítava sa po sadzbách — záloha aj dodanie môžu mať viac
 * sadzieb a miešať ich by rozhodilo riadky priznania.
 */
export function odpocitajZdanenuZalohu(
  riadky: SadzbovyRiadok[],
  zaloha: SadzbovyRiadok[],
): SadzbovyRiadok[] {
  if (!zaloha.length) return riadky;
  const podlaSadzby = new Map<number, SadzbovyRiadok>();
  for (const r of riadky) {
    const m = podlaSadzby.get(r.sadzba);
    if (m) {
      m.zaklad += r.zaklad;
      m.dan += r.dan;
    } else {
      podlaSadzby.set(r.sadzba, { ...r });
    }
  }
  for (const z of zaloha) {
    const m = podlaSadzby.get(z.sadzba);
    if (m) {
      m.zaklad -= z.zaklad;
      m.dan -= z.dan;
    } else {
      // Sadzba, ktorá na vyúčtovaní nie je: záporný riadok je správnejší než
      // ticho zahodená daň — v priznaní sa aspoň ozve.
      podlaSadzby.set(z.sadzba, { sadzba: z.sadzba, zaklad: -z.zaklad, dan: -z.dan });
    }
  }
  return [...podlaSadzby.values()]
    .map((r) => ({
      sadzba: r.sadzba,
      zaklad: Math.round(r.zaklad * 100) / 100,
      dan: Math.round(r.dan * 100) / 100,
    }))
    .filter((r) => r.zaklad !== 0 || r.dan !== 0);
}

function jeOpravna(f: VystavenaFaktura): boolean {
  return f.typ === "credit_note" || Boolean(f.opravujeCislo);
}

// ── Kontrolný výkaz ───────────────────────────────────────────────────────

export type KvA1 = {
  odb?: string;
  f: string;
  den: string;
  z: number;
  d: number;
  s: number;
};
export type KvA2 = { odb: string; f: string; den: string; z: number };
export type KvB1B2 = {
  dod?: string;
  f: string;
  den: string;
  z: number;
  d: number;
  s: number;
  o: number;
};
export type KvB31 = { z: number; d: number; o: number };
export type KvB32 = { dod: string; z: number; d: number; o: number };
export type KvC1 = {
  odb?: string;
  fo: string;
  fp: string;
  zr: number;
  dr: number;
  s: number;
  /** Oprava z dôvodu nevymožiteľnej pohľadávky (§ 25a) — atribút ONP = „x“. */
  onp?: boolean;
};
export type KvC2 = {
  dod?: string;
  fo: string;
  fp: string;
  zr: number;
  dr: number;
  s: number;
  or: number;
  /** Oprava odpočtu podľa § 53b — atribút ONP = „x“. */
  onp?: boolean;
};

export type KontrolnyVykaz = {
  a1: KvA1[];
  a2: KvA2[];
  b1: KvB1B2[];
  b2: KvB1B2[];
  b31: KvB31 | null;
  b32: KvB32[];
  c1: KvC1[];
  c2: KvC2[];
  vytky: Vytka[];
};

/** Hranica, od ktorej sa zjednodušené faktúry rozpisujú po dodávateľoch (§ 78a). */
export const HRANICA_B3 = 3000;

export function kontrolnyVykaz(vstup: Vstup): KontrolnyVykaz {
  const vykaz: KontrolnyVykaz = {
    a1: [],
    a2: [],
    b1: [],
    b2: [],
    b31: null,
    b32: [],
    c1: [],
    c2: [],
    vytky: [],
  };

  for (const f of vstup.vystavene) {
    if (!doVykazov(f)) continue;

    /*
      Oprava oslobodeného dodania do EÚ alebo vývozu: pôvodné dodanie v KV nie
      je (nepatrí do A.1 ani A.2), preto ani jeho oprava nepatrí do C.1.
    */
    if (jeOpravna(f) && f.prenosDane && (f.prenosTyp === "eu_b2b" || f.prenosTyp === "export")) continue;

    if (jeOpravna(f)) {
      // C.1 — opravná faktúra sa páruje s pôvodnou, inak ju daniari nespoja.
      if (!f.opravujeCislo) {
        vykaz.vytky.push({
          doklad: f.cislo,
          text: "Opravná faktúra nemá vyplnené číslo pôvodnej faktúry — do časti C.1 ju bez neho poslať nemožno.",
        });
        continue;
      }
      for (const r of f.riadky) {
        if (r.zaklad === 0 && r.dan === 0) continue;
        vykaz.c1.push({
          odb: f.odberatelIcDph?.trim() || undefined,
          fo: f.cislo,
          fp: f.opravujeCislo,
          zr: centy(r.zaklad),
          dr: centy(r.dan),
          s: Math.round(r.sadzba),
          ...(f.oprava25a ? { onp: true } : {}),
        });
      }
      continue;
    }

    if (f.prenosTyp === "domestic_69") {
      // A.2 — tuzemský prenos daňovej povinnosti; odberateľ musí byť platiteľ.
      const odb = f.odberatelIcDph?.trim();
      if (!odb) {
        vykaz.vytky.push({
          doklad: f.cislo,
          text: "Prenos daňovej povinnosti v tuzemsku, ale odberateľ nemá IČ DPH — časť A.2 ho vyžaduje.",
        });
        continue;
      }
      vykaz.a2.push({
        odb,
        f: f.cislo,
        den: f.datumDodania,
        z: centy(f.riadky.reduce((a, r) => a + r.zaklad, 0)),
      });
      continue;
    }

    // Oslobodené dodania (do EÚ, vývoz) do kontrolného výkazu nepatria.
    if (f.prenosDane) continue;

    for (const r of f.riadky) {
      if (r.sadzba <= 0) continue;
      vykaz.a1.push({
        odb: f.odberatelIcDph?.trim() || undefined,
        f: f.cislo,
        den: f.datumDodania,
        z: centy(r.zaklad),
        d: centy(r.dan),
        s: Math.round(r.sadzba),
      });
    }
  }

  for (const p of vstup.prijate) {
    if (p.rezim === "bez_dane") continue;
    if (p.kv === "X") continue;

    if (p.opravujeCislo) {
      for (const r of p.riadky) {
        vykaz.c2.push({
          dod: p.dodavatelIcDph?.trim() || undefined,
          fo: p.cislo,
          fp: p.opravujeCislo,
          zr: centy(r.zaklad),
          dr: centy(r.dan),
          s: Math.round(r.sadzba),
          or: centy(p.odpocet ? r.dan : 0),
        });
      }
      continue;
    }

    const doB1 =
      p.kv === "B1" ? true : p.kv === "B2" ? false : p.rezim === "samozdanenie" || p.rezim === "nadobudnutie";
    if (!doB1 && !p.odpocet) continue; // bez odpočtu sa faktúra do B.2 neuvádza
    if (p.rezim === "dovoz") continue; // dovoz sa vykazuje len v priznaní

    for (const r of p.riadky) {
      if (r.sadzba <= 0 && r.dan === 0) continue;
      const riadok: KvB1B2 = {
        dod: p.dodavatelIcDph?.trim() || undefined,
        f: p.cislo,
        den: p.datumDodania,
        z: centy(r.zaklad),
        d: centy(r.dan),
        s: Math.round(r.sadzba),
        o: centy(p.odpocet ? r.dan * (p.podielOdpoctu ?? 1) : 0),
      };
      if (doB1) {
        vykaz.b1.push(riadok);
      } else {
        if (!riadok.dod) {
          vykaz.vytky.push({
            doklad: p.cislo,
            text: "Prijatá faktúra nemá IČ DPH dodávateľa — časť B.2 ho vyžaduje.",
          });
          continue;
        }
        vykaz.b2.push(riadok);
      }
    }
  }

  /*
    C.2 — oprava odpočtu podľa § 53b bez dokladu: číslo opravnej faktúry „0“
    (podľa FS), číslo pôvodnej faktúry, záporné hodnoty pri vrátení a kladné
    pri opätovnom odpočte, ONP = „x“.
  */
  for (const o of vstup.opravy53b ?? []) {
    for (const r of o.riadky) {
      vykaz.c2.push({
        dod: o.dodavatelIcDph?.trim() || undefined,
        fo: "0",
        fp: o.cislo,
        zr: centy(r.zaklad),
        dr: centy(r.dan),
        s: Math.round(r.sadzba),
        or: centy(r.dan),
        onp: true,
      });
    }
  }

  // B.3 — zjednodušené faktúry. Do 3 000 € odpočítanej dane sumárne, nad
  // hranicu po dodávateľoch.
  /*
    Doklad označený ako B.2 je plnohodnotná faktúra (napr. faktúra nahratá
    medzi doklady) — ide po riadkoch s číslom a IČ DPH dodávateľa. „X" do
    výkazu nejde vôbec. Ostatné sú zjednodušené faktúry v B.3.
  */
  for (const d of vstup.doklady) {
    if (d.kv !== "B2" || !d.odpocet) continue;
    for (const r of d.riadky) {
      if (r.sadzba <= 0 && r.dan === 0) continue;
      const dod = d.dodavatelIcDph?.trim() || undefined;
      if (!dod || !d.cislo) {
        vykaz.vytky.push({
          doklad: d.cislo || d.dodavatelNazov || "doklad",
          text: "Doklad označený pre B.2 potrebuje číslo a IČ DPH dodávateľa.",
        });
        break;
      }
      vykaz.b2.push({
        dod,
        f: d.cislo,
        den: String(d.datum ?? ""),
        z: centy(r.zaklad),
        d: centy(r.dan),
        s: Math.round(r.sadzba),
        o: centy(r.dan * (d.podielOdpoctu ?? 1)),
      });
    }
  }
  const sOdpoctom = vstup.doklady.filter((d) => d.odpocet && d.kv !== "B2" && d.kv !== "X");
  const danSpolu = centy(
    sOdpoctom.reduce((a, d) => a + d.riadky.reduce((b, r) => b + r.dan, 0), 0),
  );
  if (sOdpoctom.length > 0) {
    if (danSpolu < HRANICA_B3) {
      vykaz.b31 = {
        z: centy(sOdpoctom.reduce((a, d) => a + d.riadky.reduce((b, r) => b + r.zaklad, 0), 0)),
        d: danSpolu,
        o: centy(
          sOdpoctom.reduce(
            (a, d) => a + d.riadky.reduce((b, r) => b + r.dan, 0) * (d.podielOdpoctu ?? 1),
            0,
          ),
        ),
      };
    } else {
      const podlaDodavatela = new Map<string, KvB32>();
      for (const d of sOdpoctom) {
        const kluc = (d.dodavatelIcDph || d.dodavatelDic || "").trim();
        if (!kluc) {
          vykaz.vytky.push({
            doklad: d.dodavatelNazov ?? "doklad",
            text: "Doklad nemá IČ DPH ani DIČ dodávateľa — nad 3 000 € sa časť B.3.2 rozpisuje po dodávateľoch.",
          });
          continue;
        }
        const s = podlaDodavatela.get(kluc) ?? { dod: kluc, z: 0, d: 0, o: 0 };
        for (const r of d.riadky) {
          s.z = centy(s.z + r.zaklad);
          s.d = centy(s.d + r.dan);
          s.o = centy(s.o + r.dan * (d.podielOdpoctu ?? 1));
        }
        podlaDodavatela.set(kluc, s);
      }
      vykaz.b32 = [...podlaDodavatela.values()];
    }
  }

  return vykaz;
}

// ── Súhrnný výkaz ─────────────────────────────────────────────────────────

/** Kód plnenia: prázdny = tovar, 1 = trojstranný obchod, 2 = služba. */
export type SvRiadok = { kodStatu: string; idCislo: string; hodnota: number; kod: "" | "1" | "2" };

export type SuhrnnyVykaz = { riadky: SvRiadok[]; celkom: number; vytky: Vytka[] };

const KOD_PLNENIA: Record<string, "" | "1" | "2"> = {
  tovar: "",
  trojstranny: "1",
  sluzba: "2",
};

export function suhrnnyVykaz(vstup: Vstup): SuhrnnyVykaz {
  const vytky: Vytka[] = [];
  const mapa = new Map<string, SvRiadok>();

  for (const f of vstup.vystavene) {
    if (!doVykazov(f)) continue;
    if (f.prenosTyp !== "eu_b2b") continue;

    const ic = (f.odberatelIcDph ?? "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(ic)) {
      vytky.push({
        doklad: f.cislo,
        text: "Dodanie do EÚ bez platného IČ DPH odberateľa — do súhrnného výkazu sa nedá zapísať.",
      });
      continue;
    }
    if (!f.euPlnenie) {
      vytky.push({
        doklad: f.cislo,
        text: "Nie je určené, či išlo o tovar, službu alebo trojstranný obchod — kód plnenia sa nedá doplniť.",
      });
      continue;
    }

    const kod = KOD_PLNENIA[f.euPlnenie];
    const kodStatu = ic.slice(0, 2);
    const idCislo = ic.slice(2);
    const kluc = `${kodStatu}|${idCislo}|${kod}`;
    // Opravná faktúra hodnotu znižuje — dobropis sa do súhrnu započíta záporne.
    // Ťarchopis hodnotu zvyšuje.
    // Dobropis znižuje (bez ohľadu na to, či je uložený kladne či záporne), ťarchopis zvyšuje.
    const sucet = f.riadky.reduce((a, r) => a + r.zaklad, 0);
    const hodnota = jeOpravna(f) && f.typ !== "debit_note" ? -Math.abs(sucet) : sucet;
    const s = mapa.get(kluc) ?? { kodStatu, idCislo, hodnota: 0, kod };
    s.hodnota = centy(s.hodnota + hodnota);
    mapa.set(kluc, s);
  }

  const riadky = [...mapa.values()].filter((r) => r.hodnota !== 0);
  return {
    riadky,
    celkom: centy(riadky.reduce((a, r) => a + r.hodnota, 0)),
    vytky,
  };
}

// ── Priznanie k DPH ───────────────────────────────────────────────────────

/** Riadky, ktoré z dokladov nevyplývajú a dopĺňa ich účtovník. */
export type RucneRiadky = Partial<
  Record<
    | "r11"
    | "r11a"
    | "r11b"
    | "r11c"
    | "r11d"
    | "r11e"
    | "r12"
    | "r12a"
    | "r12b"
    | "r12c"
    | "r12d"
    | "r12e"
    | "r16"
    | "r22"
    | "r22a"
    | "r23"
    | "r23a"
    | "r23b"
    | "r23c"
    | "r26"
    | "r27"
    | "r29"
    | "r30"
    | "r31"
    | "r34",
    number
  >
>;

export type Priznanie = Record<string, number> & { vytky?: never };

export function priznanie(vstup: Vstup, rucne: RucneRiadky = {}): Record<string, number> {
  const r: Record<string, number> = {};
  const nove = verziaPriznania(vstup.obdobie) === "2025";
  const pripocitaj = (kluc: string, hodnota: number) => {
    r[kluc] = centy((r[kluc] ?? 0) + hodnota);
  };

  for (const f of vstup.vystavene) {
    if (!doVykazov(f)) continue;

    // Dodanie s prenosom daňovej povinnosti v tuzemsku dodávateľ v priznaní
    // neuvádza — daň priznáva odberateľ, dodávateľ len v časti A.2 výkazu.
    if (f.prenosTyp === "domestic_69") continue;

    /*
      Oslobodené dodania: opravná faktúra sa od základu odpočíta (dobropis) alebo
      pripočíta (ťarchopis) — bod 32 poučenia. Dobropis má v databáze sumy
      záporné, ťarchopis kladné, takže znamienko nesie už samotná suma; dobropis
      uložený kladne (starší import) sa otočí.
    */
    const oslobodeny = () => {
      const s0 = f.riadky.reduce((a, x) => a + x.zaklad, 0);
      return f.typ === "credit_note" ? -Math.abs(s0) : s0;
    };
    if (f.prenosDane && f.prenosTyp === "eu_b2b") {
      // Tovar do EÚ ide do r13 a r14; služba do iného členského štátu nie je
      // predmetom dane v tuzemsku a v priznaní sa neuvádza (len v súhrnnom výkaze).
      if (f.euPlnenie === "sluzba" || f.euPlnenie === "trojstranny") continue;
      const zaklad = oslobodeny();
      pripocitaj("r13", zaklad);
      pripocitaj("r14", zaklad);
      continue;
    }
    if (f.prenosDane && f.prenosTyp === "export") {
      const zaklad = oslobodeny();
      pripocitaj("r13", zaklad);
      pripocitaj("r15", zaklad);
      continue;
    }

    for (const x of f.riadky) {
      if (x.sadzba <= 0) continue;
      if (jeOpravna(f)) {
        if (f.oprava25a) {
          // § 25a — nevymožiteľná pohľadávka: r. 26 a r. 27 (zníženie mínus,
          // vrátenie opravy po úhrade plus).
          pripocitaj("r26", x.zaklad);
          pripocitaj("r27", x.dan);
          continue;
        }
        // Oprava základu dane a dane podľa § 25 — so znamienkom mínus.
        pripocitaj("r24", x.zaklad);
        pripocitaj("r25", x.dan);
        continue;
      }
      const pasmo = pasmoSadzby(x.sadzba, f.datumDodania);
      if (!pasmo) continue;
      const [rz, rd] = riadkyPasma(pasmo, nove, {
        znizena: ["r01", "r02"],
        znizena2: ["r01a", "r02a"],
        zakladna: ["r03", "r04"],
      });
      pripocitaj(rz, x.zaklad);
      pripocitaj(rd, x.dan);
    }
  }

  for (const p of vstup.prijate) {
    if (p.rezim === "bez_dane") continue;
    for (const x of p.riadky) {
      const pasmo = pasmoSadzby(x.sadzba, p.datumDodania);

      if (p.opravujeCislo) {
        // Prijatý dobropis: opravuje sa odpočítaná daň (§ 53).
        if (p.odpocet) pripocitaj("r28", -x.dan);
        continue;
      }

      if (p.rezim === "nadobudnutie" && pasmo) {
        const [rz, rd] = riadkyPasma(pasmo, nove, {
          znizena: ["r05", "r06"],
          znizena2: ["r05a", "r06a"],
          zakladna: ["r07", "r08"],
        });
        pripocitaj(rz, x.zaklad);
        pripocitaj(rd, x.dan);
      } else if (p.rezim === "samozdanenie") {
        // Staré tlačivo má pre § 69 jeden riadok, nové tri podľa sadzby.
        const [rz, rd] =
          nove && pasmo
            ? riadkyPasma(pasmo, nove, {
                znizena: ["r09", "r10"],
                znizena2: ["r09a", "r10a"],
                zakladna: ["r09b", "r10b"],
              })
            : ["r09", "r10"];
        pripocitaj(rz, x.zaklad);
        pripocitaj(rd, x.dan);
      }

      if (!p.odpocet || !pasmo) continue;
      const odp = centy(x.dan * (p.podielOdpoctu ?? 1));
      const [celkom, tuzemsko, dovoz] =
        pasmo === "zakladna"
          ? ["r19", "r21", "r23"]
          : pasmo === "znizena2" && nove
            ? ["r18a", "r20a", "r22a"]
            : ["r18", "r20", "r22"];
      pripocitaj(celkom, odp);
      if (p.rezim === "tuzemsko") pripocitaj(tuzemsko, odp);
      if (p.rezim === "dovoz") pripocitaj(dovoz, odp);
    }
  }

  // § 53b — vrátenie odpočtu je r. 29 so znamienkom plus, opätovný odpočet mínus.
  for (const o of vstup.opravy53b ?? []) {
    for (const x of o.riadky) pripocitaj("r29", -x.dan);
  }

  for (const d of vstup.doklady) {
    if (!d.odpocet) continue;
    for (const x of d.riadky) {
      if (x.dan === 0) continue;
      // Bloček je vždy tuzemské plnenie; sadzbu posúdi cenník ku dňu dokladu.
      const pasmo = pasmoSadzby(x.sadzba, d.datum) ?? "zakladna";
      const odp = centy(x.dan * (d.podielOdpoctu ?? 1));
      const [celkom, tuzemsko] =
        pasmo === "zakladna" ? ["r19", "r21"] : pasmo === "znizena2" && nove ? ["r18a", "r20a"] : ["r18", "r20"];
      pripocitaj(celkom, odp);
      pripocitaj(tuzemsko, odp);
    }
  }

  for (const [kluc, hodnota] of Object.entries(rucne)) {
    if (typeof hodnota === "number" && hodnota !== 0) pripocitaj(kluc, hodnota);
  }

  // r17 — daň celkom (na novom tlačive aj riadky po sadzbách, bod 34 poučenia).
  r.r17 = centy(
    [
      "r02",
      "r02a",
      "r04",
      "r06",
      "r06a",
      "r08",
      "r10",
      "r10a",
      "r10b",
      "r12",
      "r12a",
      "r12b",
      "r12c",
      "r12d",
      "r12e",
      "r16",
    ].reduce((a, k) => a + (r[k] ?? 0), 0),
  );

  // Výsledok: daň celkom mínus odpočty, upravený o opravy.
  const vysledok = centy(
    r.r17 -
      (r.r18 ?? 0) -
      (r.r18a ?? 0) -
      (r.r19 ?? 0) +
      (r.r25 ?? 0) +
      (r.r27 ?? 0) +
      (r.r28 ?? 0) +
      (r.r29 ?? 0) -
      (r.r30 ?? 0) -
      (r.r31 ?? 0),
  );
  if (vysledok >= 0) {
    r.r32 = vysledok;
    r.r35 = centy(Math.max(0, vysledok - (r.r34 ?? 0)));
  } else {
    r.r33 = vysledok;
  }

  return r;
}

/** Výtky zo všetkých troch výkazov na jednom mieste. */
export function vytky(vstup: Vstup): Vytka[] {
  return [...kontrolnyVykaz(vstup).vytky, ...suhrnnyVykaz(vstup).vytky];
}

/**
 * Režim prijatej faktúry, keď ho nikto nevyplnil.
 *
 * Staršie doklady pole nemajú a nová faktúra ho tiež mať nemusí. Odhad je
 * konzervatívny a v prehľade sa dá prepnúť: slovenské IČ DPH znamená bežnú
 * tuzemskú faktúru, iné európske s nulovou daňou samozdanenie, ostatné sa do
 * výkazov nepúšťajú.
 */
export function odvodRezimPrijatej(
  dodavatelIcDph: string | null | undefined,
  danSpolu: number,
): PrijataFaktura["rezim"] {
  const ic = String(dodavatelIcDph ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  // Dobropis nesie zápornú daň — aj ten je tuzemská faktúra (oprava odpočtu, C.2).
  const sDanou = Math.abs(Number(danSpolu) || 0) > 0;
  if (ic.startsWith("SK")) return sDanou ? "tuzemsko" : "bez_dane";
  if (/^[A-Z]{2}/.test(ic)) return "samozdanenie";
  return sDanou ? "tuzemsko" : "bez_dane";
}

/**
 * Rozpad dokladu na sadzby, keď je uložená len jedna suma základu a dane.
 * Sadzba sa dopočíta z podielu — `najblizsiaSadzba` ju prilepí k tej, ktorá
 * v krajine platí, takže zaokrúhľovanie na centy neurobí z 23 % sadzbu 22,97 %.
 */
export function riadokZoSum(zaklad: number, dan: number, den?: string | null): SadzbovyRiadok {
  const z = centy(zaklad);
  const d = centy(dan);
  if (z === 0) return { sadzba: 0, zaklad: z, dan: d };
  return { sadzba: najblizsiaSadzba((d / z) * 100, "SK"), zaklad: z, dan: d };
}
