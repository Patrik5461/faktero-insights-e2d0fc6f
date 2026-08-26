import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, RefreshCw } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listPrijateEfakturyFn,
  stiahniPrijateEfakturyFn,
} from "@/lib/faktero/efaktura/efaktura.functions";

export const Route = createFileRoute("/_authenticated/efaktura/prijate")({
  head: () => ({ meta: [{ title: "Prijaté eFaktúry — Faktero" }] }),
  component: ReceivedPage,
});

function suma(hodnota: unknown, mena: string | null): string {
  const n = Number(hodnota);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} ${mena ?? "EUR"}`;
}

/** Stav rozobratia dokladu — nie stav úhrady. */
function StavDokladu({ stav }: { stav: string | null }) {
  const zle = stav === "parse_error" || stav === "rejected";
  return (
    <span className={`text-xs ${zle ? "text-destructive" : "text-muted-foreground"}`}>
      {stav ?? "—"}
    </span>
  );
}

function ReceivedPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stahujem, setStahujem] = useState(false);
  useEffect(() => setCompanyId(getActiveCompanyId()), []);

  const listFn = useServerFn(listPrijateEfakturyFn);
  const stiahni = useServerFn(stiahniPrijateEfakturyFn);

  const q = useQuery({
    queryKey: ["efaktura-prijate", companyId],
    queryFn: () => listFn({ data: { company_id: companyId! } }),
    enabled: !!companyId,
  });

  async function stiahniNove() {
    if (!companyId) return;
    setStahujem(true);
    try {
      const r: any = await stiahni({ data: { company_id: companyId } });
      const kus = r.novych === 1 ? "faktúra" : "faktúry";
      toast.success(
        r.novych
          ? `Stiahnuté: ${r.novych} ${kus}.${r.preskocenych ? ` Už uložené: ${r.preskocenych}.` : ""}`
          : "Nič nové — všetko doručené už máte.",
      );
      // Problémy sa nezamlčia: doklad, ktorý sa nepodarilo stiahnuť, by inak
      // ticho chýbal a nikto by nevedel, že vôbec bol.
      if (r.problemy?.length)
        toast.error(`Nepodarilo sa: ${r.problemy.join(" · ")}`, { duration: 12000 });
      q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStahujem(false);
    }
  }

  const riadky = (q.data ?? []) as any[];

  return (
    <>
      <PageHeader
        title="Prijaté eFaktúry"
        description="eFaktúry doručené od vašich dodávateľov cez sieť Peppol."
        action={
          <button
            onClick={stiahniNove}
            disabled={stahujem || !companyId}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${stahujem ? "animate-spin" : ""}`} />{" "}
            {stahujem ? "Sťahujem…" : "Stiahnuť nové"}
          </button>
        }
      />
      <PageBody>
        {!q.isLoading && riadky.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Inbox className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Zatiaľ tu nič nie je</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Doručené eFaktúry sa sem stiahnu tlačidlom hore. Firma musí byť spárovaná s ePoštákom
              — spraví sa to na prehľade eFaktúry.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Doručené</th>
                  <th className="p-3">Dodávateľ</th>
                  <th className="p-3">Doklad</th>
                  <th className="p-3">Vystavená</th>
                  <th className="p-3">Splatnosť</th>
                  <th className="p-3 text-right">Suma</th>
                  <th className="p-3">Stav</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.isLoading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Načítavam…
                    </td>
                  </tr>
                )}
                {riadky.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.received_at ? new Date(r.received_at).toLocaleString("sk-SK") : "—"}
                    </td>
                    <td className="p-3">
                      {r.sender_name ?? "—"}
                      {r.sender_participant_id && (
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {r.sender_participant_id}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium">{r.document_number ?? "—"}</td>
                    <td className="p-3">{r.issue_date ?? "—"}</td>
                    <td className="p-3">{r.due_date ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{suma(r.total, r.currency)}</td>
                    <td className="p-3">
                      <StavDokladu stav={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
