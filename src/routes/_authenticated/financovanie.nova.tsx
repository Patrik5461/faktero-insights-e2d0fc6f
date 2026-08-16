import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { FormularZmluvy, type ZmluvaNaUpravu } from "@/components/faktero/FormularZmluvy";
import { NahratieZmluvy, type PrecitanyDokument } from "@/components/faktero/NahratieZmluvy";

export const Route = createFileRoute("/_authenticated/financovanie/nova")({
  head: () => ({ meta: [{ title: "Nová zmluva o financovaní — Faktero" }] }),
  component: Stranka,
});

function Stranka() {
  const navigate = useNavigate();
  const cid = getActiveCompanyId();
  const [precitane, setPrecitane] = useState<PrecitanyDokument | null>(null);

  return (
    <>
      <PageHeader
        title="Nová zmluva o financovaní"
        description="Nahrajte zmluvu, alebo zapíšte údaje ručne. Splátkový kalendár uvidíte hneď."
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
                toast.success(`Zmluva uložená, kalendár má ${splatok} splátok.`);
                navigate({ to: "/financovanie/$id", params: { id } });
              }}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Vyberte firmu.</p>
        )}
      </PageBody>
    </>
  );
}
