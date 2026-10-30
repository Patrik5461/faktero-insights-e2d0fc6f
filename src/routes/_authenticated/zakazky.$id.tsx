import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageBody } from "@/components/faktero/AppShell";
import {
  DocumentDetailHeader,
  MenuAkcia,
  MenuSkupina,
  MetaRiadok,
  PrimarnaAkcia,
  StavOdznak,
} from "@/components/faktero/DocumentDetailHeader";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { deleteJob, getJob, setJobStatus, updateJob } from "@/lib/faktero/jobs.functions";
import { nastavenieSchvalovaniaFn } from "@/lib/faktero/schvalovanie.functions";
import { STAV_ZAKAZKY_POPIS, nakladZBlocku, nakladZJazdy, type StavZakazky } from "@/lib/faktero/zakazky";
import { STAV_POPIS, type StavObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { pohybNazov } from "@/lib/faktero/stock-pohyb";
import { Lock, Unlock, Pencil, Trash2 } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/zakazky/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Zákazka — Faktero") }] }),
  component: JobDetail,
});

const FARBA_STAVU: Record<StavZakazky, string> = {
  active: "bg-blue-500/10 text-blue-600",
  closed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function suma(n: number) {
  return formatovacMeny("EUR", "sk-SK")(n || 0);
}

function Karta({
  titulok,
  hodnota,
  farba,
  poznamka,
}: {
  titulok: string;
  hodnota: string;
  farba?: string;
  poznamka?: string;
}) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(titulok)}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${farba ?? ""}`}>{hodnota}</div>
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
        className={`h-full rounded-full ${zle ? "bg-destructive" : "bg-emerald-500"}`}
        style={{ width: `${Math.min(100, Math.max(0, percento))}%` }}
      />
    </div>
  );
}

function JobDetail() {
  const { t } = useT();
  const mena = useMenaFirmy();
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
    supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
      .then(({ data: d }) => setCustomers(d ?? []));
  }, [cid, upravujem, customers.length]);

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
        <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody>
        <div className="text-sm text-destructive">{error ?? t("Zákazka nenájdená.")}</div>
      </PageBody>
    );
  }

  const j = data.job;
  const v = data.vyhodnotenie;
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
  const popis = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <>
      <DocumentDetailHeader
        title={t("Zákazka")}
        number={j.job_number}
        status={
          <StavOdznak className={FARBA_STAVU[j.status as StavZakazky]}>
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
          ) : (
            <PrimarnaAkcia
              variant="outline"
              onClick={() => akcia(() => doStatus({ data: { company_id: cid!, id, status: "active" } }))}
              disabled={busy}
            >
              <Unlock /> {t("Znovu otvoriť")}
            </PrimarnaAkcia>
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
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!otvorena && (
          <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
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
            className="mb-6 space-y-4 rounded-xl border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
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
              <input
                className={pole}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>{t("Odberateľ")}</label>
                <select
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
                <input
                  type="date"
                  className={pole}
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>{t("Koniec")}</label>
                <input
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
              <select
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
              <textarea
                className={`${pole} min-h-20`}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {t("Uložiť")}
              </button>
              <button
                type="button"
                onClick={() => setUpravujem(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                {t("Zrušiť")}
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Karta titulok="Výnosy" hodnota={suma(v.vynosy)} />
          <Karta titulok="Náklady" hodnota={suma(v.naklady)} />
          <Karta
            titulok="Zisk"
            hodnota={suma(v.zisk)}
            farba={v.zisk < 0 ? "text-destructive" : "text-emerald-600"}
          />
          <Karta
            titulok="Marža"
            hodnota={v.marza == null ? "—" : `${v.marza} %`}
            poznamka={v.marza == null ? "Zatiaľ bez výnosov" : undefined}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Karta
            titulok="Materiál zo skladu"
            hodnota={suma(v.naklad_material)}
            poznamka="Vo váženej nákupnej cene"
          />
          <Karta
            titulok="Prijaté faktúry a bločky"
            hodnota={suma(v.naklad_sluzby)}
            poznamka="Bez DPH"
          />
          <Karta
            titulok="Doprava"
            hodnota={suma(v.naklad_doprava)}
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
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">{t("Plán a skutočnosť")}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              {v.planovany_vynos != null && (
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("Výnosy")}</span>
                    <span className="tabular-nums">
                      {t("{suma} z {plan}", { suma: suma(v.vynosy), plan: suma(v.planovany_vynos) })}
                      {v.plnenie_vynosu != null && ` (${v.plnenie_vynosu} %)`}
                    </span>
                  </div>
                  <Prucok percento={v.plnenie_vynosu ?? 0} />
                </div>
              )}
              {v.planovany_naklad != null && (
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("Náklady")}</span>
                    <span className="tabular-nums">
                      {t("{suma} z {plan}", { suma: suma(v.naklady), plan: suma(v.planovany_naklad) })}
                      {v.cerpanie_nakladu != null && ` (${v.cerpanie_nakladu} %)`}
                    </span>
                  </div>
                  <Prucok percento={v.cerpanie_nakladu ?? 0} obratene />
                </div>
              )}
            </div>
            {v.planovany_zisk != null && (
              <div className="mt-3 text-sm text-muted-foreground">
                {t("Plánovaný zisk {suma}, skutočný", { suma: suma(v.planovany_zisk) })}{" "}
                <span className={v.zisk < 0 ? "text-destructive" : "text-emerald-600"}>
                  {suma(v.zisk)}
                </span>
                .
              </div>
            )}
          </div>
        )}

        {j.note && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("Poznámka")}
            </div>
            <div className="whitespace-pre-wrap">{j.note}</div>
          </div>
        )}

        <Zoznam
          titulok="Vydané faktúry"
          prazdne="K zákazke zatiaľ nie je priradená žiadna faktúra."
          hlavicka={["Číslo", "Dátum", "Typ", "Bez DPH"]}
          riadky={data.faktury.map((f: any) => [
            <Link
              key={f.id}
              to="/faktury/$id"
              params={{ id: f.id }}
              className="text-primary hover:underline"
            >
              {f.invoice_number}
            </Link>,
            f.issue_date,
            f.type === "credit_note"
              ? t("Dobropis")
              : f.type === "debit_note"
                ? t("Ťarchopis")
                : f.type === "proforma"
                  ? t("Zálohová")
                  : t("Faktúra"),
            suma(Number(f.subtotal)),
          ])}
        />

        <Zoznam
          titulok="Prijaté faktúry"
          prazdne="Žiadny nákup priradený k zákazke."
          hlavicka={["Číslo", "Dodávateľ", "Dátum", "Bez DPH"]}
          riadky={data.prijate_faktury.map((f: any) => [
            f.invoice_number,
            f.supplier_name,
            f.issue_date,
            suma(Number(f.amount_without_vat)),
          ])}
        />

        <Zoznam
          titulok="Bločky"
          prazdne="Žiadny bloček priradený k zákazke."
          hlavicka={["Číslo", "Dodávateľ", "Dátum", "Bez DPH"]}
          riadky={(data.blocky ?? []).map((b: any) => [
            b.document_number ?? "—",
            b.supplier_name,
            b.issue_date,
            suma(nakladZBlocku(b)),
          ])}
        />

        <Zoznam
          titulok="Materiál zo skladu"
          prazdne="Zo skladu sa na zákazku zatiaľ nič nevydalo."
          hlavicka={["Položka", "sklad::Pohyb", "Množstvo", "Vážená cena", "Hodnota"]}
          riadky={data.pohyby.map((p: any) => [
            p.nazov,
            t(pohybNazov(p.type)),
            Number(p.quantity),
            p.unit_cost == null ? "—" : suma(Number(p.unit_cost)),
            suma(Number(p.unit_cost ?? 0) * Number(p.quantity)),
          ])}
        />

        <Zoznam
          titulok="Objednávky u dodávateľov"
          prazdne="Pre zákazku nie je objednané nič."
          poznamka="Objednaný tovar sa do nákladov nepočíta — náklad vznikne až jeho výdajom zo skladu."
          hlavicka={["Číslo", "Dodávateľ", "Objednané", "Očakávané", "Stav"]}
          riadky={(data.objednavky ?? []).map((o: any) => [
            <Link
              key={o.id}
              to="/sklad/objednavky/$id"
              params={{ id: o.id }}
              className="text-primary hover:underline"
            >
              {o.order_number}
            </Link>,
            o.supplier_name ?? "—",
            o.order_date,
            o.expected_date ?? "—",
            t(STAV_POPIS[o.status as StavObjednavky] ?? o.status),
          ])}
        />

        <Zoznam
          titulok="Jazdy"
          prazdne="K zákazke nie je priradená žiadna jazda."
          hlavicka={["Dátum", "Trasa", "Km", "Náklad"]}
          riadky={data.jazdy.map((t: any) => [
            t.trip_date,
            [t.start_location, t.end_location].filter(Boolean).join(" → ") || (t.purpose ?? "—"),
            Number(t.distance_km),
            suma(nakladZJazdy(t)),
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
            className="inline-flex items-center gap-1 text-sm text-destructive hover:underline disabled:opacity-50"
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
}: {
  titulok: string;
  prazdne: string;
  hlavicka: string[];
  riadky: React.ReactNode[][];
  poznamka?: string;
}) {
  const { t } = useT();
  return (
    <div className="mt-6">
      <div className="mb-2 text-sm font-medium">
        {t(titulok)} <span className="text-muted-foreground">({riadky.length})</span>
      </div>
      {poznamka && <div className="mb-2 text-xs text-muted-foreground">{t(poznamka)}</div>}
      {riadky.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {t(prazdne)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {hlavicka.map((h, i) => (
                  <th key={h} className={`p-3 ${i >= hlavicka.length - 2 ? "text-right" : ""}`}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {riadky.map((r, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  {r.map((c, k) => (
                    <td
                      key={k}
                      className={`p-3 ${k >= hlavicka.length - 2 ? "text-right tabular-nums" : ""}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
