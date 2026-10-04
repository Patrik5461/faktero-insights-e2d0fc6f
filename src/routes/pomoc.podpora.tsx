import { createFileRoute } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/podpora")({
  head: () => ({
    meta: [
      { title: "Pomoc — Pomoc a podpora — Faktero" },
      {
        name: "description",
        content:
          "Ako nájsť odpoveď v manuáloch, opýtať sa Faktero AI a napísať podpore Faktera — požiadavky, stavy a odpovede.",
      },
      { property: "og:title", content: "Pomoc — Pomoc a podpora — Faktero" },
      { property: "og:url", content: "https://faktero.sk/pomoc/podpora" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/podpora" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "kde",
    title: "Kde to nájdete",
    body: (
      <>
        <p>
          Vo Fakteri v menu <em>Viac → Pomoc a podpora</em> alebo pod avatarom vpravo hore. Na
          jednom mieste je hľadanie v manuáloch, Faktero AI, vaše požiadavky a kontakt.
        </p>
      </>
    ),
  },
  {
    id: "hladanie",
    title: "Hľadanie v manuáloch",
    body: (
      <>
        <p>
          Napíšte, s čím potrebujete pomôcť — stačí slovo, napríklad <em>dobropis</em> alebo{" "}
          <em>párovanie</em>. Diakritiku písať netreba. Výsledky vedú priamo na tú časť manuálu,
          ktorá o tom hovorí.
        </p>
        <p>
          Keď v manuáloch odpoveď nie je, tou istou otázkou sa môžete opýtať{" "}
          <strong>Faktero AI</strong> (vidí aj vaše faktúry) alebo ju jedným klikom poslať podpore.
        </p>
      </>
    ),
  },
  {
    id: "poziadavka",
    title: "Napísať podpore",
    body: (
      <>
        <p>
          Tlačidlo <em>Napísať podpore</em> (alebo <em>Nahlásiť chybu alebo návrh</em> pod avatarom,
          z ktorejkoľvek stránky) založí <strong>požiadavku</strong> s číslom, napríklad P-1024.
          Vyberiete, o čo ide — otázka, chyba, návrh, predplatné — a popíšete to. Firmu, stránku a
          prehliadač pripojíme sami.
        </p>
        <p>Hneď príde potvrdenie e-mailom. Odpovedáme v pracovné dni, spravidla do 24 hodín.</p>
      </>
    ),
  },
  {
    id: "stavy",
    title: "Stavy požiadavky",
    body: (
      <>
        <ul>
          <li>
            <strong>Nová</strong> — dostali sme ju, ešte sme neodpovedali.
          </li>
          <li>
            <strong>Rieši sa</strong> — pracujeme na nej.
          </li>
          <li>
            <strong>Čaká na vás</strong> — odpovedali sme a čakáme na vašu reakciu.
          </li>
          <li>
            <strong>Vyriešená</strong> — hotovo. Keď napíšete znova, požiadavka sa otvorí.
          </li>
        </ul>
        <p>
          Odpoveď podpory uvidíte v <em>Moje požiadavky</em> (s označením <em>Nová odpoveď</em>), v
          zvončeku notifikácií aj v e-maile. Odpísať môžete priamo pod ňou vo Fakteri —{" "}
          <strong>alebo jednoducho odpovedzte na e-mail</strong>. Odpoveď sa zapíše do tej istej
          požiadavky; staršia citovaná pošta pod ňou sa vynechá.
        </p>
      </>
    ),
  },
  {
    id: "appka",
    title: "Z mobilnej aplikácie",
    body: (
      <p>
        Nahlásenie chyby a odoslanie diagnostiky z appky založí požiadavku rovnako. V appke
        dostanete jej číslo, odpoveď príde e-mailom a celé vlákno uvidíte vo Fakteri na webe.
      </p>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Podpora"
      title="Pomoc a podpora"
      intro={<p>Manuály, Faktero AI a požiadavky na podporu na jednom mieste.</p>}
      sections={sections}
    />
  );
}
