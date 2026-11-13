import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import { JazykProvider } from "@/lib/i18n/useT";
import {
  kontrolaFormulara,
  kontrolaNespracovaneho,
  dphZoVstupu,
  hlavnaSadzba,
  rozpisZDokladu,
  sadzbyNaVyber,
  suctyRozpisu,
  vypocitanaDph,
  zmenaZakladu,
  celkomSoZaokruhlenim,
  historickeSadzbyNaVyber,
  kontrolaUlozeniaPrijatej,
  pociatocneZaokruhlenie,
  ponukaSadzieb,
  spoluPoOprave,
  zleRiadky,
  zmenaDphPrijatej,
  type DphPoliaPrijatej,
} from "./dph-formular";
import { EditorRozpisuDph } from "./EditorRozpisuDph";
import { VolbaSadzbyDph } from "./VolbaSadzbyDph";
import { UpozornenieRozpisuDph } from "./UpozornenieRozpisuDph";
import { kontrolaOpravy } from "./OpravaRozpisuDph";

const html = (p: ReactNode) =>
  renderToStaticMarkup(<JazykProvider jazyk="sk">{p}</JazykProvider>).replace(/[\u00a0\u202f]/g, " ");

describe("pravidlá DPH vo formulári", () => {
  it("zákonné sadzby podľa krajiny a dňa dodania", () => {
    expect(sadzbyNaVyber("SK", "2026-11-01")).toEqual(expect.arrayContaining([23, 19, 5, 0]));
    expect(sadzbyNaVyber("SK", "2026-11-01")).not.toContain(20);
    expect(sadzbyNaVyber("SK", "2024-06-01")).toEqual(expect.arrayContaining([20, 10]));
    expect(sadzbyNaVyber("CZ", "2026-11-01")).toEqual(expect.arrayContaining([21, 12, 0]));
  });

  it("DPH riadku sa počíta zo základu; doladiť sa dá len o ±0,02", () => {
    const r = { sadzba: 23, zaklad: 100.05, dph: 23.01 };
    expect(vypocitanaDph(r)).toBe(23.01);
    expect(dphZoVstupu(r, 23.03)).toEqual({ dph: 23.03, odmietnuta: false });
    expect(dphZoVstupu(r, 22.99)).toEqual({ dph: 22.99, odmietnuta: false });
    // Väčšia zmena (napr. DPH z plnej sumy pred odpočtom zálohy) sa nepustí.
    expect(dphZoVstupu(r, 30.5)).toEqual({ dph: 23.01, odmietnuta: true });
    expect(dphZoVstupu(r, 23.04)).toEqual({ dph: 23.01, odmietnuta: true });
  });

  it("prenesenie, oslobodené a mimo DPH majú vždy DPH 0", () => {
    expect(dphZoVstupu({ sadzba: 23, zaklad: 100, dph: 0, pdp: true }, 23)).toEqual({ dph: 0, odmietnuta: true });
    expect(vypocitanaDph({ sadzba: 0, zaklad: 50, dph: 0, vat_category: "exempt" })).toBe(0);
    expect(zmenaZakladu({ sadzba: 0, zaklad: 0, dph: 0, vat_category: "out_of_scope" }, 80).dph).toBe(0);
    expect(zmenaZakladu({ sadzba: 19, zaklad: 0, dph: 0 }, 80).dph).toBe(15.2);
  });

  it("hlavička je súčet rozpisu, sadzba hlavičky najvyššia zdaniteľná", () => {
    const r = [
      { sadzba: 23, zaklad: 116.87, dph: 26.88 },
      { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "exempt" },
    ];
    expect(suctyRozpisu(r)).toEqual({ zaklad: 143.77, dph: 26.88, spolu: 170.65 });
    expect(hlavnaSadzba(r)).toBe(23);
  });

  it("rozpis zo starého dokladu len s hlavičkou: jeden riadok s dopočítanou (neplatnou) sadzbou", () => {
    const r = rozpisZDokladu({ zaklad: 100, dph: 16.82 });
    expect(r).toEqual([{ sadzba: 16.8, zaklad: 100, dph: 16.82 }]);
    const k = kontrolaOpravy(r, "SK", "2026-10-01");
    expect(k.ok).toBe(false);
    expect(k.chyby.some((c) => c.kod === "neplatna_sadzba")).toBe(true);
    expect(kontrolaOpravy([{ sadzba: 23, zaklad: 100, dph: 23 }], "SK", "2026-10-01").ok).toBe(true);
  });
});

describe("kontrola pred uložením", () => {
  it("Tempus-Car: DPH z plnej sumy pred odpočtom zálohy (30,5 %) neprejde", () => {
    const k = kontrolaFormulara({ riadky: [{ sadzba: 23, zaklad: 100, dph: 30.5 }], krajina: "SK", den: "2026-10-15" });
    expect(k.ok).toBe(false);
    expect(k.chyby[0]!.sprava).toContain("vychádza DPH 23,00");
  });
  it("zahraničný dodávateľ z EÚ smie mať sadzbu svojho štátu", () => {
    const r = [{ sadzba: 20, zaklad: 100, dph: 20 }];
    expect(kontrolaFormulara({ riadky: r, krajina: "SK", den: "2026-10-15" }).ok).toBe(false);
    expect(kontrolaFormulara({ riadky: r, krajina: "SK", den: "2026-10-15", krajinaDodavatela: "AT" }).ok).toBe(true);
    expect(sadzbyNaVyber("SK", "2026-10-15", "AT")).toContain(20);
  });
  it("súčet podľa sadzieb musí sedieť so sumou vytlačenou na doklade", () => {
    const r = [{ sadzba: 23, zaklad: 100, dph: 23 }];
    expect(kontrolaFormulara({ riadky: r, krajina: "SK", den: "2026-10-15", celkomDokladu: 123 }).ok).toBe(true);
    const k = kontrolaFormulara({ riadky: r, krajina: "SK", den: "2026-10-15", celkomDokladu: 150 });
    expect(k.chyby[0]!.kod).toBe("suma_dokladu");
  });
  it("nespracovaný: zálohová a iný doklad sa nekontrolujú, faktúra áno", () => {
    const u = { rozpis: [{ sadzba: 16.82, zaklad: 100, dph: 16.82 }], datumDodania: "2026-10-01", celkom: 116.82, mena: "EUR" };
    expect(kontrolaNespracovaneho(u, "SK", "zalohova").ok).toBe(true);
    expect(kontrolaNespracovaneho(u, "SK", "ostatny").ok).toBe(true);
    expect(kontrolaNespracovaneho(u, "SK", "faktura").ok).toBe(false);
  });
});

describe("formulár", () => {
  it("výber sadzby ponúka len zákonné; neplatnú z dokladu len ukáže ako neplatnú", () => {
    const h = html(
      <VolbaSadzbyDph riadok={{ sadzba: 16.82, zaklad: 100, dph: 16.82 }} sadzby={[23, 19, 5, 0]} onChange={() => {}} />,
    );
    expect(h).toContain("16,82 % – neplatná");
    expect(h).toMatch(/<option value="s:16\.82" disabled/);
    expect(h).toContain('aria-invalid="true"');
    for (const s of [23, 19, 5, 0]) expect(h).toContain(`value="s:${s}"`);
    expect(h).not.toContain('value="s:20"');
  });

  it("editor ukáže riadky, súčty a orámuje chybný riadok", () => {
    const riadky = [{ sadzba: 23, zaklad: 100, dph: 30.5 }];
    const k = kontrolaOpravy(riadky, "SK", "2026-10-01");
    const h = html(<EditorRozpisuDph riadky={riadky} onChange={() => {}} sadzby={[23, 19, 5, 0]} mena="EUR" kontrola={k} />);
    expect(h).toContain("Pridať sadzbu");
    expect(h).toContain("Bez DPH 100,00 € · DPH 30,50 € · spolu 130,50 €");
    expect(h).toContain("dk-ramik-chyba");
  });

  it("upozornenie už neponúka „Pokračovať aj tak“ ani „Rozpis je správny“", () => {
    const k = kontrolaOpravy([{ sadzba: 20, zaklad: 100, dph: 20 }], "SK", "2026-10-01");
    const h = html(<UpozornenieRozpisuDph kontrola={k} potvrdene onPotvrd={() => {}} onOprava={() => {}} />);
    expect(h).toContain("Rozpis DPH nesedí");
    expect(h).toContain("Opraviť rozpis DPH");
    expect(h).not.toContain("Pokračovať aj tak");
    expect(h).not.toContain("Rozpis je správny");
    expect(h).toContain("doklad sa neuloží");
  });
});

/* Revízia 13. 11. — body 5, 6, 8. */
describe("historické sadzby pre záporný riadok a dobropis (bod 5)", () => {
  it("SK: historické 20/10 sú v ponuke záporného riadku, nie kladného", () => {
    const sadzby = sadzbyNaVyber("SK", "2025-03-01");
    const hist = historickeSadzbyNaVyber("SK");
    expect(hist).toEqual(expect.arrayContaining([23, 20, 19, 10, 5, 0]));
    expect(ponukaSadzieb(sadzby, hist, { zaklad: -100, dph: -20 })).toContain(20);
    expect(ponukaSadzieb(sadzby, hist, { zaklad: 100, dph: 23 })).not.toContain(20);
    expect(ponukaSadzieb(sadzby, hist, { zaklad: 100, dph: 20 }, true)).toContain(20);
  });

  it("výber v zápornom riadku ponúkne 20 % a neoznačí ho ako neplatné", () => {
    const h = html(
      <VolbaSadzbyDph
        riadok={{ sadzba: 20, zaklad: -500, dph: -100 }}
        sadzby={[23, 19, 5, 0]}
        historicke={historickeSadzbyNaVyber("SK")}
        onChange={() => {}}
      />,
    );
    expect(h).toContain('value="s:20"');
    expect(h).not.toContain("neplatná");
  });

  it("dobropis ponúkne sadzby pôvodného obdobia; neplatná ostane neplatná", () => {
    const h = html(
      <VolbaSadzbyDph
        riadok={{ sadzba: 16.82, zaklad: 100, dph: 16.82 }}
        sadzby={[23, 19, 5, 0]}
        historicke={historickeSadzbyNaVyber("SK")}
        dobropis
        onChange={() => {}}
      />,
    );
    expect(h).toContain('value="s:20"');
    expect(h).toContain('value="s:10"');
    expect(h).toContain("16,82 % – neplatná");
  });

  it("editor neorámuje záporný riadok s historickou sadzbou", () => {
    const riadky = [
      { sadzba: 23, zaklad: 1000, dph: 230 },
      { sadzba: 20, zaklad: -500, dph: -100 },
    ];
    const h = html(
      <EditorRozpisuDph
        riadky={riadky}
        onChange={() => {}}
        sadzby={[23, 19, 5, 0]}
        historicke={historickeSadzbyNaVyber("SK")}
        mena="EUR"
      />,
    );
    expect(h).not.toContain("dk-ramik-chyba");
    expect(zleRiadky(riadky, [23, 19, 5, 0])).toEqual(new Set([1]));
    expect(zleRiadky(riadky, [23, 19, 5, 0], historickeSadzbyNaVyber("SK")).size).toBe(0);
  });

  it("CZ: historické 15/10", () => {
    expect(historickeSadzbyNaVyber("CZ")).toEqual(expect.arrayContaining([21, 15, 12, 10, 0]));
  });
});

const ulozena = (z: Partial<DphPoliaPrijatej> = {}): DphPoliaPrijatej => ({
  amount_without_vat: 300,
  vat_amount: 33,
  amount_total: 333,
  rozpis: [{ sadzba: 11, zaklad: 300, dph: 33 }],
  delivery_date: "2026-10-01",
  issue_date: "2026-10-01",
  currency: "EUR",
  supplier_country: "SK",
  supplier_ic_dph: "SK2020000000",
  type: "regular",
  status: "received",
  ...z,
});

describe("úprava starej faktúry bez zmeny súm (bod 6)", () => {
  it("zmena splatnosti/poznámky: nekontroluje sa a sumy sa neposielajú", () => {
    const k = kontrolaUlozeniaPrijatej({ povodne: ulozena(), aktualne: ulozena(), zaokruhlenie: 0, krajina: "SK" });
    expect(k).toEqual({ ok: true, chyby: [], zmena: false });
  });

  it("formátovanie súm (333 vs 333,00) nie je zmena", () => {
    expect(zmenaDphPrijatej(ulozena(), ulozena({ amount_total: 333.0 }))).toBe(false);
  });

  it("zmena sumy alebo dátumu dodania: kontroluje sa celé pravidlo", () => {
    const k = kontrolaUlozeniaPrijatej({
      povodne: ulozena(),
      aktualne: ulozena({ delivery_date: "2026-10-02" }),
      zaokruhlenie: 0,
      krajina: "SK",
    });
    expect(k.zmena).toBe(true);
    expect(k.ok).toBe(false);
  });

  it("pri zmene súm je rozpis povinný", () => {
    const k = kontrolaUlozeniaPrijatej({
      povodne: ulozena(),
      aktualne: ulozena({ rozpis: [], amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
      zaokruhlenie: 0,
      krajina: "SK",
    });
    expect(k.ok).toBe(false);
    expect(k.chyby.map((c) => c.sprava).join(" ")).toContain("Doplňte rozpis DPH");
  });

  it("prechod z konceptu na prijatú je zmena", () => {
    expect(zmenaDphPrijatej(ulozena({ status: "draft" }), ulozena())).toBe(true);
  });

  it("nová faktúra sa kontroluje vždy", () => {
    expect(kontrolaUlozeniaPrijatej({ povodne: null, aktualne: ulozena(), zaokruhlenie: 0, krajina: "SK" }).ok).toBe(false);
  });
});

describe("zaokrúhlenie celkovej sumy (bod 8)", () => {
  it("CZ faktúra s haliérovým zaokrúhlením sa uloží so skutočnou sumou", () => {
    const a = ulozena({
      amount_without_vat: 1000.4,
      vat_amount: 210.08,
      amount_total: 1210,
      rozpis: [{ sadzba: 21, zaklad: 1000.4, dph: 210.08 }],
      currency: "CZK",
      supplier_country: "CZ",
      supplier_ic_dph: "CZ12345678",
    });
    const z = pociatocneZaokruhlenie(1210, 1000.4, 210.08, "CZK");
    expect(z).toBe(-0.48);
    expect(celkomSoZaokruhlenim(1000.4, 210.08, z)).toBe(1210);
    const k = kontrolaUlozeniaPrijatej({ povodne: null, aktualne: a, zaokruhlenie: z, krajina: "CZ" });
    expect(k.chyby).toEqual([]);
  });

  it("zaokrúhlenie nad hranicu neprejde", () => {
    const k = kontrolaUlozeniaPrijatej({
      povodne: null,
      aktualne: ulozena({
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 124,
        rozpis: [{ sadzba: 23, zaklad: 100, dph: 23 }],
      }),
      zaokruhlenie: 1,
      krajina: "SK",
    });
    expect(k.ok).toBe(false);
    expect(k.chyby[0]!.kod).toBe("suma_dokladu");
  });

  it("uložená suma mimo hranice začína zaokrúhlením 0", () => {
    expect(pociatocneZaokruhlenie(130, 100, 23, "EUR")).toBe(0);
    expect(pociatocneZaokruhlenie(123.4, 100, 23, "EUR")).toBe(0.4);
  });

  it("oprava rozpisu nemení sumu, keď sedí so zaokrúhlením", () => {
    expect(spoluPoOprave(1210, 1000.4, 210.08, "CZK")).toBe(1210);
    expect(spoluPoOprave(-1210, -1000.4, -210.08, "CZK")).toBe(-1210);
    expect(spoluPoOprave(130.5, 100, 23, "EUR")).toBe(123);
    expect(spoluPoOprave(123.3, 100, 23, "EUR")).toBe(123.3);
  });
});
