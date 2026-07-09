import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/predplatne")({
  head: () => ({
    meta: [
      { title: "Pomoc — Predplatné — Faktero" },
      { name: "description", content: "Trial, obnovovanie, GoPay platba, zmena plánu a zrušenie predplatného Faktero." },
      { property: "og:title", content: "Pomoc — Predplatné — Faktero" },
      { property: "og:description", content: "Ako funguje predplatné a fakturácia Faktera." },
      { property: "og:url", content: "https://faktero.sk/pomoc/predplatne" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/predplatne" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "trial",
    title: "Skúšobné obdobie (trial)",
    body: (
      <>
        <p>Po registrácii dostáva každá firma <strong>2 mesiace zadarmo na pláne Premium</strong> (60 dní). Počas trialu môžete využívať všetky funkcie bez obmedzenia.</p>
        <p>Trial sa <strong>nepredlžuje automaticky</strong> a nepýtame si platobné údaje vopred.</p>
      </>
    ),
  },
  {
    id: "obnova",
    title: "Automatické obnovovanie",
    body: (
      <>
        <p>Po aktivácii plateného plánu sa predplatné obnovuje <strong>každý mesiac</strong> v deň aktivácie. Karta sa strhne automaticky cez GoPay.</p>
        <p>3 dni pred obnovou vám pošleme pripomienku emailom.</p>
      </>
    ),
  },
  {
    id: "gopay",
    title: "GoPay platba predplatného",
    body: (
      <>
        <p>Predplatné Faktera platíte cez <strong>GoPay opakovanú platbu</strong>. Po prvej úspešnej platbe sa kartové údaje uložia priamo u GoPay (Faktero ich nikdy nevidí).</p>
        <p>Daňový doklad za predplatné nájdete v sekcii <Link to="/nastavenia/predplatne">Nastavenia → Predplatné</Link>.</p>
      </>
    ),
  },
  {
    id: "zmena",
    title: "Zmena plánu",
    body: (
      <>
        <p>Plán môžete kedykoľvek zmeniť v <Link to="/nastavenia/predplatne">Nastaveniach predplatného</Link>.</p>
        <ul>
          <li><strong>Upgrade</strong> sa aktivuje okamžite, rozdiel sa pripočíta pomerne.</li>
          <li><strong>Downgrade</strong> sa aktivuje od ďalšieho fakturačného obdobia.</li>
        </ul>
      </>
    ),
  },
  {
    id: "zrusenie",
    title: "Zrušenie predplatného",
    body: (
      <>
        <p>V Nastaveniach predplatného kliknite na <strong>Zrušiť predplatné</strong>. Zostáva vám aktívne do konca už zaplateného obdobia, potom prejde do <em>read-only</em> režimu.</p>
        <p>Vaše dáta sa <strong>neodstránia</strong> — kedykoľvek sa môžete vrátiť a obnoviť plán.</p>
      </>
    ),
  },
  {
    id: "trial-koniec",
    title: "Čo sa stane po skončení trialu",
    body: (
      <>
        <p>Ak si nevyberiete plán do uplynutia 14 dní:</p>
        <ul>
          <li>Účet sa prepne do <strong>read-only</strong> režimu.</li>
          <li>Existujúce dáta vidíte, ale nemôžete vystavovať nové faktúry, používať API ani webhooky.</li>
          <li>Kedykoľvek aktivujte plán a všetko pokračuje tam, kde ste skončili.</li>
        </ul>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Predplatné"
      title="Predplatné a fakturácia Faktera"
      intro={<p>Ako funguje trial, obnova, zmena plánu a zrušenie predplatného.</p>}
      sections={sections}
    />
  );
}