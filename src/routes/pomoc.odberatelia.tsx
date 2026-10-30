import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";
import { VideoNavodPlayer } from "@/components/faktero/VideoNavodPlayer";
import { videoJsonLd, videoNavod } from "@/lib/faktero/video-navody";

const VIDEO_ODBERATEL = videoNavod("pridanie-odberatela");

export const Route = createFileRoute("/pomoc/odberatelia")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Odberatelia — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Karta odberateľa vo Faktere: doplnenie údajov podľa IČO, cenová skupina, zľava, predvolená zákazka a mazanie.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/odberatelia" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/odberatelia" }],
    scripts: VIDEO_ODBERATEL
      ? [{ type: "application/ld+json", children: JSON.stringify(videoJsonLd(VIDEO_ODBERATEL)) }]
      : [],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "zalozenie",
    title: "Založenie odberateľa",
    body: (
      <>
        {VIDEO_ODBERATEL && <VideoNavodPlayer video={VIDEO_ODBERATEL} className="not-prose mb-5" />}
        <p>
          V <Link to="/odberatelia">Kontakty → Odberatelia</Link> stačí začať písať názov firmy
          alebo zadať IČO — Faktero doplní adresu, DIČ aj IČ DPH z registra. Údaje sa dajú prepísať.
        </p>
        <p>
          Ak už odberateľ s rovnakým IČOm existuje, Faktero na to upozorní ešte pred uložením. Dva
          rovnaké kontakty znamenajú rozdelenú históriu faktúr.
        </p>
        <p>
          <strong>E-mail</strong> vyplňte vždy, keď chcete posielať faktúry a ponuky z Faktera — bez
          neho sa odoslanie neponúkne.
        </p>
      </>
    ),
  },
  {
    id: "dodavatelia",
    title: "Dodávatelia a spoločný adresár",
    body: (
      <>
        <p>
          Odberatelia aj <Link to="/dodavatelia">dodávatelia</Link> sú v jednom adresári, ako v
          Pohode. Na karte kontaktu zaškrtnete <strong>Odberateľ</strong>,{" "}
          <strong>Dodávateľ</strong> alebo oboje — firma, ktorá vám dodáva aj od vás nakupuje, je v
          adresári raz.
        </p>
        <p>
          Pri faktúre, ponuke či objednávke sa ponúkajú len odberatelia. Pri{" "}
          <strong>prijatej faktúre</strong> vyberiete dodávateľa zo zoznamu a doplní sa jeho IČO,
          DIČ, IČ DPH aj IBAN. Nového dodávateľa z prijatej faktúry Faktero do adresára uloží samo
          (dá sa to odškrtnúť).
        </p>
        <p>
          Dodávateľov, od ktorých už máte prijaté faktúry, naplníte naraz: v Dodávateľoch kliknite
          na <strong>Importovať</strong> → <strong>Načítať z prijatých faktúr</strong>.
        </p>
      </>
    ),
  },
  {
    id: "import",
    title: "Import odberateľov a dodávateľov z Pohody a iných systémov",
    body: (
      <>
        <p>
          V <Link to="/odberatelia">Odberateľoch</Link> alebo{" "}
          <Link to="/dodavatelia">Dodávateľoch</Link> kliknite na <strong>Importovať</strong> a
          vyberte súbor. Faktero rozpozná:
        </p>
        <ul>
          <li>
            <strong>Pohoda</strong> — XML export adresára (Súbor → Dátová komunikácia → XML export),
            XML export faktúr (odberatelia sa vyberú z nich) alebo tabuľku adresára uloženú do
            Excelu.
          </li>
          <li>
            <strong>Money S3</strong> — XML export adresára.
          </li>
          <li>
            <strong>SuperFaktúra, iDoklad, Fakturoid, KROS, Omega</strong> a ďalšie — export
            klientov do CSV alebo Excelu. Stĺpce sa priradia podľa hlavičky; ak niektorý nesedí,
            zmeníte ho priamo v okne importu.
          </li>
        </ul>
        <p>
          Pred importom uvidíte, koľko odberateľov sa založí a koľko už máte. Existujúci sa hľadajú
          podľa IČO, bez neho podľa názvu, a <strong>nikdy sa neprepíšu</strong> — ak chcete,
          doplnia sa im len prázdne údaje (napríklad e-mail alebo IČ DPH). Ten istý odberateľ v
          súbore viackrát sa založí raz.
        </p>
        <p>
          <strong>Povinné číslo objednávky.</strong> Keď partner chce na každom doklade číslo svojej
          objednávky, zaškrtnite to na jeho karte. Faktúra pre neho a doklad od neho v
          Nespracovaných potom bez čísla objednávky ukážu upozornenie — uložiť sa dajú aj tak.
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
          Zapína sa to v <Link to="/uctovnictvo/pohoda">Účtovníctvo → Prepojenie s Pohodou</Link> —
          viac v <Link to="/pomoc/pohoda">manuáli k Pohode</Link>.
        </p>
      </>
    ),
  },
  {
    id: "vies",
    title: "Overenie IČ DPH vo VIES",
    body: (
      <>
        <p>
          Pri odberateľovi z iného členského štátu je vedľa poľa IČ DPH tlačidlo{" "}
          <strong>Overiť vo VIES</strong>. Register Európskej komisie povie, či je číslo platné, a
          doplní názov firmy.
        </p>
        <p>
          Nie je to formalita: pri dodaní tovaru do EÚ je platné IČ DPH odberateľa{" "}
          <strong>podmienkou oslobodenia od dane</strong>. Každé overenie sa zapíše aj s dátumom,
          takže sa dá pri kontrole preukázať; po tridsiatich dňoch sa označí za staršie a pred
          ďalším dodaním sa oplatí overiť znova.
        </p>
        <p>
          Keď je register nedostupný, Faktero to povie ako výpadok — nie ako neplatné IČ DPH. To sú
          dve rôzne veci a rozhodujú o tom, či faktúra smie ísť bez dane.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Kontakty"
      title="Odberatelia"
      intro={<p>Karta odberateľa, jeho ceny a zľavy a predvolená zákazka.</p>}
      sections={sections}
    />
  );
}
