import { createFileRoute, Link } from "@tanstack/react-router";
import { KopirovatNastaveniaOkno } from "@/components/faktero/KopirovatNastaveniaOkno";
import { PredponyObjednavky } from "@/components/faktero/PredponyObjednavky";
import {
  ID_NASTAVENI_EXPORTU,
  NastaveniaExportuSekcia,
} from "@/components/faktero/uctovnictvo/NastaveniaExportuSekcia";
import { StavyAStitkyNastavenia } from "@/components/faktero/StavyAStitkyNastavenia";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { navrhPredvolenychVystavenychFn } from "@/lib/faktero/clenenie-vystavenej.functions";
import { toast } from "sonner";
import { BookOpen, Download, Eye, EyeOff, ImageUp, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { bezZdvojenychSystemovych, jeSystemovy } from "@/lib/faktero/predkontacie-systemove";
import { ImportZObrazkaOkno } from "@/components/faktero/ImportZObrazkaOkno";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { KodPohody } from "@/components/faktero/KodPohody";
import { PomerEditor, type PomerHodnota } from "@/components/faktero/PomerEditor";
import { OZNACENIA } from "@/lib/faktero/vypis-oznacenie";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import {
  MAX_TOLERANCIA_CENTOV,
  PREDVOLENE_NESPRACOVANE,
  type NastaveniaNespracovanych,
} from "@/lib/faktero/nespracovane-nastavenia";
import {
  AGENDY,
  PREDVOLENE,
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
  zmazKodyCiselnikaFn,
  nastavAktivneCiselnikaFn,
} from "@/lib/faktero/predkontacie.functions";
import { useHromadnyVyber } from "@/hooks/useHromadnyVyber";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import {
  ListaHromadnychAkcii,
  PouziteNaDeaktivaciu,
  ZaskrtavadloRiadku,
  ZaskrtavadloVsetkych,
} from "@/components/faktero/HromadnyVyber";
import { zoznamKodov } from "@/lib/faktero/hromadny-vyber";
import { NAZOV_KDE, type PouzityKod } from "@/lib/faktero/ciselnik-mazanie";
import { potvrd } from "@/lib/potvrdenie";
import { KV_CLENENIA, KV_PREDVOLENE, nazovKv, type DruhKvPredvoleneho } from "@/lib/faktero/kv-clenenie";
import { triedaStavu } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { EmptyState } from "@/components/faktero/ListControls";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { useT } from "@/lib/i18n/useT";
import { otlacok, predvoleneZFirmy } from "@/lib/faktero/formular-z-firmy";
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
    meta: [
      {
        title: preloz(match.context.jazyk ?? "sk", "Predkontácie a členenie DPH/KV — Faktero"),
      },
    ],
  }),
  // ?pridat=1 otvorí rovno formulár novej predkontácie (odkaz zo zaúčtovania).
  // ?nastavenia=<program> zroluje k Nastaveniam exportu s tým programom (odkaz z Účtovných exportov).
  validateSearch: (s: Record<string, unknown>) => ({
    ...zoznamSearch(s),
    ...(s.pridat ? { pridat: String(s.pridat) } : {}),
    ...(s.nastavenia ? { nastavenia: String(s.nastavenia) } : {}),
  }),
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
  typ_dokladu: TypDokladuPolozky | "vydane" | "prijate" | null;
  typ_platby: TypPlatbyPolozky | null;
};

const ZDROJ: Record<string, string> = {
  pohoda: "Pohoda",
  subor: "súbor",
  rucne: "ručne",
  obrazok: "obrázok",
  system: "systémový",
};
/** Smer pri členení DPH a KV (typ_dokladu vydane/prijate). */
const SMER_DOKLADU: Record<string, string> = { vydane: "vydané doklady", prijate: "prijaté doklady" };
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
  const { pridat: pridatZOdkazu, nastavenia: programZAdresy } = Route.useSearch();
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

  // Odkaz s ?nastavenia=… alebo #nastavenia-exportu zroluje k Nastaveniam exportu,
  // keď je stránka načítaná (sekcia je pod číselníkom).
  const nacitane = zaznamy !== null;
  useEffect(() => {
    if (!nacitane) return;
    if (!programZAdresy && window.location.hash !== `#${ID_NASTAVENI_EXPORTU}`) return;
    const id = window.setTimeout(
      () =>
        document
          .getElementById(ID_NASTAVENI_EXPORTU)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
    return () => window.clearTimeout(id);
  }, [nacitane, programZAdresy]);

  if (!companyId || zaznamy === null)
    return (
      <>
        <PageHeader title={t("Predkontácie a členenie DPH/KV")} />
        <PageBody>
          <div className="rounded-xl border border-border bg-card">
            <NacitavanieStav />
          </div>
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader
        title={t("Predkontácie a členenie DPH/KV")}
        description={t(
          "Číselník predkontácií a členení DPH z Pohody, čo sa predvolene použije pri faktúrach, prijatých faktúrach, bločkoch, pokladni a banke, a nastavenia exportu do účtovného programu.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPridat((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> {t("Pridať predkontáciu")}
            </button>
            <button
              type="button"
              onClick={() => setKopirovat(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary"
            >
              {t("Kopírovať do iných firiem")}
            </button>
          </div>
        }
      />
      {kopirovat && cid ? <KopirovatNastaveniaOkno companyId={cid} onClose={() => setKopirovat(false)} /> : null}
      <PageBody>
        <div className="space-y-4">
          {/* Číselník (pridávanie predkontácií, členení DPH, KV…) navrchu, pod ním predvolené. */}
          <Ciselnik companyId={companyId} zaznamy={zaznamy} onZmena={obnov} pridat={pridat} />
          <Predvolene
            companyId={companyId}
            firma={firma}
            zaznamy={zaznamy}
            onUlozene={obnov}
            onPridat={() => setPridat((n) => n + 1)}
          />
          <NastaveniaExportuSekcia
            companyId={companyId}
            firma={firma}
            predkontacie={zaznamy}
            onUlozene={obnov}
            programZAdresy={programZAdresy}
          />
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
  const nacitajNavrhPredvolenych = useServerFn(navrhPredvolenychVystavenychFn);
  const [h, setH] = useState<Record<string, string>>({});
  /*
    Platiteľ DPH bez predvolených kódov vydaných faktúr: prázdne polia sa
    predvyplnia návrhom (UD, UDpdp z číselníka, predkontácia z ustáleného zvyku
    firmy, dobropis ako faktúra). Uložia sa až tlačidlom Uložiť — dovtedy
    faktúry dostanú to isté automaticky (resolveVatClassification).
  */
  const [navrhVydanych, setNavrhVydanych] = useState<Record<string, string>>({});
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

  /* Formulár sa prepíše len pri zmene jeho vlastných hodnôt vo firme (E-22) —
     uloženie číselníka či Nastavení exportu načíta firmu znova a predtým tu
     zmizli neuložené zmeny. */
  const zFirmy = useMemo(() => predvoleneZFirmy(firma), [firma]);
  const otlacokFirmy = otlacok(zFirmy);
  useEffect(() => {
    setNesp(zFirmy.nesp);
    setH(zFirmy.h);
    setOznaceni(zFirmy.oznaceni);
    setBlockyAgenda(zFirmy.blockyAgenda);
    setPokladna(zFirmy.pokladna);
    setOdkazNaDoklady(zFirmy.odkazNaDoklady);
    setPolozkyBlockov(zFirmy.polozkyBlockov);
    setIne(zFirmy.ine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, otlacokFirmy]);
  useEffect(() => {
    let zive = true;
    nacitajNavrhPredvolenych({ data: { company_id: companyId } })
      .then((n) => {
        if (zive) setNavrhVydanych((n ?? {}) as Record<string, string>);
      })
      .catch(() => {});
    return () => {
      zive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, otlacokFirmy]);
  useEffect(() => {
    if (!Object.keys(navrhVydanych).length) return;
    setH((x) => {
      const y = { ...x };
      for (const [k, v] of Object.entries(navrhVydanych)) if (!String(y[k] ?? "").trim()) y[k] = v;
      return y;
    });
  }, [navrhVydanych, otlacokFirmy]);
  const predvyplneneNavrhom = Object.entries(navrhVydanych).filter(
    ([k, v]) => h[k] === v && !String(firma[k] ?? "").trim(),
  );

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
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {t("Predvolené podľa druhu dokladu")}
        </h2>
        <button
          type="button"
          onClick={onPridat}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-semibold hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> {t("Pridať predkontáciu")}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("Použije sa, keď doklad nemá vlastnú predkontáciu — tú mu dá")}{" "}
        <Link to="/uctovnictvo/zauctovanie" search={{ tab: "pravidla" } as never} className="underline">
          {t("pravidlo automatického účtovania")}
        </Link>{" "}
        {t("alebo človek pri zaúčtovaní. Prázdne pole = Pohoda doklad nechá nezaúčtovaný.")}
      </p>
      {predvyplneneNavrhom.length ? (
        <p className="mt-1 text-xs text-muted-foreground" data-predvyplnene-navrhom="">
          {t(
            "Prázdne kódy vydaných faktúr sú predvyplnené návrhom ({kody}) — uložia sa tlačidlom Uložiť. Kým ich neuložíte, faktúry ich dostanú aj tak automaticky.",
            { kody: predvyplneneNavrhom.map(([, v]) => v).join(", ") },
          )}
        </p>
      ) : null}
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
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">{t("Doklad")}</th>
              <th className="whitespace-nowrap py-2 pr-3 font-semibold">{t("Predkontácia")}</th>
              <th className="whitespace-nowrap py-2 pr-3 font-semibold">{t("Členenie DPH")}</th>
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
                  {p.kluc === "zaloha" && !h[p.predkontacia] ? (
                    <span className="block text-xs text-warning">
                      {t("prázdne = daňový doklad k platbe pôjde bez predkontácie (tržba sa pri zálohe neúčtuje)")}
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
                          : p.kluc === "faktura"
                            ? t("automaticky (A1 podnikateľ, D2 občan)")
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

      <fieldset className="mt-4 rounded-lg border border-border p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold">{t("Bločky do Pohody")}</legend>
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
                "Hotovosť ako výdavkový pokladničný doklad, karta do Ostatných záväzkov, prevod ako prijatá faktúra.",
              )}
            </span>
          </span>
        </label>
        {blockyAgenda === "podla_platby" && (
          <label className="ml-6 mt-2 block">
            <span className="text-xs font-medium text-muted-foreground">{t("Skratka pokladne v Pohode")}</span>
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
              <span className="mt-1 block max-w-prose text-xs text-warning">
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
            {t("Posielať aj položky dokladu")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Inak ide len súhrn po sadzbách DPH. Každá položka bločku ide s textom, množstvom, cenou bez DPH, sadzbou, predkontáciou a členením DPH. Keď položky so sumou dokladu nesedia, doklad ide súhrnom. Prijaté a vystavené faktúry idú s položkami vždy.",
              )}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="mt-4 space-y-3 rounded-lg border border-border p-3 text-sm sm:p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("Export a spracovanie dokladov")}
        </legend>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("Párovací symbol v Pohode")}</span>
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
          <span className="text-xs font-medium text-muted-foreground">{t("Predkontácia pre zaokrúhlenie")}</span>
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
          <span className="text-xs font-medium text-muted-foreground">{t("Povinné pri spracovaní dokladu")}</span>
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
          <span className="text-xs font-medium text-muted-foreground">{t("Tolerancia zaokrúhlenia položiek (v centoch)")}</span>
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

      <fieldset className="mt-4 rounded-lg border border-border p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold">{t("Číselné rady a stredisko v Pohode")}</legend>
        <p className="text-xs text-muted-foreground">
          {t(
            "Predpona radu, do ktorého Pohoda doklad očísluje. Prázdne = predvolený rad v Pohode. Doklad môže mať vlastný rad v zaúčtovaní.",
          )}
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RADY_POHODY.map((r) => (
            <label key={r.stlpec} className="block">
              <span className="text-xs font-medium text-muted-foreground">{t(r.nazov)}</span>
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
            <span className="text-xs font-medium text-muted-foreground">{t("Predvolené stredisko")}</span>
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

      <details className="mt-4 rounded-lg border border-border p-3 sm:p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          {t("Bankové pohyby podľa označenia platby")}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Pri")}{" "}
          <Link to="/uctovnictvo/konvertory" search={{ tab: "vypis" } as never} className="underline">
            {t("bankovom výpise")}
          </Link>{" "}
          {t(
            "dostane pohyb s týmto označením vlastnú predkontáciu. Prázdne = predkontácia bankového dokladu.",
          )}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {OZNACENIA.map((o) => (
            <label key={o.kod} className="block">
              <span className="text-xs font-medium text-muted-foreground">{t(o.nazov)}</span>
              <KodPohody
                ariaLabel={`${t("Predkontácia")} — ${t(o.nazov)}`}
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
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
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
  /** Druh pre riadky tabuľky bez stĺpca „Druh“ (E-31) — XML z Pohody ho nesie sám. */
  const [druhSuboru, setDruhSuboru] = useState<DruhCiselnika>("predkontacia");
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
        data: { company_id: companyId, nazov: f.name, base64: btoa(bin), druh: druhSuboru },
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
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">
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
        <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
          <div className="text-sm font-semibold">{t("1. Konektorom")}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Keď beží")}{" "}
            <Link to="/uctovnictvo/pohoda" className="underline">
              {t("konektor Pohody")}
            </Link>
            {t(", pri ďalšom behu si číselníky vypýta sám.")}
          </p>
          {caka ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={triedaStavu("pozor", true)}>
                {t("Čaká na konektor")}
              </span>
              <button
                onClick={() => konektor(false)}
                disabled={!!busy}
                className="text-xs font-semibold text-primary underline disabled:opacity-50"
              >
                {t("Zrušiť")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => konektor(true)}
              disabled={!!busy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
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

        <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
          <div className="text-sm font-semibold">{t("2. XML súborom")}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Žiadosť načítajte v Pohode cez Súbor → Dátová komunikácia → XML import a odpoveď, ktorú Pohoda uloží, nahrajte sem.",
            )}
          </p>
          <button
            onClick={stiahniZiadost}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
          >
            <Download className="h-4 w-4" /> {t("Stiahnuť žiadosť")}
          </button>
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
          <div className="text-sm font-semibold">{t("3. Nahrať súbor")}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Odpoveď Pohody (XML), alebo tabuľka CSV či Excel so stĺpcami Kód, Popis, prípadne Agenda, MD, D.",
            )}
          </p>
          <label className="mt-2 block text-xs text-muted-foreground">
            {t("Tabuľka bez stĺpca Druh sa načíta ako")}
            <select
              value={druhSuboru}
              onChange={(e) => setDruhSuboru(e.target.value as DruhCiselnika)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            >
              {DRUHY_CISELNIKA.filter((d) => d.kod !== "kv_clenenie").map((d) => (
                <option key={d.kod} value={d.kod}>
                  {t(d.nazov)}
                </option>
              ))}
            </select>
          </label>
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
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
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
  typ_dokladu: null as TypDokladuPolozky | "vydane" | "prijate" | null,
  typ_platby: null as TypPlatbyPolozky | null,
};

function Ciselnik({
  companyId,
  zaznamy: zaznamyVsetky,
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
  // Systémový kód, ktorý firma má aj z Pohody či ručne, sa ukáže len raz (vlastný riadok).
  const zaznamy = useMemo(() => bezZdvojenychSystemovych(zaznamyVsetky), [zaznamyVsetky]);
  const uloz = useServerFn(ulozPredkontaciuFn);
  const sekcia = useRef<HTMLElement>(null);
  const zmaz = useServerFn(zmazKodyCiselnikaFn);
  const nastavAktivne = useServerFn(nastavAktivneCiselnikaFn);
  const [druh, setDruh] = useState<DruhCiselnika>("predkontacia");
  const [hladaj, setHladaj] = useState("");
  const [agenda, setAgenda] = useState("");
  const [vsetky, setVsetky] = useState(false);
  const [form, setForm] = useState<typeof PRAZDNY | null>(null);
  const [busy, setBusy] = useState(false);
  const [zObrazka, setZObrazka] = useState(false);

  const formular = useRef<HTMLDivElement>(null);
  const upravujemSystemovy = Boolean(form?.id && zaznamy.some((z) => z.id === form.id && jeSystemovy(z)));
  const formZRiadku = (z: (typeof zaznamy)[number]): typeof PRAZDNY => ({
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
  });
  /** Klik na riadok: otvorí formulár nad tabuľkou, posunie k nemu a zameria prvé pole. */
  const upravRiadok = (z: (typeof zaznamy)[number]) => {
    setForm(formZRiadku(z));
    requestAnimationFrame(() => {
      sekcia.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formular.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  };

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
  const vyber = useHromadnyVyber(riadky.map((r) => r.id));
  // Číselník z Pohody má aj stovky kódov — po 10/20/50/100 na stranu; výber a hromadné akcie ostávajú na všetkých riadkoch.
  const lf = useListFilters({ pageSizeKey: "uctovnictvo-predkontacie" });
  const strankovanie = useStrankovanie(riadky, lf, { reset: [druh, hladaj, agenda, vsetky] });
  const oznacene = riadky.filter((r) => vyber.jeOznaceny(r.id));
  const [hromadne, setHromadne] = useState<"zmazat" | "aktivovat" | "deaktivovat" | null>(null);
  /** Kódy, ktoré sa pri poslednom mazaní nedali zmazať (použité) — ponuka deaktivácie. */
  const [pouzite, setPouzite] = useState<PouzityKod[]>([]);
  const [deaktivujem, setDeaktivujem] = useState(false);

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
      await nastavAktivne({ data: { company_id: companyId, ids: [z.id], aktivne: !z.aktivne } });
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    }
  }

  const dalsich = (n: number) => t("+ {n} ďalších", { n });

  /**
   * Zmaže záznamy jedným požiadavkom. Použité v dokladoch (pravidlách,
   * nastaveniach) server nezmaže a vráti ich — tie ponúkneme deaktivovať.
   */
  async function zmazat(vybrane: Zaznam[]) {
    if (!vybrane.length) return;
    const otazka =
      vybrane.length === 1
        ? t("Zmazať {kod} z číselníka?", { kod: vybrane[0].kod })
        : t("Zmazať označené záznamy z číselníka ({n})?", { n: vybrane.length }) +
          "\n" +
          zoznamKodov(
            vybrane.map((r) => r.kod),
            dalsich,
          );
    const dovetok = t("Doklady, ktoré kód už majú, sa nezmenia. Použité kódy sa nezmažú — ponúkneme ich deaktiváciu.");
    if (!(await potvrd(`${otazka}\n${dovetok}`, { potvrdit: t("Zmazať"), nebezpecne: true }))) return;
    setHromadne("zmazat");
    setPouzite([]);
    try {
      const r = await zmaz({ data: { company_id: companyId, druh, ids: vybrane.map((x) => x.id) } });
      setPouzite(r.pouzite);
      vyber.zrus();
      if (r.zmazane.length) toast.success(t("Zmazané: {n}", { n: r.zmazane.length }));
      if (r.pouzite.length)
        toast.warning(t("Nezmazané, lebo sú použité: {n}", { n: r.pouzite.length }));
      if (r.nezmazane.length)
        toast.error(t("Niektoré záznamy sa nezmazali — chýba vám právo alebo už neexistujú ({n}).", { n: r.nezmazane.length }));
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa zmazať"));
    } finally {
      setHromadne(null);
    }
  }

  async function aktivovat(ids: string[], aktivne: boolean) {
    if (!ids.length) return;
    try {
      const r = await nastavAktivne({ data: { company_id: companyId, ids, aktivne } });
      toast.success(aktivne ? t("Aktivované: {n}", { n: r.zmenene }) : t("Deaktivované: {n}", { n: r.zmenene }));
      onZmena();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
      return false;
    }
  }

  async function hromadneAktivne(aktivne: boolean) {
    setHromadne(aktivne ? "aktivovat" : "deaktivovat");
    try {
      if (await aktivovat(oznacene.filter((r) => r.aktivne !== aktivne).map((r) => r.id), aktivne)) vyber.zrus();
    } finally {
      setHromadne(null);
    }
  }

  async function deaktivovatPouzite() {
    setDeaktivujem(true);
    try {
      if (await aktivovat(pouzite.map((p) => p.id), false)) setPouzite([]);
    } finally {
      setDeaktivujem(false);
    }
  }

  return (
    <section ref={sekcia} className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-sm"
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
                setPouzite([]);
              }}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1 ${druh === k ? "bg-card font-semibold text-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(n)} <span className="text-xs tabular-nums text-muted-foreground">({pocty[k]})</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setZObrazka(true)}
            data-import-z-obrazka-tlacidlo=""
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
          >
            <ImageUp className="h-4 w-4" /> {t("Importovať z obrázka")}
          </button>
          <button
            onClick={() => setForm({ ...PRAZDNY })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> {t("Pridať {co}", { co: t(jednotne) })}
          </button>
        </div>
      </div>
      {druh === "pokladna" && (
        // Toto je len číselník skratiek pokladní z Pohody; pokladne firmy sú inde.
        <p className="mt-3 text-xs text-muted-foreground">
          {t("Pokladne firmy spravujete na stránke")}{" "}
          <Link to="/uctovnictvo/pokladne" className="text-primary underline">
            {t("Pokladne")}
          </Link>
          .
        </p>
      )}
      {zObrazka && (
        <ImportZObrazkaOkno
          companyId={companyId}
          existujuce={zaznamyVsetky.map((z) => ({ ...z, agenda: z.agenda ?? "" }))}
          // Z predvolenej záložky Predkontácie sa druh rozpozná sám (obrázok býva členenie KV).
          predvolenyDruh={druh === "predkontacia" ? undefined : druh}
          onClose={() => setZObrazka(false)}
          onUlozene={(d) => {
            setDruh(d);
            setAgenda("");
            setForm(null);
            onZmena();
          }}
        />
      )}

      {form && (
        <div ref={formular} className="mt-4 grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-6 sm:p-4">
          <label className="block sm:col-span-1">
            <span className="text-xs font-medium text-muted-foreground">{t("Kód")}</span>
            <input
              value={form.kod}
              onChange={(e) => setForm({ ...form, kod: e.target.value })}
              // Systémový kód je spoločný pre všetky firmy — meniť sa dá popis, nie skratka.
              readOnly={upravujemSystemovy}
              title={upravujemSystemovy ? t("Systémový kód sa nedá premenovať — pridajte vlastný.") : undefined}
              className={`${vstup} ${upravujemSystemovy ? "bg-muted text-muted-foreground" : ""}`}
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
            <span className="text-xs font-medium text-muted-foreground">{t("Popis")}</span>
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
                <span className="text-xs font-medium text-muted-foreground">MD</span>
                <input
                  value={form.ucet_md}
                  onChange={(e) => setForm({ ...form, ucet_md: e.target.value })}
                  className={vstup}
                  placeholder="501"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">D</span>
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
                <span className="text-xs font-medium text-muted-foreground">{t("Typ dokladu")}</span>
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
                <span className="text-xs font-medium text-muted-foreground">{t("Typ platby")}</span>
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
            <span className="text-xs font-medium text-muted-foreground">{t("Použiť sám pre kategóriu nákladu")}</span>
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
              className="rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
            >
              {t("Zrušiť")}
            </button>
            <button
              onClick={ulozit}
              disabled={busy || !form.kod.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
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
          className="min-w-[12rem] flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
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
      {(druh === "clenenie_dph" || druh === "kv_clenenie") && zaznamy.some((z) => z.druh === druh && jeSystemovy(z)) && (
        <p className="mt-2 text-xs text-muted-foreground" data-systemovy-ciselnik="">
          {t(
            "Štandardné kódy slovenskej Pohody (zdroj „systémový“) má každá firma automaticky. Nedajú sa zmazať, len skryť; vlastné analytické skratky pridáte tlačidlom „Pridať“.",
          )}
        </p>
      )}

      <PouziteNaDeaktivaciu
        polozky={pouzite.map((p) => ({ kod: p.kod, kde: p.kde.map((k) => t(NAZOV_KDE[k])).join(", ") }))}
        nadpis={
          druh === "predkontacia"
            ? t("Tieto predkontácie sú použité v dokladoch, môžete ich iba deaktivovať:")
            : undefined
        }
        onDeaktivovat={deaktivovatPouzite}
        onZavriet={() => setPouzite([])}
        busy={deaktivujem}
      />
      <ListaHromadnychAkcii
        pocet={vyber.pocet}
        busy={hromadne}
        onZmazat={() => zmazat(oznacene)}
        onDeaktivovat={oznacene.some((r) => r.aktivne) ? () => hromadneAktivne(false) : null}
        onAktivovat={oznacene.some((r) => !r.aktivne) ? () => hromadneAktivne(true) : null}
        onZrusit={vyber.zrus}
      />

      {riadky.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            icon={pocty[druh] === 0 ? BookOpen : Search}
            title={
              pocty[druh] === 0
                ? "Číselník je prázdny. Načítajte ho z Pohody nižšie alebo pridajte kód ručne."
                : "Nič nevyhovuje filtru."
            }
          />
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground [&>th:first-child]:pl-3">
                <th className="w-8 py-2 pr-2">
                  <ZaskrtavadloVsetkych vyber={vyber} />
                </th>
                <th className="py-2 pr-3 font-semibold">{t("Kód")}</th>
                <th className="whitespace-nowrap py-2 pr-3 font-semibold">{t("Popis")}</th>
                <th className="whitespace-nowrap py-2 pr-3 font-semibold">
                  {druh === "predkontacia" ? t("Agenda") : t("Typ")}
                </th>
                {druh === "predkontacia" && <th className="whitespace-nowrap py-2 pr-3 font-semibold">MD / D</th>}
                <th className="whitespace-nowrap py-2 pr-3 font-semibold">{t("Použitie")}</th>
                <th className="whitespace-nowrap py-2 pr-3 font-semibold">{t("Zdroj")}</th>
                <th className="whitespace-nowrap py-2 pr-3 font-semibold">{t("Aktívne")}</th>
                <th className="py-2 pr-3"><span className="sr-only">{t("Akcie")}</span></th>
              </tr>
            </thead>
            <tbody>
              {strankovanie.viditelne.map((z) => (
                <KlikatelnyRiadok
                  key={z.id}
                  naKlik={() => upravRiadok(z)}
                  className={`border-t border-border first:border-t-0 [&>td:first-child]:pl-3 ${z.aktivne ? "" : "opacity-50"}`}
                >
                  <td className="w-8 py-1.5 pr-2">
                    <ZaskrtavadloRiadku vyber={vyber} id={z.id} popis={z.kod} />
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono font-semibold">{z.kod}</td>
                  <td className="py-1.5 pr-3">
                    {z.popis ?? "—"}
                    {z.pomer ? (
                      <span className={`ml-2 ${triedaStavu("informacia", true)}`}>
                        {z.pomer.typ === "dph5050"
                          ? t("pomer {z} %, DPH 50 %", { z: z.pomer.zaklad })
                          : t("pomer {p}", { p: z.pomer.casti.map((c) => `${c.podiel}`).join("/") })}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {druh === "predkontacia"
                      ? t(nazovAgendy(z.agenda))
                      : druh === "kv_clenenie"
                        ? z.kategoria || "—"
                        : z.agenda || "—"}
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
                            t(
                              TYPY_DOKLADU_POLOZKY.find((x) => x.kod === z.typ_dokladu)?.nazov ??
                                SMER_DOKLADU[z.typ_dokladu] ??
                                z.typ_dokladu,
                            ),
                          z.typ_platby &&
                            t(TYPY_PLATBY_POLOZKY.find((x) => x.kod === z.typ_platby)?.nazov ?? z.typ_platby),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    {z.kategoria && druh !== "kv_clenenie" ? (
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
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">
                    <button
                      onClick={() => setForm(formZRiadku(z))}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={t("Upraviť {kod}", { kod: z.kod })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {jeSystemovy(z) ? (
                      // Systémový kód sa nemaže — skryje sa odškrtnutím „Aktívne“.
                      <button
                        onClick={() => prepniAktivne(z)}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={z.aktivne ? t("Skryť {kod}", { kod: z.kod }) : t("Zobraziť {kod}", { kod: z.kod })}
                        title={t("Systémový kód sa nedá zmazať, len skryť")}
                      >
                        {z.aktivne ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    ) : (
                      <button
                        onClick={() => zmazat([z])}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        aria-label={t("Zmazať {kod}", { kod: z.kod })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </KlikatelnyRiadok>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {strankovanie.stranky()}
    </section>
  );
}
