import { Link, useNavigate } from "@tanstack/react-router";
import { AutoZauctovanieOdznak, ponukaPravidlaToast } from "./AutoZauctovanieOdznak";
import { VyberPravidla } from "./VyberPravidla";
import { uplatniPredlohu } from "@/lib/faktero/predlohy-uctovania";
import { typPrijatej } from "@/lib/faktero/pravidla-uctovania";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookCheck, Download, Loader2, MoveRight, Undo2 } from "lucide-react";
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
import { RozuctovaniePanel } from "./RozuctovaniePanel";
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

/** Spoločné polia zaúčtovania — na detaile aj v hromadnom okne. */
export function PoliaZauctovania({
  navrhy,
  hodnoty,
  setHodnoty,
  hromadne,
  kvAuto,
  oznacenia,
  siroke = true,
  doklad,
}: {
  navrhy: Navrhy | null;
  hodnoty: Hodnoty;
  setHodnoty: (h: Hodnoty) => void;
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
  const zKategorie = navrhy?.podlaKategorie?.[hodnoty.kategoria];
  if (siroke) {
    return (
      <div className="max-w-2xl space-y-3 [&_label]:min-w-0">
        <label className="block">
          <span className={popis}>
            {t("Predkontácia (Pohoda)")}
            {stitok("predkontacia")}
          </span>
          <KodPohody
            odkazNaCiselnik
            value={hodnoty.predkontacia}
            placeholder={
              hromadne
                ? t("nemeniť")
                : (zKategorie?.predkontacia ?? navrhy?.predvolenaPredkontacia ?? t("napr. 1Fp"))
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
              value={hodnoty.clenenie}
              placeholder={
                hromadne
                  ? t("nemeniť")
                  : (zKategorie?.clenenie ?? navrhy?.predvoleneClenenie ?? t("napr. PD"))
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
                {KV_PRIJATE.map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {t(k.nazov)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
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
          {hodnoty.stredisko !== undefined && (
            <label className="block">
              <span className={popis}>{t("Stredisko")}</span>
              <KodPohody
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
          {t("Predkontácia (Pohoda)")}
          {stitok("predkontacia")}
        </span>
        <KodPohody
          odkazNaCiselnik
          value={hodnoty.predkontacia}
          placeholder={
            hromadne
              ? t("nemeniť")
              : (zKategorie?.predkontacia ?? navrhy?.predvolenaPredkontacia ?? t("napr. 1Fp"))
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
          value={hodnoty.clenenie}
          placeholder={
            hromadne
              ? t("nemeniť")
              : (zKategorie?.clenenie ?? navrhy?.predvoleneClenenie ?? t("napr. PD"))
          }
          onChange={(v) => setHodnoty({ ...hodnoty, clenenie: v })}
          moznosti={navrhy?.clenenia ?? []}
          vyber
          className={vstup}
        />
      </label>
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
            {KV_PRIJATE.map((k) => (
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
export function ZauctovaniePanel({ row, onZmena }: { row: any; onZmena: () => void }) {
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
  const exportuj = useServerFn(exportPrijatychPohodaFn);
  const vrat = useServerFn(vratZPohodyFn);
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
      !(await potvrd(
        t(
          "Vrátiť faktúru z Pohody? Zaúčtovanie sa zruší a pri ďalšom odovzdaní pôjde znova — v Pohode ju preto najprv zmažte, inak tam bude dvakrát.",
        ),
      ))
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

  return (
    <div
      id="zauctovanie"
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 text-sm transition-shadow"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <BookCheck className="h-3.5 w-3.5" /> {t("Zaúčtovanie")}
        </div>
        {odovzdana ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            {t("V Pohode od {kedy}", { kedy: kedy(row.exported_at, loc) })}
          </span>
        ) : zauctovana ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            {t("Zaúčtovaná {kedy} — čaká na odovzdanie", { kedy: kedy(row.zauctovane_at, loc) })}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("Nezaúčtovaná")}
          </span>
        )}
      </div>
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
              . {t("Faktúra je odovzdaná do Pohody.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => stiahniXml(false)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {t("Stiahnuť XML znova")}
              </button>
              <button
                onClick={vratit}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> {t("Vrátiť z Pohody (opraviť)")}
              </button>
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
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Prázdne pole = predvolené z")}{" "}
              <Link to="/uctovnictvo/predkontacie" className="underline">
                {t("nastavení predkontácií")}
              </Link>
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
            </p>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {!zauctovana && (
                <button
                  onClick={() => uloz(false)}
                  disabled={busy}
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
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
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
    </div>
  );
}
