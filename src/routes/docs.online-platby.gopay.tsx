import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";

export const Route = createFileRoute("/docs/online-platby/gopay")({
  head: () => ({
    meta: [
      { title: "Online platby cez GoPay — Faktero" },
      {
        name: "description",
        content:
          "Návod ako pripojiť vlastný GoPay účet k Faktere a prijímať platby priamo od zákazníkov. Peniaze nikdy nejdú cez Faktero.",
      },
      { property: "og:title", content: "Online platby cez GoPay — Faktero" },
      {
        property: "og:description",
        content: "Pripojte si vlastný GoPay účet a prijímajte platby priamo na svoj účet.",
      },
    ],
  }),
  component: DocsGoPay,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="prose prose-slate max-w-none">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function DocsGoPay() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-10">
        <header className="space-y-3">
          <p className="text-sm font-medium text-emerald-700">Dokumentácia · Online platby</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Online platby cez GoPay</h1>
          <p className="text-lg text-muted-foreground">
            Prijímajte platby priamo od svojich zákazníkov na svoj vlastný GoPay účet.
            <strong className="text-foreground"> Peniaze nikdy nejdú cez Faktero.</strong>
          </p>
        </header>

        <Section title="Ako fungujú online platby">
          <p>
            Po pripojení svojho GoPay účtu môže každá vaša faktúra obsahovať tlačidlo „Zaplatiť
            online". Zákazník klikne, otvorí sa platobná brána GoPay a zaplatí kartou alebo bankovým
            prevodom. Po úspešnej platbe Faktero automaticky označí faktúru ako uhradenú.
          </p>
        </Section>

        <Section title="Kam idú peniaze">
          <p>
            Peniaze idú priamo na <strong>váš GoPay účet</strong>, ktorý máte prepojený so svojím
            bankovým účtom. Faktero v procese platby nevystupuje — nemáme prístup k peniazom ani k
            bankovým údajom vašich zákazníkov.
          </p>
        </Section>

        <Section title="Potrebujem vlastný GoPay účet?">
          <p>
            Áno. Každá firma musí mať vlastný GoPay účet. Faktero neumožňuje zdieľanie jedného GoPay
            účtu medzi firmami a nepoužíva svoj platobný účet na prijímanie platieb vo vašom mene.
          </p>
        </Section>

        <Section title="Ako získať GoPay účet">
          <ol>
            <li>
              Choďte na{" "}
              <a href="https://www.gopay.com/sk" target="_blank" rel="noopener noreferrer">
                gopay.com
              </a>
              .
            </li>
            <li>Zaregistrujte si obchodnícky účet a doložte potrebné dokumenty.</li>
            <li>
              Po schválení získate <strong>GoID</strong>, <strong>Client ID</strong> a{" "}
              <strong>Client Secret</strong>.
            </li>
            <li>Tieto údaje vyplníte v nastaveniach Faktera.</li>
          </ol>
        </Section>

        <Section title="Nastavenie vo Faktere">
          <ol>
            <li>
              Otvorte <Link to="/nastavenia/online-platby">Nastavenia → Online platby</Link>.
            </li>
            <li>Vyplňte GoID, Client ID a Client Secret z GoPay dashboardu.</li>
            <li>
              Najskôr odporúčame <strong>Sandbox režim</strong> na testovanie.
            </li>
            <li>
              Stlačte <em>Uložiť</em> a potom <em>Otestovať pripojenie</em>.
            </li>
            <li>Po úspešnom teste zapnite prepínač „Povoliť online platby na faktúrach".</li>
          </ol>
        </Section>

        <Section title="Ako zákazník zaplatí faktúru">
          <p>
            Na detaile faktúry stlačíte <em>Vytvoriť platobný odkaz</em>. Odkaz pošlete zákazníkovi
            e-mailom, alebo ho automaticky pripojí Faktero. Zákazník klikne a presmeruje sa do GoPay
            brány — bez registrácie a bez prihlasovania.
          </p>
        </Section>

        <Section title="Bezpečnosť">
          <ul>
            <li>
              Váš Client Secret je šifrovaný (AES-256-GCM) a nikdy sa nevracia do prehliadača.
            </li>
            <li>Notifikácie z GoPay sú chránené tajným kľúčom unikátnym pre vašu firmu.</li>
            <li>
              Stav platby si Faktero overuje priamo na strane GoPay — nikdy nedôveruje payloadu.
            </li>
            <li>Každá zmena nastavení je zaznamenaná v audit logu.</li>
          </ul>
        </Section>

        <Section title="Automatické označenie faktúr ako uhradených">
          <p>Keď GoPay potvrdí platbu, Faktero automaticky:</p>
          <ul>
            <li>
              nastaví faktúre stav <strong>uhradená</strong>,
            </li>
            <li>uloží dátum platby,</li>
            <li>vytvorí záznam platby,</li>
            <li>zapíše audit záznam.</li>
          </ul>
        </Section>

        <Section title="Poplatky">
          <p>
            <strong>Faktero si neúčtuje províziu z platieb vašich zákazníkov.</strong> Platíte iba
            štandardné poplatky GoPay podľa vašej zmluvy s nimi.
          </p>
        </Section>

        <Section title="Často kladené otázky">
          <h3>Môžem používať platby aj bez GoPay účtu?</h3>
          <p>Nie. Bez vlastného GoPay účtu online platby nefungujú.</p>
          <h3>Vidí Faktero číslo karty zákazníka?</h3>
          <p>Nie. Citlivé platobné údaje spracúva výhradne GoPay.</p>
          <h3>Čo ak chcem prepnúť zo Sandboxu na Produkciu?</h3>
          <p>
            V nastaveniach vypnite prepínač „Sandbox režim", zadajte produkčné údaje a otestujte
            pripojenie.
          </p>
        </Section>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
          <p className="text-sm text-emerald-900">
            Pripravený pripojiť svoj GoPay účet?{" "}
            <Link to="/nastavenia/online-platby" className="font-medium underline">
              Otvoriť nastavenia
            </Link>
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
