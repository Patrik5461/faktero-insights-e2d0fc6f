import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Mail, Copy, Check, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  stavPrijmuMailom,
  prepniPrijemMailom,
  obnovAdresuNaDoklady,
  type StavPrijmuMailom,
} from "@/lib/faktero/mail-prijem.functions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

const STAVY: Record<string, { text: string; trieda: string }> = {
  hotovo: { text: "Založené", trieda: "text-emerald-700" },
  prijate: { text: "Spracúva sa", trieda: "text-muted-foreground" },
  bez_prilohy: { text: "Bez prílohy", trieda: "text-amber-700" },
  chyba: { text: "Nepodarilo sa", trieda: "text-destructive" },
};

/**
 * Adresa, na ktorú si používateľ prepošle mail od dodávateľa. Denník posledných
 * mailov je tu zámerne — bez neho by pri nedoručenom doklade nebolo kam pozrieť.
 */
export function PrijemMailom() {
  const [stav, setStav] = useState<StavPrijmuMailom | null>(null);
  const [otvorene, setOtvorene] = useState(false);
  const [skopirovane, setSkopirovane] = useState(false);
  const [pracuje, setPracuje] = useState(false);

  const nacitaj = useServerFn(stavPrijmuMailom);
  const prepni = useServerFn(prepniPrijemMailom);
  const obnov = useServerFn(obnovAdresuNaDoklady);

  const cid = getActiveCompanyId();

  async function obnovStav() {
    if (!cid) return;
    try {
      setStav(await nacitaj({ data: { company_id: cid } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Adresu na doklady sa nepodarilo načítať");
    }
  }

  useEffect(() => {
    if (otvorene && !stav) obnovStav(); /* eslint-disable-next-line */
  }, [otvorene]);

  async function kopiruj() {
    if (!stav) return;
    await navigator.clipboard.writeText(stav.adresa).catch(() => {});
    setSkopirovane(true);
    setTimeout(() => setSkopirovane(false), 2000);
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card">
      <button
        onClick={() => setOtvorene((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4 text-primary" />
          Posielanie dokladov e-mailom
        </span>
        {otvorene ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {otvorene && (
        <div className="border-t border-border p-4">
          {!stav ? (
            <div className="text-sm text-muted-foreground">Načítavam…</div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Prepošlite mail od dodávateľa na túto adresu a PDF sa samo založí ako prijatá
                faktúra — s vyplneným dodávateľom, číslom a sumami na kontrolu.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                  {stav.adresa}
                </code>
                <button
                  onClick={kopiruj}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  {skopirovane ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {skopirovane ? "Skopírované" : "Kopírovať"}
                </button>
                <button
                  disabled={pracuje}
                  onClick={async () => {
                    if (!cid) return;
                    if (
                      !confirm("Stará adresa okamžite prestane platiť. Vyrobiť novú?")
                    )
                      return;
                    setPracuje(true);
                    try {
                      await obnov({ data: { company_id: cid } });
                      await obnovStav();
                      toast.success("Adresa je nová");
                    } catch (e: any) {
                      toast.error(e?.message ?? "Nepodarilo sa");
                    } finally {
                      setPracuje(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60"
                  title="Použite, keď sa adresa dostane tam, kam nemala."
                >
                  <RefreshCw className="h-4 w-4" /> Nová adresa
                </button>
                <label className="ml-auto inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stav.active}
                    disabled={pracuje}
                    onChange={async (e) => {
                      if (!cid) return;
                      setPracuje(true);
                      try {
                        await prepni({ data: { company_id: cid, active: e.target.checked } });
                        await obnovStav();
                      } catch (err: any) {
                        toast.error(err?.message ?? "Nepodarilo sa");
                      } finally {
                        setPracuje(false);
                      }
                    }}
                  />
                  Príjem zapnutý
                </label>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Adresu si nechajte pre seba — kto ju pozná, môže vám do prijatých faktúr poslať
                doklad. Ak sa dostane von, vyrobte si novú.
              </p>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Posledné maily
                </div>
                {stav.spravy.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Zatiaľ nič neprišlo
                    {stav.last_received_at ? "" : " — skúste si na tú adresu poslať prvý doklad."}
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {stav.spravy.map((s) => {
                      const st = STAVY[s.status] ?? { text: s.status, trieda: "" };
                      return (
                        <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="text-muted-foreground">
                            {new Date(s.received_at).toLocaleString("sk-SK")}
                          </span>
                          <span className="font-medium">{s.from_email ?? "neznámy"}</span>
                          <span className="truncate text-muted-foreground">{s.subject ?? ""}</span>
                          <span className={`ml-auto ${st.trieda}`}>{st.text}</span>
                          {s.created_invoice_ids?.length > 0 && (
                            <Link
                              to="/prijate-faktury/$id"
                              params={{ id: s.created_invoice_ids[0]! }}
                              className="text-primary hover:underline"
                            >
                              otvoriť doklad
                            </Link>
                          )}
                          {s.detail && (
                            <span className="w-full text-xs text-muted-foreground">{s.detail}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
