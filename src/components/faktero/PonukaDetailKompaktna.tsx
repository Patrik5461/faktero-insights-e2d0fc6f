import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujCislo } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";
import {
  Hodnota,
  NahladKompaktny,
  PanelKompaktny,
  RozlozenieKompaktne,
  Rozsirene,
  Sekcia,
  TLACIDLO_DRUHE,
  ZoznamPoloziek,
  type PolozkaKompaktna,
  type SuborKompaktny,
} from "./KompaktnyDetail";

/**
 * Detail cenovej ponuky v kompaktnom rozložení — ten istý vzhľad ako detail
 * faktúry a nespracovaný doklad (KompaktnyDetail): náhľad PDF ponuky s
 * nástrojmi na jednej strane, panel 400 px so sekciami na druhej. Ponuka sa
 * neúčtuje, preto pätička panelu nesie len odkaz na faktúru z ponuky.
 */
export function PonukaDetailKompaktna({
  q,
  polozky,
  stav,
  subor,
  hore,
  prilohy,
}: {
  q: any;
  polozky: PolozkaKompaktna[];
  /** Odznak stavu ponuky (Koncept, Odoslaná…). */
  stav: ReactNode;
  /** PDF ponuky: `undefined` = načítava sa, `null` = ešte nie je vygenerované. */
  subor: SuborKompaktny | null | undefined;
  /** Upozornenia nad sekciami (konvertovaná ponuka, odpoveď odberateľa). */
  hore?: ReactNode;
  prilohy: ReactNode;
}) {
  const { t } = useT();
  const mena = q.currency ?? "EUR";
  const zlava = Number(q.discount_total ?? 0);
  const pata = q.converted_invoice_id ? (
    <Link to="/faktury/$id" params={{ id: q.converted_invoice_id }} className={TLACIDLO_DRUHE}>
      <ExternalLink className="h-4 w-4" /> {t("Otvoriť faktúru →")}
    </Link>
  ) : null;

  return (
    <RozlozenieKompaktne
      nahlad={
        <NahladKompaktny
          subor={subor}
          prazdne="Ponuka ešte nemá PDF — vygenerujte ho tlačidlom Vygenerovať PDF v hlavičke."
        />
      }
    >
      <PanelKompaktny pata={pata} data-detail-ponuky="">
        {hore ? <div className="m-4 space-y-3 [&>*]:mb-0!">{hore}</div> : null}

        <Sekcia nadpis="Základné údaje" akcia={stav}>
          <Hodnota popis="Typ dokladu">{t("Cenová ponuka")}</Hodnota>
          <Hodnota popis="Číslo ponuky">{q.quote_number}</Hodnota>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="Dátum vystavenia">{datumNaDoklade(q.issue_date)}</Hodnota>
            <Hodnota popis="Platnosť do">
              {q.valid_until ? datumNaDoklade(q.valid_until) : null}
            </Hodnota>
          </div>
        </Sekcia>

        <Sekcia nadpis="Čiastka a DPH">
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="Celková suma">
              <span className="tabular-nums">{formatujCislo(Number(q.total ?? 0), 2)}</span>
            </Hodnota>
            <Hodnota popis="Mena">{mena}</Hodnota>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="Bez DPH">
              <span className="tabular-nums">{formatujCislo(Number(q.subtotal ?? 0), 2)}</span>
            </Hodnota>
            <Hodnota popis="DPH">
              <span className="tabular-nums">{formatujCislo(Number(q.vat_total ?? 0), 2)}</span>
            </Hodnota>
          </div>
          {zlava > 0 ? (
            <Hodnota popis="Zľava">
              <span className="tabular-nums">−{formatujCislo(zlava, 2)}</span>
            </Hodnota>
          ) : null}
        </Sekcia>

        <Sekcia nadpis="Odberateľ">
          <Hodnota popis="Názov">{q.customer_name}</Hodnota>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="IČO">{q.customer_ico}</Hodnota>
            <Hodnota popis="DIČ">{q.customer_dic}</Hodnota>
          </div>
          <Rozsirene>
            <Hodnota popis="Ulica a číslo">{q.customer_street}</Hodnota>
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <Hodnota popis="Mesto">{q.customer_city}</Hodnota>
              <Hodnota popis="PSČ">{q.customer_zip}</Hodnota>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Hodnota popis="Krajina">{q.customer_country}</Hodnota>
              <Hodnota popis="E-mail">{q.customer_email}</Hodnota>
            </div>
          </Rozsirene>
        </Sekcia>

        {q.notes ? (
          <Sekcia nadpis="Poznámka">
            <p className="whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-sm">
              {q.notes}
            </p>
          </Sekcia>
        ) : null}

        <Sekcia nadpis="Položky">
          <ZoznamPoloziek polozky={polozky} mena={mena} />
        </Sekcia>

        {prilohy}
      </PanelKompaktny>
    </RozlozenieKompaktne>
  );
}
