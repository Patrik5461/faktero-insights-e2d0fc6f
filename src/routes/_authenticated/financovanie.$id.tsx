import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  detailZmluvyFn,
  navrhySplatokFn,
  oznacSplatkuFn,
  potvrdSplatkuFn,
  zmazZmluvuFn,
  zrusSparovanieSplatkyFn,
} from "@/lib/faktero/financovanie.functions";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { Check, Link2, Trash2, Undo2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financovanie/$id")({
  head: () => ({ meta: [{ title: "Zmluva o financovaní — Faktero" }] }),
  component: Stranka,
});

type Splatka = {
  id: string;
  number: number;
  due_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  vat_amount: number;
  remaining_principal: number;
  paid_at: string | null;
  paid_amount: number | null;
  bank_transaction_id: string | null;
};

function datum(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("sk-SK");
}

function Stranka() {
  const { id } = useParams({ from: "/_authenticated/financovanie/$id" });
  const navigate = useNavigate();
  const nacitaj = useServerFn(detailZmluvyFn);
  const nacitajNavrhy = useServerFn(navrhySplatokFn);
  const oznac = useServerFn(oznacSplatkuFn);
  const potvrd = useServerFn(potvrdSplatkuFn);
  const zrus = useServerFn(zrusSparovanieSplatkyFn);
  const zmaz = useServerFn(zmazZmluvuFn);

  const [data, setData] = useState<any>(null);
  const [navrhy, setNavrhy] = useState<any[]>([]);
  const [pohyby, setPohyby] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const obnov = useCallback(async () => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const [d, n] = await Promise.all([
        nacitaj({ data: { company_id: cid, id } }),
        nacitajNavrhy({ data: { company_id: cid } }),
      ]);
      setData(d);
      // Zobrazujú sa len návrhy k tejto zmluve — inde by mýlili.
      setNavrhy((n.navrhy as any[]).filter((z) => z.contractId === id));
      setPohyby(n.pohyby as any[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Zmluvu sa nepodarilo načítať.");
    }
  }, [id, nacitaj, nacitajNavrhy]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  async function urobit(praca: () => Promise<unknown>, hlaska: string) {
    setBusy(true);
    try {
      await praca();
      toast.success(hlaska);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa to.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Zmluva o financovaní" />
        <PageBody>
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        </PageBody>
      </>
    );
  }

  const z = data.zmluva;
  const splatky: Splatka[] = data.splatky;
  const s = data.suhrn;
  const dnes = new Date().toISOString().slice(0, 10);
  const cid = getActiveCompanyId()!;

  return (
    <>
      <PageHeader
        title={z.name}
        description={[
          z.kind === "leasing" ? "Leasing" : "Úver",
          z.provider_name,
          z.contract_number ? `zmluva ${z.contract_number}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <button
            onClick={() => {
              if (!confirm("Zmazať zmluvu aj s celým splátkovým kalendárom?")) return;
              void urobit(async () => {
                await zmaz({ data: { company_id: cid, id } });
                navigate({ to: "/financovanie" });
              }, "Zmluva zmazaná.");
            }}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Zmazať
          </button>
        }
      />
      <PageBody>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Financovaná suma", formatujSumu(Number(z.principal), z.currency)],
            ["Zaplatíte spolu", formatujSumu(s.zaplatiSpolu, z.currency)],
            ["Z toho úrok", formatujSumu(s.urokSpolu, z.currency)],
            [
              "Zostáva splatiť",
              formatujSumu(
                splatky.filter((r) => !r.paid_at).reduce((a, r) => a + r.amount, 0),
                z.currency,
              ),
            ],
          ].map(([popis, hodnota]) => (
            <div key={popis} className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">{popis}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{hodnota}</div>
            </div>
          ))}
        </div>

        {navrhy.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" /> Platby, ktoré sem asi patria
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Sami sa nespárovali — buď sa suma trochu líši, alebo platbu nič jednoznačne
              neidentifikuje.
            </p>
            <div className="space-y-2">
              {navrhy.map((n) => {
                const p = pohyby.find((x) => x.id === n.transactionId);
                const sp = splatky.find((x) => x.id === n.installmentId);
                return (
                  <div
                    key={n.transactionId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {p ? datum(p.booking_date) : "—"} ·{" "}
                        {p ? formatujSumu(Math.abs(p.amount), z.currency) : "—"}
                        {sp ? ` → splátka č. ${sp.number}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">{n.dovody.join(" · ")}</div>
                    </div>
                    <button
                      onClick={() =>
                        void urobit(
                          () =>
                            potvrd({
                              data: {
                                company_id: cid,
                                installment_id: n.installmentId,
                                transaction_id: n.transactionId,
                              },
                            }),
                          "Platba priradená k splátke.",
                        )
                      }
                      disabled={busy}
                      className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    >
                      Priradiť
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Č.</th>
                <th className="p-3 text-left font-medium">Splatnosť</th>
                <th className="p-3 text-right font-medium">Splátka</th>
                <th className="p-3 text-right font-medium">Istina</th>
                <th className="p-3 text-right font-medium">Úrok</th>
                {Number(z.vat_rate) > 0 && <th className="p-3 text-right font-medium">DPH</th>}
                <th className="p-3 text-right font-medium">Zostatok istiny</th>
                <th className="p-3 text-right font-medium">Stav</th>
              </tr>
            </thead>
            <tbody>
              {splatky.map((r) => {
                const poSplatnosti = !r.paid_at && r.due_date < dnes;
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3 text-muted-foreground">{r.number}</td>
                    <td className={`p-3 ${poSplatnosti ? "text-destructive" : ""}`}>
                      {datum(r.due_date)}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      {formatujSumu(r.amount, z.currency)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatujSumu(r.principal_part, z.currency)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatujSumu(r.interest_part, z.currency)}
                    </td>
                    {Number(z.vat_rate) > 0 && (
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatujSumu(r.vat_amount, z.currency)}
                      </td>
                    )}
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatujSumu(r.remaining_principal, z.currency)}
                    </td>
                    <td className="p-3 text-right">
                      {r.paid_at ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" />
                            {datum(r.paid_at)}
                            {r.bank_transaction_id ? " (z banky)" : ""}
                          </span>
                          <button
                            title="Vrátiť späť"
                            onClick={() =>
                              void urobit(
                                () =>
                                  r.bank_transaction_id
                                    ? zrus({ data: { company_id: cid, installment_id: r.id } })
                                    : oznac({
                                        data: {
                                          company_id: cid,
                                          installment_id: r.id,
                                          paid_at: null,
                                        },
                                      }),
                                "Splátka je zase otvorená.",
                              )
                            }
                            disabled={busy}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            void urobit(
                              () =>
                                oznac({
                                  data: {
                                    company_id: cid,
                                    installment_id: r.id,
                                    paid_at: dnes,
                                    paid_amount: r.amount,
                                  },
                                }),
                              "Splátka označená za zaplatenú.",
                            )
                          }
                          disabled={busy}
                          className="rounded-lg border px-2.5 py-1 text-xs"
                        >
                          Zaplatené
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 px-1 text-xs text-muted-foreground">
          Platby z napojenej banky sa priraďujú samy pri každom sťahovaní pohybov. Ručne odškrtnúť
          sa dá vždy — hodí sa, keď splátka odišla z účtu, ktorý vo Fakteri napojený nie je.{" "}
          <Link to="/financovanie" className="text-primary">
            Späť na zoznam
          </Link>
        </p>
      </PageBody>
    </>
  );
}
