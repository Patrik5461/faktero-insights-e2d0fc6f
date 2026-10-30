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
import { Check, FileText, Link2, Pencil, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FormularZmluvy } from "@/components/faktero/FormularZmluvy";
import { DetailKontokorentu } from "@/components/faktero/DetailKontokorentu";
import { SadzbaZmluvy } from "@/components/faktero/SadzbaZmluvy";
import { nazovDruhuFinancovania } from "@/lib/faktero/kontokorent";
import { potvrd as potvrdAkciu } from "@/lib/potvrdenie";

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
  remaining_principal: number;
  paid_at: string | null;
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
              <p>{t("Táto zmluva v aktívnej firme neexistuje.")}</p>
              <p className="mt-1 text-muted-foreground">
                {t("Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.")}
              </p>
              <Link to="/financovanie" className="mt-4 inline-block text-primary underline">
                {t("Späť na leasingy a úvery")}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
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
          <div className="flex gap-2">
            {z.document_path && (
              <button
                onClick={() => void otvorDokument(z.document_path, t)}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4" /> {t("Zmluva")}
              </button>
            )}
            {!kontokorent && (
              <button
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
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {t("Spárovať s bankou")}
              </button>
            )}
            <button
              onClick={() => setUpravujem((x) => !x)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <Pencil className="h-4 w-4" /> {upravujem ? t("Zavrieť úpravu") : t("Upraviť")}
            </button>
            <button
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
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {t("Zmazať")}
            </button>
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

        {kontokorent ? (
          <DetailKontokorentu key={z.updated_at} cid={cid} zmluva={z} />
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
                <div key={popis} className="rounded-xl border bg-card p-4">
                  <div className="text-xs text-muted-foreground">{t(popis)}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{hodnota}</div>
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
              <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4" /> {t("Platby, ktoré sem asi patria")}
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
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">
                            {p ? datum(p.booking_date, jazyk) : "—"} ·{" "}
                            {p ? formatujSumu(Math.abs(p.amount), z.currency) : "—"}
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
                          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                        >
                          {t("Priradiť")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">{t("Č.")}</th>
                    <th className="p-3 text-left font-medium">{t("Splatnosť")}</th>
                    <th className="p-3 text-right font-medium">{t("Splátka")}</th>
                    <th className="p-3 text-right font-medium">{t("Istina")}</th>
                    <th className="p-3 text-right font-medium">{t("Úrok")}</th>
                    {Number(z.vat_rate) > 0 && <th className="p-3 text-right font-medium">{t("DPH")}</th>}
                    <th className="p-3 text-right font-medium">{t("Zostatok istiny")}</th>
                    <th className="p-3 text-right font-medium">{t("Stav")}</th>
                  </tr>
                </thead>
                <tbody>
                  {splatky.map((r) => {
                    const poSplatnosti = !r.paid_at && r.due_date < dnes;
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3 text-muted-foreground">{r.number}</td>
                        <td className={`p-3 ${poSplatnosti ? "text-destructive" : ""}`}>
                          {datum(r.due_date, jazyk)}
                        </td>
                        <td className="p-3 text-right font-medium tabular-nums">
                          {formatujSumu(r.amount, z.currency)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatujSumu(r.principal_part, z.currency)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {formatujSumu(r.interest_part, z.currency)}
                        </td>
                        {Number(z.vat_rate) > 0 && (
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {formatujSumu(r.vat_amount, z.currency)}
                          </td>
                        )}
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {formatujSumu(r.remaining_principal, z.currency)}
                        </td>
                        <td className="p-3 text-right">
                          {r.paid_at ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                                <Check className="h-3.5 w-3.5" />
                                {datum(r.paid_at, jazyk)}
                                {r.bank_transaction_id ? ` ${t("(z banky)")}` : ""}
                              </span>
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
                                className="text-muted-foreground hover:text-foreground"
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
                              className="rounded-lg border px-2.5 py-1 text-xs"
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
              <Link to="/financovanie" className="text-primary">
                {t("Späť na zoznam")}
              </Link>
            </p>
          </>
        )}

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium">{t("Doklady k zmluve")}</h2>
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
