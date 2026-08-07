import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listBankData,
  listBankStatements,
  getBankStatementUrl,
} from "@/lib/faktero/tatrabanka.functions";
import { toast } from "sonner";
import {
  FileText,
  FileCode2,
  ArrowLeft,
  Download,
  Info,
  Clock,
  AlertCircle,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/bankove-ucty/vypisy")({
  head: () => ({ meta: [{ title: "Bankové výpisy — Faktero" }] }),
  component: BankStatementsPage,
});

const MESIACE = [
  "Január",
  "Február",
  "Marec",
  "Apríl",
  "Máj",
  "Jún",
  "Júl",
  "August",
  "September",
  "Október",
  "November",
  "December",
];

/** "2026-07-01" → "Júl 2026" */
function fmtObdobie(periodStart: string) {
  const [y, m] = periodStart.split("-");
  return `${MESIACE[Number(m) - 1]} ${y}`;
}

function fmtVelkost(bytes: number | null) {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} kB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function BankStatementsPage() {
  const loadData = useServerFn(listBankData);
  const loadStatements = useServerFn(listBankStatements);
  const getUrl = useServerFn(getBankStatementUrl);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cid = getActiveCompanyId();
      if (!cid) return setLoading(false);
      try {
        const [d, s] = await Promise.all([
          loadData({ data: { company_id: cid } }),
          loadStatements({ data: { company_id: cid } }),
        ]);
        setAccounts(d.accounts ?? []);
        setStatements(s.statements ?? []);
      } catch (e: any) {
        toast.error(e?.message ?? "Nepodarilo sa načítať výpisy");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onDownload(row: any) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(row.id);
    try {
      const { url } = await getUrl({ data: { company_id: cid, statement_id: row.id } });
      // Odkaz je podpísaný a platí 5 minút — otvárame ho v novom okne.
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(
        e?.message === "not_ready" ? "Výpis ešte nie je pripravený" : "Stiahnutie zlyhalo",
      );
    } finally {
      setBusy(null);
    }
  }

  const uctyPodlaId = new Map(accounts.map((a) => [a.id, a]));

  // Zoskupenie: obdobie → účet → { PDF, XML }
  const obdobia = new Map<string, Map<string, Record<string, any>>>();
  for (const s of statements) {
    if (!obdobia.has(s.period_start)) obdobia.set(s.period_start, new Map());
    const perUcet = obdobia.get(s.period_start)!;
    if (!perUcet.has(s.bank_account_id)) perUcet.set(s.bank_account_id, {});
    perUcet.get(s.bank_account_id)![s.export_type] = s;
  }
  const zoradeneObdobia = [...obdobia.keys()].sort().reverse();

  // Účty, kde výpis nevydala banka a ani my sme ho nedokázali zostaviť —
  // spravidla preto, že nemáme transakcie za celé obdobie.
  const nepodporovane = accounts
    .filter((a) => statements.some((s) => s.bank_account_id === a.id && s.status === "unsupported"))
    .map((a) => ({
      ...a,
      dovod: statements.find((s) => s.bank_account_id === a.id && s.status === "unsupported")
        ?.error,
    }));

  const maVlastne = statements.some((s) => s.source === "faktero" && s.status === "ready");

  return (
    <>
      <PageHeader
        title="Bankové výpisy"
        description="Mesačné výpisy v PDF a XML. Sťahujú sa automaticky; pre účty vedené v inej banke ich zostaví Faktero."
        action={
          <Link
            to="/bankove-ucty"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť na účty
          </Link>
        }
      />
      <PageBody>
        {loading && <div className="text-sm text-muted-foreground">Načítavam…</div>}

        {!loading && zoradeneObdobia.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Zatiaľ tu nie sú žiadne výpisy. Sťahujú sa automaticky vždy na začiatku mesiaca za
              mesiac predchádzajúci.
            </p>
          </div>
        )}

        {zoradeneObdobia.map((obdobie) => {
          const perUcet = obdobia.get(obdobie)!;
          const riadky = [...perUcet.entries()].filter(([, formaty]) =>
            Object.values(formaty).some((s: any) => s.status !== "unsupported"),
          );
          if (riadky.length === 0) return null;
          return (
            <div key={obdobie} className="mt-6 first:mt-0">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {fmtObdobie(obdobie)}
              </h2>
              <div className="mt-3 space-y-2">
                {riadky.map(([ucetId, formaty]) => {
                  const ucet = uctyPodlaId.get(ucetId);
                  const vlastny = Object.values(formaty).some((s: any) => s.source === "faktero");
                  return (
                    <div
                      key={ucetId}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{ucet?.account_name ?? "Účet"}</span>
                          {vlastny && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                              title="Banka pre tento účet výpis nevydáva, zostavilo ho Faktero z načítaných transakcií."
                            >
                              <Sparkles className="h-3 w-3" /> Zostavené Fakterom
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {ucet?.iban ?? "—"}
                        </div>
                      </div>
                      {(["PDF", "XML"] as const).map((typ) => {
                        const s = formaty[typ];
                        if (!s) return null;
                        const Ikona = typ === "PDF" ? FileText : FileCode2;

                        if (s.status === "ready") {
                          return (
                            <button
                              key={typ}
                              onClick={() => onDownload(s)}
                              disabled={busy === s.id}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-secondary disabled:opacity-50"
                            >
                              <Ikona className="h-4 w-4 text-emerald-700" />
                              {typ}
                              <span className="text-xs text-muted-foreground">
                                {fmtVelkost(s.file_size)}
                              </span>
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          );
                        }
                        if (s.status === "pending") {
                          return (
                            <span
                              key={typ}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground"
                              title="Banka výpis ešte generuje, skúste neskôr"
                            >
                              <Clock className="h-4 w-4" /> {typ} sa pripravuje
                            </span>
                          );
                        }
                        return (
                          <span
                            key={typ}
                            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-destructive"
                            title={s.error ?? undefined}
                          >
                            <AlertCircle className="h-4 w-4" /> {typ} zlyhalo
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {maVlastne && (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">Výpisy označené „Zostavené Fakterom“</p>
                <p className="mt-1">
                  Pre účty vedené v inej banke Tatra banka výpis nevydáva, preto ho zostavíme z
                  transakcií, ktoré sme z účtu načítali. Formát je rovnaký ako od banky — PDF na
                  čítanie a XML (camt.053) na import do účtovníctva. Nejde však o doklad vydaný
                  bankou a nemusí obsahovať položky, ktoré banka do prehľadu transakcií neposiela
                  (napríklad niektoré poplatky).
                </p>
              </div>
            </div>
          </div>
        )}

        {nepodporovane.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                <p>
                  Pre tieto účty zatiaľ výpis nemáme — banka ho nevydáva a nemáme ani dosť
                  transakcií na to, aby sme ho zostavili sami. Zostatky a transakcie sa načítavajú
                  normálne.
                </p>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {nepodporovane.map((a) => (
                    <li key={a.id}>
                      <span className="font-mono">{a.iban ?? a.account_name}</span>
                      {a.dovod && !a.dovod.includes("PRODUCT_UNKNOWN") && (
                        <span className="ml-2">— {a.dovod}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
