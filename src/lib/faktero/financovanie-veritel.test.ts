import { describe, expect, it } from "vitest";
import { doplnZRegistra, normalizujVeritela, normNazovFirmy } from "./financovanie-veritel";
import { normalizujOdpoved, spojPrecitane } from "./financovanie-citanie";

describe("veriteľ zmluvy", () => {
  it("uprace IČO, DIČ, IČ DPH a krajinu", () => {
    expect(
      normalizujVeritela({
        provider_ico: "35 704 713",
        provider_dic: "SK2020264818",
        provider_ic_dph: null,
        provider_street: "  Žižkova  11 ",
        provider_city: "Bratislava",
        provider_zip: "815 10",
        provider_country: "Slovensko",
      }),
    ).toEqual({
      provider_ico: "35704713",
      provider_dic: "2020264818",
      provider_ic_dph: "SK2020264818",
      provider_street: "Žižkova 11",
      provider_city: "Bratislava",
      provider_zip: "815 10",
      provider_country: "SK",
    });
    expect(normalizujVeritela({ provider_ico: "123456" }).provider_ico).toBe("00123456");
  });

  it("register dopĺňa len prázdne polia", () => {
    const v = normalizujVeritela({ provider_ico: "35704713", provider_street: "Ručne 1" });
    const d = doplnZRegistra(v, {
      ico: "35704713",
      dic: "2020264818",
      ic_dph: "SK2020264818",
      street: "Žižkova 11",
      city: "Bratislava",
      zip: "81510",
      country: "SK",
    });
    expect(d.provider_street).toBe("Ručne 1");
    expect(d.provider_ic_dph).toBe("SK2020264818");
    expect(d.provider_zip).toBe("81510");
  });

  it("porovnanie názvov bez právnej formy a diakritiky", () => {
    expect(normNazovFirmy("ČSOB Leasing, a.s.")).toBe(normNazovFirmy("CSOB Leasing a. s."));
  });

  it("prečítaná zmluva nesie veriteľa a spojenie dokumentov ho doplní z druhého", () => {
    const a = normalizujOdpoved({ kind: "leasing", provider_name: "ČSOB Leasing, a.s.", principal: 1000 });
    const b = normalizujOdpoved({
      kind: "leasing",
      provider_ico: "35704713",
      provider_ic_dph: "sk 2020264818",
      splatky: [],
    });
    expect(a.provider_ico).toBeNull();
    const s = spojPrecitane([a, b]);
    expect(s.provider_ico).toBe("35704713");
    expect(s.provider_ic_dph).toBe("SK2020264818");
    expect(s.provider_name).toBe("ČSOB Leasing, a.s.");
  });
});
