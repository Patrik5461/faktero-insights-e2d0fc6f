import { describe, expect, it } from "vitest";
import { hlavickyCsp, politikaCsp, rozoberCspHlasenia, spravaCsp } from "./csp";

describe("politikaCsp", () => {
  it("obsahuje Supabase vrátane wss a hlásenie na náš endpoint", () => {
    const p = politikaCsp("https://abc.supabase.co");
    expect(p).toContain(
      "connect-src 'self' data: blob: https://abc.supabase.co wss://abc.supabase.co",
    );
    expect(p).toContain("https://challenges.cloudflare.com");
    expect(p).toContain("report-uri /api/public/csp-report");
    expect(p).toContain("object-src 'none'");
  });
  it("je len Report-Only", () => {
    const h = Object.fromEntries(hlavickyCsp());
    expect(h["content-security-policy-report-only"]).toBeTruthy();
    expect(h["content-security-policy"]).toBeUndefined();
    expect(h["reporting-endpoints"]).toBe('csp="/api/public/csp-report"');
  });
});

describe("rozoberCspHlasenia", () => {
  it("starý formát report-uri — pôvod bez cesty, stránka bez parametrov", () => {
    const r = rozoberCspHlasenia(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://www.faktero.sk/faktury?token=tajne",
          "violated-directive": "script-src-elem",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?a=1",
          "source-file": "https://www.faktero.sk/assets/a.js?v=2",
        },
      }),
    );
    expect(r).toEqual([
      {
        direktiva: "script-src-elem",
        blokovane: "https://evil.example",
        stranka: "/faktury",
        subor: "https://www.faktero.sk/assets/a.js",
      },
    ]);
    expect(spravaCsp(r[0])).toBe(
      "CSP (report-only): script-src-elem zablokovalo https://evil.example",
    );
  });

  it("Reporting API (pole) aj inline", () => {
    const r = rozoberCspHlasenia(
      JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: "https://www.faktero.sk/",
            effectiveDirective: "script-src-elem",
            blockedURL: "inline",
          },
        },
        { type: "deprecation", body: { id: "x" } },
      ]),
    );
    expect(r).toHaveLength(1);
    expect(r[0].blokovane).toBe("inline");
  });

  it("doplnky prehliadača a nezmysly zahodí", () => {
    expect(
      rozoberCspHlasenia(
        JSON.stringify({ "csp-report": { "blocked-uri": "chrome-extension://abc/x.js" } }),
      ),
    ).toEqual([]);
    expect(
      rozoberCspHlasenia(
        JSON.stringify({
          "csp-report": { "blocked-uri": "inline", "source-file": "moz-extension://x" },
        }),
      ),
    ).toEqual([]);
    expect(rozoberCspHlasenia("nie je json")).toEqual([]);
  });
});
