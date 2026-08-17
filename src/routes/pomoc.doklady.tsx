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
