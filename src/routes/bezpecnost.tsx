import { createFileRoute } from "@tanstack/react-router";
import {
  DatabaseBackup,
  ExternalLink,
  FileCheck,
  Fingerprint,
  Globe2,
  Lock,
  Mail,
  Server,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { LEGAL_COMPANY } from "@/components/faktero/LegalShell";
import { kanonicka } from "@/lib/faktero/kanonicka";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";

/*
  Bezpečnosť a hosting (verejná stránka).

  Pravidlo: certifikáty ISO/IEC 27001 patria poskytovateľom infraštruktúry
  (Hetzner, Supabase), NIE Fakteru ani Tobify s.r.o. — žiadne logo ISO,
  žiadny odznak „ISO certified“ a žiadna veta, ktorá by naznačovala opak.

  Overené 21. 11. 2026:
  - Supabase projekt sywcjxydnljkzoepfcaz je v regióne eu-central-1 (Frankfurt).
  - RLS je zapnuté na tabuľkách firiem (is_company_admin / firmy_s_pravom).
  - Biometria v appke: src/lib/mobile/biometric.ts (Face ID / Touch ID / odtlačok).
  - Zálohy: denný pg_dump o 2:15 a zrkadlo súborov o 3:15 (crontab servera).
*/
// TODO: overiť, že server je v FSN/NBG/HEL (Hetzner Falkenstein / Norimberg / Helsinki)

export const Route = createFileRoute("/bezpecnost")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    const title = preloz(j, "Bezpečnosť a ochrana dát — Faktero");
    const description = preloz(
      j,
      "Ako Faktero chráni vaše dáta: infraštruktúra poskytovateľov certifikovaných podľa ISO/IEC 27001:2022, dáta uložené v EÚ, šifrovaný prenos, oddelený prístup pre každú firmu a pravidelné zálohy.",
    );
    return {
      links: kanonicka("/bezpecnost"),
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: "https://www.faktero.sk/bezpecnost" },
      ],
    };
  },
  component: BezpecnostPage,
});

type Poskytovatel = { nazov: string; popis: string; odkaz: string; odkazText: string; ikona: LucideIcon };

const POSKYTOVATELIA: Poskytovatel[] = [
  {
    nazov: "Hetzner Online GmbH",
    popis: "Dátové centrá v Nemecku a Fínsku, certifikácia ISO/IEC 27001:2022.",
    odkaz: "https://www.hetzner.com/unternehmen/zertifizierung",
    odkazText: "Certifikácia Hetzner",
    ikona: Server,
  },
  {
    nazov: "Supabase",
    popis: "Databáza a autentifikácia, certifikácia ISO/IEC 27001:2022 a SOC 2 Type 2.",
    odkaz: "https://supabase.com/security",
    odkazText: "Bezpečnosť Supabase",
    ikona: DatabaseBackup,
  },
];

/* Len to, čo v kóde a infraštruktúre naozaj existuje (pozri komentár hore). */
const OCHRANA: { ikona: LucideIcon; nazov: string; popis: string }[] = [
  {
    ikona: Lock,
    nazov: "Šifrovaný prenos (HTTPS/TLS)",
    popis: "Všetka komunikácia medzi vaším prehliadačom či aplikáciou a Fakterom ide šifrovane.",
  },
  {
    ikona: Users,
    nazov: "Prístup oddelený pre každú firmu",
    popis: "Databáza pustí každého len k údajom firiem, v ktorých je členom (row-level security).",
  },
  {
    ikona: DatabaseBackup,
    nazov: "Pravidelné zálohy",
    popis: "Databáza aj nahraté súbory sa zálohujú každý deň.",
  },
  {
    ikona: Fingerprint,
    nazov: "Prihlásenie s biometriou v mobilnej aplikácii",
    popis: "V appke sa prihlásite cez Face ID, Touch ID alebo odtlačok prsta.",
  },
  {
    ikona: FileCheck,
    nazov: "Spracovanie osobných údajov v súlade s GDPR",
    popis: "Zásady ochrany súkromia aj zmluvu o spracúvaní údajov nájdete v časti Právne.",
  },
  {
    ikona: Globe2,
    nazov: "Dáta uložené v EÚ",
    popis: "Databáza aj nahraté súbory sú v dátovom centre vo Frankfurte (Nemecko).",
  },
];

function BezpecnostPage() {
  const { t } = useT();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("Bezpečnosť")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
          {t("Bezpečnosť a ochrana dát")}
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          {t(
            "Faktero využíva infraštruktúru poskytovateľov certifikovaných podľa ISO/IEC 27001:2022 (Hetzner Online GmbH, Supabase). Dáta sú uložené v EÚ.",
          )}
        </p>

        <section className="mt-12" aria-labelledby="infrastruktura">
          <h2 id="infrastruktura" className="text-xl font-semibold">
            {t("Infraštruktúra")}
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {POSKYTOVATELIA.map((p) => (
              <div key={p.nazov} className="min-w-0 rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 font-semibold">
                  <p.ikona className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  {p.nazov}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{t(p.popis)}</p>
                <a
                  href={p.odkaz}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  {t(p.odkazText)}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="ochrana">
          <h2 id="ochrana" className="text-xl font-semibold">
            {t("Ako chránime vaše dáta")}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OCHRANA.map((o) => (
              <div key={o.nazov} className="min-w-0 rounded-2xl border border-border bg-card p-5">
                <o.ikona className="h-5 w-5 text-primary" aria-hidden="true" />
                <div className="mt-3 font-medium">{t(o.nazov)}</div>
                <p className="mt-1 text-sm text-muted-foreground">{t(o.popis)}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            {t(
              "Certifikáty ISO/IEC 27001 sa vzťahujú na uvedených poskytovateľov infraštruktúry, nie na spoločnosť Tobify s.r.o.",
            )}
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-border bg-card p-6" aria-labelledby="hlasenie">
          <h2 id="hlasenie" className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("Bezpečnostný problém?")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Napíšte nám na")}{" "}
            <a
              href={`mailto:${LEGAL_COMPANY.email}`}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {LEGAL_COMPANY.email}
            </a>
          </p>
        </section>
      </div>
    </MarketingShell>
  );
}
