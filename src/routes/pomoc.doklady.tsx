import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/doklady")({
  head: () => ({
    meta: [
      { title: "Pomoc — Doklady a skenovanie — Faktero" },
      {
        name: "description",
        content:
          "Doklady vo Faktere: odfotenie bločku, načítanie eKasa QR kódu z Finančnej správy, nahratie PDF, presun medzi prijaté faktúry a odovzdanie účtovníčke.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/doklady" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/doklady" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Čo sú Doklady a čím sa líšia od prijatých faktúr",
    body: (
      <>
        <p>
          <Link to="/doklady">Doklady</Link> sú drobné výdavky, ktoré nemajú faktúru — bločky z
          čerpačky, z obchodu, z parkoviska, účtenky z reštaurácie. Odfotíte ich hneď na mieste a
          účtovníčka ich má na konci mesiaca pokope.
        </p>
        <p>
          <Link to="/pomoc/prijate-faktury">Prijaté faktúry</Link> sú naproti tomu doklady so
          splatnosťou, ktoré niekomu dlžíte. Ak sa z bločku vykľuje faktúra, netreba ju prepisovať —
          pozri <a href="#presun">Presun medzi prijaté faktúry</a>.
        </p>
      </>
    ),
  },
  {
    id: "novy",
    title: "Tri spôsoby, ako doklad dostať dnu",
    body: (
      <>
        <p>
          V <Link to="/doklady/novy">Doklady → Nový doklad</Link> máte tri tlačidlá:
        </p>
        <ul>
          <li>
            <strong>Odfotiť</strong> — fotku prečíta AI a doplní dodávateľa, dátum, sumu, sadzby DPH
            aj jednotlivé položky.
          </li>
          <li>
            <strong>QR kód</strong> — naskenuje eKasa QR z bločku. To je najpresnejšia cesta, viac
            nižšie.
          </li>
          <li>
            <strong>Nahrať súbor</strong> — fotka alebo PDF z počítača. Súbor sa dá aj pretiahnuť
            myšou do vyznačenej plochy.
          </li>
        </ul>
        <p>
          Po načítaní sa formulár vyplní sám, ale <strong>zostáva na vás ho skontrolovať</strong>.
          Doplňte kategóriu (napríklad „pohonné hmoty“), spôsob platby — hotovosťou, kartou alebo
          prevodom — a prípadne poznámku.
        </p>
      </>
    ),
  },
  {
    id: "ekasa",
    title: "eKasa QR kód",
    body: (
      <>
        <p>
          QR kód na slovenskom bločku nenesie sumu ani položky — nesie{" "}
          <strong>identifikátor dokladu (UID)</strong>. Faktero si s ním vypýta celý doklad priamo z
          Finančnej správy, takže sa načíta presne to, čo predajca odoslal: dodávateľ, IČO, dátum,
          čas, položky aj rozpis DPH.
        </p>
        <p>Podľa toho, ako sa doklad podarilo získať, svieti nad formulárom štítok:</p>
        <ul>
          <li>
            <strong>✓ Načítané z Finančnej správy</strong> — údaje sú overené, netreba ich
            kontrolovať.
          </li>
          <li>
            <strong>Len z QR kódu</strong> — doklad sa vo Finančnej správe nenašiel (stáva sa pri
            čerstvých bločkoch alebo pri výpadku ich systému). Suma z QR kódu sedí, položky chýbajú.
          </li>
          <li>
            <strong>Odhadnuté z fotky</strong> — QR sa nedal prečítať a údaje odhadla AI.{" "}
            <strong>Tie si prejdite</strong>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "hotovost",
    title: "Doklady a pokladňa",
    body: (
      <>
        <p>
          Ak dáte spôsob platby <strong>hotovosťou</strong>, doklad automaticky uberie z hotovosti v{" "}
          <Link to="/pokladna">pokladni</Link> — nemusíte k nemu robiť ešte aj výdavkový pokladničný
          doklad. Podrobne v <Link to="/pomoc/pokladna">manuáli k pokladni</Link>.
        </p>
        <p>Doklad platený kartou alebo prevodom stav pokladne nemení.</p>
      </>
    ),
  },
  {
    id: "presun",
    title: "Presun medzi prijaté faktúry",
    body: (
      <>
        <p>
          Keď sa ukáže, že nahratý doklad je v skutočnosti faktúra so splatnosťou, presuniete ho
          jedným tlačidlom na riadku v zozname dokladov. Prenesie sa aj s prílohou a{" "}
          <strong>z Dokladov zmizne</strong> — aby sa ten istý náklad nepočítal dvakrát.
        </p>
      </>
    ),
  },
  {
    id: "prehlad",
    title: "Zoznam, filtre a odovzdanie účtovníčke",
    body: (
      <>
        <p>
          Zoznam sa filtruje podľa <strong>mesiaca</strong> a <strong>stavu</strong> (spracované,
          exportované). Pri každom doklade vidno dátum, dodávateľa, sumu a <strong>zdroj</strong> —
          teda či prišiel z eKasy, z fotky alebo bol nahratý ručne.
        </p>
        <p>
          Do balíka pre účtovníčku idú doklady spolu s faktúrami cez{" "}
          <Link to="/exporty">Účtovné exporty</Link>; ak účtujete v Pohode, prenesú sa aj tam —
          pozri <Link to="/pomoc/pohoda">Prepojenie s Pohodou</Link>.
        </p>
      </>
    ),
  },
  {
    id: "mailom",
    title: "Doklady e-mailom",
    body: (
      <>
        <p>
          Najrýchlejšia cesta, ako dostať faktúru od dodávateľa dnu: nechať ju tam prísť samu. Každá
          firma má vlastnú adresu, napríklad <code>vasafirma-k7f2p9@doklady.faktero.sk</code>, a čo
          na ňu prepošlete, to sa spracuje.
        </p>
        <p>
          Adresu nájdete v <Link to="/doklady/mailom">Doklady → Doklady e-mailom</Link>. Skopírujete
          ju a prepošlete na ňu mail od dodávateľa — nič sa nesťahuje a nikam sa neprihlasujete. Z
          PDF v prílohe sa prečíta dodávateľ, IČO, IČ DPH, IBAN, číslo faktúry, variabilný symbol,
          dátum vystavenia aj splatnosti, sumy a <strong>jednotlivé položky</strong> — tie sú na
          detaile dokladu len na prezretie, do skladu ani do účtovníctva nevstupujú.
        </p>
        <p>
          Na detaile dokladu je aj <strong>náhľad prílohy</strong>, takže na prezretie nemusíte nič
          sťahovať.
        </p>
        <p>
          Doklad potom čaká medzi <Link to="/prijate-faktury">prijatými faktúrami</Link> ako{" "}
          <strong>rozpracovaný</strong>. <strong>Nič sa neschváli samo</strong> — prezriete si ho a
          uložíte.
        </p>
        <p>Čo je dobré vedieť:</p>
        <ul>
          <li>
            Adresa je pre <strong>každú firmu iná</strong>. Ak máte firiem viac, prepnite sa hore v
            lište a vezmite si tú správnu.
          </li>
          <li>
            Berie sa <strong>PDF alebo fotka</strong> v prílohe. Mail bez prílohy sa v denníku
            označí ako „bez prílohy“ a nič sa nezaloží.
          </li>
          <li>
            Viac príloh v jednom maile znamená <strong>viac dokladov</strong> — každá sa spracuje
            zvlášť.
          </li>
        </ul>
        <p>
          Adresa sa dá <strong>zmeniť na vlastnú</strong> — tlačidlom „Zvoliť vlastnú" si namiesto
          náhodného konca zadáte svoje slovo a číslo, napríklad{" "}
          <code>doklady-2026@doklady.faktero.sk</code>. Diakritiku, medzery a veľké písmená si
          Faktero opraví samo a hneď ukáže, ako bude adresa naozaj vyzerať.
        </p>
        <p>
          <strong>Pozor, adresa je zároveň heslo.</strong> Kto ju pozná, vie vám poslať doklad —
          preto sa predvolene generuje s náhodným koncom, ktorý sa nedá uhádnuť z názvu firmy.
          Krátku a logickú adresu si vie domyslieť aj cudzí človek. Ak vlastnú chcete, pridajte do
          nej niečo svoje, čo nie je na prvý pokus zrejmé.
        </p>
        <p>
          Na tej istej stránke je aj <strong>denník posledných mailov</strong> — pri každom vidno,
          ako dopadol. Keď doklad nedorazil, začnite tam. A keby sa adresa dostala tam, kam nemá, dá
          sa vypnúť alebo vymeniť za novú; stará vtedy prestane prijímať.
        </p>
      </>
    ),
  },
  {
    id: "gmail",
    title: "Automatické preposielanie z Gmailu",
    body: (
      <>
        <p>
          Prepošlite si doklady <strong>raz a navždy</strong>: Gmail vie posielať kópiu pošty na inú
          adresu sám. Nastavíte to v Gmaile v{" "}
          <strong>Nastavenia → Preposielanie a POP/IMAP → Pridať adresu na preposielanie</strong>,
          kam vložíte svoju adresu z <Link to="/doklady/mailom">Doklady → Doklady e-mailom</Link>.
        </p>
        <p>
          Google si to musí overiť, a preto pošle <strong>potvrdzovací mail</strong> — lenže pošle
          ho na tú novú adresu, teda k nám. Preto ho <strong>Faktero zachytí a ukáže vám ho</strong>
          : na stránke Doklady e-mailom sa objaví žltý pruh „Google žiada potvrdenie preposielania“.
          Objaví sa sám, netreba obnovovať stránku.
        </p>
        <p>V pruhu je to, čo od vás Google chce:</p>
        <ul>
          <li>
            tlačidlo <strong>Potvrdiť preposielanie</strong> — odkaz od Googlu. Funguje len v
            prehliadači, kde ste prihlásený do <strong>tej istej</strong> schránky;
          </li>
          <li>
            <strong>kód</strong>, keď ho Google poslal — dá sa skopírovať a vložiť priamo v Gmaile
            vedľa tlačidla „Overiť“. Google ho ale posiela len niekedy, väčšinou príde iba odkaz;
          </li>
          <li>
            tlačidlo <strong>Už som potvrdil</strong>, ktorým pruh odpracete — Google nám o
            potvrdení nedá vedieť, takže sám nezmizne.
          </li>
        </ul>
        <p>
          Potom sa vráťte do Gmailu, zapnite{" "}
          <strong>„Preposielať kópiu doručenej pošty na…“</strong> a uložte. Samotné overenie
          preposielanie ešte nezapne.
        </p>
        <p>
          <strong>Odporúčame nepreposielať všetko.</strong> V Gmaile si radšej spravte filter (
          <em>Vyhľadávanie → Vytvoriť filter → Preposlať na</em>) napríklad na maily s prílohou
          alebo na konkrétnych dodávateľov. Inak sa Faktero pokúsi spraviť doklad z každého mailu,
          čo vám príde, a denník sa zaplní hláškami „bez prílohy“.
        </p>
        <p>
          Potvrdenie platí <strong>sedem dní</strong>. Keď ho prešvihnete, jednoducho pridajte
          adresu v Gmaile znova — príde nové.
        </p>
        <p>
          <strong>Prečo je to bezpečné.</strong> Potvrdzovací mail prijmeme len od skutočnej adresy
          Googlu a len vtedy, keď sedí jeho elektronický podpis (SPF a DKIM domény{" "}
          <code>google.com</code>). Podvrhnutý mail „od Googlu“ s cudzím odkazom zahodíme. Z mailu
          si navyše necháme iba kód, odkaz a adresu schránky, z ktorej sa preposiela —{" "}
          <strong>obsah mailu sa nikam neukladá</strong>.
        </p>
      </>
    ),
  },
  {
    id: "mobil",
    title: "V telefóne",
    body: (
      <>
        <p>
          Skenovanie je hlavný dôvod, prečo mať Faktero v telefóne — bloček odfotíte hneď pri
          pokladni a nemusíte ho nosiť domov. Funguje to <strong>aj bez signálu</strong>: doklad sa
          uloží do telefónu a odošle sa, keď sa pripojíte.
        </p>
        <p>
          Faktúru z PDF viete rovnakým spôsobom načítať aj v{" "}
          <Link to="/faktury/skener">Skeneri dokladov</Link> na webe.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Doklady"
      title="Doklady a skenovanie"
      intro={
        <p>
          Bločky a drobné výdavky — odfotené, načítané z eKasa QR kódu alebo nahraté ako PDF, vždy
          pripravené pre účtovníčku.
        </p>
      }
      sections={sections}
    />
  );
}
