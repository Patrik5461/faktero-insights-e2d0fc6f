import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCcw, ExternalLink, Unlink, CheckCircle2, AlertCircle } from "lucide-react";
import {
  getGoogleSeoStatus,
  getGoogleSeoAuthUrl,
  disconnectGoogleSeo,
  listGscSitesFn,
  listGa4PropertiesFn,
  setGoogleSeoProperty,
  getGscOverview,
  getGa4Overview,
  requestIndexingFn,
} from "@/lib/faktero/google-seo.functions";
import { Button } from "@/components/ui/button";

type ConnType = "gsc" | "ga4";

export function GoogleSeoPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getGoogleSeoStatus);
  const authFn = useServerFn(getGoogleSeoAuthUrl);
  const disconnectFn = useServerFn(disconnectGoogleSeo);

  const { data: status, isLoading } = useQuery({
    queryKey: ["google-seo-status"],
    queryFn: () => statusFn(),
  });

  const connect = useMutation({
    mutationFn: (type: ConnType) => authFn({ data: { type } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const disconnect = useMutation({
    mutationFn: (type: ConnType) => disconnectFn({ data: { type } }),
    onSuccess: () => {
      toast.success("Odpojené");
      qc.invalidateQueries({ queryKey: ["google-seo-status"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="font-semibold mb-1">Google integrácia</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Prepojte Search Console a Analytics 4 pre dashboard so štatistikami.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ConnectionCard
          title="Google Search Console"
          conn={status?.gsc ?? null}
          loading={isLoading}
          onConnect={() => connect.mutate("gsc")}
          onDisconnect={() => disconnect.mutate("gsc")}
          type="gsc"
        />
        <ConnectionCard
          title="Google Analytics 4"
          conn={status?.ga4 ?? null}
          loading={isLoading}
          onConnect={() => connect.mutate("ga4")}
          onDisconnect={() => disconnect.mutate("ga4")}
          type="ga4"
        />
      </div>

      {status?.gsc?.property_id && <GscDashboard />}
      {status?.ga4?.property_id && <Ga4Dashboard />}
    </section>
  );
}

function ConnectionCard({
  title,
  conn,
  loading,
  onConnect,
  onDisconnect,
  type,
}: {
  title: string;
  conn: any;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  type: ConnType;
}) {
  const qc = useQueryClient();
  const sitesFn = useServerFn(listGscSitesFn);
  const propsFn = useServerFn(listGa4PropertiesFn);
  const setPropFn = useServerFn(setGoogleSeoProperty);

  const listQuery = useQuery({
    queryKey: ["google-seo-list", type],
    queryFn: () => (type === "gsc" ? sitesFn() : propsFn()),
    enabled: !!conn && !conn.property_id,
  });

  const setProp = useMutation({
    mutationFn: (property_id: string) => setPropFn({ data: { type, property_id } }),
    onSuccess: () => {
      toast.success("Property nastavené");
      qc.invalidateQueries({ queryKey: ["google-seo-status"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-medium">{title}</div>
          {loading ? (
            <div className="text-xs text-muted-foreground">Načítavam...</div>
          ) : conn ? (
            <div className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
              <CheckCircle2 className="h-3 w-3" /> Pripojené
              {conn.property_id ? ` — ${conn.property_id}` : " (vyberte property)"}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> Nepripojené
            </div>
          )}
        </div>
        {conn ? (
          <Button size="sm" variant="ghost" onClick={onDisconnect}>
            <Unlink className="h-3 w-3 mr-1" /> Odpojiť
          </Button>
        ) : (
          <Button size="sm" onClick={onConnect}>
            <ExternalLink className="h-3 w-3 mr-1" /> Pripojiť
          </Button>
        )}
      </div>

      {conn && !conn.property_id && (
        <div>
          <div className="text-xs font-medium mb-1">Vyberte {type === "gsc" ? "web" : "property"}:</div>
          {listQuery.isLoading && (
            <div className="text-xs text-muted-foreground">Načítavam zoznam...</div>
          )}
          {listQuery.error && (
            <div className="text-xs text-destructive">
              {(listQuery.error as any).message}
            </div>
          )}
          <div className="space-y-1">
            {(listQuery.data as any[])?.map((item: any) => {
              const id = type === "gsc" ? item.siteUrl : item.name;
              const label = type === "gsc" ? item.siteUrl : item.displayName;
              return (
                <button
                  key={id}
                  className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted"
                  onClick={() => setProp.mutate(id)}
                  disabled={setProp.isPending}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GscDashboard() {
  const [busy, setBusy] = useState<string | null>(null);
  const gscFn = useServerFn(getGscOverview);
  const indexFn = useServerFn(requestIndexingFn);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["gsc-overview"],
    queryFn: () => gscFn({ data: {} }),
  });

  if (!data || (data as any).missingProperty) return null;
  const d = data as any;

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Search Console — posledných 28 dní</h3>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Obnoviť
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Kliknutia" value={d.totals?.clicks ?? 0} />
        <Stat label="Impresie" value={d.totals?.impressions ?? 0} />
        <Stat label="Priem. CTR" value={`${((d.totals?.avgCtr ?? 0) * 100).toFixed(2)}%`} />
        <Stat label="Priem. pozícia" value={(d.totals?.avgPos ?? 0).toFixed(1)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table
          title="Top 10 kľúčových slov"
          rows={d.topQueries ?? []}
          columns={[
            { key: "query", label: "Query", flex: 2 },
            { key: "clicks", label: "Kliky" },
            { key: "impressions", label: "Impr." },
            { key: "position", label: "Poz.", format: (v: number) => v?.toFixed(1) },
          ]}
        />
        <Table
          title="Top 10 stránok"
          rows={d.topPages ?? []}
          columns={[
            { key: "page", label: "Stránka", flex: 2, truncate: true },
            { key: "clicks", label: "Kliky" },
            { key: "impressions", label: "Impr." },
          ]}
          rowAction={(row: any) => (
            <button
              className="text-xs text-primary hover:underline disabled:opacity-50"
              disabled={busy === row.page}
              onClick={async () => {
                setBusy(row.page);
                try {
                  await indexFn({ data: { url: row.page } });
                  toast.success("Odoslané na indexovanie");
                } catch (e: any) {
                  toast.error(e.message ?? "Chyba");
                } finally {
                  setBusy(null);
                }
              }}
            >
              Indexovať
            </button>
          )}
        />
      </div>
    </div>
  );
}

function Ga4Dashboard() {
  const ga4Fn = useServerFn(getGa4Overview);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["ga4-overview"],
    queryFn: () => ga4Fn({ data: {} }),
  });
  if (!data || (data as any).missingProperty) return null;
  const d = data as any;

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Analytics 4 — posledných 28 dní</h3>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Obnoviť
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Aktívni používatelia" value={d.totals?.activeUsers ?? 0} />
        <Stat label="Relácie" value={d.totals?.sessions ?? 0} />
        <Stat
          label="Bounce rate"
          value={`${((d.totals?.bounceRate ?? 0) * 100).toFixed(1)}%`}
        />
        <Stat
          label="Priem. dĺžka"
          value={`${Math.round(d.totals?.avgDuration ?? 0)}s`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Table
          title="Zdroje návštevnosti"
          rows={d.topSources ?? []}
          columns={[
            { key: "source", label: "Zdroj", flex: 2 },
            { key: "sessions", label: "Relácie" },
          ]}
        />
        <Table
          title="Top stránky"
          rows={d.topPages ?? []}
          columns={[
            { key: "page", label: "Stránka", flex: 2, truncate: true },
            { key: "views", label: "Zobr." },
          ]}
        />
        <Table
          title="Konverzie"
          rows={d.conversions ?? []}
          columns={[
            { key: "event", label: "Event", flex: 2 },
            { key: "count", label: "Počet" },
          ]}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] text-muted-foreground uppercase">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function Table({
  title,
  rows,
  columns,
  rowAction,
}: {
  title: string;
  rows: any[];
  columns: Array<{ key: string; label: string; flex?: number; truncate?: boolean; format?: (v: any) => any }>;
  rowAction?: (row: any) => React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/50 text-xs font-medium">
        {title}
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">Žiadne dáta</div>
        )}
        {rows.map((row: any, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
            {columns.map((c) => (
              <div
                key={c.key}
                className={`${c.flex === 2 ? "flex-[2]" : "flex-1"} ${c.truncate ? "truncate" : ""}`}
                title={c.truncate ? String(row[c.key] ?? "") : undefined}
              >
                {c.format ? c.format(row[c.key]) : row[c.key] ?? "—"}
              </div>
            ))}
            {rowAction && <div>{rowAction(row)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
