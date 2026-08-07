import { describe, expect, it } from "vitest";
import {
  buildEndToEndId,
  buildPaymentAuthorizeUrl,
  describeStatus,
  formatAmount,
  isValidIban,
  normalizeIban,
  sanitizeCreditorName,
} from "./tatrabanka-payments.server";

describe("normalizeIban / isValidIban", () => {
  it("zbaví IBAN medzier a zjednotí veľkosť písmen", () => {
    expect(normalizeIban(" sk69 1100 0000 0039 6878 1519 ")).toBe("SK6911000000003968781519");
  });

  it("prijme platný IBAN aj s medzerami", () => {
    expect(isValidIban("SK69 1100 0000 0039 6878 1519")).toBe(true);
  });

  it("odmietne IBAN bez kontrolných číslic", () => {
    expect(isValidIban("SKAB11000000003968781519")).toBe(false);
  });

  it("odmietne prázdny reťazec", () => {
    expect(isValidIban("")).toBe(false);
  });

  it("prijme reálne slovenské IBANy z rôznych bánk", () => {
    expect(isValidIban("SK1811000000002619337837")).toBe(true);
    expect(isValidIban("SK6611000000002610267473")).toBe(true);
  });

  it("odmietne IBAN so správnym tvarom, ale zlým kontrolným súčtom", () => {
    // Presne toto banka vracia ako "Invalid IBAN (Creditor IBAN)" —
    // príklad z ich vlastnej dokumentácie, ktorý mod-97 neprejde.
    expect(isValidIban("SK6909000000001234567890")).toBe(false);
  });

  it("odmietne preklep v jednej číslici", () => {
    expect(isValidIban("SK1811000000002619337838")).toBe(false);
  });
});

describe("sanitizeCreditorName", () => {
  it("nahradí znaky, ktoré banka pri SEPA nepovolí", () => {
    expect(sanitizeCreditorName("a~b^c`d|e")).toBe("a-b.c'd/e");
  });

  it("nechá bežné meno na pokoji", () => {
    expect(sanitizeCreditorName("Dodávateľ s.r.o.")).toBe("Dodávateľ s.r.o.");
  });

  it("oreže na 70 znakov", () => {
    expect(sanitizeCreditorName("x".repeat(100))).toHaveLength(70);
  });
});

describe("formatAmount", () => {
  it("používa bodku a dve desatinné miesta", () => {
    expect(formatAmount(1)).toBe("1.00");
    expect(formatAmount(123.456)).toBe("123.46");
  });

  it("odmietne nulu aj zápornú sumu", () => {
    expect(() => formatAmount(0)).toThrow();
    expect(() => formatAmount(-5)).toThrow();
  });
});

describe("buildEndToEndId", () => {
  it("poskladá symboly v tvare, aký banka číta", () => {
    expect(buildEndToEndId("1234567890", "1234567890", "0308")).toBe(
      "/VS1234567890/SS1234567890/KS0308",
    );
  });

  it("vynechá symboly, ktoré neboli zadané", () => {
    expect(buildEndToEndId("20260112", null, null)).toBe("/VS20260112");
  });

  it("vráti prázdny reťazec, keď nie je čo poslať", () => {
    expect(buildEndToEndId(null, null, null)).toBe("");
  });

  it("ignoruje nečíselné znaky v symboloch", () => {
    expect(buildEndToEndId("VS-2026/0112", null, null)).toBe("/VS20260112");
  });

  it("nikdy neprekročí 35 znakov, radšej zahodí menej dôležitý symbol", () => {
    const out = buildEndToEndId("1".repeat(20), "2".repeat(20), "0308");
    expect(out.length).toBeLessThanOrEqual(35);
    expect(out).toBe(`/VS${"1".repeat(20)}`);
  });
});

describe("buildPaymentAuthorizeUrl", () => {
  const base = {
    authorizationId: "b3b79c28-67c3-4abe-82a1-0a20c9d0fe39",
    state: "state-123",
    redirectUri: "https://faktero.sk/api/public/tatrabanka/payment-callback",
    codeChallenge: "challenge",
  };

  it("dá authorizationId do scope, nie paymentId", () => {
    const url = new URL(buildPaymentAuthorizeUrl(base));
    expect(url.searchParams.get("scope")).toBe(`PREMIUM_PIS:${base.authorizationId}`);
  });

  it("posiela PKCE metódu S256", () => {
    const url = new URL(buildPaymentAuthorizeUrl(base));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("pri rušení platby použije scope PREMIUM_PIS_CANC", () => {
    const url = new URL(buildPaymentAuthorizeUrl({ ...base, cancel: true }));
    expect(url.searchParams.get("scope")).toBe(`PREMIUM_PIS_CANC:${base.authorizationId}`);
  });
});

describe("describeStatus", () => {
  it("preloží stavy banky do ľudskej reči", () => {
    expect(describeStatus("ACTC")).toBe("Pripravená na podpis");
    expect(describeStatus("ACSC")).toBe("Zaplatená");
    expect(describeStatus("RJCT")).toBe("Zamietnutá bankou");
  });

  it("neznámy stav vráti tak, ako prišiel", () => {
    expect(describeStatus("XYZ1")).toBe("XYZ1");
    expect(describeStatus(null)).toBe("—");
  });
});
