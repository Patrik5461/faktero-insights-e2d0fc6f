import { describe, expect, it } from "vitest";
import {
  bilancia,
  bilanciaSOcakavanym,
  mesiaceObdobia,
  obdobiePredvolby,
  spocitajVynosyNaklady,
  suctyObdobia,
  sumyFaktury,
  sumyPrijatej,
  type BlocekVN,
  type FakturaVN,
  type PrijataVN,
} from "./vynosy-naklady";

const fa = (p: Partial<FakturaVN>): FakturaVN => ({
  type: "regular",
  status: "issued",
  currency: "EUR",
  total: 123,
  subtotal: 100,
  issue_date: "2026-03-10",
  paid_at: null,
  ...p,
});
const pr = (p: Partial<PrijataVN>): PrijataVN => ({
  type: "regular",
  status: "received",
  currency: "EUR",
  amount_total: 61.5,
  amount_without_vat: 50,
  issue_date: "2026-03-05",
  delivery_date: null,
  ...p,
});
const bl = (p: Partial<BlocekVN>): BlocekVN => ({
  currency: "EUR",
  net_amount: 10,
  total_amount: 12.3,
  vat_amount: 2.3,
  issue_date: "2026-03-20",
  ...p,
});

const zaRok = (x: {
  faktury?: FakturaVN[];
  prijate?: PrijataVN[];
  blocky?: BlocekVN[];
  domaca?: string;
}) =>
  spocitajVynosyNaklady({
    faktury: x.faktury ?? [],
    prijate: x.prijate ?? [],
    blocky: x.blocky ?? [],
    domaca: x.domaca ?? "EUR",
    od: "2026-01-01",
    do: "2026-12-31",
  });
const marec = (v: ReturnType<typeof zaRok>) => v.mesiace.find((m) => m.mesiac === "2026-03")!;

describe("mesiaceObdobia", () => {
  it("pokryje celé obdobie aj cez prelom roka", () => {
    expect(mesiaceObdobia("2026-01-01", "2026-12-31")).toHaveLength(12);
    expect(mesiaceObdobia("2025-11-15", "2026-02-03")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(mesiaceObdobia("2026-05-01", "2026-04-30")).toEqual([]);
  });
});

describe("spocitajVynosyNaklady", () => {
  it("uhradená ide do výnosov, neuhradená do očakávaných", () => {
    const v = marec(
      zaRok({ faktury: [fa({ status: "paid" }), fa({ paid_at: "2026-03-12" }), fa({})] }),
    );
    expect(v.sDph.vynosy).toBe(246);
    expect(v.sDph.ocakavaneVynosy).toBe(123);
    expect(v.bezDph.vynosy).toBe(200);
    expect(v.bezDph.ocakavaneVynosy).toBe(100);
  });

  it("zálohová faktúra, daňový doklad k platbe, koncept a storno nie sú výnos", () => {
    const v = zaRok({
      faktury: [
        fa({ type: "proforma", status: "paid" }),
        fa({ type: "advance_payment", status: "paid" }),
        fa({ status: "draft" }),
        fa({ status: "cancelled" }),
      ],
    });
    expect(suctyObdobia(v.mesiace, true)).toEqual({
      vynosy: 0,
      ocakavaneVynosy: 0,
      naklady: 0,
      ocakavaneNaklady: 0,
    });
  });

  it("dobropis odpočítava — uložený záporne aj starý kladný", () => {
    const v = marec(
      zaRok({
        faktury: [
          fa({ status: "paid" }),
          fa({ type: "credit_note", status: "paid", total: -24.6, subtotal: -20 }),
          fa({ type: "credit_note", status: "paid", total: 12.3, subtotal: 10 }),
        ],
      }),
    );
    expect(v.sDph.vynosy).toBe(86.1);
    expect(v.bezDph.vynosy).toBe(70);
  });

  it("prijatá: uhradená do nákladov, inak očakávané; záloha a koncept nie", () => {
    const v = marec(
      zaRok({
        prijate: [
          pr({ status: "paid" }),
          pr({ status: "booked" }),
          pr({ type: "proforma", status: "paid" }),
          pr({ status: "draft" }),
          pr({ status: "cancelled" }),
        ],
      }),
    );
    expect(v.sDph.naklady).toBe(61.5);
    expect(v.sDph.ocakavaneNaklady).toBe(61.5);
    expect(v.bezDph.naklady).toBe(50);
  });

  it("prijatá patrí do mesiaca dodania, bez neho vystavenia", () => {
    const v = zaRok({
      prijate: [pr({ issue_date: "2026-03-30", delivery_date: "2026-02-28", status: "paid" })],
    });
    expect(v.mesiace.find((m) => m.mesiac === "2026-02")!.sDph.naklady).toBe(61.5);
    expect(marec(v).sDph.naklady).toBe(0);
  });

  it("bloček je vždy uhradený náklad; bez základu sa dopočíta z dane", () => {
    const v = marec(zaRok({ blocky: [bl({}), bl({ net_amount: null })] }));
    expect(v.sDph.naklady).toBe(24.6);
    expect(v.bezDph.naklady).toBe(20);
    expect(v.sDph.ocakavaneNaklady).toBe(0);
  });

  it("cudzia mena cez uložený prepočet; bez neho sa vynechá a spočíta", () => {
    const v = zaRok({
      domaca: "CZK",
      faktury: [
        fa({ status: "paid", total: 123, subtotal: 100, total_eur: 3075, subtotal_eur: 2500 }),
        fa({ status: "paid" }),
        fa({ status: "paid", currency: "CZK", total: 1210, subtotal: 1000 }),
      ],
      prijate: [
        pr({ status: "paid", amount_without_vat_eur: 1250, vat_amount_eur: 287.5 }),
        pr({ status: "paid" }),
      ],
      blocky: [bl({})],
    });
    expect(marec(v).sDph.vynosy).toBe(4285);
    expect(marec(v).bezDph.vynosy).toBe(3500);
    expect(marec(v).sDph.naklady).toBe(1537.5);
    expect(v.bezPrepoctu).toEqual({ faktury: 1, prijate: 1, blocky: 1 });
    expect(v.mena).toBe("CZK");
  });

  it("doklady mimo obdobia sa nepočítajú", () => {
    const v = zaRok({ faktury: [fa({ status: "paid", issue_date: "2025-12-31" })] });
    expect(suctyObdobia(v.mesiace, true).vynosy).toBe(0);
  });
});

describe("bilancia a súčty", () => {
  it("bilancia z uhradeného, druhá aj s očakávaným", () => {
    const c = { vynosy: 1000, ocakavaneVynosy: 500, naklady: 300, ocakavaneNaklady: 900 };
    expect(bilancia(c)).toBe(700);
    expect(bilanciaSOcakavanym(c)).toBe(300);
  });
});

describe("sumy dokladov", () => {
  it("cudzia faktúra bez prepočítaného základu ho dopočíta pomerom", () => {
    expect(sumyFaktury(fa({ total_eur: 246, subtotal_eur: null }), "CZK")).toEqual({
      sDph: 246,
      bezDph: 200,
    });
  });
  it("prijatá v domácej mene berie pôvodné sumy", () => {
    expect(sumyPrijatej(pr({}), "EUR")).toEqual({ sDph: 61.5, bezDph: 50 });
  });
});

describe("obdobiePredvolby", () => {
  const dnes = new Date(2026, 9, 28);
  it("tento a minulý rok, posledných 12 mesiacov", () => {
    expect(obdobiePredvolby("rok", dnes)).toEqual({ od: "2026-01-01", do: "2026-12-31" });
    expect(obdobiePredvolby("minuly_rok", dnes)).toEqual({ od: "2025-01-01", do: "2025-12-31" });
    expect(obdobiePredvolby("12_mesiacov", dnes)).toEqual({ od: "2025-11-01", do: "2026-10-31" });
  });
});
