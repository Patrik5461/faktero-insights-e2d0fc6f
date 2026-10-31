import { useCallback, useEffect, useState, type ReactNode } from "react";
import { vsVystavenej } from "@/lib/faktero/variabilny-symbol";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Landmark } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { zrusParovanie } from "@/lib/faktero/parovanie.functions";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujCislo, formatujMenu } from "@/lib/faktero/mena";
import { formatujIban, sUctomFaktury, upravIban } from "@/lib/faktero/platobny-ucet";
import { dniPoSplatnosti } from "@/lib/faktero/uhrady-prijatej";
import type { UdajeUctovnika } from "./UdajePreUctovnika";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import {
  BEZ_RAMU,
  Hodnota,
  NahladKompaktny,
  PanelKompaktny,
  RozlozenieKompaktne,
  Rozsirene,
  Sekcia,
  ZoznamPoloziek,
  type PolozkaKompaktna,
  type SuborKompaktny,
} from "./KompaktnyDetail";
import {
  PataZauctovaniaVystavenej,
  PoliaZauctovaniaVystavenej,
  StavZauctovaniaVystavenej,
  UctovnaPoznamkaVystavenej,
  useZauctovanieVystavenej,
} from "./ZauctovanieVystavenejPanel";
import { KomentarDokladu } from "./StavDokladu";

type Platba = {
  id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  bank_transaction_id: string | null;
};
type Pohyb = {
  id: string;
  booking_date: string;
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  counterparty_iban: string | null;
};

/** Položka faktúry tak, ako sa ukazuje (dobropis kladne — `polozkaNaZobrazenie`). */
export type PolozkaVystavenej = PolozkaKompaktna;

/** Poradie sekcií panelu — rovnaké ako pri nespracovanom doklade, navyše úhrada a prílohy. */
export const SEKCIE_VYSTAVENEJ = [
  "Základné údaje",
  "Čiastka a DPH",
  "Odberateľ",
  "Platobné údaje",
  "Úhrada",
  "Poznámka",
  "Položky",
] as const;

/**
 * Detail vystavenej a zálohovej faktúry v kompaktnom rozložení — ten istý
 * vzhľad ako nespracovaný doklad (NespracovanyKompaktny): veľký náhľad PDF
 * s nástrojmi na jednej strane, úzky panel so sekciami na druhej (Základné
 * údaje so zaúčtovaním hneď za typom dokladu, Čiastka a DPH, Odberateľ,
 * Platobné údaje, Úhrada, Poznámka, Položky) a tlačidlá zaúčtovania stále
 * na spodku panelu. Údaje faktúry sú len na čítanie — menia sa cez Opraviť
 * faktúru, lebo sú aj v PDF, ktoré má odberateľ.
 */
export function VystavenaDetailKompaktna({
  inv,
  company,
  u,
  poSplatnosti,
  polozky,
  nahlad,
  upozornenie,
  stitky,
  prilohy,
  platbaDoplnok,
  dalsie,
  komentare,
  historia,
  zamknuteObdobie,
  onStiahnut,
  onUhradena,
  onNeuhradena,
  onZmena,
}: {
  inv: any;
  company: any;
  /** Tie isté údaje, z ktorých kreslí kartu „Údaje pre účtovníka“. */
  u: UdajeUctovnika;
  poSplatnosti: boolean;
  polozky: PolozkaVystavenej[];
  /** PDF faktúry; `null` = náhľad je skrytý. */
  nahlad: { subor: SuborKompaktny | null | undefined; onSkryt: () => void } | null;
  /** Koncept, stav eFaktúry, schvaľovanie, chýbajúci IBAN — navrchu panelu. */
  upozornenie?: ReactNode;
  /** Štítky a stav dokladu. */
  stitky?: ReactNode;
  prilohy: ReactNode;
  /** Výber účtu, predĺženie splatnosti, chýbajúci IBAN — pod platobnými údajmi. */
  platbaDoplnok?: ReactNode;
  /** Zálohy, sklad, zákazka, Zásielkovňa, § 25a, schvaľovanie. */
  dalsie?: ReactNode;
  komentare: ReactNode;
  historia: ReactNode;
  /** Dátum faktúry je v uzavretom období. */
  zamknuteObdobie?: boolean;
  /** Stiahnutie XML pre Pohodu (zapíše faktúru ako odovzdanú). */
  onStiahnut: () => Promise<void> | void;
  onUhradena: () => void;
  onNeuhradena: () => void;
  /** Detail sa načíta znova. */
  onZmena: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const nacitajMena = useServerFn(menaClenovFirmy);
  const rozparuj = useServerFn(zrusParovanie);
  const z = useZauctovanieVystavenej({ inv, onZmena, onStiahnut });
  const [mena, setMena] = useState<Record<string, string>>({});
  const [platby, setPlatby] = useState<Platba[]>([]);
  const [pohyby, setPohyby] = useState<Pohyb[]>([]);

  useEffect(() => {
    nacitajMena({ data: { company_id: inv.company_id } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.company_id]);

  /* Úhrady faktúry a pohyby z banky, ktoré ju uhradili. */
  const nacitajUhrady = useCallback(async () => {
    const [{ data: p }, { data: b }] = await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, paid_at, method, bank_transaction_id")
        .eq("invoice_id", inv.id)
        .order("paid_at"),
      supabase
        .from("bank_transactions")
        .select(
          "id, booking_date, amount, currency, variable_symbol, counterparty, counterparty_iban",
        )
        .eq("matched_invoice_id", inv.id)
        .order("booking_date"),
    ]);
    setPlatby((p ?? []) as Platba[]);
    setPohyby((b ?? []) as Pohyb[]);
  }, [inv.id]);
  useEffect(() => {
    void nacitajUhrady();
    // Po označení úhrady sa mení stav aj dátum — načíta sa znova.
  }, [nacitajUhrady, inv.status, inv.paid_at]);

  const naZobr = u.naZobrazenie ?? ((n: number) => n);
  const menaDokladu = u.mena ?? "EUR";
  const suma = (n: number) => formatujMenu(naZobr(n), menaDokladu);
  const vystavil = inv.created_by ? (mena[inv.created_by] ?? null) : null;
  const zauctoval = inv.zauctoval ? (mena[inv.zauctoval] ?? null) : null;
  const vytvorene = inv.created_at
    ? new Date(inv.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })
    : null;
  const iban = sUctomFaktury(company ?? {}, inv).iban ?? null;
  const ibanCisty = iban ? String(iban).replace(/\s+/g, "").toUpperCase() : null;
  const uhradene = platby.reduce((s, p) => s + Number(p.amount || 0), 0);
  const kUhrade = u.kUhrade ?? u.spolu;
  // Zelená fajka ako pri nespracovanom doklade: základ + DPH = celková suma.
  const sumaSedi = Math.abs(u.spolu) > 0 && Math.abs(u.zaklad + u.dph - u.spolu) < 0.015;
  const cudzia = u.kurz != null && Number(u.kurz) > 0 && menaDokladu !== "EUR";
  const zmenitOdberatela =
    inv.status !== "cancelled" ? (
      <Link
        to="/faktury/$id/upravit"
        params={{ id: inv.id }}
        className="text-sm text-primary hover:underline"
      >
        {t("Zmeniť")}
      </Link>
    ) : null;
  const lenCitanie = t("Mení sa cez Opraviť faktúru");

  function spravovatUhrady() {
    document
      .getElementById("sparovane-pohyby")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function neuhradena() {
    // Úhradu z banky drží spárovaný pohyb — tú treba zrušiť pri ňom, inak by sa vrátila.
    if (platby.some((p) => p.bank_transaction_id)) {
      toast.info(t("Úhrada je z banky — zrušte väzbu pri spárovanom pohybe."));
      spravovatUhrady();
      return;
    }
    onNeuhradena();
  }

  async function zrusVazbu(p: Pohyb) {
    if (!(await potvrd(t("Zrušiť väzbu faktúry na tento pohyb? Faktúra bude znova otvorená."))))
      return;
    try {
      await rozparuj({ data: { companyId: inv.company_id, transactionId: p.id } });
      toast.success(t("Párovanie zrušené, faktúra je znovu otvorená."));
      await nacitajUhrady();
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa zrušiť párovanie."));
    }
  }

  const pata = <PataZauctovaniaVystavenej inv={inv} z={z} onZmena={onZmena} />;
  // Koncept nemá čo zaúčtovať — pätička bez tlačidiel sa nekreslí.
  const pataPrazdna = inv.status === "draft";

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
      <PanelKompaktny pata={pataPrazdna ? null : pata} data-detail-vystavenej="">
        {upozornenie ? <div className="m-4 space-y-3 [&>*]:mb-0!">{upozornenie}</div> : null}

        <Sekcia
          nadpis="Základné údaje"
          id="zauctovanie"
          akcia={<StavZauctovaniaVystavenej inv={inv} z={z} />}
        >
          <Hodnota popis="Typ dokladu">{u.druh}</Hodnota>
          {/* Zaúčtovanie hneď za typom dokladu — ako pri nespracovanom doklade. */}
          <PoliaZauctovaniaVystavenej
            inv={inv}
            z={z}
            zamknuteObdobie={zamknuteObdobie}
            onZmena={onZmena}
          />
          <Hodnota popis={inv.type === "proforma" ? "Číslo zálohovej faktúry" : "Číslo faktúry"}>
            {inv.invoice_number}
          </Hodnota>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="Dátum vystavenia" title={lenCitanie}>
              {datumNaDoklade(inv.issue_date)}
            </Hodnota>
            <Hodnota
              popis="Dátum splatnosti"
              title={lenCitanie}
              className={poSplatnosti ? "text-destructive" : ""}
            >
              {u.splatnost}
            </Hodnota>
          </div>
          <Hodnota popis="Dátum dodania (DUZP)" title={lenCitanie}>
            {datumNaDoklade(inv.delivery_date ?? inv.issue_date)}
          </Hodnota>
          <Rozsirene>
            <Hodnota popis="Interné číslo">{z.vPohode?.cislo ?? null}</Hodnota>
            <Hodnota popis="Vystavil">
              {vystavil ?? (inv.source === "api" ? t("cez API") : null)}
            </Hodnota>
            {inv.zauctoval ? <Hodnota popis="Spracoval">{zauctoval ?? t("kolega")}</Hodnota> : null}
            <Hodnota popis="Dátum vytvorenia">{vytvorene}</Hodnota>
          </Rozsirene>
        </Sekcia>

        <Sekcia nadpis="Čiastka a DPH" ok={sumaSedi}>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="Celková suma" title={lenCitanie}>
              <span className="tabular-nums">{formatujCislo(naZobr(u.spolu), 2)}</span>
            </Hodnota>
            <Hodnota popis="Mena">{menaDokladu}</Hodnota>
          </div>
          {u.rozpis.map((r) => (
            <div key={`${r.sadzba}-${r.prenesenie ? 1 : 0}`} className="grid grid-cols-2 gap-3">
              <Hodnota
                popis={
                  r.prenesenie
                    ? t("Základ dane {sadzba} % (PDP)", { sadzba: r.sadzba })
                    : t("Základ dane {sadzba} %", { sadzba: r.sadzba })
                }
              >
                <span className="tabular-nums">{formatujCislo(naZobr(r.zaklad), 2)}</span>
              </Hodnota>
              <Hodnota popis={t("Daň {sadzba} %", { sadzba: r.sadzba })}>
                <span className="tabular-nums">{formatujCislo(naZobr(r.dan), 2)}</span>
              </Hodnota>
            </div>
          ))}
          {cudzia ? (
            <Hodnota popis="Kurz">
              {formatujCislo(Number(u.kurz), 2, 4)}
              {u.kurzDatum ? ` (${datumNaDoklade(u.kurzDatum)})` : ""}
            </Hodnota>
          ) : null}
          <div className="space-y-1 text-sm">
            {u.zlava ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("Zľava")}</span>
                <span className="tabular-nums">−{formatujMenu(u.zlava, menaDokladu)}</span>
              </div>
            ) : null}
            {u.zaloha ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("Zúčtovaná záloha")}</span>
                <span className="tabular-nums">−{formatujMenu(u.zaloha, menaDokladu)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">
                {u.uhrada.uhradena ? t("Uhradené") : t("Suma na úhradu")}
              </span>
              <span className="text-lg font-semibold tabular-nums">{suma(kUhrade)}</span>
            </div>
          </div>
          {u.rezimy.length ? (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {u.rezimy.map((r) => (
                <li key={r}>{t(r)}</li>
              ))}
            </ul>
          ) : null}
          {inv.type === "proforma" ? (
            <p className="text-xs text-muted-foreground">
              {t("Nie je daňový doklad — daň prinesie ostrá faktúra.")}
            </p>
          ) : null}
        </Sekcia>

        <Sekcia nadpis="Odberateľ" akcia={zmenitOdberatela}>
          <Hodnota popis="Názov">{inv.customer_name}</Hodnota>
          <div className="grid grid-cols-2 gap-3">
            <Hodnota popis="IČO">{inv.customer_ico}</Hodnota>
            <Hodnota popis="IČ DPH">{inv.customer_ic_dph}</Hodnota>
          </div>
          {/* Adresa, krajina, DIČ a e-mail sú menej dôležité — pod „Zobraziť viac“. */}
          <Rozsirene>
            <Hodnota popis="Ulica a číslo">{inv.customer_street}</Hodnota>
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <Hodnota popis="Mesto">{inv.customer_city}</Hodnota>
              <Hodnota popis="PSČ">{inv.customer_zip}</Hodnota>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Hodnota popis="Krajina">{inv.customer_country}</Hodnota>
              <Hodnota popis="DIČ">{inv.customer_dic}</Hodnota>
            </div>
            <Hodnota popis="E-mail">{inv.customer_email}</Hodnota>
          </Rozsirene>
        </Sekcia>

        <Sekcia nadpis="Platobné údaje">
          <Hodnota popis="Variabilný symbol">{vsVystavenej(inv) || null}</Hodnota>
          <Hodnota popis="IBAN" ok={Boolean(ibanCisty && upravIban(ibanCisty))}>
            {ibanCisty ? (
              <span className="font-mono text-xs">{formatujIban(ibanCisty)}</span>
            ) : null}
          </Hodnota>
          <Hodnota popis="Spôsob úhrady">{u.formaUhrady}</Hodnota>
          <Rozsirene>
            <Hodnota popis="Konštantný symbol">{inv.constant_symbol}</Hodnota>
            <Hodnota popis="Špecifický symbol">{inv.specific_symbol}</Hodnota>
          </Rozsirene>
          {platbaDoplnok ? <div className="space-y-2 text-sm">{platbaDoplnok}</div> : null}
        </Sekcia>

        {u.uhrada.bezUhrady && !pohyby.length ? null : (
          <Sekcia nadpis="Úhrada" id="sparovane-pohyby">
            {u.uhrada.bezUhrady ? null : (
              <StavUhrady
                inv={inv}
                u={u}
                platby={platby}
                uhradene={uhradene}
                poSplatnosti={poSplatnosti}
                onUhradena={onUhradena}
                onNeuhradena={() => void neuhradena()}
              />
            )}
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t("Spárované pohyby")}</span>
                <Link
                  to="/bankove-ucty/transakcie"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Landmark className="h-3.5 w-3.5" /> {t("Bankové pohyby")}
                </Link>
              </div>
              {pohyby.length ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {pohyby.map((p) => (
                    <li key={p.id} className="space-y-1 px-3 py-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-words">
                          {p.counterparty || "—"}
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {datumNaDoklade(p.booking_date)}
                            {p.variable_symbol ? ` · ${t("VS")} ${p.variable_symbol}` : ""}
                          </span>
                          {p.counterparty_iban ? (
                            <span className="block font-mono text-xs text-muted-foreground">
                              {formatujIban(p.counterparty_iban)}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatujMenu(Number(p.amount), p.currency || menaDokladu)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void zrusVazbu(p)}
                        className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                      >
                        {t("Zrušiť väzbu")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("Faktúra zatiaľ nemá spárovaný pohyb z banky.")}
                </p>
              )}
            </div>
          </Sekcia>
        )}

        <Sekcia nadpis="Poznámka">
          <UctovnaPoznamkaVystavenej inv={inv} z={z} />
          <KomentarDokladu tabulka="invoices" id={inv.id} komentar={inv.komentar} />
          {inv.notes ? (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t("Poznámka na faktúre")}</div>
              <p className="whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-sm">
                {inv.notes}
              </p>
            </div>
          ) : null}
        </Sekcia>

        <Sekcia nadpis="Položky">
          {inv.intro_note ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{inv.intro_note}</p>
          ) : null}
          <ZoznamPoloziek
            polozky={polozky}
            mena={menaDokladu}
            prenesenie={Boolean(inv.reverse_charge)}
          />
        </Sekcia>

        {/* Karty, ktoré majú vlastný nadpis — v paneli bez druhého rámu; dlaždice príloh po troch. */}
        <div className={`border-b border-border px-4 py-4 sm:[&_ul]:grid-cols-3! ${BEZ_RAMU}`}>
          {prilohy}
        </div>
        {dalsie ? (
          <div className={`space-y-4 border-b border-border px-4 py-4 empty:hidden ${BEZ_RAMU}`}>
            {dalsie}
          </div>
        ) : null}
        {stitky ? (
          <div className={`border-b border-border px-4 py-4 ${BEZ_RAMU}`}>{stitky}</div>
        ) : null}
        <div id="komentare" className={`scroll-mt-24 border-b border-border px-4 py-4 ${BEZ_RAMU}`}>
          {komentare}
        </div>
        <div className={BEZ_RAMU}>{historia}</div>
      </PanelKompaktny>
    </RozlozenieKompaktne>
  );
}

/** Stav úhrady: splatnosť, zostatok, úhrady a tlačidlá. */
function StavUhrady({
  inv,
  u,
  platby,
  uhradene,
  poSplatnosti,
  onUhradena,
  onNeuhradena,
}: {
  inv: any;
  u: UdajeUctovnika;
  platby: Platba[];
  uhradene: number;
  poSplatnosti: boolean;
  onUhradena: () => void;
  onNeuhradena: () => void;
}) {
  const { t } = useT();
  const naZobr = u.naZobrazenie ?? ((n: number) => n);
  const mena = u.mena ?? "EUR";
  const uhradena = u.uhrada.uhradena;
  const dni = dniPoSplatnosti(inv.due_date);
  const zostava = Math.max(0, naZobr(u.kUhrade ?? u.spolu) - uhradene);
  const male =
    "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary";
  return (
    <div className="space-y-2" aria-label={t("Úhrada")} role="group">
      {inv.due_date ? (
        <div
          className={`text-sm ${poSplatnosti ? "font-medium text-destructive" : "text-muted-foreground"}`}
        >
          {t("Splatná {datum}", { datum: u.splatnost ?? datumNaDoklade(inv.due_date) })}
          {!uhradena && poSplatnosti && dni != null && dni > 0
            ? ` (${t(
                dni === 1
                  ? "{n} deň po splatnosti"
                  : dni < 5
                    ? "{n} dni po splatnosti"
                    : "{n} dní po splatnosti",
                { n: dni },
              )})`
            : ""}
        </div>
      ) : null}
      {uhradena ? (
        <div className="flex items-center gap-1.5 text-base font-semibold text-primary">
          <CheckCircle2 className="h-5 w-5" />
          {u.uhrada.datum
            ? t("Uhradená {datum}", { datum: datumNaDoklade(u.uhrada.datum) })
            : t("Uhradená")}
        </div>
      ) : (
        <div>
          <div className="text-xs text-muted-foreground">
            {poSplatnosti ? t("Po splatnosti — zostáva uhradiť") : t("Zostáva k úhrade")}
          </div>
          <div className="text-xl font-semibold tabular-nums">{formatujMenu(zostava, mena)}</div>
          {uhradene > 0.004 ? (
            <div className="text-xs text-muted-foreground">
              {t("Čiastočne uhradená — {suma}", { suma: formatujMenu(uhradene, mena) })}
            </div>
          ) : null}
        </div>
      )}
      {platby.length ? (
        <div>
          <div className="text-xs text-muted-foreground">{t("Úhrady")}</div>
          <ul className="mt-0.5 space-y-0.5 text-sm">
            {platby.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 tabular-nums">
                <span>{datumNaDoklade(String(p.paid_at).slice(0, 10))}</span>
                <span className="font-medium">{formatujMenu(Number(p.amount), mena)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {uhradena ? (
          <button type="button" onClick={onNeuhradena} className={male}>
            {t("Označiť ako neuhradenú")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onUhradena}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("Označiť ako uhradenú")}
          </button>
        )}
      </div>
    </div>
  );
}
