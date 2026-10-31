import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
  Bloček a cenová ponuka v kompaktnom rozložení — ten istý detail ako faktúra
  a nespracovaný doklad (KompaktnyDetail): náhľad + panel 400 px so sekciami.
*/

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));
vi.mock("@tanstack/react-start", async (povodny) => ({
  ...(await povodny<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
vi.mock("./NahladPdf", () => ({
  NahladPdf: ({ url }: { url: string }) => <canvas data-pdf={url} />,
}));

import { BlocekDetailKompaktny } from "./BlocekDetailKompaktny";
import { PonukaDetailKompaktna } from "./PonukaDetailKompaktna";
import { JazykProvider } from "@/lib/i18n/useT";

const html = (prvok: ReactNode) =>
  renderToStaticMarkup(<JazykProvider jazyk="sk">{prvok}</JazykProvider>);
const pozicie = (h: string, texty: string[]) => texty.map((x) => h.indexOf(x));
const vPoradi = (p: number[]) =>
  p.every((x) => x > -1) && [...p].sort((a, b) => a - b).every((x, i) => x === p[i]);

describe("BlocekDetailKompaktny — ako detail faktúry", () => {
  const row = {
    id: "b1",
    company_id: "c1",
    document_number: "TEST-104",
    supplier_name: "Parking Bratislava s.r.o.",
    supplier_ico: "47123456",
    issue_date: "2026-10-05",
    payment_method: "karta",
    total_amount: 4.5,
    net_amount: 3.66,
    vat_amount: 0.84,
    currency: "EUR",
    file_path: "c1/b1.jpg",
    file_mime: "image/jpeg",
    items: [{ name: "Parkovné 3 h", quantity: 1, unit_price: 4.5, vat_rate: 23, total: 4.5 }],
  };
  const strom = (nahlad = true, zmena: Partial<typeof row> & Record<string, unknown> = {}) =>
    html(
      <BlocekDetailKompaktny
        row={{ ...row, ...zmena }}
        nahlad={
          nahlad
            ? {
                subor: { url: "https://x/b1.jpg", nazov: "TEST-104", mime: "image/jpeg" },
                onSkryt: () => {},
              }
            : null
        }
        nahladUrl="https://x/b1.jpg"
        kody={null}
        onZmena={() => {}}
        onStiahni={() => {}}
      />,
    );

  it("náhľad skenu s nástrojmi vľavo, panel 400 px, sekcie v poradí", () => {
    const h = strom();
    expect(h).toContain("lg:grid-cols-[minmax(0,1fr)_400px]");
    expect(h).toContain('aria-label="Skryť náhľad"');
    expect(h).toContain("data-detail-blocku");
    expect(h.indexOf("data-nahlad-kompaktny")).toBeLessThan(h.indexOf("data-panel-kompaktny"));
    expect(
      vPoradi(
        pozicie(
          h,
          ["Základné údaje", "Čiastka a DPH", "Obchodník", "Úhrada", "Poznámka", "Položky"].map(
            (s) => `data-sekcia="${s}"`,
          ),
        ),
      ),
    ).toBe(true);
    expect(h).toContain("Parkovné 3 h");
    expect(h).toContain("Uhradené kartou");
  });

  it("zaúčtovanie hneď za typom dokladu tými istými poľami, Zaúčtovať v pätičke", () => {
    const h = strom();
    expect(
      vPoradi(
        pozicie(h, [
          ">Typ dokladu<",
          "Predkontácia (Pohoda)",
          "Členenie DPH (plnenie)",
          "Členenie KV DPH",
          "Kategória nákladu",
          ">Číslo dokladu<",
        ]),
      ),
    ).toBe(true);
    expect(h).toContain("automaticky (B3)");
    const pata = h.slice(h.lastIndexOf("border-t border-border p-4"));
    expect(pata).toContain("Zaúčtovať");
  });

  it("zaúčtovaný bez zmien: tlačidlo Zaúčtované; odovzdaný: bez Zaúčtovať", () => {
    expect(
      strom(true, { zauctovane_at: "2026-10-30T10:00:00Z", pohoda_predkontacia: "1Fp" }),
    ).toContain("Zaúčtované");
    const h = strom(true, { exported_at: "2026-10-30T10:00:00Z" });
    expect(h).not.toContain(">Zaúčtovať<");
    expect(h).toContain("odovzdaný do Pohody");
  });

  it("skrytý náhľad: len panel", () => {
    const h = strom(false);
    expect(h).not.toContain("data-nahlad-kompaktny");
    expect(h).toContain("data-panel-kompaktny");
  });
});

describe("PonukaDetailKompaktna — ako detail faktúry", () => {
  const q = {
    id: "q1",
    quote_number: "CP-1",
    issue_date: "2026-10-01",
    valid_until: "2026-10-31",
    currency: "EUR",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    customer_name: "Odberateľ s.r.o.",
    customer_ico: "12345678",
    notes: "Ďakujeme",
  };
  const polozky = [{ name: "Služba", quantity: 1, unit_price: 100, vat_rate: 23, total: 123 }];

  it("náhľad PDF ponuky a panel so sekciami", () => {
    const h = html(
      <PonukaDetailKompaktna
        q={q}
        polozky={polozky}
        stav={<span>Odoslaná</span>}
        subor={{ url: "https://x/cp.pdf", nazov: "CP-1.pdf", mime: "application/pdf" }}
        prilohy={null}
      />,
    );
    expect(h).toContain('data-pdf="https://x/cp.pdf"');
    expect(h).toContain("data-detail-ponuky");
    expect(h.indexOf("data-nahlad-kompaktny")).toBeLessThan(h.indexOf("data-panel-kompaktny"));
    expect(
      vPoradi(
        pozicie(
          h,
          ["Základné údaje", "Čiastka a DPH", "Odberateľ", "Poznámka", "Položky"].map(
            (s) => `data-sekcia="${s}"`,
          ),
        ),
      ),
    ).toBe(true);
    expect(h).toContain("Služba");
  });

  it("bez PDF vysvetlenie, konvertovaná ponuka má v pätičke odkaz na faktúru", () => {
    const h = html(
      <PonukaDetailKompaktna
        q={{ ...q, converted_invoice_id: "f1" }}
        polozky={polozky}
        stav={null}
        subor={null}
        prilohy={null}
      />,
    );
    expect(h).toContain("Ponuka ešte nemá PDF");
    expect(h).toContain('href="/faktury/$id"');
  });
});

describe("kompaktné polia: výber s hľadaním má popis v rámčeku ako select", () => {
  it("vzor A v styles.css zahŕňa button[role=combobox]", () => {
    const css = readFileSync(path.resolve(__dirname, "../../styles.css"), "utf8");
    const a = css
      .split("\n")
      .filter((r) => r.startsWith('html[data-dizajn="kompaktny"] label:has(> :is(span'));
    expect(a?.length).toBe(3);
    for (const x of a ?? []) expect(x).toContain('button[role="combobox"]');
  });
});
