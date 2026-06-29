// TODO: remove before production — dočasná diagnostická stránka pre ePošťák sandbox.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  testEPostakAuth,
  testEPostakLookup,
  testEPostakSend,
} from "@/lib/faktero/efaktura-test.functions";

export const Route = createFileRoute("/admin/efaktura-test")({
  component: EfakturaTestPage,
});

const DEFAULT_FIRM_ID = "128a00a7-8722-4978-9aec-cb4b0ad852a2";
const DEFAULT_PEPPOL = "0245:5843291067";

type ResultState = { loading: boolean; data?: unknown; error?: string };

function ResultBox({ state }: { state: ResultState }) {
  if (state.loading) return <div className="text-sm text-muted-foreground">Načítavam…</div>;
  if (state.error)
    return (
      <pre className="overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        {state.error}
      </pre>
    );
  if (state.data === undefined) return null;
  return (
    <pre className="overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
      {JSON.stringify(state.data, null, 2)}
    </pre>
  );
}

function EfakturaTestPage() {
  const authFn = useServerFn(testEPostakAuth);
  const lookupFn = useServerFn(testEPostakLookup);
  const sendFn = useServerFn(testEPostakSend);

  const [authRes, setAuthRes] = useState<ResultState>({ loading: false });
  const [lookupRes, setLookupRes] = useState<ResultState>({ loading: false });
  const [sendRes, setSendRes] = useState<ResultState>({ loading: false });

  const [peppolId, setPeppolId] = useState(DEFAULT_PEPPOL);
  const [invoiceId, setInvoiceId] = useState("");
  const [firmId, setFirmId] = useState(DEFAULT_FIRM_ID);

  async function run<T>(setter: (s: ResultState) => void, fn: () => Promise<T>) {
    setter({ loading: true });
    try {
      const data = await fn();
      setter({ loading: false, data });
    } catch (e: any) {
      setter({ loading: false, error: e?.message ?? String(e) });
    }
  }

  return (
    <>
      <AdminPageHeader
        title="ePošťák sandbox test"
        description="Dočasná diagnostická stránka — TODO: remove before production."
      />
      <AdminPageBody>
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">1) Test autentifikácie</h2>
              <Button
                size="sm"
                onClick={() => run(setAuthRes, () => authFn({}))}
                disabled={authRes.loading}
              >
                Spustiť
              </Button>
            </div>
            <ResultBox state={authRes} />
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">2) Test Peppol lookup</h2>
              <div className="flex items-center gap-2">
                <Input
                  value={peppolId}
                  onChange={(e) => setPeppolId(e.target.value)}
                  className="h-8 w-56"
                  placeholder="0245:5843291067"
                />
                <Button
                  size="sm"
                  onClick={() => run(setLookupRes, () => lookupFn({ data: { peppolId } }))}
                  disabled={lookupRes.loading}
                >
                  Spustiť
                </Button>
              </div>
            </div>
            <ResultBox state={lookupRes} />
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">3) Test odoslania faktúry</h2>
              <Button
                size="sm"
                onClick={() =>
                  run(setSendRes, () =>
                    sendFn({ data: { invoiceId, firmEpostakId: firmId } }),
                  )
                }
                disabled={sendRes.loading || !invoiceId}
              >
                Odoslať
              </Button>
            </div>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Invoice ID (UUID)</Label>
                <Input
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Firm ePošťák ID</Label>
                <Input
                  value={firmId}
                  onChange={(e) => setFirmId(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <ResultBox state={sendRes} />
          </section>
        </div>
      </AdminPageBody>
    </>
  );
}
