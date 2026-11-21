import { describe, expect, it, vi } from "vitest";
import {
  nacitajKodPartnera,
  odlozKodPartnera,
  uplatniKodPartnera,
  zmazKodPartnera,
} from "@/lib/faktero/partner-odkaz";
import { PARTNER_KOD_KEY } from "@/lib/faktero/partner-program";

function pamat() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("partner-odkaz", () => {
  it("odloží normalizovaný kód a neplatný ignoruje", () => {
    const u = pamat();
    expect(odlozKodPartnera(" ab12cd ", u)).toBe("AB12CD");
    expect(u.m.get(PARTNER_KOD_KEY)).toBe("AB12CD");
    expect(odlozKodPartnera("x", u)).toBeNull();
    expect(nacitajKodPartnera(u)).toBe("AB12CD");
    zmazKodPartnera(u);
    expect(nacitajKodPartnera(u)).toBeNull();
  });

  it("bez úložiska nič nerobí a nepadá", () => {
    expect(odlozKodPartnera("AB12CD", null)).toBeNull();
    expect(nacitajKodPartnera(null)).toBeNull();
    expect(() => zmazKodPartnera(null)).not.toThrow();
    const zly = {
      getItem: () => {
        throw new Error("zakázané");
      },
      setItem: () => {
        throw new Error("zakázané");
      },
      removeItem: () => {
        throw new Error("zakázané");
      },
    };
    expect(odlozKodPartnera("AB12CD", zly)).toBeNull();
    expect(nacitajKodPartnera(zly)).toBeNull();
  });

  it("uplatní kód a potom ho zmaže", async () => {
    const u = pamat();
    odlozKodPartnera("AB12CD", u);
    const prirad = vi.fn().mockResolvedValue({ priradene: true });
    expect(await uplatniKodPartnera("firma-1", prirad, u)).toBe(true);
    expect(prirad).toHaveBeenCalledWith({ data: { companyId: "firma-1", kod: "AB12CD" } });
    expect(nacitajKodPartnera(u)).toBeNull();
  });

  it("kód zmaže aj po neúspechu a chybu nepustí ďalej", async () => {
    const u = pamat();
    odlozKodPartnera("AB12CD", u);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const prirad = vi.fn().mockRejectedValue(new Error("sieť"));
    expect(await uplatniKodPartnera("firma-1", prirad, u)).toBe(false);
    expect(nacitajKodPartnera(u)).toBeNull();
  });

  it("bez kódu server nevolá", async () => {
    const prirad = vi.fn();
    expect(await uplatniKodPartnera("firma-1", prirad, pamat())).toBe(false);
    expect(prirad).not.toHaveBeenCalled();
  });
});

describe("typ účtu pri registrácii", () => {
  it("účtovník sa odloží a prečíta raz", async () => {
    const { odlozTypUctu, vezmiTypUctu } = await import("./partner-odkaz");
    const m = new Map<string, string>();
    const u = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    odlozTypUctu("uctovnik", u);
    expect(vezmiTypUctu(u)).toBe("uctovnik");
    expect(vezmiTypUctu(u)).toBeNull();
    odlozTypUctu("uctovnik", u);
    odlozTypUctu("firma", u);
    expect(vezmiTypUctu(u)).toBeNull();
  });
});
