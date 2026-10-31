import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetKlienta, nahlasChybu } from "./klient";

/** Prehliadač v malom: `window` s adresou a `fetch`, ktorý si telo zapamätá. */
function prehliadac() {
  const tela: Record<string, unknown>[] = [];
  const w = { location: { pathname: "/podpora" } } as Record<string, unknown>;
  vi.stubGlobal("window", w);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, o: { body: string }) => {
      tela.push(JSON.parse(o.body));
      return new Response(null, { status: 204 });
    }),
  );
  return { w, tela };
}

describe("nahlasChybu", () => {
  afterEach(() => {
    _resetKlienta();
    vi.unstubAllGlobals();
  });

  it("počas obnovy po nasadení pošle značku starého vydania", () => {
    const { w, tela } = prehliadac();
    nahlasChybu(
      new TypeError("Cannot read properties of undefined (reading 'component')"),
      "hranica",
    );
    w.__fakteroObnovaPoNasadeni = true;
    nahlasChybu(new TypeError('can\'t access property "component", k is undefined'), "hranica");
    expect(tela).toHaveLength(2);
    expect(tela[0].stare_vydanie).toBeUndefined();
    expect(tela[1].stare_vydanie).toBe(true);
  });

  it("obal Reactu #520 pošle aj príčinu", () => {
    const { tela } = prehliadac();
    nahlasChybu(
      new Error(
        "Minified React error #520; visit https://react.dev/errors/520 for the full message",
        {
          cause: new TypeError("t is not a function"),
        },
      ),
      "onerror",
    );
    expect(tela[0].sprava).toBe(
      "Minified React error #520 — príčina: TypeError: t is not a function",
    );
    expect(String(tela[0].stack)).toContain("Caused by: TypeError: t is not a function");
  });
});
