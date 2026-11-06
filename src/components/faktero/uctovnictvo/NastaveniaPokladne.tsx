/*
  Stránka Účtovníctvo → Nastavenie účtovania → Pokladne. Jediné miesto správy
  pokladní (pridať, premenovať, mena, skratka pre Pohodu, predvolená,
  archivovať, zmazať prázdnu). Pohyby ostávajú na stránke Pokladňa; tá je len
  pre slovenské a české firmy, táto stránka slúži aj Pohode a exportom, preto
  je dostupná pre každú krajinu.
*/
import { Link } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { PokladneVNastaveniach } from "@/components/faktero/Pokladne";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { agendaPreKrajinu } from "@/lib/faktero/agendy-krajiny";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { useT } from "@/lib/i18n/useT";

export function NastaveniaPokladne() {
  const { t } = useT();
  const companyId = getActiveCompanyId();
  const krajina = useKrajinaDane();
  const sPohybmi = agendaPreKrajinu("/pokladna", krajina);

  return (
    <>
      <PageHeader
        title={t("Pokladne")}
        description={t(
          "Hotovostné pokladne firmy — názov, mena, skratka pre Pohodu a predvolená pokladňa.",
        )}
        popisDalej={
          <>
            {sPohybmi && (
              <>
                {t("Príjmy a výdaje zapisujete na stránke")}{" "}
                <Link to="/pokladna" className="text-primary underline">
                  {t("Pokladňa")}
                </Link>
                .{" "}
              </>
            )}
            {t("Keď predvolená pokladňa nemá vlastnú skratku, použije sa skratka z")}{" "}
            <Link to="/uctovnictvo/pohoda" className="text-primary underline">
              {t("Prepojenia s Pohodou")}
            </Link>
            .
          </>
        }
      />
      <PageBody>
        {companyId ? (
          <PokladneVNastaveniach companyId={companyId} className="mx-auto max-w-5xl" />
        ) : null}
      </PageBody>
    </>
  );
}
