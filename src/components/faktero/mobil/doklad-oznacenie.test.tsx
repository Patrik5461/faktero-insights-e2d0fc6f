import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DetailPohybu } from "./Banka";
import { OznacenieDokladu, PoznamkaDokladu } from "./DokladOznacenie";
import { PrijateFaktury } from "./PrijateFaktury";
import { SablonaMailu } from "./SablonaMailu";

/*
  Nové časti appky z 28. 10. 2026 sa vykreslia (bez servera — efekty sa pri
  `renderToString` nespúšťajú). Rovnaká poistka ako `obrazovky.test.tsx`.
*/
const firmaId = "11111111-1111-1111-1111-111111111111";
const nic = () => {};
const pohyb = {
  id: "p1",
  ucet_id: "u1",
  datum: "2026-10-01",
  suma: -1.2,
  mena: "EUR",
  vs: null,
  protistrana: null,
  popis: "Transakčná daň 30.09.2026",
  faktura: null,
};

describe("označenia v appke", () => {
  it("nespárovaný pohyb ponúkne obe označenia", () => {
    const html = renderToString(
      <DetailPohybu
        pohyb={pohyb}
        firma="Skúšobná"
        pracujem={false}
        onOznac={nic}
        onZavriet={nic}
      />,
    );
    expect(html).toContain("Nespárované");
    expect(html).toContain("Označiť: pohyb nemá doklad");
    expect(html).toContain("Označiť ako transakčnú daň");
  });

  it("označený pohyb sa dá zrušiť, spárovaný sa neoznačuje", () => {
    const oznaceny = renderToString(
      <DetailPohybu
        pohyb={{ ...pohyb, stav: "transakcna_dan" }}
        firma="Skúšobná"
        pracujem={false}
        onOznac={nic}
        onZavriet={nic}
      />,
    );
    expect(oznaceny).toContain("Zrušiť označenie");
    const sparovany = renderToString(
      <DetailPohybu
        pohyb={{ ...pohyb, faktura: "2026001" }}
        firma="Skúšobná"
        pracujem={false}
        onOznac={nic}
        onZavriet={nic}
      />,
    );
    expect(sparovany).not.toContain("Zrušiť označenie");
    expect(sparovany).toContain("Spárované");
  });

  it("komentár, štítky a poznámka", () => {
    const html = renderToString(
      <>
        <OznacenieDokladu
          tabulka="expense_documents"
          firmaId={firmaId}
          doklad={{ id: "d1", komentar: "pre šéfa", stitky: ["auto"] }}
        />
        <PoznamkaDokladu
          tabulka="expense_documents"
          id="d1"
          firmaId={firmaId}
          agenda="blocek"
          poznamka="do účtovníctva"
          zamknute
        />
      </>,
    );
    expect(html).toContain("Komentár");
    expect(html).toContain("auto");
    expect(html).toContain("pre šéfa");
    expect(html).toContain("poznámka sa nedá zmeniť");
  });

  it("prijaté faktúry a šablóna mailu", () => {
    expect(
      renderToString(<PrijateFaktury firma={{ id: firmaId, name: "Skúšobná" }} onSpat={nic} />),
    ).toContain("Načítavam");
    // Bez načítaných šablón sa nekreslí nič.
    expect(renderToString(<SablonaMailu fakturaId="f1" onZmena={nic} />)).toBe("");
  });
});
