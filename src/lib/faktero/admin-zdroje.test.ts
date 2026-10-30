import { describe, expect, it } from "vitest";
import { formatBajty, jeDocasnyKos, odhadNakladov, percento, tonPercent } from "./admin-zdroje";

const GB = 1024 ** 3;

describe("admin-zdroje", () => {
  it("farba podľa percent: do 70 zelená, 70–90 oranžová, nad 90 červená", () => {
    expect(tonPercent(0)).toBe("zelena");
    expect(tonPercent(69.9)).toBe("zelena");
    expect(tonPercent(70)).toBe("oranzova");
    expect(tonPercent(90)).toBe("oranzova");
    expect(tonPercent(90.1)).toBe("cervena");
  });

  it("percento bez limitu nevymýšľa", () => {
    expect(percento(50, 200)).toBe(25);
    expect(percento(50, 0)).toBeNull();
    expect(percento(NaN, 10)).toBeNull();
  });

  it("odhad nákladov počíta len to, čo je nad limit", () => {
    const storage = { zahrnute: 100 * GB, cena_usd: 0.0213, za_mnozstvo: GB };
    expect(odhadNakladov(4.38 * GB, storage, 1.113)).toEqual({ nad: 0, usd: 0, eur: 0 });
    const o = odhadNakladov(110 * GB, storage, 1.113)!;
    expect(o.usd).toBeCloseTo(0.213, 6);
    expect(o.eur).toBeCloseTo(0.213 / 1.113, 6);
    const edge = { zahrnute: 2_000_000, cena_usd: 2, za_mnozstvo: 1_000_000 };
    expect(odhadNakladov(3_500_000, edge, null)).toEqual({ nad: 1_500_000, usd: 3, eur: null });
    expect(odhadNakladov(1, { zahrnute: 0, cena_usd: null, za_mnozstvo: 1 }, 1)).toBeNull();
  });

  it("dočasné koše", () => {
    expect(jeDocasnyKos("docasne")).toBe(true);
    expect(jeDocasnyKos("apk-docasne")).toBe(true);
    expect(jeDocasnyKos("invoice-pdfs")).toBe(false);
    expect(jeDocasnyKos("docasne-x")).toBe(false);
  });

  it("bajty ako v dashboarde (1 GB = 1024³)", () => {
    expect(formatBajty(4705413601)).toBe("4.38 GB");
    expect(formatBajty(219008147)).toBe("208.9 MB");
    expect(formatBajty(null)).toBe("—");
  });
});
