import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));
vi.mock("@tanstack/react-start", async (povodny) => ({
  ...(await povodny<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
// pdf.js v Node nebeží — náhľad PDF stačí ako značka.
vi.mock("./NahladPdf", () => ({
  NahladPdf: ({ url }: { url: string }) => <canvas data-pdf={url} />,
}));

import {
  Hodnota,
  NahladKompaktny,
  PanelKompaktny,
  Pole,
  RozlozenieKompaktne,
  Sekcia,
} from "./KompaktnyDetail";
import { SEKCIE_VYSTAVENEJ, VystavenaDetailKompaktna } from "./VystavenaDetailKompaktna";
import { PrijataDetailKompaktna } from "./PrijataDetailKompaktna";
import type { UdajeUctovnika } from "./UdajePreUctovnika";
import { JazykProvider } from "@/lib/i18n/useT";

const html = (prvok: ReactNode) =>
  renderToStaticMarkup(<JazykProvider jazyk="sk">{prvok}</JazykProvider>);

const pozicie = (h: string, texty: string[]) => texty.map((x) => h.indexOf(x));

describe("RozlozenieKompaktne — náhľad a panel 400 px ako pri nespracovanom doklade", () => {
  const strom = (strana: "vlavo" | "vpravo") =>
    html(
      <RozlozenieKompaktne strana={strana} nahlad={<p>NAHLAD</p>}>
        <div>PANEL</div>
      </RozlozenieKompaktne>,
    );

  it("vľavo: náhľad prvý, stĺpce minmax(0,1fr) | 400px, na mobile jeden stĺpec", () => {
    const h = strom("vlavo");
    expect(h).toContain('data-strana-nahladu="vlavo"');
    expect(h).toContain("lg:grid-cols-[minmax(0,1fr)_400px]");
    expect(h).toMatch(/class="grid grid-cols-1 gap-4 /);
    const [n, p] = pozicie(h, ["NAHLAD", "PANEL"]);
    expect(n).toBeGreaterThan(-1);
    expect(n).toBeLessThan(p);
  });

  it("vpravo: panel prvý a stĺpce zrkadlovo", () => {
    const h = strom("vpravo");
    expect(h).toContain("lg:grid-cols-[400px_minmax(0,1fr)]");
    const [n, p] = pozicie(h, ["NAHLAD", "PANEL"]);
    expect(p).toBeLessThan(n);
  });
});

describe("NahladKompaktny", () => {
  const pdf = { url: "https://x/fa.pdf", nazov: "FA-1.pdf", mime: "application/pdf" };

  it("nástroje: otočiť, priblížiť, stiahnuť, prepínač strany; PDF cez pdf.js", () => {
    const h = html(<NahladKompaktny subor={pdf} />);
    for (const x of ["Otočiť doľava", "Otočiť doprava", "Priblížiť", "Oddialiť", "Stiahnuť"])
      expect(h).toContain(`aria-label="${x}"`);
    expect(h).toContain("data-prepinac-strany-nahladu");
    expect(h).toContain('data-pdf="https://x/fa.pdf"');
    expect(h).toContain('href="https://x/fa.pdf"');
    expect(h).toContain("lg:max-h-[calc(100vh-11rem)]");
  });

  it("kôš len pri onZmaz (nespracovaný), Skryť náhľad len pri onSkryt (faktúra)", () => {
    const a = html(<NahladKompaktny subor={pdf} onZmaz={() => {}} />);
    expect(a).toContain('aria-label="Zmazať do koša"');
    expect(a).not.toContain('aria-label="Skryť náhľad"');
    const b = html(<NahladKompaktny subor={pdf} onSkryt={() => {}} />);
    expect(b).not.toContain('aria-label="Zmazať do koša"');
    expect(b).toContain('aria-label="Skryť náhľad"');
  });

  it("bez súboru text, počas načítania točiaci sa kruh, obrázok bez pdf.js", () => {
    expect(html(<NahladKompaktny subor={null} />)).toContain("Doklad nemá súbor.");
    expect(html(<NahladKompaktny subor={undefined} />)).toContain("animate-spin");
    const obr = html(
      <NahladKompaktny subor={{ url: "https://x/b.jpg", nazov: "b.jpg", mime: "image/jpeg" }} />,
    );
    expect(obr).not.toContain("data-pdf");
    expect(obr).toContain("https://x/b.jpg");
  });
});

describe("Pole, Hodnota, Sekcia, PanelKompaktny", () => {
  it("Hodnota má ten istý rámček a popis ako Pole; prázdna ukáže pomlčku", () => {
    const pole = html(
      <Pole popis="IČO">
        <input />
      </Pole>,
    );
    const hodnota = html(<Hodnota popis="IČO">{null}</Hodnota>);
    const popis = /<span class="([^"]*)">IČO<\/span>/;
    expect(hodnota.match(popis)?.[1]).toBe(pole.match(popis)?.[1]);
    expect(hodnota).toContain("h-10 w-full rounded-lg border");
    expect(hodnota).toContain(">—<");
  });

  it("Sekcia: nadpis, vpravo akcia (alebo fajka) a kotva", () => {
    const h = html(
      <Sekcia nadpis="Základné údaje" id="zauctovanie" akcia={<span>STAV</span>}>
        <p>OBSAH</p>
      </Sekcia>,
    );
    expect(h).toContain('id="zauctovanie"');
    expect(h).toMatch(/<h2 class="text-lg font-medium">Základné údaje<\/h2>/);
    const [n, s, o] = pozicie(h, ["Základné údaje", "STAV", "OBSAH"]);
    expect(n).toBeLessThan(s);
    expect(s).toBeLessThan(o);
  });

  it("PanelKompaktny: sekcie rolujú, pätička je za nimi a drží sa pri vrchu", () => {
    const h = html(
      <PanelKompaktny pata={<button>Vytvoriť</button>}>
        <p>SEKCIE</p>
      </PanelKompaktny>,
    );
    expect(h).toContain("lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]");
    expect(h).toContain("min-h-0 flex-1 overflow-auto");
    expect(h.indexOf("SEKCIE")).toBeLessThan(h.indexOf("Vytvoriť"));
    expect(h).toContain("border-t border-border p-4");
  });
});

describe("VystavenaDetailKompaktna — rovnaké rozloženie ako nespracovaný doklad", () => {
  const u: UdajeUctovnika = {
    cislo: "FA-7",
    druh: "Faktúra",
    stranaNadpis: "Odberateľ",
    strana: { nazov: "Odberateľ s.r.o.", ico: "123", dic: null, icDph: null },
    vystavenie: "2026-10-01",
    dodanie: "2026-10-01",
    splatnost: "15. 10. 2026",
    vs: "7",
    formaUhrady: "Bankový prevod",
    mena: "EUR",
    rozpis: [{ sadzba: 23, zaklad: 100, dan: 23, prenesenie: false }],
    zaklad: 100,
    dph: 23,
    spolu: 123,
    rezimy: [],
    uhrada: { uhradena: false, datum: null, zostava: 123, bezUhrady: false },
    zauctovanie: { predkontacia: null, clenenie: null, kv: null },
  } as unknown as UdajeUctovnika;
  const inv = {
    id: "f1",
    company_id: "c1",
    type: "regular",
    status: "issued",
    invoice_number: "FA-7",
    issue_date: "2026-10-01",
    delivery_date: "2026-10-01",
    due_date: "2026-10-15",
    customer_name: "Odberateľ s.r.o.",
    total: 123,
  };
  const strom = (zmena: Partial<typeof inv> = {}, nahlad = true) =>
    html(
      <VystavenaDetailKompaktna
        inv={{ ...inv, ...zmena }}
        company={{ name: "Test", iban: "SK3112000000198742637541" }}
        u={u}
        poSplatnosti={false}
        polozky={[{ id: "p1", name: "Konzultácia", quantity: 1, unit_price: 100, total: 123 }]}
        nahlad={
          nahlad
            ? {
                subor: { url: "https://x/fa.pdf", nazov: "FA-7.pdf", mime: "application/pdf" },
                onSkryt: () => {},
              }
            : null
        }
        prilohy={<section>PRILOHY</section>}
        komentare={<div>KOMENTARE</div>}
        historia={<details>HISTORIA</details>}
        onStiahnut={() => {}}
        onUhradena={() => {}}
        onNeuhradena={() => {}}
        onZmena={() => {}}
      />,
    );

  it("náhľad PDF vľavo, panel 400 px vpravo", () => {
    const h = strom();
    expect(h).toContain("lg:grid-cols-[minmax(0,1fr)_400px]");
    expect(h.indexOf("data-nahlad-kompaktny")).toBeLessThan(h.indexOf("data-panel-kompaktny"));
    expect(h).toContain('data-pdf="https://x/fa.pdf"');
  });

  it("sekcie v poradí nespracovaného dokladu", () => {
    const h = strom();
    const p = pozicie(
      h,
      SEKCIE_VYSTAVENEJ.map((s) => `data-sekcia="${s}"`),
    );
    expect(p.every((x) => x > -1)).toBe(true);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
    // Za sekciami prílohy, komentáre a história.
    const [pol, pri, kom, his] = pozicie(h, [
      'data-sekcia="Položky"',
      "PRILOHY",
      "KOMENTARE",
      "HISTORIA",
    ]);
    expect(pol).toBeLessThan(pri);
    expect(pri).toBeLessThan(kom);
    expect(kom).toBeLessThan(his);
  });

  it("zaúčtovanie hneď za typom dokladu, polia v poradí, tlačidlá v pätičke", () => {
    const h = strom();
    const [typ, pk, cl, kv, cislo] = pozicie(h, [
      ">Typ dokladu<",
      "Predkontácia (Pohoda)",
      "Členenie DPH (plnenie)",
      "Členenie KV DPH",
      ">Číslo faktúry<",
    ]);
    expect(typ).toBeGreaterThan(-1);
    expect(typ).toBeLessThan(pk);
    expect(pk).toBeLessThan(cl);
    expect(cl).toBeLessThan(kv);
    expect(kv).toBeLessThan(cislo);
    expect(h).not.toContain("Kategória nákladu");
    // Sekcia so zaúčtovaním je kotva pre „Zaúčtovať“ v menu „…“.
    expect(h).toMatch(/<section id="zauctovanie"[^>]*data-sekcia="Základné údaje"/);
    expect(h).toContain("Nezaúčtovaná");
    const pata = h.slice(h.lastIndexOf("border-t border-border p-4"));
    expect(pata).toContain("Uložiť bez zaúčtovania");
    expect(pata).toContain("Zaúčtovať");
    expect(pata).toContain("Stiahnuť XML pre Pohodu");
  });

  it("úhrada, položky a odkaz na zmenu odberateľa", () => {
    const h = strom();
    expect(h).toContain("Označiť ako uhradenú");
    expect(h).toContain("Konzultácia");
    expect(h).toContain('href="/faktury/$id/upravit"');
    expect(h).toContain("SK31 1200 0000 1987 4263 7541");
  });

  it("zálohová faktúra: číslo zálohovej faktúry a poznámka, že nie je daňový doklad", () => {
    const h = strom({ type: "proforma" });
    expect(h).toContain(">Číslo zálohovej faktúry<");
    expect(h).toContain("Nie je daňový doklad");
  });

  it("koncept: bez tlačidiel zaúčtovania a s vysvetlením", () => {
    const h = strom({ status: "draft" });
    expect(h).toContain("Koncept sa zaúčtuje až po vystavení faktúry.");
    expect(h).not.toContain("Uložiť bez zaúčtovania");
  });

  it("skrytý náhľad: len panel", () => {
    const h = strom({}, false);
    expect(h).not.toContain("data-nahlad-kompaktny");
    expect(h).toContain("data-panel-kompaktny");
  });
});

describe("PrijataDetailKompaktna — rovnaké rozloženie ako nespracovaný doklad", () => {
  const row = {
    id: "p1",
    company_id: "c1",
    type: "regular",
    status: "received",
    invoice_number: "DF-1",
    issue_date: "2026-10-01",
    due_date: "2026-10-15",
    supplier_name: "Dodávateľ s.r.o.",
    supplier_iban: "SK3112000000198742637541",
    amount_total: 12.3,
    amount_without_vat: 10,
    vat_amount: 2.3,
    currency: "EUR",
    file_path: "c1/p1.pdf",
    file_mime: "application/pdf",
    items: [{ name: "Tovar", quantity: 1, unit_price: 10, vat_rate: 23, total: 12.3 }],
  };
  const strom = () =>
    html(
      <PrijataDetailKompaktna
        row={row}
        nahladUrl="https://x/df.pdf"
        navrh={false}
        onZmena={() => {}}
        onStiahni={() => {}}
      />,
    );

  it("náhľad dokladu vľavo, panel 400 px, sekcie v poradí nespracovaného", () => {
    const h = strom();
    expect(h).toContain("lg:grid-cols-[minmax(0,1fr)_400px]");
    expect(h).toContain('data-pdf="https://x/df.pdf"');
    expect(h.indexOf("data-nahlad-kompaktny")).toBeLessThan(h.indexOf("data-panel-kompaktny"));
    const p = pozicie(
      h,
      [
        "Základné údaje",
        "Čiastka a DPH",
        "Dodávateľ",
        "Platobné údaje",
        "Úhrada",
        "Poznámka",
        "Položky",
      ].map((s) => `data-sekcia="${s}"`),
    );
    expect(p.every((x) => x > -1)).toBe(true);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
  });

  it("zaúčtovanie hneď za typom dokladu, polia ako pri nespracovanom (aj kategória nákladu)", () => {
    const h = strom();
    const [typ, pk, cl, kv, kat, cislo] = pozicie(h, [
      ">Typ dokladu<",
      "Predkontácia (Pohoda)",
      "Členenie DPH (plnenie)",
      "Členenie KV DPH",
      "Kategória nákladu",
      ">Číslo faktúry<",
    ]);
    expect(typ).toBeGreaterThan(-1);
    expect(typ).toBeLessThan(pk);
    expect(pk).toBeLessThan(cl);
    expect(cl).toBeLessThan(kv);
    expect(kv).toBeLessThan(kat);
    expect(kat).toBeLessThan(cislo);
    expect(h).toContain("data-zauctovanie-v-paneli");
    expect(h).toContain("Tovar");
  });
});
