import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageBody } from "@/components/faktero/AppShell";
import {
  DocumentDetailHeader,
  MenuAkcia,
  SekundarnaAkcia,
  MenuSkupina,
  MetaRiadok,
  PrimarnaAkcia,
} from "@/components/faktero/DocumentDetailHeader";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";
import { NacitavanieStav, ChybovyStav } from "@/components/faktero/web/StavyObsahu";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import type { CielDetailu } from "@/hooks/useKlikNaRiadok";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { deleteJob, getJob, setJobStatus, updateJob } from "@/lib/faktero/jobs.functions";
import { nastavenieSchvalovaniaFn } from "@/lib/faktero/schvalovanie.functions";
import {
  STAV_ZAKAZKY_POPIS,
  chybaZakazky,
  nakladZBlocku,
  nakladZJazdy,
  vynosZFaktury,
  type StavZakazky,
} from "@/lib/faktero/zakazky";
import { STAV_POPIS, type StavObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { pohybNazov } from "@/lib/faktero/stock-pohyb";
import { Lock, Unlock, Pencil, Trash2 } from "lucide-react";
import { SumaVDomacejMene, useFormatMenyFirmy } from "@/components/faktero/SuctyPoMenach";
import { formatujMenuKratko, formatujSucetPoMenach } from "@/lib/faktero/mena-sucet";
import { StatusBadge } from "./dashboard";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka, preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/zakazky/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Zákazka — Faktero") }] }),
  component: JobDetail,
});

/** Stav zákazky → tón jednotného stavového odznaku (text ostáva z STAV_ZAKAZKY_POPIS). */
const TON_ZAKAZKY: Record<StavZakazky, TonStavu> = {
  active: "informacia",
  closed: "uspech",
  cancelled: "zruseny",
};

/** Stav objednávky u dodávateľa → tón (text ostáva z STAV_POPIS). */
const TON_OBJEDNAVKY: Record<StavObjednavky, TonStavu> = {
  draft: "neutralny",
  sent: "priebeh",
  partially_received: "pozor",
  received: "uspech",
  cancelled: "zruseny",
};

/** Kladný zisk — tón „úspech“ z dizajnového systému (nie pevná zelená). */
const KLADNE = "text-[color:var(--stav-uspech-text)]";

function Karta({
  titulok,
  hodnota,
  farba,
  poznamka,
}: {
  titulok: string;
  hodnota: React.ReactNode;
  farba?: string;
  poznamka?: string;
}) {
  const { t } = useT();
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="text-sm text-muted-foreground">{t(titulok)}</div>
      <div className={`suma mt-1 text-lg sm:text-xl ${farba ?? ""}`}>
        {hodnota}
      </div>
      {poznamka && <div className="mt-1 text-xs text-muted-foreground">{t(poznamka)}</div>}
    </div>
  );
}

/** Prúžok čerpania. Nad 100 % sa zafarbí načerveno, ale neprelezie rámik. */
function Prucok({ percento, obratene }: { percento: number; obratene?: boolean }) {
  const zle = obratene ? percento > 100 : percento < 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${zle ? "bg-destructive" : "bg-[color:var(--chart-1)]"}`}
        style={{ width: `${Math.min(100, Math.max(0, percento))}%` }}
      />
    </div>
  );
}

function JobDetail() {
  const { t, jazyk } = useT();
  const mena = useMenaFirmy();
  const menyFirmy = useFormatMenyFirmy();
  /** Súčty vyhodnotenia sú v domácej mene firmy, riadky dokladov v ich mene (K-01). */
  const suma = (n: unknown, menaDokladu?: unknown) => menyFirmy.suma(Number(n) || 0, menaDokladu);
  /** Súčty vyhodnotenia krátkym symbolom („Kč“) ako Výnosy/Náklady, nie kódom „CZK“. */
  const sucet = (n: unknown) =>
    formatujMenuKratko(Number(n) || 0, menyFirmy.domaca, menyFirmy.locale);
  const datum = (d: unknown) => (d ? datumNaDoklade(d, jazyk) : "—");
  const { id } = useParams({ from: "/_authenticated/zakazky/$id" });
  const nav = useNavigate();
  const fetchJob = useServerFn(getJob);
  const doStatus = useServerFn(setJobStatus);
  const doUpdate = useServerFn(updateJob);
  const doDelete = useServerFn(deleteJob);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upravujem, setUpravujem] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);

  const cid = useMemo(() => getActiveCompanyId(), []);
  const nacitajLudi = useServerFn(nastavenieSchvalovaniaFn);
  const [ludia, setLudia] = useState<{ id: string; meno: string }[]>([]);
  useEffect(() => {
    if (!cid) return;
    nacitajLudi({ data: { company_id: cid } })
      .then((r) => setLudia(r.ludia))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchJob({ data: { company_id: cid, id } })
      .then((d: any) => {
        setData(d);
        setError(null);
      })
      .catch((e: any) => setError(e?.message ?? t("Zákazku sa nepodarilo načítať")))
      .finally(() => setLoading(false));
  }, [cid, fetchJob, id]);

  useEffect(nacitaj, [nacitaj]);

  useEffect(() => {
    if (!cid || !upravujem || customers.length) return;
    // Len odberatelia, ako pri novej zákazke (K-06) — a aktuálne zvolený, aj
    // keby už odberateľom nebol, aby úprava ticho nezmazala väzbu.
    const aktualny = data?.job?.customer_id as string | undefined;
    supabase
      .from("customers")
      .select("id, name, odberatel")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
      .then(({ data: d }) =>
        setCustomers((d ?? []).filter((c: any) => c.odberatel || c.id === aktualny)),
      );
  }, [cid, upravujem, customers.length, data?.job?.customer_id]);

  function zacniUpravu() {
    const j = data.job;
    setForm({
      name: j.name ?? "",
      customer_id: j.customer_id ?? "",
      start_date: j.start_date ?? "",
      end_date: j.end_date ?? "",
      planned_revenue: j.planned_revenue ?? "",
      planned_cost: j.planned_cost ?? "",
      note: j.note ?? "",
      manazer_id: j.manazer_id ?? "",
    });
    setUpravujem(true);
  }

  async function akcia(fn: () => Promise<any>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      nacitaj();
    } catch (e: any) {
      setError(e?.message ?? t("Operácia zlyhala"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card">
          <NacitavanieStav />
        </div>
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card">
          <ChybovyStav nadpis={error ?? t("Zákazka nenájdená.")} />
        </div>
      </PageBody>
    );
  }

  const j = data.job;
  const v = data.vyhodnotenie;
  // Výnosy a náklady sú prehľad — v domácej mene so značkou „prepočítané“.
  const sucetKarty = (suma: number) => ({
    domaca: (v.mena ?? menyFirmy.domaca) as "EUR" | "CZK",
    suma,
    prepocitane: !!v.prepocitane,
    bezPrepoctu: new Map<string, number>(),
  });
  const otvorena = j.status === "active";
  const maDoklady = Boolean(
    data.faktury?.length ||
    data.prijate_faktury?.length ||
    data.blocky?.length ||
    data.pohyby?.length ||
    data.jazdy?.length ||
    data.objednavky?.length,
  );
  const pole =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const popis = "mb-1 block text-sm font-semibold text-foreground";

  return (
    <>
      <DocumentDetailHeader
        title={t("Zákazka")}
        number={j.job_number}
        status={
          <StavOdznak ton={TON_ZAKAZKY[j.status as StavZakazky] ?? "neutralny"}>
            {t(STAV_ZAKAZKY_POPIS[j.status as StavZakazky] ?? j.status)}
          </StavOdznak>
        }
        meta={
          <MetaRiadok
            polozky={[
              j.name,
              j.customer_name,
              j.start_date && t("od {datum}", { datum: datumNaDoklade(j.start_date) }),
              j.end_date && t("do {datum}", { datum: datumNaDoklade(j.end_date) }),
            ]}
          />
        }
        primaryAction={
          otvorena ? (
            <PrimarnaAkcia
              onClick={() => akcia(() => doStatus({ data: { company_id: cid!, id, status: "closed" } }))}
              disabled={busy}
            >
              <Lock /> {t("Uzavrieť")}
            </PrimarnaAkcia>
          ) : null
        }
        secondaryActions={
          // Uzavretá zákazka nemá hlavnú akciu: znovu otvorenie je ikona ako úpravy
          // na bločku či prijatej faktúre, nie tlačidlo cez celú šírku telefónu.
          otvorena ? null : (
            <SekundarnaAkcia
              ikona={Unlock}
              label={t("Znovu otvoriť")}
              onClick={() => akcia(() => doStatus({ data: { company_id: cid!, id, status: "active" } }))}
              disabled={busy}
            />
          )
        }
        menuActions={
          otvorena ? (
            <MenuSkupina label={t("Úpravy")}>
              <MenuAkcia ikona={Pencil} onClick={zacniUpravu} disabled={busy}>
                {t("Upraviť")}
              </MenuAkcia>
            </MenuSkupina>
          ) : null
        }
      />
      <PageBody>
        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!otvorena && (
          <div className="mb-4 rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            {t(
              "Zákazka je {stav}. Nový doklad sa k nej priradiť nedá — vyhodnotenie sa už nezmení.",
              {
                stav: t(STAV_ZAKAZKY_POPIS[j.status as StavZakazky] ?? j.status).toLowerCase(),
              },
            )}
          </div>
        )}

        {upravujem && (
          <form
            className="mb-6 max-w-3xl space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
            onSubmit={(e) => {
              e.preventDefault();
              // Rovnaké kontroly ako Nová zákazka — inak prišla surová chyba zo servera (K-07).
              const chyba = chybaZakazky(form);
              if (chyba) {
                setError(t(chyba));
                return;
              }
              akcia(async () => {
                await doUpdate({
                  data: {
                    company_id: cid!,
                    id,
                    name: form.name.trim(),
                    customer_id: form.customer_id || null,
                    start_date: form.start_date || null,
                    end_date: form.end_date || null,
                    planned_revenue:
                      form.planned_revenue === "" ? null : Number(form.planned_revenue),
                    planned_cost: form.planned_cost === "" ? null : Number(form.planned_cost),
                    note: form.note.trim() || null,
                    manazer_id: form.manazer_id || null,
                  },
                });
                setUpravujem(false);
              });
            }}
          >
            <div>
              <label className={popis}>{t("Názov")}</label>
              <input aria-label={t("Názov")}
                className={pole}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>{t("Odberateľ")}</label>
                <select aria-label={t("Odberateľ")}
                  className={pole}
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                >
                  <option value="">{t("— bez odberateľa —")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div />
              <div>
                <label className={popis}>{t("Začiatok")}</label>
                <input aria-label={t("Začiatok")}
                  type="date"
                  className={pole}
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>{t("Koniec")}</label>
                <input aria-label={t("Koniec")}
                  type="date"
                  className={pole}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>
                  {t("Plánované výnosy ({mena})", { mena: mena.symbol })}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={pole}
                  value={form.planned_revenue}
                  onChange={(e) => setForm({ ...form, planned_revenue: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>
                  {t("Plánované náklady ({mena})", { mena: mena.symbol })}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={pole}
                  value={form.planned_cost}
                  onChange={(e) => setForm({ ...form, planned_cost: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={popis}>{t("Manažér zákazky")}</label>
              <select aria-label={t("Manažér zákazky")}
                className={pole}
                value={form.manazer_id}
                onChange={(e) => setForm({ ...form, manazer_id: e.target.value })}
              >
                <option value="">{t("— bez manažéra —")}</option>
                {ludia.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.meno}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Môže schvaľovať doklady tejto zákazky, keď je v schvaľovacej ceste „manažér zákazky“.",
                )}
              </span>
            </div>
            <div>
              <label className={popis}>{t("Poznámka")}</label>
              <textarea aria-label={t("Poznámka")}
                className={`${pole} min-h-20`}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {t("Uložiť")}
              </button>
              <button
                type="button"
                onClick={() => setUpravujem(false)}
                className="rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                {t("Zrušiť")}
              </button>
            </div>
          </form>
        )}

        {/* Na telefóne dve karty vedľa seba ako súhrny v ostatných agendách, nie sedem pod sebou. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Karta titulok="Výnosy" hodnota={<SumaVDomacejMene sucet={sucetKarty(v.vynosy)} />} />
          <Karta titulok="Náklady" hodnota={<SumaVDomacejMene sucet={sucetKarty(v.naklady)} />} />
          <Karta
            titulok="Zisk"
            hodnota={sucet(v.zisk)}
            farba={v.zisk < 0 ? "text-destructive" : KLADNE}
          />
          <Karta
            titulok="Marža"
            hodnota={v.marza == null ? "—" : `${v.marza} %`}
            poznamka={v.marza == null ? "Zatiaľ bez výnosov" : undefined}
          />
        </div>

        {v.bez_prepoctu?.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Doklady v cudzej mene bez kurzu sa do súčtov nezapočítali: {sumy}", {
              sumy: formatujSucetPoMenach(v.bez_prepoctu, lokalJazyka(jazyk), { domaca: v.mena }),
            })}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Karta
            titulok="Materiál zo skladu"
            hodnota={sucet(v.naklad_material)}
            poznamka="Vo váženej nákupnej cene"
          />
          <Karta
            titulok="Prijaté faktúry a bločky"
            hodnota={sucet(v.naklad_sluzby)}
            poznamka="Bez DPH"
          />
          <Karta
            titulok="Doprava"
            hodnota={sucet(v.naklad_doprava)}
            poznamka={
              // Bez spotreby vozidla alebo ceny paliva sa jazda uloží bez
              // nákladu. Nula pri načítaných jazdách je vtedy chýbajúci údaj,
              // nie skutočnosť — a je lepšie to povedať rovno.
              v.naklad_doprava === 0 && data.jazdy.length > 0
                ? "Jazdy nemajú spotrebu vozidla alebo cenu PHM"
                : "Z jázd priradených zákazke"
            }
          />
        </div>

        {(v.planovany_vynos != null || v.planovany_naklad != null) && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-base font-semibold">{t("Plán a skutočnosť")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {v.planovany_vynos != null && (
                <div>
                  <div className="mb-1.5 flex flex-wrap justify-between gap-x-3 text-sm">
                    <span className="text-muted-foreground">{t("Výnosy")}</span>
                    <span className="font-semibold tabular-nums">
                      {t("{suma} z {plan}", { suma: sucet(v.vynosy), plan: sucet(v.planovany_vynos) })}
                      {v.plnenie_vynosu != null && ` (${v.plnenie_vynosu} %)`}
                    </span>
                  </div>
                  <Prucok percento={v.plnenie_vynosu ?? 0} />
                </div>
              )}
              {v.planovany_naklad != null && (
                <div>
                  <div className="mb-1.5 flex flex-wrap justify-between gap-x-3 text-sm">
                    <span className="text-muted-foreground">{t("Náklady")}</span>
                    <span className="font-semibold tabular-nums">
                      {t("{suma} z {plan}", { suma: sucet(v.naklady), plan: sucet(v.planovany_naklad) })}
                      {v.cerpanie_nakladu != null && ` (${v.cerpanie_nakladu} %)`}
                    </span>
                  </div>
                  <Prucok percento={v.cerpanie_nakladu ?? 0} obratene />
                </div>
              )}
            </div>
            {v.planovany_zisk != null && (
              <div className="mt-3 text-sm text-muted-foreground">
                {t("Plánovaný zisk {suma}, skutočný", { suma: sucet(v.planovany_zisk) })}{" "}
                <span className={`suma ${v.zisk < 0 ? "text-destructive" : KLADNE}`}>
                  {sucet(v.zisk)}
                </span>
                .
              </div>
            )}
          </div>
        )}

        {j.note && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm sm:p-5">
            <h2 className="mb-1 text-sm font-semibold">{t("Poznámka")}</h2>
            <div className="whitespace-pre-wrap break-words">{j.note}</div>
          </div>
        )}

        <Zoznam
          titulok="Vydané faktúry"
          prazdne="K zákazke zatiaľ nie je priradená žiadna faktúra."
          hlavicka={["Číslo", "Dátum", "Typ", "Stav", "Bez DPH"]}
          vpravo={[4]}
          ciele={data.faktury.map((f: any) => ({ to: "/faktury/$id", params: { id: f.id } }))}
          riadky={data.faktury.map((f: any) => [
            <Link
              key={f.id}
              to="/faktury/$id"
              params={{ id: f.id }}
              className="cislo-dokladu text-primary hover:underline"
            >
              {f.invoice_number}
            </Link>,
            datum(f.issue_date),
            f.type === "credit_note"
              ? t("Dobropis")
              : f.type === "debit_note"
                ? t("Ťarchopis")
                : f.type === "proforma"
                  ? t("Zálohová")
                  : f.type === "advance_payment"
                    ? t("Daňový doklad k platbe")
                    : t("Faktúra"),
            <StatusBadge key="stav" status={f.status} />,
            // Koncept, storno, zálohová a doklad k platbe sa do výnosov nepočítajú (K-08).
            vynosZFaktury(f) === 0 && Number(f.subtotal) !== 0 ? (
              <span
                key="suma"
                className="suma text-muted-foreground line-through"
                title={t("Nepočíta sa do výnosov zákazky")}
              >
                {suma(f.subtotal, f.currency)}
              </span>
            ) : (
              <span key="suma" className="suma">
                {suma(f.subtotal, f.currency)}
              </span>
            ),
          ])}
        />

        <Zoznam
          titulok="Prijaté faktúry"
          prazdne="Žiadny nákup priradený k zákazke."
          hlavicka={["Číslo", "Dodávateľ", "Dátum", "Bez DPH"]}
          vpravo={[3]}
          ciele={data.prijate_faktury.map((f: any) => ({
            to: "/prijate-faktury/$id",
            params: { id: f.id },
          }))}
          riadky={data.prijate_faktury.map((f: any) => [
            <Link
              key="c"
              to="/prijate-faktury/$id"
              params={{ id: f.id }}
              className="cislo-dokladu hover:underline"
            >
              {f.invoice_number}
            </Link>,
            f.supplier_name,
            datum(f.issue_date),
            <span key="s" className="suma">{suma(f.amount_without_vat, f.currency)}</span>,
          ])}
        />

        <Zoznam
          titulok="Bločky"
          prazdne="Žiadny bloček priradený k zákazke."
          hlavicka={["Číslo", "Dodávateľ", "Dátum", "Bez DPH"]}
          vpravo={[3]}
          ciele={(data.blocky ?? []).map((b: any) => ({
            to: "/doklady/novy",
            search: { id: b.id },
          }))}
          riadky={(data.blocky ?? []).map((b: any) => [
            <Link
              key="c"
              to="/doklady/novy"
              search={{ id: b.id }}
              className="cislo-dokladu hover:underline"
            >
              {b.document_number ?? "—"}
            </Link>,
            b.supplier_name,
            datum(b.issue_date),
            <span key="s" className="suma">{suma(nakladZBlocku(b), b.currency)}</span>,
          ])}
        />

        <Zoznam
          titulok="Materiál zo skladu"
          prazdne="Zo skladu sa na zákazku zatiaľ nič nevydalo."
          hlavicka={["Položka", "sklad::Pohyb", "Množstvo", "Vážená cena", "Hodnota"]}
          vpravo={[2, 3, 4]}
          ciele={data.pohyby.map((p: any) => ({ to: "/sklad/pohyby/$id", params: { id: p.id } }))}
          riadky={data.pohyby.map((p: any) => [
            p.nazov,
            t(pohybNazov(p.type)),
            Number(p.quantity),
            p.unit_cost == null ? "—" : <span className="suma">{suma(Number(p.unit_cost))}</span>,
            <span key="s" className="suma">{suma(Number(p.unit_cost ?? 0) * Number(p.quantity))}</span>,
          ])}
        />

        <Zoznam
          titulok="Objednávky u dodávateľov"
          prazdne="Pre zákazku nie je objednané nič."
          poznamka="Objednaný tovar sa do nákladov nepočíta — náklad vznikne až jeho výdajom zo skladu."
          hlavicka={["Číslo", "Dodávateľ", "Objednané", "Očakávané", "Stav"]}
          vpravo={[]}
          ciele={(data.objednavky ?? []).map((o: any) => ({
            to: "/sklad/objednavky/$id",
            params: { id: o.id },
          }))}
          riadky={(data.objednavky ?? []).map((o: any) => [
            <Link
              key={o.id}
              to="/sklad/objednavky/$id"
              params={{ id: o.id }}
              className="cislo-dokladu text-primary hover:underline"
            >
              {o.order_number}
            </Link>,
            o.supplier_name ?? "—",
            datum(o.order_date),
            datum(o.expected_date),
            <StavOdznak
              key="st"
              ton={TON_OBJEDNAVKY[o.status as StavObjednavky] ?? "neutralny"}
              maly
            >
              {t(STAV_POPIS[o.status as StavObjednavky] ?? o.status)}
            </StavOdznak>,
          ])}
        />

        <Zoznam
          titulok="Jazdy"
          prazdne="K zákazke nie je priradená žiadna jazda."
          hlavicka={["Dátum", "Trasa", "Km", "Náklad"]}
          vpravo={[2, 3]}
          riadky={data.jazdy.map((j: any) => [
            datum(j.trip_date),
            [j.start_location, j.end_location].filter(Boolean).join(" → ") || (j.purpose ?? "—"),
            Number(j.distance_km),
            <span key="s" className="suma">{suma(nakladZJazdy(j))}</span>,
          ])}
        />

        {/* Mazanie nezávisí od stavu — uzavretá zákazka bez dokladov je rovnaký
            omyl ako otvorená a človek ju musel vedieť dostať preč. Bránia jej
            len naviazané doklady; tie vymenuje chyba zo servera. */}
        <div className="mt-8 border-t border-border pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!(await potvrd(t("Naozaj zmazať zákazku {cislo}?", { cislo: j.job_number })))) return;
              akcia(async () => {
                await doDelete({ data: { company_id: cid!, id } });
                nav({ to: "/zakazky" });
              });
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-destructive hover:underline disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> {t("Zmazať zákazku")}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            {maDoklady
              ? t(
                  "Zákazka má naviazané doklady — najprv ich od nej odpojte, inak ju možno len uzavrieť.",
                )
              : t("Zmazať sa dá zákazka bez dokladov. Rozbehnutú radšej uzavrite.")}
          </p>
        </div>
      </PageBody>
    </>
  );
}

function Zoznam({
  titulok,
  prazdne,
  hlavicka,
  riadky,
  poznamka,
  vpravo,
  ciele,
}: {
  titulok: string;
  prazdne: string;
  hlavicka: string[];
  riadky: React.ReactNode[][];
  poznamka?: string;
  /** Stĺpce zarovnané doprava (sumy, čísla); predvolene posledné dva. */
  vpravo?: number[];
  /** Kam vedie klik na riadok (rovnaké poradie ako `riadky`); `null` = riadok bez detailu. */
  ciele?: (CielDetailu | null)[];
}) {
  const { t } = useT();
  const jeVpravo = (i: number) => (vpravo ? vpravo.includes(i) : i >= hlavicka.length - 2);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-base font-semibold">
        {t(titulok)} <span className="font-normal text-muted-foreground">({riadky.length})</span>
      </h2>
      {poznamka && <div className="mb-2 text-sm text-muted-foreground">{t(poznamka)}</div>}
      {riadky.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground sm:px-5">
          {t(prazdne)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                {hlavicka.map((h, i) => (
                  <th key={h} className={`whitespace-nowrap p-3 ${jeVpravo(i) ? "text-right" : ""}`}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {riadky.map((r, i) => (
                <KlikatelnyRiadok
                  key={i}
                  ciel={ciele?.[i] ?? null}
                  className={ciele?.[i] ? undefined : "hover:bg-muted/30"}
                >
                  {r.map((c, k) => (
                    <td
                      key={k}
                      className={`p-3 ${
                        jeVpravo(k)
                          ? "whitespace-nowrap text-right tabular-nums"
                          : ["Dátum", "Objednané", "Očakávané", "Km"].includes(hlavicka[k])
                            ? "whitespace-nowrap tabular-nums"
                            : "break-words"
                      }`}
                    >
                      {c}
                    </td>
                  ))}
                </KlikatelnyRiadok>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
