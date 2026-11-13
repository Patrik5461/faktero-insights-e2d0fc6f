import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CakajuciDoklad } from "./doklady-fronta";
import type { BlocekVysledok } from "@/lib/faktero/blocek.functions";

/*
  Český bloček z QR (EET) v appke: QR sa prečíta skôr, fotka príde až potom.
  Rozpis DPH (sadzby) dá len fotka — fronta ju pri odoslaní pošle s QR.
*/
let fronta: CakajuciDoklad[] = [];
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./offline-queue", () => ({ isOnline: async () => true }));
vi.mock("@/lib/faktero/mobil-doklad", () => ({
  nahrajPrilohu: async () => ({ path: "firma/foto.jpg", mime: "image/jpeg", size: 10 }),
  dokladNaZaznam: (company_id: string, v: BlocekVysledok) => ({
    company_id,
    vat_breakdown: v.vat_breakdown ?? null,
    kontrola_dph: v.kontrola_dph ?? null,
  }),
}));
vi.mock("./doklady-fronta", () => ({
  fronta: async () => fronta,
  zmazZFronty: async (id: string) => {
    fronta = fronta.filter((d) => d.id !== id);
  },
  zapisChybu: async () => {},
  zapisPrilohu: async () => {},
}));

const { odosliCakajuce } = await import("./doklady-odoslanie");

const QR = "EET*1.0*DIC:CZ27082440*KC:605.00*DT:202610301015*R:B*";
const navrh = {
  zdroj: "qr",
  overeny: false,
  qr_raw: QR,
  total: 605,
  vat_breakdown: [{ sadzba: 21, zaklad: 500, dph: 105 }],
  rozpis_odhad: true,
  kontrola_dph: "Rozpis DPH je len návrh (21 %)",
  items: [],
} as BlocekVysledok;

function doklad(z: Partial<CakajuciDoklad>): CakajuciDoklad {
  return { id: "1", company_id: "firma", uhrada: "karta", ts: 0, qr_raw: QR, fotkaPovinna: true, ...z };
}

beforeEach(() => {
  fronta = [];
});

describe("fronta appky — český QR a fotka", () => {
  it("návrh 21 % s fotkou: prečíta sa znova aj s fotkou a uloží sa rozpis z nej", async () => {
    fronta = [doklad({ obrazok: "data:image/jpeg;base64,AA", vysledok: navrh })];
    const nacitaj = vi.fn(async () => ({
      ...navrh,
      vat_breakdown: [{ sadzba: 12, zaklad: 540.18, dph: 64.82 }],
      rozpis_odhad: undefined,
      kontrola_dph: undefined,
    }) as BlocekVysledok);
    const uloz = vi.fn(async (_v: { data: unknown }) => ({}));
    await odosliCakajuce("firma", nacitaj, uloz);
    expect(nacitaj).toHaveBeenCalledWith({ data: { qr: QR, image_data_url: "data:image/jpeg;base64,AA" } });
    expect(uloz.mock.calls[0]![0]).toMatchObject({
      data: { vat_breakdown: [{ sadzba: 12, zaklad: 540.18, dph: 64.82 }], kontrola_dph: null },
    });
  });

  it("fotka nič nedala: ostáva návrh 21 % s dôvodom na kontrolu", async () => {
    fronta = [doklad({ obrazok: "data:image/jpeg;base64,AA", vysledok: navrh })];
    const nacitaj = vi.fn(async () => ({ zdroj: "nic", overeny: false, items: [] }) as BlocekVysledok);
    const uloz = vi.fn(async (_v: { data: unknown }) => ({}));
    await odosliCakajuce("firma", nacitaj, uloz);
    expect(uloz.mock.calls[0]![0]).toMatchObject({
      data: { vat_breakdown: navrh.vat_breakdown, kontrola_dph: navrh.kontrola_dph },
    });
  });

  it("slovenská eKasa s výsledkom sa znova nečíta", async () => {
    fronta = [
      doklad({
        qr_raw: "O-ABC",
        obrazok: "data:image/jpeg;base64,AA",
        vysledok: { zdroj: "ekasa", overeny: true, total: 5, items: [] } as never,
      }),
    ];
    const nacitaj = vi.fn();
    await odosliCakajuce("firma", nacitaj as never, vi.fn(async () => ({})));
    expect(nacitaj).not.toHaveBeenCalled();
  });
});
