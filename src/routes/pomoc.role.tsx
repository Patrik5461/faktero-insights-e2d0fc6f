import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";
import { useT } from "@/lib/i18n/useT";

export const Route = createFileRoute("/pomoc/role")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Role a prístupy — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Čo smie majiteľ, administrátor, účtovník a zamestnanec vo Faktere — prehľadná tabuľka prístupov.",
        ),
      },
      {
        property: "og:title",
        content: preloz(match.context.jazyk, "Pomoc — Role a prístupy — Faktero"),
      },
      {
        property: "og:description",
        content: preloz(
          match.context.jazyk,
          "Kto vo firme čo smie: majiteľ, administrátor, účtovník, zamestnanec.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/role" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/role" }],
  }),
  component: Page,
});

/** Jedna bunka tabuľky — nech sa „smie/nesmie“ číta na prvý pohľad. */
function Ano() {
  const { t } = useT();
  return (
    <span className="font-medium text-emerald-700 dark:text-emerald-400" title={t("Smie")}>
      {t("áno")}
    </span>
  );
}
function Nie() {
  const { t } = useT();
  return (
    <span className="text-muted-foreground" title={t("Nesmie")}>
      —
    </span>
  );
}

const RIADKY: {
  co: string;
  owner: boolean;
  admin: boolean;
  uctovnik: boolean;
  zamestnanec: boolean;
}[] = [
  {
    co: "Vidieť všetky doklady firmy",
    owner: true,
    admin: true,
    uctovnik: true,
    zamestnanec: true,
  },
  {
    co: "Vystavovať a upravovať faktúry, ponuky, objednávky",
    owner: true,
    admin: true,
    uctovnik: true,
    zamestnanec: true,
  },
  {
    co: "Prijaté doklady, pokladňa, DPH, uzávierka",
    owner: true,
    admin: true,
    uctovnik: true,
    zamestnanec: true,
  },
  {
    co: "Sklad, cenník, zákazky, kniha jázd",
    owner: true,
    admin: true,
    uctovnik: true,
    zamestnanec: true,
  },
  {
    co: "Párovať platby a pracovať s výpismi",
    owner: true,
    admin: true,
    uctovnik: true,
    zamestnanec: true,
  },
  {
    co: "Účtovné exporty a importy",
    owner: true,
    admin: true,
    uctovnik: true,
    zamestnanec: true,
  },
  {
    co: "Pripojiť banku, meniť IBAN, odosielať platby",
    owner: true,
    admin: true,
    uctovnik: false,
    zamestnanec: false,
  },
  {
    co: "API kľúče, webhooky, platobná brána",
    owner: true,
    admin: true,
    uctovnik: false,
    zamestnanec: false,
  },
  {
    co: "Pozývať a odoberať používateľov",
    owner: true,
    admin: true,
    uctovnik: false,
    zamestnanec: false,
  },
  {
    co: "Predplatné a fakturačné údaje",
    owner: true,
    admin: true,
    uctovnik: false,
    zamestnanec: false,
  },
  { co: "Zrušiť firmu alebo účet", owner: true, admin: false, uctovnik: false, zamestnanec: false },
];

const sections: HelpSection[] = [
  {
    id: "vlastny",
    title: "Vlastný prístup",
    body: (
      <>
        <p>
          Keď nesedí ani jedna rola, zvoľte pri pozvaní alebo pri členovi rolu{" "}
          <strong>Vlastný prístup</strong> a vyklikajte oblasti: faktúry a ponuky, prijaté faktúry a
          doklady, iné doklady, kontakty, banka, pokladňa, sklad a cenník, zákazky, kniha jázd,
          zamestnanci, účtovníctvo a exporty. Pri každej zvolíte <strong>Bez prístupu</strong>,{" "}
          <strong>Len čítať</strong> alebo <strong>Upravovať</strong>.
        </p>
        <p>
          Obmedzenie stráži databáza, nie len menu — oblasť bez prístupu sa nezobrazí ani cez priamy
          odkaz. Kto smie faktúry, vidí aj odberateľov. Pripojenie banky, zmena bankových účtov
          firmy, API kľúče a správa používateľov ostávajú pri vlastnom prístupe vždy len majiteľovi
          a administrátorovi.
        </p>
      </>
    ),
  },
  {
    id: "tabulka",
    title: "Kto čo smie",
    body: (
      <>
        <p>
          Rolu priradíte pri pozvaní a kedykoľvek zmeníte v{" "}
          <Link to="/firma">Nastaveniach firmy</Link>, sekcia <em>Používatelia a pozvánky</em>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs sm:min-w-[34rem] sm:text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-2 text-left font-semibold sm:pr-3">Čo</th>
                <th className="px-1 py-2 text-center font-semibold sm:px-2">Majiteľ</th>
                <th className="px-1 py-2 text-center font-semibold sm:px-2">
                  <span className="sm:hidden" title="Administrátor">
                    Admin
                  </span>
                  <span className="hidden sm:inline">Administrátor</span>
                </th>
                <th className="px-1 py-2 text-center font-semibold sm:px-2">Účtovník</th>
                <th className="px-1 py-2 text-center font-semibold sm:px-2">
                  <span className="sm:hidden" title="Zamestnanec">
                    Zamest.
                  </span>
                  <span className="hidden sm:inline">Zamestnanec</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {RIADKY.map((r) => (
                <tr key={r.co} className="border-b last:border-0">
                  <td className="py-2 pr-2 sm:pr-3">{r.co}</td>
                  <td className="px-1 py-2 text-center sm:px-2">{r.owner ? <Ano /> : <Nie />}</td>
                  <td className="px-1 py-2 text-center sm:px-2">{r.admin ? <Ano /> : <Nie />}</td>
                  <td className="px-1 py-2 text-center sm:px-2">
                    {r.uctovnik ? <Ano /> : <Nie />}
                  </td>
                  <td className="px-1 py-2 text-center sm:px-2">
                    {r.zamestnanec ? <Ano /> : <Nie />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "uctovnik",
    title: "Účtovník",
    body: (
      <>
        <p>
          Účtovník vedie <strong>doklady v plnom rozsahu</strong> — zaúčtuje, opraví, spáruje
          platbu, uzavrie obdobie, urobí inventúru. Presne to, čo od účtovníka firma potrebuje.
        </p>
        <p>
          Nedostane sa k <strong>správe firmy</strong>: k bankovému napojeniu, k odosielaniu
          platieb, k API kľúčom ani k používateľom. Je to zámer — externý účtovník nemá mať možnosť
          zmeniť IBAN firmy ani odoslať platbu.
        </p>
        <p>
          <strong>Poznámka:</strong> do 15. augusta 2026 bol účtovník len na čítanie. Ak ste rolu
          priradili vtedy, teraz už doklady meniť môže — nič nemusíte prenastavovať.
        </p>
      </>
    ),
  },
  {
    id: "zamestnanec",
    title: "Zamestnanec",
    body: (
      <>
        <p>
          Zamestnanec má na doklady rovnaké práva ako účtovník: fakturuje, skenuje bločky, zapisuje
          jazdy a pracuje so skladom. Na správu firmy nesiaha.
        </p>
        <p>
          Rozdiel oproti účtovníkovi je v praxi len v tom, komu rolu dáte a čo od neho čakáte —
          prístupovo sú si rovní.
        </p>
      </>
    ),
  },
  {
    id: "admin",
    title: "Administrátor a majiteľ",
    body: (
      <>
        <p>
          <strong>Administrátor</strong> zvládne všetko okrem zrušenia firmy: spravuje používateľov,
          predplatné, bankové napojenie, API kľúče aj platobnú bránu.
        </p>
        <p>
          <strong>Majiteľ</strong> má navyše zrušenie firmy a účtu. Firma musí mať vždy aspoň
          jedného majiteľa — posledného nemožno odobrať ani preradiť na inú rolu.
        </p>
      </>
    ),
  },
  {
    id: "kde",
    title: "Ako rolu zmeniť",
    body: (
      <>
        <ol>
          <li>
            Otvorte <Link to="/firma">Nastavenia firmy</Link> a nájdite sekciu{" "}
            <em>Používatelia a pozvánky</em>.
          </li>
          <li>Pri členovi vyberte novú rolu — zmena platí okamžite.</li>
          <li>
            Nového človeka pozvete e-mailom; odkaz platí 14 dní. Ak sa e-mail nepodarí odoslať,
            Faktero vám ukáže odkaz na skopírovanie.
          </li>
        </ol>
        <p>
          Koľko ľudí môžete pozvať, závisí od plánu — pozri{" "}
          <Link to="/pomoc/predplatne">Predplatné</Link>.
        </p>
        <p>
          Pri každom členovi môžete vyplniť <strong>telefón</strong>,{" "}
          <strong>číslo zamestnanca</strong> a <strong>projekt</strong> — predvolenú zákazku, na
          ktorú sa zaradí každý jeho nový bloček a prijatá faktúra (na doklade sa dá zmeniť).
        </p>
      </>
    ),
  },
  {
    id: "podpora",
    title: "Prístup technickej podpory",
    body: (
      <>
        <p>
          Keď potrebujete, aby sa technická podpora Faktero pozrela priamo do vašej firmy, majiteľ
          jej v sekcii <em>Používatelia a pozvánky</em> cez{" "}
          <strong>Pridať technickú podporu</strong> udelí dočasný prístup — len na čítanie alebo
          plný k dokladom, na 1 až 30 dní. Bez toho podpora do firmy nevidí. K zamestnancom, banke,
          API ani používateľom sa nedostane nikdy.
        </p>
        <p>
          Prístup vidíte v zozname používateľov a odobrať ho viete kedykoľvek; po uplynutí sa zruší
          sám. Kto ho udelil, odobral a dokedy platil, ostáva v histórii prístupov podpory.
        </p>
      </>
    ),
  },
  {
    id: "dvojfaktor",
    title: "Dvojfaktorové overenie",
    body: (
      <>
        <p>
          Prístup sa dá zosilniť overením kódom z aplikácie. Je dobrovoľné a zapína si ho každý sám
          v <Link to="/nastavenia/zabezpecenie">Nastaveniach → Zabezpečenie</Link>; podrobnosti sú v{" "}
          <Link to="/pomoc/zabezpecenie">manuáli k zabezpečeniu účtu</Link>.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Role a prístupy"
      title="Kto vo firme čo smie"
      intro={
        <p>
          Faktero pozná štyri role: majiteľ, administrátor, účtovník a zamestnanec. Doklady vedú
          všetci, správu firmy má majiteľ s administrátorom.
        </p>
      }
      sections={sections}
    />
  );
}
