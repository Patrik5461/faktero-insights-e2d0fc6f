import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { prijataEfakturaZVyberu } from "@/lib/faktero/efaktura/prijata-efaktura-faktury";
import { OdznakPrijatejEfaktury, SekciaPrijatejEfaktury } from "./PrijataEfakturaStav";
import { rozoberPrijatu } from "./PrijateFaktury";

/* Vykreslenie bez prehliadača — efekty (dopyt na server) sa nespúšťajú. */
const riadok = {
  id: "r1",
  channel: "peppol",
  sender_name: "Dodávateľ s.r.o.",
  sender_participant_id: "0245:2020123456",
  received_at: "2026-10-30T10:00:00Z",
  processed_at: "2026-10-30T10:01:00Z",
  kontrola_chyby: 0,
  kontrola_varovania: 0,
  skontrolovane_at: "2026-10-30T10:00:10Z",
};
const ok = prijataEfakturaZVyberu([riadok], "efaktura");
const sChybami = prijataEfakturaZVyberu([{ ...riadok, kontrola_chyby: 2 }], "efaktura");

describe("eFaktúra prijatá v appke — vykreslenie", () => {
  it("odznak len pri faktúre z eFaktúry", () => {
    expect(renderToString(<OdznakPrijatejEfaktury efaktura={null} />)).toBe("");
    const html = renderToString(<OdznakPrijatejEfaktury efaktura={ok} />);
    expect(html).toContain("eFaktúra prijatá");
    expect(html).toContain('data-efaktura-prijata="ok"');
    expect(renderToString(<OdznakPrijatejEfaktury efaktura={sChybami} />)).toContain(
      'data-efaktura-prijata="chyby"',
    );
  });

  it("sekcia: od koho, kanál, časy, kontrola, náhľad", () => {
    const html = renderToString(
      <SekciaPrijatejEfaktury fakturaId="f1" efaktura={ok} onNahlad={() => {}} />,
    );
    expect(html).toContain("Dodávateľ s.r.o.");
    expect(html).toContain("0245:2020123456");
    expect(html).toContain("Peppol cez ePoštáka");
    expect(html).toContain("Prišla");
    expect(html).toContain("Zaevidovaná");
    expect(html).toContain("bez chýb");
    expect(html).toContain("Zobraziť pôvodnú eFaktúru");
    const zle = renderToString(<SekciaPrijatejEfaktury fakturaId="f1" efaktura={sChybami} />);
    expect(zle).toContain('data-efaktura-prijata-kontrola="chyby"');
    expect(zle).toContain("našla chyby (2)");
    expect(zle).not.toContain("Zobraziť pôvodnú eFaktúru");
  });

  it("bez eFaktúry sa sekcia nekreslí; zmazaný riadok bez náhľadu", () => {
    expect(renderToString(<SekciaPrijatejEfaktury fakturaId="f1" efaktura={null} />)).toBe("");
    const html = renderToString(
      <SekciaPrijatejEfaktury
        fakturaId="f1"
        efaktura={prijataEfakturaZVyberu([], "efaktura")}
        onNahlad={() => {}}
      />,
    );
    expect(html).toContain("už nie je uložená");
    expect(html).not.toContain("Zobraziť pôvodnú eFaktúru");
  });

  it("riadok zo servera — vnorený výber sa zhrnie a do pamäte nejde surový", () => {
    const f = rozoberPrijatu({
      id: "f1",
      source: "efaktura",
      efaktura_received_documents: [riadok],
    } as any);
    expect(f.efaktura?.odosielatel).toBe("Dodávateľ s.r.o.");
    expect("efaktura_received_documents" in f).toBe(false);
    expect(rozoberPrijatu({ id: "f2", source: "manual" } as any).efaktura).toBeNull();
  });
});
