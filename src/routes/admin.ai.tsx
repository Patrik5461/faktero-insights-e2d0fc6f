import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { getAdminAiUsage } from "@/lib/faktero/admin.functions";
import {
  CENNIK,
  NAZOV_POSKYTOVATELA,
  cennikPre,
  denPred,
  nazovUcelu,
  odDna,
  poDnoch,
  podla,
  spocitaj,
  type Skupina,
  type SuhrnRiadok,
} from "@/lib/faktero/ai-cennik";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/admin/ai")({
  head: () => ({ meta: [{ title: "Admin · AI a kredity — Faktero" }] }),
  component: AdminAiPage,
});

type Data = Awaited<ReturnType<typeof getAdminAiUsage>>;

function usd(n: number): string {
  return `${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)} USD`;
}

function cislo(n: number): string {
  return n.toLocaleString("sk-SK");
}

/** Priemerné trvanie jedného volania — pri čítaní dlhých dokumentov je to minúty. */
function priemer(trvanie: number, volani: number): string {
  if (!volani) return "—";
  const s = trvanie / volani / 1000;
  return s >= 60 ? `${Math.round(s / 6) / 10} min` : `${s.toFixed(1)} s`;
}

function Dlazdica({ titulok, skupina }: { titulok: string; skupina: ReturnType<typeof spocitaj> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulok}</div>
      <div className="mt-1 text-2xl font-semibold">{cislo(skupina.volani)} volaní</div>
      <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
        <div>Odhad ceny: {usd(skupina.cena)}</div>
        <div>
          Tokeny: {cislo(skupina.vstup)} vstup / {cislo(skupina.vystup)} výstup
        </div>
        <div className={skupina.chyby ? "text-destructive" : undefined}>
          Zlyhaní: {cislo(skupina.chyby)}
        </div>
      </div>
    </div>
  );
}

function Tabulka({ nadpis, riadky, popis }: { nadpis: string; riadky: Skupina[]; popis: string }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="font-medium">{nadpis}</div>
        <div className="text-xs text-muted-foreground">{popis}</div>
      </div>
      {riadky.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">Za posledných 30 dní nič.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Položka</th>
                <th className="px-4 py-2 text-right font-medium">Volaní</th>
                <th className="px-4 py-2 text-right font-medium">Zlyhaní</th>
                <th className="px-4 py-2 text-right font-medium">Tokeny</th>
                <th className="px-4 py-2 text-right font-medium">Priemer</th>
                <th className="px-4 py-2 text-right font-medium">Odhad ceny</th>
              </tr>
            </thead>
            <tbody>
              {riadky.map((r) => (
                <tr key={r.kluc} className="border-t border-border">
                  <td className="px-4 py-2">{r.kluc}</td>
                  <td className="px-4 py-2 text-right">{cislo(r.volani)}</td>
                  <td
                    className={`px-4 py-2 text-right ${r.chyby ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {cislo(r.chyby)}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {cislo(r.vstup + r.vystup)}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {priemer(r.trvanie, r.volani)}
                  </td>
                  <td className="px-4 py-2 text-right">{usd(r.cena)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Graf({ dni }: { dni: Skupina[] }) {
  const strop = Math.max(1, ...dni.map((d) => d.volani));
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-medium">Volania po dňoch</div>
      <div className="text-xs text-muted-foreground">Posledných 14 dní</div>
      <div className="mt-4 flex h-32 items-end gap-1">
        {dni.map((d) => (
          <div key={d.kluc} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-primary/70"
              style={{ height: `${Math.round((d.volani / strop) * 100)}%`, minHeight: 2 }}
              title={`${d.kluc}: ${d.volani} volaní, ${usd(d.cena)}`}
            />
            <div className="text-[10px] text-muted-foreground">{d.kluc.slice(8)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StavPoskytovatela({
  nazov,
  kluc,
  model,
  poznamka,
  odkaz,
}: {
  nazov: string;
  kluc: boolean;
  model: string;
  poznamka?: string | null;
  odkaz: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {kluc ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <div className="font-medium">{nazov}</div>
      </div>
      <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
        <div>{kluc ? "Kľúč je nastavený" : "Kľúč chýba — nevolá sa"}</div>
        <div>Model: {model}</div>
        {poznamka && (
          <div className="flex items-start gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{poznamka}</span>
          </div>
        )}
        <a
          href={odkaz}
          target="_blank"
          rel="noreferrer"
          className="inline-block pt-1 text-primary underline"
        >
          Zostatok a faktúry u poskytovateľa
        </a>
      </div>
    </div>
  );
}

function AdminAiPage() {
  const fetchUsage = useServerFn(getAdminAiUsage);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchUsage());
    } catch (e: any) {
      setError(e?.message ?? "Chyba načítania");
    } finally {
      setLoading(false);
    }
  }, [fetchUsage]);

  useEffect(() => {
    load();
  }, [load]);

  const riadky: SuhrnRiadok[] = data?.riadky ?? [];
  const dnes = odDna(riadky, denPred(1));
  const tyzden = odDna(riadky, denPred(7));

  const umlcany = data?.stav.gemini.umlcanyDo
    ? new Date(data.stav.gemini.umlcanyDo).toLocaleTimeString("sk-SK", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <>
      <AdminPageHeader
        title="AI a kredity"
        description="Spotreba modelov, odhad ceny a stav poskytovateľov."
        action={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Obnoviť
          </button>
        }
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Zostatok kreditu ani Google, ani OpenAI cez rozhranie nedávajú, preto sa tu ukazuje
          vlastné meranie: každé volanie modelu sa zapisuje a cena je odhad podľa verejného cenníka.
          Presnú sumu vidíte v konzole poskytovateľa.
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StavPoskytovatela
            nazov="Gemini (prvý na rade)"
            kluc={Boolean(data?.stav.gemini.kluc)}
            model={data?.stav.gemini.model ?? "—"}
            poznamka={
              umlcany
                ? `Odmietol volanie pre vyčerpaný kredit alebo kvótu — do ${umlcany} sa naň nechodí a platí sa OpenAI.`
                : null
            }
            odkaz="https://aistudio.google.com/app/usage"
          />
          <StavPoskytovatela
            nazov="OpenAI (náhrada)"
            kluc={Boolean(data?.stav.openai.kluc)}
            model={`${data?.stav.openai.model ?? "—"} · ${data?.stav.openai.modelVidiaci ?? "—"} (obrázky)`}
            odkaz="https://platform.openai.com/usage"
          />
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Dlazdica titulok="Dnes" skupina={spocitaj(dnes)} />
          <Dlazdica titulok="Posledných 7 dní" skupina={spocitaj(tyzden)} />
          <Dlazdica titulok="Posledných 30 dní" skupina={spocitaj(riadky)} />
        </div>

        <div className="mb-6">
          <Graf dni={poDnoch(riadky, 14)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Tabulka
            nadpis="Podľa agendy"
            popis="Čo si model najviac vypýtalo"
            riadky={podla(riadky, (r) => nazovUcelu(r.ucel))}
          />
          <Tabulka
            nadpis="Podľa modelu"
            popis="Poskytovateľ a model za 30 dní"
            riadky={podla(
              riadky,
              (r) => `${NAZOV_POSKYTOVATELA[r.poskytovatel] ?? r.poskytovatel} · ${r.model}`,
            )}
          />
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="font-medium">Posledné zlyhania</div>
            <div className="text-xs text-muted-foreground">
              Zlyhané volanie ešte neznamená výpadok — keď padne Gemini, dokument dočíta OpenAI.
            </div>
          </div>
          {(data?.chyby ?? []).length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Za posledných 30 dní žiadne.
            </div>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(data?.chyby ?? []).map((ch, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {NAZOV_POSKYTOVATELA[ch.poskytovatel] ?? ch.poskytovatel} · {ch.model}
                    </span>
                    <span className="text-muted-foreground">{nazovUcelu(ch.ucel)}</span>
                    {ch.nahrada && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        náhrada
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(ch.created_at).toLocaleString("sk-SK")}
                    </span>
                  </div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">{ch.chyba}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Sadzby, z ktorých sa odhad počíta (USD za milión tokenov)
          </summary>
          <ul className="mt-3 space-y-1 text-muted-foreground">
            {Object.entries(CENNIK).map(([model, c]) => (
              <li key={model}>
                {model}: vstup {c.vstup} / výstup {c.vystup}
              </li>
            ))}
            <li>
              neznámy model: vstup {cennikPre("").vstup} / výstup {cennikPre("").vystup}
            </li>
          </ul>
        </details>
      </AdminPageBody>
    </>
  );
}
