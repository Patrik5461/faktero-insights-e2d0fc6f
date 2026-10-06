/**
 * eFaktúra — žiadosti z Portálu finančnej správy a webhooky ePoštáka.
 *
 * Firma si na Portáli FS vyberie Faktero ako poskytovateľa doručovacej
 * služby; FS nám pošle jej údaje a ePošták ju zaregistruje do Peppolu (White
 * Label). Tu je vidieť, ako to dopadlo, a dá sa zopakovať alebo priradiť.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert, Webhook } from "lucide-react";
import {
  adminEfakturaPrehladFn,
  adminPriradZiadostFn,
  adminZapniWebhookyFn,
  adminZmazWebhookFn,
  adminZopakujZiadostFn,
} from "@/lib/faktero/efaktura-admin.functions";

export const Route = createFileRoute("/admin/efaktura")({ component: Page });

const STAVY: Record<string, { text: string; cls: string }> = {
  prijata: { text: "Prijatá", cls: "bg-muted text-muted-foreground" },
  registruje_sa: { text: "Registruje sa", cls: "bg-amber-100 text-amber-800" },
  registrovana: { text: "Registrovaná", cls: "bg-emerald-100 text-emerald-800" },
  na_kontrolu: { text: "Kontrola u ePoštáka", cls: "bg-amber-100 text-amber-800" },
  zamietnuta: { text: "Zamietnutá", cls: "bg-rose-100 text-rose-800" },
  chyba: { text: "Chyba", cls: "bg-rose-100 text-rose-800" },
};

const kedy = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" }) : "—";

function Page() {
  const qc = useQueryClient();
  const nacitaj = useServerFn(adminEfakturaPrehladFn);
  const zopakuj = useServerFn(adminZopakujZiadostFn);
  const prirad = useServerFn(adminPriradZiadostFn);
  const zapni = useServerFn(adminZapniWebhookyFn);
  const zmaz = useServerFn(adminZmazWebhookFn);
  const [priradenie, setPriradenie] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-efaktura"],
    queryFn: () => nacitaj({}),
  });
  const obnov = () => qc.invalidateQueries({ queryKey: ["admin-efaktura"] });

  const akcia = useMutation({
    mutationFn: async (f: () => Promise<unknown>) => f(),
    onSuccess: () => {
      toast.success("Hotovo");
      obnov();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nepodarilo sa"),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">eFaktúra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Firmy, ktoré si na Portáli finančnej správy vybrali Faktero, a odbery udalostí od ePoštáka.
        </p>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stav
            ok={data.nastavene.pdsTajomstvo}
            ano="Tajomstvo webhooku FS je nastavené"
            nie="Chýba EFAKTURA_PDS_SECRET — webhook FS odmieta všetko (401)"
          />
          <Stav
            ok={data.nastavene.epostakProdukcia}
            ano="ePošták beží v produkcii"
            nie="ePošták je v pieskovisku (EPOSTAK_ENV=sandbox)"
          />
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            Adresa pre FS: <code>https://www.faktero.sk/api/public/efaktura/pds</code>
            <br />
            Adresa pre ePoštáka: <code>…/api/public/efaktura/epostak</code>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Žiadosti z Portálu FS</h2>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !data?.ziadosti.length ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadna firma si Faktero na Portáli FS nevybrala.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Prijaté</th>
                  <th className="p-3">Firma z FS</th>
                  <th className="p-3">Kontakt</th>
                  <th className="p-3">Stav</th>
                  <th className="p-3">Vo Fakteri</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.ziadosti.map((z) => (
                  <tr key={z.id} className="border-t border-border align-top">
                    <td className="p-3 whitespace-nowrap">{kedy(z.prijate_at)}</td>
                    <td className="p-3">
                      <div className="font-medium">{z.nazov ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">DIČ {z.dic}</div>
                      {z.peppol_id && <div className="text-xs text-muted-foreground">{z.peppol_id}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{z.email ?? "—"}</div>
                      <div>{z.telefon ?? ""}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STAVY[z.stav]?.cls ?? ""}`}
                      >
                        {STAVY[z.stav]?.text ?? z.stav}
                      </span>
                      {z.chyba && <div className="mt-1 max-w-xs text-xs text-rose-700">{z.chyba}</div>}
                      <div className="mt-1 text-xs text-muted-foreground">pokusov: {z.pokusov}</div>
                    </td>
                    <td className="p-3 text-xs">
                      {z.firma ? (
                        z.firma
                      ) : (
                        <div className="flex gap-1">
                          <input
                            placeholder="id firmy"
                            value={priradenie[z.id] ?? ""}
                            onChange={(e) => setPriradenie((p) => ({ ...p, [z.id]: e.target.value }))}
                            className="w-40 rounded border border-input bg-background px-2 py-1"
                          />
                          <button
                            onClick={() =>
                              akcia.mutate(() =>
                                prirad({ data: { id: z.id, company_id: (priradenie[z.id] ?? "").trim() } }),
                              )
                            }
                            className="rounded border border-border px-2 py-1 hover:bg-secondary"
                          >
                            Priradiť
                          </button>
                        </div>
                      )}
                      {z.pozvanka_odoslana_at && (
                        <div className="mt-1 text-muted-foreground">pozvánka {kedy(z.pozvanka_odoslana_at)}</div>
                      )}
                    </td>
                    <td className="p-3">
                      {z.ma_token && z.stav !== "registrovana" && (
                        <button
                          onClick={() => akcia.mutate(() => zopakuj({ data: { id: z.id } }))}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-secondary"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Zopakovať
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Webhooky ePoštáka</h2>
          <button
            onClick={() => akcia.mutate(() => zapni({}))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <Webhook className="h-4 w-4" /> Zapnúť chýbajúce
          </button>
        </div>
        {!data?.webhooky.length ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Žiadna firma zatiaľ nemá odber udalostí. Doklady dorovnáva nočná úloha.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Firma</th>
                  <th className="p-3">Stav</th>
                  <th className="p-3">Posledná udalosť</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.webhooky.map((w) => (
                  <tr key={w.company_id} className="border-t border-border align-top">
                    <td className="p-3">
                      <div className="font-medium">{w.firma ?? w.company_id}</div>
                      <div className="text-xs text-muted-foreground">ePošták {w.epostak_firm_id}</div>
                    </td>
                    <td className="p-3 text-xs">
                      {w.stav === "aktivny" ? (
                        <span className="text-emerald-700">aktívny</span>
                      ) : (
                        <span className="text-rose-700">{w.chyba ?? "chyba"}</span>
                      )}
                    </td>
                    <td className="p-3 text-xs">{kedy(w.posledna_udalost_at)}</td>
                    <td className="p-3">
                      <button
                        onClick={() => akcia.mutate(() => zmaz({ data: { company_id: w.company_id } }))}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        Zmazať záznam
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stav({ ok, ano, nie }: { ok: boolean; ano: string; nie: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{ok ? ano : nie}</span>
    </div>
  );
}
