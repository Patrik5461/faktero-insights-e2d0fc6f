import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/jazdy")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Kniha jázd — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Kniha jázd vo Faktere: vozidlá, spotreba, tankovanie, GPS záznam, priradenie jazdy na zákazku a export.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/jazdy" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/jazdy" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "zaciatok",
    title: "Než zapíšete prvú jazdu",
    body: (
      <>
        <p>
          Najprv založte vozidlo v <Link to="/jazdy/vozidla">Jazdy → Vozidlá a tankovanie</Link>.
          Okrem značky a evidenčného čísla vyplňte <strong>spotrebu v litroch na 100 km</strong>.
        </p>
        <p>
          Bez spotreby Faktero neurčí, koľko paliva sa minulo — a náklad na dopravu vyjde nula,
          vrátane <Link to="/pomoc/zakazky">vyhodnotenia zákaziek</Link>.
        </p>
      </>
    ),
  },
  {
    id: "jazda",
    title: "Zápis jazdy",
    body: (
      <>
        <p>
          V <Link to="/jazdy/nova">Jazdy → Nová jazda</Link> zadajte vozidlo, dátum, odkiaľ a kam,
          počet kilometrov a účel.
        </p>
        <p>
          Spotrebované palivo Faktero dopočíta zo spotreby vozidla. Jazdu možno priradiť na{" "}
          <strong>zákazku</strong> — potom sa jej cena objaví v nákladoch tej zákazky.
        </p>
        <p>
          Rozlišuje sa <strong>služobná</strong> a <strong>súkromná</strong> jazda; do nákladov idú
          len služobné. Charakter jazdy vyberiete priamo vo formulári a v zozname je súkromná jazda
          označená štítkom. Jazdy bez uvedeného charakteru sa berú ako služobné — tak vznikali
          staršie záznamy.
        </p>
      </>
    ),
  },
  {
    id: "uprava",
    title: "Oprava a vymazanie jazdy",
    body: (
      <>
        <p>
          Na každom riadku v <Link to="/jazdy">zozname jázd</Link> je ceruzka — otvorí tú istú jazdu
          na úpravu. Opraviť sa dá všetko vrátane tachometra, vozidla, zákazky aj charakteru jazdy.
        </p>
        <p>
          Pri jazdách stiahnutých z Commandera alebo zaznamenaných GPS-kou{" "}
          <strong>opravujte, nemažte</strong> — vymazaním sa stratí uložená trasa. Nočná
          synchronizácia ju sama nevráti, lebo sťahuje len čerstvé dni; museli by ste si dané
          obdobie natiahnuť ručne v <Link to="/jazdy/integracie/commander">Integráciách</Link>.
        </p>
        <p>
          Kôš na jazdy nie je: vymazanie je okamžité a nedá sa vrátiť. Preto sa pýta na potvrdenie.
        </p>
      </>
    ),
  },
  {
    id: "tankovanie",
    title: "Tankovanie a cena paliva",
    body: (
      <>
        <p>
          Tankovania sa zapisujú pri vozidle. Z nich Faktero berie <strong>cenu za liter</strong>,
          ktorou oceňuje jazdy.
        </p>
        <p>
          Použije sa posledná cena z tankovaní daného vozidla; ak vozidlo tankovanie nemá, posledná
          cena ktoréhokoľvek vozidla firmy. Kým nie je ani jedno tankovanie, jazdy sa neocenia.
        </p>
      </>
    ),
  },
  {
    id: "gps",
    title: "GPS a automatický záznam",
    body: (
      <>
        <p>
          <Link to="/jazdy/gps">GPS jazda</Link> zaznamená trasu priamo v mobile — stačí spustiť na
          začiatku a ukončiť na konci cesty. Kilometre sa dopočítajú samy.
        </p>
        <p>
          Cez <Link to="/jazdy/integracie">Integrácie</Link> sa dajú jazdy sťahovať automaticky z
          GPS systému vo vozidle (Commander, GPS Dozor a ďalšie) alebo z vozidla Tesla — pozri časť
          Integrácie GPS nižšie.
        </p>
        <p>
          <strong>V mobilnej aplikácii si jazdu všimne telefón sám.</strong> Keď rozpozná, že idete
          autom, začne merať a spýta sa až na konci — jazdu potom buď potvrdíte, alebo zahodíte. Kým
          meranie beží, je to vidieť: v aplikácii svieti pruh „Nahrávam jazdu“ a{" "}
          <strong>na uzamknutej obrazovke</strong> beží čas a narastajúce kilometre, takže sa
          nemusíte prepínať do aplikácie ani ju nechať otvorenú. Potrebuje to iPhone s iOS 16.1
          alebo novším.
        </p>
        <p>
          Automatické rozpoznávanie sa dá vypnúť priamo na obrazovke <strong>Jazda</strong>{" "}
          prepínačom „Rozpoznávať jazdy automaticky“; vtedy sa meranie spúšťa ručne tlačidlom.
        </p>
      </>
    ),
  },
  {
    id: "integracie",
    title: "Integrácie GPS",
    body: (
      <>
        <p>
          V <Link to="/jazdy/integracie">Integráciách</Link> vyberte svoj GPS systém a zadajte
          prihlasovacie údaje — tie isté, ktorými sa prihlasujete u poskytovateľa, alebo API kľúč,
          ak ho poskytovateľ vydáva. Tlačidlo <strong>Otestovať pripojenie</strong> overí údaje bez
          uloženia. Heslá a kľúče sa ukladajú zašifrované a po uložení sa už nezobrazujú.
        </p>
        <p>
          Po pripojení sa načítajú vozidlá a{" "}
          <strong>spárujú sa s vozidlami knihy jázd podľa EČV</strong>. Vozidlo, ktoré sa
          nespárovalo, priraďte ručne alebo ho tlačidlom <strong>Založiť vozidlo</strong> pridajte.
          Jazdy sa sťahujú len pre spárované vozidlá.
        </p>
        <p>
          Prvé stiahnutie vezme <strong>posledných 30 dní</strong>, potom sa jazdy sťahujú každú
          noc. Tlačidlo <strong>Synchronizovať teraz</strong> ich stiahne hneď; pri veľa vozidlách
          sa stiahne len časť a zvyšok dokončí ďalšie spustenie. Tá istá jazda sa do knihy nikdy
          nezapíše dvakrát. Ak systém rozlišuje súkromné a služobné jazdy, prevezme sa aj to,
          rovnako ako vodič, adresy a spotreba. Systémy, ktoré evidujú tankovania, ich pridajú k
          vozidlu.
        </p>
        <p>
          Odpojením účtu sa zastaví sťahovanie; jazdy a tankovania, ktoré už sú v knihe jázd,
          ostávajú.
        </p>
      </>
    ),
  },
  {
    id: "prehlad-export",
    title: "Prehľad a export",
    body: (
      <>
        <p>
          <Link to="/jazdy/prehlad">Prehľad</Link> ukazuje najazdené kilometre a náklady po
          vozidlách a obdobiach.
        </p>
        <p>
          <Link to="/jazdy/export">Export</Link> pripraví knihu jázd na odovzdanie účtovníčke alebo
          na kontrolu.
        </p>
        <p>
          Na knihu jázd platí <Link to="/pomoc/uzavierka">uzamknutie období</Link> — po uzavretí sa
          staré jazdy už nedajú meniť.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Kniha jázd"
      title="Kniha jázd"
      intro={<p>Vozidlá, spotreba, tankovanie, GPS záznam a prepojenie jázd so zákazkami.</p>}
      sections={sections}
    />
  );
}
