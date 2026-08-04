import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listEfakturaDeliveriesFn } from "@/lib/faktero/efaktura/efaktura.functions";
import { Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/efaktura/dorucenia")({
  head: () => ({ meta: [{ title: "Doručenia eFaktúr — Faktero" }] }),
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => setCompanyId(getActiveCompanyId()), []);
  const fn = useServerFn(listEfakturaDeliveriesFn);
  const q = useQuery({
    queryKey: ["efaktura-deliveries", companyId],
    queryFn: () => fn({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  return (
    <>
      <PageHeader
        title="Doručenia"
        description="História pokusov o doručenie eFaktúr cez Peppol / digitálneho poštára / e-mail."
      />
      <PageBody>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Kanál</th>
                <th className="p-3">Príjemca</th>
                <th className="p-3">Stav</th>
                <th className="p-3">Pokusy</th>
                <th className="p-3">Odoslané</th>
                <th className="p-3">Chyba</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {q.data && q.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-muted-foreground">
                      <div className="rounded-full bg-muted p-3">
                        <Send className="h-6 w-6" />
                      </div>
                      <p className="text-sm">
                        Zatiaľ neboli odoslané žiadne eFaktúry. Doručenia sa zobrazia po napojení
                        Peppol prepravy.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {q.data?.map((d) => (
                <tr key={d.id}>
                  <td className="p-3 text-xs uppercase">{d.channel}</td>
                  <td className="p-3">
                    {d.recipient_participant_id ?? d.recipient_endpoint ?? "—"}
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{d.status}</span>
                  </td>
                  <td className="p-3">{d.attempt_count}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {d.sent_at ? new Date(d.sent_at).toLocaleString("sk-SK") : "—"}
                  </td>
                  <td className="p-3 text-xs text-destructive">{d.error_message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
