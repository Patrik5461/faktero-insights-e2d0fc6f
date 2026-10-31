import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ulozVykazFn, zostavCzVykazyFn } from "@/lib/faktero/dph-vykazy.functions";
import {
  dp3NaXml,
  kh1NaXml,
  shvNaXml,
  type FormaCz,
  type HlavickaCz,
} from "@/lib/faktero/cz-dph-xml";
import { useT } from "@/lib/i18n/useT";
import { KODY_PREDMETU_PLNENI, kontrolniRadkyC, type KontrolniHlaseni } from "@/lib/faktero/cz-dph";

/*
  České výkazy k DPH: přiznání (DPHDP3) a kontrolní hlášení (DPHKH1) v XML
  pre portál MOJE daně (EPO). Sumy sú v korunách; priznanie v celých
  korunách, kontrolné hlásenie na halier.
*/

type Vysledok = Awaited<ReturnType<typeof zostavCzVykazyFn>>;

/* Kľúč s kontextom — holé „Máj“ má v českom slovníku skratku („Kvě“). */
const MESICE = [
  "mesiac::Január",
  "mesiac::Február",
  "mesiac::Marec",
  "mesiac::Apríl",
  "mesiac::Máj",
  "mesiac::Jún",
  "mesiac::Júl",
  "mesiac::August",
  "mesiac::September",
  "mesiac::Október",
  "mesiac::November",
  "mesiac::December",
];

/** Riadky priznania, ktoré obrazovka ukazuje — kód poľa tlačiva, číslo riadku a popis. */
const RIADKY: { k: string; r: string; popis: string }[] = [
  { k: "obrat23", r: "1", popis: "Tuzemské plnenia — základná sadzba, základ" },
  { k: "dan23", r: "1", popis: "Tuzemské plnenia — základná sadzba, daň" },
  { k: "obrat5", r: "2", popis: "Tuzemské plnenia — znížená sadzba, základ" },
  { k: "dan5", r: "2", popis: "Tuzemské plnenia — znížená sadzba, daň" },
  { k: "p_zb23", r: "3", popis: "Nadobudnutie tovaru z EÚ — základná sadzba, základ" },
  { k: "dan_pzb23", r: "3", popis: "Nadobudnutie tovaru z EÚ — základná sadzba, daň" },
  { k: "p_sl23_e", r: "5", popis: "Prijatie služby z EÚ (§ 9/1) — základ" },
  { k: "dan_psl23_e", r: "5", popis: "Prijatie služby z EÚ (§ 9/1) — daň" },
  { k: "rez_pren23", r: "10", popis: "Prenesenie daňovej povinnosti — odberateľ, základ" },
  { k: "dan_rpren23", r: "10", popis: "Prenesenie daňovej povinnosti — odberateľ, daň" },
  { k: "p_sl23_z", r: "12", popis: "Plnenie od osoby neusadenej v tuzemsku — základ" },
  { k: "dan_psl23_z", r: "12", popis: "Plnenie od osoby neusadenej v tuzemsku — daň" },
  { k: "dod_zb", r: "20", popis: "Dodanie tovaru do EÚ (§ 64)" },
  { k: "pln_sluzby", r: "21", popis: "Služby do EÚ (§ 9/1)" },
  { k: "pln_vyvoz", r: "22", popis: "Vývoz tovaru (§ 66)" },
  { k: "pln_rez_pren", r: "25", popis: "Prenesenie daňovej povinnosti — dodávateľ (§ 92a)" },
  { k: "tri_dozb", r: "31", popis: "Trojstranný obchod — dodanie" },
  { k: "pln23", r: "40", popis: "Odpočet z tuzemska — základná sadzba, základ" },
  { k: "odp_tuz23_nar", r: "40", popis: "Odpočet z tuzemska — základná sadzba, daň" },
  { k: "pln5", r: "41", popis: "Odpočet z tuzemska — znížená sadzba, základ" },
  { k: "odp_tuz5_nar", r: "41", popis: "Odpočet z tuzemska — znížená sadzba, daň" },
  { k: "dov_cu", r: "42", popis: "Dovoz tovaru (colný úrad) — základ" },
  { k: "odp_cu_nar", r: "42", popis: "Dovoz tovaru (colný úrad) — odpočet" },
  { k: "nar_zdp23", r: "43", popis: "Odpočet zo samovymerania — základná sadzba, základ" },
  { k: "od_zdp23", r: "43", popis: "Odpočet zo samovymerania — základná sadzba, daň" },
  { k: "odp_sum_nar", r: "46", popis: "Odpočet dane celkom" },
  { k: "dan_zocelk", r: "62", popis: "Daň na výstupe celkom" },
  { k: "odp_zocelk", r: "63", popis: "Odpočet dane celkom" },
  { k: "dano_da", r: "64", popis: "Vlastná daňová povinnosť" },
  { k: "dano_no", r: "65", popis: "Nadmerný odpočet" },
];

const kc = (n: number | undefined, desatinne = false) =>
  (n ?? 0).toLocaleString("cs-CZ", {
    minimumFractionDigits: desatinne ? 2 : 0,
    maximumFractionDigits: desatinne ? 2 : 0,
  });

function stiahni(nazov: string, obsah: string) {
  const blob = new Blob([obsah], { type: "application/xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nazov;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function CzVykazyDph() {
  const { t } = useT();
  const zostav = useServerFn(zostavCzVykazyFn);
  const uloz = useServerFn(ulozVykazFn);

  const dnes = new Date();
  const minuly = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
  const [rok, setRok] = useState(minuly.getFullYear());
  const [rezim, setRezim] = useState<"mesiac" | "stvrtrok">("mesiac");
  const [mesiac, setMesiac] = useState(minuly.getMonth() + 1);
  const [stvrtrok, setStvrtrok] = useState(Math.floor(minuly.getMonth() / 3) + 1);
  const [formaDp, setFormaDp] = useState<Exclude<FormaCz, "N">>("B");
  const [formaKh, setFormaKh] = useState<Exclude<FormaCz, "D">>("B");
  const [formaSh, setFormaSh] = useState<"R" | "N">("R");
  const [h, setH] = useState({
    cUfo: "",
    cPracufo: "",
    okec: "",
    oprJmeno: "",
    oprPrijmeni: "",
    oprPostaveni: "jednatel",
    kodPredmetu: "",
  });
  const [data, setData] = useState<Vysledok | null>(null);
  const [nacitavam, setNacitavam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const nacitaj = useCallback(async () => {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    setNacitavam(true);
    setChyba(null);
    try {
      const res = await zostav({
        data: {
          company_id: companyId,
          rok,
          mesiac: rezim === "mesiac" ? mesiac : null,
          stvrtrok: rezim === "stvrtrok" ? stvrtrok : null,
          kod_predmetu: h.kodPredmetu || null,
        },
      });
      setData(res);
      // Hlavička z posledného podania, aby sa nevypisovala každý mesiac.
      setH((x) => ({
        cUfo: x.cUfo || res.hlavicka.cUfo,
        cPracufo: x.cPracufo || res.hlavicka.cPracufo,
        okec: x.okec || res.hlavicka.okec,
        oprJmeno: x.oprJmeno || res.hlavicka.oprJmeno,
        oprPrijmeni: x.oprPrijmeni || res.hlavicka.oprPrijmeni,
        oprPostaveni: res.hlavicka.oprPostaveni || x.oprPostaveni,
        kodPredmetu: x.kodPredmetu || res.hlavicka.kodPredmetu,
      }));
    } catch (e: any) {
      setChyba(e?.message ?? t("Výkazy sa nepodarilo zostaviť."));
    } finally {
      setNacitavam(false);
    }
  }, [zostav, rok, rezim, mesiac, stvrtrok, h.kodPredmetu, t]);

  useEffect(() => {
    nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rok, rezim, mesiac, stvrtrok, h.kodPredmetu]);

  const hlavicka: HlavickaCz | null = data
    ? {
        dic: String(data.firma.ic_dph || data.firma.dic || "").replace(/\D/g, ""),
        nazov: data.firma.name ?? "",
        ulica: data.firma.street,
        obec: data.firma.city,
        psc: data.firma.zip,
        email: data.firma.email,
        telefon: data.firma.phone,
        cUfo: h.cUfo,
        cPracufo: h.cPracufo || null,
        okec: h.okec || null,
        typPlatce: data.firma.vat_scheme === "cz_identifikovana" ? "I" : "P",
        oprJmeno: h.oprJmeno || null,
        oprPrijmeni: h.oprPrijmeni || null,
        oprPostaveni: h.oprPostaveni || null,
      }
    : null;

  const oznacenie =
    rezim === "mesiac" ? `${rok}-${String(mesiac).padStart(2, "0")}` : `${rok}-Q${stvrtrok}`;

  function overHlavicku(): boolean {
    if (!/^\d{3}$/.test(h.cUfo)) {
      toast.error(t("Vyplňte kód finančného úradu (3 číslice, napr. 451 pre Prahu)."));
      return false;
    }
    if (!hlavicka?.dic) {
      toast.error(t("Firma nemá DIČ — doplňte ho v Nastaveniach firmy."));
      return false;
    }
    return true;
  }

  async function oznacPodane(
    druh: "cz_dp3" | "cz_kh" | "cz_sh",
    forma: string,
    obsah: Record<string, unknown>,
    mesiacKh?: number,
  ) {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    try {
      await uloz({
        data: {
          company_id: companyId,
          druh,
          typ: forma as any,
          rok,
          mesiac: mesiacKh ?? (rezim === "mesiac" ? mesiac : null),
          stvrtrok: mesiacKh ? null : rezim === "stvrtrok" ? stvrtrok : null,
          data: { ...obsah, hlavicka: h },
          podane: true,
        },
      });
      toast.success(t("Zapísané ako podané."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť."));
    }
  }

  const pole = "input mt-1";
  const popis = "text-xs font-medium text-muted-foreground";

  return (
    <>
      <PageHeader
        title={t("Výkazy k DPH")}
        description={t(
          "Priznanie k DPH a kontrolné hlásenie zostavené z dokladov, v XML pre portál MOJE daně.",
        )}
      />
      <PageBody>
        <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
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
                {MESICE.map((m, i) => (
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
          <label className="block">
            <span className={popis}>{t("Finančný úrad (kód)")}</span>
            <input
              value={h.cUfo}
              onChange={(e) => setH({ ...h, cUfo: e.target.value.replace(/\D/g, "").slice(0, 3) })}
              placeholder={t("napr. {x}", { x: "451" })}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>{t("Územné pracovisko (kód)")}</span>
            <input
              value={h.cPracufo}
              onChange={(e) =>
                setH({ ...h, cPracufo: e.target.value.replace(/\D/g, "").slice(0, 4) })
              }
              placeholder={t("napr. {x}", { x: "2001" })}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>{t("CZ-NACE (hlavná činnosť)")}</span>
            <input
              value={h.okec}
              onChange={(e) => setH({ ...h, okec: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              placeholder={t("napr. {x}", { x: "620100" })}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>{t("Podáva — meno")}</span>
            <input
              value={h.oprJmeno}
              onChange={(e) => setH({ ...h, oprJmeno: e.target.value })}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>{t("Podáva — priezvisko")}</span>
            <input
              value={h.oprPrijmeni}
              onChange={(e) => setH({ ...h, oprPrijmeni: e.target.value })}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>{t("Vzťah k firme")}</span>
            <input
              value={h.oprPostaveni}
              onChange={(e) => setH({ ...h, oprPostaveni: e.target.value })}
              className={pole}
            />
          </label>
          <label className="block sm:col-span-3">
            <span className={popis}>
              {t("Kód predmetu plnenia (prenesenie daňovej povinnosti § 92a)")}
            </span>
            <select
              value={h.kodPredmetu}
              onChange={(e) => setH({ ...h, kodPredmetu: e.target.value })}
              className={pole}
            >
              <option value="">{t("— nevybrané —")}</option>
              {KODY_PREDMETU_PLNENI.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {k.kod} – {k.nazov}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          {t(
            "Kódy finančných úradov a pracovísk nájdete v číselníkoch na portáli MOJE daně (napr. 451 = Finanční úřad pro hlavní město Prahu). Kontrolné hlásenie podáva právnická osoba vždy za mesiac — pri štvrťročnom priznaní sa zostaví za každý mesiac zvlášť.",
          )}
        </p>

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

        {data && (
          <>
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

            {data.vytky.length > 0 && (
              <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  {t("Pred podaním doplňte ({n})", { n: data.vytky.length })}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-400">
                  {data.vytky.slice(0, 20).map((v, i) => (
                    <li key={i}>
                      <span className="font-medium">{v.doklad}</span>: {v.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Přiznání */}
            <section className="mb-6 rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="font-medium">{t("Priznanie k DPH")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("DPHDP3 · sumy v celých korunách")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={formaDp}
                    onChange={(e) => setFormaDp(e.target.value as any)}
                    className="input w-auto"
                  >
                    <option value="B">{t("Riadne")}</option>
                    <option value="O">{t("Riadne opravné")}</option>
                    <option value="D">{t("Dodatočné")}</option>
                    <option value="E">{t("Dodatočné opravné")}</option>
                  </select>
                  <button
                    onClick={() =>
                      hlavicka &&
                      overHlavicku() &&
                      stiahni(
                        `dphdp3-${oznacenie}.xml`,
                        dp3NaXml(data.priznani, hlavicka, data.obdobie, formaDp),
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                  >
                    <Download className="h-4 w-4" /> XML
                  </button>
                  <button
                    onClick={() => oznacPodane("cz_dp3", formaDp, data.priznani)}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Podané")}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {RIADKY.filter((x) => data.priznani[x.k] !== undefined).map((x) => (
                      <tr key={x.k} className="border-b border-border last:border-0">
                        <td className="w-14 px-4 py-2 text-muted-foreground">
                          {t("r. {r}", { r: x.r })}
                        </td>
                        <td className="px-4 py-2">{t(x.popis)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {kc(data.priznani[x.k])} Kč
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Souhrnné hlášení VIES — dodávky do EU */}
            <section className="mb-6 rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="font-medium">{t("Súhrnné hlásenie")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("DPHSHV · dodanie tovaru a služieb do EÚ · v celých korunách")}
                  </div>
                </div>
                {data.souhrnne.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={formaSh}
                      onChange={(e) => setFormaSh(e.target.value as "R" | "N")}
                      className="input w-auto"
                    >
                      <option value="R">{t("Riadne")}</option>
                      <option value="N">{t("Následné")}</option>
                    </select>
                    <button
                      onClick={() =>
                        hlavicka &&
                        overHlavicku() &&
                        stiahni(
                          `dphshv-${oznacenie}.xml`,
                          shvNaXml({ riadky: data.souhrnne, vytky: [] }, hlavicka, data.obdobie, {
                            forma: formaSh,
                          }),
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                    >
                      <Download className="h-4 w-4" /> XML
                    </button>
                    <button
                      onClick={() => oznacPodane("cz_sh", formaSh, { riadky: data.souhrnne })}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                    >
                      <CheckCircle2 className="h-4 w-4" /> {t("Podané")}
                    </button>
                  </div>
                )}
              </div>
              {data.souhrnne.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {t("V období nie sú žiadne dodávky do EÚ — súhrnné hlásenie sa nepodáva.")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2">{t("Odberateľ (IČ DPH)")}</th>
                        <th className="px-4 py-2">{t("Kód plnenia")}</th>
                        <th className="px-4 py-2 text-right">{t("Počet")}</th>
                        <th className="px-4 py-2 text-right">{t("Hodnota")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.souhrnne.map((r) => (
                        <tr
                          key={`${r.stat}${r.vatId}${r.kod}`}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-2 font-mono">
                            {r.stat}
                            {r.vatId}
                          </td>
                          <td className="px-4 py-2">
                            {r.kod === 0
                              ? t("0 – dodanie tovaru")
                              : r.kod === 2
                                ? t("2 – trojstranný obchod")
                                : t("3 – služba")}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.pocet}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{kc(r.hodnota)} Kč</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.souhrnne.length > 0 &&
                rezim === "stvrtrok" &&
                data.souhrnne.some((r) => r.kod !== 3) && (
                  <p className="border-t border-border px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {t(
                      "Pri dodaní tovaru sa súhrnné hlásenie podáva za každý mesiac — prepnite obdobie na mesiac.",
                    )}
                  </p>
                )}
            </section>

            {/* Kontrolní hlášení — po měsících */}
            {data.hlasenia.map(({ mesiac: m, kh }) => (
              <KontrolniHlaseniKarta
                key={m}
                mesiac={m}
                kh={kh as KontrolniHlaseni}
                forma={formaKh}
                setForma={setFormaKh}
                onXml={() =>
                  hlavicka &&
                  overHlavicku() &&
                  bezChybajucehoDic(kh as KontrolniHlaseni, t) &&
                  (!(kh.a1.length || kh.b1.length) || h.kodPredmetu
                    ? stiahni(
                        `dphkh1-${rok}-${String(m).padStart(2, "0")}.xml`,
                        kh1NaXml(
                          kh as KontrolniHlaseni,
                          hlavicka,
                          { rok, mesiac: m },
                          { forma: formaKh, kodPredmetu: h.kodPredmetu },
                        ),
                      )
                    : toast.error(
                        t("Vyberte kód predmetu plnenia pre prenesenie daňovej povinnosti."),
                      ))
                }
                onPodane={() => oznacPodane("cz_kh", formaKh, kh as any, m)}
              />
            ))}
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * Riadky A.1 a B.1 bez DIČ by podateľňa odmietla (DIČ je povinné) — súbor sa
 * nestiahne, kým sa v dokladoch nedoplní, a povie sa, v ktorých.
 */
function bezChybajucehoDic(
  kh: KontrolniHlaseni,
  t: (text: string, p?: Record<string, string | number>) => string,
): boolean {
  const bez = [...kh.a1, ...kh.b1].filter((r) => !r.dic).map((r) => r.doklad);
  if (!bez.length) return true;
  toast.error(
    t(
      bez.length === 1
        ? "Doplňte DIČ pri doklade {doklady} — pri prenesení daňovej povinnosti je povinné."
        : "Doplňte DIČ pri dokladoch {doklady} — pri prenesení daňovej povinnosti je povinné.",
      { doklady: bez.slice(0, 5).join(", ") },
    ),
  );
  return false;
}

function KontrolniHlaseniKarta({
  mesiac,
  kh,
  forma,
  setForma,
  onXml,
  onPodane,
}: {
  mesiac: number;
  kh: KontrolniHlaseni;
  forma: Exclude<FormaCz, "D">;
  setForma: (f: Exclude<FormaCz, "D">) => void;
  onXml: () => void;
  onPodane: () => void;
}) {
  const { t } = useT();
  const c = kontrolniRadkyC(kh);
  const oddiely: { nazov: string; pocet: number; zaklad: number }[] = [
    {
      nazov: "A.1 Prenesenie daňovej povinnosti — dodávateľ",
      pocet: kh.a1.length,
      zaklad: c.pln_rez_pren,
    },
    { nazov: "A.2 Prijaté plnenia zo zahraničia", pocet: kh.a2.length, zaklad: c.celk_zd_a2 },
    {
      nazov: "A.4 Vystavené doklady nad 10 000 Kč",
      pocet: kh.a4.length,
      zaklad: kh.a4.reduce((a, x) => a + x.zaklad1 + x.zaklad2, 0),
    },
    {
      nazov: "A.5 Ostatné vystavené (súhrnne)",
      pocet: kh.a5.zaklad1 || kh.a5.zaklad2 ? 1 : 0,
      zaklad: kh.a5.zaklad1 + kh.a5.zaklad2,
    },
    {
      nazov: "B.1 Prenesenie daňovej povinnosti — odberateľ",
      pocet: kh.b1.length,
      zaklad: c.rez_pren23 + c.rez_pren5,
    },
    {
      nazov: "B.2 Prijaté doklady nad 10 000 Kč",
      pocet: kh.b2.length,
      zaklad: kh.b2.reduce((a, x) => a + x.zaklad1 + x.zaklad2, 0),
    },
    {
      nazov: "B.3 Ostatné prijaté (súhrnne)",
      pocet: kh.b3.zaklad1 || kh.b3.zaklad2 ? 1 : 0,
      zaklad: kh.b3.zaklad1 + kh.b3.zaklad2,
    },
  ];
  return (
    <section className="mb-6 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="font-medium">
            {t("Kontrolné hlásenie — {mesic}", { mesic: t(MESICE[mesiac - 1]) })}
          </div>
          <div className="text-xs text-muted-foreground">{t("DPHKH1 · sumy na halier")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={forma}
            onChange={(e) => setForma(e.target.value as any)}
            className="input w-auto"
          >
            <option value="B">{t("Riadne")}</option>
            <option value="O">{t("Riadne opravné")}</option>
            <option value="N">{t("Následné")}</option>
            <option value="E">{t("Následné opravné")}</option>
          </select>
          <button
            onClick={onXml}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            <Download className="h-4 w-4" /> XML
          </button>
          <button
            onClick={onPodane}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            <CheckCircle2 className="h-4 w-4" /> {t("Podané")}
          </button>
        </div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {oddiely.map((o) => (
            <tr key={o.nazov} className="border-b border-border last:border-0">
              <td className="px-4 py-2">{t(o.nazov)}</td>
              <td className="px-4 py-2 text-right text-muted-foreground">
                {o.pocet ? `${o.pocet}×` : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{kc(o.zaklad, true)} Kč</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
