import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Download, Upload, X } from "lucide-react";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { potvrd } from "@/lib/potvrdenie";
import { DRUHY_RADOV, NAZVY_DRUHOV, ukazkaCisla, type DruhRadu } from "@/lib/faktero/ciselne-rady";
import {
  STLPCE_RADOV,
  chybyRadovDoTabulky,
  exportRadov,
  riadkyZTabulky,
  type Hlasenie,
  type PlanImportuRadov,
  type RadNaExport,
  type PoleSuboru,
  type RiadokSuboru,
  type ZmenaPola,
} from "@/lib/faktero/ciselne-rady-subor";
import { citajTabulku, vytvorCsv } from "@/lib/faktero/cennik-import";
import { MIME_CSV, MIME_XLSX, stiahniBajty } from "@/lib/faktero/cennik-data";
import {
  importujCiselneRadyFn,
  nahladImportuRadovFn,
} from "@/lib/faktero/ciselne-rady.functions";

type Preklad = (text: string, p?: Record<string, string | number>) => string;

const TLACIDLO =
  "rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary";
const TLACIDLO_HLAVNE =
  "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50";

/** Preložené názvy stĺpcov a druhov — import spozná aj export v češtine či nemčine. */
function aliasy(t: Preklad) {
  return {
    stlpce: Object.fromEntries(STLPCE_RADOV.map((s) => [t(s.nazov), s.pole])) as Record<string, PoleSuboru>,
    druhy: Object.fromEntries(DRUHY_RADOV.map((d) => [t(NAZVY_DRUHOV[d]), d])) as Record<string, DruhRadu>,
  };
}

/** Stiahne všetky číselné rady firmy ako XLSX alebo CSV; vráti počet radov. */
export async function stiahniExportRadov(
  nacitaj: (a: { data: { company_id: string } }) => Promise<{ rady: RadNaExport[] }>,
  companyId: string,
  format: "xlsx" | "csv",
  t: Preklad,
): Promise<number> {
  const { rady } = await nacitaj({ data: { company_id: companyId } });
  const e = exportRadov(rady, (s) => t(s));
  const meno = `ciselne-rady-${new Date().toISOString().slice(0, 10)}`;
  if (format === "csv") {
    stiahniBajty(`${meno}.csv`, vytvorCsv([e.hlavicka, ...e.riadky]), MIME_CSV);
  } else {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([e.hlavicka, ...e.riadky]);
    /* ID, názov a šablóna vždy ako text — Excel by inak zjedol úvodné nuly. */
    for (let r = 1; r <= e.riadky.length; r++) {
      for (const c of [0, 2, 3]) {
        const bunka = ws[XLSX.utils.encode_cell({ r, c })];
        if (bunka) {
          bunka.t = "s";
          bunka.v = String(bunka.v ?? "");
        }
      }
    }
    ws["!cols"] = e.hlavicka.map((h, i) => ({ wch: i === 0 ? 38 : Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("Číselné rady").slice(0, 31));
    stiahniBajty(
      `${meno}.xlsx`,
      new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer) as BlobPart,
      MIME_XLSX,
    );
  }
  return rady.length;
}

type Krok = "subor" | "nahlad" | "hotovo";
type Vysledok = {
  nove: number;
  zmenene: number;
  bez_zmeny: number;
  chyby: { riadok: number; chyba: Hlasenie }[];
};

/**
 * Import číselných radov zo súboru: nahratie → náhľad (nový / zmena / bez
 * zmeny / chyba) → uloženie riadkov bez chyby. Plán počíta server, lebo
 * potrebuje posledné použité poradia dokladov.
 */
export function CiselneRadyImportOkno({
  companyId,
  onClose,
  onHotovo,
}: {
  companyId: string;
  onClose: () => void;
  onHotovo: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const nahladFn = useServerFn(nahladImportuRadovFn);
  const ulozFn = useServerFn(importujCiselneRadyFn);
  const [krok, setKrok] = useState<Krok>("subor");
  const [subor, setSubor] = useState<File | null>(null);
  const [riadky, setRiadky] = useState<RiadokSuboru[]>([]);
  const [plan, setPlan] = useState<PlanImportuRadov | null>(null);
  const [citam, setCitam] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [vysledok, setVysledok] = useState<Vysledok | null>(null);

  const hlasenie = (h: Hlasenie) => t(h.text, h.parametre);

  async function nacitaj(f: File) {
    setSubor(f);
    setCitam(true);
    try {
      const tabulka = await citajTabulku(new Uint8Array(await f.arrayBuffer()), f.name);
      const a = aliasy(t);
      const v = riadkyZTabulky(tabulka, a.stlpce, a.druhy);
      if (v.chyba) return void toast.error(t(v.chyba));
      if (!v.riadky.length) return void toast.error(t("V súbore nie sú žiadne riadky s radmi."));
      if (v.riadky.length > 500) return void toast.error(t("Súbor má viac ako 500 riadkov — rozdeľte ho."));
      const p = await nahladFn({ data: { company_id: companyId, riadky: v.riadky } });
      setRiadky(v.riadky);
      setPlan(p);
      setKrok("nahlad");
    } catch (e) {
      toast.error(t("Súbor sa nepodarilo prečítať: {chyba}", { chyba: (e as Error).message }));
    } finally {
      setCitam(false);
    }
  }

  const naZapis = plan ? plan.pocty.novy + plan.pocty.zmena : 0;

  async function uloz() {
    if (!plan || !naZapis) return;
    const meniaCislovanie = plan.polozky.filter((p) =>
      p.zmeny.some((z) => z.pole === "sablona" || z.pole === "start_from"),
    ).length;
    if (
      meniaCislovanie > 0 &&
      !(await potvrd(
        t("Zmeniť číslovanie {n} radov?", { n: meniaCislovanie }) +
          "\n" +
          t("Nové doklady z týchto radov dostanú čísla podľa novej šablóny či poradia. Vystavené doklady sa neprečíslujú."),
        { potvrdit: t("Uložiť") },
      ))
    )
      return;
    setUkladam(true);
    try {
      const v = await ulozFn({ data: { company_id: companyId, riadky } });
      setVysledok(v);
      setKrok("hotovo");
      onHotovo();
    } catch (e) {
      toast.error(t("Import sa neuložil: {chyba}", { chyba: (e as Error).message }), { duration: 12000 });
    } finally {
      setUkladam(false);
    }
  }

  function stiahniChyby() {
    if (!plan?.pocty.chyba) return;
    const meno = (subor?.name ?? "ciselne-rady").replace(/\.[^.]+$/, "");
    stiahniBajty(`${meno}-chyby.csv`, vytvorCsv(chybyRadovDoTabulky(riadky, plan, hlasenie)), MIME_CSV);
  }

  const hodnota = (v: ZmenaPola["stare"]) =>
    typeof v === "boolean" ? (v ? t("áno") : t("nie")) : String(v);
  const NAZVY_POLI: Record<ZmenaPola["pole"], string> = {
    nazov: "Názov radu",
    sablona: "Šablóna čísla",
    start_from: "Začať od poradia",
    predvoleny: "Predvolený",
    aktivny: "Aktívny",
  };
  const STAVY = {
    novy: { nazov: "Nový rad", trieda: "text-primary" },
    zmena: { nazov: "Zmena", trieda: "text-foreground" },
    bez_zmeny: { nazov: "Bez zmeny", trieda: "text-muted-foreground" },
    chyba: { nazov: "Chyba", trieda: "text-destructive" },
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--w-prekrytie,rgb(0_0_0/0.5))] p-2 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Import číselných radov")}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--w-tien-okno)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="flex-1 text-lg font-semibold">{t("Import číselných radov")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Zavrieť")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm sm:p-5">
          {krok === "subor" && (
            <div className="space-y-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary-hover">
                <Upload className="h-4 w-4" /> {citam ? t("Čítam súbor…") : t("Vybrať súbor")}
                <input
                  type="file"
                  accept=".xlsx,.xls,.ods,.csv,.txt"
                  className="hidden"
                  disabled={citam}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) nacitaj(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>{t("Excel (XLSX) alebo CSV v rovnakom tvare ako export. Najjednoduchšie je stiahnuť si „Exportovať“, upraviť a nahrať späť.")}</li>
                <li>{t("Rad sa páruje podľa ID, inak podľa druhu dokladu a šablóny čísla. Riadok bez páru založí nový rad.")}</li>
                <li>{t("Poradie sa nedá znížiť pod posledné číslo, ktoré už nesie vystavený doklad. Prázdna bunka hodnotu nemení.")}</li>
                <li>{t("Predvolený rad môže byť na druh dokladu len jeden. Stĺpce „Posledné použité poradie“ a „Ďalšie číslo (ukážka)“ sú len na čítanie.")}</li>
              </ul>
            </div>
          )}

          {krok === "nahlad" && plan && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["novy", "zmena", "bez_zmeny", "chyba"] as const).map((s) => (
                  <div
                    key={s}
                    data-suhrn={s}
                    className={`rounded-xl border p-3 ${s === "chyba" && plan.pocty.chyba > 0 ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/40"}`}
                  >
                    <div className="text-xs text-muted-foreground">{t(STAVY[s].nazov)}</div>
                    <div className="text-xl font-semibold tabular-nums">{plan.pocty[s]}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[40rem] text-xs">
                  <thead className="bg-muted/40 text-left font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2">{t("Riadok")}</th>
                      <th className="p-2">{t("Stav")}</th>
                      <th className="p-2">{t("Rad")}</th>
                      <th className="p-2">{t("Ďalšie číslo")}</th>
                      <th className="p-2">{t("Čo sa stane")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.polozky.map((p) => (
                      <tr key={p.riadok} data-stav={p.stav} className="border-t border-border align-top">
                        <td className="p-2 tabular-nums text-muted-foreground">{p.riadok}</td>
                        <td className={`whitespace-nowrap p-2 font-semibold ${STAVY[p.stav].trieda}`}>
                          {t(STAVY[p.stav].nazov)}
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{p.name || "—"}</div>
                          <div className="text-muted-foreground">
                            {p.kind ? t(NAZVY_DRUHOV[p.kind]) : ""}{" "}
                            {p.format && <code className="font-mono">{p.format}</code>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap p-2 tabular-nums">
                          {p.stav !== "chyba" && p.format
                            ? ukazkaCisla(p.format, Math.max(p.start_from, p.posledne + 1))
                            : "—"}
                        </td>
                        <td className="p-2">
                          {p.stav === "chyba" && p.chyba && (
                            <span className="text-destructive">{hlasenie(p.chyba)}</span>
                          )}
                          {p.stav === "novy" && t("Založí sa nový rad.")}
                          {p.zmeny.length > 0 && (
                            <ul className="space-y-0.5">
                              {p.zmeny.map((z) => (
                                <li key={z.pole}>
                                  {t(NAZVY_POLI[z.pole])}: <s className="text-muted-foreground">{hodnota(z.stare)}</s>{" "}
                                  → <strong>{hodnota(z.nove)}</strong>
                                </li>
                              ))}
                            </ul>
                          )}
                          {p.beriePredvoleny && (
                            <div className="text-muted-foreground">
                              {t("Rad „{nazov}“ prestane byť predvolený.", { nazov: p.beriePredvoleny })}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {plan.pocty.chyba > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 p-3">
                  <span className="font-semibold">
                    {t("Riadky s chybou sa preskočia ({n})", { n: plan.pocty.chyba })}
                  </span>
                  <button type="button" onClick={stiahniChyby} className={`${TLACIDLO} inline-flex items-center gap-2 py-1`}>
                    <Download className="h-4 w-4" /> {t("Stiahnuť chybové riadky")}
                  </button>
                </div>
              )}

              {naZapis === 0 && (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-muted-foreground">
                  {t("Nie je čo uložiť — rady v súbore sú rovnaké ako vo Fakteri.")}
                </p>
              )}
            </>
          )}

          {krok === "hotovo" && vysledok && (
            <div className="rounded-xl border border-border bg-muted/40 p-4" data-vysledok>
              <div className="mb-2 font-semibold">{t("Číselné rady sú uložené.")}</div>
              <ul className="space-y-0.5">
                <li>{t("Nové rady: {n}", { n: vysledok.nove })}</li>
                <li>{t("Zmenené rady: {n}", { n: vysledok.zmenene })}</li>
                <li>{t("Nezmenené riadky: {n}", { n: vysledok.bez_zmeny })}</li>
                {vysledok.chyby.length > 0 && (
                  <li className="text-destructive">
                    {t("Preskočené riadky s chybou: {n}", { n: vysledok.chyby.length })}
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {vysledok.chyby.slice(0, 50).map((c, i) => (
                        <li key={i}>
                          {t("Riadok {n}", { n: c.riadok })}: {hlasenie(c.chyba)}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
          {krok === "hotovo" ? (
            <button type="button" onClick={onClose} className={TLACIDLO_HLAVNE}>
              {t("Zavrieť")}
            </button>
          ) : (
            <>
              {krok === "nahlad" && (
                <button type="button" onClick={() => setKrok("subor")} className={TLACIDLO}>
                  {t("Iný súbor")}
                </button>
              )}
              <button type="button" onClick={onClose} className={TLACIDLO}>
                {t("Zrušiť")}
              </button>
              {krok === "nahlad" && (
                <button
                  type="button"
                  onClick={uloz}
                  disabled={ukladam || naZapis === 0}
                  className={TLACIDLO_HLAVNE}
                >
                  {ukladam ? t("Ukladám…") : t("Uložiť ({n} radov)", { n: naZapis })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
