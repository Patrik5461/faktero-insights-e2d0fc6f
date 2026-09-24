import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/zabezpecenie")({
  head: () => ({
    meta: [
      { title: "Pomoc — Zabezpečenie účtu — Faktero" },
      {
        name: "description",
        content:
          "Dvojfaktorové overenie, dôveryhodné zariadenia, prihlasovanie, zabudnuté heslo a zrušenie účtu vo Fakteru.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/zabezpecenie" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/zabezpecenie" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "dvojfaktor",
    title: "Dvojfaktorové overenie",
    body: (
      <>
        <p>
          V <Link to="/nastavenia/zabezpecenie">Nastaveniach → Zabezpečenie</Link> sa dá zapnúť
          overenie kódom z aplikácie (Google Authenticator, 1Password a podobne). Je{" "}
          <strong>dobrovoľné</strong> — kto ho nechce, prihlasuje sa ako doteraz.
        </p>
        <p>
          Po zapnutí sa pri prihlásení pýta šesťmiestny kód. Zariadenie sa dá označiť za
          dôveryhodné, aby sa kód na ňom nepýtal zakaždým.
        </p>
        <p>
          Keď je dvojfaktor zapnutý, chráni celý účet vrátane dokladov — aj keby niekto poznal
          heslo, bez kódu sa k dátam nedostane.
        </p>
      </>
    ),
  },
  {
    id: "heslo",
    title: "Heslo a prihlásenie",
    body: (
      <>
        <p>
          Zabudnuté heslo sa obnovuje odkazom z prihlasovacej stránky; e-mail príde do pár minút a
          odkaz vedie späť na Faktero. Odhlásenie sa týka len zariadenia, na ktorom ho urobíte — v
          telefóne teda ostanete prihlásený.
        </p>
      </>
    ),
  },
  {
    id: "pristupy",
    title: "Kto vidí vaše dáta",
    body: (
      <>
        <p>
          Do firmy sa ľudia dostanú len cez pozvánku a v rozsahu roly alebo{" "}
          <Link to="/pomoc/role">vlastného prístupu</Link>, ktorý im nastavíte. Prístup sa dá
          kedykoľvek odobrať.
        </p>
        <p>
          Citlivé údaje v module zamestnancov (rodné číslo, číslo dokladu) sú šifrované aj v
          databáze a ich zobrazenie sa zaznamenáva.
        </p>
      </>
    ),
  },
  {
    id: "export-dat",
    title: "Stiahnutie všetkých dát",
    body: (
      <>
        <p>
          V <Link to="/nastavenia">Nastaveniach</Link> je tlačidlo{" "}
          <strong>Stiahnuť všetky dáta</strong>. Pripraví balík ZIP s tabuľkami všetkých agend v CSV
          — faktúry a ich položky, prijaté faktúry, doklady, odberatelia, cenník, pokladňa, banka,
          jazdy, zákazky — a voliteľne aj s PDF vystavených faktúr.
        </p>
        <p>
          Súbory otvorí Excel bez nastavovania. Odkaz na stiahnutie platí sedem dní; balík sa dá
          pripraviť kedykoľvek znova.
        </p>
      </>
    ),
  },
  {
    id: "zrusenie",
    title: "Zrušenie účtu",
    body: (
      <>
        <p>
          Účet sa dá zrušiť z nastavení. Mazanie má <strong>14-dňový odklad</strong> — do tej doby
          sa dá vrátiť späť prihlásením.
        </p>
        <p>
          Pred zrušením si stiahnite doklady. Povinnosť uchovávať účtovné doklady{" "}
          <strong>desať rokov</strong> platí ďalej a zrušením účtu nezaniká.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účet"
      title="Zabezpečenie účtu"
      intro={<p>Dvojfaktorové overenie, heslá, prístupy a zrušenie účtu.</p>}
      sections={sections}
    />
  );
}
