import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/ponuky")({
  head: () => ({
    meta: [
      { title: "Pomoc — Cenové ponuky — Faktero" },
      {
        name: "description",
        content:
          "Cenové ponuky vo Faktere: vystavenie, PDF, odoslanie e-mailom, rezervácia tovaru a premena na objednávku alebo faktúru.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/ponuky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/ponuky" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "vystavenie",
    title: "Vystavenie ponuky",
    body: (
      <>
        <p>
          V <Link to="/ponuky/nova">Ponuky → Nová cenová ponuka</Link> vyberte odberateľa, dátum
          vystavenia a platnosť. Číslo pridelí Faktero.
        </p>
        <p>
          Položky sa pridávajú z katalógu produktov a ceny sa dopĺňajú z{" "}
          <Link to="/pomoc/ceny">cenníka</Link> — odberateľ dostane rovnakú cenu, akú by mal na
          faktúre.
        </p>
        <p>
          Ponuku možno priradiť na <Link to="/pomoc/zakazky">zákazku</Link>; pri premene na faktúru
          zákazka prejde ďalej.
        </p>
      </>
    ),
  },
  {
    id: "odoslanie",
    title: "PDF a odoslanie",
    body: (
      <>
        <p>
          Na detaile ponuky vygenerujete <strong>PDF</strong> a pošlete ho odberateľovi priamo z
          Fakera. Vzhľad dokumentu sa nastavuje v{" "}
          <Link to="/nastavenia/vzhlad-faktury">Vzhľad faktúry</Link>, text e-mailu v{" "}
          <Link to="/nastavenia/email-sablony">Email šablónach</Link>.
        </p>
        <p>Odberateľ musí mať vyplnený e-mail, inak sa odoslanie neponúkne.</p>
      </>
    ),
  },
  {
    id: "stavy",
    title: "Stavy ponuky",
    body: (
      <>
        <ul>
          <li>
            <strong>Koncept</strong> — pracujete na nej.
          </li>
          <li>
            <strong>Odoslaná</strong> — odberateľ ju dostal.
          </li>
          <li>
            <strong>Akceptovaná</strong> / <strong>Zamietnutá</strong> — ako dopadla.
          </li>
          <li>
            <strong>Expirovaná</strong> — uplynula platnosť.
          </li>
          <li>
            <strong>Konvertovaná</strong> — vznikla z nej faktúra.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "dalej",
    title: "Čo s prijatou ponukou",
    body: (
      <>
        <p>Sú dve cesty a líšia sa tým, či sa bude dodávať naraz alebo postupne:</p>
        <ul>
          <li>
            <strong>Konvertovať na faktúru</strong> — keď sa dodáva a fakturuje naraz.
          </li>
          <li>
            <strong>Vytvoriť objednávku</strong> — keď sa bude dodávať postupne.{" "}
            <Link to="/pomoc/objednavky">Prijatá objednávka</Link> si drží prehľad, čo je už
            vyfakturované a čo ešte zostáva.
          </li>
        </ul>
        <p>Položky aj ceny v oboch prípadoch prejdú tak, ako ich odberateľ videl.</p>
      </>
    ),
  },
  {
    id: "rezervacia",
    title: "Rezervácia tovaru",
    body: (
      <>
        <p>
          Na ponuke sa dá zapnúť <strong>rezervácia tovaru</strong>. Ponúknuté kusy sa potom
          nezapočítajú do dostupného množstva, takže ich medzitým nepredáte niekomu inému.
        </p>
        <p>Rezervácia sa uvoľní, keď platnosť ponuky uplynie alebo ponuku zamietnete.</p>
      </>
    ),
  },
  {
    id: "firma",
    title: "Ponuka z inej firmy",
    body: (
      <>
        <p>
          Ponuka patrí konkrétnej firme. Ak máte vo Faktere viac firiem a otvoríte odkaz na ponuku
          inej z nich, Faktero to povie a vyzve vás prepnúť firmu hore v lište.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Fakturácia"
      title="Cenové ponuky"
      intro={
        <p>
          Od návrhu k podpisu: ponuka, PDF, odoslanie a premena na objednávku alebo rovno na
          faktúru.
        </p>
      }
      sections={sections}
    />
  );
}
