import { createFileRoute } from "@tanstack/react-router";
import { LegalShell, LEGAL_VERSION, LEGAL_UPDATED, LEGAL_COMPANY } from "@/components/faktero/LegalShell";
import { CookieConsentResetButton } from "@/components/faktero/cookie-consent";

export const Route = createFileRoute("/pravne/cookies")({
  head: () => ({
    meta: [
      { title: "Cookies — Faktero" },
      { name: "description", content: "Informácie o používaní cookies v službe Faktero." },
      { property: "og:url", content: "https://faktero.sk/pravne/cookies" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/cookies" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalShell title="Používanie cookies" updated={LEGAL_UPDATED} version={LEGAL_VERSION}>
      <p>
        Stránka faktero.sk a aplikácia Faktero používajú cookies a podobné technológie (lokálne úložisko prehliadača)
        na zabezpečenie prevádzky a zlepšenie používateľského zážitku.
      </p>

      <h2>1. Nevyhnutné cookies</h2>
      <p>
        Sú nevyhnutné pre fungovanie aplikácie — prihlásenie, udržanie relácie, bezpečnostné tokeny, predvolené
        nastavenia. Bez nich Faktero nemôže fungovať. Nie je vyžadovaný súhlas.
      </p>

      <h2>2. Analytické cookies</h2>
      <p>
        Pomáhajú nám pochopiť, ako návštevníci používajú stránky (počet návštev, zdroje, najpoužívanejšie sekcie).
        Údaje sú agregované a anonymizované. Ak používame Google Analytics, IP adresa je anonymizovaná.
      </p>

      <h2>3. Marketingové cookies</h2>
      <p>
        Tieto cookies aktuálne nepoužívame. V prípade ich nasadenia (napr. remarketing, konverzné pixely) vás budeme
        informovať a vyžiadame si váš súhlas.
      </p>

      <h2>4. Správa súhlasu</h2>
      <p>
        Súhlas s analytickými a marketingovými cookies môžete kedykoľvek udeliť alebo odvolať v nastaveniach
        cookies v pätičke stránky, prípadne priamo v nastaveniach vášho prehliadača.
      </p>

      <h2>5. Doba uchovávania</h2>
      <ul>
        <li>Relačné cookies — zaniknú zatvorením prehliadača.</li>
        <li>Trvalé cookies — uchovávajú sa typicky 1 deň až 24 mesiacov v závislosti od ich účelu.</li>
        <li>Lokálne úložisko prihlásenia — do odhlásenia používateľa.</li>
      </ul>

      <h2>6. Kontakt</h2>
      <p>{LEGAL_COMPANY.name}, {LEGAL_COMPANY.address}, <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a></p>

      <h2>7. Zmena súhlasu</h2>
      <p>
        Ak ste už súhlas udelili, môžete ho kedykoľvek zmeniť. Po zmene sa znova zobrazí ponuka cookies.
      </p>
      <CookieConsentResetButton />
    </LegalShell>
  );
}