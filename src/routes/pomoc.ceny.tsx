import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/ceny")({
  head: () => ({
    meta: [
      { title: "Pomoc — Cenník a zľavy — Faktero" },
      {
        name: "description",
        content:
          "Cenové skupiny, individuálne ceny odberateľov, množstevné ceny a časovo ohraničené cenové akcie vo Faktere.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/ceny" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/ceny" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo je cenník",
    body: (
      <>
        <p>
          Bez cenníka má produkt jedinú cenu a zľavu prepisujete ručne na každom riadku každej
          faktúry. Cenník tú istú vec povie raz:{" "}
          <em>stavebníci majú −15 %, Novák má tehlu za 0,38 € a cez august beží akcia na tmely</em>.
          Doklad si potom cenu doplní sám.
        </p>
        <p>
          Cenník nájdete v <Link to="/ceny">Sklad → Cenník a zľavy</Link>, akcie v{" "}
          <Link to="/ceny/akcie">Cenové akcie</Link>.
        </p>
      </>
    ),
  },
  {
    id: "poradie",
    title: "V akom poradí sa cena vyberá",
    body: (
      <>
        <p>Faktero prechádza tieto možnosti zhora nadol a zoberie prvú, ktorá platí:</p>
        <ol>
          <li>
            <strong>Individuálna cena odberateľa</strong> — cena dohodnutá práve s ním.
          </li>
          <li>
            <strong>Cena jeho cenovej skupiny</strong>.
          </li>
          <li>
            <strong>Zľava v percentách</strong> zo základnej ceny. Zľava odberateľa prebíja zľavu
            skupiny — <strong>nesčítavajú sa</strong>. Kto má vlastných 10 % a je v skupine s 5 %,
            dostane 10 %, nie 15 %.
          </li>
          <li>
            <strong>Základná cena</strong> z katalógu produktov.
          </li>
        </ol>
        <p>
          Dohodnutá cena <strong>vypína percentuálnu zľavu</strong>. Keď má odberateľ na tehlu
          dohodnutých 0,38 €, jeho všeobecná zľava sa na ňu už neuplatní.
        </p>
      </>
    ),
  },
  {
    id: "vyssia-cena",
    title: "Dohodnutá cena môže byť aj vyššia",
    body: (
      <>
        <p>
          Nevyhráva najnižšia cena a je to zámer. Stály odberateľ má občas dohodnutú cenu{" "}
          <strong>vyššiu</strong> než pultovú — za prioritné dodanie, servis, dopravu na miesto.
          Taká cena musí prejsť.
        </p>
        <p>
          V cenníku takú položku spoznáte podľa oranžového znamienka plus vedľa dohodnutej ceny;
          zelené mínus znamená, že odberateľ platí menej než ostatní.
        </p>
      </>
    ),
  },
  {
    id: "mnozstevne",
    title: "Množstevné ceny",
    body: (
      <>
        <p>
          Pri každej dohodnutej cene sa dá zadať <strong>Od množstva</strong>. Nula znamená, že cena
          platí vždy.
        </p>
        <p>
          Pre ten istý produkt sa dá zadať viac prahov: 0 → 10 €, od 10 ks → 9 €, od 100 ks → 8 €.
          Faktero na riadku dokladu použije ten najvyšší prah, ktorý zadané množstvo dosiahne.
        </p>
        <p>
          Cena sa prepočíta <strong>hneď pri zmene množstva</strong> priamo vo formulári — nie až po
          uložení.
        </p>
      </>
    ),
  },
  {
    id: "skupiny",
    title: "Cenové skupiny",
    body: (
      <>
        <p>
          Skupina je spoločné nastavenie pre viacerých odberateľov — veľkoobchod, stáli zákazníci,
          e-shop. Má vlastnú percentuálnu zľavu a môže mať vlastné dohodnuté ceny.
        </p>
        <p>
          Odberateľa do skupiny zaradíte v jeho karte v <Link to="/odberatelia">Odberatelia</Link>.
          Tam sa nastavuje aj jeho <strong>individuálna zľava</strong>.
        </p>
        <p>
          Zmazaním skupiny sa odberatelia iba odviažu a stratia jej zľavu — dohodnuté ceny ostanú v
          histórii.
        </p>
      </>
    ),
  },
  {
    id: "akcie",
    title: "Cenové akcie",
    body: (
      <>
        <p>
          Akcia je časovo ohraničená zľava. Má názov, obdobie <em>od–do</em> (prázdne „do" znamená
          bez konca) a buď percentuálnu zľavu, alebo pevnú akciovú cenu na konkrétne produkty.
        </p>
        <p>
          Akcia môže platiť na <strong>celý sortiment</strong>, alebo len na produkty, ktoré do nej
          vyberiete. Pri vybraných produktoch sa dá zadať pevná akciová cena; keď ju necháte
          prázdnu, platí percentuálna zľava akcie.
        </p>
        <p>
          <strong>Akcia sa uplatní len vtedy, keď je pre odberateľa výhodnejšia</strong> než to, čo
          by dostal podľa cenníka. Akcia je marketing — nemá nikomu zdvihnúť cenu, ktorú má
          dohodnutú. Ak platí viac akcií naraz, vyhrá tá najvýhodnejšia.
        </p>
        <p>
          Akciu sa dá dočasne <strong>vypnúť</strong> bez mazania. Rozhoduje{" "}
          <strong>dátum dokladu</strong>, nie dnešok — faktúra vystavená spätne dostane cenu, ktorá
          platila v deň jej vystavenia.
        </p>
      </>
    ),
  },
  {
    id: "na-doklade",
    title: "Ako to vyzerá na doklade",
    body: (
      <>
        <p>
          Keď na faktúru, ponuku alebo objednávku pridáte produkt, cena sa doplní podľa cenníka a
          pod ňou sa zobrazí zeleným, prečo je taká — <em>Zľava odberateľa 10 %</em>,{" "}
          <em>Cena cenovej skupiny</em>, <em>Akcia Letný výpredaj −30 %</em>. Ak sa cena líši od
          základnej, je vedľa nej preškrtnutá pôvodná.
        </p>
        <p>
          Cena sa prepočíta aj po zmene odberateľa.{" "}
          <strong>Riadok, do ktorého ste zasiahli ručne, už cenník neprepisuje</strong> — vaša cena
          má vždy prednosť.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Cenník"
      title="Cenník, zľavy a cenové akcie"
      intro={
        <p>
          Dohodnuté ceny, cenové skupiny, množstevné ceny a časovo ohraničené akcie — a jasné
          pravidlo, ktorá cena vyhrá.
        </p>
      }
      sections={sections}
    />
  );
}
