import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Split, Copy, Check, ChevronDown, ChevronUp, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  rozdelovacFn,
  priradNepriradenyFn,
  nahrajDoRozdelovacaFn,
  type StavRozdelovaca,
} from "@/lib/faktero/mail-prijem.functions";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

const STAVY: Record<string, { text: string; trieda: string }> = {
  caka: { text: "Čaká na priradenie", trieda: "text-amber-700" },
  spracuva: { text: "Priraďuje sa…", trieda: "text-muted-foreground" },
  priradene: { text: "Priradené", trieda: "text-emerald-700" },
  chyba: { text: "Nepodarilo sa", trieda: "text-destructive" },
};

function naBase64(f: File): Promise<string> {
  return new Promise((ok, zle) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => zle(r.error);
    r.readAsDataURL(f);
  });
}

/**
 * Rozdeľovač (ako v Doklado): jedna adresa a jedno nahratie pre všetky firmy
 * používateľa. Doklad ide do Nespracovaných firmy podľa odberateľa (IČO,
 * IČ DPH, DIČ, IBAN platiteľa, názov); čo nesedí, čaká tu na priradenie.
 */
export function RozdelovacMailov({ otvorenyNaZaciatku = false }: { otvorenyNaZaciatku?: boolean }) {
  const { t, jazyk } = useT();
  const mena = useMenaFirmy();
  const [otvorene, setOtvorene] = useState(otvorenyNaZaciatku);
  const [stav, setStav] = useState<StavRozdelovaca | null>(null);
  const [skopirovane, setSkopirovane] = useState(false);
  const [vyber, setVyber] = useState<Record<string, string>>({});
  const [pracuje, setPracuje] = useState(false);
  const [nahravam, setNahravam] = useState(0);
  const subory = useRef<HTMLInputElement>(null);
  const nacitaj = useServerFn(rozdelovacFn);
  const prirad = useServerFn(priradNepriradenyFn);
  const nahraj = useServerFn(nahrajDoRozdelovacaFn);

  async function obnov(data: { active?: boolean; vymenit?: boolean } = {}) {
    try {
      setStav(await nacitaj({ data }));
    } catch (e: any) {
      toast.error(t(e?.message ?? "Rozdeľovač sa nepodarilo načítať"));
    }
  }

  useEffect(() => {
    if (otvorene && !stav) obnov(); /* eslint-disable-next-line */
  }, [otvorene]);

  // Kým sa niečo priraďuje na pozadí, stav sa dopytuje každé 4 s.
  const bezi = stav?.nepriradene.some((n) => n.status === "spracuva");
  useEffect(() => {
    if (!bezi) return;
    const casovac = setInterval(() => obnov(), 4000);
    return () => clearInterval(casovac); /* eslint-disable-next-line */
  }, [bezi]);

  async function nahrajSubory(zoznam: FileList | null) {
    const vybrane = Array.from(zoznam ?? []);
    if (!vybrane.length) return;
    setNahravam(vybrane.length);
    let ok = 0;
    for (const f of vybrane) {
      try {
        if (f.size > 15 * 1024 * 1024) throw new Error("Súbor je väčší než 15 MB.");
        await nahraj({
          data: { nazov: f.name, mime: f.type || "application/pdf", subor: await naBase64(f) },
        });
        ok++;
      } catch (e: any) {
        toast.error(`${f.name}: ${t(e?.message ?? "Nepodarilo sa")}`);
      } finally {
        setNahravam((n) => n - 1);
      }
    }
    if (ok) toast.success(t("Nahrané — Faktero doklad prečíta a zaradí do firmy"));
    if (subory.current) subory.current.value = "";
    await obnov();
  }

  const caka = stav?.nepriradene.filter((n) => n.status === "caka").length ?? 0;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card">
      <button
        onClick={() => setOtvorene((o) => !o)}
        aria-expanded={otvorene}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          <Split className="h-4 w-4 shrink-0 text-primary" />
          {t("Rozdeľovač — jedna adresa a nahratie pre všetky firmy")}
          {caka > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {t("{n} nepriradené", { n: caka })}
            </span>
          )}
        </span>
        {otvorene ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {otvorene && (
        <div className="border-t border-border p-4">
          {!stav ? (
            <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
          ) : !stav.dostupny ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "Rozdeľovač sa zapne, keď máte prístup k aspoň dvom firmám s právom upravovať doklady. Pre jednu firmu stačí jej adresa na doklady.",
              )}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Doklady pre ktorúkoľvek z vašich firiem posielajte na jednu adresu alebo ich nahrajte tu. Faktero podľa odberateľa na doklade (IČO, IČ DPH, DIČ, prípadne IBAN platiteľa alebo názov) pozná, do ktorej firmy patrí, a pošle ho do jej Nespracovaných. Čo nesedí na žiadnu alebo na viac firiem, počká nižšie na ručné priradenie.",
                )}
              </p>
              {stav.adresa && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                    {stav.adresa}
                  </code>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(stav.adresa!).catch(() => {});
                      setSkopirovane(true);
                      setTimeout(() => setSkopirovane(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    {skopirovane ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {skopirovane ? t("Skopírované") : t("Kopírovať")}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !(await potvrd(
                          t("Stará adresa rozdeľovača okamžite prestane platiť. Vyrobiť novú?"),
                        ))
                      )
                        return;
                      await obnov({ vymenit: true });
                      toast.success(t("Adresa rozdeľovača je nová"));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    <RefreshCw className="h-4 w-4" /> {t("Vymeniť adresu")}
                  </button>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={stav.active}
                      onChange={(e) => obnov({ active: e.target.checked })}
                    />
                    {t("Zapnutý")}
                  </label>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "Adresu poznáte len vy — kto ju má, vie vám poslať doklad. Keď unikne, vymeňte ju.",
                )}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  ref={subory}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.pdf,.jpg,.jpeg,.png,.webp,.heic"
                  className="hidden"
                  onChange={(e) => nahrajSubory(e.target.files)}
                />
                <button
                  disabled={nahravam > 0}
                  onClick={() => subory.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {nahravam > 0
                    ? t("Nahrávam ({n})…", { n: nahravam })
                    : t("Nahrať do ktorejkoľvek firmy")}
                </button>
                <span className="text-xs text-muted-foreground">
                  {t("PDF alebo fotka, najviac 15 MB na súbor.")}
                </span>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Nepriradené doklady")}
                </div>
                {stav.nepriradene.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {t("Všetko sa priradilo samo.")}
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {stav.nepriradene.map((n) => {
                      const st = STAVY[n.status] ?? { text: n.status, trieda: "" };
                      const nahraty = n.zdroj === "nahratie";
                      const kandidati = new Set(n.prilohy.flatMap((p) => p.kandidati ?? []));
                      // Firmy, na ktoré doklad sedí, idú vo výbere navrch.
                      const firmy = [...stav.firmy].sort(
                        (a, b) => Number(kandidati.has(b.id)) - Number(kandidati.has(a.id)),
                      );
                      return (
                        <li
                          key={n.id}
                          className="min-w-0 rounded-md border border-border p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-muted-foreground">
                              {new Date(n.received_at).toLocaleString(lokalJazyka(jazyk))}
                            </span>
                            <span className="min-w-0 break-all font-medium">
                              {nahraty
                                ? (n.file_name ?? t("nahraný súbor"))
                                : (n.from_email ?? t("neznámy"))}
                            </span>
                            <span className="min-w-0 truncate text-muted-foreground">
                              {nahraty ? t("nahrané") : (n.subject ?? "")}
                            </span>
                            <span className={`ml-auto ${st.trieda}`}>{t(st.text)}</span>
                          </div>
                          {n.prilohy
                            .filter((p) => p.dodavatel || p.odberatel || p.suma != null || !nahraty)
                            .map((p) => (
                              <div key={p.id} className="mt-1 text-xs text-muted-foreground">
                                {nahraty ? "" : `${p.nazov ?? t("príloha")} — `}
                                {p.dodavatel ?? t("dodávateľ ?")}
                                {p.suma != null
                                  ? `, ${p.suma} ${p.mena ?? mena.symbol}`
                                  : ""} ·{" "}
                                {t("odberateľ {meno}", { meno: p.odberatel ?? t("neuvedený") })}
                                {p.ico
                                  ? ` (${t("IČO {ico}", { ico: p.ico })})`
                                  : p.ic_dph
                                    ? ` (${t("IČ DPH {ic}", { ic: p.ic_dph })})`
                                    : ""}
                              </div>
                            ))}
                          {n.detail && (
                            <div className="mt-1 text-xs text-muted-foreground">{t(n.detail)}</div>
                          )}
                          {(n.status === "caka" ||
                            (n.status === "chyba" && n.prilohy.length > 0)) && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select
                                aria-label={t("Firma")}
                                value={vyber[n.id] ?? ""}
                                onChange={(e) => setVyber({ ...vyber, [n.id]: e.target.value })}
                                className="min-w-0 max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                              >
                                <option value="">{t("— vyberte firmu —")}</option>
                                {firmy.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {kandidati.has(f.id) ? "★ " : ""}
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
                                      nahraty
                                        ? t("Doklad je v Nespracovaných vybranej firmy")
                                        : t("Priraďuje sa — doklad sa o chvíľu objaví vo firme"),
                                    );
                                    await obnov();
                                  } catch (e: any) {
                                    toast.error(t(e?.message ?? "Nepodarilo sa"));
                                  } finally {
                                    setPracuje(false);
                                  }
                                }}
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
                              >
                                {t("Priradiť")}
                              </button>
                              <button
                                disabled={pracuje}
                                onClick={async () => {
                                  if (
                                    !(await potvrd(
                                      nahraty
                                        ? t("Zahodiť tento súbor? Doklad sa nezaloží.")
                                        : t("Zahodiť tento mail? Doklad sa nezaloží."),
                                    ))
                                  )
                                    return;
                                  try {
                                    await prirad({
                                      data: { id: n.id, company_id: null, zahodit: true },
                                    });
                                  } catch (e: any) {
                                    toast.error(t(e?.message ?? "Nepodarilo sa"));
                                  }
                                  await obnov();
                                }}
                                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                              >
                                {t("Zahodiť")}
                              </button>
                            </div>
                          )}
                          {(n.status === "priradene" ||
                            (n.status === "chyba" && n.prilohy.length === 0)) && (
                            <button
                              onClick={async () => {
                                await prirad({
                                  data: { id: n.id, company_id: null, zahodit: true },
                                });
                                await obnov();
                              }}
                              className="mt-2 text-xs text-primary hover:underline"
                            >
                              {t("Skryť")}
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
