import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_STORE_FAKTERO, APP_STORE_KNIHA_JAZD } from "@/lib/faktero/obchody";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/apka")({
  head: () => ({
    meta: [
      { title: "Pomoc — Aplikácia v telefóne — Faktero" },
      {
        name: "description",
        content:
          "Faktero v telefóne: vystavovanie faktúr a skenovanie dokladov bez signálu, automatické rozpoznanie jazdy a samostatná appka Kniha jázd.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/apka" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/apka" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "dve-appky",
    title: "Sú to dve appky",
    body: (
      <>
        <p>
          <strong>Faktero</strong> je celá agenda v telefóne — faktúry, doklady, banka aj jazdy.{" "}
          <strong>Kniha jázd</strong> je samostatná appka, ktorá vie len jazdy a nič iné.
        </p>
        <p>
          Dôvod je jednoduchý: vodičovi, ktorý má viesť knihu jázd, netreba dávať do rúk fakturáciu.
          Sú to dve ikony, dva záznamy v obchode a každá si pýta len tie povolenia, ktoré naozaj
          potrebuje. Účet je pritom ten istý — prihlásite sa rovnakým e-mailom a jazdy vidíte aj na
          webe vo <Link to="/jazdy">Fakturácia → Kniha jázd</Link>.
        </p>
      </>
    ),
  },
  {
    id: "odkial",
    title: "Odkiaľ ju vziať",
    body: (
      <>
        <p>
          Obe appky pre iPhone sú v App Store:{" "}
          <a href={APP_STORE_FAKTERO} target="_blank" rel="noopener noreferrer">
            Faktero
          </a>{" "}
          a samostatná{" "}
          <a href={APP_STORE_KNIHA_JAZD} target="_blank" rel="noopener noreferrer">
            Kniha jázd
          </a>
          .
        </p>
        <p>
          Verzia pre <strong>Android</strong> sa pripravuje. Dovtedy ju dostanete v testovaní na
          pozvánku — napíšte na <a href="mailto:servis@faktero.sk">servis@faktero.sk</a>.
        </p>
        <p>
          Appka sa <strong>neaktualizuje sama</strong>. Celé rozhranie je zabalené v nej, aby sa
          otvorila aj bez signálu — cenou za to je, že každá oprava znamená nový build. Keď vyjde
          novšia verzia, appka to sama zbadá a ponúkne ju; dovtedy pokojne používate tú svoju.
        </p>
      </>
    ),
  },
  {
    id: "co-vie",
    title: "Čo sa dá v telefóne spraviť",
    body: (
      <>
        <p>V spodnej lište je šesť miest:</p>
        <ul>
          <li>
            <strong>Prehľad</strong> — tržba za dnes a včera, kto ešte nezaplatil a rýchle tlačidlá
            na novú faktúru a nový doklad.
          </li>
          <li>
            <strong>Faktúry</strong> — vystavenie aj oprava už vystavenej faktúry, cenové ponuky,
            PDF a odoslanie e-mailom. Opravuje sa na tej istej obrazovke, na ktorej sa vystavuje.
          </li>
          <li>
            <strong>Doklady</strong> — nahraté a rozpoznané výdavkové doklady.
          </li>
          <li>
            <strong>Skener</strong> — odfotíte bloček alebo faktúru a text z nej prečíta server. Pri
            slovenských pokladničných dokladoch stačí naskenovať QR kód: doklad si Faktero vypýta
            priamo z Finančnej správy aj s položkami a sadzbami. Viac v{" "}
            <Link to="/pomoc/pokladna">manuáli k pokladni</Link>.
          </li>
          <li>
            <strong>Banka</strong> — zostatky a posledné pohyby z pripojených účtov.
          </li>
          <li>
            <strong>Jazdy</strong> — kniha jázd, vrátane tých, ktoré si telefón všimol sám.
          </li>
        </ul>
        <p>Účet aj firmu si v appke založíte sami — na web kvôli tomu chodiť netreba.</p>
      </>
    ),
  },
  {
    id: "bez-signalu",
    title: "Keď nie je signál",
    body: (
      <>
        <p>
          Appka sa otvorí a dá sa v nej pracovať aj úplne bez pripojenia. Prihlásenie, výber firmy
          aj rozpracované veci sú uložené priamo v telefóne, takže prežijú aj zatvorenie appky.
        </p>
        <p>Čo sa odloží a odošle samo po pripojení:</p>
        <ul>
          <li>
            <strong>jazdy</strong> — zapíšu sa lokálne a doplnia sa do knihy jázd,
          </li>
          <li>
            <strong>doklady zo skenera</strong> — fotka počká vo fronte a pošle sa, keď je obrazovka
            Doklady otvorená,
          </li>
          <li>
            <strong>faktúry</strong> — uložia sa a vystavia sa po pripojení. Číslo im vtedy pridelí
            server ako vždy.
          </li>
        </ul>
        <p>
          Na to posledné je jedna výnimka — ak musíte doklad odovzdať priamo na mieste, pozrite sa
          na čísla dopredu nižšie.
        </p>
      </>
    ),
  },
  {
    id: "cisla-dopredu",
    title: "Faktúra s číslom aj bez signálu",
    body: (
      <>
        <p>
          Remeselník po oprave alebo predajca z auta potrebuje odovzdať hotový doklad, nie prísľub.
          Pre nich sa dá zapnúť, aby si appka držala <strong>zopár čísel dopredu</strong> — faktúra
          potom dostane číslo hneď, aj keď je telefón offline.
        </p>
        <p>
          Predvolene je to <strong>vypnuté</strong>, a je to zámer: bežne stačí, že sa faktúra
          odloží a vystaví sa sama. Rezervované čísla, ktoré sa do dvoch týždňov nepoužijú, prepadnú
          a číslo sa vráti do rady — Faktero potom dieru zaplní ďalšou faktúrou, takže rad ostane
          bez medzier.
        </p>
      </>
    ),
  },
  {
    id: "jazda-sama",
    title: "Jazdu si telefón všimne sám",
    body: (
      <>
        <p>
          Appka rozpozná, že idete autom, a jazdu zapíše bez toho, aby ste čokoľvek stláčali. Trasa
          sa pritom drží <strong>v telefóne</strong> a nikam sa neposiela, kým ju appka neprevezme
          do knihy jázd.
        </p>
        <p>
          Aby to fungovalo, potrebuje appka polohu <strong>aj na pozadí</strong> — inak sa jazda
          začne zaznamenávať až vtedy, keď ju otvoríte, čo je väčšinou neskoro. Pri prvom spustení
          si o to povie a vysvetlí prečo.
        </p>
        <p>
          Adresu začiatku a konca aj vodiča dopĺňa server dodatočne, takže sa nemusíte trápiť s
          vypisovaním. Podrobnosti sú v <Link to="/pomoc/jazdy">manuáli ku knihe jázd</Link>.
        </p>
      </>
    ),
  },
  {
    id: "prihlasenie",
    title: "Prihlásenie a odhlásenie",
    body: (
      <>
        <p>
          Po prvom prihlásení sa dá zapnúť <strong>Face ID / Touch ID</strong> (na Androide
          odtlačok) a ďalej sa už heslo nepíše.
        </p>
        <p>
          Odhlásenie v appke odhlási <strong>len ten telefón</strong>. Na počítači ostanete
          prihlásený — to je dôležité, ak appku len požičiavate alebo skúšate.
        </p>
      </>
    ),
  },
  {
    id: "oznamenia",
    title: "Oznámenia",
    body: (
      <>
        <p>
          Na iPhone appka posiela upozornenia — napríklad na faktúry po splatnosti. Či registrácia
          naozaj prešla, uvidíte v appke v stave oznámení; je tam aj tlačidlo, ktorým sa dá
          zopakovať.
        </p>
        <p>
          <strong>Na Androide oznámenia zatiaľ nechodia.</strong> Appka je hotová, ale chýba jej
          napojenie na doručovaciu službu Googlu. Všetko ostatné na Androide funguje.
        </p>
      </>
    ),
  },
  {
    id: "jazyky",
    title: "Jazyky",
    body: (
      <p>
        Appka hovorí po <strong>slovensky, česky, anglicky, nemecky a maďarsky</strong> a jazyk si
        berie z telefónu. Ak je telefón v inom jazyku, zostane slovenčina. Jedinou výnimkou je
        obrazovka Diagnostika — tá je vždy po slovensky, pretože jej výstup čítame my.
      </p>
    ),
  },
  {
    id: "ked-nejde",
    title: "Keď niečo nejde",
    body: (
      <>
        <p>
          V appke je obrazovka <strong>Diagnostika</strong>. Povie naraz tri veci, ktoré sa z bežnej
          obrazovky rozlíšiť nedajú: akú verziu balíčka appka beží, či jej funguje pamäť v telefóne
          a či má pripojenie. <strong>Stačí z nej poslať snímku</strong> — je z nej vidieť viac než
          z akéhokoľvek opisu.
        </p>
        <p>
          Chybu sa dá nahlásiť aj priamo z appky. Správa nám príde na{" "}
          <a href="mailto:servis@faktero.sk">servis@faktero.sk</a> spolu s údajmi o telefóne, takže
          ju netreba nikam prepisovať.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Aplikácia v telefóne"
      title="Faktero v telefóne"
      intro={
        <p>
          Appka nie je zmenšený web. Je stavaná na to, čo sa robí v teréne — vystaviť faktúru,
          odfotiť bloček, nechať si zapísať jazdu — a funguje aj tam, kde nie je signál.
        </p>
      }
      sections={sections}
    />
  );
}
