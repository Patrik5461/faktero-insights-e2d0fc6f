/**
 * Nemecký súhrnný výkaz — Zusammenfassende Meldung (ZM, § 18a UStG).
 *
 * Nemecká firma hlási Bundeszentralamt für Steuern (BZSt) dodania do iných
 * štátov EÚ odberateľom s USt-IdNr., súčty podľa odberateľa a druhu plnenia:
 *
 *  - `L` — innergemeinschaftliche Warenlieferung (dodanie tovaru, § 4 Nr. 1b),
 *  - `D` — Dreiecksgeschäft, dodanie prvým odberateľom (§ 25b Abs. 2),
 *  - `S` — sonstige Leistung podľa § 3a Abs. 2, daň platí odberateľ v jeho štáte.
 *
 * Kódy L/D/S sú presne tie, ktoré berie CSV import BZSt (Benutzeranleitung
 * „CSV-Format der Import-Datei ZM“, ELSTER, stav 03.11.2015); v elektronickom
 * formulári sú to stĺpce „Lieferungen“, „Dreiecksgeschäfte“ a „sonstige
 * Leistungen“.
 *
 * Obdobie (§ 18a Abs. 1–3):
 *  - tovar a trojstranný obchod mesačne; štvrťročne smie, kým súčet za štvrťrok
 *    ani za žiadny zo štyroch predošlých štvrťrokov neprekročí 50 000 €,
 *  - služby štvrťročne — pri mesačnej ZM v poslednom mesiaci štvrťroka, alebo
 *    mesačne, ak sa firma rozhodla hlásiť ich mesačne (§ 18a Abs. 3).
 *
 * Sumy (Bemessungsgrundlage) sú v celých eurách. Formulár ani CSV centy
 * nepozná; odrežú sa ako pri UStVA (rakúske BMF k ZM uvádza takisto odrezanie,
 * nemecký pokyn pre zaokrúhlenie výslovný nie je). Dobropis zníži súčet
 * odberateľa v období, v ktorom bol vystavený (§ 18a Abs. 7 v spojení s § 17),
 * a sám vedie aj k zápornému riadku.
 *
 * Zjednodušenie: tovar podľa § 18a Abs. 8 patrí do obdobia vystavenia faktúry
 * (najneskôr do mesiaca po dodaní). Výkaz berie dátum dodania z rovnakého
 * načítania ako UStVA — keď faktúru vystavíte v ďalšom mesiaci, presuňte riadok.
 *
 * Kleinunternehmer (§ 19 Abs. 1 UStG) ZM nepodáva vôbec (§ 18a Abs. 4).
 */

import { jeEuIcDph, rozdelIcDph } from "./vies";
import type { Vstup, Vytka } from "./dph-vykazy";

export type DruhZm = "L" | "D" | "S";

export type RiadokZm = {
  /** Kód krajiny odberateľa (Grécko „EL“). */
  krajina: string;
  /** USt-IdNr. bez kódu krajiny, len A–Z a 0–9. */
  ustIdNr: string;
  druh: DruhZm;
  /** Súčet základov v celých eurách. */
  suma: number;
  /** Počet dokladov v riadku. */
  dokladov: number;
  odberatel?: string | null;
};

export type ObdobieZm = { rok: number; mesiac?: number | null; stvrtrok?: number | null };

export type Zm = {
  riadky: RiadokZm[];
  vytky: Vytka[];
  /** Súčet tovaru a trojstranných obchodov za celý štvrťrok (na centy) — kvôli hranici 50 000 €. */
  tovarZaStvrtrok: number;
  /** Štvrťrok, za ktorý sa hranica počíta. */
  stvrtrok: number;
  /** Súčet za štvrťrok prekročil 50 000 € — ZM sa musí podávať mesačne (aj spätne za mesiace štvrťroka). */
  nadHranicou: boolean;
  /** Služby sa do mesačnej ZM tohto mesiaca nedostali (patria do posledného mesiaca štvrťroka). */
  sluzbyOdlozene: number;
};

/** § 18a Abs. 1 — hranica pre štvrťročnú ZM za tovar. */
export const HRANICA_STVRTROCNEJ_ZM = 50_000;

/** BZSt prijme v jednom CSV najviac 1000 riadkov. */
export const MAX_RIADKOV_CSV = 1000;

const centy = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function mesiacDatumu(d: string): number {
  return Number(String(d).slice(5, 7));
}

function rokDatumu(d: string): number {
  return Number(String(d).slice(0, 4));
}

/**
 * Zostaví ZM. `vstup` má pokrývať **celý štvrťrok** obdobia (kvôli hranici
 * 50 000 € a službám, ktoré sa hlásia štvrťročne); do riadkov sa vyberie len
 * to, čo do obdobia patrí.
 */
export function zostavZm(
  vstup: Vstup,
  obdobie: ObdobieZm,
  volby: { sluzbyMesacne?: boolean } = {},
): Zm {
  const vytky: Vytka[] = [];
  const stvrtrok = obdobie.stvrtrok ?? Math.floor(((obdobie.mesiac ?? 1) - 1) / 3) + 1;
  const prvyMesiac = (stvrtrok - 1) * 3 + 1;
  const mesiaceStvrtroka = [prvyMesiac, prvyMesiac + 1, prvyMesiac + 2];
  const mesacne = Boolean(obdobie.mesiac);
  const poslednyMesiacStvrtroka = mesacne && obdobie.mesiac === prvyMesiac + 2;

  const vStvrtroku = (d: string) =>
    rokDatumu(d) === obdobie.rok && mesiaceStvrtroka.includes(mesiacDatumu(d));

  const mapa = new Map<string, RiadokZm & { presne: number }>();
  let tovarZaStvrtrok = 0;
  let sluzbyOdlozene = 0;

  for (const f of vstup.vystavene) {
    if (f.typ === "proforma" || f.oss) continue;
    if (!f.prenosDane || f.prenosTyp !== "eu_b2b") continue;
    if (!vStvrtroku(f.datumDodania)) continue;

    const druh: DruhZm = f.euPlnenie === "sluzba" ? "S" : f.euPlnenie === "trojstranny" ? "D" : "L";
    const zaklad = centy(f.riadky.reduce((a, r) => a + r.zaklad, 0));

    /*
      Zálohu na dodanie tovaru do EÚ ZM nepozná — hlási sa celé dodanie s
      faktúrou. Pri službe sa záloha hlási (daň u odberateľa vzniká platbou).
    */
    if (f.typ === "advance_payment" && druh !== "S") {
      vytky.push({
        doklad: f.cislo,
        text: "Doklad k prijatej platbe pri dodaní tovaru do EÚ sa do ZM nehlási — skontrolujte, či konečná faktúra nesie celú sumu dodania.",
      });
      continue;
    }

    if (druh !== "S") tovarZaStvrtrok += zaklad;

    // Patrí riadok do zvoleného obdobia?
    const mesiacDokladu = mesiacDatumu(f.datumDodania);
    if (mesacne) {
      if (druh === "S" && !volby.sluzbyMesacne) {
        // Služby sa hlásia za štvrťrok, v ZM posledného mesiaca štvrťroka.
        if (!poslednyMesiacStvrtroka) {
          if (mesiacDokladu <= (obdobie.mesiac ?? 0)) sluzbyOdlozene += 1;
          continue;
        }
      } else if (mesiacDokladu !== obdobie.mesiac) continue;
    }

    const r = rozdelIcDph(f.odberatelIcDph);
    if (!r || !jeEuIcDph(f.odberatelIcDph) || r.kod === "DE") {
      vytky.push({
        doklad: f.cislo,
        text: "Odberateľ nemá platné USt-IdNr. z iného štátu EÚ — do ZM sa riadok bez neho nedá zapísať a oslobodenie dodania je sporné. Doplňte IČ DPH odberateľa.",
      });
      continue;
    }
    if (r.cislo.length < 5 || r.cislo.length > 12 || !/^[A-Z0-9]+$/.test(r.cislo)) {
      vytky.push({
        doklad: f.cislo,
        text: "USt-IdNr. odberateľa nemá tvar, ktorý ZM prijme (5 až 12 znakov A–Z a 0–9).",
      });
      continue;
    }
    const kluc = `${r.kod}|${r.cislo}|${druh}`;
    const z = mapa.get(kluc) ?? {
      krajina: r.kod,
      ustIdNr: r.cislo,
      druh,
      suma: 0,
      presne: 0,
      dokladov: 0,
      odberatel: f.odberatelNazov ?? null,
    };
    z.presne = centy(z.presne + zaklad);
    z.dokladov += 1;
    if (!z.odberatel && f.odberatelNazov) z.odberatel = f.odberatelNazov;
    mapa.set(kluc, z);
  }

  const riadky: RiadokZm[] = [];
  for (const z of mapa.values()) {
    const suma = Math.trunc(z.presne);
    const { presne: _p, ...riadok } = z;
    if (suma === 0) {
      vytky.push({
        doklad: `${z.krajina}${z.ustIdNr}`,
        text: "Súčet za odberateľa vyšiel 0 € (napr. faktúra a jej dobropis) — riadok sa do ZM nezapisuje.",
      });
      continue;
    }
    if (suma < 0)
      vytky.push({
        doklad: `${z.krajina}${z.ustIdNr}`,
        text: "Záporný súčet — dobropis bez dodania v tom istom období. ZM ho prijme so znamienkom mínus; ak opravuje už podanú ZM, BZSt môže chcieť opravu pôvodného obdobia.",
      });
    riadky.push({ ...riadok, suma });
  }
  riadky.sort(
    (a, b) =>
      a.krajina.localeCompare(b.krajina) ||
      a.ustIdNr.localeCompare(b.ustIdNr) ||
      a.druh.localeCompare(b.druh),
  );

  tovarZaStvrtrok = centy(tovarZaStvrtrok);
  return {
    riadky,
    vytky,
    tovarZaStvrtrok,
    stvrtrok,
    nadHranicou: tovarZaStvrtrok > HRANICA_STVRTROCNEJ_ZM,
    sluzbyOdlozene,
  };
}

/** Súčty podľa druhu — na súhrn pod tabuľkou. */
export function suctyZm(riadky: RiadokZm[]): Record<DruhZm, number> {
  const s: Record<DruhZm, number> = { L: 0, D: 0, S: 0 };
  for (const r of riadky) s[r.druh] += r.suma;
  return s;
}

/**
 * CSV na hromadný import do BZStOnline-Portal (formulár ZM → „Import“).
 *
 * Podľa „Benutzeranleitung CSV-Format der Import-Datei ZM“ (ELSTER, 03.11.2015):
 *  - 1. riadok verzia rozhrania s predponou `#v` — **`#v1.0` je posledná nám
 *    známa verzia; aktuálnu uvádza Hilfe/FAQ portálu v časti „Änderungshistorie“,
 *    pri prvom nahraní ju treba overiť**,
 *  - 2. riadok hlavička (obsah sa nevyhodnocuje, poradie stĺpcov je pevné),
 *  - potom 1 až 1000 riadkov `Länderkennzeichen,USt-IdNr.,Betrag(EUR),Art der Leistung`,
 *    USt-IdNr. bez kódu krajiny, suma celé číslo (mínus povolený), druh L/D/S,
 *  - čiarka ako oddeľovač, žiadne prázdne riadky, žiadne dva riadky líšiace sa
 *    len sumou (preto sa sčítava po odberateľovi a druhu), znaky ISO-8859-15.
 *
 * Nad 1000 riadkov vráti viac súborov.
 */
export const VERZIA_CSV_ZM = "1.0";

export function zmNaCsv(riadky: RiadokZm[], verzia: string = VERZIA_CSV_ZM): string[] {
  const subory: string[] = [];
  for (let i = 0; i < Math.max(riadky.length, 1); i += MAX_RIADKOV_CSV) {
    const cast = riadky.slice(i, i + MAX_RIADKOV_CSV);
    if (!cast.length) break;
    const out = [
      `#v${verzia}`,
      "Laenderkennzeichen,USt-IdNr.,Betrag(EUR),Art der Leistung",
      ...cast.map((r) => [r.krajina, r.ustIdNr, String(r.suma), r.druh].join(",")),
    ];
    subory.push(out.join("\r\n") + "\r\n");
  }
  return subory;
}
