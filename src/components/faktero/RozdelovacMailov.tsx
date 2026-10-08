import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Split, Copy, Check, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  rozdelovacFn,
  priradNepriradenyFn,
  type StavRozdelovaca,
} from "@/lib/faktero/mail-prijem.functions";
import { potvrd } from "@/lib/potvrdenie";

const STAVY: Record<string, { text: string; trieda: string }> = {
  caka: { text: "Čaká na priradenie", trieda: "text-amber-700" },
  spracuva: { text: "Priraďuje sa…", trieda: "text-muted-foreground" },
  priradene: { text: "Priradené", trieda: "text-emerald-700" },
  chyba: { text: "Nepodarilo sa", trieda: "text-destructive" },
};

/**
 * Rozdeľovač (ako v Doklado): jedna adresa pre všetky firmy používateľa.
 * Doklad ide firme podľa IČO odberateľa; čo nesedí, čaká tu na priradenie.
 */
export function RozdelovacMailov() {
  const [otvorene, setOtvorene] = useState(false);
  const [stav, setStav] = useState<StavRozdelovaca | null>(null);
  const [skopirovane, setSkopirovane] = useState(false);
  const [vyber, setVyber] = useState<Record<string, string>>({});
  const [pracuje, setPracuje] = useState(false);
  const nacitaj = useServerFn(rozdelovacFn);
  const prirad = useServerFn(priradNepriradenyFn);

  async function obnov(data: { active?: boolean; vymenit?: boolean } = {}) {
    try {
      setStav(await nacitaj({ data }));
    } catch (e: any) {
      toast.error(e?.message ?? "Rozdeľovač sa nepodarilo načítať");
    }
  }

  useEffect(() => {
    if (otvorene && !stav) obnov(); /* eslint-disable-next-line */
  }, [otvorene]);

  // Kým sa niečo priraďuje na pozadí, stav sa dopytuje každé 4 s.
  const bezi = stav?.nepriradene.some((n) => n.status === "spracuva");
  useEffect(() => {
    if (!bezi) return;
    const t = setInterval(() => obnov(), 4000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [bezi]);

  const caka = stav?.nepriradene.filter((n) => n.status === "caka").length ?? 0;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card">
      <button
        onClick={() => setOtvorene((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Split className="h-4 w-4 text-primary" />
          Rozdeľovač — jedna adresa pre všetky firmy
          {caka > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {caka} nepriradené
            </span>
          )}
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
                Doklady pre ktorúkoľvek z vašich firiem posielajte na jednu adresu. Faktero podľa
                IČO alebo IČ DPH odberateľa na doklade pozná, do ktorej firmy patrí. Čo nesedí na
                žiadnu, počká nižšie na ručné priradenie.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                  {stav.adresa}
                </code>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(stav.adresa).catch(() => {});
                    setSkopirovane(true);
                    setTimeout(() => setSkopirovane(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  {skopirovane ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {skopirovane ? "Skopírované" : "Kopírovať"}
                </button>
                <button
                  onClick={async () => {
                    if (
                      !(await potvrd(
                        "Stará adresa rozdeľovača okamžite prestane platiť. Vyrobiť novú?",
                      ))
                    )
                      return;
                    await obnov({ vymenit: true });
                    toast.success("Adresa rozdeľovača je nová");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <RefreshCw className="h-4 w-4" /> Vymeniť adresu
                </button>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stav.active}
                    onChange={(e) => obnov({ active: e.target.checked })}
                  />
                  Zapnutý
                </label>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nepriradené doklady
                </div>
                {stav.nepriradene.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Všetko sa priradilo samo.</div>
                ) : (
                  <ul className="space-y-3">
                    {stav.nepriradene.map((n) => {
                      const st = STAVY[n.status] ?? { text: n.status, trieda: "" };
                      return (
                        <li key={n.id} className="rounded-md border border-border p-3 text-sm">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-muted-foreground">
                              {new Date(n.received_at).toLocaleString("sk-SK")}
                            </span>
                            <span className="font-medium">{n.from_email ?? "neznámy"}</span>
                            <span className="min-w-0 truncate text-muted-foreground">
                              {n.subject ?? ""}
                            </span>
                            <span className={`ml-auto ${st.trieda}`}>{st.text}</span>
                          </div>
                          {n.prilohy.map((p) => (
                            <div key={p.id} className="mt-1 text-xs text-muted-foreground">
                              {p.nazov ?? "príloha"} — {p.dodavatel ?? "dodávateľ ?"}
                              {p.suma != null ? `, ${p.suma} ${p.mena ?? "€"}` : ""} · odberateľ{" "}
                              {p.odberatel ?? "neuvedený"}
                              {p.ico ? ` (IČO ${p.ico})` : p.ic_dph ? ` (IČ DPH ${p.ic_dph})` : ""}
                            </div>
                          ))}
                          {n.detail && (
                            <div className="mt-1 text-xs text-muted-foreground">{n.detail}</div>
                          )}
                          {(n.status === "caka" ||
                            (n.status === "chyba" && n.prilohy.length > 0)) && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select
                                aria-label="Firma"
                                value={vyber[n.id] ?? ""}
                                onChange={(e) => setVyber({ ...vyber, [n.id]: e.target.value })}
                                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                              >
                                <option value="">— vyberte firmu —</option>
                                {stav.firmy.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                    {f.ico ? ` (${f.ico})` : ""}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={!vyber[n.id] || pracuje}
                                onClick={async () => {
                                  setPracuje(true);
                                  try {
                                    await prirad({ data: { id: n.id, company_id: vyber[n.id]! } });
                                    toast.success(
                                      "Priraďuje sa — doklad sa o chvíľu objaví vo firme",
                                    );
                                    await obnov();
                                  } catch (e: any) {
                                    toast.error(e?.message ?? "Nepodarilo sa");
                                  } finally {
                                    setPracuje(false);
                                  }
                                }}
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
                              >
                                Priradiť
                              </button>
                              <button
                                disabled={pracuje}
                                onClick={async () => {
                                  if (!(await potvrd("Zahodiť tento mail? Doklad sa nezaloží.")))
                                    return;
                                  await prirad({
                                    data: { id: n.id, company_id: null, zahodit: true },
                                  });
                                  await obnov();
                                }}
                                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                              >
                                Zahodiť
                              </button>
                            </div>
                          )}
                          {n.status === "chyba" && n.prilohy.length === 0 && (
                            <button
                              onClick={async () => {
                                await prirad({
                                  data: { id: n.id, company_id: null, zahodit: true },
                                });
                                await obnov();
                              }}
                              className="mt-2 text-xs text-primary hover:underline"
                            >
                              Skryť
                            </button>
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
