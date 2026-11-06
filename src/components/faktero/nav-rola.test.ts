/*
  Menu podľa roly a krajiny — jedno pravidlo pre lištu, rýchle „Vytvoriť“
  a ponuku pod avatarom (B4: S-14, S-19, AB-08, B-15, E-19).
*/
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_API_LINKS,
  ACCOUNT_SETTINGS_LINKS,
  aktivnaVListe,
  filterNav,
  filtrujPolozky,
  NAV,
  QUICK_CREATE,
} from "./nav";
import { jeAdminRola } from "@/lib/faktero/opravnenia";

const cesty = (p: { to: string }[]) => p.map((c) => c.to);

describe("ponuka pod avatarom (S-14)", () => {
  it("API kľúče, webhooky, playground a zálohy len majiteľovi a adminovi", () => {
    const zamestnanec = { isCompanyAdmin: false, rola: "employee" };
    const api = cesty(filtrujPolozky(ACCOUNT_API_LINKS, zamestnanec));
    expect(api).not.toContain("/api-kluce");
    expect(api).not.toContain("/webhooky");
    expect(api).not.toContain("/webhooky-logy");
    expect(api).not.toContain("/api-playground");
    expect(api).toContain("/api-dokumentacia");
    const nast = cesty(filtrujPolozky(ACCOUNT_SETTINGS_LINKS, zamestnanec));
    expect(nast).not.toContain("/nastavenia/zalohy");
    expect(nast).not.toContain("/nastavenia/vzhlad-faktury");
    // Firma ostáva — ne-admin ju vidí len na čítanie (S-13).
    expect(nast).toContain("/firma");
    expect(nast).toContain("/nastavenia/zabezpecenie");

    const majitel = { isCompanyAdmin: true, rola: "owner" };
    expect(filtrujPolozky(ACCOUNT_API_LINKS, majitel)).toHaveLength(ACCOUNT_API_LINKS.length);
    expect(filtrujPolozky(ACCOUNT_SETTINGS_LINKS, majitel)).toHaveLength(
      ACCOUNT_SETTINGS_LINKS.length,
    );
  });

  it("účtovník vidí v ponuke to isté ako admin (od 2026-11-02)", () => {
    const uctovnik = { isCompanyAdmin: jeAdminRola("accountant"), rola: "accountant" };
    expect(filtrujPolozky(ACCOUNT_API_LINKS, uctovnik)).toHaveLength(ACCOUNT_API_LINKS.length);
    expect(filtrujPolozky(ACCOUNT_SETTINGS_LINKS, uctovnik)).toHaveLength(
      ACCOUNT_SETTINGS_LINKS.length,
    );
    expect(jeAdminRola("employee")).toBe(false);
  });

  it("číselné rady vlastnému prístupu bez faktúr nie", () => {
    const bezFaktur = { isCompanyAdmin: false, rola: "custom", opravnenia: { doklady: "edit" } };
    expect(cesty(filtrujPolozky(ACCOUNT_SETTINGS_LINKS, bezFaktur))).not.toContain("/ciselne-rady");
    const sFakturami = { isCompanyAdmin: false, rola: "custom", opravnenia: { faktury: "read" } };
    expect(cesty(filtrujPolozky(ACCOUNT_SETTINGS_LINKS, sFakturami))).toContain("/ciselne-rady");
  });
});

describe("rýchle Vytvoriť (S-19)", () => {
  it("vlastný prístup vidí len agendy, ku ktorým má právo", () => {
    const len = cesty(
      filtrujPolozky(QUICK_CREATE, {
        isCompanyAdmin: false,
        rola: "custom",
        opravnenia: { doklady: "edit" },
      }),
    );
    expect(len).toEqual(["/prijate-faktury/samofaktura"]);
    const faktury = cesty(
      filtrujPolozky(QUICK_CREATE, {
        isCompanyAdmin: false,
        rola: "custom",
        opravnenia: { faktury: "edit" },
      }),
    );
    expect(faktury).toContain("/faktury/nova");
    // Kontakty idú s faktúrami, sklad nie.
    expect(faktury).toContain("/odberatelia");
    expect(faktury).not.toContain("/produkty");
  });

  it("účtovník a zamestnanec vidia všetko", () => {
    for (const rola of ["accountant", "employee"])
      expect(filtrujPolozky(QUICK_CREATE, { isCompanyAdmin: false, rola })).toHaveLength(
        QUICK_CREATE.length,
      );
  });
});

describe("aktívna položka lišty (AB-08)", () => {
  const nav = filterNav("invoicing", true);
  it("Doklady → Vystavené faktúry svieti v Dokladoch", () => {
    const a = aktivnaVListe(nav, "/faktury", {});
    expect(a.skupina?.key).toBe("doklady");
    expect(a.polozka).toBe("/faktury" + "Vystavené faktúry");
  });
  it("Fakturácia s parametrom ostáva vo Fakturácii", () => {
    const a = aktivnaVListe(nav, "/faktury", { type: "credit" });
    expect(a.skupina?.key).toBe("fakturacia");
    expect(a.polozka).toBe("/faktury" + "Dobropisy");
  });
  it("podstránka bez položky svieti podľa predpony", () => {
    expect(aktivnaVListe(nav, "/faktury/nova", {}).skupina?.key).toBe("fakturacia");
    expect(aktivnaVListe(nav, "/neexistuje", {}).skupina).toBeNull();
  });
});

describe("názvy podľa krajiny (B-15, E-19)", () => {
  it("výkazy k DPH", () => {
    const vykazy = (k: "SK" | "CZ" | "DE") =>
      filterNav("invoicing", true, k)
        .flatMap((g) => g.children)
        .find((c) => c.to === "/uctovnictvo/vykazy")?.label;
    // Názov = nadpis stránky; tlačivá podľa krajiny sú až na nej (B-15).
    for (const k of ["SK", "CZ", "DE"] as const) expect(vykazy(k)).toBe("Výkazy k DPH");
    expect(vykazy("CZ")).not.toContain("KV");
  });

  it("konvertory majú v menu ten istý názov ako stránka", () => {
    const c = NAV.flatMap((g) => g.children).find((x) => x.to === "/uctovnictvo/konvertory");
    expect(c?.label).toBe("Konvertory");
  });
});
