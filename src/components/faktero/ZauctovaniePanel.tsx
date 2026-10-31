import { Link, useNavigate } from "@tanstack/react-router";
import { AutoZauctovanieOdznak, ponukaPravidlaToast } from "./AutoZauctovanieOdznak";
import { VyberPravidla } from "./VyberPravidla";
import { uplatniPredlohu } from "@/lib/faktero/predlohy-uctovania";
import { typPrijatej } from "@/lib/faktero/pravidla-uctovania";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pole, Rozsirene, TLACIDLO_DRUHE, TLACIDLO_HLAVNE, ramik } from "./KompaktnyDetail";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BookCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Lock,
  MoveRight,
  Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KomentarDokladu } from "./StavDokladu";
import {
  exportPrijatychPohodaFn,
  presunPrijatuDoDokladovFn,
  vratZPohodyFn,
} from "@/lib/faktero/vratenie.functions";
import { toastNeodovzdane } from "./NeodovzdaneDoklady";
import {
  navrhyKodovFn,
  zauctujPrijateFn,
  zrusZauctovanieFn,
} from "@/lib/faktero/zauctovanie.functions";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import {
  zoradPodlaDokladu,
  type MoznostKodu,
  type TypDokladuPolozky,
} from "@/lib/faktero/predkontacie";
import { KV_PRIJATE, kvAutomaticky, kvSPredvolenym } from "@/lib/faktero/kv-clenenie";
import { KodPohody } from "./KodPohody";
import {
  HistoriaOdovzdania,
  OpravitZauctovanie,
  useProgramOdovzdania,
  useVarovanieVratenia,
} from "./OdovzdanieDokladu";
import { RozuctovaniePanel } from "./RozuctovaniePanel";
import { NapovedaPredkontacii, SekciaZauctovania } from "./DetailDokladu";
import { rozpisPrijatej } from "@/lib/faktero/prijate-do-pohody";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { NastavitPredvolene } from "./NastavitPredvolene";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import {
  NavrhAiInfo,
  NavrhBezCiselnika,
  StitokNavrhu,
  useNavrhZauctovania,
  type OznaceniaNavrhu,
} from "./NavrhAi";
import type { PoleNavrhu } from "@/lib/faktero/ai-predkontacia";
import { chybaClenenie, ucinneClenenie } from "@/lib/faktero/clenenie-zauctovania";
import { jeCudzia } from "@/lib/faktero/cudzia-faktura";
import { useRezimDph } from "@/lib/faktero/krajina-firmy";

export type Navrhy = {
  predkontacie: MoznostKodu[];
  clenenia: MoznostKodu[];
  predvolenaPredkontacia: string | null;
  predvoleneClenenie: string | null;
  /** Predvolené členenie KV DPH firmy pre bežný doklad. */
  predvoleneKv?: string | null;
  maCiselnik?: boolean;
  podlaKategorie?: Record<string, { predkontacia?: string; clenenie?: string }>;
  strediska?: MoznostKodu[];
  cinnosti?: MoznostKodu[];
  pokladne?: MoznostKodu[];
  rady?: MoznostKodu[];
  predvoleneStredisko?: string | null;
  predvolenyRad?: string | null;
  /** Kódy predkontácií, ktoré sa účtujú pomerom. */
  pomerove?: string[];
};

type Hodnoty = {
  predkontacia: string;
  clenenie: string;
  kategoria: string;
  kv?: string;
  /** Rozšírené polia Pohody — zobrazia sa, keď sú v hodnotách. */
  stredisko?: string;
  cinnost?: string;
  rad?: string;
  intPoznamka?: string;
};

/**
 * Hodnoty pre PoliaZauctovania. Kategória nákladu je len pri nákladových
 * dokladoch — vystavená faktúra ju nemá (pole sa vtedy nekreslí).
 */
type HodnotyPoli = Omit<Hodnoty, "kategoria"> & { kategoria?: string };

/**
 * Spoločné polia zaúčtovania — na detaile aj v hromadnom okne. Rovnaké poradie
 * a vzhľad pri nespracovanom doklade, prijatej aj vystavenej faktúre.
 */
export function PoliaZauctovania<H extends HodnotyPoli>({
  navrhy,
  hodnoty,
  setHodnoty,
  hromadne,
  kvAuto,
  oznacenia,
  siroke = true,
  doklad,
  kvMoznosti = KV_PRIJATE,
  popisPredkontacie = "Predkontácia (Pohoda)",
  priklady,
}: {
  navrhy: Navrhy | null;
  hodnoty: H;
  setHodnoty: (h: H) => void;
  /** Ktorá sadzba členenia KV sa dá automaticky — ukáže sa v ponuke. */
  kvAuto?: string;
  hromadne?: boolean;
  /** Polia predvyplnené návrhom (AI alebo naučené) — ukáže sa pri nich štítok. */
  oznacenia?: OznaceniaNavrhu;
  /**
   * Rozloženie ako v Doklado: väčšie polia pod sebou, členenie DPH a KV DPH
   * vedľa seba, keď je miesto (inak tiež pod sebou).
   */
  siroke?: boolean;
  /** Typ dokladu a platby — účtovné položky pre ne sa ponúknu prvé. */
  doklad?: { typ?: TypDokladuPolozky | null; platba?: string | null };
  /** Ponuka členení KV DPH — pri vystavenej faktúre A1, A2, C1, D1, D2. */
  kvMoznosti?: readonly { kod: string; nazov: string }[];
  /** Popis poľa predkontácie (kľúč pre t()) — napr. účet DATEV pri nemeckej firme. */
  popisPredkontacie?: string;
  /** Príklady kódov v prázdnom poli, keď firma nemá predvolené. */
  priklady?: { predkontacia?: string; clenenie?: string };
}) {
  const { t } = useT();
  const predkontacie = doklad
    ? zoradPodlaDokladu(navrhy?.predkontacie ?? [], doklad)
    : (navrhy?.predkontacie ?? []);
  const stitok = (pole: PoleNavrhu) =>
    oznacenia?.[pole] ? <StitokNavrhu zdroj={oznacenia[pole]!} /> : null;
  const vstup = siroke
    ? "mt-1 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
    : "mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";
  const popis = siroke ? "text-sm font-medium text-foreground" : "text-xs text-muted-foreground";
  const zKategorie = hodnoty.kategoria ? navrhy?.podlaKategorie?.[hodnoty.kategoria] : undefined;
  const prikladPredkontacie = priklady?.predkontacia ?? t("napr. 1Fp");
  const prikladClenenia = priklady?.clenenie ?? t("napr. PD");
  if (siroke) {
    return (
      <div className="max-w-2xl space-y-3 [&_label]:min-w-0">
        <label className="block">
          <span className={popis}>
            {t(popisPredkontacie)}
            {stitok("predkontacia")}
          </span>
          <KodPohody
            ariaLabel="Predkontácia"
            odkazNaCiselnik
            value={hodnoty.predkontacia}
            placeholder={
              hromadne
                ? t("nemeniť")
                : (zKategorie?.predkontacia ??
                  navrhy?.predvolenaPredkontacia ??
                  prikladPredkontacie)
            }
            onChange={(v) => setHodnoty({ ...hodnoty, predkontacia: v })}
            moznosti={predkontacie}
            className={vstup}
            vyber
          />
        </label>
        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className={popis}>
              {t("Členenie DPH (plnenie)")}
              {stitok("clenenie")}
            </span>
            <KodPohody
              ariaLabel="Členenie DPH"
              value={hodnoty.clenenie}
              placeholder={
                hromadne
                  ? t("nemeniť")
                  : (zKategorie?.clenenie ?? navrhy?.predvoleneClenenie ?? prikladClenenia)
              }
              onChange={(v) => setHodnoty({ ...hodnoty, clenenie: v })}
              moznosti={navrhy?.clenenia ?? []}
              vyber
              className={vstup}
            />
          </label>
          {hodnoty.kv !== undefined && (
            <label className="block">
              <span className={popis}>
                {t("Členenie KV DPH")}
                {stitok("kv")}
              </span>
              <select
                value={hodnoty.kv}
                onChange={(e) => setHodnoty({ ...hodnoty, kv: e.target.value })}
                className={vstup}
              >
                <option value="">
                  {hromadne ? t("nemeniť") : `${t("automaticky")}${kvAuto ? ` (${kvAuto})` : ""}`}
                </option>
                {hromadne && <option value="auto">{t("automaticky")}</option>}
                {kvMoznosti.map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {t(k.nazov)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          {hodnoty.kategoria !== undefined && (
            <label className="block">
              <span className={popis}>
                {t("Kategória nákladu")}
                {stitok("kategoria")}
              </span>
              <select
                value={hodnoty.kategoria}
                onChange={(e) => setHodnoty({ ...hodnoty, kategoria: e.target.value })}
                className={vstup}
              >
                <option value="">{hromadne ? t("nemeniť") : "—"}</option>
                {KATEGORIE_VYDAVKOV.map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {t(k.nazov)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hodnoty.stredisko !== undefined && (
            <label className="block">
              <span className={popis}>{t("Stredisko")}</span>
              <KodPohody
                ariaLabel="Stredisko"
                value={hodnoty.stredisko}
                onChange={(v) => setHodnoty({ ...hodnoty, stredisko: v })}
                moznosti={navrhy?.strediska ?? []}
                placeholder={hromadne ? t("nemeniť") : (navrhy?.predvoleneStredisko ?? "—")}
                className={vstup}
                vyber
              />
            </label>
          )}
          {hodnoty.cinnost !== undefined && (
            <label className="block">
              <span className={popis}>{t("Činnosť")}</span>
              <KodPohody
                ariaLabel="Činnosť"
                value={hodnoty.cinnost}
                onChange={(v) => setHodnoty({ ...hodnoty, cinnost: v })}
                moznosti={navrhy?.cinnosti ?? []}
                placeholder={hromadne ? t("nemeniť") : "—"}
                className={vstup}
                vyber
              />
            </label>
          )}
          {hodnoty.rad !== undefined && (
            <label className="block">
              <span className={popis}>{t("Číselný rad v Pohode")}</span>
              <KodPohody
                ariaLabel="Číselný rad v Pohode"
                value={hodnoty.rad}
                onChange={(v) => setHodnoty({ ...hodnoty, rad: v })}
                moznosti={navrhy?.rady ?? []}
                placeholder={
                  hromadne ? t("nemeniť") : (navrhy?.predvolenyRad ?? t("predvolený v Pohode"))
                }
                className={vstup}
                vyber
              />
            </label>
          )}
        </div>
        {hodnoty.intPoznamka !== undefined && (
          <label className="block sm:col-span-full">
            <span className={popis}>{t("Interná poznámka pre účtovníka (do Pohody)")}</span>
            <input
              value={hodnoty.intPoznamka}
              onChange={(e) => setHodnoty({ ...hodnoty, intPoznamka: e.target.value })}
              maxLength={240}
              className={vstup}
            />
          </label>
        )}
      </div>
    );
  }
  return (
    <div
      className={`grid grid-cols-1 gap-3 [&>*]:min-w-0 ${hodnoty.kv !== undefined ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
    >
      <label className="block">
        <span className={popis}>
          {t(popisPredkontacie)}
          {stitok("predkontacia")}
        </span>
        <KodPohody
          ariaLabel="Predkontácia"
          odkazNaCiselnik
          value={hodnoty.predkontacia}
          placeholder={
            hromadne
              ? t("nemeniť")
              : (zKategorie?.predkontacia ?? navrhy?.predvolenaPredkontacia ?? prikladPredkontacie)
          }
          onChange={(v) => setHodnoty({ ...hodnoty, predkontacia: v })}
          moznosti={predkontacie}
          className={vstup}
          vyber
        />
      </label>
      <label className="block">
        <span className={popis}>
          {t("Členenie DPH (plnenie)")}
          {stitok("clenenie")}
        </span>
        <KodPohody
          ariaLabel="Členenie DPH"
          value={hodnoty.clenenie}
          placeholder={
            hromadne
              ? t("nemeniť")
              : (zKategorie?.clenenie ?? navrhy?.predvoleneClenenie ?? prikladClenenia)
          }
          onChange={(v) => setHodnoty({ ...hodnoty, clenenie: v })}
          moznosti={navrhy?.clenenia ?? []}
          vyber
          className={vstup}
        />
      </label>
      {hodnoty.kategoria !== undefined && (
        <label className="block">
          <span className={popis}>
            {t("Kategória nákladu")}
            {stitok("kategoria")}
          </span>
          <select
            value={hodnoty.kategoria}
            onChange={(e) => setHodnoty({ ...hodnoty, kategoria: e.target.value })}
            className={vstup}
          >
            <option value="">{hromadne ? t("nemeniť") : "—"}</option>
            {KATEGORIE_VYDAVKOV.map((k) => (
              <option key={k.kod} value={k.kod}>
                {t(k.nazov)}
              </option>
            ))}
          </select>
        </label>
      )}
      {hodnoty.kv !== undefined && (
        <label className="block">
          <span className={popis}>
            {t("Členenie KV DPH")}
            {stitok("kv")}
          </span>
          <select
            value={hodnoty.kv}
            onChange={(e) => setHodnoty({ ...hodnoty, kv: e.target.value })}
            className={vstup}
          >
            <option value="">
              {hromadne ? t("nemeniť") : `${t("automaticky")}${kvAuto ? ` (${kvAuto})` : ""}`}
            </option>
            {hromadne && <option value="auto">{t("automaticky")}</option>}
            {kvMoznosti.map((k) => (
              <option key={k.kod} value={k.kod}>
                {t(k.nazov)}
              </option>
            ))}
          </select>
        </label>
      )}
      {hodnoty.stredisko !== undefined && (
        <label className="block">
          <span className={popis}>{t("Stredisko")}</span>
          <KodPohody
            ariaLabel="Stredisko"
            value={hodnoty.stredisko}
            onChange={(v) => setHodnoty({ ...hodnoty, stredisko: v })}
            moznosti={navrhy?.strediska ?? []}
            placeholder={hromadne ? t("nemeniť") : (navrhy?.predvoleneStredisko ?? "—")}
            className={vstup}
            vyber
          />
        </label>
      )}
      {hodnoty.cinnost !== undefined && (
        <label className="block">
          <span className={popis}>{t("Činnosť")}</span>
          <KodPohody
            ariaLabel="Činnosť"
            value={hodnoty.cinnost}
            onChange={(v) => setHodnoty({ ...hodnoty, cinnost: v })}
            moznosti={navrhy?.cinnosti ?? []}
            placeholder={hromadne ? t("nemeniť") : "—"}
            className={vstup}
            vyber
          />
        </label>
      )}
      {hodnoty.rad !== undefined && (
        <label className="block">
          <span className={popis}>{t("Číselný rad v Pohode")}</span>
          <KodPohody
            ariaLabel="Číselný rad v Pohode"
            value={hodnoty.rad}
            onChange={(v) => setHodnoty({ ...hodnoty, rad: v })}
            moznosti={navrhy?.rady ?? []}
            placeholder={
              hromadne ? t("nemeniť") : (navrhy?.predvolenyRad ?? t("predvolený v Pohode"))
            }
            className={vstup}
            vyber
          />
        </label>
      )}
      {hodnoty.intPoznamka !== undefined && (
        <label className="block sm:col-span-full">
          <span className={popis}>{t("Interná poznámka pre účtovníka (do Pohody)")}</span>
          <input
            value={hodnoty.intPoznamka}
            onChange={(e) => setHodnoty({ ...hodnoty, intPoznamka: e.target.value })}
            maxLength={240}
            className={vstup}
          />
        </label>
      )}
    </div>
  );
}

const kedy = (iso: string | null, loc = "sk-SK") =>
  iso ? new Date(iso).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" }) : "";

/**
 * Zaúčtovanie prijatej faktúry — ako v Doklado: predkontácia, členenie DPH
 * a kategória; zaúčtovaná faktúra ide do Pohody.
 */
export function ZauctovaniePanel({
  row,
  onZmena,
  kompaktne,
  pravidloZDokladu,
  vPaneli,
}: {
  row: any;
  onZmena: () => void;
  /**
   * Kompaktné rozloženie detailu: účtovná poznámka, komentár a mriežka
   * výberov priamo v detaile, každá zmena sa hneď uloží (bez zaúčtovania).
   */
  kompaktne?: boolean;
  /** „Vytvoriť pravidlo z tohto dokladu“ — v riadku akcií pod mriežkou. */
  pravidloZDokladu?: ReactNode;
  /**
   * Kompaktný panel detailu (ako nespracovaný doklad): polia pod sebou bez
   * vlastnej karty, tlačidlá sa presunú do pätičky panelu (`pata`) a účtovná
   * poznámka do sekcie Poznámka (`poznamka`). Platí len s `kompaktne`.
   */
  vPaneli?: { pata: HTMLElement | null; poznamka: HTMLElement | null };
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const zauctuj = useServerFn(zauctujPrijateFn);
  const zrus = useServerFn(zrusZauctovanieFn);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [h, setH] = useState<Hodnoty>({
    predkontacia: row.pohoda_predkontacia ?? "",
    clenenie: row.pohoda_clenenie_dph ?? "",
    kategoria: row.category ?? "",
    kv: row.kv_clenenie ?? "",
    stredisko: row.stredisko ?? "",
    cinnost: row.cinnost ?? "",
    rad: row.pohoda_rad ?? "",
    intPoznamka: row.int_poznamka ?? "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nacitajNavrhy({ data: { company_id: row.company_id } })
      .then(setNavrhy)
      .catch(() => {});
  }, [row.company_id, nacitajNavrhy]);
  useEffect(() => {
    setH({
      predkontacia: row.pohoda_predkontacia ?? "",
      clenenie: row.pohoda_clenenie_dph ?? "",
      kategoria: row.category ?? "",
      kv: row.kv_clenenie ?? "",
      stredisko: row.stredisko ?? "",
      cinnost: row.cinnost ?? "",
      rad: row.pohoda_rad ?? "",
      intPoznamka: row.int_poznamka ?? "",
    });
  }, [
    row.pohoda_predkontacia,
    row.pohoda_clenenie_dph,
    row.category,
    row.kv_clenenie,
    row.stredisko,
    row.cinnost,
    row.pohoda_rad,
    row.int_poznamka,
  ]);

  const odovzdana = Boolean(row.exported_at);
  // Iný program než Pohoda (Money, Omega…) — null = Pohoda.
  const program = useProgramOdovzdania(row.export_job_id, odovzdana);
  const zauctovana = Boolean(row.zauctovane_at);

  /*
    Návrh pre doklad bez predkontácie či členenia (pravidlo > návyk > AI).
    Predvyplní sa len do prázdnych polí a len do stavu formulára — uloží
    ho až človek tlačidlom; doklad sa podľa AI nikdy nezaúčtuje sám.
  */
  const navrh = useNavrhZauctovania(
    "prijata",
    row.id,
    !odovzdana && !zauctovana && (!row.pohoda_predkontacia || !row.pohoda_clenenie_dph),
  );
  const [predvyplnene, setPredvyplnene] = useState<
    Partial<Record<PoleNavrhu, { hodnota: string; zdroj: "ai" | "navyk" }>>
  >({});
  useEffect(() => {
    if (!navrh) {
      // Doklad je zaúčtovaný či vyplnený — štítky návrhu už nepatria k ničomu.
      setPredvyplnene({});
      return;
    }
    if (navrh.stav !== "navrh") return;
    const nove: Partial<Record<PoleNavrhu, { hodnota: string; zdroj: "ai" | "navyk" }>> = {};
    let h2 = h;
    for (const [pole, n] of Object.entries(navrh.polia) as [PoleNavrhu, any][]) {
      if (!n || (n.zdroj !== "ai" && n.zdroj !== "navyk")) continue;
      if (String((h2 as any)[pole] ?? "").trim()) continue;
      h2 = { ...h2, [pole]: n.hodnota };
      nove[pole] = { hodnota: n.hodnota, zdroj: n.zdroj };
    }
    if (!Object.keys(nove).length) return;
    setH(h2);
    setPredvyplnene(nove);
    // Len pri príchode návrhu — ďalšie úpravy formulára sú už človeka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navrh]);
  const oznacenia: OznaceniaNavrhu = {};
  for (const [pole, n] of Object.entries(predvyplnene) as [
    PoleNavrhu,
    { hodnota: string; zdroj: "ai" | "navyk" },
  ][])
    if (n && (h as any)[pole] === n.hodnota) oznacenia[pole] = n.zdroj;
  const aktivneAi = Object.values(oznacenia).includes("ai");
  function zahodNavrh() {
    let h2 = h;
    for (const [pole, z] of Object.entries(oznacenia) as [PoleNavrhu, string][])
      if (z === "ai") h2 = { ...h2, [pole]: "" };
    setH(h2);
    setPredvyplnene({});
  }
  // Platiteľ DPH bez členenia nezaúčtuje — to isté pravidlo ako hromadné zaúčtovanie.
  const rezimDph = useRezimDph();
  const bezClenenia =
    navrhy != null &&
    chybaClenenie(
      rezimDph.platitel,
      ucinneClenenie({
        zvolene: h.clenenie,
        kategoria: navrhy.podlaKategorie?.[h.kategoria]?.clenenie,
        predvolene: navrhy.predvoleneClenenie,
        rozuctovanie: Array.isArray(row.rozuctovanie) ? row.rozuctovanie : null,
      }),
    );
  const upozornenieClenenia = bezClenenia ? (
    <p
      role="alert"
      className="mt-2 w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
    >
      {t(
        "Chýba členenie DPH. Platiteľ DPH faktúru bez neho nezaúčtuje — vyberte ho, alebo ho nastavte v predvolených predkontáciách.",
      )}
    </p>
  ) : null;
  const exportuj = useServerFn(exportPrijatychPohodaFn);
  const vrat = useServerFn(vratZPohodyFn);
  const varovanieVratenia = useVarovanieVratenia();
  const presun = useServerFn(presunPrijatuDoDokladovFn);
  const navigate = useNavigate();

  async function stiahniXml(oznacit: boolean) {
    setBusy(true);
    try {
      const r = await exportuj({ data: { company_id: row.company_id, ids: [row.id], oznacit } });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.xml], { type: "text/xml;charset=utf-8" }));
      a.download = r.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success(
        oznacit ? t("XML stiahnuté, faktúra je označená ako odovzdaná") : t("XML stiahnuté"),
      );
      toastNeodovzdane(t, r.preskocene);
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function vratit() {
    if (
      // Pravdivo podľa cesty: konektor ani súbor doklad v Pohode nezmažú (P-1009).
      !(await potvrd(varovanieVratenia("prijata", row, program)))
    )
      return;
    setBusy(true);
    try {
      await vrat({ data: { company_id: row.company_id, druh: "prijata", ids: [row.id] } });
      toast.success(t("Vrátené — opravte zaúčtovanie a zaúčtujte znova"));
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function doDokladov() {
    if (
      !(await potvrd(t("Presunúť túto faktúru medzi doklady (bločky)? Z prijatých faktúr zmizne.")))
    )
      return;
    setBusy(true);
    try {
      const r = await presun({ data: { company_id: row.company_id, id: row.id } });
      toast.success(t("Presunuté medzi doklady"));
      navigate({ to: "/doklady/novy", search: { id: r.id } as any });
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
      setBusy(false);
    }
  }

  async function uloz(lenUlozit: boolean) {
    setBusy(true);
    try {
      const r = await zauctuj({
        data: {
          company_id: row.company_id,
          ids: [row.id],
          predkontacia: h.predkontacia,
          clenenie: h.clenenie,
          kategoria: h.kategoria,
          kv: h.kv ?? "",
          stredisko: h.stredisko ?? "",
          cinnost: h.cinnost ?? "",
          rad: h.rad ?? "",
          intPoznamka: h.intPoznamka ?? "",
          lenUlozit,
        },
      });
      if (r.preskocene.length) toast.error(r.preskocene.join(" · "));
      else
        toast.success(
          lenUlozit ? t("Uložené") : t("Zaúčtované — pôjde do Pohody pri najbližšom odovzdaní."),
        );
      ponukaPravidlaToast(r.ponukaPravidla, t, navigate);
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function zrusit() {
    setBusy(true);
    try {
      await zrus({ data: { id: row.id } });
      toast.success(t("Zaúčtovanie zrušené"));
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  /*
    Kompaktné rozloženie ukladá hneď: po krátkej pauze sa pošle len pole,
    ktoré sa zmenilo (zaúčtovanie ostáva, ako je). Hodnoty predvyplnené
    návrhom (AI, návyk) sa sami neuložia — do dokladu idú, až keď ich človek
    potvrdí zmenou alebo tlačidlom Zaúčtovať.
  */
  const ulozeneRef = useRef<Hodnoty>(h);
  useEffect(() => {
    ulozeneRef.current = {
      predkontacia: row.pohoda_predkontacia ?? "",
      clenenie: row.pohoda_clenenie_dph ?? "",
      kategoria: row.category ?? "",
      kv: row.kv_clenenie ?? "",
      stredisko: row.stredisko ?? "",
      cinnost: row.cinnost ?? "",
      rad: row.pohoda_rad ?? "",
      intPoznamka: row.int_poznamka ?? "",
    };
  }, [row]);
  const zamknutaUprava = odovzdana || Boolean(row.locked_at);
  const [ukladam, setUkladam] = useState(false);
  const [ulozeneOk, setUlozeneOk] = useState(false);
  useEffect(() => {
    if (!kompaktne || zamknutaUprava) return;
    const zmena: Record<string, string> = {};
    for (const k of Object.keys(h) as (keyof Hodnoty)[]) {
      const v = String(h[k] ?? "");
      if (v === String(ulozeneRef.current[k] ?? "")) continue;
      const n = predvyplnene[k as PoleNavrhu];
      if (n && n.hodnota === v) continue;
      zmena[k] = v;
    }
    if (!Object.keys(zmena).length) return;
    const casovac = setTimeout(async () => {
      setUkladam(true);
      try {
        const r = await zauctuj({
          data: { company_id: row.company_id, ids: [row.id], ...zmena, lenUlozit: true } as any,
        });
        if (r.preskocene.length) toast.error(r.preskocene.join(" · "));
        else {
          ulozeneRef.current = { ...ulozeneRef.current, ...zmena };
          setUlozeneOk(true);
          setTimeout(() => setUlozeneOk(false), 1500);
        }
      } catch (e: any) {
        toast.error(t(e?.message ?? "Nepodarilo sa"));
      } finally {
        setUkladam(false);
      }
    }, 700);
    return () => clearTimeout(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, kompaktne, zamknutaUprava]);

  /** Dátum daňovej povinnosti (dodania) a typ platby sú stĺpce faktúry — ukladajú sa priamo. */
  async function ulozStlpec(zmena: Record<string, string | null>) {
    const { error } = await supabase
      .from("purchase_invoices")
      .update(zmena as never)
      .eq("id", row.id);
    if (error) return toast.error(t(error.message));
    setUlozeneOk(true);
    setTimeout(() => setUlozeneOk(false), 1500);
    onZmena();
  }
  const [viac, setViac] = useState(false);

  if (kompaktne) {
    const vstupK = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm";
    const popisK = "mb-1 block text-xs text-muted-foreground";
    const kvAuto =
      kvSPredvolenym(
        kvAutomaticky({
          opravny: Number(row.amount_total ?? 0) < 0 || !!row.opravuje_cislo,
          prenesenie: row.dph_rezim === "samozdanenie" || row.dph_rezim === "nadobudnutie",
        }),
        "prijata",
        navrhy?.predvoleneKv,
      ) ?? undefined;
    const stitok = (pole: PoleNavrhu) =>
      oznacenia?.[pole] ? <StitokNavrhu zdroj={oznacenia[pole]!} /> : null;
    const male =
      "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50";
    if (vPaneli) {
      const odkaz =
        "inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60";
      const tlacidla = (
        <>
          {!odovzdana && !zauctovana ? (
            <button
              type="button"
              onClick={() => uloz(false)}
              // Cudzia faktúra sa zaúčtuje až po potvrdení „patrí tejto firme“ (server ju aj tak vynechá).
              disabled={busy || Boolean(row.locked_at) || bezClenenia || jeCudzia(row)}
              className={TLACIDLO_HLAVNE}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookCheck className="h-4 w-4" />
              )}
              {t("Zaúčtovať")}
            </button>
          ) : null}
          {!odovzdana && zauctovana ? (
            <button type="button" onClick={zrusit} disabled={busy} className={TLACIDLO_DRUHE}>
              {t("Zrušiť zaúčtovanie")}
            </button>
          ) : null}
          {odovzdana ? (
            <button type="button" onClick={vratit} disabled={busy} className={TLACIDLO_DRUHE}>
              <Undo2 className="h-4 w-4" />
              {program ? t("Vrátiť z účtovníctva (opraviť)") : t("Vrátiť z Pohody (opraviť)")}
            </button>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {odovzdana ? (
              <>
                <OpravitZauctovanie row={row} druh="prijata" onZmena={onZmena} className={odkaz} />
                {program ? null : (
                  <button
                    type="button"
                    onClick={() => stiahniXml(false)}
                    disabled={busy}
                    className={odkaz}
                  >
                    <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML znova")}
                  </button>
                )}
              </>
            ) : zauctovana || row.status === "received" || row.status === "paid" ? (
              <button
                type="button"
                onClick={() => stiahniXml(true)}
                disabled={busy}
                title={t(
                  "Stiahne XML na import do Pohody a označí faktúru ako odovzdanú, aby ju konektor neposlal druhýkrát.",
                )}
                className={odkaz}
              >
                <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML pre Pohodu")}
              </button>
            ) : null}
            {pravidloZDokladu}
          </div>
        </>
      );
      const poznamka = (
        <div>
          <textarea
            rows={2}
            maxLength={200}
            disabled={zamknutaUprava}
            aria-label={t("Účtovná poznámka")}
            value={h.intPoznamka ?? ""}
            onChange={(e) => setH({ ...h, intPoznamka: e.target.value })}
            placeholder={t("Účtovná poznámka (ide do účtovníctva)")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-70"
          />
          <div className="text-right text-[11px] text-muted-foreground">
            {(h.intPoznamka ?? "").length}/200
          </div>
        </div>
      );
      return (
        <div className="min-w-0 space-y-3.5 text-sm" data-zauctovanie-v-paneli="">
          <div className="flex flex-wrap items-center gap-2">
            {odovzdana ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-hover">
                {program
                  ? t("V účtovníctve ({program}) od {kedy}", {
                      program,
                      kedy: kedy(row.exported_at, loc),
                    })
                  : t("V Pohode od {kedy}", { kedy: kedy(row.exported_at, loc) })}
              </span>
            ) : zauctovana ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                {t("Zaúčtovaná {kedy} — čaká na odovzdanie", {
                  kedy: kedy(row.zauctovane_at, loc),
                })}
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {t("Nezaúčtovaná")}
              </span>
            )}
            {ukladam ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            {ulozeneOk ? (
              <Check className="h-4 w-4 text-primary" aria-label={t("Uložené")} />
            ) : null}
          </div>
          {zamknutaUprava ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label={t("Len na čítanie")} />
              {odovzdana
                ? program
                  ? t(
                      "Faktúra je odovzdaná do účtovníctva ({program}) — zmeniť sa dá až po vrátení.",
                      { program },
                    )
                  : t("Faktúra je odovzdaná do Pohody — zmeniť sa dá až po vrátení z Pohody.")
                : t("Faktúra je zamknutá proti úpravám — najprv ju odomknite.")}
            </p>
          ) : null}
          <HistoriaOdovzdania row={row} druh="prijata" onZmena={onZmena} />
          <AutoZauctovanieOdznak typ="prijata" row={row} onZmena={onZmena} />
          <fieldset disabled={zamknutaUprava} className="min-w-0 space-y-3.5 disabled:opacity-70">
            <PoliaZauctovania
              navrhy={navrhy}
              oznacenia={oznacenia}
              kvAuto={kvAuto}
              doklad={{ typ: "faktura", platba: row.payment_method }}
              hodnoty={{
                predkontacia: h.predkontacia,
                clenenie: h.clenenie,
                kategoria: h.kategoria,
                kv: h.kv ?? "",
                stredisko: h.stredisko ?? "",
                cinnost: h.cinnost ?? "",
                rad: h.rad ?? "",
              }}
              setHodnoty={(x) =>
                setH({
                  ...h,
                  predkontacia: x.predkontacia,
                  clenenie: x.clenenie,
                  kategoria: x.kategoria ?? "",
                  kv: x.kv ?? "",
                  stredisko: x.stredisko ?? "",
                  cinnost: x.cinnost ?? "",
                  rad: x.rad ?? "",
                })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <Pole popis="Dátum daňovej povinnosti">
                <input
                  type="date"
                  value={row.delivery_date ?? row.issue_date ?? ""}
                  onChange={(e) => void ulozStlpec({ delivery_date: e.target.value || null })}
                  className={`${ramik} border-input`}
                />
              </Pole>
              <Pole popis="Typ platby">
                <select
                  value={row.payment_method ?? "prevod"}
                  onChange={(e) => void ulozStlpec({ payment_method: e.target.value })}
                  className={`${ramik} border-input`}
                >
                  <option value="prevod">{t("Prevod")}</option>
                  <option value="hotovost">{t("Hotovosť")}</option>
                  <option value="karta">{t("Karta")}</option>
                  <option value="dobierka">{t("Dobierka")}</option>
                  <option value="inkaso">{t("Inkaso")}</option>
                  <option value="zaloha">{t("Úhrada zálohou")}</option>
                  <option value="zapocet">{t("Zápočet")}</option>
                </select>
              </Pole>
            </div>
          </fieldset>
          {aktivneAi && <NavrhAiInfo dovod={navrh?.dovod ?? null} onZahod={zahodNavrh} />}
          {navrh?.stav === "bez_ciselnika" && <NavrhBezCiselnika />}
          {!odovzdana && !zauctovana && upozornenieClenenia}
          {!zamknutaUprava ? (
            <Rozsirene>
              <VyberPravidla
                companyId={row.company_id}
                doklad={row}
                druh="prijata"
                typ={typPrijatej(row.type, row.amount_total, row.opravuje_cislo)}
                zaklad={{
                  predkontacia: h.predkontacia,
                  clenenie: h.clenenie,
                  kv: h.kv,
                  kategoria: h.kategoria,
                }}
                onPouzi={(p) =>
                  setH({
                    ...h,
                    predkontacia: p.predkontacia ?? h.predkontacia,
                    clenenie: p.clenenie_dph ?? h.clenenie,
                    kategoria: p.kategoria ?? h.kategoria,
                    kv: p.kv_clenenie ?? h.kv,
                  })
                }
                onPredloha={(p) => setH(uplatniPredlohu(h, p))}
              />
              <NastavitPredvolene
                companyId={row.company_id}
                kluc="prijata"
                hodnoty={h}
                predvolene={{
                  predkontacia: navrhy?.predvolenaPredkontacia,
                  clenenie: navrhy?.predvoleneClenenie,
                  kv: navrhy?.predvoleneKv,
                }}
                onUlozene={() =>
                  nacitajNavrhy({ data: { company_id: row.company_id } })
                    .then(setNavrhy)
                    .catch(() => {})
                }
              />
              <RozuctovaniePanel
                companyId={row.company_id}
                druh="prijata"
                id={row.id}
                rozpis={rozpisPrijatej(row)}
                ulozene={row.rozuctovanie}
                navrhy={navrhy}
                kody={{
                  predkontacia: h.predkontacia || navrhy?.predvolenaPredkontacia || null,
                  clenenie: h.clenenie || navrhy?.predvoleneClenenie || null,
                }}
                onZmena={onZmena}
              />
              {!row.samofakturacia && row.type === "regular" && row.source !== "efaktura" ? (
                <button type="button" onClick={doDokladov} disabled={busy} className={male}>
                  <MoveRight className="h-3.5 w-3.5" /> {t("Presunúť medzi doklady")}
                </button>
              ) : null}
            </Rozsirene>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("Prázdne = predvolené z")}{" "}
            <Link to="/uctovnictvo/predkontacie" className="underline">
              {t("nastavení predkontácií")}
            </Link>
            {row.pravidlo_id ? ` · ${t("doplnené pravidlom účtovania")}` : ""}.
          </p>
          {vPaneli.pata ? createPortal(tlacidla, vPaneli.pata) : null}
          {vPaneli.poznamka ? createPortal(poznamka, vPaneli.poznamka) : null}
        </div>
      );
    }
    return (
      <section
        id="zauctovanie"
        aria-label={t("Účtovanie")}
        className="scroll-mt-24 rounded-xl border border-border bg-card p-4 text-sm transition-shadow sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {t("Účtovanie")}
            {zamknutaUprava ? (
              <Lock className="h-4 w-4 text-muted-foreground" aria-label={t("Len na čítanie")} />
            ) : null}
            {ukladam ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            {ulozeneOk ? (
              <Check className="h-4 w-4 text-primary" aria-label={t("Uložené")} />
            ) : null}
          </h2>
          {odovzdana ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-hover">
              {program
                ? t("V účtovníctve ({program}) od {kedy}", {
                    program,
                    kedy: kedy(row.exported_at, loc),
                  })
                : t("V Pohode od {kedy}", { kedy: kedy(row.exported_at, loc) })}
            </span>
          ) : zauctovana ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
              {t("Zaúčtovaná {kedy} — čaká na odovzdanie", { kedy: kedy(row.zauctovane_at, loc) })}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t("Nezaúčtovaná")}
            </span>
          )}
        </div>
        {zamknutaUprava ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {odovzdana
              ? program
                ? t(
                    "Faktúra je odovzdaná do účtovníctva ({program}) — zmeniť sa dá až po vrátení.",
                    { program },
                  )
                : t("Faktúra je odovzdaná do Pohody — zmeniť sa dá až po vrátení z Pohody.")
              : t("Faktúra je zamknutá proti úpravám — najprv ju odomknite.")}
          </p>
        ) : null}
        <HistoriaOdovzdania row={row} druh="prijata" onZmena={onZmena} />
        <AutoZauctovanieOdznak typ="prijata" row={row} onZmena={onZmena} />

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium">{t("Účtovná poznámka")}</span>
            <textarea
              rows={2}
              maxLength={200}
              disabled={zamknutaUprava}
              value={h.intPoznamka ?? ""}
              onChange={(e) => setH({ ...h, intPoznamka: e.target.value })}
              placeholder={t("Účtovná poznámka (ide do účtovníctva)")}
              className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-70"
            />
            <span className="block text-right text-[11px] text-muted-foreground">
              {(h.intPoznamka ?? "").length}/200
            </span>
          </label>
          <KomentarDokladu tabulka="purchase_invoices" id={row.id} komentar={row.komentar} />
        </div>

        <fieldset
          disabled={zamknutaUprava}
          className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0"
        >
          <label className="block">
            <span className={popisK}>{t("Dátum daňovej povinnosti")}</span>
            <input
              type="date"
              value={row.delivery_date ?? row.issue_date ?? ""}
              onChange={(e) => void ulozStlpec({ delivery_date: e.target.value || null })}
              className={vstupK}
            />
          </label>
          <label className="block">
            <span className={popisK}>{t("Typ platby")}</span>
            <select
              value={row.payment_method ?? "prevod"}
              onChange={(e) => void ulozStlpec({ payment_method: e.target.value })}
              className={vstupK}
            >
              <option value="prevod">{t("Prevod")}</option>
              <option value="hotovost">{t("Hotovosť")}</option>
              <option value="karta">{t("Karta")}</option>
              <option value="dobierka">{t("Dobierka")}</option>
              <option value="inkaso">{t("Inkaso")}</option>
              <option value="zaloha">{t("Úhrada zálohou")}</option>
              <option value="zapocet">{t("Zápočet")}</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={popisK}>
              {t("Predkontácia")}
              {stitok("predkontacia")}
            </span>
            <KodPohody
              odkazNaCiselnik
              ariaLabel="Predkontácia"
              value={h.predkontacia}
              placeholder={
                navrhy?.podlaKategorie?.[h.kategoria]?.predkontacia ??
                navrhy?.predvolenaPredkontacia ??
                t("napr. 1Fp")
              }
              onChange={(v) => setH({ ...h, predkontacia: v })}
              moznosti={zoradPodlaDokladu(navrhy?.predkontacie ?? [], {
                typ: "faktura",
                platba: row.payment_method,
              })}
              className={vstupK}
              vyber
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={popisK}>
              {t("Členenie DPH")}
              {stitok("clenenie")}
            </span>
            <KodPohody
              ariaLabel="Členenie DPH"
              value={h.clenenie}
              placeholder={
                navrhy?.podlaKategorie?.[h.kategoria]?.clenenie ??
                navrhy?.predvoleneClenenie ??
                t("napr. PD")
              }
              onChange={(v) => setH({ ...h, clenenie: v })}
              moznosti={navrhy?.clenenia ?? []}
              className={vstupK}
              vyber
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={popisK}>
              {t("Členenie KV DPH")}
              {stitok("kv")}
            </span>
            <select
              value={h.kv ?? ""}
              onChange={(e) => setH({ ...h, kv: e.target.value })}
              className={vstupK}
            >
              <option value="">{`${t("automaticky")}${kvAuto ? ` (${kvAuto})` : ""}`}</option>
              {KV_PRIJATE.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {t(k.nazov)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {aktivneAi && <NavrhAiInfo dovod={navrh?.dovod ?? null} onZahod={zahodNavrh} />}
        {navrh?.stav === "bez_ciselnika" && <NavrhBezCiselnika />}

        {!odovzdana && !zauctovana && upozornenieClenenia}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!odovzdana && !zauctovana ? (
            <button
              type="button"
              onClick={() => uloz(false)}
              // Cudzia faktúra sa zaúčtuje až po potvrdení „patrí tejto firme“ (server ju aj tak vynechá).
              disabled={busy || Boolean(row.locked_at) || bezClenenia || jeCudzia(row)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookCheck className="h-3.5 w-3.5" />
              )}
              {t("Zaúčtovať")}
            </button>
          ) : null}
          {!odovzdana && zauctovana ? (
            <button type="button" onClick={zrusit} disabled={busy} className={male}>
              {t("Zrušiť zaúčtovanie")}
            </button>
          ) : null}
          {odovzdana ? (
            <>
              {/* XML pre Pohodu len pri doklade, ktorý odišiel do Pohody. */}
              {program ? null : (
                <button
                  type="button"
                  onClick={() => stiahniXml(false)}
                  disabled={busy}
                  className={male}
                >
                  <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML znova")}
                </button>
              )}
              <button type="button" onClick={vratit} disabled={busy} className={male}>
                <Undo2 className="h-3.5 w-3.5" />{" "}
                {program ? t("Vrátiť z účtovníctva (opraviť)") : t("Vrátiť z Pohody (opraviť)")}
              </button>
              <OpravitZauctovanie row={row} druh="prijata" onZmena={onZmena} className={male} />
            </>
          ) : zauctovana || row.status === "received" || row.status === "paid" ? (
            <button
              type="button"
              onClick={() => stiahniXml(true)}
              disabled={busy}
              title={t(
                "Stiahne XML na import do Pohody a označí faktúru ako odovzdanú, aby ju konektor neposlal druhýkrát.",
              )}
              className={male}
            >
              <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML pre Pohodu")}
            </button>
          ) : null}
          {pravidloZDokladu}
          {!zamknutaUprava ? (
            <button
              type="button"
              onClick={() => setViac((v) => !v)}
              aria-expanded={viac}
              className={`${male} ml-auto`}
            >
              {t("Viac")}{" "}
              {viac ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
        </div>

        {viac && !zamknutaUprava ? (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
              <label className="block">
                <span className={popisK}>
                  {t("Kategória nákladu")}
                  {stitok("kategoria")}
                </span>
                <select
                  value={h.kategoria}
                  onChange={(e) => setH({ ...h, kategoria: e.target.value })}
                  className={vstupK}
                >
                  <option value="">—</option>
                  {KATEGORIE_VYDAVKOV.map((k) => (
                    <option key={k.kod} value={k.kod}>
                      {t(k.nazov)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={popisK}>{t("Stredisko")}</span>
                <KodPohody
                  ariaLabel="Stredisko"
                  value={h.stredisko ?? ""}
                  onChange={(v) => setH({ ...h, stredisko: v })}
                  moznosti={navrhy?.strediska ?? []}
                  placeholder={navrhy?.predvoleneStredisko ?? "—"}
                  className={vstupK}
                  vyber
                />
              </label>
              <label className="block">
                <span className={popisK}>{t("Činnosť")}</span>
                <KodPohody
                  ariaLabel="Činnosť"
                  value={h.cinnost ?? ""}
                  onChange={(v) => setH({ ...h, cinnost: v })}
                  moznosti={navrhy?.cinnosti ?? []}
                  placeholder="—"
                  className={vstupK}
                  vyber
                />
              </label>
              <label className="block">
                <span className={popisK}>{t("Číselný rad v Pohode")}</span>
                <KodPohody
                  ariaLabel="Číselný rad v Pohode"
                  value={h.rad ?? ""}
                  onChange={(v) => setH({ ...h, rad: v })}
                  moznosti={navrhy?.rady ?? []}
                  placeholder={navrhy?.predvolenyRad ?? t("predvolený v Pohode")}
                  className={vstupK}
                  vyber
                />
              </label>
            </div>
            <VyberPravidla
              companyId={row.company_id}
              doklad={row}
              druh="prijata"
              typ={typPrijatej(row.type, row.amount_total, row.opravuje_cislo)}
              zaklad={{
                predkontacia: h.predkontacia,
                clenenie: h.clenenie,
                kv: h.kv,
                kategoria: h.kategoria,
              }}
              onPouzi={(p) =>
                setH({
                  ...h,
                  predkontacia: p.predkontacia ?? h.predkontacia,
                  clenenie: p.clenenie_dph ?? h.clenenie,
                  kategoria: p.kategoria ?? h.kategoria,
                  kv: p.kv_clenenie ?? h.kv,
                })
              }
              onPredloha={(p) => setH(uplatniPredlohu(h, p))}
            />
            <NastavitPredvolene
              companyId={row.company_id}
              kluc="prijata"
              hodnoty={h}
              predvolene={{
                predkontacia: navrhy?.predvolenaPredkontacia,
                clenenie: navrhy?.predvoleneClenenie,
                kv: navrhy?.predvoleneKv,
              }}
              onUlozene={() =>
                nacitajNavrhy({ data: { company_id: row.company_id } })
                  .then(setNavrhy)
                  .catch(() => {})
              }
            />
            <RozuctovaniePanel
              companyId={row.company_id}
              druh="prijata"
              id={row.id}
              rozpis={rozpisPrijatej(row)}
              ulozene={row.rozuctovanie}
              navrhy={navrhy}
              kody={{
                predkontacia: h.predkontacia || navrhy?.predvolenaPredkontacia || null,
                clenenie: h.clenenie || navrhy?.predvoleneClenenie || null,
              }}
              onZmena={onZmena}
            />
            <p className="text-xs text-muted-foreground">
              {t("Prázdne pole = predvolené z")}{" "}
              <Link to="/uctovnictvo/predkontacie" className="underline">
                {t("nastavení predkontácií")}
              </Link>
              {row.pravidlo_id ? ` · ${t("doplnené pravidlom účtovania")}` : ""}.
            </p>
            {!row.samofakturacia && row.type === "regular" && row.source !== "efaktura" ? (
              <button type="button" onClick={doDokladov} disabled={busy} className={male}>
                <MoveRight className="h-3.5 w-3.5" /> {t("Presunúť medzi doklady")}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  // Tá istá karta ako pri nespracovanom doklade a vystavenej faktúre (DetailDokladu.tsx).
  return (
    <SekciaZauctovania
      stav={
        odovzdana ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            {program
              ? t("V účtovníctve ({program}) od {kedy}", {
                  program,
                  kedy: kedy(row.exported_at, loc),
                })
              : t("V Pohode od {kedy}", { kedy: kedy(row.exported_at, loc) })}
          </span>
        ) : zauctovana ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            {t("Zaúčtovaná {kedy} — čaká na odovzdanie", { kedy: kedy(row.zauctovane_at, loc) })}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("Nezaúčtovaná")}
          </span>
        )
      }
    >
      <HistoriaOdovzdania row={row} druh="prijata" onZmena={onZmena} />
      <AutoZauctovanieOdznak typ="prijata" row={row} onZmena={onZmena} />

      <div className="mt-3">
        {odovzdana ? (
          <>
            <p>
              {t("Predkontácia")}{" "}
              <strong>{row.pohoda_predkontacia || navrhy?.predvolenaPredkontacia || "—"}</strong>,{" "}
              {t("členenie DPH")}{" "}
              <strong>{row.pohoda_clenenie_dph || navrhy?.predvoleneClenenie || "—"}</strong>
              {Array.isArray(row.rozuctovanie) && row.rozuctovanie.length > 1
                ? ` ${t("(rozúčtovaná na {n} riadky)", { n: row.rozuctovanie.length })}`
                : ""}
              .{" "}
              {program
                ? t("Faktúra je odovzdaná do účtovníctva ({program}).", { program })
                : t("Faktúra je odovzdaná do Pohody.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {program ? null : (
                <button
                  onClick={() => stiahniXml(false)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                >
                  <Download className="h-4 w-4" /> {t("Stiahnuť XML znova")}
                </button>
              )}
              <button
                onClick={vratit}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" />{" "}
                {program ? t("Vrátiť z účtovníctva (opraviť)") : t("Vrátiť z Pohody (opraviť)")}
              </button>
              <OpravitZauctovanie
                row={row}
                druh="prijata"
                onZmena={onZmena}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              />
            </div>
          </>
        ) : (
          <>
            <PoliaZauctovania
              navrhy={navrhy}
              hodnoty={h}
              setHodnoty={setH}
              oznacenia={oznacenia}
              doklad={{ typ: "faktura", platba: row.payment_method }}
              kvAuto={
                kvSPredvolenym(
                  kvAutomaticky({
                    opravny: Number(row.amount_total ?? 0) < 0 || !!row.opravuje_cislo,
                    prenesenie:
                      row.dph_rezim === "samozdanenie" || row.dph_rezim === "nadobudnutie",
                  }),
                  "prijata",
                  navrhy?.predvoleneKv,
                ) ?? undefined
              }
            />
            {aktivneAi && <NavrhAiInfo dovod={navrh?.dovod ?? null} onZahod={zahodNavrh} />}
            {navrh?.stav === "bez_ciselnika" && <NavrhBezCiselnika />}
            <VyberPravidla
              companyId={row.company_id}
              doklad={row}
              druh="prijata"
              typ={typPrijatej(row.type, row.amount_total, row.opravuje_cislo)}
              zaklad={{
                predkontacia: h.predkontacia,
                clenenie: h.clenenie,
                kv: h.kv,
                kategoria: h.kategoria,
              }}
              onPouzi={(p) =>
                setH({
                  ...h,
                  predkontacia: p.predkontacia ?? h.predkontacia,
                  clenenie: p.clenenie_dph ?? h.clenenie,
                  kategoria: p.kategoria ?? h.kategoria,
                  kv: p.kv_clenenie ?? h.kv,
                })
              }
              onPredloha={(p) => setH(uplatniPredlohu(h, p))}
            />
            <NapovedaPredkontacii>
              {row.pravidlo_id ? ` · ${t("doplnené pravidlom účtovania")}` : ""}.{" "}
              {navrhy?.maCiselnik === false ? (
                <>
                  {t("Číselník je prázdny —")}{" "}
                  <Link to="/uctovnictvo/predkontacie" className="underline">
                    {t("načítajte ho z Pohody")}
                  </Link>
                  {t(", nech sa kódy vyberajú s popisom.")}
                </>
              ) : (
                t("Kódy musia existovať v Pohode.")
              )}
            </NapovedaPredkontacii>
            <NastavitPredvolene
              companyId={row.company_id}
              kluc="prijata"
              hodnoty={h}
              predvolene={{
                predkontacia: navrhy?.predvolenaPredkontacia,
                clenenie: navrhy?.predvoleneClenenie,
                kv: navrhy?.predvoleneKv,
              }}
              onUlozene={() =>
                nacitajNavrhy({ data: { company_id: row.company_id } })
                  .then(setNavrhy)
                  .catch(() => {})
              }
            />
            <RozuctovaniePanel
              companyId={row.company_id}
              druh="prijata"
              id={row.id}
              rozpis={rozpisPrijatej(row)}
              ulozene={row.rozuctovanie}
              navrhy={navrhy}
              kody={{
                predkontacia: h.predkontacia || navrhy?.predvolenaPredkontacia || null,
                clenenie: h.clenenie || navrhy?.predvoleneClenenie || null,
              }}
              onZmena={onZmena}
            />
            {!zauctovana && upozornenieClenenia}
            <div className="mt-3 flex flex-wrap gap-2">
              {!zauctovana && (
                <button
                  onClick={() => uloz(false)}
                  disabled={busy || bezClenenia || jeCudzia(row)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("Zaúčtovať")}
                </button>
              )}
              <button
                onClick={() => uloz(true)}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                {t("Uložiť bez zaúčtovania")}
              </button>
              {(zauctovana || row.status === "received" || row.status === "paid") && (
                <button
                  onClick={() => stiahniXml(true)}
                  disabled={busy}
                  title={t(
                    "Stiahne XML na import do Pohody a označí faktúru ako odovzdanú, aby ju konektor neposlal druhýkrát.",
                  )}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary-hover hover:bg-primary/10 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" /> {t("Stiahnuť XML pre Pohodu")}
                </button>
              )}
              {zauctovana && (
                <button
                  onClick={zrusit}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                >
                  {t("Zrušiť zaúčtovanie")}
                </button>
              )}
              {!row.samofakturacia && row.type === "regular" && row.source !== "efaktura" && (
                <button
                  onClick={doDokladov}
                  disabled={busy}
                  title={t("Zle zatriedené — je to bloček, nie faktúra")}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
                >
                  <MoveRight className="h-3.5 w-3.5" /> {t("Presunúť medzi doklady")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </SekciaZauctovania>
  );
}
