/**
 * Demo databáza preview — celá v pamäti procesu preview servera.
 *
 * Nič sa neukladá na disk ani nikam neposiela. Reštart servera (alebo
 * `POST /__demo/reset`) vráti dáta do pôvodného stavu z `preview/data`.
 *
 * Stĺpce a vzťahy medzi tabuľkami sú zo `schema.gen.json` (vyrobené z typov
 * Supabase), predvolené hodnoty stĺpcov a kľúče z `predvolene.json`.
 */
import { randomUUID, randomBytes } from "node:crypto";
import schemaJson from "./schema.gen.json" with { type: "json" };
import predvoleneJson from "./predvolene.json" with { type: "json" };

export type Riadok = Record<string, any>;

export type Stlpec = { druh: string; nullable: boolean; povinny?: boolean };
export type Vztah = {
  fk: string;
  stlpce: string[];
  tabulka: string;
  ciel: string[];
  jedenNaJeden: boolean;
};
export type TabulkaSchema = { pohlad: boolean; stlpce: Record<string, Stlpec>; vztahy: Vztah[] };

export const schema = schemaJson as unknown as {
  tabulky: Record<string, TabulkaSchema>;
  funkcie: string[];
};
const predvolene = (predvoleneJson as any).predvolene as Record<string, Record<string, string>>;
const klucePodlaTabulky = (predvoleneJson as any).kluce as Record<string, string[][]>;

export function kluceTabulky(tabulka: string): string[][] {
  return klucePodlaTabulky[tabulka] ?? [["id"]];
}

/** Dnešný dátum v Bratislave (YYYY-MM-DD) — tak ho počíta aj databáza. */
export function dnes(posun = 0): string {
  const d = new Date(Date.now() + posun * 86400000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
}

let sekvencia = 1000;

/** Prevod `column_default` z Postgresu na hodnotu v JS. */
function predvolenaHodnota(vyraz: string, kontext: { pouzivatel?: string | null }): unknown {
  switch (vyraz) {
    case "DNES":
      return dnes();
    case "DNES_PLUS_14":
      return dnes(14);
    case "DNES_PLUS_30":
      return dnes(30);
    case "ZA_7_DNI":
      return new Date(Date.now() + 7 * 86400000).toISOString();
    case "ZA_14_DNI":
      return new Date(Date.now() + 14 * 86400000).toISOString();
    case "ZA_30_DNI":
      return new Date(Date.now() + 30 * 86400000).toISOString();
    case "POUZIVATEL":
      return kontext.pouzivatel ?? null;
    case "TOKEN":
      return randomBytes(12).toString("hex");
    case "SEKVENCIA":
      return ++sekvencia;
    case "true":
      return true;
    case "false":
      return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(vyraz)) return Number(vyraz);
  const m = /^'([\s\S]*)'::([a-z_]+)(\[\])?$/.exec(vyraz);
  if (m) {
    const [, text, typ, pole] = m;
    if (pole) {
      const vnutro = text.replace(/^\{|\}$/g, "");
      return vnutro ? vnutro.split(",") : [];
    }
    if (typ === "jsonb" || typ === "json") return JSON.parse(text);
    return text.replace(/''/g, "'");
  }
  return null;
}

export type KontextPoziadavky = {
  /** id prihláseného demo používateľa (z tokenu), `null` pre servisný kľúč. */
  pouzivatel: string | null;
  servis: boolean;
};

/** Vypočítané pohľady (views) — počítajú sa pri každom čítaní. */
type Pohlad = (db: DemoDb) => Riadok[];

export class DemoDb {
  private data = new Map<string, Riadok[]>();
  readonly pohlady = new Map<string, Pohlad>();
  /** Súbory v úložisku (bucket/cesta → obsah). */
  readonly subory = new Map<string, { obsah: Buffer; typ: string }>();

  tabulka(meno: string): Riadok[] {
    const p = this.pohlady.get(meno);
    if (p) return p(this);
    let t = this.data.get(meno);
    if (!t) {
      t = [];
      this.data.set(meno, t);
    }
    return t;
  }

  existuje(meno: string): boolean {
    return !!schema.tabulky[meno] || this.data.has(meno) || this.pohlady.has(meno);
  }

  vycisti() {
    this.data.clear();
    this.subory.clear();
  }

  /** Doplní chýbajúce stĺpce (predvolené hodnoty, id, časy) — ako INSERT v Postgrese. */
  doplnRiadok(
    meno: string,
    vstup: Riadok,
    kontext: KontextPoziadavky = { pouzivatel: null, servis: true },
  ): Riadok {
    const st = schema.tabulky[meno]?.stlpce ?? {};
    const pred = predvolene[meno] ?? {};
    const r: Riadok = {};
    for (const stlpec of Object.keys(st)) {
      if (vstup[stlpec] !== undefined) r[stlpec] = vstup[stlpec];
      else if (pred[stlpec] !== undefined) r[stlpec] = predvolenaHodnota(pred[stlpec], kontext);
      else if (stlpec === "id" && st.id.druh === "text") r.id = randomUUID();
      else if (stlpec === "created_at" || stlpec === "updated_at")
        r[stlpec] = new Date().toISOString();
      else r[stlpec] = null;
    }
    // Stĺpce, ktoré typy (zatiaľ) nepoznajú, sa nezahodia.
    for (const [k, v] of Object.entries(vstup)) if (!(k in r)) r[k] = v;
    if (r.id === null && "id" in st && st.id.druh === "text") r.id = randomUUID();
    return r;
  }

  /** Vloží riadky (bez kontroly RLS) — použité pri plnení demo dát. */
  vloz(meno: string, riadky: Riadok[]): Riadok[] {
    const t = this.tabulka(meno);
    const out = riadky.map((r) => this.doplnRiadok(meno, r));
    t.push(...out);
    return out;
  }
}
