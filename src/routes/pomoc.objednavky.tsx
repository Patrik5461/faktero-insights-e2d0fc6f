import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/objednavky")({
  head: () => ({
    meta: [
      { title: "Pomoc — Prijaté objednávky — Faktero" },
      {
        name: "description",
        content:
          "Prijaté objednávky od odberateľov: potvrdenie, rezervácia tovaru, čiastočné fakturovanie a stav vybavenia.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/objednavky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/objednavky" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo sú prijaté objednávky",
    body: (
      <>
        <p>
          Objednávka je <strong>záväzok odberateľa</strong>, že si tovar alebo prácu vezme. Uzatvára
          reťaz <em>ponuka → objednávka → faktúra</em>: ponuka je návrh, ktorý ešte nikto neprijal;
          objednávka je prijatý návrh, ktorý sa postupne vybavuje.
        </p>
        <p>Objednávka odpovedá na dve otázky, na ktoré faktúra sama neodpovie:</p>
        <ul>
          <li>čo sme sľúbili a ešte nedodali,</li>
          <li>koľko peňazí máme rozpracovaných.</li>
        </ul>
      </>
    ),
  },
  {
    id: "vytvorenie",
    title: "Ako objednávka vznikne",
    body: (
      <>
        <p>Dvoma spôsobmi:</p>
        <ol>
          <li>
            ručne v <Link to="/objednavky/nova">Objednávky → Nová objednávka</Link>,
          </li>
          <li>
            z prijatej cenovej ponuky tlačidlom <strong>Vytvoriť objednávku</strong> — položky aj
            ceny prejdú tak, ako ich odberateľ videl.
          </li>
        </ol>
        <p>
          Číslo pridelí Faktero v tvare <code>OBJ{"{rok}{poradie}"}</code>. Zvlášť sa eviduje{" "}
          <strong>číslo objednávky u odberateľa</strong> — to sa potom napíše na faktúru, aby ju
          odberateľ vedel spárovať.
        </p>
        <p>
          Ceny sa dopĺňajú z <Link to="/pomoc/ceny">cenníka</Link> rovnako ako na faktúre.
        </p>
      </>
    ),
  },
  {
    id: "stavy",
    title: "Stavy objednávky",
    body: (
      <>
        <ul>
          <li>
            <strong>Rozpracovaná</strong> — pracujete na nej, dá sa voľne meniť aj zmazať.
          </li>
          <li>
            <strong>Potvrdená</strong> — objednávka platí. Ak je zapnutá rezervácia, tovar sa drží.
          </li>
          <li>
            <strong>Čiastočne vybavená</strong> — časť je vyfakturovaná.
          </li>
          <li>
            <strong>Vybavená</strong> — vyfakturované je všetko.
          </li>
          <li>
            <strong>Zrušená</strong> — z objednávky nebude nič; rezervácie sa uvoľnia.
          </li>
        </ul>
        <p>
          Stav sa <strong>nenastavuje ručne</strong>. Faktero ho počíta z toho, koľko je naozaj
          vyfakturované. Ručne nastavený stav by sa skôr či neskôr rozišiel so skutočnosťou.
        </p>
      </>
    ),
  },
  {
    id: "fakturovanie",
    title: "Vybavovanie faktúrami — aj po častiach",
    body: (
      <>
        <p>
          Na detaile objednávky je tlačidlo <strong>Vyfakturovať</strong>. Otvorí novú faktúru a
          prenesie do nej <strong>len to, čo ešte zostáva</strong> — nie celú objednávku.
        </p>
        <p>
          Množstvá vo faktúre sa dajú znížiť. Keď z objednaných 10 kusov vyfakturujete 4, objednávka
          prejde na <em>Čiastočne vybavená</em> a nabudúce vám ponúkne zvyšných 6. Keď dofakturujete
          zvyšok, prepne sa na <em>Vybavená</em> a tlačidlo zmizne.
        </p>
        <p>
          Vybavenie sa posunie <strong>až keď faktúra naozaj vznikne</strong>. Ak by sa uloženie
          faktúry nepodarilo, objednávka ostane, kde bola.
        </p>
        <p>
          V detaile objednávky je zoznam všetkých faktúr, ktoré z nej vznikli, a stĺpec{" "}
          <strong>Zostáva</strong> pri každej položke.
        </p>
      </>
    ),
  },
  {
    id: "rezervacia",
    title: "Rezervácia tovaru",
    body: (
      <>
        <p>
          Ak na objednávke zapnete <strong>Po potvrdení rezervovať tovar na sklade</strong>,
          potvrdením sa objednané množstvá zarezervujú. Tovar ostane fyzicky na sklade, ale zníži sa{" "}
          <strong>dostupné množstvo</strong>, takže ho niekto iný nepredá omylom.
        </p>
        <p>
          Rezervujú sa len položky, ktoré majú skladovú kartu so sledovaným stavom. Zrušením
          objednávky sa rezervácie zrušia, vybavením uvoľnia.
        </p>
      </>
    ),
  },
  {
    id: "uprava-mazanie",
    title: "Úprava, zrušenie, mazanie",
    body: (
      <>
        <p>
          Objednávku možno upravovať, kým nie je vybavená alebo zrušená. Pri úprave si{" "}
          <strong>pamätá, čo je už vyfakturované</strong> — prepis položiek vybavenie nevynuluje.
        </p>
        <p>
          <strong>Zmazať sa dá len rozpracovaná objednávka.</strong> Potvrdená je záväzok voči
          odberateľovi — tá sa <em>ruší</em>, aby po nej ostala stopa.
        </p>
      </>
    ),
  },
  {
    id: "termin",
    title: "Termíny",
    body: (
      <>
        <p>
          Požadovaný termín dodania je nepovinný, ale oplatí sa. Objednávka, ktorá je po termíne a
          nie je vybavená, sa v zozname označí červeným <em>po termíne</em> a v detaile upozorní.
        </p>
        <p>Rozpracovaná objednávka sa nesleduje — kým nie je potvrdená, nie je čo vybavovať.</p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Objednávky"
      title="Prijaté objednávky od odberateľov"
      intro={
        <p>
          Čo si u vás odberatelia objednali, čo z toho ešte nie je vyfakturované a ako sa objednávka
          vybavuje aj po častiach.
        </p>
      }
      sections={sections}
    />
  );
}
