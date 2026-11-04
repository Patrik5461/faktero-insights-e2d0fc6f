import { useNavigate } from "@tanstack/react-router";
import { MAX_UCTOVNEJ_POZNAMKY } from "@/lib/faktero/uctovna-poznamka";
import { AutoZauctovanieOdznak, ponukaPravidlaToast } from "./AutoZauctovanieOdznak";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookCheck, Download, Loader2, Lock, Undo2 } from "lucide-react";
import {
  navrhyKodovFn,
  stavVystavenejFn,
  vratVystavenuZPohodyFn,
  zauctujVystavenuFn,
  zrusZauctovanieVystavenejFn,
} from "@/lib/faktero/zauctovanie.functions";
import { KV_CLENENIA } from "@/lib/faktero/kv-clenenie";
import { kvAutoVystavenej, textKv } from "@/lib/faktero/kv-auto";
import { navrhClenenieVystavenej } from "@/lib/faktero/clenenie-vystavenej";
import { NastavitPredvolene } from "./NastavitPredvolene";
import { KodPohody } from "./KodPohody";
import { RozuctovaniePanel } from "./RozuctovaniePanel";
import {
  prekazkaRozuctovaniaVystavenej,
  rozpisVystavenej,
} from "@/lib/faktero/rozuctovanie-vystavenej";
import { nacitajRozuctovanie } from "@/lib/faktero/rozuctovanie";
import { VyberPravidla } from "./VyberPravidla";
import { uplatniPredlohu } from "@/lib/faktero/predlohy-uctovania";
import { PoliaZauctovania, type Navrhy } from "./ZauctovaniePanel";
import { NapovedaPredkontacii, SekciaZauctovania } from "./DetailDokladu";
import { HistoriaOdovzdania, OpravitZauctovanie, useVarovanieVratenia } from "./OdovzdanieDokladu";
import { potvrd } from "@/lib/potvrdenie";
import { formatujCislo } from "@/lib/faktero/mena";
import { isAccountingDocument } from "@/lib/faktero/uctovny-doklad";
import { TLACIDLO_DRUHE, TLACIDLO_HLAVNE } from "./KompaktnyDetail";
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
  stredisko: string;
  cinnost: string;
};

/**
 * Stav a akcie zaúčtovania vystavenej faktúry — predkontácia, členenie DPH a
 * KV na hlavičke a voliteľne na položkách. Do Pohody ide faktúra konektorom,
 * balíkom alebo tlačidlom. Skladá sa z neho klasická karta
 * (ZauctovanieVystavenejPanel) aj kompaktný panel detailu (polia v sekcii
 * „Základné údaje“, tlačidlá v pätičke panelu) — oba kreslia tie isté polia.
 */
export function useZauctovanieVystavenej({
  inv,
  onZmena,
  onStiahnut,
  onVPohode,
}: {
  inv: any;
  onZmena: () => void;
  onStiahnut: () => Promise<void> | void;
  /** Odovzdanie do Pohody (aj s číslom). */
  onVPohode?: (v: { kedy: string; cislo: string | null } | null) => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  /*
    Nemecká firma účtuje cez DATEV: kontrolný výkaz (KV) je slovenský a XML
    pre Pohodu jej nič nedá. Predkontácia je pre ňu číslo účtu DATEV
    (export-datev.ts ho berie pred predvoleným účtom osnovy).
  */
  const krajinaFirmy = useKrajinaFirmyKontext();
  const de = krajinaFirmy === "DE";
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
  // Položky tak, ako sú v DB — z nich sa skladá rozpis po sadzbách pre rozúčtovanie sumy.
  const [surovePolozky, setSurovePolozky] = useState<any[] | null>(null);
  const [poPolozkach, setPoPolozkach] = useState(false);
  const [busy, setBusy] = useState(false);

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
      stredisko: x.stredisko ?? "",
      cinnost: x.cinnost ?? "",
    }));
    setSurovePolozky(s.polozky);
    setPolozky(p);
    setPoPolozkach(
      p.some((x: Polozka) => x.predkontacia || x.clenenie || x.kv || x.stredisko || x.cinnost),
    );
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

  const vPohode = stav?.vPohode ?? null;
  // Zálohová faktúra sa neúčtuje: bez polí zaúčtovania, len export do Pohody.
  const neuctuje = !isAccountingDocument(inv.type);
  const zauctovana = !neuctuje && Boolean(inv.zauctovane_at);

  /*
    Návrh členenia DPH do prázdneho poľa (ako pri faktúre): najprv to, čo
    navrhol motor automatického účtovania (`auto_uctovanie_navrh`), inak
    pravidlo → predvolené firmy → režim dane. Dobropis 20260004 (SFC) mal
    návrh „UD“, ale pole ostalo „—“ — návrh sa ukazoval len v štítku.
    Predvyplní sa len nezaúčtovanému dokladu mimo Pohody; uloží ho až
    Uložiť / Zaúčtovať (alebo Potvrdiť návrh).
  */
  const navrhClenenia: string | null = (() => {
    if (neuctuje || !navrhy) return null;
    const ulozeny = String((inv.auto_uctovanie_navrh as any)?.clenenieDph ?? "").trim();
    if (ulozeny) return ulozeny;
    return (
      navrhClenenieVystavenej({
        predvoleneFirmy: navrhy.predvoleneClenenie,
        platitel: navrhy.platitel !== false,
        krajinaFirmy: krajinaFirmy || "SK",
        ciselnik: navrhy.clenenia ?? [],
        doklad: {
          opravny:
            inv.type === "credit_note" ||
            inv.type === "debit_note" ||
            Boolean(inv.opravuje_fakturu_id),
          dph: Number(inv.vat_total ?? 0),
          reverseCharge: Boolean(inv.reverse_charge),
          reverseChargeType: inv.reverse_charge_type ?? null,
          euPlnenie: inv.eu_plnenie ?? null,
          osobitnaUprava: inv.osobitna_uprava ?? null,
          ossKrajina: inv.oss_country ?? null,
          partnerIcDph: inv.customer_ic_dph ?? null,
          partnerKrajina: inv.customer_country ?? null,
        },
      })?.kod ?? null
    );
  })();
  const predvyplnene = useRef<string | null>(null);
  useEffect(() => {
    predvyplnene.current = null;
  }, [inv.id]);
  useEffect(() => {
    if (!stav || vPohode || zauctovana || neuctuje || inv.status === "draft") return;
    if (String(inv.pohoda_clenenie_dph ?? "").trim() || !navrhClenenia) return;
    if (predvyplnene.current === navrhClenenia) return;
    predvyplnene.current = navrhClenenia;
    setH((x) => (x.clenenie.trim() ? x : { ...x, clenenie: navrhClenenia }));
  }, [stav, vPohode, zauctovana, neuctuje, inv.status, inv.pohoda_clenenie_dph, navrhClenenia]);
  // Pole drží návrh, ktorý ešte nie je uložený — povie to veta pod poliami.
  const clenenieZNavrhu =
    !String(inv.pohoda_clenenie_dph ?? "").trim() &&
    Boolean(navrhClenenia) &&
    h.clenenie.trim() === navrhClenenia;

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
            poPolozkach
              ? p
              : { ...p, predkontacia: "", clenenie: "", kv: "", stredisko: "", cinnost: "" },
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
  /* Účtovanie po položkách, nápoveda a predvolené kódy. */
  const poPolozkachANapoveda = (
    <>
      {clenenieZNavrhu ? (
        <p className="mt-2 text-xs text-muted-foreground" data-clenenie-z-navrhu="">
          {t("Členenie DPH {kod} je z návrhu zaúčtovania — uloží sa tlačidlom Zaúčtovať alebo Uložiť bez zaúčtovania.", {
            kod: navrhClenenia ?? "",
          })}
        </p>
      ) : null}
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
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">{t("Položka")}</th>
                <th className="py-1 pr-2 text-right font-medium">{t("Základ")}</th>
                <th className="py-1 pr-2 font-medium">{t("Predkontácia")}</th>
                <th className="py-1 pr-2 font-medium">{t("Členenie DPH")}</th>
                <th className="py-1 pr-2 font-medium">{t("KV")}</th>
                <th className="py-1 pr-2 font-medium">{t("Stredisko")}</th>
                <th className="py-1 font-medium">{t("Činnosť")}</th>
              </tr>
            </thead>
            <tbody>
              {polozky.map((p, i) => {
                const zmen = (z: Partial<Polozka>) =>
                  setPolozky((ps) => ps.map((x, j) => (j === i ? { ...x, ...z } : x)));
                return (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="min-w-[10rem] py-1.5 pr-2">
                      {p.name}
                      <span className="block text-xs text-muted-foreground">{p.vat_rate} %</span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">
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
                    <td className="py-1.5 pr-2 w-24">
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
                    <td className="py-1.5 pr-2 w-32">
                      <KodPohody
                        ariaLabel={t("Stredisko položky {n}", { n: i + 1 })}
                        value={p.stredisko}
                        onChange={(v) => zmen({ stredisko: v })}
                        moznosti={navrhy?.strediska ?? []}
                        placeholder={h.stredisko || navrhy?.predvoleneStredisko || ""}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        vyber
                      />
                    </td>
                    <td className="py-1.5 w-32">
                      <KodPohody
                        ariaLabel={t("Činnosť položky {n}", { n: i + 1 })}
                        value={p.cinnost}
                        onChange={(v) => zmen({ cinnost: v })}
                        moznosti={navrhy?.cinnosti ?? []}
                        placeholder={h.cinnost || ""}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        vyber
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Položka bez kódu dostane kód faktúry. Keď majú položky rôzne predkontácie, strediská alebo činnosti, hlavička v Pohode dostane „Rozúčtovať“.",
            )}
          </p>
        </div>
      )}

      {/*
        Rozúčtovanie sumy faktúry na viac riadkov (napr. jedna položka „Služby“
        rozdelená na dve strediská). Má prednosť pred kódmi pri položkách.
      */}
      {surovePolozky ? (
        <RozuctovaniePanel
          companyId={inv.company_id}
          druh="vystavena"
          id={inv.id}
          rozpis={rozpisVystavenej(inv, surovePolozky)}
          ulozene={inv.rozuctovanie}
          navrhy={navrhy}
          kody={{
            predkontacia: h.predkontacia || navrhy?.predvolenaPredkontacia || null,
            clenenie: h.clenenie || navrhy?.predvoleneClenenie || null,
            stredisko: h.stredisko || navrhy?.predvoleneStredisko || null,
            cinnost: h.cinnost || null,
          }}
          kvMoznosti={KV_VYDANE}
          sStrediskom
          prekazka={prekazkaRozuctovaniaVystavenej(inv, surovePolozky)}
          zamknute={Boolean(stav?.vPohode)}
          onZmena={onZmena}
        />
      ) : null}

      <NapovedaPredkontacii>
        {t(
          ". Do Pohody ide faktúra konektorom alebo mesačným balíkom; hneď ju stiahnete tlačidlom.",
        )}
      </NapovedaPredkontacii>
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
    Odovzdaná faktúra: zaúčtovanie po položkách a rozúčtovanie len na čítanie
    (meniť sa dá až po vrátení z Pohody — zámok v DB).
  */
  const rozuctovanieUlozene = nacitajRozuctovanie(inv.rozuctovanie);
  const polozkySKodmi = polozky.filter(
    (p) => p.predkontacia || p.clenenie || p.kv || p.stredisko || p.cinnost,
  );
  const kodyText = (x: {
    predkontacia?: string | null;
    clenenie?: string | null;
    kv?: string | null;
    stredisko?: string | null;
    cinnost?: string | null;
  }) =>
    [
      x.predkontacia,
      x.clenenie,
      x.kv ? `KV ${x.kv}` : "",
      x.stredisko ? `${t("str.")} ${x.stredisko}` : "",
      x.cinnost ? `${t("čin.")} ${x.cinnost}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "—";
  const prehladRozuctovania =
    rozuctovanieUlozene.length || polozkySKodmi.length ? (
      <div className="mt-3 space-y-1 text-xs" data-prehlad-rozuctovania="">
        {rozuctovanieUlozene.length ? (
          <>
            <div className="font-medium">
              {t("Rozúčtovaná na {n} riadky", { n: rozuctovanieUlozene.length })}
            </div>
            <ul className="space-y-0.5 text-muted-foreground">
              {rozuctovanieUlozene.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3">
                  <span className="min-w-0">
                    {kodyText(r)}
                    {r.text ? ` — ${r.text}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {r.sadzba} % · {formatujCislo(r.zaklad, 2)} + {formatujCislo(r.dph, 2)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="font-medium">{t("Kódy pri položkách")}</div>
            <ul className="space-y-0.5 text-muted-foreground">
              {polozkySKodmi.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-x-3">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span>{kodyText(p)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    ) : null;

  const zrusZauctovanie = () =>
    void akcia(
      () => zrus({ data: { company_id: inv.company_id, id: inv.id } }),
      "Zaúčtovanie zrušené",
    );

  /* Čo faktúra dostane v KV, keď pole ostane prázdne (to isté ako výkaz a export). */
  const kvAuto = kvAutoVystavenej(inv, {
    predvolene: navrhy?.predvoleneKv,
    clenenie: h.clenenie || navrhy?.predvoleneClenenie,
    krajinaFirmy,
  });

  return {
    de,
    loc,
    navrhy,
    kvAuto,
    h,
    setH,
    vPohode,
    neuctuje,
    zauctovana,
    busy,
    uloz,
    stiahnut,
    vratitZPohody,
    zrusZauctovanie,
    obnov,
    vyberPravidla,
    poPolozkachANapoveda,
    prehladRozuctovania,
  };
}

export type ZauctovanieVystavenej = ReturnType<typeof useZauctovanieVystavenej>;

/** Klasická karta „Zaúčtovanie“ vystavenej faktúry (tá istá ako pri nespracovanom doklade). */
export function ZauctovanieVystavenejPanel({
  inv,
  onZmena,
  onStiahnut,
}: {
  inv: any;
  onZmena: () => void;
  onStiahnut: () => Promise<void> | void;
}) {
  const { t } = useT();
  const {
    de,
    loc,
    navrhy,
    h,
    setH,
    vPohode,
    neuctuje,
    zauctovana,
    busy,
    uloz,
    stiahnut,
    vratitZPohody,
    zrusZauctovanie,
    obnov,
    vyberPravidla,
    poPolozkachANapoveda,
    prehladRozuctovania,
    kvAuto,
  } = useZauctovanieVystavenej({ inv, onZmena, onStiahnut });
  // Koncept sa nezaúčtuje.
  if (inv.status === "draft") return null;

  /*
    Klasické rozloženie — tá istá karta a to isté poradie polí ako pri
    nespracovanom doklade (SekciaZauctovania + PoliaZauctovania): predkontácia,
    členenie DPH, KV DPH, stredisko, činnosť, interná poznámka.
  */
  return (
    <SekciaZauctovania
      stav={
        vPohode ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            {vPohode.program
              ? t("V účtovníctve ({program}) od {kedy}", {
                  program: vPohode.program,
                  kedy: kedy(vPohode.kedy, loc),
                })
              : t("V Pohode od {kedy}", { kedy: kedy(vPohode.kedy, loc) })}
            {vPohode.cislo ? ` · ${t("č. {cislo}", { cislo: vPohode.cislo })}` : ""}
          </span>
        ) : neuctuje ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("Neúčtuje sa")}
          </span>
        ) : zauctovana ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            {t("Zaúčtovaná {kedy}", { kedy: kedy(inv.zauctovane_at, loc) })}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("Nezaúčtovaná")}
          </span>
        )
      }
    >
      <HistoriaOdovzdania
        row={inv}
        druh="faktura"
        cisloVPohode={vPohode?.cislo}
        onZmena={() => {
          onZmena();
          void obnov();
        }}
      />
      {!vPohode && !neuctuje && (
        <AutoZauctovanieOdznak typ="vystavena" row={inv} onZmena={onZmena} />
      )}

      {vPohode ? (
        <>
          {neuctuje ? (
            <NeuctujeSaInfo className="mt-3" />
          ) : (
            <p className="mt-3">
              {t("Predkontácia")}{" "}
              <strong>{inv.pohoda_predkontacia || navrhy?.predvolenaPredkontacia || "—"}</strong>,{" "}
              {t("členenie DPH")}{" "}
              <strong>{inv.pohoda_clenenie_dph || navrhy?.predvoleneClenenie || "—"}</strong>
              {de ? null : (
                <>
                  , {t("členenie KV DPH")}{" "}
                  <strong data-kv-dokladu="">{textKv(t, inv.kv_clenenie, kvAuto)}</strong>
                </>
              )}
              .{" "}
              {vPohode.program
                ? t("Faktúra je odovzdaná do účtovníctva ({program}).", {
                    program: vPohode.program,
                  })
                : t("Faktúra je v Pohode.")}
            </p>
          )}
          {neuctuje ? null : prehladRozuctovania}
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
            {neuctuje ? null : (
              <OpravitZauctovanie
                row={inv}
                druh="faktura"
                onZmena={onZmena}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              />
            )}
          </div>
        </>
      ) : neuctuje ? (
        <>
          <NeuctujeSaInfo className="mt-3" />
          {de ? null : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={stiahnut}
                disabled={busy}
                title={t("Stiahne XML na import do Pohody a zapíše faktúru ako odovzdanú.")}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary-hover hover:bg-primary/10 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {t("Stiahnuť XML pre Pohodu")}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <PoliaZauctovania
            navrhy={navrhy}
            hodnoty={de ? { ...h, kv: undefined } : h}
            setHodnoty={(x) =>
              setH({
                predkontacia: x.predkontacia,
                clenenie: x.clenenie,
                kv: x.kv ?? h.kv,
                stredisko: x.stredisko ?? "",
                cinnost: x.cinnost ?? "",
                intPoznamka: x.intPoznamka ?? "",
              })
            }
            kvMoznosti={KV_VYDANE}
            kvAuto={kvAuto}
            popisPredkontacie={de ? "Predkontácia (účet DATEV)" : "Predkontácia (Pohoda)"}
            priklady={{ predkontacia: t("napr. 3Fv"), clenenie: t("napr. UD") }}
          />
          {vyberPravidla}

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
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary-hover hover:bg-primary/10 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {t("Stiahnuť XML pre Pohodu")}
              </button>
            )}
            {zauctovana && (
              <button
                onClick={zrusZauctovanie}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                {t("Zrušiť zaúčtovanie")}
              </button>
            )}
          </div>
        </>
      )}
    </SekciaZauctovania>
  );
}

/* ------------------------------------------------ kompaktné rozloženie */

/** Stav zaúčtovania vpravo od nadpisu sekcie: Nezaúčtovaná / Zaúčtovaná / V Pohode. */
export function StavZauctovaniaVystavenej({ inv, z }: { inv: any; z: ZauctovanieVystavenej }) {
  const { t } = useT();
  const { vPohode, neuctuje, zauctovana, busy, loc } = z;
  if (inv.status === "draft") return null;
  return (
    <span className="flex items-center gap-1.5" data-stav-zauctovania="">
      {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      {vPohode ? (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-hover">
          {vPohode.program
            ? t("V účtovníctve ({program}) od {kedy}", {
                program: vPohode.program,
                kedy: kedy(vPohode.kedy, loc),
              })
            : t("V Pohode od {kedy}", { kedy: kedy(vPohode.kedy, loc) })}
          {vPohode.cislo ? ` · ${t("č. {cislo}", { cislo: vPohode.cislo })}` : ""}
        </span>
      ) : neuctuje ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {t("Neúčtuje sa")}
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
    </span>
  );
}

/**
 * Polia zaúčtovania v kompaktnom paneli — tie isté a v tom istom poradí ako
 * pri nespracovanom doklade (PoliaZauctovania): predkontácia, členenie DPH,
 * KV DPH, stredisko, činnosť; potom pravidlo, účtovanie po položkách a
 * predvolené kódy. Odovzdaná faktúra má polia zamknuté.
 */
export function PoliaZauctovaniaVystavenej({
  inv,
  z,
  zamknuteObdobie,
  onZmena,
}: {
  inv: any;
  z: ZauctovanieVystavenej;
  zamknuteObdobie?: boolean;
  onZmena: () => void;
}) {
  const { t } = useT();
  const {
    de,
    navrhy,
    h,
    setH,
    vPohode,
    neuctuje,
    obnov,
    vyberPravidla,
    poPolozkachANapoveda,
    prehladRozuctovania,
  } = z;
  if (inv.status === "draft")
    return (
      <p className="text-xs text-muted-foreground">
        {t("Koncept sa zaúčtuje až po vystavení faktúry.")}
      </p>
    );
  return (
    <>
      {vPohode ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label={t("Len na čítanie")} />
          {vPohode.program
            ? t("Faktúra je odovzdaná do účtovníctva ({program}) — zmeniť sa dá až po vrátení.", {
                program: vPohode.program,
              })
            : t("Faktúra je odovzdaná do Pohody — zmeniť sa dá až po vrátení z Pohody.")}
        </p>
      ) : null}
      <HistoriaOdovzdania
        row={inv}
        druh="faktura"
        cisloVPohode={vPohode?.cislo}
        onZmena={() => {
          onZmena();
          void obnov();
        }}
      />
      {zamknuteObdobie ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {t("Obdobie je uzavreté — dátumy a sumy faktúry sa už nemenia.")}
        </p>
      ) : null}
      {neuctuje ? <NeuctujeSaInfo /> : null}
      {!vPohode && !neuctuje ? (
        <AutoZauctovanieOdznak typ="vystavena" row={inv} onZmena={onZmena} />
      ) : null}
      {neuctuje ? null : (
        <fieldset disabled={Boolean(vPohode)} className="min-w-0 space-y-3.5 disabled:opacity-70">
          <PoliaZauctovania
            navrhy={navrhy}
            hodnoty={{
              predkontacia: h.predkontacia,
              clenenie: h.clenenie,
              kv: de ? undefined : h.kv,
              stredisko: h.stredisko,
              cinnost: h.cinnost,
            }}
            setHodnoty={(x) =>
              setH({
                ...h,
                predkontacia: x.predkontacia,
                clenenie: x.clenenie,
                kv: x.kv ?? h.kv,
                stredisko: x.stredisko ?? "",
                cinnost: x.cinnost ?? "",
              })
            }
            kvMoznosti={KV_VYDANE}
            kvAuto={z.kvAuto}
            popisPredkontacie={de ? "Predkontácia (účet DATEV)" : "Predkontácia (Pohoda)"}
            priklady={{ predkontacia: t("napr. 3Fv"), clenenie: t("napr. UD") }}
          />
          {vPohode ? null : vyberPravidla}
          {vPohode ? null : poPolozkachANapoveda}
        </fieldset>
      )}
      {vPohode && !neuctuje ? prehladRozuctovania : null}
    </>
  );
}

/** Účtovná poznámka (ide do účtovníctva) — v sekcii „Poznámka“ ako pri nespracovanom doklade. */
export function UctovnaPoznamkaVystavenej({ inv, z }: { inv: any; z: ZauctovanieVystavenej }) {
  const { t } = useT();
  const { h, setH, vPohode } = z;
  if (inv.status === "draft") return null;
  return (
    <div>
      <textarea
        rows={2}
        maxLength={MAX_UCTOVNEJ_POZNAMKY}
        disabled={Boolean(vPohode)}
        aria-label={t("Účtovná poznámka")}
        placeholder={t("Účtovná poznámka (ide do účtovníctva)")}
        value={h.intPoznamka}
        onChange={(e) => setH({ ...h, intPoznamka: e.target.value })}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-70"
      />
      <div className="text-right text-[11px] text-muted-foreground">{h.intPoznamka.length}/240</div>
    </div>
  );
}

/**
 * Tlačidlá zaúčtovania v pätičke panelu — rovnaké tvary ako „Uložiť zmeny“
 * a „Vytvoriť“ pri nespracovanom doklade.
 */
export function PataZauctovaniaVystavenej({
  inv,
  z,
  onZmena,
}: {
  inv: any;
  z: ZauctovanieVystavenej;
  onZmena: () => void;
}) {
  const { t } = useT();
  const {
    de,
    vPohode,
    neuctuje,
    zauctovana,
    busy,
    uloz,
    stiahnut,
    vratitZPohody,
    zrusZauctovanie,
  } = z;
  if (inv.status === "draft") return null;
  const odkaz =
    "inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60";
  if (vPohode)
    return (
      <>
        <button
          type="button"
          onClick={() => void vratitZPohody()}
          disabled={busy}
          className={TLACIDLO_DRUHE}
        >
          <Undo2 className="h-4 w-4" />
          {vPohode.program ? t("Vrátiť z účtovníctva (opraviť)") : t("Vrátiť z Pohody (opraviť)")}
        </button>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {neuctuje ? null : (
            <OpravitZauctovanie row={inv} druh="faktura" onZmena={onZmena} className={odkaz} />
          )}
          {vPohode.program ? null : (
            <button type="button" onClick={stiahnut} disabled={busy} className={odkaz}>
              <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML znova")}
            </button>
          )}
        </div>
      </>
    );
  // Zálohová faktúra sa neúčtuje — ostáva len stiahnutie XML pre Pohodu.
  if (neuctuje)
    return de ? null : (
      <button
        type="button"
        onClick={stiahnut}
        disabled={busy}
        title={t("Stiahne XML na import do Pohody a zapíše faktúru ako odovzdanú.")}
        className={TLACIDLO_HLAVNE}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {t("Stiahnuť XML pre Pohodu")}
      </button>
    );
  return (
    <>
      <button type="button" onClick={() => uloz(true)} disabled={busy} className={TLACIDLO_DRUHE}>
        {t("Uložiť bez zaúčtovania")}
      </button>
      {zauctovana ? (
        <button type="button" onClick={zrusZauctovanie} disabled={busy} className={TLACIDLO_DRUHE}>
          {t("Zrušiť zaúčtovanie")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => uloz(false)}
          disabled={busy}
          className={TLACIDLO_HLAVNE}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCheck className="h-4 w-4" />}
          {t("Zaúčtovať")}
        </button>
      )}
      {de ? null : (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={stiahnut}
            disabled={busy}
            title={t("Stiahne XML na import do Pohody a zapíše faktúru ako odovzdanú.")}
            className={odkaz}
          >
            <Download className="h-3.5 w-3.5" /> {t("Stiahnuť XML pre Pohodu")}
          </button>
        </div>
      )}
    </>
  );
}

/** Zálohová faktúra nie je daňový ani účtovný doklad — namiesto polí zaúčtovania. */
function NeuctujeSaInfo({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <p className={`text-sm text-muted-foreground ${className}`} data-neuctuje-sa="">
      {t(
        "Zálohová faktúra nie je daňový ani účtovný doklad — neúčtuje sa, preto nemá predkontáciu ani členenie DPH. Do Pohody ide len ako evidencia zálohy.",
      )}
    </p>
  );
}
