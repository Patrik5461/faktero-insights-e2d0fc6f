import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  dalsiaUpomienka,
  filtrujNeuhradenePoSplatnosti,
  jeFakturaPoSplatnosti,
  navrhyVoVybere,
  povoleneAkcie,
  smieZmenitStav,
  sucetOdpocitanychZaloh,
} from "./akcie-faktury";
import { vybraneZRiadkov } from "@/hooks/usePagedList";

const DNES = "2026-11-01";
const fa = (o: Record<string, unknown>) => ({
  status: "issued",
  type: "regular",
  due_date: "2026-11-15",
  paid_at: null,
  deleted_at: null,
  ...o,
});
const akcie = (o: Record<string, unknown>, x: Record<string, unknown> = {}) =>
  povoleneAkcie(fa(o) as any, { dnes: DNES, ...x });

describe("povoleneAkcie — stavové akcie detailu (AB-17–AB-21, K-17)", () => {
  it("koncept: nie uhradená, nie odoslané inak, nie eFaktúra", () => {
    const a = akcie({ status: "draft", due_date: "2026-01-01" });
    expect(a.uhradena).toBe(false);
    expect(a.odoslaneInak).toBe(false);
    expect(a.efaktura).toBe(false);
    expect(a.dovodBezEfaktury).toMatch(/Koncept/);
    // Koncept nie je po splatnosti, ani keď má starý dátum (K-17).
    expect(a.poSplatnosti).toBe(false);
    expect(a.odznak).toBe("draft");
  });
  it("storno: nič okrem vymazania", () => {
    const a = akcie({ status: "cancelled" });
    expect(a.uhradena || a.odoslaneInak || a.efaktura || a.email || a.storno || a.upravit).toBe(
      false,
    );
    expect(a.vymazat).toBe(true);
  });
  it("vystavená: odoslané inak aj úhrada; odoslaná už len úhrada", () => {
    expect(akcie({}).odoslaneInak).toBe(true);
    expect(akcie({}).uhradena).toBe(true);
    expect(akcie({ status: "sent" }).odoslaneInak).toBe(false);
    expect(akcie({ status: "sent" }).uhradena).toBe(true);
  });
  it("uhradená: Označiť ako neuhradenú je dostupné (AB-17)", () => {
    const a = akcie({ status: "paid", paid_at: "2026-10-01" });
    expect(a.neuhradena).toBe(true);
    expect(a.uhradena).toBe(false);
  });
  it("po splatnosti: odznak overdue a upomienka (K-17)", () => {
    const a = akcie({ status: "sent", due_date: "2026-10-31" });
    expect(a.poSplatnosti).toBe(true);
    expect(a.odznak).toBe("overdue");
    expect(a.upomienka).toBe(true);
    expect(akcie({ due_date: DNES }).poSplatnosti).toBe(false);
    expect(akcie({ status: "paid", due_date: "2026-01-01" }).odznak).toBe("paid");
  });
  it("daňový doklad k platbe len uhradená záloha platiteľa (AB-21)", () => {
    const z = { type: "proforma", status: "paid", paid_at: "2026-10-01" };
    expect(akcie(z, { platitelDph: true }).dokladKPlatbe).toBe(true);
    expect(akcie(z, { platitelDph: null }).dokladKPlatbe).toBe(true);
    expect(akcie(z, { platitelDph: false }).dokladKPlatbe).toBe(false);
    expect(akcie({ type: "proforma" }, { platitelDph: true }).dokladKPlatbe).toBe(false);
  });
  it("zálohová sa eFaktúrou neposiela", () => {
    expect(akcie({ type: "proforma" }).efaktura).toBe(false);
  });
  it("nemecká firma nemá Export do Pohody (AB-24)", () => {
    expect(akcie({}, { krajina: "DE" }).exportPohoda).toBe(false);
    expect(akcie({}, { krajina: "SK" }).exportPohoda).toBe(true);
  });
  it("vymazaná faktúra: len obnoviť (AB-25)", () => {
    const a = akcie({ deleted_at: "2026-10-30T10:00:00Z", due_date: "2026-01-01" });
    expect(a.vymazana).toBe(true);
    expect(a.obnovit).toBe(true);
    for (const k of [
      "upravit",
      "zauctovat",
      "odoslaneInak",
      "uhradena",
      "efaktura",
      "email",
      "upomienka",
      "storno",
      "vymazat",
      "exportPohoda",
    ] as const)
      expect(a[k], k).toBe(false);
  });
});

describe("smieZmenitStav (AB-18, AB-19)", () => {
  it("odoslané len z vystavenej, uhradená len z vystavenej/odoslanej", () => {
    expect(smieZmenitStav("draft", "sent")).toBe(false);
    expect(smieZmenitStav("cancelled", "sent")).toBe(false);
    expect(smieZmenitStav("issued", "sent")).toBe(true);
    expect(smieZmenitStav("draft", "paid")).toBe(false);
    expect(smieZmenitStav("cancelled", "paid")).toBe(false);
    expect(smieZmenitStav("sent", "paid")).toBe(true);
    expect(smieZmenitStav("draft", "issued")).toBe(true);
    expect(smieZmenitStav("cancelled", "cancelled")).toBe(false);
  });
});

describe("dalsiaUpomienka (AB-26)", () => {
  it("po tretej už ďalšia nie je", () => {
    expect(dalsiaUpomienka([])).toBe(1);
    expect(dalsiaUpomienka([1])).toBe(2);
    expect(dalsiaUpomienka([1, 2])).toBe(3);
    expect(dalsiaUpomienka([2])).toBe(3);
    expect(dalsiaUpomienka([1, 2, 3])).toBeNull();
  });
});

/** Zapisovač volaní PostgREST dotazu. */
function dotaz() {
  const volania: string[] = [];
  const q: any = new Proxy(
    {},
    {
      get:
        (_t, metoda: string) =>
        (...args: unknown[]) => {
          volania.push(`${metoda}(${args.map((a) => JSON.stringify(a)).join(",")})`);
          return q;
        },
    },
  );
  return { q, volania };
}

describe("filtre zoznamu v dotaze, nie na stránke (AB-01)", () => {
  it("neuhradené = podmienka z suhrn_vystavenych_faktur", () => {
    const { q, volania } = dotaz();
    filtrujNeuhradenePoSplatnosti(q, { neuhradene: true, dnes: DNES });
    expect(volania).toEqual([
      'not("status","in","(draft,cancelled,paid)")',
      'not("type","in","(proforma,advance_payment,credit_note)")',
      'is("paid_at",null)',
    ]);
  });
  it("po splatnosti: issued/sent, splatnosť pred dneškom, bez úhrady", () => {
    const { q, volania } = dotaz();
    filtrujNeuhradenePoSplatnosti(q, { poSplatnosti: true, dnes: DNES });
    expect(volania).toEqual([
      'in("status",["issued","sent"])',
      `lt("due_date","${DNES}")`,
      'is("paid_at",null)',
    ]);
  });
  it("bez upomienky = po splatnosti + anti-join na odoslané upomienky", () => {
    const { q, volania } = dotaz();
    filtrujNeuhradenePoSplatnosti(q, { bezUpomienky: true, dnes: DNES });
    expect(volania).toContain('eq("invoice_reminders.status","sent")');
    expect(volania).toContain('is("invoice_reminders",null)');
    expect(volania).toContain(`lt("due_date","${DNES}")`);
  });
  it("bez filtrov sa dotaz nemení", () => {
    const { q, volania } = dotaz();
    filtrujNeuhradenePoSplatnosti(q, { dnes: DNES });
    expect(volania).toEqual([]);
  });
  it("jeFakturaPoSplatnosti je tá istá podmienka ako dotaz", () => {
    expect(jeFakturaPoSplatnosti({ status: "issued", due_date: "2026-10-31" }, DNES)).toBe(true);
    expect(
      jeFakturaPoSplatnosti({ status: "issued", due_date: "2026-10-31", paid_at: "x" }, DNES),
    ).toBe(false);
    expect(jeFakturaPoSplatnosti({ status: "draft", due_date: "2026-10-31" }, DNES)).toBe(false);
  });
});

describe("výber len zo zobrazených riadkov (AB-02)", () => {
  it("ID mimo zoznamu sa do hromadnej akcie nedostanú", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(vybraneZRiadkov(rows, { a: true, b: false, skryta: true })).toEqual(["a"]);
  });
});

describe("súčet odpočítaných záloh (AB-23)", () => {
  it("rovnaká mena sa sčíta, iná nie", () => {
    const eur = { currency: "EUR" };
    expect(
      sucetOdpocitanychZaloh(
        [
          { amount: 100, zaloha: eur },
          { amount: "50.5", zaloha: eur },
        ],
        "EUR",
      ),
    ).toBe(150.5);
    expect(
      sucetOdpocitanychZaloh(
        [
          { amount: 100, zaloha: eur },
          { amount: 50, zaloha: { currency: "CZK" } },
        ],
        "EUR",
      ),
    ).toBeNull();
    expect(sucetOdpocitanychZaloh([{ amount: 100, zaloha: null }], "CZK")).toBe(100);
  });
});

describe("párovanie: návrhy vo výbere (AB-14)", () => {
  it("počíta len návrhy, nie isté zhody", () => {
    expect(
      navrhyVoVybere(["t1", "t2", "t3"], [{ transactionId: "t2" }, { transactionId: "t9" }]),
    ).toBe(1);
    expect(navrhyVoVybere(["t1"], [])).toBe(0);
  });
});

/* Zdrojové poistky — zapojenie pomôcok do obrazoviek. */
const zdroj = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("zapojenie do zoznamu a detailu", () => {
  const zoznam = zdroj("routes/_authenticated/faktury.index.tsx");
  const detail = zdroj("routes/_authenticated/faktury.$id.index.tsx");
  it("zoznam nefiltruje načítanú stránku a filtre idú do dotazu (AB-01)", () => {
    expect(zoznam).toContain("filtrujNeuhradenePoSplatnosti(d,");
    expect(zoznam).toMatch(/const visibleRows = list\.rows;/);
  });
  it("mobilná karta má výber (AB-06)", () => {
    expect(zoznam).toMatch(/onVyber=\{\(v\) => list\.toggleSelect\(i\.id, v\)\}/);
  });
  it("jedna cesta k úhrade a mazaniu v pruhu (AB-03–AB-05)", () => {
    expect(zoznam).not.toContain("bulkMarkPaidFn");
    expect(zoznam).not.toContain("Vybrané faktúry: {n}");
    expect(zoznam).toMatch(/list\.showDeleted \? \(\s*<BulkBar/);
  });
  it("detail berie akcie z povoleneAkcie a odznak po splatnosti (K-17)", () => {
    expect(detail).toContain("<StatusBadge status={akcie.odznak} />");
    expect(detail).toContain("{akcie.odoslaneInak && (");
    expect(detail).toContain("{akcie.uhradena && (");
    expect(detail).toContain("{akcie.neuhradena && (");
    expect(detail).toContain("disabled={efakturaOkno || !akcie.efaktura}");
    expect(detail).not.toContain("advanceProforma");
  });
  it("vymazaná faktúra má vlastné zobrazenie s Obnoviť (AB-25)", () => {
    expect(detail).toContain("data-faktura-v-kosi");
    expect(detail).toContain('obnovZKosa("invoices"');
  });
});

describe("drobnosti", () => {
  it("predĺženie splatnosti: pôvodný dátum vo formáte dokladu (AB-22)", () => {
    expect(zdroj("components/faktero/PredlzitSplatnost.tsx")).toContain(
      "datumNaDoklade(faktura.povodna_splatnost)",
    );
  });
  it("účtovná poznámka má všade rovnaký limit (AB-27)", () => {
    for (const p of [
      "components/faktero/OdovzdanieDokladu.tsx",
      "components/faktero/ZauctovanieVystavenejPanel.tsx",
    ]) {
      const s = zdroj(p);
      expect(s, p).toContain("maxLength={MAX_UCTOVNEJ_POZNAMKY}");
      expect(s, p).not.toMatch(/maxLength=\{2[04]0\}/);
    }
  });
  it("server odmietne doklad k platbe neplatiteľovi (AB-21)", () => {
    expect(zdroj("lib/faktero/doklad-k-platbe.functions.ts")).toMatch(/vat_payer === false/);
  });
  it("párovanie potvrdzuje návrhy (AB-14)", () => {
    expect(zdroj("routes/_authenticated/faktury.parovanie.tsx")).toContain("navrhyVoVybere(");
  });
});
