import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DetailEfaktury, PrijateEfaktury } from "./PrijateEfaktury";
import type { PrijataEfakturaApp } from "@/lib/mobile/efaktury-prijate";
import { MobilPanel } from "./MobilPanel";
import { Prehlad } from "./Prehlad";

/** Vykreslenie bez prehliadača — efekty sa nespúšťajú, server sa nepýta. */
const firma = { id: "11111111-1111-1111-1111-111111111111", name: "Skúšobná s.r.o." };
const nic = () => {};

describe("Prijaté eFaktúry v appke", () => {
  it("obrazovka sa vykreslí s nadpisom a načítavaním", () => {
    const html = renderToString(
      <PrijateEfaktury firma={firma} onSpat={nic} onOtvorPrijate={nic} />,
    );
    expect(html).toContain("Prijaté eFaktúry");
    expect(html).toContain("Načítavam");
  });

  it("bočný panel ponúkne Prijaté eFaktúry, keď má kam viesť", () => {
    const panel = (onEfaktury?: () => void) =>
      renderToString(
        <MobilPanel
          otvoreny
          onZavri={nic}
          email="skuska@faktero.sk"
          firma={firma}
          viacFiriem={false}
          onZmenitFirmu={nic}
          onDoklady={nic}
          onEfaktury={onEfaktury}
          onUcet={nic}
          onZmazatUcet={nic}
          onOdhlasit={nic}
        />,
      );
    expect(panel(nic)).toContain("Prijaté eFaktúry");
    expect(panel(undefined)).not.toContain("Prijaté eFaktúry");
  });

  it("Prehľad sa vykreslí aj s odkazom na eFaktúry", () => {
    expect(
      renderToString(
        <Prehlad
          firma={firma}
          onNovaFaktura={nic}
          onSkener={nic}
          onFaktury={nic}
          onDoklady={nic}
          onEfaktury={nic}
        />,
      ),
    ).toBeTruthy();
  });

  const efaktura: PrijataEfakturaApp = {
    id: "e1",
    sender_name: "SFC, s.r.o.",
    sender_participant_id: "0245:2121372693",
    document_number: "20260001",
    issue_date: "2026-10-30",
    due_date: "2026-11-13",
    currency: "EUR",
    total: 123,
    vat_total: 23,
    status: "parsed",
    received_at: "2026-10-30T10:00:00Z",
    matched_supplier_invoice_id: null,
    nespracovany_id: null,
    kontrola_chyby: 2,
  };

  it("detail novej eFaktúry: suma, chyby kontroly a Zaevidovať", () => {
    const html = renderToString(
      <DetailEfaktury
        firma={firma}
        efaktura={efaktura}
        onSpat={nic}
        onZmena={nic}
        onOtvorPrijate={nic}
      />,
    );
    expect(html).toContain("20260001");
    expect(html).toContain("SFC, s.r.o.");
    expect(html).toContain("Nová");
    expect(html).toContain("Automatická kontrola našla chyby: 2");
    expect(html).toContain("Zaevidovať");
    expect(html).toContain("Pripravujem náhľad");
  });

  it("zaevidovaná eFaktúra už Zaevidovať neponúka, len cestu k prijatej faktúre", () => {
    const html = renderToString(
      <DetailEfaktury
        firma={firma}
        efaktura={{ ...efaktura, matched_supplier_invoice_id: "pi" }}
        onSpat={nic}
        onZmena={nic}
        onOtvorPrijate={nic}
      />,
    );
    expect(html).toContain("Zaevidovaná");
    expect(html).toContain("Otvoriť v prijatých faktúrach");
    expect(html).not.toMatch(/>Zaevidovať</);
  });
});
