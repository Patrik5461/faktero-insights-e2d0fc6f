import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MobilnaApka } from "./MobilApp";
import { Diagnostika } from "./Diagnostika";
import { PrijateDoklady } from "./PrijateDoklady";
import { VystaveneFaktury } from "./VystaveneFaktury";
import { NovaFaktura } from "./NovaFaktura";
import { Jazda } from "./Jazda";
import { Banka } from "./Banka";
import { MobilPanel } from "./MobilPanel";
import { StavPushu } from "./StavPushu";

/**
 * Že sa obrazovka vôbec vykreslí.
 *
 * Mobilné obrazovky nemal dovtedy pokryté nič — `MobilApp.tsx` má vyše tisíc
 * riadkov a jedinou skúškou bolo otvoriť appku v telefóne. Vykreslenie na
 * serveri (`renderToString`) nepotrebuje prehliadač ani novú závislosť a chytí
 * to, čo bolí najviac: chybu pri načítaní modulu, kruhový import, komponent,
 * ktorý padne hneď pri prvom vykreslení. Efekty sa pri ňom nespúšťajú, takže
 * sa nič nepýta servera.
 *
 * Nie je to náhrada za skúšku na telefóne — je to poistka, že sa balíček
 * neposkladá s obrazovkou, ktorá sa ani neotvorí.
 */
const firma = { id: "11111111-1111-1111-1111-111111111111", name: "Skúšobná s.r.o." };
const nic = () => {};

describe("mobilné obrazovky sa vykreslia", () => {
  it("appka začína úvodnou obrazovkou", () => {
    const html = renderToString(<MobilnaApka />);
    expect(html).toContain("Spúšťam Faktero");
  });

  it("diagnostika", () => {
    expect(renderToString(<Diagnostika onSpat={nic} />)).toContain("Diagnostika");
  });

  it("prijaté doklady", () => {
    expect(renderToString(<PrijateDoklady firma={firma} onSpat={nic} />)).toBeTruthy();
  });

  it("vystavené faktúry", () => {
    expect(
      renderToString(<VystaveneFaktury firma={firma} onSpat={nic} onNova={nic} />),
    ).toBeTruthy();
  });

  it("nová faktúra", () => {
    expect(renderToString(<NovaFaktura firma={firma} onSpat={nic} onHotovo={nic} />)).toBeTruthy();
  });

  it("jazda", () => {
    expect(renderToString(<Jazda firma={firma} onSpat={nic} />)).toBeTruthy();
  });

  it("banka", () => {
    expect(renderToString(<Banka firma={firma} onSpat={nic} />)).toBeTruthy();
  });

  it("stav pushu", () => {
    expect(renderToString(<StavPushu />)).toBeTruthy();
  });

  it("bočný panel — otvorený aj zatvorený", () => {
    const otvoreny = renderToString(
      <MobilPanel
        otvoreny
        onZavri={nic}
        email="skuska@faktero.sk"
        firma={firma}
        viacFiriem
        onZmenitFirmu={nic}
        onDoklady={nic}
        onFaktury={nic}
        onUcet={nic}
        onOdhlasit={nic}
      />,
    );
    expect(otvoreny).toContain("skuska@faktero.sk");
  });
});
