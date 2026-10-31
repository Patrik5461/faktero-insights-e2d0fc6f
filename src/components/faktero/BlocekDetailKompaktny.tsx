import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { BookCheck, Check, CheckCircle2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { menoSpracovatela, nahralDokladu, spracovanieDokladu } from "@/lib/faktero/spracoval";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujCislo, formatujMenu } from "@/lib/faktero/mena";
import { rozpisBlocku } from "@/lib/faktero/rozuctovanie";
import { KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import { zauctujDokladyFn } from "@/lib/faktero/zauctovanie.functions";
import type { PoleZauctovaniaDokladu } from "@/lib/faktero/zauctovanie-dokladu";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { Kopirovat, ZbaleneK } from "./DetailDokladuKompaktny";
import {
  BEZ_RAMU,
  Hodnota,
  NahladKompaktny,
  PanelKompaktny,
  Pole,
  RozlozenieKompaktne,
  Rozsirene,
  Sekcia,
  TLACIDLO_DRUHE,
  TLACIDLO_HLAVNE,
  ZoznamPoloziek,
  ramik,
  type SuborKompaktny,
} from "./KompaktnyDetail";
import { KodPohody } from "./KodPohody";
import { PoliaZauctovania, type Navrhy } from "./ZauctovaniePanel";
import { HistoriaOdovzdania, OpravitZauctovanie, useProgramOdovzdania } from "./OdovzdanieDokladu";
import { ponukaPravidlaToast } from "./AutoZauctovanieOdznak";
import { KomentarDokladu } from "./StavDokladu";
import { PrilohyFaktury } from "./PrilohyFaktury";
import { HistoriaDokladu } from "./HistoriaDokladu";
import { KomentarePanel } from "./KomentarePanel";
import { PravidloZDokladu } from "./PravidloZDokladu";
import { PouzitPredlohu } from "./PouzitPredlohu";
import { NastavitPredvolene } from "./NastavitPredvolene";

const PLATBY: Record<string, string> = {
  hotovost: "Hotovosťou",
  karta: "Kartou",
  prevod: "Prevodom",
};

type Kody = {
  predkontacia: string;
  clenenie: string;
  kv: string;
  kategoria: string;
  pokladna: string;
};

function kodyZRiadku(row: any): Kody {
  return {
    predkontacia: row.pohoda_predkontacia ?? "",
    clenenie: row.pohoda_clenenie_dph ?? "",
    kv: row.kv_clenenie ?? "",
    kategoria: row.category ?? "",
    pokladna: row.pohoda_pokladna ?? "",
  };
}

/**
 * Detail bločku (výdavku) v kompaktnom rozložení — ten istý vzhľad ako
 * nespracovaný doklad a detail faktúr (KompaktnyDetail): veľký náhľad skenu
 * s nástrojmi na jednej strane, panel 400 px so sekciami na druhej (Základné
 * údaje so zaúčtovaním hneď za typom dokladu, Čiastka a DPH, Obchodník,
 * Úhrada, Poznámka, Položky) a Zaúčtovať v pätičke panelu. Úprava všetkých
 * údajov ostáva vo formulári (Upraviť v hlavičke).
 */
export function BlocekDetailKompaktny({
  row,
  nahlad,
  nahladUrl,
  kody,
  onZmena,
  onStiahni,
  hore,
}: {
  row: any;
  /** Náhľad skenu; `null` = používateľ ho skryl (zapne sa v menu „…“). */
  nahlad: { subor: SuborKompaktny | null | undefined; onSkryt: () => void } | null;
  nahladUrl: string | null;
  kody: Navrhy | null;
  onZmena: () => void;
  onStiahni: () => void;
  /** Štítky, stav dokladu, schvaľovanie — navrchu panelu. */
  hore?: ReactNode;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const navigate = useNavigate();
  const nacitajMena = useServerFn(menaClenovFirmy);
  const zauctuj = useServerFn(zauctujDokladyFn);
  const [mena, setMena] = useState<Record<string, string>>({});
  const [pohyb, setPohyb] = useState<{ booking_date: string; amount: number } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [ok, setOk] = useState(false);
  const [poznamka, setPoznamka] = useState(row.int_poznamka ?? "");
  const poznamkaUlozena = useRef(row.int_poznamka ?? "");
  // Kódy zaúčtovania sa menia v paneli a uložia sa tlačidlom v pätičke (ako pri faktúrach).
  const [k, setK] = useState<Kody>(() => kodyZRiadku(row));
  useEffect(() => {
    setK(kodyZRiadku(row));
  }, [
    row.id,
    row.pohoda_predkontacia,
    row.pohoda_clenenie_dph,
    row.kv_clenenie,
    row.category,
    row.pohoda_pokladna,
  ]);
  useEffect(() => {
    setPoznamka(row.int_poznamka ?? "");
    poznamkaUlozena.current = row.int_poznamka ?? "";
  }, [row.int_poznamka, row.id]);
  useEffect(() => {
    nacitajMena({ data: { company_id: row.company_id } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    supabase
      .from("bank_transactions")
      .select("booking_date, amount")
      .eq("matched_expense_id", row.id)
      .limit(1)
      .then(({ data }) => setPohyb((data?.[0] as any) ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.company_id]);

  const menaDokladu = row.currency ?? "EUR";
  const zamknute = Boolean(row.exported_at || row.locked_at);
  // Iný program než Pohoda (Money, Omega…) — null = Pohoda.
  const program = useProgramOdovzdania(row.export_job_id, Boolean(row.exported_at));
  const spracovanie = spracovanieDokladu(row, "doklad");
  const spracoval = menoSpracovatela(spracovanie, mena);
  const ulozil = nahralDokladu(row.source, row.created_by, mena);
  const cas = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" }) : null;

  function hotovo() {
    setOk(true);
    setTimeout(() => setOk(false), 1500);
    onZmena();
  }

  const povodne = kodyZRiadku(row);
  const zmenene = (Object.keys(k) as (keyof Kody)[]).filter(
    (x) => k[x].trim() !== povodne[x].trim(),
  );
  const zauctovany = Boolean(row.zauctovane_at);

  /**
   * Zaúčtovanie — tá istá serverová funkcia ako hromadné zaúčtovanie bločkov.
   * Prázdne pole tam nič nemení, preto vymazanie ide výslovne cez `vymazat`;
   * určená predkontácia doklad zároveň označí ako zaúčtovaný.
   */
  async function ulozZauctovanie() {
    const predkontacia = k.predkontacia.trim() || kody?.predvolenaPredkontacia || "";
    if (!predkontacia) {
      toast.error(t("Vyberte predkontáciu"));
      return;
    }
    const data: Record<string, unknown> = {
      company_id: row.company_id,
      ids: [row.id],
      predkontacia,
    };
    const vymazat: PoleZauctovaniaDokladu[] = [];
    for (const pole of zmenene) {
      const v = k[pole].trim();
      if (pole === "predkontacia") continue;
      if (pole === "kv") data.kv = v || "auto";
      else if (v) data[pole] = v;
      else if (pole !== "kategoria") vymazat.push(pole);
    }
    if (vymazat.length) data.vymazat = vymazat;
    setUkladam(true);
    try {
      const r = await zauctuj({ data: data as any });
      if (r.preskocenych) toast.error(t("Doklad je odovzdaný do Pohody — zmena sa neuložila."));
      else {
        ponukaPravidlaToast(r.ponukaPravidla, t, navigate);
        toast.success(t("Zaúčtované"));
        hotovo();
      }
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setUkladam(false);
    }
  }
  async function ulozStlpec(zmena: Record<string, string | null>) {
    setUkladam(true);
    const { error } = await supabase
      .from("expense_documents")
      .update(zmena as never)
      .eq("id", row.id);
    setUkladam(false);
    if (error) return toast.error(t(error.message));
    hotovo();
  }

  const uhradeny =
    row.payment_method === "hotovost" || row.payment_method === "karta" || Boolean(pohyb);
  const ekasaId = String(row.qr_raw ?? "").match(/O-[0-9A-F]{32}/i)?.[0] ?? null;
  const polozky = Array.isArray(row.items) ? row.items : [];
  const rozpis = rozpisBlocku(row);
  const celkom = Number(row.total_amount ?? 0);
  const sumaSedi =
    Math.abs(celkom) > 0 &&
    Math.abs(Number(row.net_amount ?? 0) + Number(row.vat_amount ?? 0) - celkom) < 0.015;
  const nazovSuboru = `${row.document_number || t("Bloček")}.${
    String(row.file_path ?? "")
      .split(".")
      .pop() || "jpg"
  }`;

  const stavUkladania = (
    <span className="flex items-center gap-2">
      {zamknute ? (
        <Lock className="h-4 w-4 text-muted-foreground" aria-label={t("Len na čítanie")} />
      ) : null}
      {ukladam ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      {ok ? <Check className="h-4 w-4 text-primary" aria-label={t("Uložené")} /> : null}
    </span>
  );

  const pata = row.exported_at ? (
    row.locked_at ? null : (
      <div className="flex justify-center">
        <OpravitZauctovanie row={row} druh="doklad" onZmena={onZmena} />
      </div>
    )
  ) : zamknute ? null : (
    <>
      {zmenene.length ? (
        <button
          type="button"
          onClick={() => setK(povodne)}
          disabled={ukladam}
          className={TLACIDLO_DRUHE}
        >
          {t("Zahodiť zmeny")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void ulozZauctovanie()}
        disabled={ukladam || (zauctovany && !zmenene.length)}
        className={TLACIDLO_HLAVNE}
      >
        {ukladam ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : zauctovany && !zmenene.length ? (
          <Check className="h-4 w-4" />
        ) : (
          <BookCheck className="h-4 w-4" />
        )}
        {zauctovany && !zmenene.length ? t("Zaúčtované") : t("Zaúčtovať")}
      </button>
    </>
  );

  return (
    <RozlozenieKompaktne
      nahlad={
        nahlad ? (
          <NahladKompaktny
            subor={nahlad.subor}
            onSkryt={nahlad.onSkryt}
            prazdne="K dokladu nie je súbor na náhľad."
          />
        ) : null
      }
    >
      <PanelKompaktny
        pata={pata}
        data-detail-blocku=""
        className={nahlad ? "" : "mx-auto w-full max-w-xl"}
      >
        {hore ? <div className="m-4 space-y-3 [&>*]:mb-0!">{hore}</div> : null}

        <Sekcia nadpis="Základné údaje" id="zauctovanie" akcia={stavUkladania}>
          <Hodnota popis="Typ dokladu">{t("Bloček")}</Hodnota>
          {zamknute ? (
            <p className="text-xs text-muted-foreground">
              {row.exported_at
                ? program
                  ? t(
                      "Doklad je odovzdaný do účtovníctva ({program}) — zmeniť sa dá až po vrátení.",
                      { program },
                    )
                  : t("Doklad je odovzdaný do Pohody — zmeniť sa dá až po vrátení z Pohody.")
                : t("Doklad je zamknutý proti úpravám — najprv ho odomknite.")}
            </p>
          ) : null}
          <HistoriaOdovzdania row={row} druh="doklad" onZmena={onZmena} />
          {/* Zaúčtovanie hneď za typom dokladu — ako pri nespracovanom doklade. */}
          <fieldset disabled={zamknute} className="min-w-0 space-y-3.5">
            <PoliaZauctovania
              navrhy={kody}
              doklad={{ typ: "blocek", platba: row.payment_method }}
              kvMoznosti={KV_PRIJATE}
              kvAuto="B3"
              hodnoty={{
                predkontacia: k.predkontacia,
                clenenie: k.clenenie,
                kv: k.kv,
                kategoria: k.kategoria,
              }}
              setHodnoty={(h) =>
                setK((x) => ({
                  ...x,
                  predkontacia: h.predkontacia ?? "",
                  clenenie: h.clenenie ?? "",
                  kv: h.kv ?? "",
                  kategoria: h.kategoria ?? "",
                }))
              }
            />
            {row.payment_method === "hotovost" && (kody?.pokladne?.length ?? 0) > 0 ? (
              <Pole popis="Pokladňa">
                <KodPohody
                  ariaLabel="Pokladňa"
                  value={k.pokladna}
                  onChange={(v) => setK((x) => ({ ...x, pokladna: v }))}
                  moznosti={kody?.pokladne ?? []}
                  placeholder={t("predvolená")}
                  className={ramik}
                  vyber
                />
              </Pole>
            ) : null}
          </fieldset>
          {!zamknute ? (
            <div className="flex flex-wrap items-center gap-2">
              <PouzitPredlohu
                companyId={row.company_id}
                druh="blocek"
                onPouzi={async (p) => {
                  // Kódy cez zaúčtovanie (história, pravidlá), rad a poznámka priamo.
                  const kodyPredlohy = Object.fromEntries(
                    (
                      [
                        ["predkontacia", p.predkontacia],
                        ["clenenie", p.clenenie_dph],
                        ["kv", p.kv_clenenie],
                        ["pokladna", p.pokladna],
                      ] as const
                    ).filter(([, v]) => v),
                  );
                  setUkladam(true);
                  try {
                    if (Object.keys(kodyPredlohy).length)
                      await zauctuj({
                        data: { company_id: row.company_id, ids: [row.id], ...kodyPredlohy } as any,
                      });
                    const ine: Record<string, string> = {};
                    if (p.rad) ine.pohoda_rad = p.rad;
                    if (p.poznamka) ine.int_poznamka = p.poznamka;
                    if (Object.keys(ine).length) await ulozStlpec(ine);
                    else hotovo();
                  } catch (e: any) {
                    toast.error(t(e?.message ?? "Nepodarilo sa"));
                  } finally {
                    setUkladam(false);
                  }
                }}
              />
              <NastavitPredvolene
                companyId={row.company_id}
                kluc="doklady"
                hodnoty={{
                  predkontacia: row.pohoda_predkontacia ?? "",
                  clenenie: row.pohoda_clenenie_dph ?? "",
                  kv: row.kv_clenenie ?? "",
                }}
              />
              <PravidloZDokladu
                companyId={row.company_id}
                zaklad={{
                  druh: "blocek",
                  nazov: row.supplier_name,
                  ico: row.supplier_ico,
                  odosielatel: row.odosielatel_mailu ?? null,
                  platba: row.payment_method,
                  predkontacia: row.pohoda_predkontacia ?? "",
                  clenenie: row.pohoda_clenenie_dph ?? "",
                  kv: row.kv_clenenie ?? "",
                  kategoria: row.category ?? "",
                  pokladna: row.pohoda_pokladna ?? "",
                }}
              />
            </div>
          ) : null}
          <Hodnota popis="Číslo dokladu">{row.document_number || null}</Hodnota>
          <fieldset disabled={zamknute} className="grid min-w-0 grid-cols-2 gap-3">
            <Pole popis="Dátum daňovej povinnosti">
              <input
                type="date"
                value={row.issue_date ?? ""}
                onChange={(e) => e.target.value && void ulozStlpec({ issue_date: e.target.value })}
                className={ramik}
              />
            </Pole>
            <Pole popis="Typ platby">
              <select
                value={row.payment_method ?? ""}
                onChange={(e) =>
                  e.target.value && void ulozStlpec({ payment_method: e.target.value })
                }
                className={ramik}
              >
                {!row.payment_method ? <option value="">{t("Vyberte…")}</option> : null}
                <option value="hotovost">{t("Hotovosťou")}</option>
                <option value="karta">{t("Kartou")}</option>
                <option value="prevod">{t("Prevodom")}</option>
              </select>
            </Pole>
          </fieldset>
          <Rozsirene>
            <Hodnota popis="Uložil">{ulozil}</Hodnota>
            {spracovanie ? <Hodnota popis="Spracoval">{spracoval ?? t("kolega")}</Hodnota> : null}
            {cas(spracovanie?.kedy) ? (
              <Hodnota popis="Dátum a čas spracovania">{cas(spracovanie?.kedy)}</Hodnota>
            ) : null}
            {cas(row.created_at) ? (
              <Hodnota popis="Dátum a čas nahratia">{cas(row.created_at)}</Hodnota>
            ) : null}
            {ekasaId ? (
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <Hodnota popis="ID bločku (eKasa)" title={ekasaId}>
                    <span className="font-mono text-xs">{ekasaId}</span>
                  </Hodnota>
                </div>
                <div className="pt-2.5">
                  <Kopirovat hodnota={ekasaId} popis="ID bločku (eKasa)" />
                </div>
              </div>
            ) : null}
          </Rozsirene>
        </Sekcia>

        <Sekcia nadpis="Čiastka a DPH" ok={sumaSedi}>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="Celková suma">
              <span className="tabular-nums">{formatujCislo(celkom, 2)}</span>
            </Hodnota>
            <Hodnota popis="Mena">{menaDokladu}</Hodnota>
          </div>
          {rozpis.map((r) => (
            <div key={r.sadzba} className="grid grid-cols-2 gap-3">
              <Hodnota popis={t("Základ dane {sadzba} %", { sadzba: r.sadzba })}>
                <span className="tabular-nums">{formatujCislo(r.zaklad, 2)}</span>
              </Hodnota>
              <Hodnota popis={t("Daň {sadzba} %", { sadzba: r.sadzba })}>
                <span className="tabular-nums">{formatujCislo(r.dph, 2)}</span>
              </Hodnota>
            </div>
          ))}
        </Sekcia>

        <Sekcia nadpis="Obchodník">
          <Hodnota popis="Názov">{row.supplier_name}</Hodnota>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="IČO">{row.supplier_ico}</Hodnota>
            <Hodnota popis="IČ DPH">{row.supplier_ic_dph}</Hodnota>
          </div>
        </Sekcia>

        <Sekcia
          nadpis="Úhrada"
          akcia={uhradeny ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : null}
        >
          {uhradeny ? (
            <p className="text-sm font-medium">
              {pohyb
                ? t("Uhradené z účtu {datum}", { datum: datumNaDoklade(pohyb.booking_date) })
                : t("Uhradené {ako}", { ako: t(PLATBY[row.payment_method] ?? "").toLowerCase() })}
            </p>
          ) : (
            <>
              <Hodnota popis="Zostáva k úhrade">
                <span className="tabular-nums">{formatujMenu(celkom, menaDokladu)}</span>
              </Hodnota>
              <p className="text-xs text-muted-foreground">
                {t("Platba prevodom — uhradený bude po spárovaní s pohybom na účte.")}
              </p>
            </>
          )}
        </Sekcia>

        <Sekcia nadpis="Poznámka">
          <label className="relative block">
            <span className="pointer-events-none absolute -top-2 left-2.5 z-10 bg-card px-1 text-[11px] leading-none text-muted-foreground">
              {t("Účtovná poznámka")}
            </span>
            <textarea
              rows={2}
              maxLength={200}
              disabled={zamknute}
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              onBlur={() => {
                if (poznamka.trim() === String(poznamkaUlozena.current).trim()) return;
                poznamkaUlozena.current = poznamka;
                void ulozStlpec({ int_poznamka: poznamka.trim() || null });
              }}
              placeholder={t("Účtovná poznámka (ide do účtovníctva)")}
              className="w-full min-w-0 rounded-lg border border-input bg-background px-3 pb-2 pt-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-70"
            />
            <span className="block text-right text-[11px] text-muted-foreground">
              {poznamka.length}/200
            </span>
          </label>
          <KomentarDokladu tabulka="expense_documents" id={row.id} komentar={row.komentar} />
          {row.note ? (
            <p className="whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-sm">
              {row.note}
            </p>
          ) : null}
        </Sekcia>

        <Sekcia nadpis="Položky">
          <ZoznamPoloziek polozky={polozky} mena={menaDokladu} />
        </Sekcia>

        {/* Karty s vlastným nadpisom — v paneli bez druhého rámu; dlaždice príloh po troch. */}
        <div className={`border-b border-border px-4 py-4 sm:[&_ul]:grid-cols-3! ${BEZ_RAMU}`}>
          <PrilohyFaktury
            druh="expense"
            dokladId={row.id}
            mozeMenit={!row.exported_at}
            kompaktne
            hlavny={
              row.file_path
                ? {
                    nazov: nazovSuboru,
                    url: nahladUrl,
                    mime: row.file_mime ?? null,
                    stiahni: onStiahni,
                  }
                : null
            }
          />
        </div>
        <div id="komentare" className={`scroll-mt-24 border-b border-border px-4 py-4 ${BEZ_RAMU}`}>
          <KomentarePanel companyId={row.company_id} agenda="doklad" id={row.id} />
        </div>
        <div className={BEZ_RAMU}>
          <ZbaleneK nadpis="História dokladu">
            <HistoriaDokladu companyId={row.company_id} agenda="doklad" id={row.id} />
          </ZbaleneK>
        </div>
      </PanelKompaktny>
    </RozlozenieKompaktne>
  );
}
