import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/partnersky-program")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Partnerský program — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Partnerský program pre účtovníkov: prihláška, odkaz na odporúčanie, priradenie klientov a výplata provízie.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/partnersky-program" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/partnersky-program" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "prihlaska",
    title: "Ako sa prihlásiť",
    body: (
      <>
        <p>
          Prihlásite sa do Faktera (účet si môžete založiť{" "}
          <Link to="/registracia">registráciou</Link>) a otvoríte{" "}
          <Link to="/partner">Partnerský program</Link>. Vyplníte názov kancelárie, kontakt a
          IBAN na výplatu provízie — IBAN môžete doplniť aj neskôr.
        </p>
        <p>
          Ak si účet len zakladáte, pri registrácii zvoľte „Účtovník alebo kancelária“. Po založení
          vašej firmy vás Faktero na prihlášku zavedie samo a názov aj IČO doplní z firmy.
        </p>
        <p>
          Prihlášku posúdime a schválime. Kým nie je schválená, môžete ju ešte upraviť.
        </p>
      </>
    ),
  },
  {
    id: "odkaz",
    title: "Kde je váš odkaz",
    body: (
      <>
        <p>
          Po schválení dostanete vlastný kód a odkaz na odporúčanie v tvare{" "}
          <strong>www.faktero.sk/registracia?partner=KÓD</strong>. Nájdete ho v{" "}
          <Link to="/partner">Partnerskom programe</Link> a môžete ho poslať klientom e-mailom
          alebo dať na svoj web.
        </p>
      </>
    ),
  },
  {
    id: "klienti",
    title: "Ako sa k vám priradia klienti",
    body: (
      <>
        <p>Firma klienta sa k vám priradí dvoma spôsobmi:</p>
        <ul>
          <li>
            <strong>Cez odkaz</strong> — klient sa zaregistruje cez váš odkaz a založí si firmu.
            Odkaz si prehliadač zapamätá, takže platí aj vtedy, keď si klient potvrdí e-mail
            v inom okne alebo sa prihlási cez Google.
          </li>
          <li>
            <strong>Ako člen firmy</strong> — klient vás pozve do svojej firmy (napríklad ako
            účtovníka). Firmy, v ktorých ste už členom, sa vám priradia pri schválení prihlášky.
          </li>
        </ul>
        <p>
          Firma môže mať len jedného partnera — platí ten, ku ktorému sa priradila prvá. Vlastná
          firma sa vám cez váš odkaz nepriradí.
        </p>
      </>
    ),
  },
  {
    id: "provizia",
    title: "Kedy sa vypláca provízia",
    body: (
      <>
        <p>
          Z každej zaplatenej platby predplatného priradenej firmy vám vznikne provízia —
          predvolene <strong>20 % zo sumy bez DPH</strong>, po celý čas, kým klient platí.
        </p>
        <p>
          Provízia najprv <strong>30 dní čaká</strong> — to je lehota, v ktorej sa platba môže
          vrátiť. Potom je na výplatu a pošleme ju na váš IBAN. Ak sa platba klientovi vráti
          skôr, provízia sa zruší.
        </p>
        <p>
          Prehľad klientov, provízií a výplat nájdete v{" "}
          <Link to="/partner">Partnerskom programe</Link>.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Partnerský program"
      title="Partnerský program pre účtovníkov"
      intro={
        <p>
          Účtovné kancelárie, ktoré privedú klientov do Faktera, dostávajú províziu z ich
          predplatného.
        </p>
      }
      sections={sections}
    />
  );
}
