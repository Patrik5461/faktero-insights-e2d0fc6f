import { describe, it, expect } from "vitest";
import {
  blocekJeUzamknuty,
  formatujDatum,
  jeChybaUzamknutia,
  jeOdomknutie,
  jeUzamknute,
  koniecMesiaca,
  koniecPredoslehoMesiaca,
  koniecPredoslehoRoka,
  koniecPredoslehoStvrtroka,
} from "./uzavierka";

describe("jeUzamknute", () => {
  it("dátum v uzavretom období aj presne v deň zámku", () => {
    expect(jeUzamknute("2026-07-15", "2026-07-31")).toBe(true);
    // Zámok je vrátane: „uzamknuté do 31.7." znamená, že 31. júl sa už nemení.
    expect(jeUzamknute("2026-07-31", "2026-07-31")).toBe(true);
  });

  it("dátum po zámku prechádza", () => {
    expect(jeUzamknute("2026-08-01", "2026-07-31")).toBe(false);
  });

  it("bez zámku nie je uzamknuté nič", () => {
    expect(jeUzamknute("2020-01-01", null)).toBe(false);
    expect(jeUzamknute("2020-01-01", "")).toBe(false);
  });

  it("nezmyselný vstup neuzamkne doklad omylom", () => {
    expect(jeUzamknute(null, "2026-07-31")).toBe(false);
    expect(jeUzamknute("31.7.2026", "2026-07-31")).toBe(false);
  });
});

describe("koniecMesiaca", () => {
  it("mesiace rôznej dĺžky", () => {
    expect(koniecMesiaca(2026, 1)).toBe("2026-01-31");
    expect(koniecMesiaca(2026, 4)).toBe("2026-04-30");
    expect(koniecMesiaca(2026, 12)).toBe("2026-12-31");
  });

  it("február v priestupnom aj nepriestupnom roku", () => {
    expect(koniecMesiaca(2026, 2)).toBe("2026-02-28");
    expect(koniecMesiaca(2028, 2)).toBe("2028-02-29");
  });
});

describe("rýchle voľby", () => {
  it("koniec predošlého mesiaca", () => {
    expect(koniecPredoslehoMesiaca("2026-08-09")).toBe("2026-07-31");
    expect(koniecPredoslehoMesiaca("2026-03-05")).toBe("2026-02-28");
  });

  // Prelom roka je klasické miesto, kde sa dá pomýliť o dvanásť mesiacov.
  it("v januári siaha do predošlého roka", () => {
    expect(koniecPredoslehoMesiaca("2026-01-20")).toBe("2025-12-31");
    expect(koniecPredoslehoStvrtroka("2026-02-10")).toBe("2025-12-31");
  });

  it("koniec predošlého štvrťroka", () => {
    expect(koniecPredoslehoStvrtroka("2026-08-09")).toBe("2026-06-30");
    expect(koniecPredoslehoStvrtroka("2026-04-01")).toBe("2026-03-31");
    expect(koniecPredoslehoStvrtroka("2026-12-31")).toBe("2026-09-30");
  });

  it("koniec predošlého roka", () => {
    expect(koniecPredoslehoRoka("2026-08-09")).toBe("2025-12-31");
  });
});

describe("jeOdomknutie", () => {
  it("posun dozadu aj úplné zrušenie zámku", () => {
    expect(jeOdomknutie("2026-07-31", "2026-06-30")).toBe(true);
    expect(jeOdomknutie("2026-07-31", null)).toBe(true);
  });

  it("posun dopredu je bežné uzatváranie, nie odomknutie", () => {
    expect(jeOdomknutie("2026-06-30", "2026-07-31")).toBe(false);
    expect(jeOdomknutie(null, "2026-07-31")).toBe(false);
  });
});

describe("formatujDatum", () => {
  it("slovenský tvar a prázdna hodnota", () => {
    expect(formatujDatum("2026-07-31")).toBe("31.07.2026");
    expect(formatujDatum(null)).toBe("—");
  });
});

describe("bločky v uzavretom období", () => {
  it("spracovaný bloček s dátumom do zámku je uzamknutý", () => {
    expect(blocekJeUzamknuty({ status: "processed", issue_date: "2026-09-30" }, "2026-09-30")).toBe(
      true,
    );
    expect(blocekJeUzamknuty({ status: "exported", issue_date: "2026-08-01" }, "2026-09-30")).toBe(
      true,
    );
    expect(blocekJeUzamknuty({ status: "processed", issue_date: "2026-10-01" }, "2026-09-30")).toBe(
      false,
    );
  });
  it("nespracovaný bloček zámok nedrží (ešte nie je v účtovníctve)", () => {
    expect(blocekJeUzamknuty({ status: "new", issue_date: "2026-09-01" }, "2026-09-30")).toBe(
      false,
    );
    expect(blocekJeUzamknuty(null, "2026-09-30")).toBe(false);
  });
  it("chybu spúšťača spozná z textu aj z objektu chyby", () => {
    const sprava =
      "Obdobie je uzamknuté do 30.09.2026. Doklad z uzavretého obdobia sa už nedá meniť ani mazať.";
    expect(jeChybaUzamknutia(sprava)).toBe(true);
    expect(jeChybaUzamknutia(new Error(sprava))).toBe(true);
    expect(jeChybaUzamknutia({ message: "duplicate key" })).toBe(false);
    expect(jeChybaUzamknutia(null)).toBe(false);
  });
});
