import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { FormularZmluvy, type ZmluvaNaUpravu } from "@/components/faktero/FormularZmluvy";
import { NahratieZmluvy, type PrecitanyDokument } from "@/components/faktero/NahratieZmluvy";

export const Route = createFileRoute("/_authenticated/financovanie/nova")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Nová zmluva o financovaní — Faktero") }],
  }),
  component: Stranka,
});

function Stranka() {
  const { t } = useT();
  const navigate = useNavigate();
  const cid = getActiveCompanyId();
  const [precitane, setPrecitane] = useState<PrecitanyDokument | null>(null);

  return (
    <>
      <PageHeader
        title={t("Nová zmluva o financovaní")}
        description={t("Leasing, úver alebo kontokorent. Nahrajte zmluvu, alebo zapíšte údaje ručne.")}
      />
      <PageBody>
        {cid ? (
          <>
            <NahratieZmluvy companyId={cid} onPrecitane={setPrecitane} />
            <FormularZmluvy
              /*
               * Kľúč prinúti formulár vzniknúť odznova. Polia sa napĺňajú pri
               * vzniku, takže bez neho by prečítané údaje do už zobrazeného
               * formulára nedopadli.
               */
              key={precitane?.document_path ?? "prazdny"}
              companyId={cid}
              zmluva={
                precitane ? ({ ...precitane.predvyplnene } as unknown as ZmluvaNaUpravu) : undefined
              }
              zoZmluvy={
                precitane
                  ? {
                      document_path: precitane.document_path,
                      splatky: precitane.splatky,
                      vyhrady: precitane.vyhrady,
                    }
                  : null
              }
              onUlozene={(id, splatok) => {
                toast.success(
                  splatok > 0
                    ? t("Zmluva uložená, kalendár má {n} splátok.", { n: splatok })
                    : t("Zmluva uložená."),
                );
                navigate({ to: "/financovanie/$id", params: { id } });
              }}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Vyberte firmu.")}</p>
        )}
      </PageBody>
    </>
  );
}
