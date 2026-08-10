import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/sklad")({
  head: () => ({
    meta: [
      { title: "Pomoc — Sklad — Faktero" },
      {
        name: "description",
        content:
          "Skladové karty, príjem a výdaj, vážená nákupná cena, rezervácie, prevody medzi skladmi, dodacie listy, inventúra, minimálne zásoby a automatický odpočet pri faktúre.",
      },
      { property: "og:title", content: "Pomoc — Sklad — Faktero" },
      { property: "og:description", content: "Kompletný manuál k skladu vo Faktere." },
      { property: "og:url", content: "https://faktero.sk/pomoc/sklad" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/sklad" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-sklad-robi",
    title: "Čo sklad robí",
    body: (
      <>
        <p>
          Sklad vo Faktere odpovedá na tri otázky: <strong>čo mám</strong>,{" "}
          <strong>koľko to stálo</strong> a <strong>kam sa to podelo</strong>. Nie je to samostatná
          evidencia vedľa fakturácie — je to tá istá evidencia. Keď vystavíte faktúru na skladovú
          položku, tovar sa odpíše sám.
        </p>
        <p>Konkrétne sklad vie:</p>
        <ul>
          <li>viesť skladové karty so stavom, nákupnou a predajnou cenou,</li>
          <li>
            evidovať príjem, výdaj, opravu a inventúrny rozdiel — každý pohyb s dátumom, cenou a
            poznámkou,
          </li>
          <li>
            počítať <strong>váženú nákupnú cenu</strong>, takže viete, akú maržu ste na predaji
            naozaj dosiahli,
          </li>
          <li>odpisovať tovar automaticky pri odoslaní faktúry a vracať ho pri dobropise,</li>
          <li>rezervovať tovar na ponuku alebo prijatú objednávku,</li>
          <li>presúvať tovar medzi viacerými skladmi,</li>
          <li>vystavovať dodacie listy,</li>
          <li>strážiť minimálne zásoby a pripraviť objednávku u dodávateľa,</li>
          <li>robiť inventúru a rozdiel zaúčtovať,</li>
          <li>priradiť výdaj na zákazku, aby bolo vidieť skutočný náklad práce.</li>
        </ul>
      </>
    ),
  },
  {
    id: "karty",
    title: "Skladové karty a sledovanie stavu",
    body: (
      <>
        <p>
          Karta vzniká v <Link to="/sklad/produkty">Sklad → Skladové položky</Link>. Má SKU, názov,
          mernú jednotku, nákupnú a predajnú cenu, prípadne čiarový kód, umiestnenie a fotku.
        </p>
        <p>
          Najdôležitejší prepínač je <strong>Sledovať stav</strong>. Iba pri zapnutom sledovaní
          pohyby menia množstvo a Faktero bráni tomu, aby stav klesol pod nulu. Služby a položky,
          ktoré na sklade nedržíte, nechajte bez sledovania — inak vám každá faktúra spadne na
          nedostatok zásoby.
        </p>
        <p>
          Karta sa viaže na <strong>produkt z katalógu</strong> (
          <Link to="/produkty">Produkty a služby</Link>). Produkt je to, čo predávate a čo vidíte na
          faktúre; karta je to, čo fyzicky ležíte na sklade. Vďaka tomu môže mať tá istá karta inú
          predajnú cenu pre rôznych odberateľov — o tom je{" "}
          <Link to="/pomoc/ceny">cenník a zľavy</Link>.
        </p>
        <p>
          Kartu, ktorú už nepoužívate, <strong>archivujte</strong>, nemažte. Mazanie by odstrihlo
          históriu pohybov, ktoré patria k starým faktúram.
        </p>
      </>
    ),
  },
  {
    id: "prijem-vydaj",
    title: "Príjem, výdaj a oprava",
    body: (
      <>
        <p>
          Pohyby nájdete v <Link to="/sklad/pohyby">Sklad → Pohyby</Link>, nový sa zadáva cez{" "}
          <Link to="/sklad/prijem">Príjem</Link> a <Link to="/sklad/vydaj">Výdaj</Link>.
        </p>
        <ul>
          <li>
            <strong>Príjem</strong> — nákup tovaru. Zadajte množstvo a{" "}
            <strong>nákupnú cenu za jednotku</strong>. Bez nej sa nedá spočítať vážená cena a marža
            na faktúre bude nepravdivá.
          </li>
          <li>
            <strong>Výdaj</strong> — predaj mimo faktúry, spotreba na zákazke, škoda. Znižuje stav.
          </li>
          <li>
            <strong>Oprava</strong> — ručná úprava so znamienkom, keď sa niečo zaevidovalo zle.
          </li>
          <li>
            <strong>Faktúra</strong> a <strong>dobropis</strong> — tieto vytvára Faktero samo, ručne
            sa nezadávajú.
          </li>
        </ul>
        <p>
          Pri výdaji môžete vybrať <Link to="/pomoc/zakazky">zákazku</Link>. Tovar sa potom objaví
          v jej nákladoch a vo vyhodnotení marže.
        </p>
      </>
    ),
  },
  {
    id: "vazena-cena",
    title: "Vážená nákupná cena",
    body: (
      <>
        <p>
          Faktero oceňuje sklad <strong>váženým priemerom</strong>. Keď kúpite 10 kusov po 4 € a
          neskôr 10 kusov po 6 €, karta má 20 kusov v priemernej cene 5 €. Každý ďalší výdaj berie
          túto priemernú cenu.
        </p>
        <p>
          Priemer sa prepočítava pri každom príjme, takže hodnota skladu v{" "}
          <Link to="/sklad/hodnota">Sklad → Hodnota</Link> zodpovedá tomu, čo ste za tovar naozaj
          zaplatili — nie poslednej cene ani cenníkovej.
        </p>
        <p>
          <strong>Pozor na pohyby bez ceny.</strong> Ak sa pri starších pohyboch nákupná cena
          nevyplnila, ostanú bez ocenenia a v hodnote skladu chýbajú. Vyriešite to opravným pohybom
          alebo inventúrou s cenou.
        </p>
      </>
    ),
  },
  {
    id: "auto-odpocet",
    title: "Automatický odpočet pri faktúre",
    body: (
      <>
        <p>
          Keď na faktúru vyberiete položku, ktorá má skladovú kartu, a faktúra prejde do stavu{" "}
          <strong>Odoslaná</strong> alebo <strong>Uhradená</strong>, Faktero vytvorí pohyb typu{" "}
          <em>faktúra</em> a stav skladu sa zníži.
        </p>
        <p>
          Pri <strong>dobropise</strong> sa vytvorí opačný pohyb a tovar sa vráti na sklad — vrátane
          zákazky, na ktorú bol pôvodne vydaný.
        </p>
        <p>
          Kým je faktúra <em>koncept</em>, sklad sa nehýbe. Až odoslanie je moment, keď tovar odišiel.
        </p>
        <p>
          Skladové položky odoslanej faktúry sa už nedajú meniť. Keby sa dali, stav skladu by prestal
          zodpovedať dokladom.
        </p>
      </>
    ),
  },
  {
    id: "rezervacie",
    title: "Rezervácie",
    body: (
      <>
        <p>
          Rezervácia drží tovar pre konkrétny doklad, aby ho medzitým niekto nepredal. Vzniká z{" "}
          <Link to="/pomoc/ponuky">cenovej ponuky</Link> alebo z{" "}
          <Link to="/pomoc/objednavky">prijatej objednávky</Link>, keď na nej zapnete{" "}
          <strong>rezervovať tovar</strong>.
        </p>
        <p>
          Rezervovaný kus stále leží na sklade, ale <strong>dostupné množstvo</strong> je o neho
          nižšie. Práve dostupné množstvo vidíte pri výbere položky na faktúru.
        </p>
        <p>
          Rezervácia sa uvoľní, keď sa doklad vybaví, zruší alebo (pri ponuke) uplynie jej platnosť.
        </p>
      </>
    ),
  },
  {
    id: "sklady-prevody",
    title: "Viac skladov a prevody",
    body: (
      <>
        <p>
          Firma môže mať viac skladov — predajňu, dielňu, auto technika. Nastavujú sa v{" "}
          <Link to="/sklad/nastavenia">Sklad → Nastavenia</Link>.
        </p>
        <p>
          Presun tovaru medzi nimi robte cez{" "}
          <Link to="/sklad/presuny">Sklad → Presuny</Link>, nie dvojicou výdaj + príjem. Prevod
          zachová ocenenie a v histórii je vidieť, že tovar firmu neopustil.
        </p>
      </>
    ),
  },
  {
    id: "dodacie-listy",
    title: "Dodacie listy",
    body: (
      <>
        <p>
          Dodací list v <Link to="/sklad/dodacie-listy">Sklad → Dodacie listy</Link> je doklad o
          fyzickom odovzdaní tovaru. Používa sa vtedy, keď tovar odchádza skôr, než sa fakturuje —
          napríklad na stavbu.
        </p>
        <p>Dá sa vytlačiť ako PDF a odovzdať s tovarom.</p>
      </>
    ),
  },
  {
    id: "minimum-objednavky",
    title: "Minimálne zásoby a objednávky u dodávateľov",
    body: (
      <>
        <p>
          Na karte nastavte <strong>minimálny stav</strong> a prípadne{" "}
          <strong>optimálny stav</strong>. Zoznam toho, čo je pod limitom, nájdete v{" "}
          <Link to="/sklad/minimum">Sklad → Pod minimom</Link>; upozornenie sa objaví aj na
          nástenke.
        </p>
        <p>
          Odtiaľ sa dá rovno pripraviť{" "}
          <Link to="/sklad/objednavky">objednávka u dodávateľa</Link>. Faktero navrhne množstvo tak,
          aby ste sa dostali na optimálny stav. Príjem tovaru sa potom zapíše priamo na objednávku a
          tá si sama drží prehľad, čo z nej ešte neprišlo.
        </p>
      </>
    ),
  },
  {
    id: "inventura",
    title: "Inventúra",
    body: (
      <>
        <p>Inventúra porovná fyzický stav so stavom v systéme a rozdiel zaúčtuje.</p>
        <ol>
          <li>
            V <Link to="/sklad/inventura">Sklad → Inventúra</Link> založte novú inventúru.
          </li>
          <li>Vyplňte spočítané množstvá pre každú kartu.</li>
          <li>
            Po uzavretí Faktero vytvorí pohyby typu <em>inventúra</em> s rozdielom.
          </li>
        </ol>
        <p>
          Inventúrny rozdiel <strong>nevstupuje do nákladov zákazky</strong> — je to oprava
          evidencie, nie spotreba materiálu.
        </p>
      </>
    ),
  },
  {
    id: "kategorie-import",
    title: "Kategórie, import a export",
    body: (
      <>
        <p>
          Karty sa dajú triediť do <Link to="/sklad/kategorie">kategórií</Link>. Pri väčšom sklade
          je to jediný spôsob, ako sa v ňom vyznať.
        </p>
        <p>
          Celý sklad naraz založíte cez <Link to="/sklad/import">Sklad → Import</Link> z CSV.
        </p>
        <p>
          Opačným smerom je <strong>Export skladu CSV</strong> v zozname skladových položiek. Súbor
          obsahuje SKU, názov, aktuálny a minimálny stav, nákupnú a predajnú cenu a hodnotu skladu.
          Je v UTF-8 so stredníkom ako oddeľovačom, takže sa otvorí v Exceli.
        </p>
      </>
    ),
  },
  {
    id: "typicke-chyby",
    title: "Na čo si dať pozor",
    body: (
      <>
        <ul>
          <li>
            <strong>Karta bez sledovania stavu</strong> sa nikdy neodpíše. Ak vám stav „nič nerobí",
            skontrolujte najprv tento prepínač.
          </li>
          <li>
            <strong>Príjem bez nákupnej ceny</strong> pokazí váženú cenu aj maržu. Cenu doplňte hneď,
            spätne sa dohľadáva ťažko.
          </li>
          <li>
            <strong>Koncept faktúry sklad nehýbe.</strong> Ak tovar odišiel, faktúru odošlite.
          </li>
          <li>
            <strong>Presun medzi skladmi nerobte výdajom a príjmom</strong> — pokazíte tým ocenenie
            aj históriu.
          </li>
          <li>
            <strong>Uzamknuté obdobie</strong> ({" "}
            <Link to="/pomoc/uzavierka">uzávierka</Link>) nepustí zmeny do starých dokladov. Ak sa
            pohyb nedá uložiť spätne, býva to práve toto.
          </li>
        </ul>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Sklad"
      title="Sklad vo Faktere"
      intro={
        <p>
          Čo sklad vie, ako sa v ňom pracuje a kde sa najčastejšie robia chyby. Sklad je prepojený s
          faktúrami, zákazkami aj objednávkami — tovar sa odpisuje sám.
        </p>
      }
      sections={sections}
    />
  );
}
