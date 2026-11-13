import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { dokladNaZaznam } from "./mobil-doklad";
import { doplnRozpisEet, DOVOD_NAVRHU_SADZBY_QR } from "./blocek-eet";
import type { BlocekVysledok } from "./blocek.functions";

const QR = "EET*1.0*DIC:CZ27082440*KC:605.00*DT:202610301015*R:B*";

describe("dokladNaZaznam — český bloček z QR", () => {
  it("návrh 21 % ide s rozpisom aj s dôvodom kontroly", () => {
    const v = doplnRozpisEet({ zdroj: "qr", overeny: false, qr_raw: QR, total: 605, currency: "CZK", items: [] });
    const z = dokladNaZaznam("firma", v, "hotovost", null);
    expect(z).toMatchObject({
      vat_breakdown: [{ sadzba: 21, zaklad: 500, dph: 105 }],
      net_amount: 500,
      vat_amount: 105,
      kontrola_dph: DOVOD_NAVRHU_SADZBY_QR,
    });
  });

  it("rozpis z fotky bez kontroly pošle kontrola_dph null (server nehádá)", () => {
    const v: BlocekVysledok = {
      zdroj: "qr",
      overeny: false,
      qr_raw: QR,
      total: 605,
      vat_breakdown: [{ sadzba: 12, zaklad: 540.18, dph: 64.82 }],
      items: [],
    };
    expect(dokladNaZaznam("firma", v, "karta", null)).toHaveProperty("kontrola_dph", null);
  });

  it("slovenská eKasa kľúč kontrola_dph neposiela", () => {
    const v: BlocekVysledok = { zdroj: "ekasa", overeny: true, qr_raw: "O-ABC", total: 5, items: [] };
    expect(dokladNaZaznam("firma", v, "karta", null)).not.toHaveProperty("kontrola_dph");
  });
});
