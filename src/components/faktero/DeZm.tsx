import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Download, Info, Loader2 } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { zostavZmFn } from "@/lib/faktero/zm.functions";
import { HRANICA_STVRTROCNEJ_ZM, suctyZm, zmNaCsv, type DruhZm } from "@/lib/faktero/zm";
import { downloadFile } from "@/lib/faktero/stiahnut-subor";
import { formatujCislo } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

/*
  Nemecká firma: Zusammenfassende Meldung (§ 18a UStG) — súčty dodaní do EÚ
  podľa USt-IdNr. odberateľa a druhu (L/D/S) a CSV na import do
  BZStOnline-Portal. Zobrazuje sa pod prehľadom UStVA na stránke výkazov.
*/

type Vysledok = Awaited<ReturnType<typeof zostavZmFn>>;

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

const DRUHY: Record<DruhZm, string> = {
  L: "Dodanie tovaru do EÚ",
  D: "Trojstranný obchod (§ 25b)",
  S: "Služby podľa § 3a Abs. 2",
};

export function DeZm() {
  const { t, jazyk } = useT();
  const zostav = useServerFn(zostavZmFn);

  const dnes = new Date();
  const minuly = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
  const [rok, setRok] = useState(minuly.getFullYear());
  const [rezim, setRezim] = useState<"mesiac" | "stvrtrok">("mesiac");
  const [mesiac, setMesiac] = useState(minuly.getMonth() + 1);
  const [stvrtrok, setStvrtrok] = useState(Math.floor(minuly.getMonth() / 3) + 1);
  const [sluzbyMesacne, setSluzbyMesacne] = useState(false);
  const [data, setData] = useState<Vysledok | null>(null);
  const [nacitavam, setNacitavam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  /*
    Poradové číslo požiadavky. Zmena mesiaca a hneď nato zaškrtnutie „Služby
    hlásim mesačne“ pošle dve požiadavky naraz; keď staršia dobehla neskôr,
    prepísala novší výsledok a CSV vyšlo bez služieb (riadok S chýbal).
  */
  const poradie = useRef(0);

  const nacitaj = useCallback(async () => {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    const moje = ++poradie.current;
    setNacitavam(true);
    setChyba(null);
    try {
      const vysledok = await zostav({
        data: {
          company_id: companyId,
          rok,
          mesiac: rezim === "mesiac" ? mesiac : null,
          stvrtrok: rezim === "stvrtrok" ? stvrtrok : null,
          sluzby_mesacne: sluzbyMesacne,
        },
      });
      if (moje === poradie.current) setData(vysledok);
    } catch (e: any) {
      if (moje === poradie.current) setChyba(e?.message ?? t("Prehľad sa nepodarilo zostaviť."));
    } finally {
      if (moje === poradie.current) setNacitavam(false);
    }
  }, [zostav, rok, rezim, mesiac, stvrtrok, sluzbyMesacne, t]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  const oznacenie =
    rezim === "mesiac" ? `${rok}-${String(mesiac).padStart(2, "0")}` : `${rok}-Q${stvrtrok}`;
  const loc = lokalJazyka(jazyk);
  const eur = (n: number, des = 0) => `${formatujCislo(n, des, des, loc)} €`;
  const zm = data?.zm ?? null;

  function stiahniCsv() {
    if (!zm?.riadky.length) return;
    const subory = zmNaCsv(zm.riadky);
    subory.forEach((csv, i) =>
      downloadFile(
        subory.length > 1 ? `ZM-${oznacenie}-${i + 1}.csv` : `ZM-${oznacenie}.csv`,
        csv,
        "text/csv",
        "windows-1252",
      ),
    );
  }

  const pole = "input mt-1";
  const popis = "text-xs font-medium text-muted-foreground";
  const sucty = zm ? suctyZm(zm.riadky) : null;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pb-24 sm:px-6 lg:px-6">
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="font-medium">{t("Zusammenfassende Meldung (ZM)")}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Súhrnný výkaz dodaní do EÚ podľa § 18a UStG — súčty podľa USt-IdNr. odberateľa, podáva sa Bundeszentralamt für Steuern (BZSt) do 25. dňa po skončení obdobia.",
            )}
          </p>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-3">
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
            <span className={popis}>{t("Obdobie ZM")}</span>
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
          {rezim === "mesiac" && (
            <label className="flex items-start gap-2 text-sm sm:col-span-3">
              <input
                type="checkbox"
                checked={sluzbyMesacne}
                onChange={(e) => setSluzbyMesacne(e.target.checked)}
                className="mt-1"
              />
              <span>
                {t("Služby hlásim mesačne (§ 18a Abs. 3 UStG)")}
                <span className="block text-xs text-muted-foreground">
                  {t(
                    "Inak patria služby do ZM za posledný mesiac štvrťroka (marec, jún, september, december).",
                  )}
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="mx-4 mb-4 flex gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 text-muted-foreground">
            {t(
              "Mesačne alebo štvrťročne? Dodania tovaru a trojstranné obchody sa hlásia mesačne. Štvrťročne smiete, kým ich súčet neprekročí 50 000 € ani v bežnom, ani v žiadnom zo štyroch predchádzajúcich štvrťrokov. Keď hranicu prekročíte, podáte ZM za mesiac prekročenia a spätne za uplynulé mesiace štvrťroka. Služby (§ 3a Abs. 2) stačí hlásiť štvrťročne.",
            )}
          </p>
        </div>

        {chyba && (
          <div className="mx-4 mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chyba}
          </div>
        )}
        {nacitavam && (
          <div className="mx-4 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Zostavujem z dokladov…")}
          </div>
        )}

        {data?.kleinunternehmer && (
          <div className="mx-4 mb-4 flex gap-3 rounded-lg border border-border p-4 text-sm">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="font-medium">{t("Kleinunternehmer ZM nepodáva")}</div>
              <p className="mt-1 text-muted-foreground">
                {t(
                  "Firma, ktorá uplatňuje § 19 Abs. 1 UStG, je z povinnosti podávať ZM vyňatá (§ 18a Abs. 4 UStG) — oslobodené dodania tovaru do EÚ robiť nemôže a služby do EÚ fakturuje bez dane. Ak režim Kleinunternehmer skončí, ZM sa podáva za každé obdobie s dodaním do EÚ.",
                )}
              </p>
            </div>
          </div>
        )}

        {zm && data && !data.kleinunternehmer && (
          <>
            {data.bezUstIdNr && (
              <div className="mx-4 mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                {t(
                  "Firma nemá vyplnené USt-IdNr. — bez neho sa dodania do EÚ oslobodiť ani ZM podať nedá. Doplňte ho v Nastaveniach firmy.",
                )}
              </div>
            )}
            {zm.nadHranicou && (
              <div className="mx-4 mb-4 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t(
                    "Dodania tovaru a trojstranné obchody za {q}. štvrťrok spolu {suma} — nad hranicou {hranica}. ZM sa musí podávať mesačne, aj spätne za uplynulé mesiace štvrťroka.",
                    {
                      q: zm.stvrtrok,
                      suma: eur(zm.tovarZaStvrtrok, 2),
                      hranica: eur(HRANICA_STVRTROCNEJ_ZM),
                    },
                  )}
                </span>
              </div>
            )}
            {zm.sluzbyOdlozene > 0 && (
              <p className="mx-4 mb-4 text-sm text-muted-foreground">
                {t(
                  "Služby do EÚ ({n}) sa nahlásia v ZM za posledný mesiac štvrťroka, ak ich nehlásite mesačne.",
                  { n: zm.sluzbyOdlozene },
                )}
              </p>
            )}
            {data.vytky.length > 0 && (
              <div className="mx-4 mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
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

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <div className="min-w-0 text-xs text-muted-foreground">
                {t("Sumy v celých eurách · {n} riadkov", { n: zm.riadky.length })}
              </div>
              <button
                type="button"
                onClick={stiahniCsv}
                disabled={!zm.riadky.length}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {t("CSV pre BZSt")}
              </button>
            </div>

            {zm.riadky.length === 0 ? (
              <p className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
                {t("V tomto období nie sú žiadne dodania do EÚ — ZM sa nepodáva.")}
              </p>
            ) : (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2">{t("Krajina")}</th>
                      <th className="px-4 py-2">USt-IdNr.</th>
                      <th className="px-4 py-2">{t("Odberateľ")}</th>
                      <th className="px-4 py-2">{t("Druh")}</th>
                      <th className="px-4 py-2 text-right">{t("Suma")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zm.riadky.map((r) => (
                      <tr
                        key={`${r.krajina}${r.ustIdNr}${r.druh}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-2">{r.krajina}</td>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">{r.ustIdNr}</td>
                        <td className="min-w-0 px-4 py-2">
                          {r.odberatel ?? ""}
                          <span className="block text-xs text-muted-foreground">
                            {t("{n} dokladov", { n: r.dokladov })}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-medium">{r.druh}</span>{" "}
                          <span className="text-muted-foreground">{t(DRUHY[r.druh])}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                          {eur(r.suma)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sucty && zm.riadky.length > 0 && (
              <div className="grid gap-1 border-t border-border px-4 py-3 text-sm sm:grid-cols-3">
                {(Object.keys(DRUHY) as DruhZm[]).map((d) => (
                  <div key={d} className="flex justify-between gap-4 sm:block">
                    <span className="text-muted-foreground">{t(DRUHY[d])}: </span>
                    <span className="tabular-nums">{eur(sucty[d])}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {t(
                "CSV je vo formáte hromadného importu BZStOnline-Portal (verzia #v1.0, stĺpce krajina, USt-IdNr. bez kódu krajiny, suma, druh L/D/S). Formát sme zostavili podľa návodu ELSTER z roku 2015 — pri prvom nahraní overte, že portál verziu prijme; aktuálnu uvádza Hilfe/FAQ portálu. Tovar sa hlási v mesiaci vystavenia faktúry (najneskôr v mesiaci po dodaní) — výkaz berie dátum dodania, faktúru vystavenú až v ďalšom mesiaci preto skontrolujte.",
              )}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
