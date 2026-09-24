import { createFileRoute } from "@tanstack/react-router";
import {
  LegalShell,
  LEGAL_VERSION,
  LEGAL_UPDATED,
  LEGAL_COMPANY,
} from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/pravne/spracovanie-udajov")({
  head: () => ({
    meta: [
      { title: "Zmluva o spracúvaní osobných údajov — Faktero" },
      {
        name: "description",
        content:
          "Zmluvné podmienky spracúvania osobných údajov podľa čl. 28 GDPR medzi Faktero ako sprostredkovateľom a zákazníkom ako prevádzkovateľom, vrátane zoznamu subdodávateľov.",
      },
      { property: "og:title", content: "Spracúvanie osobných údajov — Faktero" },
      { property: "og:url", content: "https://faktero.sk/pravne/spracovanie-udajov" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/spracovanie-udajov" }],
  }),
  component: Page,
});

/**
 * Subdodávatelia (ďalší sprostredkovatelia). Zoznam musí byť verejný a
 * aktuálny — zákazník má právo vedieť, komu sa jeho údaje sprístupňujú, a
 * namietať pribudnutie nového.
 */
const SUBDODAVATELIA = [
  {
    nazov: "Supabase, Inc.",
    ucel: "Databáza, prihlasovanie a úložisko súborov",
    kde: "Európska únia (Frankfurt, Nemecko)",
  },
  {
    nazov: "Hetzner Online GmbH",
    ucel: "Server, na ktorom beží aplikácia",
    kde: "Európska únia (Nemecko)",
  },
  {
    nazov: "Resend, Inc.",
    ucel: "Odosielanie a prijímanie e-mailov (faktúry, upomienky, doklady poštou)",
    kde: "USA — štandardné zmluvné doložky",
  },
  {
    nazov: "Google Ireland Ltd. (Gemini API)",
    ucel: "Rozpoznávanie údajov z nahratých dokladov",
    kde: "Európska únia / USA — štandardné zmluvné doložky",
  },
  {
    nazov: "OpenAI Ireland Ltd.",
    ucel: "Rozpoznávanie dokladov a asistent, keď prvý poskytovateľ nie je dostupný",
    kde: "Európska únia / USA — štandardné zmluvné doložky",
  },
  {
    nazov: "GOPAY s.r.o.",
    ucel: "Platby za predplatné",
    kde: "Česká republika",
  },
  {
    nazov: "Apple Inc. / Google Ireland Ltd.",
    ucel: "Distribúcia mobilnej aplikácie a doručovanie upozornení",
    kde: "USA / Európska únia — štandardné zmluvné doložky",
  },
] as const;

function Page() {
  return (
    <LegalShell
      title="Zmluva o spracúvaní osobných údajov"
      updated={LEGAL_UPDATED}
      version={LEGAL_VERSION}
    >
      <p>
        Tieto podmienky sú zmluvou o spracúvaní osobných údajov podľa čl. 28 nariadenia (EÚ)
        2016/679 (GDPR). Uzatvárajú sa medzi vami ako <strong>prevádzkovateľom</strong> a
        spoločnosťou <strong>{LEGAL_COMPANY.name}</strong> ({LEGAL_COMPANY.address}, IČO{" "}
        {LEGAL_COMPANY.ico}) ako <strong>sprostredkovateľom</strong>, a to okamihom, keď začnete
        službu Faktero používať. Samostatný podpis sa nevyžaduje; na požiadanie vám podpísané
        vyhotovenie pošleme na <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>.
      </p>

      <h2>1. Predmet a trvanie</h2>
      <p>
        Sprostredkovateľ spracúva osobné údaje výlučne na účel poskytovania služby Faktero — teda
        aby ste mohli vystavovať doklady, viesť účtovné podklady, komunikovať s odberateľmi a
        používať ďalšie funkcie, ktoré si zapnete. Spracúvanie trvá po dobu trvania zmluvy o
        používaní služby.
      </p>

      <h2>2. Povaha a účel spracúvania</h2>
      <p>
        Ukladanie, usporadúvanie, zálohovanie, sprístupňovanie oprávneným používateľom vašej firmy,
        odosielanie dokladov a upozornení, rozpoznávanie údajov z nahratých dokumentov a prevádzkové
        zabezpečenie služby.
      </p>

      <h2>3. Kategórie dotknutých osôb a údajov</h2>
      <ul>
        <li>
          <strong>Dotknuté osoby:</strong> vaši odberatelia a dodávatelia (aj fyzické osoby),
          zamestnanci, používatelia, ktorých do firmy pozvete, prípadne vodiči a ďalšie osoby
          uvedené vo vašich dokladoch.
        </li>
        <li>
          <strong>Údaje:</strong> identifikačné a kontaktné údaje, fakturačné a platobné údaje,
          obsah dokladov a príloh, údaje z knihy jázd a — ak modul používate — mzdové a personálne
          údaje vrátane osobitnej kategórie (rodné číslo, číslo dokladu), ktoré sa ukladajú
          šifrované.
        </li>
      </ul>

      <h2>4. Pokyny prevádzkovateľa</h2>
      <p>
        Sprostredkovateľ spracúva údaje len na základe vašich pokynov — teda toho, čo v aplikácii
        urobíte alebo si písomne vyžiadate. Ak by pokyn odporoval právnym predpisom, upozorní vás.
        Ak by mu spracúvanie ukladal právny predpis, oznámi vám to, ak to predpis nezakazuje.
      </p>

      <h2>5. Mlčanlivosť a bezpečnosť</h2>
      <ul>
        <li>Osoby oprávnené spracúvať údaje sú viazané mlčanlivosťou.</li>
        <li>
          Prenos aj uloženie sú šifrované; prístup k dátam firmy má len ten, koho do firmy pozvete,
          a v rozsahu roly alebo vlastného prístupu, ktorý mu nastavíte.
        </li>
        <li>
          K dispozícii je dvojfaktorové overenie; údaje osobitnej kategórie sú šifrované aj v
          databáze.
        </li>
        <li>Zálohy sa vytvárajú denne a uchovávajú v Európskej únii.</li>
      </ul>

      <h2>6. Ďalší sprostredkovatelia</h2>
      <p>
        Na poskytovanie služby využívame subdodávateľov. Zmena sa oznámi najmenej 30 dní vopred na
        tejto stránke a e-mailom; do uplynutia tejto lehoty môžete voči zmene namietať a zmluvu
        ukončiť.
      </p>
      <table>
        <thead>
          <tr>
            <th>Subdodávateľ</th>
            <th>Účel</th>
            <th>Miesto spracúvania</th>
          </tr>
        </thead>
        <tbody>
          {SUBDODAVATELIA.map((s) => (
            <tr key={s.nazov}>
              <td>{s.nazov}</td>
              <td>{s.ucel}</td>
              <td>{s.kde}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>7. Pomoc pri právach dotknutých osôb</h2>
      <p>
        Nástroje na výkon práv máte priamo v aplikácii: údaje odberateľov a dokladov viete upraviť
        aj vymazať a účet aj s dátami zrušiť. Ak si žiadosť vyžaduje našu súčinnosť, poskytneme ju
        bez zbytočného odkladu, najneskôr do 10 pracovných dní.
      </p>

      <h2>8. Porušenie ochrany údajov</h2>
      <p>
        O porušení ochrany osobných údajov vás upovedomíme bez zbytočného odkladu po tom, čo sa o
        ňom dozvieme, a poskytneme informácie potrebné na vaše ohlásenie dozornému orgánu.
      </p>

      <h2>9. Po skončení zmluvy</h2>
      <p>
        Po zrušení účtu sa údaje vymažú v lehote uvedenej v obchodných podmienkach. Pred zmazaním si
        dáta stiahnite — <strong>povinnosť uchovávať účtovné doklady desať rokov</strong> (§ 76
        zákona o DPH, § 35 zákona o účtovníctve) ostáva na vás a zmazaním účtu nezaniká.
      </p>

      <h2>10. Kontrola a audit</h2>
      <p>
        Na požiadanie poskytneme informácie potrebné na preukázanie plnenia povinností podľa čl. 28
        GDPR a umožníme audit dohodnutý vopred, v rozsahu, ktorý neohrozí bezpečnosť údajov
        ostatných zákazníkov.
      </p>
    </LegalShell>
  );
}
