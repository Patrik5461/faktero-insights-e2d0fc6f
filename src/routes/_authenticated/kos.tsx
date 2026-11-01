import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { KosDokladovOkno } from "@/components/faktero/KosDokladovOkno";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

export const Route = createFileRoute("/_authenticated/kos")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Kôš — Faktero") }] }),
  component: KosPage,
});

/**
 * Kôš ako samostatná sekcia dokladov. Do `kos_dokladov` sa dnes zapisujú len
 * bločky (aj doklady presunuté z príloh) a nespracované doklady — popis to
 * tak hovorí. Vystavené faktúry majú vlastný kôš (Faktúry → „Zobraziť
 * vymazané"); prijaté faktúry sa mažú len príznakom `deleted_at` a kôš pre
 * ne zatiaľ nie je (H-09 čaká na rozhodnutie).
 */
function KosPage() {
  const { t } = useT();
  const cid = getActiveCompanyId();
  return (
    <>
      <PageHeader
        title={t("Kôš")}
        description={t("Zmazané bločky a nespracované doklady sa dajú obnoviť do pôvodnej sekcie aj s párovaním na pohyb v banke. Po 90 dňoch sa kôš vysype sám aj so skenmi.")}
      />
      <PageBody>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("Zmazané vystavené faktúry nájdete vo Faktúrach cez filter „Zobraziť vymazané“.")}{" "}
          <Link to="/faktury" className="font-medium text-primary hover:underline">
            {t("Prejsť na faktúry")}
          </Link>
        </p>
        {cid ? (
          <KosDokladovOkno vlozene companyId={cid} onClose={() => {}} onObnovene={() => {}} />
        ) : null}
      </PageBody>
    </>
  );
}
