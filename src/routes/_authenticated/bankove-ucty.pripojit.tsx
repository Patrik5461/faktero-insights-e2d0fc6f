import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { startBankConnect } from "@/lib/faktero/tatrabanka.functions";
import { toast } from "sonner";
import { Building2, ArrowLeft, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bankove-ucty/pripojit")({
  head: () => ({ meta: [{ title: "Pripojiť banku — Faktero" }] }),
  component: ConnectPage,
});

function ConnectPage() {
  const startFn = useServerFn(startBankConnect);
  const [busy, setBusy] = useState(false);

  async function connect() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(true);
    try {
      const r = await startFn({ data: { company_id: cid } });
      // Break out of the Lovable preview iframe — TB sandbox blocks framing.
      const top = window.top ?? window;
      try {
        top.location.href = r.authorize_url;
      } catch {
        window.open(r.authorize_url, "_blank", "noopener");
        setBusy(false);
      }
    } catch (e: any) {
      setBusy(false);
      if (e?.message === "not_configured") {
        toast.error("Chýbajú TB_CLIENT_ID alebo TB_CLIENT_SECRET.");
      } else {
        toast.error(e?.message ?? "Chyba pri spustení OAuth");
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Pripojiť banku"
        description="Tatra banka Premium API — sandbox prostredie, iba na čítanie."
        action={
          <Link
            to="/bankove-ucty"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-600 text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Tatra banka</h2>
              <p className="text-sm text-muted-foreground">Premium API Accounts v3.2.1 (sandbox)</p>
            </div>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-foreground/80">
            <li>• Načítanie zoznamu účtov a aktuálnych zostatkov</li>
            <li>• Načítanie transakcií za posledných 90 dní</li>
            <li>• Príprava na automatický párovanie platieb s faktúrami</li>
            <li>• Bez platobných príkazov, iba na čítanie</li>
          </ul>
          <button
            onClick={connect}
            disabled={busy}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {busy ? "Presmerovanie…" : "Pripojiť cez Tatra banku"}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            Po pripojení vás presmerujeme späť do Faktera. Prístupové tokeny sa ukladajú bezpečne na
            serveri a nikdy nie sú dostupné v prehliadači.
          </p>
        </div>
      </PageBody>
    </>
  );
}
