import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/odberatelia")({
  head: () => ({
    meta: [
      { title: "Pomoc — Odberatelia — Faktero" },
      {
        name: "description",
        content:
          "Karta odberateľa vo Faktere: doplnenie údajov podľa IČO, cenová skupina, zľava, predvolená zákazka a mazanie.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/odberatelia" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/odberatelia" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "zalozenie",
    title: "Založenie odberateľa",
    body: (
      <>
        <p>
          V <Link to="/odberatelia">Kontakty → Odberatelia</Link> stačí začať písať názov firmy
          alebo zadať IČO — Faktero doplní adresu, DIČ aj IČ DPH z registra. Údaje sa dajú prepísať.
        </p>
        <p>
          Ak už odberateľ s rovnakým IČOm existuje, Faktero na to upozorní ešte pred uložením. Dva
          rovnaké kontakty znamenajú rozdelenú históriu faktúr.
        </p>
        <p>
          <strong>E-mail</strong> vyplňte vždy, keď chcete posielať faktúry a ponuky z Fakera — bez
          neho sa odoslanie neponúkne.
        </p>
      </>
    ),
  },
  {
    id: "ceny",
    title: "Cenová skupina a zľava",
    body: (
      <>
        <p>Na karte odberateľa sa nastavuje, za koľko nakupuje:</p>
        <ul>
          <li>
            <strong>Cenová skupina</strong> — spoločné podmienky pre viacerých odberateľov
            (veľkoobchod, stáli zákazníci).
          </li>
          <li>
            <strong>Individuálna zľava v %</strong> — platí len pre neho a{" "}
            <strong>prebíja zľavu skupiny</strong>; nesčítavajú sa.
          </li>
        </ul>
        <p>
          Konkrétne dohodnuté ceny na jednotlivé produkty sa zadávajú v{" "}
          <Link to="/ceny">cenníku</Link> a prebíjajú obe zľavy. Celé poradie vysvetľuje{" "}
          <Link to="/pomoc/ceny">manuál k cenníku</Link>.
        </p>
      </>
    ),
  },
  {
    id: "zakazka",
    title: "Predvolená zákazka",
    body: (
      <>
        <p>
          Ak pre odberateľa robíte jednu dlhodobú prácu, nastavte mu{" "}
          <strong>predvolenú zákazku</strong>. Každý nový doklad ju potom predvyplní sám.
        </p>
        <p>
          Je to najspoľahlivejší spôsob, ako sa vyhnúť tomu, že polovica dokladov zákazku nemá a
          vyhodnotenie práce je nepravdivé. Políčko sa zobrazí, až keď firma nejakú{" "}
          <Link to="/pomoc/zakazky">zákazku</Link> má.
        </p>
      </>
    ),
  },
  {
    id: "mazanie",
    title: "Mazanie",
    body: (
      <>
        <p>
          Zmazaný odberateľ zmizne zo zoznamu, ale <strong>faktúry ostávajú</strong> — nesú si
          vlastný odpis údajov z času vystavenia. Preto premenovanie odberateľa spätne neprepíše
          staré doklady.
        </p>
      </>
    ),
  },
  {
    id: "pohoda",
    title: "Odberatelia v Pohode",
    body: (
      <>
        <p>
          Adresár sa dá posielať do Pohody, takže tam odberateľ je aj vtedy, keď mu tento mesiac nič
          nefakturujete. Zmenený kontakt sa <strong>prepíše</strong>, nezaloží sa druhý.
        </p>
        <p>
          Zapína sa to vo <Link to="/firma">Firma → Pohoda</Link> — viac v{" "}
          <Link to="/pomoc/pohoda">manuáli k Pohode</Link>.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Kontakty"
      title="Odberatelia"
      intro={<p>Karta odberateľa, jeho ceny a zľavy a predvolená zákazka.</p>}
      sections={sections}
    />
  );
}
