import { Link, useNavigate } from "@tanstack/react-router";
import { AutoZauctovanieOdznak, ponukaPravidlaToast } from "./AutoZauctovanieOdznak";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookCheck, ChevronDown, ChevronUp, Download, Loader2, Lock, Undo2 } from "lucide-react";
import {
  navrhyKodovFn,
  stavVystavenejFn,
  vratVystavenuZPohodyFn,
  zauctujVystavenuFn,
  zrusZauctovanieVystavenejFn,
} from "@/lib/faktero/zauctovanie.functions";
import { KV_CLENENIA } from "@/lib/faktero/kv-clenenie";
import { NastavitPredvolene } from "./NastavitPredvolene";
import { KodPohody } from "./KodPohody";
import { VyberPravidla } from "./VyberPravidla";
import { uplatniPredlohu } from "@/lib/faktero/predlohy-uctovania";
import type { Navrhy } from "./ZauctovaniePanel";
import { HistoriaOdovzdania, OpravitZauctovanie, useVarovanieVratenia } from "./OdovzdanieDokladu";
import { potvrd } from "@/lib/potvrdenie";
import { formatujCislo } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { paymentMethodLabel } from "@/lib/faktero/payment-method";
import { KomentarDokladu } from "./StavDokladu";
import { useKrajinaFirmyKontext, useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

const KV_VYDANE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));
const kedy = (iso: string | null | undefined, loc = "sk-SK") =>
  iso ? new Date(iso).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" }) : "";

type Polozka = {
  id: string;
  name: string;
  subtotal: number;
  vat_rate: number;
  predkontacia: string;
  clenenie: string;
  kv: string;
};

/**
 * Zaúčtovanie vystavenej faktúry — predkontácia, členenie DPH a KV na
 * hlavičke a voliteľne na položkách (ako „účtovné nastavenia položky" v
 * Doklado). Do Pohody ide faktúra konektorom, balíkom alebo tlačidlom.
 */
export function ZauctovanieVystavenejPanel({
  inv,
  onZmena,
  onStiahnut,
  kompaktne,
  zamknuteObdobie,
  onVPohode,
}: {
  inv: any;
  onZmena: () => void;
  onStiahnut: () => Promise<void> | void;
  /**
   * Kompaktné rozloženie detailu: karta „Základné údaje“ — interná a účtovná
   * poznámka, dátum daňovej povinnosti, typ platby a kódy v jednej mriežke.
   */
  kompaktne?: boolean;
  /** Dátum faktúry je v uzavretom období (uzávierka firmy). */
  zamknuteObdobie?: boolean;
  /** Odovzdanie do Pohody (aj s číslom) — kompaktná hlavička z neho berie interné číslo. */
  onVPohode?: (v: { kedy: string; cislo: string | null } | null) => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  /*
    Nemecká firma účtuje cez DATEV: kontrolný výkaz (KV) je slovenský a XML
    pre Pohodu jej nič nedá. Predkontácia je pre ňu číslo účtu DATEV
    (export-datev.ts ho berie pred predvoleným účtom osnovy).
  */
  const de = useKrajinaFirmyKontext() === "DE";
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const nacitajStav = useServerFn(stavVystavenejFn);
  const zauctuj = useServerFn(zauctujVystavenuFn);
  const navigate = useNavigate();
  const zrus = useServerFn(zrusZauctovanieVystavenejFn);
  const vrat = useServerFn(vratVystavenuZPohodyFn);
  const varovanieVratenia = useVarovanieVratenia();
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [stav, setStav] = useState<{
    vPohode: { kedy: string; cislo: string | null; program?: string | null } | null;
  } | null>(null);
  const [h, setH] = useState({
    predkontacia: "",
    clenenie: "",
    kv: "",
    stredisko: "",
    cinnost: "",
    intPoznamka: "",
  });
  const [polozky, setPolozky] = useState<Polozka[]>([]);
  const [poPolozkach, setPoPolozkach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viac, setViac] = useState(false);

  async function obnov() {
    const s = await nacitajStav({ data: { id: inv.id } });
    setStav({ vPohode: s.vPohode });
    onVPohode?.(s.vPohode);
    const p = s.polozky.map((x: any) => ({
      id: x.id,
      name: x.name,
      subtotal: Number(x.subtotal ?? 0),
      vat_rate: Number(x.vat_rate ?? 0),
      predkontacia: x.pohoda_predkontacia ?? "",
      clenenie: x.pohoda_clenenie_dph ?? "",
      kv: x.kv_clenenie ?? "",
    }));
    setPolozky(p);
    setPoPolozkach(p.some((x: Polozka) => x.predkontacia || x.clenenie || x.kv));
  }

  useEffect(() => {
    nacitajNavrhy({ data: { company_id: inv.company_id, pre: "vystavena", typ: inv.type } })
      .then(setNavrhy)
      .catch(() => {});
    void obnov().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.id]);
  useEffect(() => {
    setH({
      predkontacia: inv.pohoda_predkontacia ?? "",
      clenenie: inv.pohoda_clenenie_dph ?? "",
      kv: inv.kv_clenenie ?? "",
      stredisko: inv.stredisko ?? "",
      cinnost: inv.cinnost ?? "",
      intPoznamka: inv.int_poznamka ?? "",
    });
  }, [
    inv.pohoda_predkontacia,
    inv.pohoda_clenenie_dph,
    inv.kv_clenenie,
    inv.stredisko,
    inv.cinnost,
    inv.int_poznamka,
  ]);

  // Koncept sa nezaúčtuje; v kompaktnom rozložení ostanú aspoň poznámky a dátumy.
  if (inv.status === "draft" && !kompaktne) return null;
  const vPohode = stav?.vPohode;
  const zauctovana = Boolean(inv.zauctovane_at);
  const vstup =
    "mt-1 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

  async function uloz(lenUlozit: boolean) {
    setBusy(true);
    try {
      const r = await zauctuj({
        data: {
          company_id: inv.company_id,
          id: inv.id,
          predkontacia: h.predkontacia,
          clenenie: h.clenenie,
          kv: h.kv,
          stredisko: h.stredisko,
          cinnost: h.cinnost,
          intPoznamka: h.intPoznamka,
          lenUlozit,
          polozky: polozky.map((p) =>
            poPolozkach ? p : { ...p, predkontacia: "", clenenie: "", kv: "" },
          ),
        },
      });
      toast.success(lenUlozit ? t("Uložené") : t("Zaúčtované"));
      ponukaPravidlaToast(r.ponukaPravidla, t, navigate);
      onZmena();
      await obnov();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function akcia(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(t(ok));
      onZmena();
      await obnov();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const stiahnut = () => void Promise.resolve(onStiahnut()).then(obnov);
  async function vratitZPohody() {
    if (
      // Pravdivo podľa cesty: konektor ani súbor doklad v Pohode nezmažú (P-1009).
      await potvrd(varovanieVratenia("faktura", inv, stav?.vPohode?.program))
    )
      void akcia(
        () => vrat({ data: { company_id: inv.company_id, id: inv.id } }),
        "Vrátené — opravte zaúčtovanie a odovzdajte znova",
      );
  }

  /* Úlomky formulára — skladajú sa v klasickom aj kompaktnom rozložení. */
  const kodPredkontacia = (trieda: string) => (
    <KodPohody
      ariaLabel="Predkontácia"
      odkazNaCiselnik
      value={h.predkontacia}
      onChange={(v) => setH({ ...h, predkontacia: v })}
      moznosti={navrhy?.predkontacie ?? []}
      placeholder={navrhy?.predvolenaPredkontacia ?? t("napr. 3Fv")}
      className={trieda}
      vyber
    />
  );
  const kodClenenie = (trieda: string) => (
    <KodPohody
      ariaLabel="Členenie DPH"
      value={h.clenenie}
      onChange={(v) => setH({ ...h, clenenie: v })}
      moznosti={navrhy?.clenenia ?? []}
      placeholder={navrhy?.predvoleneClenenie ?? t("napr. UD")}
      className={trieda}
      vyber
    />
  );
  const kodKv = (trieda: string) => (
    <select value={h.kv} onChange={(e) => setH({ ...h, kv: e.target.value })} className={trieda}>
      <option value="">{t("automaticky")}</option>
      {KV_VYDANE.map((k) => (
        <option key={k.kod} value={k.kod}>
          {t(k.nazov)}
        </option>
      ))}
    </select>
  );
  const vyberPravidla = (
    <VyberPravidla
      companyId={inv.company_id}
      druh="vystavena"
      typ={inv.type}
      doklad={{
        supplier_ico: inv.customer_ico,
        supplier_name: inv.customer_name,
        pravidlo_id: inv.pravidlo_id,
      }}
      zaklad={{ predkontacia: h.predkontacia, clenenie: h.clenenie, kv: h.kv }}
      onPouzi={(p) =>
        setH({
          ...h,
          predkontacia: p.predkontacia ?? h.predkontacia,
          clenenie: p.clenenie_dph ?? h.clenenie,
          kv: p.kv_clenenie ?? h.kv,
        })
      }
      onPredloha={(p) => setH(uplatniPredlohu(h, p))}
    />
  );
  const poleStredisko = (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{t("Stredisko")}</span>
      <KodPohody
        ariaLabel="Stredisko"
        value={h.stredisko}
        onChange={(v) => setH({ ...h, stredisko: v })}
        moznosti={navrhy?.strediska ?? []}
        placeholder={navrhy?.predvoleneStredisko ?? "—"}
        className={vstup}
        vyber
      />
    </label>
  );
  const poleCinnost = (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{t("Činnosť")}</span>
      <KodPohody
        ariaLabel="Činnosť"
        value={h.cinnost}
        onChange={(v) => setH({ ...h, cinnost: v })}
        moznosti={navrhy?.cinnosti ?? []}
        placeholder="—"
        className={vstup}
        vyber
      />
    </label>
  );
  /* Účtovanie po položkách, nápoveda a predvolené kódy. */
  const poPolozkachANapoveda = (
    <>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={poPolozkach}
          onChange={(e) => setPoPolozkach(e.target.checked)}
        />
        {t("Účtovať po položkách (každá položka vlastná predkontácia)")}
      </label>
      {poPolozkach && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">{t("Položka")}</th>
                <th className="py-1 pr-2 text-right font-medium">{t("Základ")}</th>
                <th className="py-1 pr-2 font-medium">{t("Predkontácia")}</th>
                <th className="py-1 pr-2 font-medium">{t("Členenie DPH")}</th>
                <th className="py-1 font-medium">{t("KV")}</th>
              </tr>
            </thead>
            <tbody>
              {polozky.map((p, i) => {
                const zmen = (z: Partial<Polozka>) =>
                  setPolozky((ps) => ps.map((x, j) => (j === i ? { ...x, ...z } : x)));
                return (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2">
                      {p.name}
                      <span className="block text-xs text-muted-foreground">{p.vat_rate} %</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatujCislo(p.subtotal, 2)}
                    </td>
                    <td className="py-1.5 pr-2 w-36">
                      <KodPohody
                        ariaLabel={t("Predkontácia položky {n}", { n: i + 1 })}
                        value={p.predkontacia}
                        onChange={(v) => zmen({ predkontacia: v })}
                        moznosti={navrhy?.predkontacie ?? []}
                        placeholder={h.predkontacia || navrhy?.predvolenaPredkontacia || ""}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        bezPopisu
                        vyber
                      />
                    </td>
                    <td className="py-1.5 pr-2 w-36">
                      <KodPohody
                        ariaLabel={t("Členenie DPH položky {n}", { n: i + 1 })}
                        value={p.clenenie}
                        onChange={(v) => zmen({ clenenie: v })}
                        moznosti={navrhy?.clenenia ?? []}
                        placeholder={h.clenenie || navrhy?.predvoleneClenenie || ""}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        vyber
                      />
                    </td>
                    <td className="py-1.5 w-24">
                      <select
                        aria-label={t("KV položky {n}", { n: i + 1 })}
                        value={p.kv}
                        onChange={(e) => zmen({ kv: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">{t("z faktúry")}</option>
                        {KV_VYDANE.map((k) => (
                          <option key={k.kod} value={k.kod} title={t(k.nazov)}>
                            {k.kod === "X" ? t("nezahŕňať") : k.kod}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Položka bez kódu dostane kód faktúry. Keď majú položky rôzne predkontácie, hlavička v Pohode dostane „Rozúčtovať“.",
            )}
          </p>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {t("Prázdne pole = predvolené z")}{" "}
        <Link to="/uctovnictvo/predkontacie" className="underline">
          {t("nastavení predkontácií")}
        </Link>
        {t(
          ". Do Pohody ide faktúra konektorom alebo mesačným balíkom; hneď ju stiahnete tlačidlom.",
        )}
      </p>
      <NastavitPredvolene
        companyId={inv.company_id}
        kluc={
          inv.type === "proforma" ? "zaloha" : inv.type === "credit_note" ? "dobropis" : "faktura"
        }
        hodnoty={h}
        predvolene={{
          predkontacia: navrhy?.predvolenaPredkontacia,
          clenenie: navrhy?.predvoleneClenenie,
          kv: navrhy?.predvoleneKv,
        }}
        onUlozene={() =>
          nacitajNavrhy({
            data: { company_id: inv.company_id, pre: "vystavena", typ: inv.type },
          })
            .then(setNavrhy)
            .catch(() => {})
        }
      />
    </>
  );

  /*
    Kompaktné rozloženie: „Základné údaje“ ako jedna karta. Dátum daňovej
    povinnosti a typ platby sú na vystavenej faktúre len na čítanie — mení
    ich Opraviť faktúru, lebo sú aj v PDF, ktoré má odberateľ.
  */
  if (kompaktne) {
    const koncept = inv.status === "draft";
    const zamknute = Boolean(vPohode);
    const vstupK = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm";
    const popisK = "mb-1 block text-xs text-muted-foreground";
    const male =
      "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50";
    const citanie = (popis: string, hodnota: string) => (
      <div className="min-w-0">
        <span className={popisK}>{t(popis)}</span>
        <div
          className="flex h-10 min-w-0 items-center truncate rounded-lg border border-border bg-muted/40 px-3 text-sm"
          title={t("Mení sa cez Opraviť faktúru")}
        >
          {hodnota}
        </div>
      </div>
    );
    return (
      <section
        id="zauctovanie"
        aria-label={t("Základné údaje")}
        className="@container min-w-0 scroll-mt-24 rounded-xl border border-border bg-card p-4 text-sm transition-shadow sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {t("Základné údaje")}
            {zamknute ? (
              <Lock className="h-4 w-4 text-muted-foreground" aria-label={t("Len na čítanie")} />
            ) : null}
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </h2>
          {koncept ? null : vPohode ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {vPohode.program
                ? t("V účtovníctve ({program}) od {kedy}", {
                    program: vPohode.program,
                    kedy: kedy(vPohode.kedy, loc),
                  })
                : t("V Pohode od {kedy}", { kedy: kedy(vPohode.kedy, loc) })}
              {vPohode.cislo ? ` · ${t("č. {cislo}", { cislo: vPohode.cislo })}` : ""}
            </span>
          ) : zauctovana ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
              {t("Zaúčtovaná {kedy}", { kedy: kedy(inv.zauctovane_at, loc) })}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t("Nezaúčtovaná")}
            </span>
          )}
        </div>
        {zamknute ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {vPohode?.program
              ? t("Faktúra je odovzdaná do účtovníctva ({program}) — zmeniť sa dá až po vrátení.", {
                  program: vPohode.program,
                })
              : t("Faktúra je odovzdaná do Pohody — zmeniť sa dá až po vrátení z Pohody.")}
          </p>
        ) : null}
        {koncept ? null : (
          <HistoriaOdovzdania
            row={inv}
            druh="faktura"
            cisloVPohode={vPohode?.cislo}
            onZmena={() => {
              onZmena();
              void obnov();
            }}
          />
        )}
        {zamknuteObdobie ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            {t("Obdobie je uzavreté — dátumy a sumy faktúry sa už nemenia.")}
          </p>
        ) : null}
        {!vPohode && !koncept ? (
          <AutoZauctovanieOdznak typ="vystavena" row={inv} onZmena={onZmena} />
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-3 @xl:grid-cols-2 [&>*]:min-w-0">
          {koncept ? null : (
            <label className="block min-w-0">
              <span className="mb-1 block text-sm font-medium">{t("Účtovná poznámka")}</span>
              <textarea
                rows={2}
                maxLength={240}
                disabled={zamknute}
                value={h.intPoznamka}
                onChange={(e) => setH({ ...h, intPoznamka: e.target.value })}
                placeholder={t("Účtovná poznámka (ide do účtovníctva)")}
                className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-70"
              />
              <span className="block text-right text-[11px] text-muted-foreground">
                {h.intPoznamka.length}/240
              </span>
            </label>
          )}
          <KomentarDokladu tabulka="invoices" id={inv.id} komentar={inv.komentar} />
        </div>

        <fieldset
          disabled={zamknute}
          className="mt-2 grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-4 [&>*]:min-w-0"
        >
          {citanie("Dátum daňovej povinnosti", datumNaDoklade(inv.delivery_date ?? inv.issue_date))}
          {citanie("Typ platby", t(paymentMethodLabel(inv.payment_method)))}
          {koncept ? null : (
            <>
              <label className="block @md:col-span-2">
                <span className={popisK}>{t("Predkontácia")}</span>
                {kodPredkontacia(vstupK)}
              </label>
              <label className="block @md:col-span-2">
                <span className={popisK}>{t("Členenie DPH")}</span>
                {kodClenenie(vstupK)}
              </label>
              {de ? null : (
                <label className="block @md:col-span-2">
                  <span className={popisK}>{t("Členenie KV DPH")}</span>
                  {kodKv(vstupK)}
                </label>
              )}
            </>
          )}
        </fieldset>

        {koncept ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Koncept sa zaúčtuje až po vystavení faktúry.")}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!vPohode && !zauctovana ? (
              <button
                type="button"
                onClick={() => uloz(false)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <BookCheck className="h-3.5 w-3.5" />
                {t("Zaúčtovať")}
              </button>
            ) : null}
            {!vPohode ? (
              <button type="button" onClick={() => uloz(true)} disabled={busy} className={male}>
                {t("Uložiť bez zaúčtovania")}
              </button>
            ) : null}
            {!vPohode && zauctovana ? (
              <button
                type="button"
                onClick={() =>
                  void akcia(
                    () => zrus({ data: { company_id: inv.company_id, id: inv.id } }),
                    "Zaúčtovanie zrušené",
                  )
                }
                disabled={busy}
                className={male}
              >
                {t("Zrušiť zaúčtovanie")}
              </button>
            ) : null}
            {vPohode ? (
              <>
                {/* XML pre Pohodu len pri faktúre, ktorá odišla do Pohody. */}
                {vPohode.program ? null : (
                  <button type="button" onClick={stiahnut} disabled={busy} className={male}>
                    <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML znova")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void vratitZPohody()}
                  disabled={busy}
                  className={male}
                >
                  <Undo2 className="h-3.5 w-3.5" />{" "}
                  {vPohode.program
                    ? t("Vrátiť z účtovníctva (opraviť)")
                    : t("Vrátiť z Pohody (opraviť)")}
                </button>
                <OpravitZauctovanie row={inv} druh="faktura" onZmena={onZmena} className={male} />
              </>
            ) : de ? null : (
              <button
                type="button"
                onClick={stiahnut}
                disabled={busy}
                title={t("Stiahne XML na import do Pohody a zapíše faktúru ako odovzdanú.")}
                className={male}
              >
                <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML pre Pohodu")}
              </button>
            )}
            {!vPohode ? (
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
        )}

        {viac && !vPohode && !koncept ? (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 [&>*]:min-w-0">
              {poleStredisko}
              {poleCinnost}
            </div>
            {vyberPravidla}
            {poPolozkachANapoveda}
          </div>
        ) : null}
      </section>
    );
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
        {vPohode ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            {vPohode.program
              ? t("V účtovníctve ({program}) od {kedy}", {
                  program: vPohode.program,
                  kedy: kedy(vPohode.kedy, loc),
                })
              : t("V Pohode od {kedy}", { kedy: kedy(vPohode.kedy, loc) })}
            {vPohode.cislo ? ` · ${t("č. {cislo}", { cislo: vPohode.cislo })}` : ""}
          </span>
        ) : zauctovana ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            {t("Zaúčtovaná {kedy}", { kedy: kedy(inv.zauctovane_at, loc) })}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("Nezaúčtovaná")}
          </span>
        )}
      </div>
      <HistoriaOdovzdania
        row={inv}
        druh="faktura"
        cisloVPohode={vPohode?.cislo}
        onZmena={() => {
          onZmena();
          void obnov();
        }}
      />
      {!vPohode && <AutoZauctovanieOdznak typ="vystavena" row={inv} onZmena={onZmena} />}

      {vPohode ? (
        <>
          <p className="mt-3">
            {t("Predkontácia")}{" "}
            <strong>{inv.pohoda_predkontacia || navrhy?.predvolenaPredkontacia || "—"}</strong>,{" "}
            {t("členenie DPH")}{" "}
            <strong>{inv.pohoda_clenenie_dph || navrhy?.predvoleneClenenie || "—"}</strong>
            {inv.kv_clenenie ? (
              <>
                , KV <strong>{inv.kv_clenenie}</strong>
              </>
            ) : null}
            .{" "}
            {vPohode.program
              ? t("Faktúra je odovzdaná do účtovníctva ({program}).", { program: vPohode.program })
              : t("Faktúra je v Pohode.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {vPohode.program ? null : (
              <button
                onClick={stiahnut}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {t("Stiahnuť XML znova")}
              </button>
            )}
            <button
              onClick={() => void vratitZPohody()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />{" "}
              {vPohode.program
                ? t("Vrátiť z účtovníctva (opraviť)")
                : t("Vrátiť z Pohody (opraviť)")}
            </button>
            <OpravitZauctovanie
              row={inv}
              druh="faktura"
              onZmena={onZmena}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            />
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 grid max-w-2xl grid-cols-1 gap-3 [&>*]:min-w-0">
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                {t(de ? "Predkontácia (účet DATEV)" : "Predkontácia (Pohoda)")}
              </span>
              {kodPredkontacia(vstup)}
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">{t("Členenie DPH")}</span>
              {kodClenenie(vstup)}
            </label>
            {de ? null : (
              <label className="block">
                <span className="text-sm font-medium text-foreground">{t("Členenie KV DPH")}</span>
                {kodKv(vstup)}
              </label>
            )}
          </div>
          {vyberPravidla}

          <div className="mt-3 grid max-w-2xl grid-cols-1 gap-3 [&>*]:min-w-0">
            {poleStredisko}
            {poleCinnost}
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                {t("Interná poznámka (do Pohody)")}
              </span>
              <input
                value={h.intPoznamka}
                onChange={(e) => setH({ ...h, intPoznamka: e.target.value })}
                maxLength={240}
                className={vstup}
              />
            </label>
          </div>

          {poPolozkachANapoveda}
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
            {de ? null : (
              <button
                onClick={stiahnut}
                disabled={busy}
                title={t("Stiahne XML na import do Pohody a zapíše faktúru ako odovzdanú.")}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {t("Stiahnuť XML pre Pohodu")}
              </button>
            )}
            {zauctovana && (
              <button
                onClick={() =>
                  void akcia(
                    () => zrus({ data: { company_id: inv.company_id, id: inv.id } }),
                    "Zaúčtovanie zrušené",
                  )
                }
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                {t("Zrušiť zaúčtovanie")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
