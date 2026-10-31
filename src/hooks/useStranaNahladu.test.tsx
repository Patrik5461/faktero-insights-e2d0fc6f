import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  updateUser: vi.fn(async (_: unknown) => ({ data: {}, error: null })),
  getUser: vi.fn(async () => ({
    data: { user: { user_metadata: {} as Record<string, unknown> } },
  })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

import {
  KLUC_STRANY,
  UDALOST_STRANY,
  _resetZosuladenia,
  nacitajStranu,
  normalizujStranu,
  odoberajStranu,
  opacnaStrana,
  ulozStranu,
  useStranaNahladu,
  zosuladStranuSUctom,
} from "./useStranaNahladu";
import { RozlozenieSNahladom } from "@/components/faktero/RozlozenieSNahladom";
import { JazykProvider } from "@/lib/i18n/useT";

/** Testy bežia bez prehliadača — okno s úložiskom a udalosťami si spravíme sami. */
function falosneOkno(ulozisko: Map<string, string> | "chyba" = new Map()) {
  const ciel = new EventTarget();
  const localStorage = {
    getItem: (k: string) => {
      if (ulozisko === "chyba") throw new Error("SecurityError");
      return ulozisko.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (ulozisko === "chyba") throw new Error("SecurityError");
      ulozisko.set(k, v);
    },
  };
  vi.stubGlobal("window", {
    localStorage,
    addEventListener: ciel.addEventListener.bind(ciel),
    removeEventListener: ciel.removeEventListener.bind(ciel),
    dispatchEvent: ciel.dispatchEvent.bind(ciel),
  });
  return ulozisko as Map<string, string>;
}

beforeEach(() => {
  auth.updateUser.mockClear();
  auth.getUser.mockClear();
  _resetZosuladenia();
});
afterEach(() => vi.unstubAllGlobals());

describe("strana náhľadu", () => {
  it("pozná len vľavo a vpravo", () => {
    expect(normalizujStranu("vlavo")).toBe("vlavo");
    expect(normalizujStranu("vpravo")).toBe("vpravo");
    expect(normalizujStranu("hore")).toBeNull();
    expect(normalizujStranu(undefined)).toBeNull();
    expect(opacnaStrana("vlavo")).toBe("vpravo");
    expect(opacnaStrana("vpravo")).toBe("vlavo");
  });

  it("predvolene je náhľad vľavo, ako bol doteraz", () => {
    falosneOkno();
    expect(nacitajStranu()).toBe("vlavo");
  });

  it("číta zapamätanú voľbu a nezmysel ignoruje", () => {
    const m = falosneOkno();
    m.set(KLUC_STRANY, "vpravo");
    expect(nacitajStranu()).toBe("vpravo");
    m.set(KLUC_STRANY, "napravo");
    expect(nacitajStranu()).toBe("vlavo");
  });

  it("zablokované úložisko (súkromné okno) nezhodí stránku", async () => {
    falosneOkno("chyba");
    expect(nacitajStranu()).toBe("vlavo");
    await expect(ulozStranu("vpravo")).resolves.toBeUndefined();
  });

  it("uloží voľbu na zariadenie, oznámi ju obrazovkám a pošle do účtu", async () => {
    const m = falosneOkno();
    const zmena = vi.fn();
    const odhlas = odoberajStranu(zmena);
    await ulozStranu("vpravo");
    expect(m.get(KLUC_STRANY)).toBe("vpravo");
    expect(zmena).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { strana_nahladu: "vpravo" } });
    odhlas();
    window.dispatchEvent(new CustomEvent(UDALOST_STRANY, { detail: "vlavo" }));
    expect(zmena).toHaveBeenCalledTimes(1);
  });

  it("prevezme voľbu z účtu (iné zariadenie) — raz za načítanie", async () => {
    const m = falosneOkno();
    auth.getUser.mockResolvedValueOnce({
      data: { user: { user_metadata: { strana_nahladu: "vpravo" } } },
    });
    const zmena = vi.fn();
    odoberajStranu(zmena);
    await zosuladStranuSUctom();
    expect(m.get(KLUC_STRANY)).toBe("vpravo");
    expect(zmena).toHaveBeenCalled();
    await zosuladStranuSUctom();
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("hook na serveri vráti predvolenú stranu", () => {
    let strana: string | null = null;
    function Sonda() {
      strana = useStranaNahladu().strana;
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    expect(strana).toBe("vlavo");
  });
});

describe("RozlozenieSNahladom", () => {
  const html = (strana?: "vlavo" | "vpravo", nahlad: React.ReactNode = <aside>N</aside>) =>
    renderToStaticMarkup(
      <JazykProvider jazyk="sk">
        <RozlozenieSNahladom
          className="grid"
          stlpceVlavo="cols-l"
          stlpceVpravo="cols-r"
          nahlad={nahlad}
          strana={strana}
        >
          <form>O</form>
        </RozlozenieSNahladom>
      </JazykProvider>,
    );

  it("vľavo: náhľad je v DOM pred obsahom", () => {
    const h = html("vlavo");
    expect(h).toContain('class="grid cols-l"');
    expect(h.indexOf("<aside>")).toBeLessThan(h.indexOf("<form>"));
  });

  it("vpravo: obsah je v DOM pred náhľadom a stĺpce sú zrkadlové", () => {
    const h = html("vpravo");
    expect(h).toContain('class="grid cols-r"');
    expect(h).toContain('data-strana-nahladu="vpravo"');
    expect(h.indexOf("<form>")).toBeLessThan(h.indexOf("<aside>"));
  });

  it("bez náhľadu ostane len obsah", () => {
    const h = html("vpravo", null);
    expect(h).toBe('<div class="grid"><form>O</form></div>');
  });
});
