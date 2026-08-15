import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { FormularZmluvy } from "@/components/faktero/FormularZmluvy";

export const Route = createFileRoute("/_authenticated/financovanie/nova")({
  head: () => ({ meta: [{ title: "Nová zmluva o financovaní — Faktero" }] }),
  component: Stranka,
});

function Stranka() {
  const navigate = useNavigate();
  const cid = getActiveCompanyId();

  return (
    <>
      <PageHeader
        title="Nová zmluva o financovaní"
        description="Zapíšte údaje zo zmluvy. Splátkový kalendár Faktero dopočíta a hneď ho uvidíte."
      />
      <PageBody>
        {cid ? (
          <FormularZmluvy
            companyId={cid}
            onUlozene={(id, splatok) => {
              toast.success(`Zmluva uložená, kalendár má ${splatok} splátok.`);
              navigate({ to: "/financovanie/$id", params: { id } });
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Vyberte firmu.</p>
        )}
      </PageBody>
    </>
  );
}
