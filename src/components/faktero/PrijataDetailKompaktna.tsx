import { useEffect, useState, type ReactNode } from "react";
import { vsPrijatej } from "@/lib/faktero/variabilny-symbol";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { menoSpracovatela, nahralDokladu, spracovanieDokladu } from "@/lib/faktero/spracoval";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujCislo } from "@/lib/faktero/mena";
import { formatujIban, upravIban } from "@/lib/faktero/platobny-ucet";
import { rozpisPrijatej } from "@/lib/faktero/prijate-do-pohody";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { typPrijatejFaktury } from "@/lib/faktero/uhrady-prijatej";
import { zadaj } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { ZbaleneK } from "./DetailDokladuKompaktny";
import {
  BEZ_RAMU,
  Hodnota,
  NahladKompaktny,
  PanelKompaktny,
  RozlozenieKompaktne,
  Rozsirene,
  Sekcia,
  ZoznamPoloziek,
} from "./KompaktnyDetail";
import { KartaUhrady, UhradyOkno, oznacitUhradenu, useUhradyPrijatej } from "./UhradyPrijatej";
import { ZauctovaniePanel } from "./ZauctovaniePanel";
import { PrilohyFaktury } from "./PrilohyFaktury";
import { HistoriaDokladu } from "./HistoriaDokladu";
import { KomentarePanel } from "./KomentarePanel";
import { KomentarDokladu } from "./StavDokladu";
import { HromadnyPrikaz } from "./HromadnyPrikaz";
import { PravidloZDokladu } from "./PravidloZDokladu";

/**
 * Detail prijatej faktúry v kompaktnom rozložení — ten istý vzhľad ako
 * nespracovaný doklad (NespracovanyKompaktny): veľký náhľad dokladu s
 * nástrojmi na jednej strane, úzky panel so sekciami na druhej (Základné
 * údaje so zaúčtovaním hneď za typom dokladu, Čiastka a DPH, Dodávateľ,
 * Platobné údaje, Úhrada, Poznámka, Položky), Zaúčtovať v pätičke panelu.
 * Údaje aj akcie sú tie isté ako v klasickom rozložení.
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
  // Pätička panelu a sekcia Poznámka — tlačidlá a účtovnú poznámku tam presunie ZauctovaniePanel.
  const [pataEl, setPataEl] = useState<HTMLDivElement | null>(null);
  const [poznamkaEl, setPoznamkaEl] = useState<HTMLDivElement | null>(null);
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

  const pdf = String(row.file_mime ?? "").includes("pdf");
  const nazovSuboru = `${row.invoice_number ?? t("Doklad")}.${
    String(row.file_path ?? "")
      .split(".")
      .pop() || "pdf"
  }`;
  const rozpis = rozpisPrijatej(row);
  const celkom = Number(row.amount_total ?? 0);
  const sumaSedi =
    Math.abs(celkom) > 0 &&
    Math.abs(Number(row.amount_without_vat ?? 0) + Number(row.vat_amount ?? 0) - celkom) < 0.015;
  const ibanOk = Boolean(row.supplier_iban && upravIban(row.supplier_iban));

  return (
    <RozlozenieKompaktne
      nahlad={
        <NahladKompaktny
          subor={
            row.file_path
              ? nahladUrl
                ? {
                    url: nahladUrl,
                    nazov: nazovSuboru,
                    mime: row.file_mime ?? (pdf ? "application/pdf" : null),
                  }
                : undefined
              : null
          }
          prazdne="K dokladu nie je súbor na náhľad."
        />
      }
    >
      <PanelKompaktny
        pata={<div ref={setPataEl} className="space-y-2 empty:hidden" />}
        data-detail-prijatej=""
      >
        {hore ? <div className="m-4 space-y-3 [&>*]:mb-0!">{hore}</div> : null}

        <Sekcia nadpis="Základné údaje" id="zauctovanie">
          <Hodnota popis="Typ dokladu">{t(typPrijatejFaktury(row, krajina))}</Hodnota>
          {/* Zaúčtovanie hneď za typom dokladu — ako pri nespracovanom doklade. */}
          {row.type === "regular" && !navrh ? (
            <ZauctovaniePanel
              row={row}
              onZmena={onZmena}
              kompaktne
              vPaneli={{ pata: pataEl, poznamka: poznamkaEl }}
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
          <Hodnota popis="Číslo faktúry">{row.invoice_number}</Hodnota>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="Dátum vydania">{datumNaDoklade(row.issue_date)}</Hodnota>
            <Hodnota popis="Dátum splatnosti">
              {row.due_date ? datumNaDoklade(row.due_date) : null}
            </Hodnota>
          </div>
          <Hodnota popis="Dátum dodania (DUZP)">
            {datumNaDoklade(row.delivery_date ?? row.issue_date)}
          </Hodnota>
          <Rozsirene>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Hodnota popis="Interné číslo">{row.pohoda_cislo || null}</Hodnota>
              </div>
              {!row.exported_at ? (
                <button
                  type="button"
                  onClick={() => void upravInterne()}
                  aria-label={t("Upraviť interné číslo")}
                  className="mt-1 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <Hodnota popis="Uložil">
              {ulozil ??
                (row.source === "mail"
                  ? t("e-mailom")
                  : row.source === "api"
                    ? t("cez API")
                    : null)}
            </Hodnota>
            {spracovanie ? <Hodnota popis="Spracoval">{spracoval ?? t("kolega")}</Hodnota> : null}
            {casSpracovania ? (
              <Hodnota popis="Dátum a čas spracovania">{casSpracovania}</Hodnota>
            ) : null}
            {nahrate ? <Hodnota popis="Dátum a čas nahratia">{nahrate}</Hodnota> : null}
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
            <div key={`${r.sadzba}-${r.pdp ? 1 : 0}`} className="grid grid-cols-2 gap-3">
              <Hodnota
                popis={
                  r.pdp
                    ? t("Základ dane {sadzba} % (PDP)", { sadzba: r.sadzba })
                    : t("Základ dane {sadzba} %", { sadzba: r.sadzba })
                }
              >
                <span className="tabular-nums">{formatujCislo(r.zaklad, 2)}</span>
              </Hodnota>
              <Hodnota popis={t("Daň {sadzba} %", { sadzba: r.sadzba })}>
                <span className="tabular-nums">{formatujCislo(r.dph, 2)}</span>
              </Hodnota>
            </div>
          ))}
          {row.type === "proforma" ? (
            <p className="text-xs text-muted-foreground">
              {t("Nie je daňový doklad — daň prinesie ostrá faktúra.")}
            </p>
          ) : null}
        </Sekcia>

        <Sekcia nadpis="Dodávateľ">
          <Hodnota popis="Názov">{row.supplier_name}</Hodnota>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="IČO">{row.supplier_ico}</Hodnota>
            <Hodnota popis="IČ DPH">{row.supplier_ic_dph}</Hodnota>
          </div>
          {/* Adresa, krajina a DIČ sú menej dôležité — pod „Zobraziť viac“. */}
          <Rozsirene>
            <Hodnota popis="Ulica a číslo">{row.supplier_street}</Hodnota>
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <Hodnota popis="Mesto">{row.supplier_city}</Hodnota>
              <Hodnota popis="PSČ">{row.supplier_zip}</Hodnota>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Hodnota popis="Krajina">{row.supplier_country}</Hodnota>
              <Hodnota popis="DIČ">{row.supplier_dic}</Hodnota>
            </div>
          </Rozsirene>
        </Sekcia>

        <Sekcia nadpis="Platobné údaje">
          <Hodnota popis="Variabilný symbol">{vsPrijatej(row) || null}</Hodnota>
          <Hodnota popis="IBAN" ok={ibanOk}>
            {row.supplier_iban ? (
              <span className="font-mono text-xs">{formatujIban(row.supplier_iban)}</span>
            ) : null}
          </Hodnota>
          <Rozsirene>
            <Hodnota popis="Konštantný symbol">{row.constant_symbol}</Hodnota>
            <Hodnota popis="Špecifický symbol">{row.specific_symbol}</Hodnota>
          </Rozsirene>
          {bokom}
        </Sekcia>

        {uhradaMozna ? (
          <Sekcia nadpis="Úhrada">
            <div className={`${BEZ_RAMU} [&>*>div:last-child]:px-0!`}>
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
            </div>
          </Sekcia>
        ) : null}

        <Sekcia nadpis="Poznámka">
          {/* Účtovnú poznámku sem presunie panel zaúčtovania (vPaneli.poznamka). */}
          <div ref={setPoznamkaEl} className="empty:hidden" />
          <KomentarDokladu tabulka="purchase_invoices" id={row.id} komentar={row.komentar} />
          {row.note ? (
            <p className="whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-sm">
              {row.note}
            </p>
          ) : null}
        </Sekcia>

        <Sekcia
          nadpis="Položky"
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
        >
          {polozkyVypnute ? (
            <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t("vypnuté")}
            </span>
          ) : null}
          <ZoznamPoloziek polozky={polozky} mena={menaDokladu} vypnute={polozkyVypnute} />
        </Sekcia>

        {/* Karty, ktoré majú vlastný nadpis — v paneli bez druhého rámu; dlaždice príloh po troch. */}
        <div className={`border-b border-border px-4 py-4 sm:[&_ul]:grid-cols-3! ${BEZ_RAMU}`}>
          <PrilohyFaktury
            druh="purchase_invoice"
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
        {!navrh ? (
          <div
            id="komentare"
            className={`scroll-mt-24 border-b border-border px-4 py-4 ${BEZ_RAMU}`}
          >
            <KomentarePanel companyId={row.company_id} agenda="prijata" id={row.id} />
          </div>
        ) : null}
        {!navrh ? (
          <div className={BEZ_RAMU}>
            <ZbaleneK nadpis="História dokladu">
              <HistoriaDokladu companyId={row.company_id} agenda="prijata" id={row.id} />
            </ZbaleneK>
          </div>
        ) : null}
      </PanelKompaktny>

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
    </RozlozenieKompaktne>
  );
}
