import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/prijate-faktury")({
  head: () => ({
    meta: [
      { title: "Pomoc — Prijaté faktúry — Faktero" },
      {
        name: "description",
        content:
          "Prijaté faktúry vo Faktere: zápis ručne aj e-mailom, položky a náhľad dokladu, hromadné akcie, splatnosť, úhrady, platba z banky a DPH na vstupe.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/prijate-faktury" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/prijate-faktury" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo evidovať prijaté faktúry",
    body: (
      <>
        <p>Prijatá faktúra je to, čo dlžíte vy. Bez jej evidencie vám chýbajú tri veci:</p>
        <ul>
          <li>prehľad o tom, čo je splatné a kedy,</li>
          <li>
            <strong>DPH na vstupe</strong> — daň, ktorú si môžete odpočítať,
          </li>
          <li>
            náklady <Link to="/pomoc/zakazky">zákaziek</Link> — subdodávky, materiál od dodávateľa.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "zapis",
    title: "Zápis faktúry",
    body: (
      <>
        <p>
          V <Link to="/prijate-faktury/nova">Prijaté faktúry → Nová</Link> zadajte dodávateľa, číslo
          faktúry, dátum vystavenia, dodania a splatnosti, sumu bez DPH a sumu celkom.
        </p>
        <p>
          <strong>Dátum dodania</strong> rozhoduje o tom, do ktorého obdobia DPH faktúra patrí —
          vypĺňajte ho vždy, keď sa líši od dátumu vystavenia.
        </p>
        <p>
          Faktúru priraďte na <strong>zákazku</strong>, ak patrí ku konkrétnej práci. Ide to aj
          dodatočne, keď je obdobie už uzamknuté.
        </p>
      </>
    ),
  },
  {
    id: "odkial",
    title: "Štyri cesty, ako sa faktúra dostane dnu",
    body: (
      <>
        <p>Ručný zápis je len jedna z nich a väčšinou tá najpomalšia.</p>
        <ol>
          <li>
            <strong>E-mailom</strong> — faktúru od dodávateľa prepošlete na svoju adresu a zaeviduje
            sa sama. Najrýchlejšia cesta, popísaná v{" "}
            <Link to="/pomoc/doklady">manuáli k dokladom</Link>.
          </li>
          <li>
            <strong>Zo Skenera</strong> — PDF alebo fotku nahráte v{" "}
            <Link to="/faktury/skener">Skeneri dokladov</Link>.
          </li>
          <li>
            <strong>Presunom z Dokladov</strong> — keď sa z bločku vykľuje faktúra so splatnosťou,
            presuniete ju jedným tlačidlom a z Dokladov zmizne, aby sa náklad nepočítal dvakrát.
          </li>
          <li>
            <strong>Ručne</strong> — ako vyššie.
          </li>
        </ol>
        <p>
          V zozname je pri každej faktúre stĺpec <strong>Zapísal</strong>, takže vidíte, odkiaľ
          prišla: „E-mailom“, „Z dokladov“, alebo meno kolegu, ktorý ju vyplnil.
        </p>
      </>
    ),
  },
  {
    id: "detail",
    title: "Čo je na detaile faktúry",
    body: (
      <>
        <p>
          Okrem dodávateľa, dátumov a súm sú tam ešte dve veci, kvôli ktorým nemusíte otvárať
          prílohu:
        </p>
        <ul>
          <li>
            <strong>Položky z dokladu</strong> — riadky tabuľky, ktoré sa prečítali z prílohy. Sú
            len na prezretie: <strong>do skladu ani do účtovníctva nevstupujú</strong> a rozhodujú
            sumy v hlavičke. Faktúry zapísané pred zavedením tejto funkcie ich nemajú.
          </li>
          <li>
            <strong>Náhľad dokladu</strong> — PDF aj fotka sa zobrazia priamo na stránke, nič
            netreba sťahovať. Ak by ho prehliadač nezvládol (občas na mobile), je tam odkaz na
            otvorenie.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "hromadne",
    title: "Práca s viacerými naraz",
    body: (
      <>
        <p>
          Zaškrtnite riadky v zozname (alebo políčko v hlavičke pre všetky) a hore sa objaví lišta s
          akciami:
        </p>
        <ul>
          <li>
            <strong>Stiahnuť ZIP</strong> — PDF všetkých vybraných faktúr a k tomu súpiska v CSV. To
            je celý balík pre účtovníčku.
          </li>
          <li>
            <strong>Označiť ako prijaté</strong> — hodí sa po prezretí dávky, ktorá prišla mailom.
            Stornované a už prijaté faktúry sa preskočia.
          </li>
          <li>
            <strong>Vymazať</strong> — pýta sa na potvrdenie a povie, koľkých faktúr sa to týka.
            Doklady idú do koša, nemažú sa natvrdo.
          </li>
        </ul>
        <p>
          Zoznam sa dá filtrovať podľa stavu, mesiaca a dodávateľa, a hľadať sa dá aj podľa{" "}
          <strong>variabilného symbolu</strong>, ktorý je vo vlastnom stĺpci.
        </p>
      </>
    ),
  },
  {
    id: "uhrady",
    title: "Splatnosť a úhrady",
    body: (
      <>
        <p>
          Zoznam ukazuje, čo je splatné a čo po splatnosti. Po zaplatení faktúru označte za
          uhradenú.
        </p>
        <p>
          Ak máte pripojený <Link to="/pomoc/banka">bankový účet</Link>, úhrady sa dajú párovať s
          bankovými transakciami a nemusíte ich zapisovať ručne.
        </p>
        <p>
          Pri banke, ktorá to podporuje, sa dá faktúra rovno <strong>zaplatiť</strong> — tlačidlo
          „Zaplatiť cez banku“ na detaile pripraví príkaz a presmeruje vás do banky na podpis.{" "}
          <strong>Z účtu sa nič nestrhne, kým platbu nepodpíšete.</strong> Potrebná je k tomu
          faktúra s IBAN dodávateľa a samostatný súhlas na platby — súhlas na čítanie účtu nestačí.
        </p>
      </>
    ),
  },
  {
    id: "doklady",
    title: "Rozdiel oproti dokladom",
    body: (
      <>
        <p>
          <strong>Prijatá faktúra</strong> je záväzok s dátumom splatnosti — zaplatíte ju neskôr,
          zvyčajne prevodom.
        </p>
        <p>
          <strong>Doklad</strong> (bloček) je už zaplatený výdavok. Patrí medzi{" "}
          <Link to="/pomoc/doklady">Doklady</Link>, nie sem.
        </p>
        <p>
          Keď sa pomýlite, nič sa nedeje: doklad sa dá jedným tlačidlom presunúť sem a z Dokladov
          zmizne, aby ten istý náklad nefiguroval dvakrát.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Fakturácia"
      title="Prijaté faktúry"
      intro={
        <p>
          Čo dlžíte, kedy to je splatné a ktorej zákazke to patrí — vrátane faktúr, ktoré si
          nechávate doručiť e-mailom.
        </p>
      }
      sections={sections}
    />
  );
}
