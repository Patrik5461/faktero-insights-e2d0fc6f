import { describe, expect, it } from "vitest";
import { cielObsahu, preskocNaObsah } from "./preskocit-na-obsah";

/** Prvok, ktorý si pamätá atribúty a či dostal fokus. */
function prvok(meno: string, atributy: Record<string, string> = {}) {
  return {
    meno,
    atributy,
    fokus: false,
    hasAttribute: (a: string) => a in atributy,
    setAttribute: (a: string, h: string) => {
      atributy[a] = h;
    },
    focus() {
      this.fokus = true;
    },
  };
}

function dokument(p: { obsah?: any; main?: any; h1?: any }) {
  return {
    getElementById: (id: string) => (id === "obsah" ? (p.obsah ?? null) : null),
    querySelector: (s: string) =>
      s.startsWith("main") ? (p.main ?? null) : s === "h1" ? (p.h1 ?? null) : null,
  };
}

describe("preskočiť na obsah", () => {
  it("prednosť má prvok s id obsah, potom main, nakoniec h1", () => {
    const obsah = prvok("obsah");
    const main = prvok("main");
    const h1 = prvok("h1");
    expect(cielObsahu(dokument({ obsah, main, h1 }))?.meno).toBe("obsah");
    expect(cielObsahu(dokument({ main, h1 }))?.meno).toBe("main");
    expect(cielObsahu(dokument({ h1 }))?.meno).toBe("h1");
    expect(cielObsahu(dokument({}))).toBeNull();
  });

  it("cieľ bez tabindex dostane -1 a fokus", () => {
    const main = prvok("main");
    expect(preskocNaObsah(dokument({ main }))).toBe(true);
    expect(main.atributy.tabindex).toBe("-1");
    expect(main.fokus).toBe(true);
  });

  it("existujúci tabindex neprepíše", () => {
    const obsah = prvok("obsah", { tabindex: "0" });
    preskocNaObsah(dokument({ obsah }));
    expect(obsah.atributy.tabindex).toBe("0");
  });

  it("bez cieľa nič nerobí (odkaz ostane obyčajnou kotvou)", () => {
    expect(preskocNaObsah(dokument({}))).toBe(false);
  });
});
