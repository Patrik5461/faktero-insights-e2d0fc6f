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

export type Obdobie = {
  rok: number;
  /** Mesačný platiteľ vyplní mesiac, štvrťročný štvrťrok. Nikdy oboje. */
  mesiac?: number | null;
  stvrtrok?: number | null;
};

export type SadzbovyRiadok = { sadzba: number; zaklad: number; dan: number };

export type VystavenaFaktura = {
  cislo: string;
  /** `regular`, `proforma`, `credit_note` — zálohová do výkazov nevstupuje. */
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
};

/** Zjednodušená faktúra — bloček z registračnej pokladnice, doklad za PHM a pod. */
export type PrijatyDoklad = {
  dodavatelNazov?: string | null;
  dodavatelIcDph?: string | null;
  dodavatelDic?: string | null;
  odpocet: boolean;
  riadky: SadzbovyRiadok[];
};

export type Vstup = {
  obdobie: Obdobie;
  vystavene: VystavenaFaktura[];
  prijate: PrijataFaktura[];
  doklady: PrijatyDoklad[];
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

function jeZnizena(sadzba: number, den: string): boolean {
  const t = sadzbyKuDnu("SK", den);
  return sadzba > 0 && sadzba !== t.high;
}

function jeZakladna(sadzba: number, den: string): boolean {
  return sadzba > 0 && sadzba === sadzbyKuDnu("SK", den).high;
}

/** Doklad, ktorý do výkazov nepatrí vôbec: zálohová faktúra nie je daňový doklad. */
function doVykazov(f: VystavenaFaktura): boolean {
  return f.typ !== "proforma";
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
export type KvC1 = { odb?: string; fo: string; fp: string; zr: number; dr: number; s: number };
export type KvC2 = {
  dod?: string;
  fo: string;
  fp: string;
  zr: number;
  dr: number;
  s: number;
  or: number;
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

    const doB1 = p.rezim === "samozdanenie" || p.rezim === "nadobudnutie";
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
        o: centy(p.odpocet ? r.dan : 0),
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

  // B.3 — zjednodušené faktúry. Do 3 000 € odpočítanej dane sumárne, nad
  // hranicu po dodávateľoch.
  const sOdpoctom = vstup.doklady.filter((d) => d.odpocet);
  const danSpolu = centy(
    sOdpoctom.reduce((a, d) => a + d.riadky.reduce((b, r) => b + r.dan, 0), 0),
  );
  if (sOdpoctom.length > 0) {
    if (danSpolu < HRANICA_B3) {
      vykaz.b31 = {
        z: centy(sOdpoctom.reduce((a, d) => a + d.riadky.reduce((b, r) => b + r.zaklad, 0), 0)),
        d: danSpolu,
        o: danSpolu,
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
          s.o = centy(s.o + r.dan);
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
    const znamienko = jeOpravna(f) ? -1 : 1;
    const hodnota = znamienko * f.riadky.reduce((a, r) => a + r.zaklad, 0);
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
    "r11" | "r12" | "r16" | "r22" | "r23" | "r26" | "r27" | "r29" | "r30" | "r31" | "r34",
    number
  >
>;

export type Priznanie = Record<string, number> & { vytky?: never };

export function priznanie(vstup: Vstup, rucne: RucneRiadky = {}): Record<string, number> {
  const r: Record<string, number> = {};
  const pripocitaj = (kluc: string, hodnota: number) => {
    r[kluc] = centy((r[kluc] ?? 0) + hodnota);
  };

  for (const f of vstup.vystavene) {
    if (!doVykazov(f)) continue;

    // Dodanie s prenosom daňovej povinnosti v tuzemsku dodávateľ v priznaní
    // neuvádza — daň priznáva odberateľ, dodávateľ len v časti A.2 výkazu.
    if (f.prenosTyp === "domestic_69") continue;

    if (f.prenosDane && f.prenosTyp === "eu_b2b") {
      // Tovar do EÚ ide do r13 a r14; služba do iného členského štátu nie je
      // predmetom dane v tuzemsku a v priznaní sa neuvádza (len v súhrnnom výkaze).
      if (f.euPlnenie === "sluzba" || f.euPlnenie === "trojstranny") continue;
      const zaklad = f.riadky.reduce((a, x) => a + x.zaklad, 0) * (jeOpravna(f) ? -1 : 1);
      pripocitaj("r13", zaklad);
      pripocitaj("r14", zaklad);
      continue;
    }
    if (f.prenosDane && f.prenosTyp === "export") {
      const zaklad = f.riadky.reduce((a, x) => a + x.zaklad, 0) * (jeOpravna(f) ? -1 : 1);
      pripocitaj("r13", zaklad);
      pripocitaj("r15", zaklad);
      continue;
    }

    for (const x of f.riadky) {
      if (x.sadzba <= 0) continue;
      if (jeOpravna(f)) {
        // Oprava základu dane a dane podľa § 25 — so znamienkom mínus.
        pripocitaj("r24", x.zaklad);
        pripocitaj("r25", x.dan);
        continue;
      }
      if (jeZnizena(x.sadzba, f.datumDodania)) {
        pripocitaj("r01", x.zaklad);
        pripocitaj("r02", x.dan);
      } else if (jeZakladna(x.sadzba, f.datumDodania)) {
        pripocitaj("r03", x.zaklad);
        pripocitaj("r04", x.dan);
      }
    }
  }

  for (const p of vstup.prijate) {
    if (p.rezim === "bez_dane") continue;
    for (const x of p.riadky) {
      const znizena = jeZnizena(x.sadzba, p.datumDodania);
      const zakladna = jeZakladna(x.sadzba, p.datumDodania);

      if (p.opravujeCislo) {
        // Prijatý dobropis: opravuje sa odpočítaná daň (§ 53).
        if (p.odpocet) pripocitaj("r28", -x.dan);
        continue;
      }

      if (p.rezim === "nadobudnutie") {
        if (znizena) {
          pripocitaj("r05", x.zaklad);
          pripocitaj("r06", x.dan);
        } else if (zakladna) {
          pripocitaj("r07", x.zaklad);
          pripocitaj("r08", x.dan);
        }
      } else if (p.rezim === "samozdanenie") {
        pripocitaj("r09", x.zaklad);
        pripocitaj("r10", x.dan);
      }

      if (!p.odpocet) continue;
      const cielCelkom = znizena ? "r18" : zakladna ? "r19" : null;
      if (!cielCelkom) continue;
      pripocitaj(cielCelkom, x.dan);
      if (p.rezim === "tuzemsko") pripocitaj(znizena ? "r20" : "r21", x.dan);
      if (p.rezim === "dovoz") pripocitaj(znizena ? "r22" : "r23", x.dan);
    }
  }

  for (const d of vstup.doklady) {
    if (!d.odpocet) continue;
    for (const x of d.riadky) {
      if (x.dan === 0) continue;
      // Bloček je vždy tuzemské plnenie; deň dodania nemáme, sadzbu posúdi
      // dnešný cenník — historické doklady sa tým nezmenia, lebo sadzba na
      // doklade je uložená.
      const znizena = x.sadzba > 0 && x.sadzba !== sadzbyKuDnu("SK").high;
      pripocitaj(znizena ? "r18" : "r19", x.dan);
      pripocitaj(znizena ? "r20" : "r21", x.dan);
    }
  }

  for (const [kluc, hodnota] of Object.entries(rucne)) {
    if (typeof hodnota === "number" && hodnota !== 0) pripocitaj(kluc, hodnota);
  }

  // r17 — daň celkom.
  r.r17 = centy(
    (r.r02 ?? 0) +
      (r.r04 ?? 0) +
      (r.r06 ?? 0) +
      (r.r08 ?? 0) +
      (r.r10 ?? 0) +
      (r.r12 ?? 0) +
      (r.r16 ?? 0),
  );

  // Výsledok: daň celkom mínus odpočty, upravený o opravy.
  const vysledok = centy(
    r.r17 -
      (r.r18 ?? 0) -
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
  if (ic.startsWith("SK")) return danSpolu > 0 ? "tuzemsko" : "bez_dane";
  if (/^[A-Z]{2}/.test(ic)) return "samozdanenie";
  return danSpolu > 0 ? "tuzemsko" : "bez_dane";
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
