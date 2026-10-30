import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/zabezpecenie")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Zabezpečenie účtu — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Dvojfaktorové overenie, dôveryhodné zariadenia, prihlasovanie, zabudnuté heslo a zrušenie účtu vo Fakteru.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/zabezpecenie" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/zabezpecenie" }],
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
        <p>
          Do appky v telefóne sa prihlásite aj bez hesla — QR kódom z{" "}
          <Link to="/nastavenia/prihlasit-appku">Prihlásiť appku v telefóne</Link>. Kód platí dve
          minúty a dá sa použiť len raz.
        </p>
        <p>
          Stratili ste telefón alebo ste zabudli odhlásiť cudzí počítač? V{" "}
          <Link to="/nastavenia/zabezpecenie">Zabezpečení účtu</Link> je tlačidlo{" "}
          <strong>Odhlásiť ostatné zariadenia</strong>. Zariadenie, na ktorom ho stlačíte, ostane
          prihlásené, všade inde sa bude treba prihlásiť znova (najneskôr do minúty).
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
          Technická podpora Faktera do vašej firmy nevidí, kým jej majiteľ nedá dočasný prístup —
          pozri <Link to="/pomoc/role">Prístup technickej podpory</Link>.
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
          pripraviť kedykoľvek znova. Celý archív aj s PDF faktúr a skenmi dokladov si majiteľ alebo
          admin vytvorí v <Link to="/nastavenia/zalohy">Nastavenia → Zálohy dokladov</Link>{" "}
          tlačidlom <strong>Vytvoriť zálohu</strong> — beží na pozadí (pri väčšej firme aj niekoľko
          minút), dobehne aj bez vás a ponecháva sa posledných päť záloh.
        </p>
        <p>
          Doklady a karty z koša balík nevynechá — sú v samostatnom priečinku „kos“ a do hlavných
          súborov sa nezapočítavajú. Zmazaná faktúra mohla byť už vystavená a zaúčtovaná, preto ju
          archivujte rovnako ako ostatné doklady.
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
          Účet sa dá zrušiť z nastavení; na potvrdenie treba zadať heslo, aby to nemohol urobiť
          nikto, kto sa dostane k odomknutému telefónu. Mazanie má <strong>14-dňový odklad</strong>{" "}
          — do tej doby sa dá vrátiť späť prihlásením.
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
    <PrelozenyManual
      category="Pomoc · Účet"
      title="Zabezpečenie účtu"
      intro={<p>Dvojfaktorové overenie, heslá, prístupy a zrušenie účtu.</p>}
      sections={sections}
    />
  );
}
