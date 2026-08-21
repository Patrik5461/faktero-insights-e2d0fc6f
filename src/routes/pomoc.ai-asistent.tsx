import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/ai-asistent")({
  head: () => ({
    meta: [
      { title: "Pomoc — Faktero AI — Faktero" },
      {
        name: "description",
        content:
          "Faktero AI odpovedá na otázky nad vašimi faktúrami: kto dlží, čo je po splatnosti, čo poslať účtovníčke. Číta, nemení.",
      },
      { property: "og:title", content: "Pomoc — Faktero AI — Faktero" },
      {
        property: "og:description",
        content: "Otázky nad vlastnými dátami — a čo asistent nevie a nesmie.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/ai-asistent" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/ai-asistent" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo to je",
    body: (
      <>
        <p>
          <Link to="/ai-asistent">Faktero AI</Link> je pomocník, ktorý sa pozerá na{" "}
          <strong>vaše vlastné dáta</strong> a odpovedá slovom. Namiesto preklikávania zoznamov a
          filtrov sa spýtate tak, ako by ste sa spýtali kolegu:
        </p>
        <ul>
          <li>„Ktoré faktúry sú po splatnosti?“</li>
          <li>„Ktorí zákazníci mi dlhujú najviac?“</li>
          <li>„Čo mám poslať účtovníčke?“</li>
          <li>„Navrhni mi opakované faktúry.“</li>
        </ul>
        <p>
          Odpovedá vždy za <strong>vybranú firmu</strong> — tú, ktorá je prepnutá hore v lište. Keď
          máte firiem viac, prepnite sa skôr, než sa spýtate.
        </p>
      </>
    ),
  },
  {
    id: "co-vidi",
    title: "Do čoho vidí",
    body: (
      <>
        <p>Pred každou odpoveďou si k otázke vezme prehľad o firme:</p>
        <ul>
          <li>
            faktúry <strong>po splatnosti</strong> aj neodoslané a rozpracované,
          </li>
          <li>
            koľko a komu sa <strong>dlhuje</strong>,
          </li>
          <li>
            <strong>chýbajúce údaje firmy</strong> (IČO, IČ DPH, adresa, IBAN), bez ktorých faktúra
            nie je úplná,
          </li>
          <li>
            nadchádzajúce <Link to="/opakovane">opakované faktúry</Link>,
          </li>
          <li>
            neúspešné <Link to="/webhooky-logy">webhooky</Link>, keď máte napojený vlastný systém.
          </li>
        </ul>
        <p>
          Tie isté veci ukazuje aj ako <strong>odporúčania</strong> hneď po otvorení — nemusíte sa
          teda pýtať, aby ste zistili, že niečo horí.
        </p>
      </>
    ),
  },
  {
    id: "co-nerobi",
    title: "Čo nerobí",
    body: (
      <>
        <p>
          <strong>Nič nemení.</strong> Asistent faktúru nevystaví, neuhradí, nezmaže ani neodošle —
          len číta a radí. Ukladá si jedine samotnú konverzáciu, aby ste sa k nej vedeli vrátiť.
        </p>
        <p>
          <strong>Nie je to účtovník.</strong> Odpoveď je návod, kde sa pozrieť a čo urobiť, nie
          daňové stanovisko. Čísla si vždy overte na doklade — v účtovníctve platí to, čo je v
          <Link to="/uctovnictvo/dph"> DPH prehľade</Link> a v exportoch, nie to, čo napíše chat.
        </p>
        <p>
          <strong>Vidí len to, čo je vo Faktere.</strong> Na otázku o doklade, ktorý ste ešte
          nenahrali, odpovedať nemôže.
        </p>
      </>
    ),
  },
  {
    id: "konverzacie",
    title: "Konverzácie",
    body: (
      <>
        <p>
          Každá otázka patrí do konverzácie a tie sa ukladajú — vľavo si viete staršiu otvoriť,
          založiť novú alebo starú zmazať. Konverzácia patrí firme, takže ju vidia aj kolegovia s
          prístupom; nepíšte do nej nič, čo im nemá prísť na oči.
        </p>
        <p>
          Odpoveď sa dá skopírovať jedným ťuknutím a poslať ďalej — napríklad účtovníčke ako zoznam
          toho, čo od vás čaká.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Faktero AI"
      title="Faktero AI"
      intro={
        <p>
          Otázky nad vlastnými faktúrami — kto dlží, čo je po splatnosti a čo poslať účtovníčke.
          Asistent číta vaše dáta, ale nič v nich nemení.
        </p>
      }
      sections={sections}
    />
  );
}
