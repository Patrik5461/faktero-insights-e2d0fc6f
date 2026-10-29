import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Hash,
  Loader2,
  Lock,
  Store,
  UserCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { menoSpracovatela, nahralDokladu, spracovanieDokladu } from "@/lib/faktero/spracoval";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { rozpisBlocku } from "@/lib/faktero/rozuctovanie";
import { sadzbyKrajiny } from "@/lib/faktero/vat-rates";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { zoradPodlaDokladu } from "@/lib/faktero/predkontacie";
import { KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import { zauctujDokladyFn } from "@/lib/faktero/zauctovanie.functions";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import {
  Avatar,
  KartaK,
  Kopirovat,
  PolozkyK,
  StranyDokladuK,
  SumarK,
  UdajK,
  ZbaleneK,
} from "./DetailDokladuKompaktny";
import { KodPohody } from "./KodPohody";
import type { Navrhy } from "./ZauctovaniePanel";
import { HistoriaOdovzdania, OpravitZauctovanie } from "./OdovzdanieDokladu";
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

/**
 * Detail bločku (výdavku) v kompaktnom rozložení — prezeranie s účtovaním
 * priamo na stránke; úprava všetkých údajov ostáva vo formulári (ceruzka).
 * Zmena kódu sa uloží hneď cez tú istú funkciu ako hromadné zaúčtovanie.
 */
export function BlocekDetailKompaktny({
  row,
  nahladUrl,
  kody,
  onZmena,
  onStiahni,
}: {
  row: any;
  nahladUrl: string | null;
  kody: Navrhy | null;
  onZmena: () => void;
  onStiahni: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const navigate = useNavigate();
  const krajina = useKrajinaDane();
  const nacitajMena = useServerFn(menaClenovFirmy);
  const zauctuj = useServerFn(zauctujDokladyFn);
  const [mena, setMena] = useState<Record<string, string>>({});
  const [pohyb, setPohyb] = useState<{ booking_date: string; amount: number } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [ok, setOk] = useState(false);
  const [poznamka, setPoznamka] = useState(row.int_poznamka ?? "");
  const poznamkaUlozena = useRef(row.int_poznamka ?? "");
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

  /**
   * Kód zaúčtovania — tá istá serverová funkcia ako hromadné zaúčtovanie bločkov.
   * Tam prázdne pole nič nemení, preto vymazanie ide výslovne cez `vymazat`.
   */
  async function ulozKod(pole: "predkontacia" | "clenenie" | "kv" | "pokladna", v: string) {
    const prazdne = !v.trim();
    const stlpec = {
      predkontacia: "pohoda_predkontacia",
      clenenie: "pohoda_clenenie_dph",
      kv: "kv_clenenie",
      pokladna: "pohoda_pokladna",
    }[pole];
    if (prazdne && !row[stlpec]) return;
    setUkladam(true);
    try {
      const r = await zauctuj({
        data: (prazdne
          ? { company_id: row.company_id, ids: [row.id], vymazat: [pole] }
          : { company_id: row.company_id, ids: [row.id], [pole]: v }) as any,
      });
      if (r.preskocenych) toast.error(t("Doklad je odovzdaný do Pohody — zmena sa neuložila."));
      else {
        ponukaPravidlaToast(r.ponukaPravidla, t, navigate);
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

  const vstupK = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm";
  const popisK = "mb-1 block text-xs text-muted-foreground";
  const uhradeny =
    row.payment_method === "hotovost" || row.payment_method === "karta" || Boolean(pohyb);
  const ekasaId = String(row.qr_raw ?? "").match(/O-[0-9A-F]{32}/i)?.[0] ?? null;
  const polozky = Array.isArray(row.items) ? row.items : [];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Hlavička + karta úhrady */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] [&>*]:min-w-0">
        <KartaK>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            <div className="space-y-3">
              <UdajK ikona={Store} popis="Obchodník">
                {row.supplier_name || "—"}
              </UdajK>
              <UdajK ikona={Hash} popis="Číslo dokladu">
                {row.document_number || "—"}
              </UdajK>
              <UdajK ikona={FileText} popis="Typ dokladu">
                {t("Bloček")}
              </UdajK>
              <UdajK ikona={UserRound} popis="Uložil">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {ulozil ? <Avatar meno={ulozil} /> : null}
                  <span className="min-w-0 break-words">{ulozil ?? "—"}</span>
                </span>
              </UdajK>
              {spracovanie ? (
                <UdajK ikona={UserCheck} popis="Spracoval">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    {spracoval ? <Avatar meno={spracoval} /> : null}
                    <span className="min-w-0 break-words">{spracoval ?? t("kolega")}</span>
                  </span>
                </UdajK>
              ) : null}
            </div>
            <div className="space-y-3">
              {cas(spracovanie?.kedy) ? (
                <UdajK ikona={CalendarDays} popis="Dátum a čas spracovania">
                  {cas(spracovanie?.kedy)}
                </UdajK>
              ) : null}
              <UdajK ikona={CalendarDays} popis="Vydané">
                {datumNaDoklade(row.issue_date)}
              </UdajK>
              {cas(row.created_at) ? (
                <UdajK ikona={CalendarDays} popis="Dátum a čas nahratia">
                  {cas(row.created_at)}
                </UdajK>
              ) : null}
            </div>
            <div className="space-y-3">
              <UdajK ikona={Wallet} popis="Celková suma">
                <span className="text-xl font-semibold tabular-nums">
                  {formatujMenu(Number(row.total_amount ?? 0), menaDokladu)}
                </span>
              </UdajK>
              <div className="pl-[2.375rem] text-xs text-muted-foreground">
                {t("Bez DPH")} {formatujMenu(Number(row.net_amount ?? 0), menaDokladu)} · {t("DPH")}{" "}
                {formatujMenu(Number(row.vat_amount ?? 0), menaDokladu)}
              </div>
            </div>
          </div>
        </KartaK>
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className={`h-1.5 ${uhradeny ? "bg-primary" : "bg-muted-foreground/40"}`} />
          <div className="space-y-1 p-4">
            {uhradeny ? (
              <div className="flex items-center gap-1.5 text-base font-semibold text-primary">
                <CheckCircle2 className="h-5 w-5" />
                {pohyb
                  ? t("Uhradené z účtu {datum}", { datum: datumNaDoklade(pohyb.booking_date) })
                  : t("Uhradené {ako}", { ako: t(PLATBY[row.payment_method] ?? "").toLowerCase() })}
              </div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">{t("Zostáva k úhrade")}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatujMenu(Number(row.total_amount ?? 0), menaDokladu)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("Platba prevodom — uhradený bude po spárovaní s pohybom na účte.")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Účtovanie priamo v detaile */}
      <KartaK
        id="zauctovanie"
        nadpis="Účtovanie"
        akcia={
          <span className="flex items-center gap-2">
            {zamknute ? (
              <Lock className="h-4 w-4 text-muted-foreground" aria-label={t("Len na čítanie")} />
            ) : null}
            {ukladam ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            {ok ? <Check className="h-4 w-4 text-primary" aria-label={t("Uložené")} /> : null}
          </span>
        }
      >
        {zamknute ? (
          <p className="mb-2 text-xs text-muted-foreground">
            {row.exported_at
              ? t("Doklad je odovzdaný do Pohody — zmeniť sa dá až po vrátení z Pohody.")
              : t("Doklad je zamknutý proti úpravám — najprv ho odomknite.")}
          </p>
        ) : null}
        <HistoriaOdovzdania row={row} druh="doklad" onZmena={onZmena} />
        {row.exported_at && !row.locked_at ? (
          <div className="mb-2 mt-2">
            <OpravitZauctovanie row={row} druh="doklad" onZmena={onZmena} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium">{t("Účtovná poznámka")}</span>
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
              className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-70"
            />
            <span className="block text-right text-[11px] text-muted-foreground">
              {poznamka.length}/200
            </span>
          </label>
          <KomentarDokladu tabulka="expense_documents" id={row.id} komentar={row.komentar} />
        </div>
        <fieldset
          disabled={zamknute}
          className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0"
        >
          <label className="block">
            <span className={popisK}>{t("Dátum daňovej povinnosti")}</span>
            <input
              type="date"
              value={row.issue_date ?? ""}
              onChange={(e) => e.target.value && void ulozStlpec({ issue_date: e.target.value })}
              className={vstupK}
            />
          </label>
          <label className="block">
            <span className={popisK}>{t("Typ platby")}</span>
            <select
              value={row.payment_method ?? ""}
              onChange={(e) =>
                e.target.value && void ulozStlpec({ payment_method: e.target.value })
              }
              className={vstupK}
            >
              {!row.payment_method ? <option value="">{t("Vyberte…")}</option> : null}
              <option value="hotovost">{t("Hotovosťou")}</option>
              <option value="karta">{t("Kartou")}</option>
              <option value="prevod">{t("Prevodom")}</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={popisK}>{t("Predkontácia")}</span>
            <KodPohody
              odkazNaCiselnik
              ariaLabel="Predkontácia"
              value={row.pohoda_predkontacia ?? ""}
              onChange={(v) => void ulozKod("predkontacia", v)}
              moznosti={zoradPodlaDokladu(kody?.predkontacie ?? [], {
                typ: "blocek",
                platba: row.payment_method,
              })}
              placeholder={kody?.predvolenaPredkontacia ?? t("predvolená z nastavení")}
              className={vstupK}
              vyber
            />
          </label>
          {row.payment_method === "hotovost" && (kody?.pokladne?.length ?? 0) > 0 ? (
            <label className="block">
              <span className={popisK}>{t("Pokladňa")}</span>
              <KodPohody
                ariaLabel="Pokladňa"
                value={row.pohoda_pokladna ?? ""}
                onChange={(v) => void ulozKod("pokladna", v)}
                moznosti={kody?.pokladne ?? []}
                placeholder={t("predvolená")}
                className={vstupK}
                vyber
              />
            </label>
          ) : null}
          <label className="block sm:col-span-2">
            <span className={popisK}>{t("Členenie DPH")}</span>
            <KodPohody
              ariaLabel="Členenie DPH"
              value={row.pohoda_clenenie_dph ?? ""}
              onChange={(v) => void ulozKod("clenenie", v)}
              moznosti={kody?.clenenia ?? []}
              placeholder={kody?.predvoleneClenenie ?? t("predvolené z nastavení")}
              className={vstupK}
              vyber
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={popisK}>{t("Členenie KV DPH")}</span>
            <select
              value={row.kv_clenenie ?? ""}
              onChange={(e) => void ulozKod("kv", e.target.value || "auto")}
              className={vstupK}
            >
              <option value="">{t("automaticky (B3 — bloček)")}</option>
              {KV_PRIJATE.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {t(k.nazov)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {!zamknute ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PouzitPredlohu
              companyId={row.company_id}
              druh="blocek"
              onPouzi={async (p) => {
                // Kódy cez zaúčtovanie (história, pravidlá), rad a poznámka priamo.
                const kody = Object.fromEntries(
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
                  if (Object.keys(kody).length)
                    await zauctuj({
                      data: { company_id: row.company_id, ids: [row.id], ...kody } as any,
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
      </KartaK>

      <PrilohyFaktury
        druh="expense"
        dokladId={row.id}
        mozeMenit={!row.exported_at}
        kompaktne
        hlavny={
          row.file_path
            ? {
                nazov: `${row.document_number || t("Bloček")}.${String(row.file_path).split(".").pop() ?? "jpg"}`,
                url: nahladUrl,
                mime: row.file_mime ?? null,
                stiahni: onStiahni,
              }
            : null
        }
      />

      <StranyDokladuK
        companyId={row.company_id}
        dodavatel={{ nazov: row.supplier_name, ico: row.supplier_ico, icDph: row.supplier_ic_dph }}
      />

      <PolozkyK polozky={polozky} mena={menaDokladu} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <KartaK nadpis="Ostatné údaje k bločku">
          <div className="space-y-1 text-sm">
            {[
              ["IČO", row.supplier_ico],
              ["IČ DPH", row.supplier_ic_dph],
              ["Číslo dokladu", row.document_number],
              ["ID bločku (eKasa)", ekasaId],
            ].map(([popis, hodnota]) => (
              <div key={popis} className="flex min-w-0 items-center justify-between gap-3 py-0.5">
                <span className="shrink-0 text-muted-foreground">{t(popis as string)}</span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 break-all text-right">{hodnota || "—"}</span>
                  <Kopirovat hodnota={hodnota as string | null} popis={popis as string} />
                </span>
              </div>
            ))}
          </div>
        </KartaK>
        <SumarK
          rozpis={rozpisBlocku(row)}
          sadzby={sadzbyKrajiny(krajina, row.issue_date)}
          mena={menaDokladu}
          celkom={Number(row.total_amount ?? 0)}
        />
      </div>

      {row.note ? (
        <KartaK nadpis="Poznámka">
          <p className="whitespace-pre-wrap text-sm">{row.note}</p>
        </KartaK>
      ) : null}

      <ZbaleneK nadpis="História dokladu">
        <HistoriaDokladu companyId={row.company_id} agenda="doklad" id={row.id} />
      </ZbaleneK>
      <div id="komentare" className="scroll-mt-24">
        <KomentarePanel companyId={row.company_id} agenda="doklad" id={row.id} />
      </div>
    </div>
  );
}
