import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/prijate-faktury")({
  head: () => ({
    meta: [
      { title: "Pomoc — Prijaté faktúry — Faktero" },
      {
        name: "description",
        content:
          "Evidencia prijatých faktúr vo Faktere: zápis, splatnosť, úhrady, priradenie na zákazku a DPH na vstupe.",
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
          <strong>Doklad</strong> (bloček) je už zaplatený výdavok. Patrí do{" "}
          <Link to="/pomoc/pokladna">Dokladov a pokladne</Link>, nie sem.
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
      intro={<p>Čo dlžíte, kedy to je splatné a ktorej zákazke to patrí.</p>}
      sections={sections}
    />
  );
}
