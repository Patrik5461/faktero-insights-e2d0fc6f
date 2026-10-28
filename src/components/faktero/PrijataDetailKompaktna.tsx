import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  FileText,
  Hash,
  Pencil,
  Tag,
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
import { rozpisPrijatej } from "@/lib/faktero/prijate-do-pohody";
import { sadzbyKrajiny } from "@/lib/faktero/vat-rates";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { typPrijatejFaktury } from "@/lib/faktero/uhrady-prijatej";
import { zadaj } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import {
  Avatar,
  KartaK,
  PlatbaK,
  PolozkyK,
  StranyDokladuK,
  SumarK,
  UdajK,
  ZbaleneK,
} from "./DetailDokladuKompaktny";
import { KartaUhrady, UhradyOkno, oznacitUhradenu, useUhradyPrijatej } from "./UhradyPrijatej";
import { ZauctovaniePanel } from "./ZauctovaniePanel";
import { PrilohyFaktury } from "./PrilohyFaktury";
import { HistoriaDokladu } from "./HistoriaDokladu";
import { KomentarePanel } from "./KomentarePanel";
import { HromadnyPrikaz } from "./HromadnyPrikaz";
import { PravidloZDokladu } from "./PravidloZDokladu";

/**
 * Detail prijatej faktúry v kompaktnom rozložení — jeden stĺpec kariet:
 * hlavička s kartou úhrady, účtovanie priamo v detaile, prílohy, dodávateľ |
 * odberateľ, položky, platba | sumár, história a komentáre. Údaje aj akcie
 * sú tie isté ako v klasickom rozložení; mení sa len usporiadanie.
 */
export function PrijataDetailKompaktna({
  row,
  nahladUrl,
  navrh,
  onZmena,
  onStiahni,
  onPrepniPolozky,
  hore,
  bokom,
}: {
  row: any;
  nahladUrl: string | null;
  /** Neodsúhlasená samofaktúra — ešte nie je dlh, neplatí sa ani neúčtuje. */
  navrh: boolean;
  onZmena: () => void;
  onStiahni: () => void;
  onPrepniPolozky?: (vypnut: boolean) => void;
  /** Štítky, stav dokladu, samofaktúra, schvaľovanie — nad hlavičkou. */
  hore?: ReactNode;
  /** Zákazka, predĺženie splatnosti, platba cez banku — pod platobnými údajmi. */
  bokom?: ReactNode;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const krajina = useKrajinaDane();
  const nacitajMena = useServerFn(menaClenovFirmy);
  const [mena, setMena] = useState<Record<string, string>>({});
  useEffect(() => {
    nacitajMena({ data: { company_id: row.company_id } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.company_id]);
  const { uhrady, stav, nacitaj } = useUhradyPrijatej(row);
  const [okno, setOkno] = useState(false);
  const [prikaz, setPrikaz] = useState(false);
  const menaDokladu = row.currency ?? "EUR";
  const spracovanie = spracovanieDokladu(row, "prijata");
  const spracoval = menoSpracovatela(spracovanie, mena);
  const ulozil = nahralDokladu(row.source, row.created_by, mena);
  const casSpracovania = spracovanie?.kedy
    ? new Date(spracovanie.kedy).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })
    : null;
  const nahrate = row.created_at
    ? new Date(row.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })
    : null;
  const zamknute = Boolean(row.exported_at || row.locked_at);

  async function upravInterne() {
    const v = await zadaj(t("Interné číslo (číslo dokladu v účtovníctve)"), {
      predvolene: row.pohoda_cislo ?? "",
    });
    if (v === null || v === undefined) return;
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ pohoda_cislo: String(v).trim() || null })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(t("Uložené"));
    onZmena();
  }

  const obnov = () => {
    void nacitaj();
    onZmena();
  };
  const uhradaMozna = !navrh && row.status !== "cancelled" && row.status !== "draft";
  const polozkyVypnute =
    Array.isArray(row.polozky_vypnute) &&
    row.polozky_vypnute.length > 0 &&
    (!Array.isArray(row.items) || row.items.length === 0);
  const polozky = (
    polozkyVypnute ? row.polozky_vypnute : Array.isArray(row.items) ? row.items : []
  ) as any[];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {hore}

      {/* 1. Hlavička + karta úhrady */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] [&>*]:min-w-0">
        <KartaK>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            <div className="space-y-3">
              <UdajK ikona={Hash} popis="Faktúra číslo">
                {row.invoice_number || "—"}
              </UdajK>
              <UdajK
                ikona={Tag}
                popis="Interné číslo"
                doplnok={
                  !row.exported_at ? (
                    <button
                      type="button"
                      onClick={() => void upravInterne()}
                      aria-label={t("Upraviť interné číslo")}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null
                }
              >
                {row.pohoda_cislo || "—"}
              </UdajK>
              <UdajK ikona={FileText} popis="Typ dokladu">
                {t(typPrijatejFaktury(row, krajina))}
              </UdajK>
              <UdajK ikona={UserRound} popis="Uložil">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {ulozil ? <Avatar meno={ulozil} /> : null}
                  <span className="min-w-0 break-words">
                    {ulozil ??
                      (row.source === "mail"
                        ? t("e-mailom")
                        : row.source === "api"
                          ? t("cez API")
                          : "—")}
                  </span>
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
              {casSpracovania ? (
                <UdajK ikona={CalendarDays} popis="Dátum a čas spracovania">
                  {casSpracovania}
                </UdajK>
              ) : null}
              <UdajK ikona={CalendarDays} popis="Dátum vyhotovenia">
                {datumNaDoklade(row.issue_date)}
              </UdajK>
              <UdajK ikona={CalendarDays} popis="Dátum splatnosti">
                {row.due_date ? datumNaDoklade(row.due_date) : "—"}
              </UdajK>
              <UdajK ikona={CalendarDays} popis="Dátum dodania">
                {datumNaDoklade(row.delivery_date ?? row.issue_date)}
              </UdajK>
              {nahrate ? (
                <UdajK ikona={CalendarDays} popis="Dátum a čas nahratia">
                  {nahrate}
                </UdajK>
              ) : null}
            </div>
            <div className="space-y-3">
              <UdajK ikona={Wallet} popis="Celková suma">
                <span className="text-xl font-semibold tabular-nums">
                  {formatujMenu(Number(row.amount_total ?? 0), menaDokladu)}
                </span>
              </UdajK>
              <div className="pl-[2.375rem] text-xs text-muted-foreground">
                {t("Bez DPH")} {formatujMenu(Number(row.amount_without_vat ?? 0), menaDokladu)} ·{" "}
                {t("DPH")} {formatujMenu(Number(row.vat_amount ?? 0), menaDokladu)}
              </div>
              {row.type === "proforma" ? (
                <p className="text-xs text-muted-foreground">
                  {t("Nie je daňový doklad — daň prinesie ostrá faktúra.")}
                </p>
              ) : null}
            </div>
          </div>
        </KartaK>
        {uhradaMozna ? (
          <KartaUhrady
            row={row}
            stav={stav}
            onOznacit={async () => {
              const ok = await oznacitUhradenu(row, stav.zostava, t, () =>
                zadaj(
                  t("Dátum úhrady"),
                  { predvolene: new Date().toLocaleDateString("sv-SE"), typ: "date" },
                  { potvrdit: t("Označiť ako uhradenú") },
                ),
              );
              if (ok) obnov();
            }}
            onUhradit={row.supplier_iban ? () => setPrikaz(true) : undefined}
            onPridat={() => setOkno(true)}
          />
        ) : null}
      </div>

      {/* 2. Účtovanie priamo v detaile */}
      {row.type === "regular" && !navrh ? (
        <ZauctovaniePanel
          row={row}
          onZmena={onZmena}
          kompaktne
          pravidloZDokladu={
            !zamknute ? (
              <PravidloZDokladu
                companyId={row.company_id}
                zaklad={{
                  druh: "prijata",
                  nazov: row.supplier_name,
                  ico: row.supplier_ico,
                  odosielatel: row.odosielatel_mailu ?? null,
                  vs: row.variable_symbol,
                  platba: row.payment_method,
                  predkontacia: row.pohoda_predkontacia ?? "",
                  clenenie: row.pohoda_clenenie_dph ?? "",
                  kv: row.kv_clenenie ?? "",
                  kategoria: row.category ?? "",
                }}
              />
            ) : null
          }
        />
      ) : null}

      {/* 3. Prílohy */}
      <PrilohyFaktury
        druh="purchase_invoice"
        dokladId={row.id}
        mozeMenit={!row.exported_at}
        kompaktne
        hlavny={
          row.file_path
            ? {
                nazov: `${row.invoice_number ?? t("Doklad")}.${String(row.file_path).split(".").pop() ?? "pdf"}`,
                url: nahladUrl,
                mime: row.file_mime ?? null,
                stiahni: onStiahni,
              }
            : null
        }
      />

      {/* 4. Dodávateľ | Odberateľ */}
      <StranyDokladuK
        companyId={row.company_id}
        dodavatel={{
          nazov: row.supplier_name,
          ulica: row.supplier_street,
          mesto: row.supplier_city,
          psc: row.supplier_zip,
          krajina: row.supplier_country,
          ico: row.supplier_ico,
          dic: row.supplier_dic,
          icDph: row.supplier_ic_dph,
        }}
      />

      {/* 5. Položky */}
      <PolozkyK
        polozky={polozky}
        mena={menaDokladu}
        vypnute={polozkyVypnute}
        akcia={
          onPrepniPolozky && !row.samofakturacia && !row.exported_at && polozky.length ? (
            <button
              type="button"
              onClick={() => onPrepniPolozky(!polozkyVypnute)}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary"
              title={
                polozkyVypnute
                  ? t("Vrátiť položky — rozúčtovanie a export ich znova použijú")
                  : t("Zle vyčítané položky — účtovať len podľa súčtov a rozpisu DPH v hlavičke")
              }
            >
              {polozkyVypnute ? t("Zapnúť položky") : t("Vypnúť položky")}
            </button>
          ) : null
        }
      />

      {/* 6. Platba | Sumár */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <PlatbaK
          iban={row.supplier_iban}
          vs={row.variable_symbol}
          ks={row.constant_symbol}
          ss={row.specific_symbol}
          doplnok={bokom}
        />
        <SumarK
          rozpis={rozpisPrijatej(row)}
          sadzby={sadzbyKrajiny(krajina, row.delivery_date ?? row.issue_date)}
          mena={menaDokladu}
          celkom={Number(row.amount_total ?? 0)}
        />
      </div>

      {row.note ? (
        <KartaK nadpis="Poznámka">
          <p className="whitespace-pre-wrap text-sm">{row.note}</p>
        </KartaK>
      ) : null}

      {/* 7. História (zbalená) a komentáre */}
      {!navrh ? (
        <ZbaleneK nadpis="História dokladu">
          <HistoriaDokladu companyId={row.company_id} agenda="prijata" id={row.id} />
        </ZbaleneK>
      ) : null}
      {!navrh ? (
        <div id="komentare" className="scroll-mt-24">
          <KomentarePanel companyId={row.company_id} agenda="prijata" id={row.id} />
        </div>
      ) : null}

      {okno ? (
        <UhradyOkno
          row={row}
          uhrady={uhrady}
          stav={stav}
          onClose={() => setOkno(false)}
          onZmena={obnov}
        />
      ) : null}
      {prikaz ? (
        <HromadnyPrikaz
          companyId={row.company_id}
          faktury={[row]}
          onClose={() => setPrikaz(false)}
        />
      ) : null}
    </div>
  );
}
