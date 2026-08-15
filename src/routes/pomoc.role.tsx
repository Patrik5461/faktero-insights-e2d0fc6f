import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/role")({
  head: () => ({
    meta: [
      { title: "Pomoc — Role a prístupy — Faktero" },
      {
        name: "description",
        content:
          "Čo smie majiteľ, administrátor, účtovník a zamestnanec vo Faktere — prehľadná tabuľka prístupov.",
      },
      { property: "og:title", content: "Pomoc — Role a prístupy — Faktero" },
      {
        property: "og:description",
        content: "Kto vo firme čo smie: majiteľ, administrátor, účtovník, zamestnanec.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/role" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/role" }],
  }),
  component: Page,
});

/** Jedna bunka tabuľky — nech sa „smie/nesmie“ číta na prvý pohľad. */
function Ano() {
  return (
    <span className="font-medium text-emerald-700 dark:text-emerald-400" title="Smie">
      áno
    </span>
  );
}
function Nie() {
  return (
    <span className="text-muted-foreground" title="Nesmie">
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
    id: "tabulka",
    title: "Kto čo smie",
    body: (
      <>
        <p>
          Rolu priradíte pri pozvaní a kedykoľvek zmeníte v{" "}
          <Link to="/firma">Nastaveniach firmy</Link>, sekcia <em>Používatelia a pozvánky</em>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-semibold">Čo</th>
                <th className="px-2 py-2 text-center font-semibold">Majiteľ</th>
                <th className="px-2 py-2 text-center font-semibold">Administrátor</th>
                <th className="px-2 py-2 text-center font-semibold">Účtovník</th>
                <th className="px-2 py-2 text-center font-semibold">Zamestnanec</th>
              </tr>
            </thead>
            <tbody>
              {RIADKY.map((r) => (
                <tr key={r.co} className="border-b last:border-0">
                  <td className="py-2 pr-3">{r.co}</td>
                  <td className="px-2 py-2 text-center">{r.owner ? <Ano /> : <Nie />}</td>
                  <td className="px-2 py-2 text-center">{r.admin ? <Ano /> : <Nie />}</td>
                  <td className="px-2 py-2 text-center">{r.uctovnik ? <Ano /> : <Nie />}</td>
                  <td className="px-2 py-2 text-center">{r.zamestnanec ? <Ano /> : <Nie />}</td>
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
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
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
