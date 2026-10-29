import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Hash,
  Landmark,
  Tag,
  UserCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { zrusParovanie } from "@/lib/faktero/parovanie.functions";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { formatujIban, sUctomFaktury } from "@/lib/faktero/platobny-ucet";
import { sadzbyKrajiny } from "@/lib/faktero/vat-rates";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { dniPoSplatnosti } from "@/lib/faktero/uhrady-prijatej";
import type { UdajeUctovnika } from "./UdajePreUctovnika";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { Avatar, KartaK, PlatbaK, RiadokK, StranaK, SumarK, UdajK } from "./DetailDokladuKompaktny";

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

/**
 * Detail vystavenej faktúry v kompaktnom rozložení — jeden stĺpec kariet:
 * údaje dokladu s kartou úhrady, základné údaje (zaúčtovanie), prílohy,
 * dodávateľ | odberateľ, platba | sumár, spárované pohyby z banky, ďalšie
 * karty a história. Kúsky aj akcie prídu z detailu, mení sa len usporiadanie.
 * Rozloženie sa riadi šírkou kontajnera, takže funguje aj vedľa náhľadu PDF.
 */
export function VystavenaDetailKompaktna({
  inv,
  company,
  u,
  poSplatnosti,
  interneCislo,
  zauctovanie,
  prilohy,
  polozky,
  hore,
  platbaDoplnok,
  dalsie,
  komentare,
  historia,
  onUhradena,
  onNeuhradena,
  onZmena,
}: {
  inv: any;
  company: any;
  /** Tie isté údaje, z ktorých kreslí kartu „Údaje pre účtovníka“. */
  u: UdajeUctovnika;
  poSplatnosti: boolean;
  /** Číslo dokladu v Pohode, keď už bol odovzdaný. */
  interneCislo: string | null;
  /** „Základné údaje“ — ZauctovanieVystavenejPanel v kompaktnom tvare. */
  zauctovanie: ReactNode;
  prilohy: ReactNode;
  /** Text nad položkami, položky a poznámka. */
  polozky: ReactNode;
  /** Štítky a stav dokladu — nad údajmi. */
  hore?: ReactNode;
  /** Výber účtu, predĺženie splatnosti, chýbajúci IBAN — pod platobnými údajmi. */
  platbaDoplnok?: ReactNode;
  /** Zálohy, sklad, zákazka, Zásielkovňa, § 25a, schvaľovanie. */
  dalsie?: ReactNode;
  komentare: ReactNode;
  historia: ReactNode;
  onUhradena: () => void;
  onNeuhradena: () => void;
  /** Detail sa načíta znova (po zrušení väzby na pohyb). */
  onZmena: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const krajina = useKrajinaDane();
  const nacitajMena = useServerFn(menaClenovFirmy);
  const rozparuj = useServerFn(zrusParovanie);
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

  const z = u.naZobrazenie ?? ((n: number) => n);
  const menaDokladu = u.mena ?? "EUR";
  const suma = (n: number) => formatujMenu(z(n), menaDokladu);
  const vystavil = inv.created_by ? (mena[inv.created_by] ?? null) : null;
  const zauctoval = inv.zauctoval ? (mena[inv.zauctoval] ?? null) : null;
  const vytvorene = inv.created_at
    ? new Date(inv.created_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })
    : null;
  const iban = sUctomFaktury(company ?? {}, inv).iban ?? null;
  const uhradene = platby.reduce((s, p) => s + Number(p.amount || 0), 0);
  const kUhrade = u.kUhrade ?? u.spolu;

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

  const sumarPod = (
    <>
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
    </>
  );

  return (
    <div className="@container mx-auto max-w-6xl space-y-4">
      {/* Drobčeky */}
      <nav aria-label={t("Kde ste")} className="flex flex-wrap items-center gap-1 text-xs">
        <Link to="/faktury" className="text-muted-foreground hover:text-foreground">
          {t("Vystavené faktúry")}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">{t("Detail faktúry")}</span>
      </nav>

      {hore}

      {/* 1. Údaje dokladu + karta úhrady */}
      <div
        className={`grid grid-cols-1 gap-4 [&>*]:min-w-0 ${
          u.uhrada.bezUhrady ? "" : "@4xl:grid-cols-[minmax(0,1fr)_18rem]"
        }`}
      >
        <KartaK>
          <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3 [&>*]:min-w-0">
            <div className="space-y-3">
              <UdajK ikona={Hash} popis="Faktúra číslo">
                {inv.invoice_number || "—"}
              </UdajK>
              <UdajK ikona={Tag} popis="Interné číslo">
                {interneCislo || "—"}
              </UdajK>
              <UdajK ikona={FileText} popis="Typ dokladu">
                {u.druh}
              </UdajK>
              <UdajK ikona={UserRound} popis="Vystavil">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {vystavil ? <Avatar meno={vystavil} /> : null}
                  <span className="min-w-0 break-words">
                    {vystavil ?? (inv.source === "api" ? t("cez API") : "—")}
                  </span>
                </span>
              </UdajK>
              {inv.zauctoval ? (
                <UdajK ikona={UserCheck} popis="Spracoval">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    {zauctoval ? <Avatar meno={zauctoval} /> : null}
                    <span className="min-w-0 break-words">{zauctoval ?? t("kolega")}</span>
                  </span>
                </UdajK>
              ) : null}
            </div>
            <div className="space-y-3">
              <UdajK ikona={CalendarDays} popis="Dátum vystavenia">
                {datumNaDoklade(inv.issue_date)}
              </UdajK>
              <UdajK ikona={CalendarDays} popis="Dátum splatnosti">
                <span className={poSplatnosti ? "text-destructive" : ""}>{u.splatnost || "—"}</span>
              </UdajK>
              <UdajK ikona={CalendarDays} popis="Dátum dodania">
                {datumNaDoklade(inv.delivery_date ?? inv.issue_date)}
              </UdajK>
              {vytvorene ? (
                <UdajK ikona={CalendarDays} popis="Dátum vytvorenia">
                  {vytvorene}
                </UdajK>
              ) : null}
            </div>
            <div className="space-y-3">
              <UdajK ikona={Wallet} popis="Celková suma">
                <span className="text-xl font-semibold tabular-nums">{suma(u.spolu)}</span>
              </UdajK>
              <div className="pl-[2.375rem] text-xs text-muted-foreground">
                {t("Bez DPH")} {suma(u.zaklad)} · {t("DPH")} {suma(u.dph)}
              </div>
              {u.rezimy.length ? (
                <ul className="space-y-0.5 pl-[2.375rem] text-xs text-muted-foreground">
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
            </div>
          </div>
        </KartaK>
        {u.uhrada.bezUhrady ? null : (
          <KartaUhradyVystavenej
            inv={inv}
            u={u}
            platby={platby}
            uhradene={uhradene}
            poSplatnosti={poSplatnosti}
            onUhradena={onUhradena}
            onNeuhradena={() => void neuhradena()}
            onSpravovat={spravovatUhrady}
          />
        )}
      </div>

      {/* 2. Základné údaje — zaúčtovanie */}
      {zauctovanie}

      {/* 3. Prílohy s PDF faktúry */}
      {prilohy}

      {/* 4. Dodávateľ | Odberateľ */}
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 [&>*]:min-w-0">
        <StranaK
          nadpis="Dodávateľ"
          s={
            company
              ? {
                  nazov: company.name,
                  ulica: company.street,
                  mesto: company.city,
                  psc: company.zip,
                  krajina: company.country,
                  ico: company.ico,
                  dic: company.dic,
                  icDph: company.ic_dph,
                }
              : null
          }
        />
        <StranaK
          nadpis="Odberateľ"
          akcia={
            inv.status !== "cancelled" ? (
              <Link
                to="/faktury/$id/upravit"
                params={{ id: inv.id }}
                className="text-sm text-primary hover:underline"
              >
                {t("Zmeniť")}
              </Link>
            ) : null
          }
          s={{
            nazov: inv.customer_name,
            ulica: inv.customer_street,
            mesto: inv.customer_city,
            psc: inv.customer_zip,
            krajina: inv.customer_country,
            ico: inv.customer_ico,
            dic: inv.customer_dic,
            icDph: inv.customer_ic_dph,
          }}
        />
      </div>

      {/* 5. Platba | Sumár */}
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 [&>*]:min-w-0">
        <PlatbaK
          iban={iban}
          vs={inv.variable_symbol}
          ks={inv.constant_symbol}
          ss={inv.specific_symbol}
          doplnok={
            <div className="space-y-1">
              <RiadokK popis="Dátum vystavenia" hodnota={datumNaDoklade(inv.issue_date)} />
              <RiadokK
                popis="Dátum dodania"
                hodnota={datumNaDoklade(inv.delivery_date ?? inv.issue_date)}
              />
              <RiadokK popis="Dátum splatnosti" hodnota={u.splatnost} />
              <RiadokK popis="Forma úhrady" hodnota={u.formaUhrady} />
              {platbaDoplnok ? <div className="space-y-2 pt-2 text-sm">{platbaDoplnok}</div> : null}
            </div>
          }
        />
        <SumarK
          rozpis={u.rozpis.map((g) => ({
            sadzba: g.sadzba,
            zaklad: z(g.zaklad),
            dph: z(g.dan),
            pdp: g.prenesenie,
          }))}
          sadzby={sadzbyKrajiny(krajina, inv.delivery_date ?? inv.issue_date)}
          mena={menaDokladu}
          celkom={z(u.spolu)}
          pod={sumarPod}
        />
      </div>

      {/* 6. Položky */}
      <div className="space-y-4">{polozky}</div>

      {/* 7. Spárované pohyby z banky */}
      {u.uhrada.bezUhrady && !pohyby.length ? null : (
        <KartaK
          id="sparovane-pohyby"
          nadpis="Spárované pohyby"
          akcia={
            <Link
              to="/bankove-ucty/transakcie"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary"
            >
              <Landmark className="h-3.5 w-3.5" /> {t("Bankové pohyby")}
            </Link>
          }
        >
          {pohyby.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-2 font-medium">{t("Dátum pohybu")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("Protistrana")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("VS")}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t("Suma")}</th>
                    <th className="py-1.5 pl-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pohyby.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5 pr-2 tabular-nums">{datumNaDoklade(p.booking_date)}</td>
                      <td className="px-2 py-1.5">
                        <span className="block">{p.counterparty || "—"}</span>
                        {p.counterparty_iban ? (
                          <span className="block font-mono text-xs text-muted-foreground">
                            {formatujIban(p.counterparty_iban)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{p.variable_symbol || "—"}</td>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                        {formatujMenu(Number(p.amount), p.currency || menaDokladu)}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => void zrusVazbu(p)}
                          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                        >
                          {t("Zrušiť väzbu")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("Faktúra zatiaľ nemá spárovaný pohyb z banky.")}
            </p>
          )}
        </KartaK>
      )}

      {/* 8. Ďalšie karty dokladu */}
      {dalsie}

      <div id="komentare" className="scroll-mt-24">
        {komentare}
      </div>

      {/* 9. História */}
      {historia}
    </div>
  );
}

/** Karta úhrady: stav, splatnosť, úhrady a tlačidlá — vpravo od údajov dokladu. */
function KartaUhradyVystavenej({
  inv,
  u,
  platby,
  uhradene,
  poSplatnosti,
  onUhradena,
  onNeuhradena,
  onSpravovat,
}: {
  inv: any;
  u: UdajeUctovnika;
  platby: Platba[];
  uhradene: number;
  poSplatnosti: boolean;
  onUhradena: () => void;
  onNeuhradena: () => void;
  onSpravovat: () => void;
}) {
  const { t } = useT();
  const z = u.naZobrazenie ?? ((n: number) => n);
  const mena = u.mena ?? "EUR";
  const uhradena = u.uhrada.uhradena;
  const dni = dniPoSplatnosti(inv.due_date);
  const zostava = Math.max(0, z(u.kUhrade ?? u.spolu) - uhradene);
  const pruh = uhradena ? "bg-primary" : poSplatnosti ? "bg-destructive" : "bg-muted-foreground/40";
  const male =
    "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary";
  return (
    <section
      aria-label={t("Úhrada")}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className={`h-1.5 ${pruh}`} />
      <div className="space-y-2 p-4">
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
          <button type="button" onClick={onSpravovat} className={male}>
            {t("Spravovať úhrady")}
          </button>
        </div>
      </div>
    </section>
  );
}
