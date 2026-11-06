import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { ZalozkyStranky } from "@/components/faktero/ZalozkyStranky";
import { KonvertorExcel } from "@/components/faktero/uctovnictvo/KonvertorExcel";
import { VypisDoPohody } from "@/components/faktero/uctovnictvo/VypisDoPohody";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/**
 * Konvertory do Pohody na jednom mieste: Excel/CSV → XML dokladov, bankový
 * výpis → bankové doklady a export z platobnej brány → výpis. Staré adresy
 * `/uctovnictvo/konvertor` a `/uctovnictvo/vypis-do-pohody` (aj `?zdroj=brana`)
 * sem presmerujú cez `presmerovanieKonvertora`.
 */
type Tab = "excel" | "vypis" | "brana";

const ZALOZKY: { kod: Tab; nazov: string }[] = [
  { kod: "excel", nazov: "Excel → Pohoda" },
  { kod: "vypis", nazov: "Bankový výpis → Pohoda" },
  { kod: "brana", nazov: "Platobná brána → Pohoda" },
];

export const Route = createFileRoute("/_authenticated/uctovnictvo/konvertory")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Konvertory — Faktero") }],
  }),
  /*
    Bez `tab` je záložka Excel. `zdroj=brana` je parameter starej stránky
    výpisu — keby niekto prišiel s ním priamo sem, otvorí sa záložka brány.
  */
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab:
      s.tab === "excel" || s.tab === "vypis" || s.tab === "brana"
        ? s.tab
        : s.zdroj === "brana"
          ? "brana"
          : undefined,
  }),
  component: KonvertoryPage,
});

function KonvertoryPage() {
  const { t } = useT();
  const navigate = Route.useNavigate();
  const tab: Tab = Route.useSearch().tab ?? "excel";

  return (
    <>
      <PageHeader
        title={t("Konvertory")}
        description={t(
          "Prevedie doklady z Excelu, bankový výpis alebo export z platobnej brány na XML, ktoré načíta Pohoda.",
        )}
      />
      <PageBody>
        <div className="space-y-5">
          <ZalozkyStranky
            zalozky={ZALOZKY}
            aktivna={tab}
            popis="Konvertory"
            onZmena={(kod) =>
              void navigate({
                to: "/uctovnictvo/konvertory",
                search: (s: { tab?: Tab }) => ({ ...s, tab: kod }),
                replace: true,
              })
            }
          />
          <div role="tabpanel" aria-labelledby={`zalozka-${tab}`}>
            {tab === "excel" ? (
              <KonvertorExcel />
            ) : (
              // `key` — pri prepnutí banka ↔ brána sa formulár vyčistí ako pri zmene adresy.
              <VypisDoPohody key={tab} zdroj={tab === "brana" ? "brana" : "banka"} />
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
