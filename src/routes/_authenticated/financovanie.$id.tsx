import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { PrepojeneOstatneDoklady } from "@/components/faktero/ostatne/PrepojeneOstatneDoklady";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  detailZmluvyFn,
  navrhySplatokFn,
  oznacSplatkuFn,
  potvrdSplatkuFn,
  zmazZmluvuFn,
  sparujTerazFn,
  zrusSparovanieSplatkyFn,
} from "@/lib/faktero/financovanie.functions";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { Car, Check, FileText, Link2, Pencil, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FormularZmluvy } from "@/components/faktero/FormularZmluvy";
import { DetailKontokorentu } from "@/components/faktero/DetailKontokorentu";
import { SadzbaZmluvy } from "@/components/faktero/SadzbaZmluvy";
import { SplatkyDoPohody } from "@/components/faktero/SplatkyDoPohody";
import { RadSplatok } from "@/components/faktero/RadSplatok";
import { KartaVeritela } from "@/components/faktero/VeritelZmluvy";
import { nazovDruhuFinancovania } from "@/lib/faktero/kontokorent";
import { potvrd as potvrdAkciu } from "@/lib/potvrdenie";
import { Button } from "@/components/ui/button";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { StavOdznak } from "@/components/faktero/web/Stav";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
export const Route = createFileRoute("/_authenticated/financovanie/$id")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Zmluva o financovaní — Faktero") }],
  }),
  component: Stranka,
});

type Splatka = {
  id: string;
  number: number;
  due_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  vat_amount: number;
  insurance_part?: number;
  remaining_principal: number;
  paid_at: string | null;
  /* Zaúčtovanie do Pohody (migrácia 20261106123915) — prázdne = ako kalendár. */
  pohoda_predkontacia?: string | null;
  pohoda_clenenie_dph?: string | null;
  kv_clenenie?: string | null;
  exported_at?: string | null;
  /* Číslo dokladu z vlastného radu kalendára (migrácia 20261109180000). */
  cislo_dokladu?: string | null;
  paid_amount: number | null;
  bank_transaction_id: string | null;
};

function datum(d: string, jazyk: string = "sk"): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString(lokalJazyka(jazyk));
}

/** Nahratá zmluva sa otvára cez podpísaný odkaz — vedro je súkromné. */
async function otvorDokument(cesta: string, t: (s: string) => string = (s) => s) {
  const { data, error } = await supabase.storage
    .from("financing-documents")
    .createSignedUrl(cesta, 300);
  if (error || !data?.signedUrl) {
    toast.error(t("Dokument sa nepodarilo otvoriť."));
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

function Stranka() {
  const { t, jazyk } = useT();
  const { id } = useParams({ from: "/_authenticated/financovanie/$id" });
  const navigate = useNavigate();
  const nacitaj = useServerFn(detailZmluvyFn);
  const nacitajNavrhy = useServerFn(navrhySplatokFn);
  const oznac = useServerFn(oznacSplatkuFn);
  const potvrd = useServerFn(potvrdSplatkuFn);
  const zrus = useServerFn(zrusSparovanieSplatkyFn);
  const zmaz = useServerFn(zmazZmluvuFn);
  const sparujTeraz = useServerFn(sparujTerazFn);

  const [data, setData] = useState<any>(null);
  const [navrhy, setNavrhy] = useState<any[]>([]);
  const [pohyby, setPohyby] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [upravujem, setUpravujem] = useState(false);
  // Vybrané splátky na hromadný export do Pohody a vlastné kódy.
  const [vybrane, setVybrane] = useState<string[]>([]);
  // Keď zmluva neexistuje, servírka vyhodí chybu — bez tohto by na stránke
  // ostal navždy nápis „Načítavam…" a toast by medzitým zmizol.
  const [nenajdene, setNenajdene] = useState(false);

  const obnov = useCallback(async () => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const [d, n] = await Promise.all([
        nacitaj({ data: { company_id: cid, id } }),
        nacitajNavrhy({ data: { company_id: cid } }),
      ]);
      setData(d);
      // Zobrazujú sa len návrhy k tejto zmluve — inde by mýlili.
      setNavrhy((n.navrhy as any[]).filter((z) => z.contractId === id));
      setPohyby(n.pohyby as any[]);
    } catch (e: any) {
      setNenajdene(true);
      toast.error(e?.message ?? t("Zmluvu sa nepodarilo načítať."));
    }
  }, [id, nacitaj, nacitajNavrhy, t]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  async function urobit(praca: () => Promise<unknown>, hlaska: string) {
    setBusy(true);
    try {
      await praca();
      toast.success(hlaska);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <>
        <PageHeader title={t("Zmluva o financovaní")} />
        <PageBody>
          {nenajdene ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm">
              <p className="text-[15px] font-semibold">{t("Táto zmluva v aktívnej firme neexistuje.")}</p>
              <p className="mt-1 text-muted-foreground">
                {t("Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.")}
              </p>
              <Link
                to="/financovanie"
                className="mt-4 inline-block font-semibold text-primary underline-offset-2 hover:text-primary-hover hover:underline"
              >
                {t("Späť na leasingy a úvery")}
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <NacitavanieStav />
            </div>
          )}
        </PageBody>
      </>
    );
  }

  const z = data.zmluva;
  const splatky: Splatka[] = data.splatky;
  const s = data.suhrn;
  const dnes = dnesBratislava();
  const cid = getActiveCompanyId()!;
  const kontokorent = z.kind === "kontokorent";
  const vozidlo: { id: string; nazov: string } | null = data.vozidlo ?? null;
  const sPoistenim = splatky.some((r) => Number(r.insurance_part ?? 0) > 0);
  /* Stĺpec čísla dokladu len keď kalendár má vlastný rad alebo už pridelené čísla. */
  const sCislami = Boolean(z?.number_series_id) || splatky.some((r) => r.cislo_dokladu);
  const vsetkyVybrane = splatky.length > 0 && vybrane.length === splatky.length;
  const prepniVyber = (sid: string) =>
    setVybrane((v) => (v.includes(sid) ? v.filter((x) => x !== sid) : [...v, sid]));

  return (
    <>
      <PageHeader
        title={z.name}
        description={[
          t(nazovDruhuFinancovania(z.kind)),
          z.provider_name,
          z.contract_number ? t("zmluva {cislo}", { cislo: z.contract_number }) : null,
          z.schedule_source === "zmluva" ? t("kalendár prevzatý z dokumentu") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            {vozidlo && (
              <Button variant="outline" asChild>
                <Link to="/vozovy-park/$id" params={{ id: vozidlo.id }}>
                  <Car className="h-4 w-4" /> {vozidlo.nazov}
                </Link>
              </Button>
            )}
            {z.document_path && (
              <Button variant="outline" onClick={() => void otvorDokument(z.document_path, t)}>
                <FileText className="h-4 w-4" /> {t("Zmluva")}
              </Button>
            )}
            {!kontokorent && (
              <Button
                variant="outline"
                onClick={() =>
                  void urobit(async () => {
                    const r = await sparujTeraz({ data: { company_id: cid } });
                    /*
                     * Keď sa nič nespárovalo, je dôležité povedať prečo. „Hotovo"
                     * bez čísla vyzerá ako chyba aj vtedy, keď v banke jednoducho
                     * žiadna zodpovedajúca platba nie je.
                     */
                    if (r.zapisanych === 0 && r.navrhov === 0) {
                      throw new Error(
                        r.pohybov === 0
                          ? t("V banke nie sú žiadne nespárované odchádzajúce platby.")
                          : t(
                              "Prezrelo sa {n} odchádzajúcich platieb a ani jedna nesedí so splátkou. Skontrolujte variabilný symbol zmluvy.",
                              { n: r.pohybov },
                            ),
                      );
                    }
                  }, t("Párovanie s bankou prebehlo."))
                }
                disabled={busy}
              >
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {t("Spárovať s bankou")}
              </Button>
            )}
            <Button variant="outline" aria-pressed={upravujem} onClick={() => setUpravujem((x) => !x)}>
              <Pencil className="h-4 w-4" /> {upravujem ? t("Zavrieť úpravu") : t("Upraviť")}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (
                  !(await potvrdAkciu(
                    kontokorent
                      ? t(
                          "Zmazať zmluvu o kontokorente aj so spárovanými úrokmi a poplatkami? Pohyby v banke ostanú.",
                        )
                      : t("Zmazať zmluvu aj s celým splátkovým kalendárom?"),
                  ))
                )
                  return;
                void urobit(async () => {
                  await zmaz({ data: { company_id: cid, id } });
                  navigate({ to: "/financovanie" });
                }, t("Zmluva zmazaná."));
              }}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {t("Zmazať")}
            </Button>
          </div>
        }
      />
      <PageBody>
        {upravujem && (
          <div className="mb-6">
            <FormularZmluvy
              companyId={cid}
              zmluva={z}
              onZrusit={() => setUpravujem(false)}
              onUlozene={async (_id, splatok) => {
                toast.success(
                  kontokorent
                    ? t("Uložené.")
                    : t("Uložené, kalendár má {n} splátok.", { n: splatok }),
                );
                setUpravujem(false);
                await obnov();
              }}
            />
          </div>
        )}

        <KartaVeritela cid={cid} zmluva={z} onZmena={obnov} />

        {kontokorent ? (
          <>
            <DetailKontokorentu key={z.updated_at} cid={cid} zmluva={z} />
            {/* Kontokorent sa do Pohody neexportuje — rad sa len uloží. */}
            <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
              <RadSplatok cid={cid} zmluva={z} onZmena={obnov} kontokorent />
            </section>
          </>
        ) : (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Financovaná suma", formatujSumu(Number(z.principal), z.currency)],
                ["Zaplatíte spolu", formatujSumu(s.zaplatiSpolu, z.currency)],
                ["Z toho úrok", formatujSumu(s.urokSpolu, z.currency)],
                [
                  "Zostáva splatiť",
                  formatujSumu(
                    splatky.filter((r) => !r.paid_at).reduce((a, r) => a + r.amount, 0),
                    z.currency,
                  ),
                ],
              ].map(([popis, hodnota]) => (
                <div key={popis} className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="text-sm text-muted-foreground">{t(popis)}</div>
                  <div className="suma mt-1 text-xl">{hodnota}</div>
                </div>
              ))}
            </div>

            {z.rate_type === "pohybliva" && (
              <div className="mb-6">
                <SadzbaZmluvy
                  key={z.updated_at}
                  cid={cid}
                  contractId={z.id}
                  mena={z.currency || "EUR"}
                  pohybliva
                  dayCount={z.day_count ?? null}
                  indexFloor={z.index_floor ?? null}
                />
                <p className="mt-2 px-1 text-xs text-muted-foreground">
                  {t(
                    "Splátkový kalendár je spočítaný so sadzbou platnou pri uložení zmluvy. Keď banka po zmene indexu oznámi novú splátku, zmluvu upravte a uložte — nezaplatené splátky sa prepočítajú s dnešnou sadzbou.",
                  )}
                </p>
              </div>
            )}

            {navrhy.length > 0 && (
              <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:p-5">
                <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
                  <Link2 className="h-4 w-4 text-warning" /> {t("Platby, ktoré sem asi patria")}
                </h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  {t("Sami sa nespárovali — buď sa suma trochu líši, alebo platbu nič jednoznačne neidentifikuje.")}
                </p>
                <div className="space-y-2">
                  {navrhy.map((n) => {
                    const p = pohyby.find((x) => x.id === n.transactionId);
                    const sp = splatky.find((x) => x.id === n.installmentId);
                    return (
                      <div
                        key={n.transactionId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold">
                            <span className="whitespace-nowrap">{p ? datum(p.booking_date, jazyk) : "—"}</span> ·{" "}
                            <span className="suma">{p ? formatujSumu(Math.abs(p.amount), z.currency) : "—"}</span>
                            {sp ? ` → ${t("splátka č. {n}", { n: sp.number })}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {n.dovody.join(" · ")}
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            void urobit(
                              () =>
                                potvrd({
                                  data: {
                                    company_id: cid,
                                    installment_id: n.installmentId,
                                    transaction_id: n.transactionId,
                                  },
                                }),
                              t("Platba priradená k splátke."),
                            )
                          }
                          disabled={busy}
                          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                        >
                          {t("Priradiť")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <SplatkyDoPohody
              key={z.updated_at}
              cid={cid}
              zmluva={z}
              vybrane={vybrane}
              pocetSplatok={splatky.length}
              onZmena={obnov}
            />

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 p-3 text-left">
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať všetky splátky")}
                        checked={vsetkyVybrane}
                        onChange={() => setVybrane(vsetkyVybrane ? [] : splatky.map((r) => r.id))}
                      />
                    </th>
                    <th className="p-3 text-left font-semibold whitespace-nowrap">{t("Č.")}</th>
                    {sCislami && (
                      <th className="p-3 text-left font-semibold whitespace-nowrap">{t("Číslo dokladu")}</th>
                    )}
                    <th className="p-3 text-left font-semibold whitespace-nowrap">{t("Splatnosť")}</th>
                    <th className="p-3 text-right font-semibold whitespace-nowrap">{t("Splátka")}</th>
                    <th className="p-3 text-right font-semibold whitespace-nowrap">{t("Istina")}</th>
                    <th className="p-3 text-right font-semibold whitespace-nowrap">{t("Úrok")}</th>
                    {sPoistenim && <th className="p-3 text-right font-semibold whitespace-nowrap">{t("Poistenie")}</th>}
                    {(Number(z.vat_rate) > 0 || splatky.some((r) => r.vat_amount > 0)) && <th className="p-3 text-right font-semibold whitespace-nowrap">{t("DPH")}</th>}
                    <th className="p-3 text-right font-semibold whitespace-nowrap">{t("Zostatok istiny")}</th>
                    <th className="p-3 text-left font-semibold whitespace-nowrap">{t("Pohoda")}</th>
                    <th className="p-3 text-right font-semibold whitespace-nowrap">{t("Stav")}</th>
                  </tr>
                </thead>
                <tbody>
                  {splatky.map((r) => {
                    const poSplatnosti = !r.paid_at && r.due_date < dnes;
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            aria-label={t("Vybrať splátku č. {n}", { n: r.number })}
                            checked={vybrane.includes(r.id)}
                            onChange={() => prepniVyber(r.id)}
                          />
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">{r.number}</td>
                        {sCislami && (
                          <td className="whitespace-nowrap p-3 font-mono text-xs tabular-nums">
                            {r.cislo_dokladu || <span className="text-muted-foreground">—</span>}
                          </td>
                        )}
                        <td
                          className={`whitespace-nowrap p-3 ${poSplatnosti ? "font-semibold text-destructive" : ""}`}
                        >
                          {datum(r.due_date, jazyk)}
                        </td>
                        <td className="suma p-3 text-right">
                          {formatujSumu(r.amount, z.currency)}
                        </td>
                        <td className="suma p-3 text-right font-normal">
                          {formatujSumu(r.principal_part, z.currency)}
                        </td>
                        <td className="suma p-3 text-right font-normal text-muted-foreground">
                          {formatujSumu(r.interest_part, z.currency)}
                        </td>
                        {sPoistenim && (
                          <td className="suma p-3 text-right font-normal text-muted-foreground">
                            {formatujSumu(Number(r.insurance_part ?? 0), z.currency)}
                          </td>
                        )}
                        {(Number(z.vat_rate) > 0 || splatky.some((x) => x.vat_amount > 0)) && (
                          <td className="suma p-3 text-right font-normal text-muted-foreground">
                            {formatujSumu(r.vat_amount, z.currency)}
                          </td>
                        )}
                        <td className="suma p-3 text-right font-normal text-muted-foreground">
                          {formatujSumu(r.remaining_principal, z.currency)}
                        </td>
                        <td className="p-3 text-xs">
                          <div className="flex flex-wrap items-center gap-1">
                            {[r.pohoda_predkontacia, r.pohoda_clenenie_dph, r.kv_clenenie].some(Boolean) && (
                              <span
                                title={t("Vlastné kódy splátky (prebíjajú kalendár)")}
                                className="whitespace-nowrap font-mono text-foreground"
                              >
                                {[r.pohoda_predkontacia, r.pohoda_clenenie_dph, r.kv_clenenie]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                            {r.exported_at ? (
                              <StavOdznak ton="informacia" maly className="whitespace-nowrap">
                                {t("exportovaná {d}", { d: datum(r.exported_at.slice(0, 10), jazyk) })}
                              </StavOdznak>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          {r.paid_at ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <StavOdznak ton="uspech" maly ikona={<Check />} className="whitespace-nowrap">
                                {datum(r.paid_at, jazyk)}
                                {r.bank_transaction_id ? ` ${t("(z banky)")}` : ""}
                              </StavOdznak>
                              <button
                                title={t("Vrátiť späť")}
                                onClick={() =>
                                  void urobit(
                                    () =>
                                      r.bank_transaction_id
                                        ? zrus({ data: { company_id: cid, installment_id: r.id } })
                                        : oznac({
                                            data: {
                                              company_id: cid,
                                              installment_id: r.id,
                                              paid_at: null,
                                            },
                                          }),
                                    t("Splátka je zase otvorená."),
                                  )
                                }
                                disabled={busy}
                                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                void urobit(
                                  () =>
                                    oznac({
                                      data: {
                                        company_id: cid,
                                        installment_id: r.id,
                                        paid_at: dnes,
                                        paid_amount: r.amount,
                                      },
                                    }),
                                  t("Splátka označená za zaplatenú."),
                                )
                              }
                              disabled={busy}
                              className="whitespace-nowrap rounded-md border border-input bg-background px-2.5 py-1 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                            >
                              {t("Zaplatené")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-4 px-1 text-xs text-muted-foreground">
              {t("Platby z napojenej banky sa priraďujú samy pri každom sťahovaní pohybov. Ručne odškrtnúť sa dá vždy — hodí sa, keď splátka odišla z účtu, ktorý vo Fakteri napojený nie je.")}{" "}
              <Link to="/financovanie" className="font-semibold text-primary hover:text-primary-hover hover:underline">
                {t("Späť na zoznam")}
              </Link>
            </p>
          </>
        )}

        <section className="mt-8">
          <h2 className="mb-2 px-1 text-base font-semibold">{t("Doklady k zmluve")}</h2>
          <PrepojeneOstatneDoklady
            cid={cid}
            financingContractId={id}
            druhNoveho="leasing_uver"
            popisPrazdny={t("Oznámenia banky, dodatky, predpisy poistenia a ďalšie doklady z Iných dokladov.")}
            tlacidlo={t("Pridať doklad")}
          />
        </section>
      </PageBody>
    </>
  );
}
