import { describe, expect, it } from "vitest";
import {
  jeNaUhradu,
  ohodnotOstatny,
  oknoPlatby,
  poradieNaVyber,
  sparujOstatne,
  type OstatnyNaUhradu,
  type PohybOstatneho,
} from "./ostatne-parovanie";
import {
  normalizujRozpoznanie,
  ostatnyZMailu,
  stavPlatbyOstatneho,
  upravIban,
  upravVs,
} from "./ostatne-doklady";

const IBAN_SP = "SK3181800000007000155733";

const predpis = (x: Partial<OstatnyNaUhradu> = {}): OstatnyNaUhradu => ({
  id: "d1",
  kind: "socialna_zdravotna",
  sender: "Sociálna poisťovňa",
  amount: 412.3,
  currency: "EUR",
  due_date: "2026-10-08",
  received_date: "2026-10-20",
  variable_symbol: "1234567890",
  iban: IBAN_SP,
  paid_at: null,
  ...x,
});

const pohyb = (x: Partial<PohybOstatneho> = {}): PohybOstatneho => ({
  id: "t1",
  booking_date: "2026-10-07",
  amount: -412.3,
  currency: "EUR",
  variable_symbol: "1234567890",
  counterparty: "Socialna poistovna",
  counterparty_iban: "SK31 8180 0000 0070 0015 5733",
  description: "Odvody 09/2026",
  ...x,
});

describe("hľadanie platby iného dokladu", () => {
  it("VS, IBAN a lehota → istý návrh", () => {
    const h = ohodnotOstatny(pohyb(), predpis())!;
    expect(h.istota).toBe("auto");
    expect(h.skore).toBeGreaterThanOrEqual(0.9);
    expect(h.dovody).toContain("platba odišla na IBAN z dokladu");
    expect(h.dovody.some((d) => d.startsWith("variabilný symbol"))).toBe(true);
  });

  it("len prichádzajúca platba, iná suma alebo mena nesedí", () => {
    expect(ohodnotOstatny(pohyb({ amount: 412.3 }), predpis())).toBeNull();
    expect(ohodnotOstatny(pohyb({ amount: -412.31 }), predpis())).toBeNull();
    expect(ohodnotOstatny(pohyb({ currency: "CZK" }), predpis())).toBeNull();
  });

  it("suma v absolútnej hodnote, aj suma ako reťazec z DB", () => {
    expect(ohodnotOstatny(pohyb(), predpis({ amount: "412.30" as unknown as number }))).not.toBeNull();
  });

  it("zaplatený bez pohybu, exekúcia ani zmluva sa nehľadajú", () => {
    expect(ohodnotOstatny(pohyb(), predpis({ paid_at: "2026-10-05" }))).toBeNull();
    expect(ohodnotOstatny(pohyb(), predpis({ kind: "exekucia" }))).toBeNull();
    expect(ohodnotOstatny(pohyb(), predpis({ kind: "zmluva" }))).toBeNull();
    expect(jeNaUhradu({ kind: "leasing_uver", amount: 10 })).toBe(false);
    expect(jeNaUhradu({ kind: "danovy_urad", amount: 0 })).toBe(false);
  });

  it("okno okolo lehoty: 60 dní pred, 120 po", () => {
    expect(ohodnotOstatny(pohyb({ booking_date: "2026-08-09" }), predpis())).not.toBeNull();
    expect(ohodnotOstatny(pohyb({ booking_date: "2026-08-08" }), predpis())).toBeNull();
    expect(ohodnotOstatny(pohyb({ booking_date: "2027-02-05" }), predpis())).not.toBeNull();
    expect(ohodnotOstatny(pohyb({ booking_date: "2027-02-06" }), predpis())).toBeNull();
    expect(oknoPlatby(predpis())).toEqual({ od: "2026-08-09", do: "2027-02-05" });
  });

  it("predpis doručený až po zaplatení sa nájde (okno od lehoty, nie od doručenia)", () => {
    const h = ohodnotOstatny(pohyb({ booking_date: "2026-10-06" }), predpis({ received_date: "2026-10-25" }));
    expect(h?.istota).toBe("auto");
  });

  it("bez lehoty sa okno ráta od doručenia", () => {
    const d = predpis({ due_date: null, received_date: "2026-10-01" });
    expect(ohodnotOstatny(pohyb({ booking_date: "2026-10-20" }), d)).not.toBeNull();
    expect(oknoPlatby({ due_date: null, received_date: null })).toBeNull();
  });

  it("samotný IBAN stačí na návrh, VS z dokladu bez úvodných núl", () => {
    const iba = ohodnotOstatny(pohyb({ variable_symbol: null }), predpis())!;
    expect(iba.istota).toBe("auto");
    const vs = ohodnotOstatny(
      pohyb({ variable_symbol: "0001234567890", counterparty_iban: null }),
      predpis({ iban: null }),
    )!;
    expect(vs.istota).toBe("auto");
  });

  it("len suma: ponúkne sa iba tesne pri lehote a nie ako istá", () => {
    const d = predpis({ variable_symbol: null, iban: null, sender: "Úrad XY" });
    const p = pohyb({ variable_symbol: null, counterparty_iban: null, counterparty: "Niekto", description: null });
    const blizko = ohodnotOstatny({ ...p, booking_date: "2026-10-10" }, d)!;
    expect(blizko.istota).toBe("navrh");
    expect(ohodnotOstatny({ ...p, booking_date: "2026-10-30" }, d)).toBeNull();
  });

  it("odosielateľ v protistrane pomôže, keď VS ani IBAN nie sú", () => {
    const h = ohodnotOstatny(
      pohyb({ variable_symbol: null, counterparty_iban: null, booking_date: "2026-10-30" }),
      predpis({ variable_symbol: null, iban: null }),
    )!;
    expect(h.dovody).toContain("platba pre Sociálna poisťovňa");
  });
});

describe("párovanie viacerých", () => {
  it("každý pohyb aj doklad najviac raz, najsilnejšie prvé", () => {
    const z = sparujOstatne(
      [pohyb(), pohyb({ id: "t2", variable_symbol: null, counterparty_iban: null, booking_date: "2026-10-09" })],
      [predpis()],
    );
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ transactionId: "t1", otherDocumentId: "d1", istota: "auto" });
  });

  it("dva rovnaké mesačné predpisy na jeden pohyb → len návrh, rozhodne človek", () => {
    const z = sparujOstatne(
      [pohyb({ booking_date: "2026-10-08" })],
      [predpis(), predpis({ id: "d2" })],
    );
    expect(z).toHaveLength(1);
    expect(z[0].istota).toBe("navrh");
    expect(z[0].dovody).toContain("rovnako dobre sedí aj iná dvojica");
  });

  it("dva pohyby na ten istý doklad rovnako dobre → len návrh", () => {
    const z = sparujOstatne([pohyb(), pohyb({ id: "t2" })], [predpis()]);
    expect(z).toHaveLength(1);
    expect(z[0].istota).toBe("navrh");
  });

  it("poradie na ručný výber: zhoda > rovnaká suma > blízkosť", () => {
    const d = predpis();
    const zhoda = poradieNaVyber(pohyb(), d);
    const suma = poradieNaVyber(
      pohyb({ variable_symbol: null, counterparty_iban: null, counterparty: "X", booking_date: "2026-11-30" }),
      d,
    );
    const ina = poradieNaVyber(pohyb({ amount: -10, booking_date: "2026-10-08" }), d);
    expect(zhoda).toBeGreaterThan(suma);
    expect(suma).toBeGreaterThan(ina);
  });
});

describe("stav platby iného dokladu", () => {
  const r = { kind: "poistovna", amount: 120.5, due_date: "2026-11-15", status: "new", paid_at: null };
  it("spárovaná / návrh / nenájdená / zaplatená bez pohybu", () => {
    expect(stavPlatbyOstatneho(r, { sparovana: true })).toBe("sparovana");
    expect(stavPlatbyOstatneho(r, { maNavrh: true })).toBe("navrh");
    expect(stavPlatbyOstatneho(r)).toBe("nenajdena");
    expect(stavPlatbyOstatneho({ ...r, paid_at: "2026-11-02" })).toBe(null);
  });
  it("odovzdaný: len spárovaná, nie návrh ani nenájdená", () => {
    const o = { ...r, status: "exported" };
    expect(stavPlatbyOstatneho(o)).toBe(null);
    expect(stavPlatbyOstatneho(o, { maNavrh: true })).toBe(null);
    expect(stavPlatbyOstatneho(o, { sparovana: true })).toBe("sparovana");
  });
  it("návrh aj bez lehoty", () => {
    expect(stavPlatbyOstatneho({ ...r, due_date: null }, { maNavrh: true })).toBe("navrh");
    expect(stavPlatbyOstatneho({ ...r, due_date: null })).toBe(null);
  });
});

describe("VS a IBAN z rozpoznania", () => {
  it("upraví VS a IBAN, nezmysly zahodí", () => {
    expect(upravVs("VS: 12 34")).toBe("1234");
    expect(upravVs(987654)).toBe("987654");
    expect(upravVs("12345678901")).toBe(null);
    expect(upravVs(null)).toBe(null);
    expect(upravIban("sk31 8180 0000 0070 0015 5733")).toBe(IBAN_SP);
    expect(upravIban("1234")).toBe(null);
  });
  it("AI čítanie iného dokladu vráti VS a IBAN", () => {
    const r = normalizujRozpoznanie({ kind: "socialna_zdravotna", sender: "SP", variable_symbol: "1234567890", iban: "SK31 8180 0000 0070 0015 5733" });
    expect(r.variable_symbol).toBe("1234567890");
    expect(r.iban).toBe(IBAN_SP);
    expect(normalizujRozpoznanie({}).variable_symbol).toBe(null);
  });
  it("iný doklad z e-mailu berie VS a účet na úhradu zo starých AI polí", () => {
    const o = ostatnyZMailu({
      ai: { document_type: "ostatny", other_kind: "danovy_urad", supplier_name: "DÚ", variable_symbol: "1100123", supplier_iban: IBAN_SP, amount_total: 30 },
      odosielatel: null,
      predmet: null,
      nazovSuboru: "vymer.pdf",
      dnes: "2026-11-05",
    });
    expect(o.variable_symbol).toBe("1100123");
    expect(o.iban).toBe(IBAN_SP);
  });
});
