import { createFileRoute, Link } from "@tanstack/react-router";
import { KopirovatNastaveniaOkno } from "@/components/faktero/KopirovatNastaveniaOkno";
import { PredponyObjednavky } from "@/components/faktero/PredponyObjednavky";
import { NastaveniaExportu } from "@/components/faktero/NastaveniaExportu";
import { StavyAStitkyNastavenia } from "@/components/faktero/StavyAStitkyNastavenia";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { KodPohody } from "@/components/faktero/KodPohody";
import { PomerEditor, type PomerHodnota } from "@/components/faktero/PomerEditor";
import { OZNACENIA } from "@/lib/faktero/vypis-oznacenie";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import {
  MAX_TOLERANCIA_CENTOV,
  nastaveniaNespracovanych,
  PREDVOLENE_NESPRACOVANE,
  type NastaveniaNespracovanych,
} from "@/lib/faktero/nespracovane-nastavenia";
import {
  AGENDY,
  PREDVOLENE,
  STLPCE_PREDVOLENYCH,
  nazovAgendy,
  ponuka,
  ponukaClenenia,
  ziadostCiselnikov,
  DRUHY_CISELNIKA,
  RADY_POHODY,
  TYPY_DOKLADU_POLOZKY,
  TYPY_PLATBY_POLOZKY,
  type DruhCiselnika,
  type TypDokladuPolozky,
  type TypPlatbyPolozky,
} from "@/lib/faktero/predkontacie";
import {
  importCiselnikaFn,
  nacitatZPohodyFn,
  predkontacieFn,
  ulozPredkontaciuFn,
  ulozPredvoleneFn,
  zmazPredkontaciuFn,
} from "@/lib/faktero/predkontacie.functions";
import { potvrd } from "@/lib/potvrdenie";
import { KV_CLENENIA, KV_PREDVOLENE, nazovKv, type DruhKvPredvoleneho } from "@/lib/faktero/kv-clenenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/**
 * Predkontácie a členenia DPH — číselník z Pohody a predvolené kódy podľa
 * druhu dokladu (vydaná faktúra, prijatá faktúra, bloček, pokladňa, banka).
 *
 * Ako v Doklado: kódy sa naťahajú z účtovného programu a pri doklade sa potom
 * vyberajú s popisom, nie píšu naslepo.
 */
export const Route = createFileRoute("/_authenticated/uctovnictvo/predkontacie")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Predkontácie — Faktero") }],
  }),
  // ?pridat=1 otvorí rovno formulár novej predkontácie (odkaz zo zaúčtovania).
  validateSearch: (s: Record<string, unknown>): { pridat?: string } =>
    s.pridat ? { pridat: String(s.pridat) } : {},
  component: Stranka,
});

type Zaznam = {
  id: string;
  druh: DruhCiselnika;
  kod: string;
  popis: string | null;
  agenda: string;
  ucet_md: string | null;
  ucet_d: string | null;
  zdroj: string;
  aktivne: boolean;
  druhy_dokladov: string[];
  kategoria: string | null;
  pomer: PomerHodnota;
  typ_dokladu: TypDokladuPolozky | null;
  typ_platby: TypPlatbyPolozky | null;
};

const ZDROJ: Record<string, string> = { pohoda: "Pohoda", subor: "súbor", rucne: "ručne" };
const vstup = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const kedy = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("sk-SK", { dateStyle: "medium", timeStyle: "short" }) : "";

function Stranka() {
  const { t } = useT();
  const companyId = getActiveCompanyId();
  const nacitaj = useServerFn(predkontacieFn);
  const [zaznamy, setZaznamy] = useState<Zaznam[] | null>(null);
  const [firma, setFirma] = useState<Record<string, any>>({});
  const [kopirovat, setKopirovat] = useState(false);
  const { pridat: pridatZOdkazu } = Route.useSearch();
  // Každé stlačenie „Pridať predkontáciu“ zvýši číslo — číselník otvorí formulár.
  const [pridat, setPridat] = useState(pridatZOdkazu ? 1 : 0);
  const cid = companyId;

  const obnov = useCallback(async () => {
    if (!companyId) return;
    try {
      const r = await nacitaj({ data: { company_id: companyId } });
      setZaznamy(r.zaznamy as Zaznam[]);
      setFirma(r.firma);
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať"));
      setZaznamy([]);
    }
  }, [companyId, nacitaj]);

  useEffect(() => {
    obnov();
  }, [obnov]);

  if (!companyId || zaznamy === null)
    return (
      <>
        <PageHeader title={t("Predkontácie")} />
        <PageBody>
          <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader
        title={t("Predkontácie")}
        description={t(
          "Číselník predkontácií a členení DPH z Pohody a čo sa predvolene použije pri faktúrach, prijatých faktúrach, bločkoch, pokladni a banke.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPridat((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Pridať predkontáciu")}
            </button>
            <button
              type="button"
              onClick={() => setKopirovat(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              {t("Kopírovať do iných firiem")}
            </button>
          </div>
        }
      />
      {kopirovat && cid ? <KopirovatNastaveniaOkno companyId={cid} onClose={() => setKopirovat(false)} /> : null}
      <PageBody>
        <div className="space-y-4">
          <Predvolene
            companyId={companyId}
            firma={firma}
            zaznamy={zaznamy}
            onUlozene={obnov}
            onPridat={() => setPridat((n) => n + 1)}
          />
          <NastaveniaExportu companyId={companyId} firma={firma} onUlozene={obnov} />
          <Ciselnik companyId={companyId} zaznamy={zaznamy} onZmena={obnov} pridat={pridat} />
          <Import companyId={companyId} firma={firma} onZmena={obnov} />
          <StavyAStitkyNastavenia companyId={companyId} />
        </div>
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------ predvolené */

function Predvolene({
  companyId,
  firma,
  zaznamy,
  onUlozene,
  onPridat,
}: {
  companyId: string;
  firma: Record<string, any>;
  zaznamy: Zaznam[];
  onUlozene: () => void;
  /** Otvorí formulár novej predkontácie v číselníku nižšie. */
  onPridat: () => void;
}) {
  const { t } = useT();
  // Kontrolný výkaz DPH je len slovenský — inde sa členenie KV nepoužije.
  const kvStlpec = String(firma.country ?? "SK").toUpperCase() === "SK";
  const uloz = useServerFn(ulozPredvoleneFn);
  const [h, setH] = useState<Record<string, string>>({});
  const [oznaceni, setOznaceni] = useState<Record<string, string>>({});
  const [blockyAgenda, setBlockyAgenda] = useState<"faktura" | "podla_platby">("podla_platby");
  const [pokladna, setPokladna] = useState("");
  const [odkazNaDoklady, setOdkazNaDoklady] = useState(true);
  const [polozkyBlockov, setPolozkyBlockov] = useState(false);
  const [ine, setIne] = useState({
    parovaciSymbol: "vs" as "vs" | "dodaci_list" | "cislo",
    predkontaciaZaokruhlenie: "",
    qrDoNespracovanych: false,
    povinnePolia: [] as ("zakazka" | "stredisko" | "cinnost")[],
  });
  const [nesp, setNesp] = useState<NastaveniaNespracovanych>(PREDVOLENE_NESPRACOVANE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNesp(nastaveniaNespracovanych(firma.uctovanie_nastavenia));
    setH(Object.fromEntries(STLPCE_PREDVOLENYCH.map((s) => [s, String(firma[s] ?? "")])));
    setOznaceni({
      ...((firma.pohoda_predkontacie_oznaceni as Record<string, string> | null) ?? {}),
    });
    setBlockyAgenda(firma.pohoda_blocky_agenda === "faktura" ? "faktura" : "podla_platby");
    setPokladna(String(firma.pohoda_pokladna ?? ""));
    setOdkazNaDoklady(firma.pohoda_odkaz_na_doklady !== false);
    setPolozkyBlockov(Boolean(firma.pohoda_polozky_blockov));
    setIne({
      parovaciSymbol: (firma.pohoda_parovaci_symbol as any) || "vs",
      predkontaciaZaokruhlenie: String(firma.pohoda_predkontacia_zaokruhlenie ?? ""),
      qrDoNespracovanych: Boolean(firma.qr_blocky_do_nespracovanych),
      povinnePolia: Array.isArray(firma.povinne_polia_dokladu) ? firma.povinne_polia_dokladu : [],
    });
  }, [firma]);

  const pocetNaVyber = (kluc: string, druh: DruhCiselnika) =>
    zaznamy.filter((z) => z.druh === druh && z.aktivne && z.druhy_dokladov?.includes(kluc)).length;

  async function ulozit() {
    setBusy(true);
    try {
      await uloz({
        data: {
          company_id: companyId,
          hodnoty: h,
          oznaceni,
          blockyAgenda,
          pokladna,
          odkazNaDoklady,
          polozkyBlockov,
          ...ine,
          nespracovane: nesp,
        },
      });
      toast.success(t("Uložené"));
      onUlozene();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Predvolené podľa druhu dokladu")}
        </h2>
        <button
          type="button"
          onClick={onPridat}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> {t("Pridať predkontáciu")}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("Použije sa, keď doklad nemá vlastnú predkontáciu — tú mu dá")}{" "}
        <Link to="/uctovnictvo/pravidla" className="underline">
          {t("pravidlo účtovania")}
        </Link>{" "}
        {t("alebo človek pri zaúčtovaní. Prázdne pole = Pohoda doklad nechá nezaúčtovaný.")}
      </p>
      {kvStlpec ? (
        <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "Členenie KV DPH sa použije len pri bežnom doklade — prenesenie daňovej povinnosti (B.1) a opravný doklad (C.2) sa určia vždy podľa zákona.",
        )}
      </p>
      ) : null}

      <div className="mt-4 md:overflow-x-auto">
        <table
          className={`block w-full text-sm md:table ${kvStlpec ? "md:min-w-[760px]" : ""}`}
        >
          <thead className="hidden md:table-header-group">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">{t("Doklad")}</th>
              <th className="py-1 pr-3 font-medium">{t("Predkontácia")}</th>
              <th className="py-1 pr-3 font-medium">{t("Členenie DPH")}</th>
              {kvStlpec ? <th className="py-1 font-medium">{t("Členenie KV DPH")}</th> : null}
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {PREDVOLENE.map((p) => (
              <tr
                key={p.kluc}
                className="block border-t border-border py-2 align-top md:table-row md:py-0"
              >
                <td className="block py-1 font-medium md:table-cell md:py-2 md:pr-3 md:font-normal">
                  {t(p.nazov)}
                  {pocetNaVyber(p.kluc, "predkontacia") + pocetNaVyber(p.kluc, "clenenie_dph") >
                  0 ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("kódov len pre tento doklad:")}{" "}
                      {pocetNaVyber(p.kluc, "predkontacia") + pocetNaVyber(p.kluc, "clenenie_dph")}
                    </span>
                  ) : null}
                  {p.kluc === "doklady" && !h[p.predkontacia] && h.pohoda_predkontacia_prijata ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("prázdne = ako prijatá faktúra")}
                    </span>
                  ) : null}
                </td>
                <td className="block py-1 md:table-cell md:py-2 md:pr-3">
                  <span className="block text-xs text-muted-foreground md:hidden">{t("Predkontácia")}</span>
                  {p.predkontacia ? (
                    <KodPohody
                      ariaLabel={t("Predkontácia — {nazov}", { nazov: t(p.nazov) })}
                      value={h[p.predkontacia] ?? ""}
                      onChange={(v) => setH({ ...h, [p.predkontacia]: v })}
                      moznosti={ponuka(zaznamy, "predkontacia", p.agendy, p.kluc)}
                      placeholder={
                        p.kluc === "doklady" ? h.pohoda_predkontacia_prijata || t("napr. {kod}", { kod: "5Fp" }) : "—"
                      }
                      className={vstup}
                      vyber
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{p.smer === "vstup" ? t("ako prijatá faktúra") : t("ako vydaná faktúra")}</span>
                  )}
                </td>
                <td className="block py-1 md:table-cell md:py-2">
                  <span className="block text-xs text-muted-foreground md:hidden">{t("Členenie DPH")}</span>
                  {p.clenenie ? (
                    <KodPohody
                      ariaLabel={t("Členenie DPH — {nazov}", { nazov: t(p.nazov) })}
                      value={h[p.clenenie] ?? ""}
                      onChange={(v) => setH({ ...h, [p.clenenie!]: v })}
                      moznosti={ponukaClenenia(ponuka(zaznamy, "clenenie_dph", [], p.kluc), p.kluc)}
                      vyber
                      placeholder={
                        p.kluc === "doklady" ? h.pohoda_clenenie_dph_prijata || "—" : "—"
                      }
                      className={vstup}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                {kvStlpec ? (
                <td className="block py-1 md:table-cell md:py-2">
                  <span className="block text-xs text-muted-foreground md:hidden">
                    {t("Členenie KV DPH")}
                  </span>
                  {p.kv ? (
                    <select
                      aria-label={t("Členenie KV DPH — {nazov}", { nazov: t(p.nazov) })}
                      value={h[p.kv] ?? ""}
                      onChange={(e) => setH({ ...h, [p.kv!]: e.target.value })}
                      className={vstup}
                    >
                      <option value="">
                        {KV_PREDVOLENE[p.kluc as DruhKvPredvoleneho].standard
                          ? t("automaticky ({kod})", {
                              kod: KV_PREDVOLENE[p.kluc as DruhKvPredvoleneho].standard!,
                            })
                          : t("automaticky")}
                      </option>
                      {KV_PREDVOLENE[p.kluc as DruhKvPredvoleneho].kody.map((k) => (
                        <option key={k} value={k}>
                          {t(nazovKv(k) ?? k)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="mt-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("Bločky do Pohody")}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="blocky-agenda"
            checked={blockyAgenda === "podla_platby"}
            onChange={() => setBlockyAgenda("podla_platby")}
            className="mt-1"
          />
          <span>
            {t("Podľa spôsobu platby")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Hotovosť ako výdavkový pokladničný doklad, karta ako interný doklad, prevod ako prijatá faktúra.",
              )}
            </span>
          </span>
        </label>
        {blockyAgenda === "podla_platby" && (
          <label className="ml-6 mt-2 block">
            <span className="text-xs text-muted-foreground">{t("Skratka pokladne v Pohode")}</span>
            <span className="block max-w-xs">
              <input
                value={pokladna}
                onChange={(e) => setPokladna(e.target.value)}
                placeholder={t("napr. {kod}", { kod: "HP" })}
                aria-label={t("Skratka pokladne v Pohode")}
                className={vstup}
              />
            </span>
            {!pokladna.trim() && (
              <span className="mt-1 block max-w-prose text-xs text-amber-700">
                {t(
                  "Bez skratky pokladne Pohoda pokladničný doklad nezaloží — hotovostné bločky pôjdu zatiaľ ako prijaté faktúry.",
                )}
              </span>
            )}
          </label>
        )}
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="blocky-agenda"
            checked={blockyAgenda === "faktura"}
            onChange={() => setBlockyAgenda("faktura")}
            className="mt-1"
          />
          <span>
            {t("Všetky ako prijaté faktúry")}
            <span className="block text-xs text-muted-foreground">
              {t("Doklad sa zaúčtuje ako záväzok a úhradu spáruje účtovníčka.")}
            </span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm">
          <input
            type="checkbox"
            checked={polozkyBlockov}
            onChange={(e) => setPolozkyBlockov(e.target.checked)}
            className="mt-1"
          />
          <span>
            {t("Posielať aj položky bločku")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Inak ide len súhrn po sadzbách DPH. Položky idú v cenách s DPH, tak ako sú na bločku. Doklad s ďalšími pokladňami vyberiete v záložke Pokladne v číselníku nižšie.",
              )}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="mt-4 space-y-3 rounded-md border border-border p-3 text-sm">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("Export a spracovanie dokladov")}
        </legend>
        <label className="block">
          <span className="text-xs text-muted-foreground">{t("Párovací symbol v Pohode")}</span>
          <select
            value={ine.parovaciSymbol}
            onChange={(e) => setIne({ ...ine, parovaciSymbol: e.target.value as any })}
            className="mt-1 block w-full max-w-sm rounded-md border border-input bg-background px-2 py-1.5"
          >
            <option value="vs">{t("Variabilný symbol")}</option>
            <option value="dodaci_list">{t("Číslo dodacieho listu (inak VS)")}</option>
            <option value="cislo">{t("Číslo faktúry dodávateľa (inak VS)")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">{t("Predkontácia pre zaokrúhlenie")}</span>
          <input
            value={ine.predkontaciaZaokruhlenie}
            maxLength={30}
            onChange={(e) => setIne({ ...ine, predkontaciaZaokruhlenie: e.target.value })}
            placeholder={t("prázdne = zaokrúhlenie dokladu")}
            className="mt-1 block w-full max-w-sm rounded-md border border-input bg-background px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {t(
              "Keď je vyplnená, rozdiel medzi položkami a sumou dokladu ide ako samostatná položka s touto predkontáciou.",
            )}
          </span>
        </label>
        <div>
          <span className="text-xs text-muted-foreground">
            {t("Zaokrúhlenie zvlášť pre kladné a záporné (prázdne = spoločná predkontácia vyššie)")}
          </span>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_1fr] sm:items-center [&>*]:min-w-0">
            {(["plus", "minus"] as const).map((z) => (
              <Fragment key={z}>
                <span className="text-xs font-medium">
                  {z === "plus" ? t("Kladné (napr. 548100)") : t("Záporné (napr. 648100)")}
                </span>
                <KodPohody
                  ariaLabel={z === "plus" ? t("Predkontácia kladného zaokrúhlenia") : t("Predkontácia záporného zaokrúhlenia")}
                  value={h[`pohoda_predkontacia_zaokruhlenie_${z}`] ?? ""}
                  onChange={(v) => setH({ ...h, [`pohoda_predkontacia_zaokruhlenie_${z}`]: v })}
                  moznosti={ponuka(zaznamy, "predkontacia")}
                  placeholder={ine.predkontaciaZaokruhlenie || t("predkontácia")}
                  bezPopisu
                  vyber
                />
                <KodPohody
                  ariaLabel={z === "plus" ? t("Členenie DPH kladného zaokrúhlenia") : t("Členenie DPH záporného zaokrúhlenia")}
                  value={h[`pohoda_clenenie_dph_zaokruhlenie_${z}`] ?? ""}
                  onChange={(v) => setH({ ...h, [`pohoda_clenenie_dph_zaokruhlenie_${z}`]: v })}
                  moznosti={ponukaClenenia(ponuka(zaznamy, "clenenie_dph"), "prijata")}
                  placeholder={t("členenie DPH")}
                  bezPopisu
                  vyber
                />
                {kvStlpec ? (
                  <select
                    aria-label={z === "plus" ? t("Členenie KV kladného zaokrúhlenia") : t("Členenie KV záporného zaokrúhlenia")}
                    value={h[`kv_clenenie_zaokruhlenie_${z}`] ?? ""}
                    onChange={(e) => setH({ ...h, [`kv_clenenie_zaokruhlenie_${z}`]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{t("KV: nezadané")}</option>
                    {KV_CLENENIA.map((k) => (
                      <option key={k.kod} value={k.kod}>
                        {t(k.nazov)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span />
                )}
              </Fragment>
            ))}
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t(
              "Kladné je, keď je suma dokladu vyššia než súčet položiek, záporné naopak. Pri exporte do Pohody sa vyberie podľa znamienka rozdielu.",
            )}
          </span>
        </div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={ine.qrDoNespracovanych}
            onChange={(e) => setIne({ ...ine, qrDoNespracovanych: e.target.checked })}
          />
          <span>
            {t("Bločky s QR kódom ukladať do Nespracovaných dokladov")}
            <span className="block text-xs text-muted-foreground">
              {t("Inak idú rovno medzi bločky, lebo údaje z Finančnej správy sú úradné.")}
            </span>
          </span>
        </label>
        <div>
          <span className="text-xs text-muted-foreground">{t("Povinné pri spracovaní dokladu")}</span>
          <div className="mt-1 flex flex-wrap gap-4">
            {(
              [
                ["zakazka", "Zákazka"],
                ["stredisko", "Stredisko"],
                ["cinnost", "Činnosť"],
              ] as const
            ).map(([k, n]) => (
              <label key={k} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ine.povinnePolia.includes(k)}
                  onChange={(e) =>
                    setIne({
                      ...ine,
                      povinnePolia: e.target.checked
                        ? [...ine.povinnePolia, k]
                        : ine.povinnePolia.filter((x) => x !== k),
                    })
                  }
                />
                {t(n)}
              </label>
            ))}
          </div>
        </div>
        {(
          [
            [
              "zauctovat",
              "Vytvorený doklad je zaúčtovaný a pripravený na export",
              "Prijatá faktúra vytvorená z Nespracovaných dostane predkontáciu a členenie DPH z dokladu, pravidla, kategórie alebo predvolených a rovno ide do Pohody. Vypnuté = každú faktúru treba ešte zaúčtovať.",
            ],
            [
              "dalsi",
              "Po vytvorení dokladu otvoriť ďalší nespracovaný doklad",
              "Vypnuté = po vytvorení sa vrátite do zoznamu.",
            ],
            [
              "kontrolaSplatnosti",
              "Kontrolovať splatnosť pred dátumom vystavenia",
              "Vypnuté = doklad so splatnosťou skoršou ako vystavenie sa dá vytvoriť.",
            ],
            [
              "polozkyFaktur",
              "Používať vyťažené položky faktúr",
              "Vypnuté = faktúra ide do účtovníctva podľa súčtov a rozpisu DPH, položky sa dajú pri doklade zapnúť.",
            ],
            [
              "polozkyBlockov",
              "Používať vyťažené položky bločkov",
              "",
            ],
            [
              "dodaciList",
              "Preberať číslo dodacieho listu z dokladu",
              "",
            ],
            [
              "domacaMena",
              "Uprednostniť domácu menu pri vyťažovaní",
              "Keď sú na doklade sumy vo viacerých menách (napr. v cudzej mene aj s prepočtom), vyťažia sa sumy v domácej mene firmy. Doklady len v jednej mene sa nemenia.",
            ],
            [
              "typPodlaIban",
              "Automaticky určiť typ faktúry podľa firemných IBAN-ov",
              "Keď je na faktúre ako príjemca platby IBAN niektorého vášho bankového účtu, ide o vašu vystavenú faktúru — Faktero na to upozorní a medzi prijaté ju založí len po potvrdení.",
            ],
          ] as const
        ).map(([k, n, popis]) => (
          <label key={k} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={nesp[k]}
              onChange={(e) => setNesp({ ...nesp, [k]: e.target.checked })}
            />
            <span>
              {t(n)}
              {popis ? <span className="block text-xs text-muted-foreground">{t(popis)}</span> : null}
            </span>
          </label>
        ))}
        <label className="block">
          <span className="text-xs text-muted-foreground">{t("Tolerancia zaokrúhlenia položiek (v centoch)")}</span>
          <input
            type="number"
            min={0}
            max={MAX_TOLERANCIA_CENTOV}
            step={1}
            value={nesp.toleranciaCenty}
            onChange={(e) =>
              setNesp({
                ...nesp,
                toleranciaCenty: Math.min(MAX_TOLERANCIA_CENTOV, Math.max(0, Math.round(Number(e.target.value) || 0))),
              })
            }
            className="mt-1 block w-28 rounded-md border border-input bg-background px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {t(
              "Keď súčet položiek nesedí so sumou dokladu najviac o toľko centov, doklad sa dá vytvoriť a rozdiel sa doplní vyrovnávacou položkou.",
            )}
          </span>
        </label>
        <PredponyObjednavky
          hodnota={nesp.predponyObjednavky}
          onZmena={(predponyObjednavky) => setNesp({ ...nesp, predponyObjednavky })}
        />
      </fieldset>

      <fieldset className="mt-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("Číselné rady a stredisko v Pohode")}</legend>
        <p className="text-xs text-muted-foreground">
          {t(
            "Predpona radu, do ktorého Pohoda doklad očísluje. Prázdne = predvolený rad v Pohode. Doklad môže mať vlastný rad v zaúčtovaní.",
          )}
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RADY_POHODY.map((r) => (
            <label key={r.stlpec} className="block">
              <span className="text-xs text-muted-foreground">{t(r.nazov)}</span>
              <KodPohody
                ariaLabel={t("Číselný rad — {nazov}", { nazov: t(r.nazov) })}
                value={h[r.stlpec] ?? ""}
                onChange={(v) => setH({ ...h, [r.stlpec]: v })}
                moznosti={ponuka(zaznamy, "ciselny_rad").sort(
                  (a, b) =>
                    Number(b.agenda.startsWith(r.agenda)) - Number(a.agenda.startsWith(r.agenda)),
                )}
                placeholder={t("predvolený v Pohode")}
                className={vstup}
                vyber
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Predvolené stredisko")}</span>
            <KodPohody
              ariaLabel={t("Predvolené stredisko")}
              value={h.pohoda_stredisko ?? ""}
              onChange={(v) => setH({ ...h, pohoda_stredisko: v })}
              moznosti={ponuka(zaznamy, "stredisko")}
              placeholder="—"
              className={vstup}
              vyber
            />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={odkazNaDoklady}
            onChange={(e) => setOdkazNaDoklady(e.target.checked)}
            className="mt-1"
          />
          <span>
            {t("Prikladať odkaz na sken bločkov a prijatých faktúr")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Doklad má v Pohode v záložke Dokumenty odkaz, ktorým sa otvorí sken. Odkaz je dlhý náhodný reťazec.",
              )}
            </span>
          </span>
        </label>
      </fieldset>

      <label className="mt-4 block max-w-md">
        <span className="text-xs text-muted-foreground">
          {t("Predkontácia hlavičky pri rozúčtovanom doklade")}
        </span>
        <KodPohody
          ariaLabel={t("Predkontácia hlavičky pri rozúčtovaní")}
          value={h.pohoda_predkontacia_rozuctovat ?? ""}
          onChange={(v) => setH({ ...h, pohoda_predkontacia_rozuctovat: v })}
          moznosti={ponuka(zaznamy, "predkontacia")}
          placeholder={t("Rozúčtovať")}
          className={vstup}
          vyber
        />
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {t(
            "Keď je doklad rozúčtovaný na viac predkontácií, hlavička v Pohode dostane tento kód a predkontácie nesú položky. Prázdne = „Rozúčtovať“.",
          )}
        </span>
      </label>

      <details className="mt-4 rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("Bankové pohyby podľa označenia platby")}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Pri")}{" "}
          <Link to="/uctovnictvo/vypis-do-pohody" className="underline">
            {t("bankovom výpise")}
          </Link>{" "}
          {t(
            "dostane pohyb s týmto označením vlastnú predkontáciu. Prázdne = predkontácia bankového dokladu.",
          )}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {OZNACENIA.map((o) => (
            <label key={o.kod} className="block">
              <span className="text-xs text-muted-foreground">{t(o.nazov)}</span>
              <KodPohody
                value={oznaceni[o.kod] ?? ""}
                onChange={(v) => setOznaceni({ ...oznaceni, [o.kod]: v })}
                moznosti={ponuka(zaznamy, "predkontacia", ["bankIssued", "bankReceived"])}
                placeholder={h.pohoda_predkontacia_banka || t("napr. {kod}", { kod: "3Bv" })}
                vyber
              />
              {o.kod === "transakcna_dan" && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t(
                    "Transakčná daň (zákon 235/2024 Z. z.) nemá doklad. Založte si v Pohode predkontáciu s účtami podľa vašej osnovy (nákladový účet dane a bankový účet) a napíšte sem jej skratku.",
                  )}
                </span>
              )}
            </label>
          ))}
        </div>
      </details>

      <div className="mt-4 flex justify-end">
        <button
          onClick={ulozit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("Uložiť predvolené")}
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- import */

function Import({
  companyId,
  firma,
  onZmena,
}: {
  companyId: string;
  firma: Record<string, any>;
  onZmena: () => void;
}) {
  const { t } = useT();
  const prepni = useServerFn(nacitatZPohodyFn);
  const importuj = useServerFn(importCiselnikaFn);
  const subor = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const caka = Boolean(firma.pohoda_nacitat_ciselniky);

  async function konektor(zapnut: boolean) {
    setBusy("konektor");
    try {
      await prepni({ data: { company_id: companyId, zapnut } });
      toast.success(
        zapnut
          ? t("Pri najbližšom behu konektora si Faktero vypýta predkontácie a členenia DPH.")
          : t("Žiadosť zrušená"),
      );
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(null);
    }
  }

  function stiahniZiadost() {
    const blob = new Blob([ziadostCiselnikov(firma.ico)], { type: "text/xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "faktero-ziadost-predkontacie.xml";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function nahraj(f: File) {
    if (f.size > 5 * 1024 * 1024) return toast.error(t("Súbor je väčší ako 5 MB."));
    setBusy("subor");
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < b.length; i += 0x8000)
        bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      const r = await importuj({
        data: { company_id: companyId, nazov: f.name, base64: btoa(bin) },
      });
      toast.success(
        t("Načítané: {p} predkontácií, {c} členení DPH", { p: r.predkontacii, c: r.cleneni }) +
          (r.ostatnych ? t(", {n} stredísk, činností a radov", { n: r.ostatnych }) : "") +
          (r.vypnutych ? t(" · {n} už v Pohode nie je, vypnuté", { n: r.vypnutych }) : ""),
      );
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Súbor sa nepodarilo načítať"));
    } finally {
      setBusy(null);
      if (subor.current) subor.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Načítať z Pohody")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {firma.pohoda_ciselniky_nacitane_at
          ? t("Naposledy načítané z Pohody {kedy}.", { kedy: kedy(firma.pohoda_ciselniky_nacitane_at) })
          : t("Z Pohody sa ešte nič nenačítalo.")}{" "}
        {t(
          "Opakované načítanie prepíše popisy a účty, nič nezdvojí; kódy, ktoré v Pohode už nie sú, sa vypnú.",
        )}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium">{t("1. Konektorom")}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Keď beží")}{" "}
            <Link to="/uctovnictvo/pohoda" className="underline">
              {t("konektor Pohody")}
            </Link>
            {t(", pri ďalšom behu si číselníky vypýta sám.")}
          </p>
          {caka ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t("Čaká na konektor")}
              </span>
              <button
                onClick={() => konektor(false)}
                disabled={!!busy}
                className="text-xs underline disabled:opacity-50"
              >
                {t("Zrušiť")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => konektor(true)}
              disabled={!!busy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "konektor" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t("Načítať pri ďalšom behu")}
            </button>
          )}
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium">{t("2. XML súborom")}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Žiadosť načítajte v Pohode cez Súbor → Dátová komunikácia → XML import a odpoveď, ktorú Pohoda uloží, nahrajte sem.",
            )}
          </p>
          <button
            onClick={stiahniZiadost}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <Download className="h-4 w-4" /> {t("Stiahnuť žiadosť")}
          </button>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium">{t("3. Nahrať súbor")}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Odpoveď Pohody (XML), alebo tabuľka CSV či Excel so stĺpcami Kód, Popis, prípadne Agenda, MD, D.",
            )}
          </p>
          <input
            ref={subor}
            type="file"
            accept=".xml,.csv,.xlsx,.xls,.ods,text/xml,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) nahraj(f);
            }}
          />
          <button
            onClick={() => subor.current?.click()}
            disabled={!!busy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "subor" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("Nahrať súbor")}
          </button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- číselník */

const PRAZDNY = {
  id: null as string | null,
  kod: "",
  popis: "",
  agenda: "",
  ucet_md: "",
  ucet_d: "",
  aktivne: true,
  druhy_dokladov: [] as string[],
  kategoria: "",
  pomer: null as PomerHodnota,
  typ_dokladu: null as TypDokladuPolozky | null,
  typ_platby: null as TypPlatbyPolozky | null,
};

function Ciselnik({
  companyId,
  zaznamy,
  onZmena,
  pridat = 0,
}: {
  companyId: string;
  zaznamy: Zaznam[];
  onZmena: () => void;
  /** Zvýšené číslo = otvoriť formulár novej predkontácie a posunúť sa k nemu. */
  pridat?: number;
}) {
  const { t } = useT();
  const uloz = useServerFn(ulozPredkontaciuFn);
  const sekcia = useRef<HTMLElement>(null);
  const zmaz = useServerFn(zmazPredkontaciuFn);
  const [druh, setDruh] = useState<DruhCiselnika>("predkontacia");
  const [hladaj, setHladaj] = useState("");
  const [agenda, setAgenda] = useState("");
  const [vsetky, setVsetky] = useState(false);
  const [form, setForm] = useState<typeof PRAZDNY | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pridat) return;
    setDruh("predkontacia");
    setAgenda("");
    setForm({ ...PRAZDNY });
    sekcia.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pridat]);

  const pocty = Object.fromEntries(
    DRUHY_CISELNIKA.map((d) => [d.kod, zaznamy.filter((z) => z.druh === d.kod).length]),
  ) as Record<DruhCiselnika, number>;
  const jednotne = DRUHY_CISELNIKA.find((d) => d.kod === druh)?.jednotne ?? "kód";
  const agendyVZozname = useMemo(
    () => [...new Set(zaznamy.filter((z) => z.druh === druh).map((z) => z.agenda))].sort(),
    [zaznamy, druh],
  );
  const riadky = zaznamy.filter((z) => {
    if (z.druh !== druh) return false;
    if (!vsetky && !z.aktivne) return false;
    if (agenda && z.agenda !== agenda) return false;
    const q = hladaj.trim().toLowerCase();
    return (
      !q ||
      `${z.kod} ${z.popis ?? ""} ${z.ucet_md ?? ""} ${z.ucet_d ?? ""}`.toLowerCase().includes(q)
    );
  });

  async function ulozit() {
    if (!form) return;
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, druh, ...form } });
      toast.success(t("Uložené"));
      setForm(null);
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť"));
    } finally {
      setBusy(false);
    }
  }

  async function prepniAktivne(z: Zaznam) {
    try {
      await uloz({ data: { company_id: companyId, ...z, aktivne: !z.aktivne } });
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    }
  }

  async function zmazat(ids: string[], otazka: string) {
    if (!(await potvrd(otazka))) return;
    try {
      await zmaz({ data: { company_id: companyId, ids } });
      toast.success(t("Zmazané"));
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa zmazať"));
    }
  }

  return (
    <section ref={sekcia} className="scroll-mt-24 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-md bg-muted p-1 text-sm"
          role="tablist"
        >
          {DRUHY_CISELNIKA.map(({ kod: k, nazov: n }) => (
            <button
              key={k}
              role="tab"
              aria-selected={druh === k}
              onClick={() => {
                setDruh(k);
                setAgenda("");
                setForm(null);
              }}
              className={`shrink-0 whitespace-nowrap rounded px-3 py-1 ${druh === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              {t(n)} <span className="text-xs text-muted-foreground">({pocty[k]})</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setForm({ ...PRAZDNY })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {t("Pridať {co}", { co: t(jednotne) })}
        </button>
      </div>

      {form && (
        <div className="mt-4 grid gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:grid-cols-6">
          <label className="block sm:col-span-1">
            <span className="text-xs text-muted-foreground">{t("Kód")}</span>
            <input
              value={form.kod}
              onChange={(e) => setForm({ ...form, kod: e.target.value })}
              className={vstup}
              placeholder={
                druh === "predkontacia"
                  ? "1Fp"
                  : druh === "clenenie_dph"
                    ? "PD"
                    : druh === "ciselny_rad"
                      ? "26FP"
                      : druh === "pokladna"
                        ? "HP"
                        : "BA"
              }
              autoFocus
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-muted-foreground">{t("Popis")}</span>
            <input
              value={form.popis}
              onChange={(e) => setForm({ ...form, popis: e.target.value })}
              className={vstup}
              placeholder={druh === "predkontacia" ? t("Nákup materiálu") : t("Tuzemské plnenie")}
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="text-xs text-muted-foreground">
              {druh === "predkontacia" ? t("Agenda") : t("Typ")}
            </span>
            {druh === "predkontacia" ? (
              <select
                value={form.agenda}
                onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                className={vstup}
              >
                <option value="">{t("všetky")}</option>
                {AGENDY.map((a) => (
                  <option key={a.kod} value={a.kod}>
                    {t(a.nazov)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.agenda}
                onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                className={vstup}
                placeholder={t("napr. prijaté plnenia")}
              />
            )}
          </label>
          {druh === "predkontacia" ? (
            <>
              <label className="block">
                <span className="text-xs text-muted-foreground">MD</span>
                <input
                  value={form.ucet_md}
                  onChange={(e) => setForm({ ...form, ucet_md: e.target.value })}
                  className={vstup}
                  placeholder="501"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">D</span>
                <input
                  value={form.ucet_d}
                  onChange={(e) => setForm({ ...form, ucet_d: e.target.value })}
                  className={vstup}
                  placeholder="321"
                />
              </label>
            </>
          ) : (
            <div className="sm:col-span-2" />
          )}
          <div className="sm:col-span-4">
            <span className="text-xs text-muted-foreground">
              {t("Ponúkať pri dokladoch (nič nezaškrtnuté = všade)")}
            </span>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {PREDVOLENE.filter((p) =>
                druh === "clenenie_dph" ? p.clenenie : p.predkontacia,
              ).map((p) => (
                <label key={p.kluc} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={form.druhy_dokladov.includes(p.kluc)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        druhy_dokladov: e.target.checked
                          ? [...form.druhy_dokladov, p.kluc]
                          : form.druhy_dokladov.filter((k) => k !== p.kluc),
                      })
                    }
                  />
                  {t(p.nazov)}
                </label>
              ))}
            </div>
          </div>
          {druh === "predkontacia" && (
            <>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t("Typ dokladu")}</span>
                <select
                  value={form.typ_dokladu ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, typ_dokladu: (e.target.value || null) as TypDokladuPolozky | null })
                  }
                  className={vstup}
                >
                  <option value="">{t("Všetky doklady")}</option>
                  {TYPY_DOKLADU_POLOZKY.map((x) => (
                    <option key={x.kod} value={x.kod}>
                      {t(x.nazov)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t("Typ platby")}</span>
                <select
                  value={form.typ_platby ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, typ_platby: (e.target.value || null) as TypPlatbyPolozky | null })
                  }
                  className={vstup}
                >
                  <option value="">{t("Všetky platby")}</option>
                  {TYPY_PLATBY_POLOZKY.map((x) => (
                    <option key={x.kod} value={x.kod}>
                      {t(x.nazov)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-4 sm:self-end">
                {t(
                  "Pri doklade s rovnakým typom a platbou sa táto položka ponúkne medzi prvými — napr. „Nákup PHM – platba kartou“ len pri bločku platenom kartou.",
                )}
              </p>
            </>
          )}
          <label className="block sm:col-span-2">
            <span className="text-xs text-muted-foreground">{t("Použiť sám pre kategóriu nákladu")}</span>
            <select
              value={form.kategoria}
              onChange={(e) => setForm({ ...form, kategoria: e.target.value })}
              className={vstup}
            >
              <option value="">—</option>
              {KATEGORIE_VYDAVKOV.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {t(k.nazov)}
                </option>
              ))}
            </select>
          </label>
          {druh === "predkontacia" && (
            <div className="sm:col-span-6">
              <PomerEditor
                value={form.pomer}
                onChange={(pomer) => setForm({ ...form, pomer })}
                predkontacie={ponuka(zaznamy, "predkontacia")}
                clenenia={ponukaClenenia(ponuka(zaznamy, "clenenie_dph"), "prijata")}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-6">
            <p className="mr-auto text-xs text-muted-foreground">
              {t("Kód musí byť rovnaký ako v Pohode, inak ho Pohoda pri importe nenájde.")}
            </p>
            <button
              onClick={() => setForm(null)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              {t("Zrušiť")}
            </button>
            <button
              onClick={ulozit}
              disabled={busy || !form.kod.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Uložiť")}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={hladaj}
          onChange={(e) => setHladaj(e.target.value)}
          placeholder={t("Hľadať kód, popis alebo účet")}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        {agendyVZozname.length > 1 && (
          <select
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            aria-label={t("Agenda")}
          >
            <option value="">{t("Všetky agendy")}</option>
            {agendyVZozname.map((a) => (
              <option key={a} value={a}>
                {druh === "predkontacia" ? t(nazovAgendy(a)) : a || t("bez typu")}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={vsetky} onChange={(e) => setVsetky(e.target.checked)} />
          {t("aj vypnuté")}
        </label>
      </div>

      {riadky.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {pocty[druh] === 0
            ? t("Číselník je prázdny. Načítajte ho z Pohody vyššie alebo pridajte kód ručne.")
            : t("Nič nevyhovuje filtru.")}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">{t("Kód")}</th>
                <th className="py-1 pr-3 font-medium">{t("Popis")}</th>
                <th className="py-1 pr-3 font-medium">
                  {druh === "predkontacia" ? t("Agenda") : t("Typ")}
                </th>
                {druh === "predkontacia" && <th className="py-1 pr-3 font-medium">MD / D</th>}
                <th className="py-1 pr-3 font-medium">{t("Použitie")}</th>
                <th className="py-1 pr-3 font-medium">{t("Zdroj")}</th>
                <th className="py-1 pr-3 font-medium">{t("Aktívne")}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {riadky.map((z) => (
                <tr
                  key={z.id}
                  className={`border-t border-border ${z.aktivne ? "" : "opacity-50"}`}
                >
                  <td className="py-1.5 pr-3 font-mono font-medium">{z.kod}</td>
                  <td className="py-1.5 pr-3">
                    {z.popis ?? "—"}
                    {z.pomer ? (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">
                        {z.pomer.typ === "dph5050"
                          ? t("pomer {z} %, DPH 50 %", { z: z.pomer.zaklad })
                          : t("pomer {p}", { p: z.pomer.casti.map((c) => `${c.podiel}`).join("/") })}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {druh === "predkontacia" ? t(nazovAgendy(z.agenda)) : z.agenda || "—"}
                  </td>
                  {druh === "predkontacia" && (
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      {z.ucet_md || z.ucet_d ? `${z.ucet_md ?? "—"} / ${z.ucet_d ?? "—"}` : "—"}
                    </td>
                  )}
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                    {z.druhy_dokladov?.length
                      ? z.druhy_dokladov
                          .map((k) => t(PREDVOLENE.find((p) => p.kluc === k)?.nazov ?? k))
                          .join(", ")
                      : t("všade")}
                    {z.typ_dokladu || z.typ_platby ? (
                      <span className="block">
                        {[
                          z.typ_dokladu &&
                            t(TYPY_DOKLADU_POLOZKY.find((x) => x.kod === z.typ_dokladu)?.nazov ?? z.typ_dokladu),
                          z.typ_platby &&
                            t(TYPY_PLATBY_POLOZKY.find((x) => x.kod === z.typ_platby)?.nazov ?? z.typ_platby),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    {z.kategoria ? (
                      <span className="block text-foreground">
                        {t("kategória:")}{" "}
                        {t(
                          KATEGORIE_VYDAVKOV.find((k) => k.kod === z.kategoria)?.nazov ??
                            z.kategoria,
                        )}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                    {t(ZDROJ[z.zdroj] ?? z.zdroj)}
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="checkbox"
                      checked={z.aktivne}
                      onChange={() => prepniAktivne(z)}
                      aria-label={t("Aktívne {kod}", { kod: z.kod })}
                    />
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={() =>
                        setForm({
                          id: z.id,
                          kod: z.kod,
                          popis: z.popis ?? "",
                          agenda: z.agenda,
                          ucet_md: z.ucet_md ?? "",
                          ucet_d: z.ucet_d ?? "",
                          aktivne: z.aktivne,
                          druhy_dokladov: z.druhy_dokladov ?? [],
                          kategoria: z.kategoria ?? "",
                          pomer: z.pomer ?? null,
                          typ_dokladu: z.typ_dokladu ?? null,
                          typ_platby: z.typ_platby ?? null,
                        })
                      }
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={t("Upraviť {kod}", { kod: z.kod })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        zmazat(
                          [z.id],
                          t("Zmazať {kod} z číselníka? Doklady, ktoré ho už majú, sa nezmenia.", { kod: z.kod }),
                        )
                      }
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label={t("Zmazať {kod}", { kod: z.kod })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {riadky.length > 1 && (
            <div className="mt-3 text-right">
              <button
                onClick={() =>
                  zmazat(
                    riadky.map((r) => r.id),
                    t(
                      "Zmazať všetkých {n} zobrazených záznamov? Doklady, ktoré ich už majú, sa nezmenia.",
                      { n: riadky.length },
                    ),
                  )
                }
                className="text-xs text-muted-foreground underline hover:text-destructive"
              >
                {t("Zmazať zobrazené ({n})", { n: riadky.length })}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
