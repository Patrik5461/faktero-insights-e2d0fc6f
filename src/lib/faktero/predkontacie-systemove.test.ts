import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SYSTEMOVE_CLENENIA_DPH,
  SYSTEMOVE_KV,
  bezZdvojenychSystemovych,
  maSystemovyCiselnik,
  smerSystemovehoClenenia,
  systemoveRiadky,
} from "./predkontacie-systemove";
import { ponuka, ponukaClenenia } from "./predkontacie";
import { rozdelNaMazanie } from "./ciselnik-mazanie";

const MIGRACIA = join(__dirname, "../../../supabase/migrations/20261106210000_systemovy_ciselnik_clenenia.sql");

/** Riadky VALUES z funkcie `predkontacie_systemove_zoznam` v migrácii. */
function zMigracie(): string[][] {
  const sql = readFileSync(MIGRACIA, "utf8");
  const telo = sql.split("predkontacie_systemove_zoznam()")[1].split("$function$")[1];
  const out: string[][] = [];
  const re = /\(\s*((?:'(?:[^']|'')*'|null)(?:\s*,\s*(?:'(?:[^']|'')*'|null))*)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(telo))) {
    const bunky = [...m[1].matchAll(/'((?:[^']|'')*)'|null/g)].map((x) => (x[1] === undefined ? "" : x[1].replace(/''/g, "'")));
    out.push(bunky);
  }
  return out;
}

describe("systémový číselník členenia DPH a KV", () => {
  it("databáza zakladá presne to isté, čo pozná kód", () => {
    const db = zMigracie();
    const ts = systemoveRiadky().map((r) => [r.druh, r.kod, r.popis, r.agenda, r.typ_dokladu ?? "", r.kategoria ?? ""]);
    expect(db).toEqual(ts);
  });

  it("má celé KV podľa zadania a základné členenia SK Pohody", () => {
    expect(SYSTEMOVE_KV.map((k) => k[0])).toEqual([
      "A1", "A2CN", "A2IO", "A2MT", "A2SP", "B1", "B1-0", "B2", "B3",
      "C1", "C1CN", "C1IO", "C1MT", "C2", "C2B1", "C2B1-0", "D1", "D2", "KN",
    ]);
    const kody = SYSTEMOVE_CLENENIA_DPH.map((c) => c[0]);
    for (const k of ["UD", "UDpdp", "UKpdp", "UNoslob", "UN", "PD", "PN", "PB", "PDsluz", "PDnadEU"]) expect(kody).toContain(k);
    expect(new Set(kody).size).toBe(kody.length);
    // Staré neplatné „R…“ kódy Pohody sa nezakladajú.
    expect(kody.some((k) => /^R/.test(k))).toBe(false);
  });

  it("smer podľa riadku priznania", () => {
    expect(smerSystemovehoClenenia("1200 U01")).toBe("vydane");
    expect(smerSystemovehoClenenia("5 U")).toBe("vydane");
    expect(smerSystemovehoClenenia("1300 P01")).toBe("prijate");
    expect(smerSystemovehoClenenia("1351 D02")).toBe("prijate");
  });

  it("len slovenská firma", () => {
    expect(maSystemovyCiselnik("SK")).toBe(true);
    expect(maSystemovyCiselnik(null)).toBe(true);
    expect(maSystemovyCiselnik("CZ")).toBe(false);
  });

  it("systémový kód, ktorý firma má aj z Pohody, sa ukáže raz", () => {
    const r = bezZdvojenychSystemovych([
      { druh: "clenenie_dph", kod: "UD", zdroj: "system" },
      { druh: "clenenie_dph", kod: "UD", zdroj: "pohoda" },
      { druh: "clenenie_dph", kod: "PD", zdroj: "system" },
    ]);
    expect(r.map((x) => `${x.kod}:${x.zdroj}`)).toEqual(["UD:pohoda", "PD:system"]);
  });

  it("ponuka nedá dokladu členenie opačného smeru", () => {
    const zaznamy = systemoveRiadky().map((r) => ({ ...r, ucet_md: null, ucet_d: null, aktivne: true }));
    const prijata = ponukaClenenia(ponuka(zaznamy, "clenenie_dph", [], "prijata"), "prijata").map((m) => m.kod);
    expect(prijata).toContain("PD");
    expect(prijata).not.toContain("UD");
    const faktura = ponuka(zaznamy, "clenenie_dph", [], "faktura").map((m) => m.kod);
    expect(faktura).toContain("UDpdp");
    expect(faktura).not.toContain("PD");
    // Bez druhu dokladu (číselník, pravidlo pre všetky) celý zoznam.
    expect(ponuka(zaznamy, "clenenie_dph").length).toBe(SYSTEMOVE_CLENENIA_DPH.length);
    // Kód bez smeru (vlastný, z Pohody) sa ponúka všade.
    expect(ponuka([{ druh: "clenenie_dph", kod: "PDmoje", popis: null, agenda: "", ucet_md: null, ucet_d: null }], "clenenie_dph", [], "faktura")).toHaveLength(1);
  });

  it("systémový kód sa pri mazaní nezmaže — ponúkne sa skrytie", () => {
    const vybrane = [
      { id: "1", kod: "PD", druh: "clenenie_dph", zdroj: "system" },
      { id: "2", kod: "PDvlastne", druh: "clenenie_dph", zdroj: "rucne" },
    ];
    const r = rozdelNaMazanie(vybrane, vybrane, new Map());
    expect(r.zmazat).toEqual(["2"]);
    expect(r.pouzite).toEqual([{ id: "1", kod: "PD", kde: ["system"] }]);
  });
});
