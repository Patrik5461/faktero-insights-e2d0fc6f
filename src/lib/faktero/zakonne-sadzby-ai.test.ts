import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rozlozNaZakonne, zakonneSadzbyZAi } from "./zakonne-sadzby-ai";
import { rozpisZVytazenia } from "./rozpis-dph-vytazeny";
import { kontrolaSadziebUdajov, udajeZAi } from "./nespracovane";
import { kontrolaNespracovaneho } from "@/components/faktero/dph-formular";
import { lenZakonneSadzby } from "./napravy-dph-vytazenia";

/** RHJ, METRO — model z fotky: 21 %, 386,15 / 81,43, dátum 1. 10. 2023. */
const METRO = {
  supplier_name: "METRO Cash & Carry SR",
  supplier_country: "SK",
  issue_date: "2023-10-01",
  amount_without_vat: 386.15,
  vat_amount: 81.43,
  amount_total: 467.58,
  vat_breakdown: [{ rate: 21, base: 386.15, vat: 81.43 }],
  items: [{ name: "Various items", vat_rate: 21, total: 467.58 }],
  items_total_with_vat: true,
};
/** BÝVAJLEPŠIE, notár — 21 % v SK 2026 (zrejme 23 % + poplatky mimo DPH). */
const NOTAR = {
  supplier_name: "JUDr. Pavol Šádel, notár",
  supplier_country: "SK",
  issue_date: "2026-10-07",
  amount_without_vat: 322.5,
  vat_amount: 67.5,
  amount_total: 390,
  vat_breakdown: [{ rate: 21, base: 322.5, vat: 67.5 }],
};

const vsetkySadzby = (ai: Record<string, any>) => [
  ...((ai.vat_breakdown as any[]) ?? []).map((r) => Number(r.rate)),
  ...((ai.items as any[]) ?? []).map((p) => p.vat_rate).filter((x) => x != null),
  ...(ai.vat_rate != null ? [ai.vat_rate] : []),
];

describe("brána zákonných sadzieb pre výsledok čítania", () => {
  it("METRO 21 % v SK 2023 — nepovolená sadzba sa neuloží, rozpis prázdny a na kontrolu", () => {
    const v = zakonneSadzbyZAi(METRO, { krajina: "SK" });
    expect(vsetkySadzby(v.ai)).toEqual([]);
    expect(v.naKontrolu).toMatch(/21 %.*nevieme prečítať.*20, 10, 0/);
    const u = udajeZAi(v.ai, "2026-11-16", { krajina: "SK" });
    expect(u.rozpis).toEqual([]);
    expect(u.kontrolaDph?.dovod).toMatch(/nevieme prečítať/);
    expect(u.polozky.every((p) => p.vat_rate == null)).toBe(true);
    // Bez rozpisu sa doklad s DPH nevytvorí (web aj server), kým človek rozpis nedoplní.
    expect(kontrolaNespracovaneho(u, "SK", "faktura").ok).toBe(false);
    expect(kontrolaSadziebUdajov(u, "SK").ok).toBe(false);
    // Človek doplní rozpis podľa dokladu (23 %, dátum 13. 10. 2026) — kontrola zmizne.
    const opravene = {
      ...u,
      datumDodania: "2026-10-13",
      datumVystavenia: "2026-10-13",
      rozpis: [{ sadzba: 23, zaklad: 380.15, dph: 87.43, vat_category: "standard" as const }],
      kontrolaDph: undefined,
      celkom: null,
    };
    expect(kontrolaNespracovaneho(opravene, "SK", "faktura")).toEqual({ ok: true, chyby: [] });
  });

  it("notár 21 % v SK 2026 — viac rozkladov (23+19, 23+5, 23+0), nič sa nehádá", () => {
    const v = zakonneSadzbyZAi(NOTAR, { krajina: "SK" });
    expect(v.ai.vat_breakdown).toEqual([]);
    expect(v.naKontrolu).toBeTruthy();
  });

  it.each([
    ["20 % v SK 2026", { issue_date: "2026-05-01", vat_breakdown: [{ rate: 20, base: 100, vat: 20 }] }],
    ["19 % v SK 2023", { issue_date: "2023-05-01", vat_breakdown: [{ rate: 19, base: 100, vat: 19 }] }],
    ["21 % v SK 2026", { issue_date: "2026-05-01", vat_breakdown: [{ rate: 21, base: 100, vat: 21 }] }],
    ["13 % v SK 2026", { issue_date: "2026-05-01", vat_breakdown: [{ rate: 13, base: 100, vat: 13 }] }],
    ["15 % v CZ 2026", { issue_date: "2026-05-01", supplier_country: "CZ", vat_breakdown: [{ rate: 15, base: 100, vat: 15 }] }],
  ])("%s sa neuloží nikde (rozpis, položky, hlavička)", (_n, ai) => {
    const s = (ai as any).vat_breakdown[0].rate;
    const vstup = { ...ai, items: [{ name: "x", vat_rate: s, total: 100 + s }], vat_rate: s, net_amount: 100, vat_amount: s };
    const v = zakonneSadzbyZAi(vstup, { krajina: "SK" });
    expect(vsetkySadzby(v.ai)).not.toContain(s);
    // Aj celá cesta Nespracovaných (udajeZAi → rozpis + položky).
    const u = udajeZAi(v.ai, "2026-11-16", { krajina: "SK" });
    expect(u.rozpis.map((r) => r.sadzba)).not.toContain(s);
    expect(u.polozky.map((p) => p.vat_rate)).not.toContain(s);
  });

  it("aj bez brány: rozpis z vyťaženia nepovolenú sadzbu nevráti (poistka lenZakonneSadzby)", () => {
    const r = rozpisZVytazenia(METRO, { krajina: "SK" });
    expect(r.rozpis.map((x) => x.sadzba)).not.toContain(21);
    expect(r.kontrola.ok).toBe(false);
    expect(
      lenZakonneSadzby([{ sadzba: 21, zaklad: 386.15, dph: 81.43, vat_category: "standard" }], { krajina: "SK", den: "2023-10-01" }),
    ).toEqual([]);
  });

  it("zlá sadzba, pri ktorej DPH sedí na jedinú zákonnú, sa nahradí (prečítané 21, na doklade 23 %)", () => {
    const v = zakonneSadzbyZAi({ issue_date: "2026-10-13", vat_breakdown: [{ rate: 21, base: 380.15, vat: 87.43 }] }, { krajina: "SK" });
    expect(v.ai.vat_breakdown).toEqual([{ rate: 23, base: 380.15, vat: 87.43, vat_category: "standard" }]);
    expect(v.naKontrolu).toBeNull();
  });

  it("rozklad na dve zákonné sadzby len pri jedinom riešení", () => {
    expect(rozlozNaZakonne(200, 30, [20, 10])).toEqual([
      { rate: 20, base: 100, vat: 20 },
      { rate: 10, base: 100, vat: 10 },
    ]);
    // S nulou (alebo treťou sadzbou) je riešení viac — nehádá sa.
    expect(rozlozNaZakonne(200, 30, [20, 10, 0])).toBeNull();
  });

  it("zákonné, historická na zápornom riadku a zahraničné sadzby ostanú", () => {
    const ok = {
      issue_date: "2026-03-01",
      vat_breakdown: [
        { rate: 23, base: 100, vat: 23 },
        { rate: 5, base: 10, vat: 0.5 },
        { rate: 0, base: 7, vat: 0, vat_category: "out_of_scope" },
        { rate: 20, base: -50, vat: -10 },
      ],
    };
    expect(zakonneSadzbyZAi(ok, { krajina: "SK" }).zmeny).toEqual([]);
    const hu = { supplier_country: "HU", issue_date: "2026-03-01", vat_breakdown: [{ rate: 27, base: 100, vat: 27 }] };
    expect(zakonneSadzbyZAi(hu, { krajina: "SK" }).ai.vat_breakdown).toEqual(hu.vat_breakdown);
    const cz = { supplier_ic_dph: "CZ12345678", issue_date: "2026-03-01", vat_breakdown: [{ rate: 21, base: 100, vat: 21 }] };
    expect(zakonneSadzbyZAi(cz, { krajina: "SK" }).zmeny).toEqual([]);
  });
});

/*
  Každá cesta, ktorou výsledok AI ide do uloženia, musí prejsť bránou:
  doklady (mail, nahratie, skener, appka, dočítanie, import, prijaté
  faktúry, rozpis na kontrolu) idú cez `precitajDoklad`, bloček z fotky cez
  `ocrBlocek`, zmluvy o financovaní cez `financovanie-citanie`. Nový súbor,
  ktorý volá AI a pýta si sadzbu DPH, musí volať `zakonneSadzbyZAi`.
*/
describe("všetky cesty výsledku AI idú cez bránu sadzieb", () => {
  const koren = join(__dirname, "..", "..");
  const subory: string[] = [];
  const prejdi = (d: string) => {
    for (const m of readdirSync(d)) {
      const p = join(d, m);
      if (statSync(p).isDirectory()) prejdi(p);
      else if (/\.tsx?$/.test(m) && !/\.test\.tsx?$/.test(m)) subory.push(p);
    }
  };
  prejdi(koren);

  it("súbor, ktorý volá AI a pýta sa na sadzbu DPH, volá zakonneSadzbyZAi", () => {
    const zle = subory.filter((p) => {
      const t = readFileSync(p, "utf8");
      return /\baiVision\(|\bgeminiVision\(/.test(t) && /vat_rate|vat_breakdown/.test(t) && !t.includes("zakonneSadzbyZAi");
    });
    expect(zle.map((p) => p.slice(koren.length))).toEqual([]);
  });

  it("precitajDoklad a ocrBlocek bránu naozaj volajú", () => {
    const mail = readFileSync(join(koren, "lib/faktero/mail-prijem.server.ts"), "utf8");
    expect(mail).toMatch(/zakonneSadzbyZAi\(surove/);
    const blocek = readFileSync(join(koren, "lib/faktero/blocek-ocr.server.ts"), "utf8");
    expect(blocek).toMatch(/zakonneSadzbyZAi\(/);
  });
});
