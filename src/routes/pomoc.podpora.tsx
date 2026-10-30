import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";
import { useWhatsAppVerejne } from "@/hooks/useWhatsAppPodpora";

export const Route = createFileRoute("/pomoc/podpora")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Pomoc a podpora — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Ako nájsť odpoveď v manuáloch, opýtať sa Faktero AI a napísať podpore Faktera — požiadavky, stavy a odpovede.",
        ),
      },
      {
        property: "og:title",
        content: preloz(match.context.jazyk, "Pomoc — Pomoc a podpora — Faktero"),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/podpora" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/podpora" }],
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
        <p>
          Keď sa potrebujeme pozrieť priamo do vašej firmy, majiteľ nám môže dať dočasný prístup —
          pozri <Link to="/pomoc/role">Prístup technickej podpory</Link>. Bez neho do firmy
          nevidíme.
        </p>
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
    id: "telegram",
    title: "Cez Telegram",
    body: (
      <>
        <p>
          Podpore môžete písať aj cez <strong>Telegram</strong> — tlačidlo{" "}
          <em>Napíšte nám na Telegram</em> je hore na stránke Pomoc a podpora, hneď pri nadpise.
          Nájdete ho aj v ponuke pod avatarom (<em>Napísať na Telegram</em>) a v mobilnej appke v
          bočnom paneli. Prvá správa založí požiadavku s číslom, ďalšie správy sa pridajú do nej a
          odpoveď podpory príde späť do chatu. Poslať môžete aj snímku obrazovky, fotku alebo PDF
          (do 10 MB).
        </p>
        <p>
          Chybu v aplikácii nahláste príkazom <code>/chyba</code>, novú požiadavku začnete príkazom{" "}
          <code>/nova</code>. Cez <em>Prepojiť s mojím účtom</em> sa chat priradí k vášmu účtu a
          požiadavky z Telegramu potom uvidíte aj v <em>Moje požiadavky</em>.
        </p>
      </>
    ),
  },
  {
    id: "whatsapp",
    title: "Cez WhatsApp",
    body: (
      <>
        <p>
          Podpore môžete písať aj cez <strong>WhatsApp</strong> na číslo +421 902 101 967 — tlačidlo{" "}
          <em>Napíšte nám na WhatsApp</em> je hore na stránke Pomoc a podpora, v ponuke pod avatarom
          aj v pätičke webu. Prvá správa založí požiadavku s číslom, ďalšie správy sa pridajú do nej
          a odpoveď podpory príde späť do WhatsAppu. Poslať môžete aj snímku obrazovky, fotku alebo
          PDF (do 10 MB). Príkazy <code>/chyba</code> a <code>/nova</code> fungujú rovnako ako v
          Telegrame.
        </p>
        <p>
          Cez <em>Prepojiť s mojím účtom</em> sa otvorí WhatsApp s predvyplnenou správou s kódom —
          stačí ju odoslať. Požiadavky z WhatsAppu potom uvidíte aj v <em>Moje požiadavky</em>. Vaše
          telefónne číslo vidí podpora len skrátené (napríklad +421 ••• ••• 967).
        </p>
        <p>
          WhatsApp dovoľuje firmám odpovedať voľným textom len do 24 hodín od vašej poslednej
          správy. Ak podpora odpovie neskôr, príde vám krátka správa s číslom požiadavky a celú
          odpoveď dostanete, keď nám znova napíšete (alebo ju uvidíte vo Fakteri a v e-maile, ak
          máte prepojený účet).
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

/**
 * Časť o WhatsAppe sa ukáže, až keď je integrácia zapnutá — dovtedy by manuál
 * sľuboval tlačidlá a číslo, ktoré nikde nie sú.
 */
function sekciePodpory(whatsappZapnuty: boolean): HelpSection[] {
  return whatsappZapnuty ? sections : sections.filter((s) => s.id !== "whatsapp");
}

function Page() {
  const whatsapp = useWhatsAppVerejne();
  return (
    <PrelozenyManual
      category="Pomoc · Podpora"
      title="Pomoc a podpora"
      intro={<p>Manuály, Faktero AI a požiadavky na podporu na jednom mieste.</p>}
      sections={sekciePodpory(!!whatsapp)}
    />
  );
}
