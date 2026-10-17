import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listEfakturaDeliveriesFn } from "@/lib/faktero/efaktura/efaktura.functions";
import { Send } from "lucide-react";
import { kanalDorucenia, kratkyCas, stavDorucenia } from "@/components/faktero/EfakturaStatusBadge";

function prijemca(d: {
  recipient_participant_id?: string | null;
  recipient_endpoint?: string | null;
}) {
  return d.recipient_participant_id ?? d.recipient_endpoint ?? "—";
}

export const Route = createFileRoute("/_authenticated/efaktura/dorucenia")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Doručenia eFaktúr — Faktero") }] }),
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const { t } = useT();
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
        title={t("Doručenia")}
        description={t("História pokusov o doručenie eFaktúr cez Peppol / digitálneho poštára / e-mail.")}
      />
      <PageBody>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">{t("Kanál")}</th>
                <th className="p-3">{t("Príjemca")}</th>
                <th className="p-3">{t("Stav")}</th>
                <th className="p-3">{t("Pokusy")}</th>
                <th className="p-3">{t("Odoslané")}</th>
                <th className="p-3">{t("Chyba")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("Načítavam…")}
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
                        {t("Zatiaľ neboli odoslané žiadne eFaktúry. Doručenia sa zobrazia po napojení Peppol prepravy.")}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {q.data?.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap p-3 text-xs">{t(kanalDorucenia(d.channel))}</td>
                  <td className="max-w-[220px] truncate p-3 font-mono text-xs" title={prijemca(d)}>
                    {prijemca(d)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${d.status === "failed" || d.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}
                    >
                      {t(stavDorucenia(d.status))}
                    </span>
                  </td>
                  <td className="p-3 tabular-nums">{d.attempt_count}</td>
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                    {kratkyCas(d.sent_at)}
                  </td>
                  {/* Dlhá chyba v jednom riadku (celá v title), aby riadky s chybou
                      neboli vyššie než ostatné. Pomlčka bez chyby je vždy šedá. */}
                  <td className="max-w-[320px] p-3 text-xs">
                    {d.error_message ? (
                      <span className="block truncate text-destructive" title={d.error_message}>
                        {d.error_message}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
