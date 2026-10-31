import { describe, expect, it } from "vitest";
import {
  dovodChyby,
  prejdeFiltromEfaktury,
  stavEfaktury,
  stavEfakturyZVyberu,
  STLPCE_DORUCENIA,
  VYBER_EFAKTURY_K_FAKTURE,
  type RiadokDorucenia,
} from "./stav-efaktury";

const r = (o: Partial<RiadokDorucenia>): RiadokDorucenia => ({
  status: "sent",
  channel: "peppol",
  sent_at: "2026-10-30T10:00:00Z",
  delivered_at: null,
  created_at: "2026-10-30T10:00:00Z",
  updated_at: "2026-10-30T10:00:00Z",
  error_code: null,
  error_message: null,
  zlyhanie: null,
  odpoved: null,
  ...o,
});

describe("stav eFaktúry z doručení", () => {
  it("bez doručenia nie je stav", () => {
    expect(stavEfaktury([])).toBeNull();
    expect(stavEfaktury(null)).toBeNull();
    expect(stavEfakturyZVyberu(null)).toBeNull();
    expect(stavEfakturyZVyberu([])).toBeNull();
    expect(stavEfakturyZVyberu({ efaktura_deliveries: [] })).toBeNull();
  });

  it("odoslaná, doručená s časom a kanálom", () => {
    expect(stavEfaktury([r({})])).toMatchObject({
      stav: "odoslana",
      kedy: "2026-10-30T10:00:00Z",
      kanal: "peppol",
      pokusov: 1,
    });
    const d = stavEfaktury([r({ status: "delivered", delivered_at: "2026-10-30T10:00:05Z" })]);
    expect(d).toMatchObject({ stav: "dorucena", kedy: "2026-10-30T10:00:05Z" });
  });

  it("`accepted` od ePoštáka je prevzatie, nie prijatie odberateľom", () => {
    expect(stavEfaktury([r({ status: "accepted" })])?.stav).toBe("odoslana");
    expect(stavEfaktury([r({ status: "pending" })])?.stav).toBe("odoslana");
  });

  it("odpoveď odberateľa: prijatá, zamietnutá, otázka", () => {
    expect(stavEfaktury([r({ status: "delivered", odpoved: "AP" })])?.stav).toBe("prijata");
    expect(stavEfaktury([r({ status: "delivered", odpoved: "PD" })])).toMatchObject({
      stav: "prijata",
      odpoved: "zaplatena",
    });
    expect(stavEfaktury([r({ status: "delivered", odpoved: "RE" })])?.stav).toBe("zamietnuta");
    expect(stavEfaktury([r({ status: "delivered", odpoved: "UQ" })])).toMatchObject({
      stav: "dorucena",
      odpoved: "otazka",
    });
  });

  it("rozhoduje posledné doručenie (podľa času, nie poradia)", () => {
    const s = stavEfaktury([
      r({ status: "delivered", created_at: "2026-10-30T12:00:00Z" }),
      r({ status: "failed", created_at: "2026-10-30T09:00:00Z", error_code: "500" }),
    ]);
    expect(s).toMatchObject({ stav: "dorucena", pokusov: 2 });
  });

  it("deliveryFailure prebije stav, ktorý sa tvári ako odoslaný", () => {
    const s = stavEfaktury([
      r({
        status: "pending",
        zlyhanie: {
          code: "participant_not_found",
          message: "Recipient not found",
          errorCode: "PEPPOL_RECIPIENT_NOT_REGISTERED",
          detail: null,
        },
      }),
    ]);
    expect(s).toMatchObject({ stav: "zlyhala", dovod: "nie_v_peppole" });
  });

  it("technické odmietnutie je chyba, nie zamietnutie odberateľom", () => {
    expect(stavEfaktury([r({ status: "rejected" })])).toMatchObject({
      stav: "zlyhala",
      dovod: "odmietnuta_technicky",
    });
  });
});

describe("dôvod chyby ľudskou rečou", () => {
  it("kódy ePoštáka", () => {
    for (const [kod, dovod] of [
      ["document_type_not_accepted", "typ_neprijima"],
      ["validation_failed", "validacia"],
      ["rejected_by_receiver", "odmietnuta_technicky"],
      ["receiver_lookup_unavailable", "adresar_nedostupny"],
      ["transport_failed", "doprava_zlyhala"],
    ] as const) {
      expect(dovodChyby(r({ status: "failed", zlyhanie: { code: kod } })).dovod).toBe(dovod);
    }
  });

  it("chyby z nášho servera", () => {
    expect(dovodChyby(r({ status: "failed", error_code: "missing_firm_id" })).dovod).toBe(
      "bez_efaktury",
    );
    expect(
      dovodChyby(
        r({
          status: "failed",
          error_code: "409",
          error_message:
            "ePošták už má odoslanú faktúru s týmto číslom. Odoslanú faktúru nemožno poslať znova…",
        }),
      ).dovod,
    ).toBe("duplicitne_cislo");
    expect(dovodChyby(r({ status: "failed", error_code: "503" })).dovod).toBe("sluzba_nedostupna");
    expect(dovodChyby(r({ status: "failed", error_code: "401" })).dovod).toBe("bez_efaktury");
  });

  it("neznámu chybu nezahodí — text ostane ako podrobnosť", () => {
    expect(dovodChyby(r({ status: "failed", error_message: "Niečo iné" }))).toEqual({
      dovod: "neznamy",
      detail: "Niečo iné",
    });
  });
});

describe("filter a výber", () => {
  it("odoslané vs. chyba", () => {
    const ok = stavEfaktury([r({ status: "delivered" })]);
    const zle = stavEfaktury([r({ status: "failed" })]);
    const zam = stavEfaktury([r({ odpoved: "RE" })]);
    expect(prejdeFiltromEfaktury(ok, "odoslane")).toBe(true);
    expect(prejdeFiltromEfaktury(ok, "chyba")).toBe(false);
    expect(prejdeFiltromEfaktury(zle, "chyba")).toBe(true);
    expect(prejdeFiltromEfaktury(zam, "chyba")).toBe(true);
    expect(prejdeFiltromEfaktury(null, "odoslane")).toBe(false);
  });

  it("vnorený výber neťahá celé raw_response", () => {
    expect(STLPCE_DORUCENIA).not.toMatch(/raw_response(,|$)/);
    expect(VYBER_EFAKTURY_K_FAKTURE).toMatch(/^efaktura_documents\(efaktura_deliveries\(/);
  });

  it("dokument ako objekt aj ako pole", () => {
    const d = { efaktura_deliveries: [r({ status: "delivered" })] };
    expect(stavEfakturyZVyberu(d)?.stav).toBe("dorucena");
    expect(stavEfakturyZVyberu([d])?.stav).toBe("dorucena");
  });
});
