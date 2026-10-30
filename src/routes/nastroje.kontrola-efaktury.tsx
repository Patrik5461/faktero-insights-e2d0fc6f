import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { KontrolaEfaktury } from "@/components/faktero/KontrolaEfaktury";
import { MAX_VELKOST_VEREJNA } from "@/lib/faktero/efaktura/kontrola";
import { preloz, type Jazyk } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";

const URL_STRANKY = "https://www.faktero.sk/nastroje/kontrola-efaktury";

/*
  Verejný nástroj bez prihlásenia. Kontrola beží celá v prehliadači — server
  súbor nikdy nedostane, preto netreba captchu ani limity požiadaviek.
*/
export const Route = createFileRoute("/nastroje/kontrola-efaktury")({
  head: ({ match }) => {
    const j = (match.context.jazyk ?? "sk") as Jazyk;
    const titulok = preloz(
      j,
      "Kontrola e-faktúry zadarmo — validátor UBL a Peppol BIS 3.0 | Faktero",
    );
    const popis = preloz(
      j,
      "Overte XML e-faktúry pred odoslaním: povinné údaje, výpočty súm a DPH podľa EN 16931, pravidlá Peppol BIS 3.0 a slovenskej eFaktúry 2027. Zadarmo, bez registrácie, súbor neopustí váš prehliadač.",
    );
    return {
      meta: [
        { title: titulok },
        { name: "description", content: popis },
        { property: "og:title", content: titulok },
        { property: "og:description", content: popis },
        { property: "og:url", content: URL_STRANKY },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: URL_STRANKY }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: preloz(j, "Kontrola e-faktúry"),
            url: URL_STRANKY,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            inLanguage: j,
            description: popis,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            provider: { "@type": "Organization", name: "Faktero", url: "https://www.faktero.sk" },
          }),
        },
      ],
    };
  },
  component: KontrolaEfakturyVerejna,
});

function KontrolaEfakturyVerejna() {
  const { t } = useT();
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-4 pb-8 pt-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("Kontrola e-faktúry")}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {t(
            "Od 1. 1. 2027 posielajú slovenskí platitelia DPH faktúry ako XML cez sieť Peppol. Nahrajte svoj súbor a zistite, či prejde — s vysvetlením každej chyby a odkazom na pravidlo.",
          )}
        </p>
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          {t("Zadarmo a bez registrácie. Súbor sa nikam neodosiela ani neukladá.")}
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <KontrolaEfaktury maxVelkost={MAX_VELKOST_VEREJNA} />
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <h2 className="text-xl font-semibold">{t("Čo kontrolujeme")}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("Dobre formovaný XML a správny koreň — UBL 2.1 Invoice alebo CreditNote.")}</li>
          <li>
            {t(
              "Povinné údaje podľa EN 16931: číslo, dátum, typ dokladu, mena, predávajúci, kupujúci, riadky a sumy.",
            )}
          </li>
          <li>
            {t(
              "Výpočty: súčet riadkov, suma bez DPH a s DPH, suma na úhradu a rozpis DPH podľa kategórií (S, Z, E, AE, K, G, O).",
            )}
          </li>
          <li>
            {t(
              "Pravidlá Peppol BIS Billing 3.0: elektronická adresa so schémou, formát dátumov, kódy mien, krajín a merných jednotiek.",
            )}
          </li>
          <li>
            {t(
              "Slovenská eFaktúra: adresa 0245 s DIČ, tvar IČ DPH a IČO, sadzby DPH a pôvodná faktúra pri dobropise.",
            )}
          </li>
        </ul>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("Nechcete XML riešiť vôbec?")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Faktero vystaví eFaktúru správne samo, odošle ju cez Peppol a prijaté faktúry vám zaeviduje. Kontrola e-faktúry je v aplikácii k dispozícii aj pre väčšie súbory.",
              )}
            </p>
          </div>
          <Link
            to="/registracia"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("Vyskúšať 30 dní zadarmo")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
