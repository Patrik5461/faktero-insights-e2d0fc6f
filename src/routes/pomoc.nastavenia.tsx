import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, type HelpSection } from "@/components/faktero/HelpArticle";

/**
 * Manuál k nastaveniam firmy.
 *
 * Chýbal — obrazovky Firma, Vzhľad faktúry a E-mailové šablóny sú pritom prvé,
 * čo nová firma otvára, a odkaz „Manuál" nad nimi nemal kam viesť. Popisuje
 * len to, čo na tých troch obrazovkách naozaj je.
 */
export const Route = createFileRoute("/pomoc/nastavenia")({
  head: () => ({
    meta: [
      { title: "Pomoc — Nastavenia firmy — Faktero" },
      {
        name: "description",
        content:
          "Údaje firmy, logo a farba na faktúre, číslovanie dokladov a e-mailové šablóny — čo kde nastaviť a čo sa tým zmení.",
      },
      { property: "og:title", content: "Pomoc — Nastavenia firmy — Faktero" },
      {
        property: "og:description",
        content: "Údaje firmy, vzhľad faktúry, číslovanie a e-mailové šablóny.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/nastavenia" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/nastavenia" }],
  }),
  component: Page,
});

const SEKCIE: HelpSection[] = [
  {
    id: "firma",
    title: "Údaje firmy",
    body: (
      <>
        <p>
          <strong>Firma → Údaje</strong> je jediné miesto, odkiaľ sa berú údaje na doklady. Čo je
          tu, to je na faktúre — meniť to na jednotlivom doklade sa nedá, a je to zámer: dve rôzne
          adresy na dvoch faktúrach tej istej firmy sú problém pri kontrole.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Názov, IČO, DIČ, IČ DPH</strong> — pri zakladaní firmy sa doplnia podľa IČO z
            registra, takže ich stačí skontrolovať.
          </li>
          <li>
            <strong>Adresa, e-mail, telefón, web</strong> — tlačia sa v hlavičke dokladu.
          </li>
          <li>
            <strong>IBAN a SWIFT/BIC</strong> — bez IBAN-u sa na faktúru nevytlačí platobný QR kód.
            Je to najčastejšia príčina, prečo QR na doklade chýba.
          </li>
          <li>
            <strong>Mena</strong> — predvolená mena nových dokladov. Na doklade sa dá zmeniť.
          </li>
        </ul>
        <p className="mt-3">
          Sadzby DPH sa nenastavujú — Faktero ich ponúka podľa krajiny firmy (SR 23 / 19 / 5 / 0 %,
          ČR 21 / 12 / 0 %).
        </p>
      </>
    ),
  },
  {
    id: "cislovanie",
    title: "Číslovanie dokladov",
    body: (
      <>
        <p>
          <strong>Formát čísla faktúry</strong> je tiež v nastaveniach firmy. Číslo sa neskladá
          počítaním riadkov, ale z radu — vďaka tomu nevznikne diera, keď sa doklad zmaže, a dve
          faktúry vystavené naraz nedostanú to isté číslo.
        </p>
        <p className="mt-3">
          Faktúry vystavené v telefóne bez signálu si číslo rezervujú dopredu. Keď taká faktúra
          dorazí neskôr, zapadne presne na svoje miesto.
        </p>
      </>
    ),
  },
  {
    id: "vzhlad",
    title: "Vzhľad faktúry",
    body: (
      <>
        <p>
          <strong>Nastavenia → Vzhľad faktúry</strong> mení PDF, ktoré vidí odberateľ:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Logo firmy</strong> — nahrá sa raz a je na každom doklade.
          </li>
          <li>
            <strong>Farba akcentu</strong> — čiary a nadpisy v doklade.
          </li>
          <li>
            <strong>Pätička dokladu</strong> — miesto na zápis v obchodnom registri, poznámku o
            prenesení daňovej povinnosti alebo poďakovanie.
          </li>
        </ul>
        <p className="mt-3">
          Zmena sa prejaví na novo vygenerovaných PDF. Doklad, ktorý už odišiel e-mailom, sa spätne
          neprekresľuje.
        </p>
      </>
    ),
  },
  {
    id: "email",
    title: "E-mailové šablóny",
    body: (
      <>
        <p>
          <strong>Nastavenia → Email šablóny</strong> určujú, čo príde odberateľovi spolu s PDF —
          zvlášť pre faktúru, ponuku aj upomienku. Do textu sa dajú vložiť premenné (číslo dokladu,
          suma, splatnosť), takže sa nič neprepisuje ručne.
        </p>
        <p className="mt-3">
          <strong>Meno odosielateľa</strong> a <strong>Odpovedať na (Reply-To)</strong> sa nastavujú
          pri údajoch firmy. Odosiela sa z adresy Faktera, ale odpoveď príde vám — to je dôvod,
          prečo Reply-To netreba nechať prázdne.
        </p>
      </>
    ),
  },
  {
    id: "produkty",
    title: "Fakturácia, kniha jázd, alebo oboje",
    body: (
      <>
        <p>
          V <strong>Nastaveniach účtu</strong> sa prepína, čo v aplikácii vidíte: fakturačný systém,
          knihu jázd, alebo oboje. Voľba mení celé menu — kto vedie len jazdy, nemá dôvod pozerať sa
          na faktúry.
        </p>
        <p className="mt-3">
          Prepnúť sa dá kedykoľvek a o dáta sa tým nepríde. Ceny sú na{" "}
          <Link to="/cennik" className="text-primary underline">
            cenníku
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "kto",
    title: "Kto smie nastavenia meniť",
    body: (
      <>
        <p>
          Údaje firmy, vzhľad dokladu a číslovanie mení <strong>majiteľ a administrátor</strong>.
          Účtovník vedie doklady v plnom rozsahu, ale do nastavení firmy, bankových účtov ani API
          kľúčov nevidí.
        </p>
        <p className="mt-3">
          Podrobne je to v manuáli{" "}
          <Link to="/pomoc/role" className="text-primary underline">
            Role a prístupy
          </Link>
          .
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Nastavenia"
      title="Nastavenia firmy"
      intro={
        <p>
          Štyri obrazovky, ktoré sa oplatí prejsť hneď na začiatku: údaje firmy, číslovanie, vzhľad
          faktúry a e-mailové šablóny. Nastavia sa raz a potom už do nich nikto nechodí.
        </p>
      }
      sections={SEKCIE}
    />
  );
}
