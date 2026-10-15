import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MobilnaApka } from "./MobilApp";
import { Diagnostika } from "./Diagnostika";
import { ListaVybranych, PrijateDoklady } from "./PrijateDoklady";
import { Skener, vychodzieNastavenie } from "./Skener";
import { suhrnVyberu } from "@/lib/mobile/vyber-dokladov";
import { VystaveneFaktury } from "./VystaveneFaktury";
import { NovaFaktura } from "./NovaFaktura";
import { Ponuky, stavPonuky } from "./Ponuky";
import { NovaPonuka } from "./NovaPonuka";
import { Jazda } from "./Jazda";
import { Banka } from "./Banka";
import { MobilPanel } from "./MobilPanel";
import { StavPushu } from "./StavPushu";
import { PruhJazdy } from "./PrebiehaJazda";
import { RozpoznanyDoklad } from "./RozpoznanyDoklad";
import { DavkaDokladov } from "./DavkaDokladov";
import { UpravaDokladu } from "./UpravaDokladu";
import { TabBar, ZALOZKY_VO_VIAC, type Zalozka } from "./TabBar";
import { Prehlad } from "./Prehlad";

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

  it("rozpoznaný doklad začína nahrávaním", () => {
    const html = renderToString(
      <RozpoznanyDoklad
        firma={firma}
        subor="data:image/jpeg;base64,AAAA"
        onUlozene={nic}
        onNechat={nic}
        onSpat={nic}
      />,
    );
    expect(html).toContain("Nahrávam doklad");
  });

  it("rozpoznaný doklad z dávky (už nahratý) sa nenahráva znova", () => {
    const html = renderToString(
      <RozpoznanyDoklad
        firma={firma}
        subor="data:image/jpeg;base64,AAAA"
        id="22222222-2222-2222-2222-222222222222"
        onUlozene={nic}
        onNechat={nic}
        onSpat={nic}
      />,
    );
    expect(html).not.toContain("Nahrávam doklad");
    expect(html).toContain("Rozpoznaný doklad");
  });

  it("dávka viacerých dokladov — prázdna aj so súbormi", () => {
    const prazdna = renderToString(<DavkaDokladov firma={firma} onHotovo={nic} onSpat={nic} />);
    expect(prazdna).toContain("Viac dokladov naraz");
    expect(prazdna).toContain("Zatiaľ tu nie je žiadny doklad");

    const html = renderToString(
      <DavkaDokladov
        firma={firma}
        pociatocne={[
          { subor: "data:image/jpeg;base64,AAAA" },
          { subor: "data:application/pdf;base64,JVBERi0=", nazov: "faktura.pdf" },
          { subor: "data:image/jpeg;base64,BBBB", id: "33333333-3333-3333-3333-333333333333" },
        ]}
        onHotovo={nic}
        onSpat={nic}
      />,
    );
    expect(html).toContain("Dokladov: 3");
    expect(html).toContain("Čaká na nahratie");
    expect(html).toContain("Čítam…");
    expect(html).toContain("Uložiť všetky rozpoznané (0)");
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
        onZmazatUcet={nic}
        onOdhlasit={nic}
      />,
    );
    expect(otvoreny).toContain("skuska@faktero.sk");
    expect(otvoreny).toContain("Zmazať účet");
  });
});

/**
 * Spodná lišta podľa smeru „A": päť miest, skener vyvýšený v strede.
 *
 * Banka a Kniha jázd v lište nie sú — nesmú sa tým ale stratiť. Každá záložka
 * musí byť dosiahnuteľná buď z lišty, alebo cez „Viac" (bočný panel), a obe
 * presunuté sú navyše rýchlymi akciami na Prehľade.
 */
describe("spodná lišta a „Viac“", () => {
  const lista = (aktivna: Zalozka) =>
    renderToString(<TabBar aktivna={aktivna} onPrepni={nic} onViac={nic} />);

  it("má päť miest: Prehľad, Faktúry, skener, Doklady, Viac", () => {
    const html = lista("prehlad");
    expect(html.match(/<button/g)).toHaveLength(5);
    for (const text of ["Prehľad", "Faktúry", "Doklady", "Viac"]) expect(html).toContain(text);
    expect(html).toContain('aria-label="Skener"');
    expect(html).toContain("data-skener-v-liste");
    // Banka a jazdy v lište nie sú.
    expect(html).not.toContain("Banka");
    expect(html).not.toContain(">Jazdy<");
  });

  it("banka a jazdy rozsvietia „Viac“, ostatné svoje miesto", () => {
    expect(ZALOZKY_VO_VIAC).toEqual(["banka", "jazda"]);
    for (const z of ZALOZKY_VO_VIAC) {
      const html = lista(z);
      expect(html).not.toContain('aria-current="page"');
      expect(html).toMatch(/data-viac=""[^>]*text-app-zelena/);
    }
    expect(lista("faktury")).toMatch(/aria-current="page"[^>]*text-app-zelena[^>]*>.*Faktúry/);
    expect(lista("skener")).toMatch(/aria-label="Skener" aria-current="page"/);
  });

  it("každá záložka je dosiahnuteľná: lišta, alebo „Viac“ s bankou a jazdami", () => {
    const vListe: Zalozka[] = ["prehlad", "faktury", "doklady", "skener"];
    const vsetky: Zalozka[] = ["prehlad", "faktury", "doklady", "skener", "banka", "jazda"];
    expect(vsetky.filter((z) => !vListe.includes(z))).toEqual([...ZALOZKY_VO_VIAC]);

    const panel = renderToString(
      <MobilPanel
        otvoreny
        onZavri={nic}
        email="skuska@faktero.sk"
        firma={firma}
        viacFiriem={false}
        onZmenitFirmu={nic}
        onDoklady={nic}
        onFaktury={nic}
        onPonuky={nic}
        onBanka={nic}
        onJazda={nic}
        onUcet={nic}
        onZmazatUcet={nic}
        onOdhlasit={nic}
      />,
    );
    expect(panel).toContain("Banka");
    expect(panel).toContain("Kniha jázd");
    expect(panel).toContain("Cenové ponuky");
  });

  it("Prehľad ponúka banku aj jazdu ako rýchle akcie", () => {
    const html = renderToString(
      <Prehlad
        firma={firma}
        onNovaFaktura={nic}
        onSkener={nic}
        onJazda={nic}
        onBanka={nic}
        onFaktury={nic}
        onDoklady={nic}
      />,
    );
    for (const text of [
      "Faktúra",
      "Skenovať",
      "Jazda",
      "Banka",
      "Neuhradené faktúry",
      "Čaká na vás",
    ])
      expect(html).toContain(text);
    expect(html).toContain("data-hlavna-karta");
  });
});

describe("skener a výber dokladov", () => {
  it("skener je prázdny: nastavenie je jeden čip, panel sa vysunie až na ťuknutie", () => {
    const html = renderToString(
      <Skener
        onQr={nic}
        onOdfotit={nic}
        onZGalerie={nic}
        onViacstranovy={nic}
        onPrijateDoklady={nic}
        nastavenie={{ ...vychodzieNastavenie(), kategoria: "palivo", poznamka: "služobná cesta" }}
        onNastavenie={nic}
      />,
    );
    // Čip ukazuje, čo je nastavené — úhradu, kategóriu a počet ďalších položiek.
    expect(html).toContain("data-cip-nastavenia");
    expect(html).toContain("Karta");
    expect(html).toContain("Nákup PHM");
    expect(html).toMatch(/\+(<!-- -->)?1</);
    // Panel nie je otvorený nad kamerou a riadok odkazov je preč.
    expect(html).not.toContain("data-panel-dokladu");
    expect(html).not.toContain("PDF súbor");
    expect(html).toContain("data-spust");
    // Rozloženie „A": biely panel, úhrada ako dve tlačidlá vedľa kategórie.
    expect(html).toContain("data-spodny-panel");
    expect(html).toMatch(/aria-pressed="false"[^>]*>Hotovosť/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Karta/);
  });

  it("skener sa dá zavrieť krížikom, keď nemá spodnú lištu", () => {
    const html = renderToString(
      <Skener
        onQr={nic}
        onOdfotit={nic}
        onZGalerie={nic}
        onViacstranovy={nic}
        onPrijateDoklady={nic}
        nastavenie={vychodzieNastavenie()}
        onNastavenie={nic}
        onZavriet={nic}
      />,
    );
    expect(html).toContain("data-zavriet-skener");
    expect(html).toContain("Kategória");
  });

  it("„Upraviť doklad“ má štyri rohy a všetky tlačidlá", () => {
    const html = renderToString(
      <UpravaDokladu snimka={{ sirka: 1920, vyska: 1080 }} onUlozit={nic} onZnova={nic} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html.match(/data-roh="/g)).toHaveLength(4);
    for (const text of ["Upraviť doklad", "Filtre", "Otočiť", "Odfotiť znova", "Uložiť doklad"])
      expect(html).toContain(text);
    // Jedna strana — „Pridať stranu" tu nemá čo robiť.
    expect(html).not.toContain("Pridať stranu");
  });

  it("„Upraviť doklad“ pri viacstranovom doklade pridáva strany", () => {
    const html = renderToString(
      <UpravaDokladu
        snimka={{ sirka: 1000, vyska: 1400, rohy: null }}
        viacStran
        strana={3}
        odfotenych={2}
        onUlozit={nic}
        onPridatStranu={nic}
        onZnova={nic}
      />,
    );
    expect(html).toContain("Pridať stranu");
    expect(html).toContain("Hotovo (3 strany)");
    expect(html).toContain("Strana 3");
  });

  it("lišta vybraných sčíta po menách a povie, čo pôjde do účtovníctva", () => {
    const doklady = [
      {
        id: "a",
        total_amount: 12.3,
        net_amount: 10,
        vat_amount: 2.3,
        currency: "EUR",
        status: "processed",
      },
      {
        id: "b",
        total_amount: 24.6,
        net_amount: 20,
        vat_amount: 4.6,
        currency: "EUR",
        status: "processed",
        exported_at: "2026-10-01T08:00:00Z",
      },
      {
        id: "c",
        total_amount: 121,
        net_amount: 100,
        vat_amount: 21,
        currency: "CZK",
        status: "new",
      },
    ];
    const html = renderToString(
      <ListaVybranych
        suhrn={suhrnVyberu(doklady, new Set(["a", "b", "c"]))}
        loc="sk-SK"
        pracujem={false}
        onKategoria={nic}
        onZmaz={nic}
      />,
    ).replace(/\u00a0|&nbsp;/g, " ");
    expect(html).toContain("Vybrané: 3 doklady");
    expect(html).toContain("36,90 €");
    expect(html).toContain("30,00 € bez DPH");
    expect(html).toContain("121,00 CZK");
    expect(html).toContain("Na export do účtovníctva: 1 doklad");
    expect(html).toContain("Zmeniť kategóriu…");
    expect(html).toContain("Zmazať");
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
    expect(
      stavPonuky({ ...zaklad, converted_invoice_id: "x", valid_until: "2020-01-01" }).kluc,
    ).toBe("ponuky.stav.vyfakturovana");
  });

  it("prepadnutú platnosť pozná z dátumu", () => {
    expect(stavPonuky({ ...zaklad, valid_until: "2020-01-01" }).kluc).toBe(
      "ponuky.stav.poPlatnosti",
    );
    expect(stavPonuky({ ...zaklad, valid_until: "2099-01-01" }).kluc).toBe("ponuky.stav.navrh");
  });

  it("odoslaná a prijatá sa nezamenia", () => {
    expect(stavPonuky({ ...zaklad, sent_at: "2026-01-02" }).kluc).toBe("ponuky.stav.odoslana");
    expect(stavPonuky({ ...zaklad, status: "accepted" }).kluc).toBe("ponuky.stav.prijata");
    expect(stavPonuky({ ...zaklad, status: "rejected" }).kluc).toBe("ponuky.stav.zamietnuta");
  });
});

/*
  Rozpoznaná jazda sa dala dovtedy ukončiť jedine tým, že človek prestal
  chodiť a motor ju po piatich minútach zastavil sám. Obrazovka pritom celý
  čas hlásila „nahrávam jazdu" a ponúkala len ovládanie ručného merania.
*/
describe("prebiehajúca rozpoznaná jazda", () => {
  /* React medzi textové uzly vkladá `<!-- -->`; bez odstránenia by „12.3 km"
     nesedelo, hoci na obrazovke je presne to. */
  const bezZnaciek = (h: string) => h.replace(/<!--[\s\S]*?-->/g, "");

  it("pruh povie, že sa nahráva, aj koľko a odkedy", () => {
    const html = bezZnaciek(
      renderToString(
        <PruhJazdy
          jazda={{ id: "t1", zaciatok: 1_787_000_000_000, km: 12.34, rucna: false }}
          teraz={1_787_000_000_000 + 25 * 60_000}
        />,
      ),
    );
    expect(html).toContain("Nahrávam jazdu");
    expect(html).toContain("12.3 km");
    expect(html).toContain("25 min");
  });

  it("ručne spustenú jazdu odlíši od rozpoznanej", () => {
    const spolu = { id: "t2", zaciatok: 1_787_000_000_000, km: 1, teraz: 1_787_000_060_000 };
    const rucna = renderToString(
      <PruhJazdy jazda={{ ...spolu, rucna: true }} teraz={spolu.teraz} />,
    );
    const auto = renderToString(
      <PruhJazdy jazda={{ ...spolu, rucna: false }} teraz={spolu.teraz} />,
    );
    expect(rucna).toContain("spustená ručne");
    expect(auto).not.toContain("spustená ručne");
  });
});

/*
  Charakter jazdy sa v histórii mení priamo — je to voľba z dvoch možností,
  nie prepis čísla. Odznak nosí len súkromná: služobná je bežný stav a odznak
  pri každej jazde by nič nepovedal.
*/
describe("charakter jazdy v histórii", () => {
  it("súkromná a služobná sa rozlíšia", async () => {
    const { jeSukromna, charakterJazdy } = await import("@/lib/faktero/trip-format");
    expect(jeSukromna("private")).toBe(true);
    expect(jeSukromna("business")).toBe(false);
    // Staré jazdy vznikali bez hodnoty — tie sú služobné.
    expect(jeSukromna(null)).toBe(false);
    expect(charakterJazdy(null)).toBe("Služobná");
    expect(charakterJazdy("private")).toBe("Súkromná");
  });
});
