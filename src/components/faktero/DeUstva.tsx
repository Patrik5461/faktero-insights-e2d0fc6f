import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Download, FileText, Info, Loader2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ustvaPdfFn, zostavUstvaFn } from "@/lib/faktero/ustva.functions";
import { RIADKY_USTVA, ustvaNaCsv, type KzUstva } from "@/lib/faktero/ustva";
import { downloadFile } from "@/lib/faktero/stiahnut-subor";
import { formatujCislo } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";

/*
  Nemecká firma: prehľad Umsatzsteuer-Voranmeldung (UStVA) za mesiac alebo
  štvrťrok — Kennzahlen zostavené z dokladov, na prepis do ELSTER alebo pre
  daňového poradcu. Podanie (ELSTER XML) Faktero nerobí.
*/

type Vysledok = Awaited<ReturnType<typeof zostavUstvaFn>>;

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

/** Riadky, kde je len suma dane (bez základu). */
const LEN_DAN = new Set<KzUstva>(["66", "61", "62", "67", "64", "69", "39", "83"]);

/** Ručne dopĺňané Kennzahlen. */
const RUCNE: { kz: "39" | "48" | "64" | "69"; popis: string }[] = [
  { kz: "39", popis: "KZ 39 — Sondervorauszahlung (zvyčajne v decembri)" },
  { kz: "48", popis: "KZ 48 — oslobodené plnenia bez nároku na odpočet" },
  { kz: "64", popis: "KZ 64 — oprava odpočtu podľa § 15a" },
  { kz: "69", popis: "KZ 69 — daň nesprávne uvedená na faktúre" },
];

export function DeUstva() {
  const { t, jazyk } = useT();
  const zostav = useServerFn(zostavUstvaFn);
  const pdf = useServerFn(ustvaPdfFn);

  const dnes = new Date();
  const minuly = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
  const [rok, setRok] = useState(minuly.getFullYear());
  const [rezim, setRezim] = useState<"mesiac" | "stvrtrok">("mesiac");
  const [mesiac, setMesiac] = useState(minuly.getMonth() + 1);
  const [stvrtrok, setStvrtrok] = useState(Math.floor(minuly.getMonth() / 3) + 1);
  const [rucne, setRucne] = useState<Record<string, string>>({});
  const [data, setData] = useState<Vysledok | null>(null);
  const [nacitavam, setNacitavam] = useState(false);
  const [pdfBezi, setPdfBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const vstup = () => {
    const companyId = getActiveCompanyId();
    if (!companyId) return null;
    const r: Record<string, number> = {};
    for (const [k, v] of Object.entries(rucne)) {
      const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n) && n) r[k] = n;
    }
    return {
      company_id: companyId,
      rok,
      mesiac: rezim === "mesiac" ? mesiac : null,
      stvrtrok: rezim === "stvrtrok" ? stvrtrok : null,
      rucne: r,
    };
  };

  const nacitaj = useCallback(async () => {
    const v = vstup();
    if (!v) return;
    setNacitavam(true);
    setChyba(null);
    try {
      setData(await zostav({ data: v }));
    } catch (e: any) {
      setChyba(e?.message ?? t("Prehľad sa nepodarilo zostaviť."));
    } finally {
      setNacitavam(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zostav, rok, rezim, mesiac, stvrtrok, rucne, t]);

  useEffect(() => {
    nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rok, rezim, mesiac, stvrtrok]);

  const oznacenie =
    rezim === "mesiac" ? `${rok}-${String(mesiac).padStart(2, "0")}` : `${rok}-Q${stvrtrok}`;
  const obdobieText =
    rezim === "mesiac"
      ? `${String(mesiac).padStart(2, "0")}/${rok}`
      : t("{q}. štvrťrok {rok}", { q: stvrtrok, rok });
  const eur = (n: number | undefined) =>
    n == null ? "" : `${formatujCislo(n, 2, 2, jazyk === "de" ? "de-DE" : "sk-SK")} €`;

  function stiahniCsv() {
    if (!data?.ustva) return;
    const csv = ustvaNaCsv(data.ustva, (s) => t(s), {
      firma: data.firma?.name ?? "",
      obdobie: obdobieText,
    });
    downloadFile(`UStVA-${oznacenie}.csv`, csv, "text/csv", "windows-1252");
  }

  async function stiahniPdf() {
    const v = vstup();
    if (!v) return;
    setPdfBezi(true);
    try {
      const r = await pdf({ data: { vstup: v, jazyk } });
      downloadFile(r.nazov, r.base64, "application/pdf", "base64");
    } catch (e: any) {
      toast.error(e?.message ?? t("PDF sa nepodarilo vytvoriť."));
    } finally {
      setPdfBezi(false);
    }
  }

  const pole = "input mt-1";
  const popis = "text-xs font-medium text-muted-foreground";
  const u = data?.ustva ?? null;

  return (
    <>
      <PageHeader
        title={t("Výkazy k DPH")}
        description={t(
          "Prehľad Umsatzsteuer-Voranmeldung (UStVA) zostavený z dokladov — na prepis do ELSTER alebo pre daňového poradcu.",
        )}
      />
      <PageBody>
        <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <label className="block">
            <span className={popis}>{t("Rok")}</span>
            <input
              type="number"
              value={rok}
              onChange={(e) => setRok(Number(e.target.value))}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>{t("Zdaňovacie obdobie")}</span>
            <select
              value={rezim}
              onChange={(e) => setRezim(e.target.value as "mesiac" | "stvrtrok")}
              className={pole}
            >
              <option value="mesiac">{t("Mesiac")}</option>
              <option value="stvrtrok">{t("Štvrťrok")}</option>
            </select>
          </label>
          <label className="block">
            <span className={popis}>{t("Obdobie")}</span>
            {rezim === "mesiac" ? (
              <select
                value={mesiac}
                onChange={(e) => setMesiac(Number(e.target.value))}
                className={pole}
              >
                {MESIACE.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {t(m)}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={stvrtrok}
                onChange={(e) => setStvrtrok(Number(e.target.value))}
                className={pole}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {t("{q}. štvrťrok", { q })}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        {chyba && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chyba}
          </div>
        )}
        {nacitavam && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Zostavujem z dokladov…")}
          </div>
        )}

        {data?.kleinunternehmer && (
          <div className="mb-6 flex gap-3 rounded-xl border border-border bg-card p-4 text-sm">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium">{t("Kleinunternehmer UStVA nepodáva")}</div>
              <p className="mt-1 text-muted-foreground">
                {t(
                  "Firma je vedená ako Kleinunternehmer podľa § 19 UStG — faktúry vystavuje bez dane, daň neodvádza a odpočet nemá, takže mesačné ani štvrťročné priznanie (UStVA) sa nepodáva. Výnimkou je daň, ktorú dlhuje ako príjemca (§ 13b, napr. služba od podnikateľa z EÚ) — tú priznáva aj Kleinunternehmer, prehľad ju zatiaľ nepočíta. Ak obrat v predchádzajúcom roku prekročil 25 000 € alebo v bežnom roku prekročí 100 000 €, režim končí — zmeňte ho v Nastaveniach firmy.",
                )}
              </p>
            </div>
          </div>
        )}

        {u && data && (
          <>
            {data.pocty && (
              <p className="mb-4 text-sm text-muted-foreground">
                {t(
                  "V období je {vystavene} vystavených faktúr, {prijate} prijatých a {doklady} dokladov s DPH.",
                  {
                    vystavene: data.pocty.vystavene,
                    prijate: data.pocty.prijate,
                    doklady: data.pocty.doklady,
                  },
                )}
              </p>
            )}

            {data.vytky.length > 0 && (
              <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  {t("Pred podaním skontrolujte ({n})", { n: data.vytky.length })}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
                  {data.vytky.slice(0, 20).map((v, i) => (
                    <li key={i}>
                      <span className="font-medium">{v.doklad}</span>: {t(v.text)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section className="mb-6 rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{t("Prehľad UStVA")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("Základy dane v celých eurách, daň a odpočet na centy · {obdobie}", {
                      obdobie: obdobieText,
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={stiahniCsv}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    <Download className="h-4 w-4" /> CSV
                  </button>
                  <button
                    type="button"
                    onClick={stiahniPdf}
                    disabled={pdfBezi}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {pdfBezi ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    PDF
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="w-14 px-4 py-2">KZ</th>
                      <th className="px-4 py-2">{t("Popis")}</th>
                      <th className="px-4 py-2 text-right">{t("Základ dane")}</th>
                      <th className="px-4 py-2 text-right">{t("Daň")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RIADKY_USTVA.map((r) => {
                      const zaklad = u.kz[r.kz];
                      const dan =
                        r.danKz === "vypocet"
                          ? u.danKZakladu[r.kz as "81" | "86" | "89" | "93"]
                          : r.danKz
                            ? u.kz[r.danKz]
                            : undefined;
                      if (zaklad == null && dan == null && r.kz !== "83") return null;
                      const lenDan = LEN_DAN.has(r.kz) && !r.danKz;
                      const vysledok = r.kz === "83";
                      return (
                        <tr
                          key={r.kz}
                          className={`border-b border-border last:border-0 ${vysledok ? "font-semibold" : ""}`}
                        >
                          <td className="px-4 py-2 text-muted-foreground">{r.kz}</td>
                          <td className="px-4 py-2">
                            {t(r.popis)}
                            {vysledok && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {(zaklad ?? 0) < 0
                                  ? t("Nadmerný odpočet — finančný úrad vráti")
                                  : t("Na úhradu do 10. dňa po skončení obdobia")}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                            {lenDan ? "" : eur(zaklad)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                            {lenDan ? eur(zaklad ?? 0) : eur(dan)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-1 border-t border-border px-4 py-3 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 sm:block">
                  <span className="text-muted-foreground">{t("Daň spolu")}: </span>
                  <span className="tabular-nums">{eur(u.danSpolu)}</span>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <span className="text-muted-foreground">{t("Odpočet dane spolu")}: </span>
                  <span className="tabular-nums">{eur(u.vorsteuerSpolu)}</span>
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 font-medium">{t("Riadky, ktoré z dokladov nevyplývajú")}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {RUCNE.map((r) => (
                  <label key={r.kz} className="block min-w-0">
                    <span className={popis}>{t(r.popis)}</span>
                    <input
                      inputMode="decimal"
                      value={rucne[r.kz] ?? ""}
                      onChange={(e) => setRucne({ ...rucne, [r.kz]: e.target.value })}
                      className={pole}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void nacitaj()}
                className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                {t("Prepočítať")}
              </button>
            </section>

            <p className="text-xs text-muted-foreground">
              {t(
                "Prehľad sa podáva cez ELSTER (Mein ELSTER alebo program poradcu) do 10. dňa po skončení obdobia, pri Dauerfristverlängerung o mesiac neskôr. Predaj cez OSS sa sem nepočíta — podáva sa v samostatnom priznaní OSS.",
              )}
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}
