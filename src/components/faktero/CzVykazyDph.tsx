import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ulozVykazFn, zostavCzVykazyFn } from "@/lib/faktero/dph-vykazy.functions";
import { dp3NaXml, kh1NaXml, type FormaCz, type HlavickaCz } from "@/lib/faktero/cz-dph-xml";
import { KODY_PREDMETU_PLNENI, kontrolniRadkyC, type KontrolniHlaseni } from "@/lib/faktero/cz-dph";

/*
  České výkazy k DPH: přiznání (DPHDP3) a kontrolní hlášení (DPHKH1) v XML
  pre portál MOJE daně (EPO). Sumy sú v korunách; priznanie v celých
  korunách, kontrolné hlásenie na halier.
*/

type Vysledok = Awaited<ReturnType<typeof zostavCzVykazyFn>>;

const MESICE = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

/** Riadky priznania, ktoré obrazovka ukazuje — kód poľa tlačiva, číslo riadku a popis. */
const RIADKY: { k: string; r: string; popis: string }[] = [
  { k: "obrat23", r: "1", popis: "Tuzemská plnění — základní sazba, základ" },
  { k: "dan23", r: "1", popis: "Tuzemská plnění — základní sazba, daň" },
  { k: "obrat5", r: "2", popis: "Tuzemská plnění — snížená sazba, základ" },
  { k: "dan5", r: "2", popis: "Tuzemská plnění — snížená sazba, daň" },
  { k: "p_zb23", r: "3", popis: "Pořízení zboží z EU — základní sazba, základ" },
  { k: "dan_pzb23", r: "3", popis: "Pořízení zboží z EU — základní sazba, daň" },
  { k: "p_sl23_e", r: "5", popis: "Přijetí služby z EU (§ 9/1) — základ" },
  { k: "dan_psl23_e", r: "5", popis: "Přijetí služby z EU (§ 9/1) — daň" },
  { k: "rez_pren23", r: "10", popis: "Přenesení daňové povinnosti — odběratel, základ" },
  { k: "dan_rpren23", r: "10", popis: "Přenesení daňové povinnosti — odběratel, daň" },
  { k: "p_sl23_z", r: "12", popis: "Plnění od osoby neusazené — základ" },
  { k: "dan_psl23_z", r: "12", popis: "Plnění od osoby neusazené — daň" },
  { k: "dod_zb", r: "20", popis: "Dodání zboží do EU (§ 64)" },
  { k: "pln_sluzby", r: "21", popis: "Služby do EU (§ 9/1)" },
  { k: "pln_vyvoz", r: "22", popis: "Vývoz zboží (§ 66)" },
  { k: "pln_rez_pren", r: "25", popis: "Přenesení daňové povinnosti — dodavatel (§ 92a)" },
  { k: "tri_dozb", r: "31", popis: "Třístranný obchod — dodání" },
  { k: "pln23", r: "40", popis: "Odpočet z tuzemska — základní sazba, základ" },
  { k: "odp_tuz23_nar", r: "40", popis: "Odpočet z tuzemska — základní sazba, daň" },
  { k: "pln5", r: "41", popis: "Odpočet z tuzemska — snížená sazba, základ" },
  { k: "odp_tuz5_nar", r: "41", popis: "Odpočet z tuzemska — snížená sazba, daň" },
  { k: "dov_cu", r: "42", popis: "Dovoz zboží (celní úřad) — základ" },
  { k: "odp_cu_nar", r: "42", popis: "Dovoz zboží (celní úřad) — odpočet" },
  { k: "nar_zdp23", r: "43", popis: "Odpočet ze samovyměření — základní sazba, základ" },
  { k: "od_zdp23", r: "43", popis: "Odpočet ze samovyměření — základní sazba, daň" },
  { k: "odp_sum_nar", r: "46", popis: "Odpočet daně celkem" },
  { k: "dan_zocelk", r: "62", popis: "Daň na výstupu celkem" },
  { k: "odp_zocelk", r: "63", popis: "Odpočet daně celkem" },
  { k: "dano_da", r: "64", popis: "Vlastní daňová povinnost" },
  { k: "dano_no", r: "65", popis: "Nadměrný odpočet" },
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
      setChyba(e?.message ?? "Výkazy se nepodařilo sestavit.");
    } finally {
      setNacitavam(false);
    }
  }, [zostav, rok, rezim, mesiac, stvrtrok, h.kodPredmetu]);

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
      toast.error("Vyplňte kód finančního úřadu (3 číslice, např. 451 pro Prahu).");
      return false;
    }
    if (!hlavicka?.dic) {
      toast.error("Firma nemá DIČ — doplňte ho v Nastavení firmy.");
      return false;
    }
    return true;
  }

  async function oznacPodane(
    druh: "cz_dp3" | "cz_kh",
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
      toast.success("Zapsáno jako podané.");
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodařilo se uložit.");
    }
  }

  const pole = "input mt-1";
  const popis = "text-xs font-medium text-muted-foreground";

  return (
    <>
      <PageHeader
        title="Výkazy k DPH"
        description="Přiznání k DPH a kontrolní hlášení sestavené z dokladů, v XML pro portál MOJE daně."
      />
      <PageBody>
        <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block">
            <span className={popis}>Rok</span>
            <input
              type="number"
              value={rok}
              onChange={(e) => setRok(Number(e.target.value))}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>Zdaňovací období</span>
            <select
              value={rezim}
              onChange={(e) => setRezim(e.target.value as "mesiac" | "stvrtrok")}
              className={pole}
            >
              <option value="mesiac">Měsíc</option>
              <option value="stvrtrok">Čtvrtletí</option>
            </select>
          </label>
          <label className="block">
            <span className={popis}>Období</span>
            {rezim === "mesiac" ? (
              <select
                value={mesiac}
                onChange={(e) => setMesiac(Number(e.target.value))}
                className={pole}
              >
                {MESICE.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
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
                    {q}. čtvrtletí
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className={popis}>Finanční úřad (kód)</span>
            <input
              value={h.cUfo}
              onChange={(e) => setH({ ...h, cUfo: e.target.value.replace(/\D/g, "").slice(0, 3) })}
              placeholder="např. 451"
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>Územní pracoviště (kód)</span>
            <input
              value={h.cPracufo}
              onChange={(e) =>
                setH({ ...h, cPracufo: e.target.value.replace(/\D/g, "").slice(0, 4) })
              }
              placeholder="např. 2001"
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>CZ-NACE (hlavní činnost)</span>
            <input
              value={h.okec}
              onChange={(e) => setH({ ...h, okec: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              placeholder="např. 620100"
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>Podává — jméno</span>
            <input
              value={h.oprJmeno}
              onChange={(e) => setH({ ...h, oprJmeno: e.target.value })}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>Podává — příjmení</span>
            <input
              value={h.oprPrijmeni}
              onChange={(e) => setH({ ...h, oprPrijmeni: e.target.value })}
              className={pole}
            />
          </label>
          <label className="block">
            <span className={popis}>Vztah k firmě</span>
            <input
              value={h.oprPostaveni}
              onChange={(e) => setH({ ...h, oprPostaveni: e.target.value })}
              className={pole}
            />
          </label>
          <label className="block sm:col-span-3">
            <span className={popis}>Kód předmětu plnění (přenesení daňové povinnosti § 92a)</span>
            <select
              value={h.kodPredmetu}
              onChange={(e) => setH({ ...h, kodPredmetu: e.target.value })}
              className={pole}
            >
              <option value="">— nevybráno —</option>
              {KODY_PREDMETU_PLNENI.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {k.kod} – {k.nazov}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          Kódy finančních úřadů a pracovišť najdete v číselnících na portálu MOJE daně (např. 451 =
          Finanční úřad pro hlavní město Prahu). Kontrolní hlášení podává právnická osoba vždy za
          měsíc — u čtvrtletního přiznání se sestaví za každý měsíc zvlášť.
        </p>

        {chyba && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chyba}
          </div>
        )}
        {nacitavam && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Sestavuji z dokladů…
          </div>
        )}

        {data && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              V období je {data.pocty.vystavene} vydaných faktur, {data.pocty.prijate} přijatých a{" "}
              {data.pocty.doklady} dokladů s DPH.
            </p>

            {data.vytky.length > 0 && (
              <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  Před podáním doplňte ({data.vytky.length})
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
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
                  <div className="font-medium">Přiznání k DPH</div>
                  <div className="text-xs text-muted-foreground">
                    DPHDP3 · částky v celých korunách
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={formaDp}
                    onChange={(e) => setFormaDp(e.target.value as any)}
                    className="input w-auto"
                  >
                    <option value="B">Řádné</option>
                    <option value="O">Řádné opravné</option>
                    <option value="D">Dodatečné</option>
                    <option value="E">Dodatečné opravné</option>
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
                    <CheckCircle2 className="h-4 w-4" /> Podané
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {RIADKY.filter((x) => data.priznani[x.k] !== undefined).map((x) => (
                      <tr key={x.k} className="border-b border-border last:border-0">
                        <td className="w-14 px-4 py-2 text-muted-foreground">ř. {x.r}</td>
                        <td className="px-4 py-2">{x.popis}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {kc(data.priznani[x.k])} Kč
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  bezChybajucehoDic(kh as KontrolniHlaseni) &&
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
                    : toast.error("Vyberte kód předmětu plnění pro přenesení daňové povinnosti."))
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
function bezChybajucehoDic(kh: KontrolniHlaseni): boolean {
  const bez = [...kh.a1, ...kh.b1].filter((r) => !r.dic).map((r) => r.doklad);
  if (!bez.length) return true;
  toast.error(
    `Doplňte DIČ ${bez.length === 1 ? "u dokladu" : "u dokladů"} ${bez.slice(0, 5).join(", ")} — v přenesení daňové povinnosti je povinné.`,
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
  const c = kontrolniRadkyC(kh);
  const oddiely: { nazov: string; pocet: number; zaklad: number }[] = [
    {
      nazov: "A.1 Přenesení daňové povinnosti — dodavatel",
      pocet: kh.a1.length,
      zaklad: c.pln_rez_pren,
    },
    { nazov: "A.2 Přijatá plnění ze zahraničí", pocet: kh.a2.length, zaklad: c.celk_zd_a2 },
    {
      nazov: "A.4 Vydané doklady nad 10 000 Kč",
      pocet: kh.a4.length,
      zaklad: kh.a4.reduce((a, x) => a + x.zaklad1 + x.zaklad2, 0),
    },
    {
      nazov: "A.5 Ostatní vydané (souhrnně)",
      pocet: kh.a5.zaklad1 || kh.a5.zaklad2 ? 1 : 0,
      zaklad: kh.a5.zaklad1 + kh.a5.zaklad2,
    },
    {
      nazov: "B.1 Přenesení daňové povinnosti — odběratel",
      pocet: kh.b1.length,
      zaklad: c.rez_pren23 + c.rez_pren5,
    },
    {
      nazov: "B.2 Přijaté doklady nad 10 000 Kč",
      pocet: kh.b2.length,
      zaklad: kh.b2.reduce((a, x) => a + x.zaklad1 + x.zaklad2, 0),
    },
    {
      nazov: "B.3 Ostatní přijaté (souhrnně)",
      pocet: kh.b3.zaklad1 || kh.b3.zaklad2 ? 1 : 0,
      zaklad: kh.b3.zaklad1 + kh.b3.zaklad2,
    },
  ];
  return (
    <section className="mb-6 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="font-medium">Kontrolní hlášení — {MESICE[mesiac - 1]}</div>
          <div className="text-xs text-muted-foreground">DPHKH1 · částky na haléře</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={forma}
            onChange={(e) => setForma(e.target.value as any)}
            className="input w-auto"
          >
            <option value="B">Řádné</option>
            <option value="O">Řádné opravné</option>
            <option value="N">Následné</option>
            <option value="E">Následné opravné</option>
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
            <CheckCircle2 className="h-4 w-4" /> Podané
          </button>
        </div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {oddiely.map((o) => (
            <tr key={o.nazov} className="border-b border-border last:border-0">
              <td className="px-4 py-2">{o.nazov}</td>
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
