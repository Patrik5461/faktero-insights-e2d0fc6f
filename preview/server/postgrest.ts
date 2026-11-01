/**
 * Náhrada PostgREST (`/rest/v1`) nad demo databázou v pamäti.
 *
 * Pokrýva to, čo web reálne používa (pozri PREVIEW.md):
 * - select so stĺpcami, aliasmi, `->`/`->>`, vnorenými vzťahmi
 *   (`customers(name)`, `company:companies(*)`, `rel!fkey(...)`, `!inner`, `count`),
 * - filtre eq/neq/gt/gte/lt/lte/like/ilike/is/in/cs/cd/ov/match/imatch/fts + `not.`,
 *   `or=(...)` a `and=(...)` aj vnorené, filtre na vnorených vzťahoch (`rel.stlpec=...`),
 * - order (aj nullsfirst/nullslast), limit/offset, `Prefer: count=exact`, HEAD,
 *   jeden riadok (`Accept: application/vnd.pgrst.object+json`),
 * - insert/upsert (on_conflict, ignore-duplicates), update, delete — len do pamäte.
 */
import { randomUUID } from "node:crypto";
import { DemoDb, kluceTabulky, schema, type KontextPoziadavky, type Riadok } from "./db";

export type Odpoved = { status: number; hlavicky: Record<string, string>; telo: string | null };

class ChybaPgrst extends Error {
  constructor(
    public status: number,
    public kod: string,
    sprava: string,
    public detail: string | null = null,
  ) {
    super(sprava);
  }
}

/* ---------------------------------------------------------------- select */

type PolozkaSelectu =
  | { druh: "vsetko" }
  | { druh: "stlpec"; alias: string; cesta: string[]; text: boolean[]; povod: string }
  | { druh: "pocet"; alias: string }
  | {
      druh: "vztah";
      alias: string;
      meno: string;
      hint: string | null;
      inner: boolean;
      rozbal: boolean;
      vnutro: PolozkaSelectu[];
    };

/** Rozdelí text podľa čiarky na najvyššej úrovni zátvoriek (a mimo úvodzoviek). */
function rozdelNaUrovni(text: string, oddelovac = ","): string[] {
  const out: string[] = [];
  let hlbka = 0;
  let uvodzovky = false;
  let akt = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== "\\") uvodzovky = !uvodzovky;
    if (!uvodzovky) {
      if (c === "(") hlbka++;
      else if (c === ")") hlbka--;
      else if (c === oddelovac && hlbka === 0) {
        out.push(akt);
        akt = "";
        continue;
      }
    }
    akt += c;
  }
  if (akt.length) out.push(akt);
  return out;
}

function rozoberStlpec(vyraz: string): { cesta: string[]; text: boolean[] } {
  // stlpec->a->>b ; pretypovanie ::text sa ignoruje
  const bezCast = vyraz.replace(/::[a-z_ 0-9[\]]+$/i, "");
  const casti = bezCast.split(/(->>|->)/);
  const cesta = [casti[0].trim()];
  const text: boolean[] = [false];
  for (let i = 1; i < casti.length; i += 2) {
    cesta.push(casti[i + 1].replace(/^'|'$/g, ""));
    text.push(casti[i] === "->>");
  }
  return { cesta, text };
}

export function rozoberSelect(text: string): PolozkaSelectu[] {
  const out: PolozkaSelectu[] = [];
  const cisty = text.replace(/\s+(?=([^"]*"[^"]*")*[^"]*$)/g, "");
  if (!cisty) return [{ druh: "vsetko" }];
  for (const surova of rozdelNaUrovni(cisty)) {
    if (!surova) continue;
    if (surova === "*") {
      out.push({ druh: "vsetko" });
      continue;
    }
    const zatvorka = surova.indexOf("(");
    if (zatvorka > 0 && surova.endsWith(")")) {
      let hlava = surova.slice(0, zatvorka);
      const vnutroText = surova.slice(zatvorka + 1, -1);
      let rozbal = false;
      if (hlava.startsWith("...")) {
        rozbal = true;
        hlava = hlava.slice(3);
      }
      let alias: string | null = null;
      const dvojbodka = hlava.indexOf(":");
      if (dvojbodka > 0 && hlava[dvojbodka + 1] !== ":") {
        alias = hlava.slice(0, dvojbodka);
        hlava = hlava.slice(dvojbodka + 1);
      }
      const [meno, ...hinty] = hlava.split("!");
      const inner = hinty.includes("inner");
      const hint = hinty.find((h) => h !== "inner" && h !== "left") ?? null;
      if (meno === "count" && !vnutroText) {
        out.push({ druh: "pocet", alias: alias ?? "count" });
        continue;
      }
      out.push({
        druh: "vztah",
        alias: alias ?? meno,
        meno,
        hint,
        inner,
        rozbal,
        vnutro: rozoberSelect(vnutroText || "*"),
      });
      continue;
    }
    if (surova === "count()" || surova === "count") {
      out.push({ druh: "pocet", alias: "count" });
      continue;
    }
    let alias: string | null = null;
    let vyraz = surova;
    const m = /^([A-Za-z_][A-Za-z0-9_]*):(?!:)(.+)$/.exec(surova);
    if (m) {
      alias = m[1];
      vyraz = m[2];
    }
    const { cesta, text: txt } = rozoberStlpec(vyraz);
    out.push({
      druh: "stlpec",
      alias: alias ?? cesta[cesta.length - 1],
      cesta,
      text: txt,
      povod: vyraz,
    });
  }
  return out;
}

/* ---------------------------------------------------------------- vzťahy */

type NajdenyVztah = {
  tabulka: string;
  /** stĺpce v rodičovi a v cieli, ktoré sa musia rovnať */
  rodic: string[];
  ciel: string[];
  jeden: boolean;
};

export function najdiVztah(rodic: string, meno: string, hint: string | null): NajdenyVztah | null {
  const sRodic = schema.tabulky[rodic];
  const kandidati: (NajdenyVztah & { fk: string; skore: number })[] = [];
  // Meno je stĺpec rodiča s cudzím kľúčom: `companies:company_id(...)`.
  if (sRodic) {
    for (const v of sRodic.vztahy) {
      if (v.stlpce.length === 1 && v.stlpce[0] === meno) {
        return { tabulka: v.tabulka, rodic: v.stlpce, ciel: v.ciel, jeden: true };
      }
    }
  }
  const cielovaTabulka = meno;
  // mnoho-k-jednému: rodič má FK na `meno`
  for (const v of sRodic?.vztahy ?? []) {
    if (v.tabulka !== cielovaTabulka) continue;
    let skore = 0;
    if (hint && (v.fk === hint || v.stlpce.includes(hint))) skore += 100;
    else if (hint) continue;
    const jednotne = cielovaTabulka.replace(/ies$/, "y").replace(/s$/, "");
    if (v.stlpce[0] === `${jednotne}_id`) skore += 10;
    kandidati.push({
      tabulka: v.tabulka,
      rodic: v.stlpce,
      ciel: v.ciel,
      jeden: true,
      fk: v.fk,
      skore,
    });
  }
  // jeden-k-mnohým: `meno` má FK na rodiča
  const sCiel = schema.tabulky[cielovaTabulka];
  for (const v of sCiel?.vztahy ?? []) {
    if (v.tabulka !== rodic) continue;
    let skore = 0;
    if (hint && (v.fk === hint || v.stlpce.includes(hint))) skore += 100;
    else if (hint) continue;
    const jednotne = rodic.replace(/ies$/, "y").replace(/s$/, "");
    if (v.stlpce[0] === `${jednotne}_id`) skore += 5;
    kandidati.push({
      tabulka: cielovaTabulka,
      rodic: v.ciel,
      ciel: v.stlpce,
      jeden: v.jedenNaJeden,
      fk: v.fk,
      skore,
    });
  }
  // Pohľad bez vzťahov v typoch — skús podľa `<meno>_id`.
  if (!kandidati.length && sRodic) {
    const jednotne = cielovaTabulka.replace(/ies$/, "y").replace(/s$/, "");
    if (`${jednotne}_id` in sRodic.stlpce && schema.tabulky[cielovaTabulka]) {
      return { tabulka: cielovaTabulka, rodic: [`${jednotne}_id`], ciel: ["id"], jeden: true };
    }
    const jednotneRodic = rodic.replace(/ies$/, "y").replace(/s$/, "");
    if (sCiel && `${jednotneRodic}_id` in sCiel.stlpce) {
      return {
        tabulka: cielovaTabulka,
        rodic: ["id"],
        ciel: [`${jednotneRodic}_id`],
        jeden: false,
      };
    }
  }
  if (!kandidati.length) return null;
  kandidati.sort((a, b) => b.skore - a.skore);
  return kandidati[0];
}

/* ---------------------------------------------------------------- hodnoty */

function hodnotaCesty(r: Riadok, cesta: string[], text: boolean[]): unknown {
  let v: any = r[cesta[0]];
  for (let i = 1; i < cesta.length; i++) {
    if (v == null) return null;
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        return null;
      }
    }
    v = Array.isArray(v) && /^\d+$/.test(cesta[i]) ? v[Number(cesta[i])] : v[cesta[i]];
  }
  if (text[text.length - 1] && cesta.length > 1 && v != null && typeof v === "object")
    return JSON.stringify(v);
  if (text[text.length - 1] && cesta.length > 1 && v != null) return String(v);
  return v === undefined ? null : v;
}

const DATUM = /^\d{4}-\d{2}-\d{2}/;

function porovnaj(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    if (!isNaN(x) && !isNaN(y)) return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  const sa = String(a);
  const sb = String(b);
  if (DATUM.test(sa) && DATUM.test(sb)) {
    const x = Date.parse(sa.length === 10 ? sa + "T00:00:00Z" : sa);
    const y = Date.parse(sb.length === 10 ? sb + "T00:00:00Z" : sb);
    if (!isNaN(x) && !isNaN(y)) return x < y ? -1 : x > y ? 1 : 0;
  }
  return sa.localeCompare(sb, "sk");
}

function odUvodzoviek(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"'))
    return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

function rozoberZoznam(s: string): string[] {
  const vnutro = s.replace(/^\(|\)$/g, "");
  if (!vnutro) return [];
  return rozdelNaUrovni(vnutro).map((x) => odUvodzoviek(x.trim()));
}

function rozoberPole(s: string): unknown[] | Record<string, unknown> {
  const t = s.trim();
  if (t.startsWith("[") || (t.startsWith("{") && t.includes(":"))) {
    try {
      return JSON.parse(t);
    } catch {
      /* ďalej ako pole Postgresu */
    }
  }
  const vnutro = t.replace(/^\{|\}$/g, "");
  if (!vnutro) return [];
  return rozdelNaUrovni(vnutro).map((x) => odUvodzoviek(x.trim()));
}

function vzorNaRegex(vzor: string, velkost: boolean): RegExp {
  const esc = vzor
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[%*]/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${esc}$`, velkost ? "is" : "s");
}

function obsahuje(celok: unknown, cast: unknown): boolean {
  if (Array.isArray(celok)) {
    const c = Array.isArray(cast) ? cast : [cast];
    return c.every((x) =>
      celok.some((y) =>
        typeof y === "object" ? JSON.stringify(y) === JSON.stringify(x) : String(y) === String(x),
      ),
    );
  }
  if (celok && typeof celok === "object" && cast && typeof cast === "object") {
    return Object.entries(cast as Record<string, unknown>).every(([k, v]) =>
      typeof v === "object" && v !== null
        ? obsahuje((celok as any)[k], v)
        : (celok as any)[k] === v,
    );
  }
  return false;
}

/** Vyhodnotí jeden operátor PostgREST (`eq`, `ilike`, …) nad hodnotou. */
function operator(op: string, hodnota: unknown, arg: string): boolean {
  switch (op) {
    case "eq":
      if (typeof hodnota === "boolean") return String(hodnota) === arg;
      if (hodnota == null) return false;
      return porovnaj(hodnota, odUvodzoviek(arg)) === 0;
    case "neq":
      if (hodnota == null) return false;
      if (typeof hodnota === "boolean") return String(hodnota) !== arg;
      return porovnaj(hodnota, odUvodzoviek(arg)) !== 0;
    case "gt":
      return hodnota != null && porovnaj(hodnota, odUvodzoviek(arg)) > 0;
    case "gte":
      return hodnota != null && porovnaj(hodnota, odUvodzoviek(arg)) >= 0;
    case "lt":
      return hodnota != null && porovnaj(hodnota, odUvodzoviek(arg)) < 0;
    case "lte":
      return hodnota != null && porovnaj(hodnota, odUvodzoviek(arg)) <= 0;
    case "like":
      return hodnota != null && vzorNaRegex(odUvodzoviek(arg), false).test(String(hodnota));
    case "ilike":
      return hodnota != null && vzorNaRegex(odUvodzoviek(arg), true).test(String(hodnota));
    case "match":
      return hodnota != null && new RegExp(arg).test(String(hodnota));
    case "imatch":
      return hodnota != null && new RegExp(arg, "i").test(String(hodnota));
    case "is":
      if (arg === "null") return hodnota == null;
      if (arg === "true") return hodnota === true;
      if (arg === "false") return hodnota === false;
      if (arg === "unknown") return hodnota == null;
      return false;
    case "isdistinct":
      return porovnaj(hodnota, arg) !== 0;
    case "in": {
      if (hodnota == null) return false;
      return rozoberZoznam(arg).some((x) => porovnaj(hodnota, x) === 0);
    }
    case "cs":
      return obsahuje(hodnota, rozoberPole(arg));
    case "cd":
      return obsahuje(rozoberPole(arg), hodnota);
    case "ov": {
      const a = Array.isArray(hodnota) ? hodnota : [];
      const b = rozoberPole(arg) as unknown[];
      return a.some((x) => b.some((y) => String(x) === String(y)));
    }
    case "fts":
    case "plfts":
    case "phfts":
    case "wfts": {
      const slova = arg
        .replace(/^\([^)]*\)/, "")
        .split(/[\s&|]+/)
        .filter(Boolean);
      const t = String(hodnota ?? "").toLowerCase();
      return slova.every((s) => t.includes(s.toLowerCase().replace(/[:*']/g, "")));
    }
  }
  return true;
}

/* ---------------------------------------------------------------- filtre */

type Filter =
  | {
      druh: "stlpec";
      cesta: string[];
      text: boolean[];
      op: string;
      arg: string;
      nie: boolean;
      vztah: string[];
    }
  | { druh: "logika"; op: "or" | "and"; nie: boolean; deti: Filter[]; vztah: string[] };

/** `stlpec=op.hodnota`, `not.op.hodnota`, `or=(...)` */
function rozoberFilter(kluc: string, hodnota: string): Filter | null {
  const casti = kluc.split(".");
  const posledny = casti[casti.length - 1];
  if (posledny === "or" || posledny === "and") {
    const nie = casti[casti.length - 2] === "not";
    return {
      druh: "logika",
      op: posledny,
      nie,
      deti: rozoberLogiku(hodnota),
      vztah: casti.slice(0, nie ? -2 : -1),
    };
  }
  let nie = false;
  let v = hodnota;
  if (v.startsWith("not.")) {
    nie = true;
    v = v.slice(4);
  }
  const bodka = v.indexOf(".");
  if (bodka < 0) return null;
  const op = v.slice(0, bodka);
  const arg = v.slice(bodka + 1);
  // `rel.stlpec` — filter na vnorenom vzťahu; JSON cesta ostáva v poslednej časti
  const stlpecText = casti.slice(-1)[0];
  const { cesta, text } = rozoberStlpec(stlpecText);
  return {
    druh: "stlpec",
    cesta,
    text,
    op: op.replace(/\(.*\)$/, ""),
    arg,
    nie,
    vztah: casti.slice(0, -1),
  };
}

/** Obsah `or=(a.eq.1,and(b.is.null,c.gt.2))` */
function rozoberLogiku(text: string): Filter[] {
  const vnutro = text.replace(/^\(|\)$/g, "");
  const out: Filter[] = [];
  for (const cast of rozdelNaUrovni(vnutro)) {
    const c = cast.trim();
    if (!c) continue;
    const mLog = /^(not\.)?(or|and)\((.*)\)$/s.exec(c);
    if (mLog) {
      out.push({
        druh: "logika",
        op: mLog[2] as "or" | "and",
        nie: !!mLog[1],
        deti: rozoberLogiku(mLog[3]),
        vztah: [],
      });
      continue;
    }
    // stlpec.op.arg  alebo stlpec.not.op.arg (stĺpec môže mať JSON cestu)
    const m = /^([^.]+?(?:->>?[^.]+)*)\.(not\.)?([a-z]+)(\([^)]*\))?\.([\s\S]*)$/.exec(c);
    if (!m) continue;
    const { cesta, text: txt } = rozoberStlpec(m[1]);
    out.push({ druh: "stlpec", cesta, text: txt, op: m[3], arg: m[5], nie: !!m[2], vztah: [] });
  }
  return out;
}

function splna(r: Riadok, f: Filter): boolean {
  let v: boolean;
  if (f.druh === "logika") {
    v = f.op === "or" ? f.deti.some((d) => splna(r, d)) : f.deti.every((d) => splna(r, d));
  } else {
    v = operator(f.op, hodnotaCesty(r, f.cesta, f.text), f.arg);
  }
  return f.nie ? !v : v;
}

/* ---------------------------------------------------------------- order */

type Zoradenie = { cesta: string[]; text: boolean[]; zostupne: boolean; nullsPrve: boolean | null };

function rozoberOrder(text: string): Zoradenie[] {
  return rozdelNaUrovni(text).map((cast) => {
    const kusy = cast.split(".");
    let zostupne = false;
    let nullsPrve: boolean | null = null;
    const stlpecKusy: string[] = [];
    for (const k of kusy) {
      if (k === "desc") zostupne = true;
      else if (k === "asc") zostupne = false;
      else if (k === "nullsfirst") nullsPrve = true;
      else if (k === "nullslast") nullsPrve = false;
      else stlpecKusy.push(k);
    }
    const { cesta, text: txt } = rozoberStlpec(stlpecKusy.join("."));
    return { cesta, text: txt, zostupne, nullsPrve };
  });
}

function zorad(riadky: Riadok[], z: Zoradenie[]): Riadok[] {
  if (!z.length) return riadky;
  return [...riadky].sort((a, b) => {
    for (const o of z) {
      const x = hodnotaCesty(a, o.cesta, o.text);
      const y = hodnotaCesty(b, o.cesta, o.text);
      // Postgres: NULL je pri ASC na konci, pri DESC na začiatku.
      const nullsPrve = o.nullsPrve ?? o.zostupne;
      if (x == null && y == null) continue;
      if (x == null) return nullsPrve ? -1 : 1;
      if (y == null) return nullsPrve ? 1 : -1;
      const c = porovnaj(x, y);
      if (c !== 0) return o.zostupne ? -c : c;
    }
    return 0;
  });
}

/* ---------------------------------------------------------------- dopyt */

type Dopyt = {
  tabulka: string;
  select: PolozkaSelectu[];
  filtre: Filter[];
  order: Zoradenie[];
  limit: number | null;
  offset: number;
  vnorene: Map<
    string,
    { filtre: Filter[]; order: Zoradenie[]; limit: number | null; offset: number }
  >;
};

function vnorenePre(d: Dopyt, cesta: string) {
  let v = d.vnorene.get(cesta);
  if (!v) {
    v = { filtre: [], order: [], limit: null, offset: 0 };
    d.vnorene.set(cesta, v);
  }
  return v;
}

const RIADIACE = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function rozoberDopyt(tabulka: string, parametre: URLSearchParams): Dopyt {
  const d: Dopyt = {
    tabulka,
    select: rozoberSelect(parametre.get("select") ?? "*"),
    filtre: [],
    order: [],
    limit: null,
    offset: 0,
    vnorene: new Map(),
  };
  for (const [kluc, hodnota] of parametre) {
    const casti = kluc.split(".");
    const posledny = casti[casti.length - 1];
    if (RIADIACE.has(kluc)) {
      if (kluc === "order") d.order = rozoberOrder(hodnota);
      else if (kluc === "limit") d.limit = Number(hodnota);
      else if (kluc === "offset") d.offset = Number(hodnota);
      continue;
    }
    if (
      casti.length > 1 &&
      ["order", "limit", "offset"].includes(posledny) &&
      !kluc.includes("->")
    ) {
      const v = vnorenePre(d, casti.slice(0, -1).join("."));
      if (posledny === "order") v.order = rozoberOrder(hodnota);
      else if (posledny === "limit") v.limit = Number(hodnota);
      else v.offset = Number(hodnota);
      continue;
    }
    const f = rozoberFilter(kluc, hodnota);
    if (!f) continue;
    if (f.vztah.length && !kluc.includes("->")) {
      vnorenePre(d, f.vztah.join(".")).filtre.push({ ...f, vztah: [] } as Filter);
    } else d.filtre.push({ ...f, vztah: [] } as Filter);
  }
  return d;
}

function vyber(
  db: DemoDb,
  d: Dopyt,
  tabulka: string,
  riadky: Riadok[],
  select: PolozkaSelectu[],
  cesta: string,
): Riadok[] | null {
  // Najprv vnorené vzťahy (kvôli !inner a filtrom na nich), potom stĺpce.
  const out: Riadok[] = [];
  for (const r of riadky) {
    const vysledok: Riadok = {};
    let vyhodit = false;
    for (const p of select) {
      if (p.druh === "vsetko") {
        Object.assign(vysledok, r);
      } else if (p.druh === "stlpec") {
        vysledok[p.alias] = hodnotaCesty(r, p.cesta, p.text);
      } else if (p.druh === "pocet") {
        // samotné `count` na koreni — rieši sa nižšie
      } else if (p.druh === "vztah") {
        const vz = najdiVztah(tabulka, p.meno, p.hint);
        const podCesta = cesta ? `${cesta}.${p.alias}` : p.alias;
        const nastavenia =
          d.vnorene.get(podCesta) ?? d.vnorene.get(cesta ? `${cesta}.${p.meno}` : p.meno);
        if (!vz) {
          vysledok[p.alias] = null;
          continue;
        }
        let deti = db
          .tabulka(vz.tabulka)
          .filter((x) =>
            vz.rodic.every((s, i) => r[s] != null && String(r[s]) === String(x[vz.ciel[i]])),
          );
        if (nastavenia) deti = deti.filter((x) => nastavenia.filtre.every((f) => splna(x, f)));
        if (nastavenia?.order.length) deti = zorad(deti, nastavenia.order);
        if (nastavenia?.offset) deti = deti.slice(nastavenia.offset);
        if (nastavenia?.limit != null) deti = deti.slice(0, nastavenia.limit);
        const jePocet = p.vnutro.length === 1 && p.vnutro[0].druh === "pocet";
        const filtrovane = !!nastavenia?.filtre.length;
        if ((p.inner || (filtrovane && false)) && deti.length === 0) {
          vyhodit = true;
          break;
        }
        if (jePocet) {
          vysledok[p.alias] = [{ count: deti.length }];
          continue;
        }
        const vnorene = vyber(db, d, vz.tabulka, deti, p.vnutro, podCesta) ?? [];
        if (vz.jeden) {
          const jeden = vnorene[0] ?? null;
          if (p.rozbal) Object.assign(vysledok, jeden ?? {});
          else vysledok[p.alias] = jeden;
        } else if (p.rozbal) {
          // `...rel(stlpec)` pri jeden-k-mnohým vráti polia hodnôt
          for (const k of Object.keys(vnorene[0] ?? {})) vysledok[k] = vnorene.map((x) => x[k]);
        } else vysledok[p.alias] = vnorene;
      }
    }
    if (!vyhodit) out.push(vysledok);
  }
  return out;
}

/* ---------------------------------------------------------------- HTTP */

function json(status: number, telo: unknown, hlavicky: Record<string, string> = {}): Odpoved {
  return {
    status,
    hlavicky: { "content-type": "application/json; charset=utf-8", ...hlavicky },
    telo: telo === undefined ? null : JSON.stringify(telo),
  };
}

function chyba(e: unknown): Odpoved {
  if (e instanceof ChybaPgrst)
    return json(e.status, { code: e.kod, message: e.message, details: e.detail, hint: null });
  return json(500, {
    code: "DEMO",
    message: String((e as Error)?.message ?? e),
    details: null,
    hint: null,
  });
}

export type PoziadavkaRest = {
  metoda: string;
  cesta: string; // za /rest/v1/
  parametre: URLSearchParams;
  hlavicky: Record<string, string | undefined>;
  telo: unknown;
  kontext: KontextPoziadavky;
};

export type RpcObsluha = (
  args: Record<string, any>,
  db: DemoDb,
  kontext: KontextPoziadavky,
) => unknown;

export function obsluzRest(
  db: DemoDb,
  p: PoziadavkaRest,
  rpc: Record<string, RpcObsluha>,
): Odpoved {
  try {
    const prefer = (p.hlavicky["prefer"] ?? "").toLowerCase();
    const accept = p.hlavicky["accept"] ?? "";
    const jedenObjekt = accept.includes("vnd.pgrst.object");
    const cesta = p.cesta.replace(/^\/+|\/+$/g, "");

    if (cesta.startsWith("rpc/")) {
      const meno = cesta.slice(4);
      const args =
        p.metoda === "GET" || p.metoda === "HEAD"
          ? Object.fromEntries([...p.parametre].filter(([k]) => !RIADIACE.has(k)))
          : ((p.telo as Record<string, any>) ?? {});
      const f = rpc[meno];
      let vysledok: unknown;
      if (f) vysledok = f(args, db, p.kontext);
      else {
        console.warn(`[demo] RPC „${meno}" nie je v demo vrstve — vraciam null`);
        vysledok = null;
      }
      // Funkcia vracajúca tabuľku: dá sa ďalej filtrovať a zoraďovať.
      if (
        Array.isArray(vysledok) &&
        (p.parametre.has("select") || p.parametre.has("order") || p.parametre.has("limit"))
      ) {
        const d = rozoberDopyt("__rpc", p.parametre);
        let r = vysledok.filter((x) => d.filtre.every((f2) => splna(x, f2)));
        r = zorad(r, d.order);
        if (d.offset) r = r.slice(d.offset);
        if (d.limit != null) r = r.slice(0, d.limit);
        vysledok = r;
      }
      if (jedenObjekt && Array.isArray(vysledok)) vysledok = vysledok[0] ?? null;
      return json(200, vysledok ?? null);
    }

    const tabulka = cesta;
    if (!db.existuje(tabulka)) {
      throw new ChybaPgrst(
        404,
        "PGRST205",
        `Could not find the table 'public.${tabulka}' in the schema cache`,
      );
    }

    if (p.metoda === "GET" || p.metoda === "HEAD") {
      const d = rozoberDopyt(tabulka, p.parametre);
      let riadky = db.tabulka(tabulka).filter((r) => d.filtre.every((f) => splna(r, f)));
      riadky = zorad(riadky, d.order);
      // !inner a filtre na vnorených vzťahoch vyraďujú riadky — počíta sa po nich
      const celkom0 = riadky.length;
      let vybrane = vyber(db, d, tabulka, riadky, d.select, "") ?? [];
      // zoradenie podľa vnoreného stĺpca `order=rel(stlpec).desc` sa nepodporuje — ignoruje sa
      const jePocetKorena = d.select.length === 1 && d.select[0].druh === "pocet";
      const celkom = vybrane.length === riadky.length ? celkom0 : vybrane.length;
      if (d.offset) vybrane = vybrane.slice(d.offset);
      if (d.limit != null) vybrane = vybrane.slice(0, d.limit);
      if (jePocetKorena) vybrane = [{ count: celkom }];
      const hl: Record<string, string> = {};
      const od = d.offset;
      const po = od + vybrane.length - 1;
      hl["content-range"] =
        `${vybrane.length ? `${od}-${po}` : "*"}/${prefer.includes("count=") ? celkom : "*"}`;
      if (p.metoda === "HEAD") return { status: 200, hlavicky: hl, telo: null };
      if (jedenObjekt) {
        if (vybrane.length !== 1) {
          throw new ChybaPgrst(
            406,
            "PGRST116",
            "JSON object requested, multiple (or no) rows returned",
            `The result contains ${vybrane.length} rows`,
          );
        }
        return json(200, vybrane[0], hl);
      }
      return json(200, vybrane, hl);
    }

    const schemaTab = schema.tabulky[tabulka];
    if (schemaTab?.pohlad || db.pohlady.has(tabulka)) {
      throw new ChybaPgrst(405, "DEMO", "Do pohľadu sa v demo nezapisuje");
    }
    const t = db.tabulka(tabulka);
    const vratit = prefer.includes("return=representation");
    const d = rozoberDopyt(tabulka, p.parametre);
    let zmenene: Riadok[] = [];

    if (p.metoda === "POST") {
      const vstup = (Array.isArray(p.telo) ? p.telo : [p.telo]) as Riadok[];
      const upsert =
        prefer.includes("resolution=merge-duplicates") ||
        prefer.includes("resolution=ignore-duplicates");
      const ignoruj = prefer.includes("resolution=ignore-duplicates");
      const naKonflikt = p.parametre.get("on_conflict");
      const kluce = naKonflikt
        ? [naKonflikt.split(",").map((x) => x.trim())]
        : kluceTabulky(tabulka);
      for (const r of vstup) {
        if (upsert) {
          const kluc = kluce.find((k) => k.every((s) => r[s] !== undefined)) ?? kluce[0];
          const existujuci = t.find((x) =>
            kluc.every((s) => r[s] !== undefined && String(x[s]) === String(r[s])),
          );
          if (existujuci) {
            if (!ignoruj) {
              Object.assign(existujuci, r);
              if ("updated_at" in existujuci && r.updated_at === undefined)
                existujuci.updated_at = new Date().toISOString();
              zmenene.push(existujuci);
            }
            continue;
          }
        } else {
          // Porušenie unikátneho kľúča — ako Postgres (23505).
          for (const kluc of kluceTabulky(tabulka)) {
            if (kluc.length === 1 && kluc[0] === "id" && r.id === undefined) continue;
            if (!kluc.every((s) => r[s] != null)) continue;
            if (t.some((x) => kluc.every((s) => String(x[s]) === String(r[s])))) {
              throw new ChybaPgrst(
                409,
                "23505",
                `duplicate key value violates unique constraint (${kluc.join(", ")})`,
              );
            }
          }
        }
        const novy = db.doplnRiadok(tabulka, r, p.kontext);
        t.push(novy);
        zmenene.push(novy);
      }
      console.info(`[demo] INSERT ${tabulka}: ${zmenene.length} riadkov (len v pamäti)`);
    } else if (p.metoda === "PATCH") {
      const zmena = (p.telo ?? {}) as Riadok;
      for (const r of t) {
        if (!d.filtre.every((f) => splna(r, f))) continue;
        Object.assign(r, zmena);
        if ("updated_at" in r && zmena.updated_at === undefined)
          r.updated_at = new Date().toISOString();
        zmenene.push(r);
      }
      console.info(`[demo] UPDATE ${tabulka}: ${zmenene.length} riadkov (len v pamäti)`);
    } else if (p.metoda === "DELETE") {
      zmenene = t.filter((r) => d.filtre.every((f) => splna(r, f)));
      const zmaz = new Set(zmenene);
      const zostava = t.filter((r) => !zmaz.has(r));
      t.length = 0;
      t.push(...zostava);
      console.info(`[demo] DELETE ${tabulka}: ${zmenene.length} riadkov (len v pamäti)`);
    } else {
      throw new ChybaPgrst(405, "DEMO", `Metóda ${p.metoda} nie je podporovaná`);
    }

    if (!vratit) return { status: p.metoda === "POST" ? 201 : 204, hlavicky: {}, telo: null };
    const vybrane = vyber(db, d, tabulka, zmenene, d.select, "") ?? [];
    if (jedenObjekt) {
      if (vybrane.length !== 1) {
        throw new ChybaPgrst(
          406,
          "PGRST116",
          "JSON object requested, multiple (or no) rows returned",
        );
      }
      return json(p.metoda === "POST" ? 201 : 200, vybrane[0]);
    }
    return json(p.metoda === "POST" ? 201 : 200, vybrane);
  } catch (e) {
    if (!(e instanceof ChybaPgrst)) console.error("[demo] chyba v PostgREST náhrade:", e);
    return chyba(e);
  }
}

export const _test = { rozoberLogiku, rozoberFilter, operator, randomUUID };
