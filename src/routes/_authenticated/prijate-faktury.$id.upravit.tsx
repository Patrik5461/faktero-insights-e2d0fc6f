import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PrijataFakturaForm } from "@/components/faktero/PrijataFakturaForm";
import { SamofakturaForm } from "@/components/faktero/SamofakturaForm";
import { PageBody } from "@/components/faktero/AppShell";

export const Route = createFileRoute("/_authenticated/prijate-faktury/$id/upravit")({
  head: () => ({ meta: [{ title: "Úprava prijatej faktúry — Faktero" }] }),
  component: EditPurchaseInvoicePage,
});

function EditPurchaseInvoicePage() {
  const { id } = useParams({ from: "/_authenticated/prijate-faktury/$id/upravit" });
  /*
    Samofaktúra má vlastný formulár s položkami a kontrolou dohody — cez
    obyčajný by sa dala zmeniť aj po odsúhlasení dodávateľom.
  */
  const [samo, setSamo] = useState<boolean | null>(null);
  useEffect(() => {
    (supabase as any)
      .from("purchase_invoices")
      .select("samofakturacia")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }: any) => setSamo(Boolean(data?.samofakturacia)));
  }, [id]);
  if (samo === null) return <PageBody>Načítavam…</PageBody>;
  return samo ? <SamofakturaForm id={id} /> : <PrijataFakturaForm id={id} />;
}
