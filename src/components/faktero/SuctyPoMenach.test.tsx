import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import { SumaVDomacejMene, SuctyPoMenach } from "./SuctyPoMenach";
import { JazykProvider } from "@/lib/i18n/useT";

const html = (p: ReactNode, jazyk: "sk" | "de" = "sk") =>
  renderToStaticMarkup(<JazykProvider jazyk={jazyk}>{p}</JazykProvider>).replace(/[  ]/g, " ");

describe("SuctyPoMenach", () => {
  it("každá mena v samostatnom nezalomiteľnom kúsku s bodkou medzi", () => {
    const h = html(<SuctyPoMenach sucty={new Map([["EUR", 1200], ["CZK", 3400]])} />);
    expect(h).toContain("1 200,00 €");
    expect(h).toContain("3 400,00 Kč");
    expect(h.match(/whitespace-nowrap/g)).toHaveLength(2);
    expect(h).toContain("·");
  });
});

describe("SumaVDomacejMene", () => {
  it("značka prepočítané a zvyšok bez prepočtu", () => {
    const h = html(
      <SumaVDomacejMene
        sucet={{ domaca: "EUR", suma: 110, prepocitane: true, bezPrepoctu: new Map([["USD", 30]]) }}
      />,
    );
    expect(h).toContain("110,00 €");
    expect(h).toContain("prepočítané");
    expect(h).toContain("kurzom ECB");
    expect(h).toContain("30,00 USD");
    expect(h).toContain("bez prepočtu");
  });
  it("bez cudzej meny nič navyše; CZK firma hovorí o ČNB; nemčina prekladá", () => {
    const h = html(<SumaVDomacejMene sucet={{ domaca: "CZK", suma: 5, prepocitane: false, bezPrepoctu: new Map() }} />);
    expect(h).not.toContain("prepočítané");
    const de = html(
      <SumaVDomacejMene sucet={{ domaca: "CZK", suma: 5, prepocitane: true, bezPrepoctu: new Map() }} />,
      "de",
    );
    expect(de).toContain("umgerechnet");
    expect(de).toContain("ČNB");
  });
});
