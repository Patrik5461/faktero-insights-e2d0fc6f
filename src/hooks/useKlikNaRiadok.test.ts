import { describe, expect, it, vi } from "vitest";
import {
  NEOTVARAT_SELEKTOR,
  propsKlikuNaRiadok,
  rozhodniKlaves,
  rozhodniKlik,
  type RouterPreRiadok,
  type VyberTextu,
} from "./useKlikNaRiadok";

/* eslint-disable @typescript-eslint/no-explicit-any -- falošné udalosti a cieľ routera */
/**
 * Testy bežia bez prehliadača — strom prvkov si postavíme sami. `closest`
 * rozumie len zoznamu z NEOTVARAT_SELEKTOR (tag alebo [atribút=hodnota]).
 */
class Uzol {
  parentElement: Uzol | null = null;
  constructor(
    public tag: string,
    public attrs: Record<string, string> = {},
  ) {}
  pridaj(d: Uzol) {
    d.parentElement = this;
    return d;
  }
  private sedi(sel: string) {
    const m = sel.match(/^\[([\w-]+)(?:=([\w-]+))?\]$/);
    if (m) return m[1] in this.attrs && (m[2] === undefined || this.attrs[m[1]] === m[2]);
    return this.tag === sel;
  }
  closest(selektor: string): Uzol | null {
    const casti = selektor.split(",");
    if (casti.some((s) => this.sedi(s))) return this;
    return this.parentElement ? this.parentElement.closest(selektor) : null;
  }
  contains(n: unknown): boolean {
    for (let u = n as Uzol | null; u; u = u.parentElement) if (u === this) return true;
    return false;
  }
}

function strom() {
  const tabulka = new Uzol("table");
  const riadok = tabulka.pridaj(new Uzol("tr"));
  const bunka = riadok.pridaj(new Uzol("td"));
  const text = bunka.pridaj(new Uzol("span"));
  const bunkaVyber = riadok.pridaj(new Uzol("td"));
  const checkbox = bunkaVyber.pridaj(new Uzol("input", { type: "checkbox" }));
  const bunkaAkcie = riadok.pridaj(new Uzol("td"));
  const tlacidlo = bunkaAkcie.pridaj(new Uzol("button"));
  const ikona = tlacidlo.pridaj(new Uzol("svg"));
  const odkaz = bunka.pridaj(new Uzol("a"));
  const stitok = bunka.pridaj(new Uzol("span", { role: "button" }));
  const radixCheckbox = bunkaVyber.pridaj(new Uzol("button", { role: "checkbox" }));
  const vlastne = bunka.pridaj(new Uzol("div", { "data-neotvarat": "" }));
  const vlastneVnutri = vlastne.pridaj(new Uzol("span"));
  // Obsah portálu (dialóg/menu z riadku) — v Reacte prebuble, v DOM nie je v riadku.
  const portal = new Uzol("div", { role: "dialog" }).pridaj(new Uzol("p"));
  return {
    riadok,
    bunka,
    text,
    checkbox,
    tlacidlo,
    ikona,
    odkaz,
    stitok,
    radixCheckbox,
    vlastneVnutri,
    portal,
  };
}

const klik = (
  target: unknown,
  currentTarget: unknown,
  o: Partial<{
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }> = {},
) => ({
  target: target as EventTarget,
  currentTarget: currentTarget as EventTarget,
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...o,
});

const bezVyberu: VyberTextu = { isCollapsed: true, anchorNode: null, toString: () => "" };

describe("rozhodniKlik", () => {
  it("klik na bunku alebo text v nej otvorí detail", () => {
    const s = strom();
    expect(rozhodniKlik(klik(s.bunka, s.riadok), bezVyberu)).toBe("otvor");
    expect(rozhodniKlik(klik(s.text, s.riadok), bezVyberu)).toBe("otvor");
    expect(rozhodniKlik(klik(s.riadok, s.riadok), bezVyberu)).toBe("otvor");
  });

  it("klik na zaškrtávadlo, tlačidlo, ikonu v tlačidle, odkaz, štítok → nič", () => {
    const s = strom();
    for (const t of [
      s.checkbox,
      s.tlacidlo,
      s.ikona,
      s.odkaz,
      s.stitok,
      s.radixCheckbox,
      s.vlastneVnutri,
    ]) {
      expect(rozhodniKlik(klik(t, s.riadok), bezVyberu)).toBe("nic");
    }
  });

  it("klik prebublaný z portálu (dialóg/menu z riadku) → nič", () => {
    const s = strom();
    expect(rozhodniKlik(klik(s.portal, s.riadok), bezVyberu)).toBe("nic");
  });

  it("Ctrl/Cmd/Shift + klik a stredné tlačidlo → nová karta", () => {
    const s = strom();
    expect(rozhodniKlik(klik(s.bunka, s.riadok, { ctrlKey: true }), bezVyberu)).toBe("novaKarta");
    expect(rozhodniKlik(klik(s.bunka, s.riadok, { metaKey: true }), bezVyberu)).toBe("novaKarta");
    expect(rozhodniKlik(klik(s.bunka, s.riadok, { shiftKey: true }), bezVyberu)).toBe("novaKarta");
    expect(rozhodniKlik(klik(s.bunka, s.riadok, { button: 1 }), bezVyberu)).toBe("novaKarta");
  });

  it("Ctrl+klik na tlačidlo novú kartu neotvorí, pravé tlačidlo nič", () => {
    const s = strom();
    expect(rozhodniKlik(klik(s.tlacidlo, s.riadok, { ctrlKey: true }), bezVyberu)).toBe("nic");
    expect(rozhodniKlik(klik(s.bunka, s.riadok, { button: 2 }), bezVyberu)).toBe("nic");
  });

  it("označený text v riadku → nič; výber inde nevadí", () => {
    const s = strom();
    const vRiadku: VyberTextu = {
      isCollapsed: false,
      anchorNode: s.text,
      toString: () => "FA-2026",
    };
    expect(rozhodniKlik(klik(s.bunka, s.riadok), vRiadku)).toBe("nic");
    const inde: VyberTextu = {
      isCollapsed: false,
      anchorNode: s.portal,
      focusNode: s.portal,
      toString: () => "x",
    };
    expect(rozhodniKlik(klik(s.bunka, s.riadok), inde)).toBe("otvor");
    const lenMedzery: VyberTextu = { isCollapsed: false, anchorNode: s.text, toString: () => "  " };
    expect(rozhodniKlik(klik(s.bunka, s.riadok), lenMedzery)).toBe("otvor");
  });

  it("selektor obsahuje dohodnuté prvky", () => {
    for (const s of [
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "label",
      "[role=button]",
      "[role=checkbox]",
      "[data-neotvarat]",
    ]) {
      expect(NEOTVARAT_SELEKTOR.split(",")).toContain(s);
    }
  });
});

describe("rozhodniKlaves", () => {
  const k = (
    key: string,
    target: unknown,
    currentTarget: unknown,
    o: Partial<{ ctrlKey: boolean; metaKey: boolean }> = {},
  ) => ({
    key,
    target: target as EventTarget,
    currentTarget: currentTarget as EventTarget,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...o,
  });

  it("Enter a medzerník na zameranom riadku otvorí detail", () => {
    const s = strom();
    expect(rozhodniKlaves(k("Enter", s.riadok, s.riadok))).toBe("otvor");
    expect(rozhodniKlaves(k(" ", s.riadok, s.riadok))).toBe("otvor");
    expect(rozhodniKlaves(k("Enter", s.riadok, s.riadok, { ctrlKey: true }))).toBe("novaKarta");
  });

  it("Enter v tlačidle/vstupe v riadku a iné klávesy → nič", () => {
    const s = strom();
    expect(rozhodniKlaves(k("Enter", s.tlacidlo, s.riadok))).toBe("nic");
    expect(rozhodniKlaves(k(" ", s.checkbox, s.riadok))).toBe("nic");
    expect(rozhodniKlaves(k("a", s.riadok, s.riadok))).toBe("nic");
  });
});

describe("propsKlikuNaRiadok", () => {
  function priprav(moznosti = {}) {
    const router: RouterPreRiadok = {
      navigate: vi.fn(),
      buildLocation: vi.fn(() => ({ href: "/faktury/1", publicHref: "/faktury/1" })),
    };
    const otvorOkno = vi.fn();
    const ciel = { to: "/faktury/$id", params: { id: "1" } } as any;
    const p = propsKlikuNaRiadok(router, ciel, moznosti, { vyber: () => bezVyberu, otvorOkno });
    return { router, otvorOkno, ciel, p };
  }
  const udalost = (target: unknown, riadok: unknown, o: Record<string, unknown> = {}) =>
    ({ ...klik(target, riadok), preventDefault: vi.fn(), ...o }) as any;

  it("klik na bunku naviguje routerom na cieľ", () => {
    const s = strom();
    const { router, ciel, p } = priprav();
    p.onClick!(udalost(s.bunka, s.riadok));
    expect(router.navigate).toHaveBeenCalledWith(ciel);
  });

  it("klik na tlačidlo a zaškrtávadlo nenaviguje", () => {
    const s = strom();
    const { router, otvorOkno, p } = priprav();
    p.onClick!(udalost(s.tlacidlo, s.riadok));
    p.onClick!(udalost(s.checkbox, s.riadok));
    expect(router.navigate).not.toHaveBeenCalled();
    expect(otvorOkno).not.toHaveBeenCalled();
  });

  it("Ctrl+klik a stredné tlačidlo otvoria novú kartu s adresou detailu", () => {
    const s = strom();
    const { router, otvorOkno, p } = priprav();
    p.onClick!(udalost(s.bunka, s.riadok, { ctrlKey: true }));
    const stredne = udalost(s.bunka, s.riadok, { button: 1 });
    p.onAuxClick!(stredne);
    expect(otvorOkno).toHaveBeenCalledTimes(2);
    expect(otvorOkno).toHaveBeenCalledWith("/faktury/1");
    expect(stredne.preventDefault).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("označený text detail neotvorí", () => {
    const s = strom();
    const router: RouterPreRiadok = {
      navigate: vi.fn(),
      buildLocation: vi.fn(() => ({ href: "/x" })),
    };
    const p = propsKlikuNaRiadok(
      router,
      { to: "/faktury" } as any,
      {},
      {
        vyber: () => ({ isCollapsed: false, anchorNode: s.text, toString: () => "FA-1" }),
        otvorOkno: vi.fn(),
      },
    );
    p.onClick!(udalost(s.bunka, s.riadok));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("Enter na riadku naviguje, medzerník zastaví posun stránky", () => {
    const s = strom();
    const { router, p } = priprav();
    expect(p.tabIndex).toBe(0);
    const e = { ...udalost(s.riadok, s.riadok), key: " " };
    p.onKeyDown!(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it("naKlik nahradí navigáciu, nová karta ide stále na cieľ", () => {
    const s = strom();
    const naKlik = vi.fn();
    const { router, otvorOkno, p } = priprav({ naKlik });
    p.onClick!(udalost(s.bunka, s.riadok));
    expect(naKlik).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    p.onClick!(udalost(s.bunka, s.riadok, { metaKey: true }));
    expect(otvorOkno).toHaveBeenCalledWith("/faktury/1");
  });

  it("bez cieľa aj bez naKlik, alebo vypnuté → žiadne props", () => {
    const router: RouterPreRiadok = {
      navigate: vi.fn(),
      buildLocation: vi.fn(() => ({ href: "" })),
    };
    expect(propsKlikuNaRiadok(router, null)).toEqual({});
    expect(propsKlikuNaRiadok(router, { to: "/faktury" } as any, { vypnute: true })).toEqual({});
  });

  it("klavesnica: false → bez tabIndex a bez onKeyDown", () => {
    const { p } = priprav({ klavesnica: false });
    expect(p.tabIndex).toBeUndefined();
    expect(p.onKeyDown).toBeUndefined();
  });
});
