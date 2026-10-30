import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/opakovane")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Opakované faktúry — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Opakované faktúry vo Faktere: interval, automatické vystavovanie, odosielanie a pozastavenie.",
        ),
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/opakovane" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/opakovane" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo sú opakované faktúry",
    body: (
      <>
        <p>
          Na pravidelnú fakturáciu, ktorá sa nemení — paušál, prenájom, servisná zmluva. Šablónu
          nastavíte raz a Faktero z nej vystavuje faktúry samo.
        </p>
      </>
    ),
  },
  {
    id: "nastavenie",
    title: "Nastavenie šablóny",
    body: (
      <>
        <p>
          V <Link to="/opakovane/nova">Opakované → Nová</Link> zadajte odberateľa, položky, interval
          a <strong>dátum najbližšieho vystavenia</strong>.
        </p>
        <p>
          Faktúra sa vystaví v ten deň a dátum sa posunie o interval ďalej. Pri mesačnom intervale
          sa deň drží tak, aby dával zmysel: šablóna nastavená na 31. sa vo februári vystaví
          posledný februárový deň, nie začiatkom marca.
        </p>
        <p>
          Obdobie v texte sa posúva samo. Do textu nad položkami, názvu či popisu položky a poznámky
          napíšte značku a pri vystavení sa doplní podľa dátumu vystavenia:{" "}
          <strong>[MESIAC]</strong> (október), <strong>[ROK]</strong> (2026),{" "}
          <strong>[MESIAC_ROK]</strong> (október 2026), <strong>[MINULY_MESIAC]</strong> (september
          2026) a <strong>[BUDUCI_MESIAC]</strong> (november 2026). Napríklad „Paušál za
          [MINULY_MESIAC]“ dá v novembri „Paušál za október 2026“.
        </p>
      </>
    ),
  },
  {
    id: "beh",
    title: "Automatické vystavovanie",
    body: (
      <>
        <p>
          Faktero kontroluje šablóny každý deň. Faktúra dostane riadne poradové číslo a správa sa
          ako každá iná — dá sa upraviť, odoslať aj stornovať.
        </p>
        <p>
          Odberateľovi sa faktúra sama neposiela — nájdete ju medzi vystavenými a odošlete e-mailom
          alebo eFaktúrou ako každú inú.
        </p>
      </>
    ),
  },
  {
    id: "pozastavenie",
    title: "Pozastavenie a ukončenie",
    body: (
      <>
        <p>
          Šablónu možno <strong>pozastaviť</strong> — ostane uložená, ale nevystavuje. Hodí sa, keď
          odberateľ službu dočasne nečerpá.
        </p>
        <p>
          <strong>Zmazaná šablóna prestane fakturovať okamžite.</strong> Faktúry, ktoré z nej už
          vznikli, ostávajú — sú to platné doklady.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Fakturácia"
      title="Opakované faktúry"
      intro={<p>Paušály a pravidelné platby, ktoré sa vystavia samy.</p>}
      sections={sections}
    />
  );
}
