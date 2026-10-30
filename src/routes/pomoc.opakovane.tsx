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
      { property: "og:url", content: "https://www.faktero.sk/pomoc/opakovane" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/opakovane" }],
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
        <p>Ak má šablóna zapnuté odosielanie, faktúra rovno odíde odberateľovi na e-mail.</p>
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
