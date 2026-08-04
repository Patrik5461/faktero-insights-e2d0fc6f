import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/legal")({
  component: Page,
});

const DOCS: { type: string; label: string; to: string }[] = [
  { type: "obchodne-podmienky", label: "Obchodné podmienky", to: "/pravne/obchodne-podmienky" },
  { type: "gdpr", label: "GDPR", to: "/pravne/gdpr" },
  { type: "reklamacny-poriadok", label: "Reklamačný poriadok", to: "/pravne/reklamacny-poriadok" },
  { type: "gopay-podmienky", label: "GoPay podmienky", to: "/pravne/gopay-podmienky" },
  { type: "cookies", label: "Cookies", to: "/pravne/cookies" },
];

function Page() {
  const { data: versions } = useQuery({
    queryKey: ["legal_document_versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_document_versions")
        .select("document_type, version, published_at, is_current")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: acceptances } = useQuery({
    queryKey: ["legal_acceptances_recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_acceptances")
        .select("user_id, document_type, version, accepted_at, ip_address")
        .order("accepted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Právne dokumenty</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aktuálne verzie právnych textov a posledné súhlasy používateľov.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4 flex items-center justify-between">
          <h2 className="font-medium">Verzie dokumentov</h2>
          <span className="text-xs text-muted-foreground">
            Úpravy textu prebehnú v zdrojových komponentoch + novom zázname v{" "}
            <code>legal_document_versions</code>.
          </span>
        </div>
        <div className="divide-y divide-border">
          {DOCS.map((d) => {
            const rows = (versions ?? []).filter((v) => v.document_type === d.type);
            const current = rows.find((r) => r.is_current);
            return (
              <div key={d.type} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{d.label}</div>
                  <div className="text-xs text-muted-foreground">
                    Aktuálna verzia: {current?.version ?? "—"}
                    {current?.published_at
                      ? ` · ${new Date(current.published_at).toLocaleDateString("sk-SK")}`
                      : ""}
                  </div>
                </div>
                <Link to={d.to} target="_blank" className="text-sm text-primary hover:underline">
                  Otvoriť ↗
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-medium">Posledné súhlasy (50)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Dátum</th>
                <th className="px-4 py-2">User ID</th>
                <th className="px-4 py-2">Dokument</th>
                <th className="px-4 py-2">Verzia</th>
                <th className="px-4 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(acceptances ?? []).map((a, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(a.accepted_at).toLocaleString("sk-SK")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{a.user_id.slice(0, 8)}…</td>
                  <td className="px-4 py-2">{a.document_type}</td>
                  <td className="px-4 py-2">{a.version}</td>
                  <td className="px-4 py-2 text-muted-foreground">{a.ip_address ?? "—"}</td>
                </tr>
              ))}
              {!acceptances?.length && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                    Žiadne záznamy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
