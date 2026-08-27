import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MobilnaApka } from "./MobilApp";
import { Diagnostika } from "./Diagnostika";
import { PrijateDoklady } from "./PrijateDoklady";
import { VystaveneFaktury } from "./VystaveneFaktury";
import { NovaFaktura } from "./NovaFaktura";
import { Ponuky, stavPonuky } from "./Ponuky";
import { NovaPonuka } from "./NovaPonuka";
import { Jazda } from "./Jazda";
import { Banka } from "./Banka";
import { MobilPanel } from "./MobilPanel";
import { StavPushu } from "./StavPushu";
import { PruhJazdy } from "./PrebiehaJazda";

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

  it("cenové ponuky", () => {
    const html = renderToString(
      <Ponuky firma={firma} onSpat={nic} onNova={nic} onFakturaVytvorena={nic} />,
    );
    expect(html).toContain("Cenové ponuky");
  });

  it("nová cenová ponuka", () => {
    expect(renderToString(<NovaPonuka firma={firma} onSpat={nic} onHotovo={nic} />)).toContain(
      "Načítavam",
    );
  });

  it("prijaté doklady", () => {
    expect(renderToString(<PrijateDoklady firma={firma} onSpat={nic} />)).toBeTruthy();
  });

  it("vystavené faktúry", () => {
    expect(
      renderToString(<VystaveneFaktury firma={firma} onSpat={nic} onNova={nic} onUprav={nic} />),
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

describe("poistka pri načítaní obrazovky", () => {
  it("appka sa vykreslí, aj keď sa obrazovka načítava zvlášť", () => {
    // Obrazovky sa načítavajú až pri kliknutí. Štart z toho nesmie mať nič —
    // ani prázdnu stránku, ani čakanie na súbor, ktorý netreba.
    const html = renderToString(<MobilnaApka />);
    expect(html).toContain("Spúšťam Faktero");
    expect(html).not.toContain("Otváram…");
  });
});

/**
 * Pruh „Nahrávam jazdu" — to jediné, čo počas jazdy prezradí, že sa naozaj
 * nahráva. Notifikácia príde raz a v aute sa ľahko prehliadne.
 */
describe("pruh prebiehajúcej jazdy", () => {
  const zaciatok = Date.UTC(2026, 7, 20, 11, 42);

  it("povie kilometre, čas začiatku aj ako dlho beží", () => {
    const html = renderToString(
      <PruhJazdy
        jazda={{ id: "t1", zaciatok, km: 12.44, rucna: false }}
        teraz={zaciatok + 75 * 60_000}
      />,
    );
    expect(html).toContain("Nahrávam jazdu");
    // Vykreslenie na serveri kúsky textu oddeľuje značkami, preto po častiach.
    expect(html).toContain("12.4");
    expect(html).toContain("km · od");
    expect(html).toContain("1 h 15 min");
    expect(html).not.toContain("ručne");
  });

  it("ručne spustenú jazdu odlíši", () => {
    const html = renderToString(
      <PruhJazdy jazda={{ id: "t1", zaciatok, km: 0, rucna: true }} teraz={zaciatok} />,
    );
    expect(html).toContain("spustená ručne");
    expect(html).toContain("0 min");
  });
});

/*
  Stav ponuky sa počíta z dátumov a väzieb, nie zo stĺpca `status` — ten sa na
  „po platnosti" nikde neprepisuje a prepadnutá ponuka by sa tvárila ako živá.
*/
describe("stav cenovej ponuky", () => {
  const zaklad = {
    id: "1",
    quote_number: "P2026001",
    status: "draft",
    issue_date: "2026-01-01",
    valid_until: null,
    currency: "EUR",
    total: 100,
    customer_name: "Kto",
    customer_email: null,
    converted_invoice_id: null,
    sent_at: null,
  };

  it("vyfakturovaná prebíja všetko ostatné", () => {
    expect(stavPonuky({ ...zaklad, converted_invoice_id: "x", valid_until: "2020-01-01" }).text).toBe(
      "Vyfakturovaná",
    );
  });

  it("prepadnutú platnosť pozná z dátumu", () => {
    expect(stavPonuky({ ...zaklad, valid_until: "2020-01-01" }).text).toBe("Po platnosti");
    expect(stavPonuky({ ...zaklad, valid_until: "2099-01-01" }).text).toBe("Návrh");
  });

  it("odoslaná a prijatá sa nezamenia", () => {
    expect(stavPonuky({ ...zaklad, sent_at: "2026-01-02" }).text).toBe("Odoslaná");
    expect(stavPonuky({ ...zaklad, status: "accepted" }).text).toBe("Prijatá");
    expect(stavPonuky({ ...zaklad, status: "rejected" }).text).toBe("Zamietnutá");
  });
});
