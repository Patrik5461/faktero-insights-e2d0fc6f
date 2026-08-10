import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/pokladna")({
  head: () => ({
    meta: [
      { title: "Pomoc — Pokladňa a doklady — Faktero" },
      {
        name: "description",
        content:
          "Pokladňa vo Faktere: stav hotovosti, pokladničné doklady, bločky, spôsob platby a načítanie eKasa QR kódu.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/pokladna" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/pokladna" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Čo pokladňa robí",
    body: (
      <>
        <p>
          <Link to="/pokladna">Pokladňa</Link> odpovedá na otázku, koľko máte v hotovosti a ako sa k
          tomu číslu prišlo. Stav skladá z <strong>dvoch zdrojov</strong>:
        </p>
        <ul>
          <li>
            <strong>pokladničné doklady</strong> — vklady, výbery, tržby, ktoré nemajú vlastný
            doklad,
          </li>
          <li>
            <strong>doklady zaplatené hotovosťou</strong> z evidencie výdavkov (bločky).
          </li>
        </ul>
        <p>
          Doklad zaplatený <strong>kartou alebo prevodom</strong> je výdavok, ale hotovosť neuberá.
          Toto rozlíšenie je jadro celého výpočtu — bez neho by pokladňa ukazovala mínus.
        </p>
      </>
    ),
  },
  {
    id: "sposob-platby",
    title: "Spôsob platby na doklade",
    body: (
      <>
        <p>
          Pri každom doklade v <Link to="/doklady/novy">Doklady → Nový doklad</Link> vyberte{" "}
          <strong>Platené</strong>: hotovosťou, kartou alebo prevodom.
        </p>
        <p>
          Ak spôsob nevyplníte, Faktero berie doklad ako hotovostný — to je pri bločkoch najčastejší
          prípad. Keď vám pokladňa vychádza nižšie, než by mala, prvé miesto, kam sa pozrieť, sú
          doklady zaplatené kartou označené ako hotovostné.
        </p>
      </>
    ),
  },
  {
    id: "doklady-pokladne",
    title: "Pokladničné doklady",
    body: (
      <>
        <p>
          Priamo v pokladni pridávate príjmy a výdaje, ktoré nemajú vlastný doklad — vklad
          majiteľa, odvod tržby do banky, drobný nákup bez bločku.
        </p>
        <p>
          Číslujú sa v tvare <code>PD{"{rok}{poradie}"}</code>. Suma je vždy kladná, smer určuje druh
          pohybu.
        </p>
        <p>
          <strong>Hotovostný bloček sa do pokladne neprepisuje.</strong> Pokladňa ho číta priamo z
          evidencie dokladov. Jedna suma, jedno miesto na opravu, žiadna synchronizácia — keby ste
          bloček zapísali aj ako pokladničný doklad, hotovosť by odišla dvakrát.
        </p>
      </>
    ),
  },
  {
    id: "priebeh",
    title: "Priebeh a zostatok",
    body: (
      <>
        <p>
          Tabuľka ukazuje pohyby vybraného mesiaca a pri každom <strong>priebežný zostatok</strong>.
          Nad ňou je zostatok na začiatku obdobia, aby stav sedel aj pri prezeraní starších mesiacov.
        </p>
        <p>
          V rámci jedného dňa idú <strong>príjmy pred výdavkami</strong>. Inak by sa mohlo stať, že
          bloček zoradený pred vklad ukáže v ten deň mínus, hoci v pokladni nikdy nechýbalo.
        </p>
        <p>
          <strong>Záporná pokladňa je vždy chyba v evidencii</strong> — v hotovosti sa do mínusu ísť
          nedá. Faktero na ňu upozorní; hľadajte chýbajúci vklad alebo doklad označený zlým spôsobom
          platby.
        </p>
      </>
    ),
  },
  {
    id: "ekasa",
    title: "Načítanie bločku z eKasa QR kódu",
    body: (
      <>
        <p>
          Každý bloček z eKasy má QR kód a v ňom identifikátor dokladu. Faktero ten identifikátor
          prečíta a doklad si vypýta priamo z Finančnej správy — teda z toho istého miesta, kde si
          doklad overuje aj ich vlastná aplikácia „Overenie pokladničného dokladu". Späť príde
          predajca, IČO, dátum, sumy, sadzby DPH <strong>aj jednotlivé položky</strong>, presne tak,
          ako ich predajca odoslal. Nič sa nehádá z fotky.
        </p>
        <p>
          Stačí bločok odfotiť v <Link to="/faktury/skener">Skeneri dokladov</Link> alebo v{" "}
          <Link to="/doklady/novy">Doklady → Nový doklad</Link>; QR kód sa hľadá aj na fotke, takže
          netreba mieriť zvlášť naň. Odfoťte doklad celý.
        </p>
        <p>
          <strong>Keď QR kód nie je alebo sa nedá prečítať</strong> — pokrčený bloček, vyblednutá
          termopáska, zahraničný doklad — údaje sa prečítajú z fotky. To je odhad, nie úradný údaj, a
          Faktero to pri doklade aj napíše. Vtedy si skontrolujte hlavne dátum a sumu.
        </p>
        <p>
          Doklad sa vo Finančnej správe nemusí nájsť ani vtedy, keď ho predajca ešte neodoslal —
          pokladnica v režime offline ho posiela až dodatočne. Skúste to o pár hodín neskôr.
        </p>
        <p>
          <strong>Spôsob úhrady sa z bločku prečítať väčšinou nedá.</strong> Pokladnica ho do eKasy
          posielať nemusí a väčšina ho neposiela — na doklade býva vytlačený, ale do údajov sa
          nedostane. Keď ho doklad nesie, Faktero ho predvolí; inak si po naskenovaní vyberiete
          hotovosť, kartu alebo prevod. Nie je to formalita: z pokladne uberá len doklad platený
          hotovosťou.
        </p>
        <p>
          Položky sa ukladajú k dokladu tak, ako prišli, aj s rozpisom DPH po sadzbách. Bloček ich
          má často viac naraz — jedna sadzba by doklad popísala nesprávne.
        </p>
      </>
    ),
  },
  {
    id: "uzavierka",
    title: "Pokladňa a uzávierka",
    body: (
      <>
        <p>
          Pokladničný doklad je daňový záznam ako faktúra, takže platí aj naň{" "}
          <Link to="/pomoc/uzavierka">uzamknutie období</Link>. Po uzamknutí sa v ňom už nedá meniť
          dátum, suma ani popis.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Pokladňa"
      title="Pokladňa, doklady a eKasa"
      intro={
        <p>
          Koľko máte v hotovosti, odkiaľ sa to číslo berie a ako z bločku dostať údaje bez
          prepisovania.
        </p>
      }
      sections={sections}
    />
  );
}
