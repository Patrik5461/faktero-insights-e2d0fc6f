/*
  Strážca opráv balíka B1 v obrazovkách (meny v zoznamoch, objednávky,
  ponuky, zákazky, kontakty). Výpočty sú otestované pri pomôckach
  (sucty-zoznamov, objednavky-odberatel, zakazky…); tu sa kontroluje, že ich
  obrazovky naozaj používajú a staré chyby sa nevrátili.
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const koren = path.resolve(__dirname, "../../..");
const zdroj = (p: string) => readFileSync(path.join(koren, p), "utf8");
const R = "src/routes/_authenticated/";

describe("meny natvrdo EUR (D-01, D-02, K-01, K-14)", () => {
  for (const s of [
    "objednavky.index.tsx",
    "objednavky.$id.tsx",
    "objednavky.nova.tsx",
    "zakazky.index.tsx",
    "zakazky.$id.tsx",
    "prijate-zalohove.index.tsx",
  ])
    it(s, () => expect(zdroj(R + s)).not.toMatch(/formatovacMeny\("EUR"/));
});

describe("prijaté zálohové (AB-09 … AB-13)", () => {
  const s = zdroj(R + "prijate-zalohove.index.tsx");
  it("súčty cez pomôcku po menách", () => expect(s).toContain("suctyPrijatychZaloh("));
  it("bez stropu 500 riadkov", () => {
    expect(s).not.toMatch(/\.limit\(500\)/);
    expect(s).toContain("vsetkyRiadky");
  });
  it("mobilná karta má akciu (Vymazať/Obnoviť)", () =>
    expect(s).toMatch(/actions=\{akciaRiadku\(r, true\)\}/));
  it("filter Zobraziť vymazané a obnovenie", () => {
    expect(s).toContain('key: "vymazane"');
    expect(s).toContain("deleted_at: null");
  });
});

describe("súčtové karty (D-17, D-18, D-20)", () => {
  it("prijaté faktúry", () => {
    const s = zdroj(R + "prijate-faktury.index.tsx");
    expect(s).toContain("celkomPrijatychPoMenach(");
    expect(s).toContain("<SuctyPoMenach sucty={totals.unpaid} />");
    expect(s).not.toMatch(/rows\.reduce\(\(s, r\) => s \+ Number\(r\.amount_total/);
  });
  it("bločky", () => {
    const s = zdroj(R + "doklady.index.tsx");
    expect(s).toContain("suctyBlockovPoMenach(");
    expect(s).not.toContain('.join(" + ")');
  });
});

it("súčtová lišta nespája meny znakom + (AB-15)", () => {
  expect(zdroj("src/components/faktero/SuctovaListaVyberu.tsx")).not.toContain('.join(" + ")');
});

describe("objednávky (D-03, D-04, D-11, D-12, K-15)", () => {
  it("server nepredpokladá EUR a úprava menu ani ponuku nezahodí", () => {
    const s = zdroj("src/lib/faktero/sales-orders.functions.ts");
    expect(s).not.toMatch(/currency: z\.string\(\)\.default\("EUR"\)/);
    expect(s).toContain("domacaMena(firma?.country)");
    expect(s).toContain("if (data.quote_id !== undefined) hlavicka.quote_id");
    expect(s).toMatch(
      /select\("id, invoice_number, issue_date, status, total, currency, deleted_at"\)/,
    );
  });
  it("formulár posiela menu a sadzbu režimu", () => {
    const s = zdroj(R + "objednavky.nova.tsx");
    expect(s).toContain("currency: mena,");
    expect(s).toContain("zakladnaSadzbaRezimu(rezim)");
    expect(s).not.toContain("DEFAULT_VAT_RATE");
  });
  it("detail: zostáva s DPH a formátované množstvo", () => {
    const s = zdroj(R + "objednavky.$id.tsx");
    expect(s).toContain("o.zostava_s_dph");
    expect(s).toContain('formatujMnozstvo(zostava, lokalJazyka(jazyk)) : t("vybavené")');
  });
  it("zoznam: súčet po menách", () => {
    expect(zdroj(R + "objednavky.index.tsx")).toContain("<SuctyPoMenach sucty={spolu.hodnota} />");
  });
});

describe("ponuky (D-06, D-14)", () => {
  it("položky sa kontrolujú pred pridelením čísla", () => {
    const s = zdroj(R + "ponuky.nova.tsx");
    expect(s.indexOf("kontrolaPoloziekPonuky(items)")).toBeGreaterThan(0);
    expect(s.indexOf("kontrolaPoloziekPonuky(items)")).toBeLessThan(
      s.indexOf("await dalsieCislo("),
    );
  });
  it("čas odpovede podľa jazyka", () =>
    expect(zdroj(R + "ponuky.$id.tsx")).not.toContain('toLocaleString("sk-SK")'));
});

describe("zákazky (K-06 … K-13)", () => {
  const d = zdroj(R + "zakazky.$id.tsx");
  it("úprava ponúka len odberateľov a kontroluje dátumy", () => {
    expect(d).toContain("c.odberatel || c.id === aktualny");
    expect(d).toContain("chybaZakazky(form)");
  });
  it("daňový doklad k platbe a stav faktúry", () => {
    expect(d).toContain('t("Daňový doklad k platbe")');
    expect(d).toContain("<StatusBadge");
  });
  it("dátumy formátované", () => {
    expect(d).not.toMatch(/^\s+f\.issue_date,$/m);
    expect(d).not.toMatch(/^\s+t\.trip_date,$/m);
  });
  // Po redizajne ide text cez EmptyState, ktorý ho prekladá sám (t(title)).
  it("prázdny filter Uzavreté", () =>
    expect(zdroj(R + "zakazky.index.tsx")).toContain('"Žiadna uzavretá zákazka."'));
  it("bez nepoužitých importov", () => {
    const s = zdroj(R + "zakazky.nova.tsx");
    expect(s).not.toContain("ArrowLeft");
    expect(s).not.toMatch(/import \{[^}]*\bLink\b/);
  });
  it("server kontroluje dátumy pri vytvorení aj úprave", () =>
    expect(zdroj("src/lib/faktero/jobs.functions.ts").match(/chybaZakazky\(data\)/g)).toHaveLength(
      2,
    ));
});

it("kontakt bez názvu sa neuloží (K-04)", () => {
  expect(zdroj("src/components/faktero/KontaktyStranka.tsx")).toContain('t("Vyplňte názov.")');
});

it("VIES podľa krajiny firmy (K-12)", () => {
  expect(zdroj("src/components/faktero/OverenieVies.tsx")).toContain(
    "jeTuzemske(ic, krajinaFirmy)",
  );
});
