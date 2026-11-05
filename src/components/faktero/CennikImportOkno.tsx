import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { formatujJednotkovuCenu } from "@/lib/faktero/mena";
import {
  POLIA_PRODUKTU,
  chybyDoCsv,
  citajTabulku,
  hladinaZHlavicky,
  naplanujImport,
  najdiHlavicku,
  navrhniMapovanie,
  zoradHladiny,
  type Ciel,
  type Mapovanie,
} from "@/lib/faktero/cennik-import";
import {
  MIME_CSV,
  nacitajCennikFirmy,
  stiahniBajty,
  type CennikFirmy,
} from "@/lib/faktero/cennik-data";

type Krok = "subor" | "mapovanie" | "nahlad" | "hotovo";
type Vysledok = {
  nove_hladiny: number;
  nove_produkty: number;
  upravene_produkty: number;
  nove_ceny: number;
  zmenene_ceny: number;
  zmazane_ceny: number;
};

const TLACIDLO =
  "rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary";
const TLACIDLO_HLAVNE =
  "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50";

/**
 * Import cenníka zo súboru XLSX/CSV: nahratie → mapovanie stĺpcov → náhľad →
 * uloženie jednou transakciou (`importuj_cennik`) → súhrn a chybové riadky.
 */
export function CennikImportOkno({
  companyId,
  predvolenaSadzba,
  mena,
  onClose,
  onHotovo,
}: {
  companyId: string;
  predvolenaSadzba: number;
  mena: string;
  onClose: () => void;
  onHotovo: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const [krok, setKrok] = useState<Krok>("subor");
  const [subor, setSubor] = useState<File | null>(null);
  const [hlavicka, setHlavicka] = useState<string[]>([]);
  const [riadky, setRiadky] = useState<string[][]>([]);
  const [prvyRiadok, setPrvyRiadok] = useState(2);
  const [mapovanie, setMapovanie] = useState<Mapovanie>({});
  const [cennik, setCennik] = useState<CennikFirmy | null>(null);
  const [vytvorit, setVytvorit] = useState(false);
  const [prazdnaZmaze, setPrazdnaZmaze] = useState(false);
  const [citam, setCitam] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [vysledok, setVysledok] = useState<Vysledok | null>(null);

  useEffect(() => {
    nacitajCennikFirmy(companyId)
      .then(setCennik)
      .catch((e) =>
        toast.error(t("Cenník sa nepodarilo načítať: {chyba}", { chyba: (e as Error).message })),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` sa mení s jazykom, cenník netreba načítať znova
  }, [companyId]);

  const hladiny = useMemo(() => zoradHladiny(cennik?.hladiny ?? []), [cennik]);

  async function nacitaj(f: File) {
    if (!cennik) return;
    setSubor(f);
    setCitam(true);
    try {
      const vsetko = await citajTabulku(new Uint8Array(await f.arrayBuffer()), f.name);
      const idx = najdiHlavicku(vsetko, hladiny);
      const h = (vsetko[idx] ?? []).map((x) => String(x ?? "").trim());
      const data = vsetko.slice(idx + 1);
      if (!h.length || !data.some((r) => r.some((x) => String(x).trim()))) {
        toast.error(t("V súbore nie sú žiadne riadky s produktmi."));
        return;
      }
      setHlavicka(h);
      setRiadky(data);
      setPrvyRiadok(idx + 2);
      setMapovanie(navrhniMapovanie(h, hladiny));
      setKrok("mapovanie");
    } catch (e) {
      toast.error(t("Súbor sa nepodarilo prečítať: {chyba}", { chyba: (e as Error).message }));
    } finally {
      setCitam(false);
    }
  }

  const plan = useMemo(
    () =>
      cennik && krok !== "subor"
        ? naplanujImport(
            hlavicka,
            riadky,
            mapovanie,
            cennik.produkty,
            cennik.hladiny,
            cennik.ceny,
            { vytvoritChybajuce: vytvorit, prazdnaZmaze, predvolenaSadzba },
            prvyRiadok,
          )
        : null,
    [
      cennik,
      krok,
      hlavicka,
      riadky,
      mapovanie,
      vytvorit,
      prazdnaZmaze,
      predvolenaSadzba,
      prvyRiadok,
    ],
  );

  const ciele = Object.values(mapovanie);
  const maKluc = ciele.some(
    (c) => c === "pole:code" || c === "pole:name" || c === "pole:external_id",
  );
  const maCenu = ciele.some((c) => c !== "pole:code" && c !== "pole:external_id");

  function nastavCiel(i: number, hodnota: string) {
    const m = { ...mapovanie };
    // Jedno pole (aj jedna hladina) len z jedného stĺpca.
    for (const k of Object.keys(m)) if (m[Number(k)] === hodnota) delete m[Number(k)];
    if (hodnota) m[i] = hodnota as Ciel;
    else delete m[i];
    setMapovanie(m);
  }

  async function uloz() {
    if (!plan) return;
    setUkladam(true);
    try {
      const { data, error } = await supabase.rpc("importuj_cennik", {
        p_company_id: companyId,
        p_polozky: plan.polozky as unknown as Json,
        p_nove_hladiny: plan.noveHladiny,
      });
      if (error) throw new Error(error.message);
      setVysledok(data as unknown as Vysledok);
      setKrok("hotovo");
      onHotovo();
    } catch (e) {
      toast.error(
        t("Import sa neuložil, nič sa nezmenilo: {chyba}", { chyba: (e as Error).message }),
        { duration: 12000 },
      );
    } finally {
      setUkladam(false);
    }
  }

  function stiahniChyby() {
    if (!plan?.chyby.length) return;
    const meno = (subor?.name ?? "cennik").replace(/\.[^.]+$/, "");
    stiahniBajty(`${meno}-chyby.csv`, chybyDoCsv(hlavicka, plan.chyby), MIME_CSV);
  }

  const cena = (n: number | null) => (n == null ? "—" : formatujJednotkovuCenu(n, mena));
  const kroky: [Krok, string][] = [
    ["subor", "Súbor"],
    ["mapovanie", "Stĺpce"],
    ["nahlad", "Náhľad"],
    ["hotovo", "Výsledok"],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--w-prekrytie,rgb(0_0_0/0.5))] p-2 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Import cenníka")}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--w-tien-okno)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="flex-1 text-lg font-semibold">{t("Import cenníka")}</h2>
          <button
            onClick={onClose}
            aria-label={t("Zavrieť")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs sm:px-5">
          {kroky.map(([k, nazov], i) => (
            <li
              key={k}
              aria-current={k === krok ? "step" : undefined}
              className={k === krok ? "font-semibold text-foreground" : "text-muted-foreground"}
            >
              {i + 1}. {t(nazov)}
            </li>
          ))}
        </ol>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm sm:p-5">
          {krok === "subor" && (
            <div className="space-y-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary-hover">
                <Upload className="h-4 w-4" /> {t("Vybrať súbor")}
                <input
                  type="file"
                  accept=".xlsx,.xls,.ods,.csv,.txt,.tsv"
                  className="hidden"
                  disabled={!cennik}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) nacitaj(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {!cennik && <p className="text-muted-foreground">{t("Načítavam cenník…")}</p>}
              {citam && <p className="text-muted-foreground">{t("Čítam súbor…")}</p>}
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>
                  {t(
                    "Excel (XLSX) alebo CSV. Najjednoduchšie je stiahnuť si „Exportovať cenník“, upraviť ceny a nahrať ho späť.",
                  )}
                </li>
                <li>
                  {t(
                    "Produkt sa páruje podľa kódu, potom podľa externého ID a nakoniec podľa presného názvu.",
                  )}
                </li>
                <li>
                  {t(
                    "Čísla môžu byť s desatinnou čiarkou aj bodkou, s medzerami aj bez. Prázdna bunka ceny hladiny cenu nemení.",
                  )}
                </li>
              </ul>
            </div>
          )}

          {krok === "mapovanie" && (
            <>
              <p className="text-muted-foreground">
                {t("Súbor {nazov}: {n} riadkov. Ku každému stĺpcu vyberte, čo obsahuje.", {
                  nazov: subor?.name ?? "",
                  n: riadky.filter((r) => r.some((x) => String(x).trim())).length,
                })}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {hlavicka.map((h, i) => {
                  const navrh = hladinaZHlavicky(h);
                  const vlastnaNova =
                    navrh && !hladiny.some((g) => g.name.toLowerCase() === navrh.toLowerCase())
                      ? navrh
                      : null;
                  return (
                    <label key={i} className="flex min-w-0 items-center gap-2">
                      <span className="w-1/2 truncate text-muted-foreground" title={h}>
                        {h || t("Stĺpec {n}", { n: i + 1 })}
                      </span>
                      <select
                        value={mapovanie[i] ?? ""}
                        onChange={(e) => nastavCiel(i, e.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1"
                      >
                        <option value="">{t("— neimportovať —")}</option>
                        <optgroup label={t("Produkt")}>
                          {POLIA_PRODUKTU.map((p) => (
                            <option key={p.pole} value={`pole:${p.pole}`}>
                              {t(p.nazov)}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t("Cenové hladiny")}>
                          {hladiny.map((g) => (
                            <option key={g.id} value={`hladina:${g.id}`}>
                              {t("Cena – {hladina}", { hladina: g.name })}
                            </option>
                          ))}
                          {vlastnaNova && (
                            <option value={`nova:${vlastnaNova}`}>
                              {t("+ Vytvoriť hladinu „{hladina}“", { hladina: vlastnaNova })}
                            </option>
                          )}
                        </optgroup>
                      </select>
                    </label>
                  );
                })}
              </div>
              {ciele.some((c) => c.startsWith("nova:")) && (
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  {t(
                    "Tieto cenové hladiny vo Fakteri ešte nie sú a pri uložení sa založia: {zoznam}.",
                    {
                      zoznam: ciele
                        .filter((c) => c.startsWith("nova:"))
                        .map((c) => c.slice(5))
                        .join(", "),
                    },
                  )}{" "}
                  {t("Ak ich zakladať nechcete, prepnite stĺpec na „— neimportovať —“.")}
                </p>
              )}
              <div className="space-y-2 rounded-xl border border-border p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={vytvorit}
                    onChange={(e) => setVytvorit(e.target.checked)}
                  />
                  <span>
                    {t("Vytvoriť chýbajúce produkty")}
                    <span className="block text-xs text-muted-foreground">
                      {t(
                        "Riadky, ktoré sa so žiadnym produktom nespárujú, sa založia ako nové (treba kód a názov).",
                      )}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={prazdnaZmaze}
                    onChange={(e) => setPrazdnaZmaze(e.target.checked)}
                  />
                  <span>
                    {t("Prázdna bunka zmaže cenu hladiny")}
                    <span className="block text-xs text-muted-foreground">
                      {t(
                        "Bez zaškrtnutia prázdna bunka cenu nemení. Množstevné ceny (od vyššieho množstva) ostanú vždy.",
                      )}
                    </span>
                  </span>
                </label>
              </div>
              {!maKluc && (
                <p className="text-xs text-destructive">
                  {t("Vyberte stĺpec s kódom, externým ID alebo názvom produktu.")}
                </p>
              )}
            </>
          )}

          {krok === "nahlad" && plan && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["Nové produkty", plan.noveProdukty.length],
                    ["Zmenené ceny", plan.zmeneneCeny.length],
                    ["Nezmenené", plan.nezmenene],
                    ["Chyby", plan.chyby.length],
                  ] as const
                ).map(([nazov, n]) => (
                  <div
                    key={nazov}
                    data-suhrn={nazov}
                    className={`rounded-xl border p-3 ${nazov === "Chyby" && n > 0 ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/40"}`}
                  >
                    <div className="text-xs text-muted-foreground">{t(nazov)}</div>
                    <div className="text-xl font-semibold tabular-nums">{n}</div>
                  </div>
                ))}
              </div>
              {(plan.zmeneneUdaje > 0 || plan.noveHladiny.length > 0) && (
                <p className="text-muted-foreground">
                  {plan.zmeneneUdaje > 0 &&
                    t("Údaje (názov, MJ, sadzba DPH, kód) sa zmenia pri {n} produktoch.", {
                      n: plan.zmeneneUdaje,
                    }) + " "}
                  {plan.noveHladiny.length > 0 &&
                    t("Založia sa cenové hladiny: {zoznam}.", {
                      zoznam: plan.noveHladiny.join(", "),
                    })}
                </p>
              )}

              {plan.zmeneneCeny.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[32rem] text-xs">
                    <thead className="bg-muted/40 text-left font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-2">{t("Riadok")}</th>
                        <th className="p-2">{t("Produkt")}</th>
                        <th className="p-2">{t("Cena")}</th>
                        <th className="p-2 text-right">{t("Stará")}</th>
                        <th className="p-2 text-right">{t("Nová")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.zmeneneCeny.slice(0, 100).map((z, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 tabular-nums text-muted-foreground">{z.riadok}</td>
                          <td className="p-2 font-medium">{z.produkt}</td>
                          <td className="p-2">{t(z.co)}</td>
                          <td className="whitespace-nowrap p-2 text-right tabular-nums">
                            {cena(z.stara)}
                          </td>
                          <td className="whitespace-nowrap p-2 text-right tabular-nums">
                            {z.nova == null ? (
                              <span className="text-destructive">{t("zmazať")}</span>
                            ) : (
                              cena(z.nova)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.zmeneneCeny.length > 100 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      {t("… a ďalších {n}.", { n: plan.zmeneneCeny.length - 100 })}
                    </p>
                  )}
                </div>
              )}

              {plan.noveProdukty.length > 0 && (
                <details className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer font-semibold">
                    {t("Nové produkty ({n})", { n: plan.noveProdukty.length })}
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {plan.noveProdukty.slice(0, 100).map((p) => (
                      <li key={p.riadok}>
                        <span className="tabular-nums text-muted-foreground">{p.code}</span>{" "}
                        {p.name}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {plan.chyby.length > 0 && (
                <div className="rounded-xl border border-destructive/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {t("Riadky s chybou sa preskočia ({n})", { n: plan.chyby.length })}
                    </span>
                    <button
                      type="button"
                      onClick={stiahniChyby}
                      className={`${TLACIDLO} inline-flex items-center gap-2 py-1`}
                    >
                      <Download className="h-4 w-4" /> {t("Stiahnuť chybové riadky")}
                    </button>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {plan.chyby.slice(0, 50).map((c) => (
                      <li key={c.riadok}>
                        <span className="tabular-nums text-muted-foreground">
                          {t("Riadok {n}", { n: c.riadok })}:
                        </span>{" "}
                        {c.chyba}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.polozky.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-muted-foreground">
                  {t("Nie je čo uložiť — ceny v súbore sú rovnaké ako vo Fakteri.")}
                </p>
              )}
            </>
          )}

          {krok === "hotovo" && vysledok && (
            <>
              <div className="rounded-xl border border-border bg-muted/40 p-4" data-vysledok>
                <div className="mb-2 font-semibold">{t("Cenník je uložený.")}</div>
                <ul className="space-y-0.5">
                  <li>{t("Nové produkty: {n}", { n: vysledok.nove_produkty })}</li>
                  <li>{t("Upravené produkty: {n}", { n: vysledok.upravene_produkty })}</li>
                  <li>{t("Nové ceny hladín: {n}", { n: vysledok.nove_ceny })}</li>
                  <li>{t("Zmenené ceny hladín: {n}", { n: vysledok.zmenene_ceny })}</li>
                  {vysledok.zmazane_ceny > 0 && (
                    <li>{t("Zmazané ceny hladín: {n}", { n: vysledok.zmazane_ceny })}</li>
                  )}
                  {vysledok.nove_hladiny > 0 && (
                    <li>{t("Nové cenové hladiny: {n}", { n: vysledok.nove_hladiny })}</li>
                  )}
                  {plan && <li>{t("Nezmenené riadky: {n}", { n: plan.nezmenene })}</li>}
                  {plan && plan.chyby.length > 0 && (
                    <li className="text-destructive">
                      {t("Preskočené riadky s chybou: {n}", { n: plan.chyby.length })}
                    </li>
                  )}
                </ul>
              </div>
              {plan && plan.chyby.length > 0 && (
                <button
                  type="button"
                  onClick={stiahniChyby}
                  className={`${TLACIDLO} inline-flex items-center gap-2`}
                >
                  <Download className="h-4 w-4" /> {t("Stiahnuť chybové riadky")}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
          {krok === "hotovo" ? (
            <button onClick={onClose} className={TLACIDLO_HLAVNE}>
              {t("Zavrieť")}
            </button>
          ) : (
            <>
              {krok === "mapovanie" && (
                <button onClick={() => setKrok("subor")} className={TLACIDLO}>
                  {t("Iný súbor")}
                </button>
              )}
              {krok === "nahlad" && (
                <button onClick={() => setKrok("mapovanie")} className={TLACIDLO}>
                  {t("Späť na stĺpce")}
                </button>
              )}
              <button onClick={onClose} className={TLACIDLO}>
                {t("Zrušiť")}
              </button>
              {krok === "mapovanie" && (
                <button
                  onClick={() => setKrok("nahlad")}
                  disabled={!maKluc || !maCenu}
                  className={TLACIDLO_HLAVNE}
                >
                  {t("Pokračovať na náhľad")}
                </button>
              )}
              {krok === "nahlad" && (
                <button
                  onClick={uloz}
                  disabled={ukladam || !plan || plan.polozky.length === 0}
                  className={TLACIDLO_HLAVNE}
                >
                  {ukladam
                    ? t("Ukladám…")
                    : t("Uložiť ({n} produktov)", { n: plan?.polozky.length ?? 0 })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
