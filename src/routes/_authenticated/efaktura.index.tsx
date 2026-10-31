import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CheckCircle2, Circle, Clock, Info, Mail, AlertTriangle, Link2, Send } from "lucide-react";
import { toast } from "sonner";
import { AktivaciaEfakturyKroky } from "@/components/faktero/AktivaciaEfakturyKroky";
import { EfakturaPrijemNastavenia } from "@/components/faktero/EfakturaPrijemNastavenia";
import { dicPrePortal, jeEfakturaAktivovana } from "@/lib/faktero/efaktura-oznam";
import {
  getEfakturaReadinessFn,
  sparujEpostakFirmuFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import type { OdosielanieFirmy } from "@/lib/faktero/efaktura/types";

/** Kroky onboardingu „len odosielanie“, ktoré robí firma sama (podľa nextAction ePoštáka). */
const ROZBEHNUTE_ODOSIELANIE = new Set(["vytvorena", "caka_na_fs", "caka_na_potvrdenie", "aktivuje_sa"]);

/**
 * eFaktúra „len odosielanie“: firma prijíma u iného poskytovateľa a z Faktera
 * len odosiela. Keď je zapnutá, povie to štítok; kým sa zapína, kroky pre firmu.
 */
function LenOdosielanie({
  rezim,
  prijemProfil,
  odosielanie,
}: {
  rezim: string | null | undefined;
  prijemProfil: string | null | undefined;
  odosielanie: OdosielanieFirmy | null;
}) {
  const { t } = useT();
  const poskytovatel = prijemProfil || odosielanie?.prijemPoskytovatel || null;
  if (rezim === "len_odosielanie") {
    return (
      <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-6">
        <div className="flex items-start gap-3">
          <Send className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary-hover">
              {poskytovatel
                ? t("Len odosielanie — prijaté eFaktúry prichádzajú k {poskytovatel}", { poskytovatel })
                : t("Len odosielanie — prijaté eFaktúry prichádzajú k vášmu poskytovateľovi príjmu")}
            </span>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Z Faktera eFaktúry odosielate cez sieť Peppol. Prijaté eFaktúry aj odpovede odberateľov na vaše faktúry ostávajú u poskytovateľa, u ktorého ich prijímate — vo Fakteri sa nezobrazia.")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (!odosielanie) return null;
  if (ROZBEHNUTE_ODOSIELANIE.has(odosielanie.stav)) {
    const naFs = !odosielanie.nextAction || odosielanie.nextAction === "select_provider_on_pfs";
    const naMail = odosielanie.nextAction === "complete_client_activation";
    return (
      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <h2 className="text-lg font-semibold">{t("Zapína sa odosielanie eFaktúr z Faktera")}</h2>
        <p className="mt-1 text-sm">
          {poskytovatel
            ? t("Prijaté eFaktúry vám ďalej budú chodiť k {poskytovatel}. Na odosielanie z Faktera ostáva:", { poskytovatel })
            : t("Prijaté eFaktúry vám ďalej budú chodiť k vášmu poskytovateľovi príjmu. Na odosielanie z Faktera ostáva:")}
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li className={naFs || naMail ? "font-semibold" : ""}>
            {t("Na portáli FS vyberte ePošťák ako poštára na odosielanie a potvrďte e-mail")}
          </li>
          <li className={odosielanie.nextAction === "provider_approval" ? "font-semibold" : ""}>
            {t("Potom sa odosielanie zapne samo a dáme vám vedieť e-mailom.")}
          </li>
        </ol>
        <p className="mt-3 text-xs">
          {t("Poštára na príjem tým nemeníte — výber na portáli slúži len na overenie, že firma smie používať svoje Peppol ID.")}
        </p>
        {odosielanie.sprava && (
          <p className="mt-2 text-xs opacity-80">
            {t("Správa od ePoštáka:")} {odosielanie.sprava}
          </p>
        )}
      </div>
    );
  }
  if (odosielanie.stav === "zamietnuta" || odosielanie.stav === "chyba") {
    return (
      <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        {t("Zapnutie odosielania eFaktúr z Faktera sa nedokončilo. Napíšte nám, prosím, cez Pomoc a podporu — žiadosť obnovíme.")}
      </div>
    );
  }
  return null;
}

/**
 * Spárovanie firmy s jej záznamom u ePoštáka.
 *
 * Páruje sa podľa IČO. Keď firma u nich nie je, povie sa to rovno aj so
 * zoznamom toho, čo tam je — inak sa len háda, prečo sa nič nenašlo.
 */
function SparovanieSPostakom({
  companyId,
  profil,
}: {
  companyId: string | null;
  /** Uložený profil — spárovanie musí byť vidieť aj po obnovení stránky. */
  profil: {
    epostak_firm_id?: string | null;
    peppol_participant_id?: string | null;
    enabled?: boolean | null;
  } | null;
}) {
  const { t } = useT();
  const sparuj = useServerFn(sparujEpostakFirmuFn);
  const qc = useQueryClient();
  const [stav, setStav] = useState<any>(null);
  const [bezi, setBezi] = useState(false);

  async function spusti() {
    if (!companyId) return;
    setBezi(true);
    try {
      const r: any = await sparuj({ data: { company_id: companyId } });
      setStav(r);
      void qc.invalidateQueries({ queryKey: ["efaktura-readiness"] });
      if (r.sparovane) toast.success(t("Spárované s {nazov}.", { nazov: r.name }));
      else toast.error(t("Vaša firma u ePoštáka nie je — treba ju tam najprv zaregistrovať."));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBezi(false);
    }
  }

  return (
    <div id="sparovanie" className="mb-6 scroll-mt-20 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Odosielanie cez ePoštáka")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Bez spárovania sa eFaktúra nemá ako odoslať. Páruje sa podľa IČO vašej firmy.")}
          </p>
        </div>
        <button
          onClick={spusti}
          disabled={bezi || !companyId}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />{" "}
          {bezi ? t("Overujem…") : profil?.epostak_firm_id ? t("Overiť znova") : t("Spárovať")}
        </button>
      </div>

      {stav?.sparovane && (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          {t("Spárované s")} <span className="font-medium">{stav.name}</span>
          {stav.peppolId ? (
            <>
              {" "}
              · Peppol <span className="font-mono text-xs">{stav.peppolId}</span> (
              {stav.peppolStatus})
            </>
          ) : null}
        </div>
      )}
      {/* Po obnovení stránky výsledok kliknutia nie je — ukáže sa uložený stav. */}
      {!stav && profil?.epostak_firm_id && (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          {t("Spárované s ePoštákom")}
          {profil.peppol_participant_id ? (
            <>
              {" "}
              · Peppol <span className="font-mono text-xs">{profil.peppol_participant_id}</span>
            </>
          ) : (
            " · " + t("Peppol ID zatiaľ nepridelené")
          )}
          {" · "}
          {profil.enabled ? t("eFaktúra zapnutá") : t("eFaktúra vypnutá")}
        </div>
      )}
      {stav && !stav.sparovane && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {t("Firmu s IČO")} <span className="font-mono">{stav.ico}</span>{" "}
          {t("ePošták nepozná.")}
          {stav.dostupne?.length ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {t("Registrované sú:")} {stav.dostupne.map((f: any) => `${f.name} (${f.ico})`).join(", ")}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/efaktura/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "eFaktúra — Faktero") }] }),
  component: EFakturaPage,
});

type Status = "done" | "missing" | "soon";

function StatusPill({ status }: { status: Status }) {
  const { t } = useT();
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary-hover">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t("Hotovo")}
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
        <Circle className="h-3.5 w-3.5" /> {t("Chýba")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Clock className="h-3.5 w-3.5" /> {t("Pripravujeme")}
    </span>
  );
}

function EFakturaPage() {
  const { t } = useT();
  const [company, setCompany] = useState<any | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const id = getActiveCompanyId();
    setCompanyId(id);
    if (!id) return;
    supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setCompany(data));
  }, []);

  const readinessFn = useServerFn(getEfakturaReadinessFn);
  const readinessQuery = useQuery({
    queryKey: ["efaktura-readiness", companyId],
    queryFn: () => readinessFn({ data: { companyId: companyId! } }),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const profil = readinessQuery.data?.profile ?? null;
  const aktivovana = jeEfakturaAktivovana(profil);
  const odosielanie = readinessQuery.data?.odosielanie ?? null;
  const lenOdosielanie = profil?.rezim === "len_odosielanie";
  const odosielanieBezi = !!odosielanie && ROZBEHNUTE_ODOSIELANIE.has(odosielanie.stav);

  /* Z okna „Pripravte sa na e-Faktúru" sa sem prichádza s #prepojenie —
     sekcia sa vykreslí až po načítaní profilu, preto sa posúva až potom. */
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#prepojenie") return;
    if (!readinessQuery.data) return;
    document.getElementById("prepojenie")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [readinessQuery.data]);
  const checklist = useMemo(() => {
    const has = (v: any) => typeof v === "string" && v.trim().length > 0;
    const hasCompanyDetails =
      !!company && has(company.name) && (has(company.street) || has(company.city));
    return [
      {
        label: "Firemné údaje vyplnené",
        status: hasCompanyDetails ? "done" : ("missing" as Status),
      },
      { label: "IČO vyplnené", status: has(company?.ico) ? "done" : ("missing" as Status) },
      { label: "DIČ vyplnené", status: has(company?.dic) ? "done" : ("missing" as Status) },
      {
        label: "IČ DPH vyplnené, ak je firma platiteľ DPH",
        status: has(company?.ic_dph) ? "done" : ("missing" as Status),
      },
      { label: "IBAN vyplnený", status: has(company?.iban) ? "done" : ("missing" as Status) },
      // Skutočný stav z profilu eFaktúry — predtým tu bolo natvrdo „Pripravujeme“.
      {
        label: profil?.peppol_participant_id
          ? t("Peppol ID pripravené ({id})", { id: profil.peppol_participant_id })
          : t("Peppol ID pripravené"),
        status: profil?.peppol_participant_id ? "done" : ("missing" as Status),
      },
      {
        label: "eFaktúra režim aktivovaný",
        status: profil?.enabled ? "done" : ("missing" as Status),
      },
    ];
  }, [company, profil, t]);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error(t("Zadajte platný e-mail."));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("efaktura_interest_signups").insert({
      email: value,
      company_id: getActiveCompanyId(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("Ďakujeme! Ozveme sa s novinkami k eFaktúre."));
    setEmail("");
  }

  return (
    <>
      <PageHeader
        title={t("eFaktúra")}
        description={
          profil?.enabled && lenOdosielanie
            ? t("eFaktúry z Faktera odosielate cez sieť Peppol; prijímate ich u iného poskytovateľa.")
            : profil?.enabled
            ? t("eFaktúry posielate a prijímate cez sieť Peppol.")
            : t("Povinná elektronická fakturácia od 1. 1. 2027 — zapnite si ju cez Portál finančnej správy.")
        }
      />
      <PageBody>
        {/*
          Spárovanie s ePoštákom je prvá vec, bez ktorej sa neodošle nič —
          ich API chce identifikátor firmy pri každom volaní. Preto je nad
          skóre pripravenosti, nie zapadnuté v nastaveniach.
        */}
        {/*
          Aktivácia nie je nastavenie vo Fakteri — robí sa výberom poskytovateľa
          na Portáli finančnej správy. Sem vedie aj „Pokračovať na prepojenie“
          z oznamu o e-fakturácii 2027.
        */}
        {readinessQuery.data && (
          <LenOdosielanie
            rezim={profil?.rezim}
            prijemProfil={profil?.prijem_poskytovatel}
            odosielanie={odosielanie}
          />
        )}
        {readinessQuery.data && !aktivovana && !odosielanieBezi && (
          <div
            id="prepojenie"
            className="mb-6 scroll-mt-20 rounded-xl border border-primary/30 bg-card p-6"
          >
            <h2 className="text-lg font-semibold">{t("Ako zapnúť eFaktúru")}</h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              {t("Faktero vyberiete ako poskytovateľa eFaktúry na Portáli finančnej správy. Ak tam prístup nemáte, urobí to za vás účtovník so splnomocnením.")}
            </p>
            <AktivaciaEfakturyKroky
              dic={dicPrePortal(company?.dic) ?? company?.dic ?? null}
              nazovFirmy={company?.name ?? null}
            />
          </div>
        )}
        {/* Firmu „len odosielanie“ páruje onboarding u ePoštáka, nie IČO. */}
        {!lenOdosielanie && !odosielanieBezi && (
          <SparovanieSPostakom companyId={companyId} profil={profil} />
        )}
        {/* Kam sa zaradí zaevidovaná prijatá eFaktúra — len pri vlastnom príjme. */}
        {!lenOdosielanie && profil?.epostak_firm_id && <EfakturaPrijemNastavenia companyId={companyId} />}
        {readinessQuery.data && (
          <div className="mb-6 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{t("Skóre pripravenosti")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Vyhodnotenie firemných údajov, DPH, napojenia na Peppol a tvorby XML.")}
                </p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold text-primary">
                  {readinessQuery.data.score}%
                </div>
                <div className="text-xs text-muted-foreground">EN 16931 + Peppol BIS 3.0</div>
              </div>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${readinessQuery.data.score}%` }}
              />
            </div>
            {readinessQuery.data.blockers.length > 0 && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {t("Blokujúce nedostatky")} (
                  {readinessQuery.data.blockers.length})
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {readinessQuery.data.blockers.map((b) => (
                    <li key={b.key} className="flex items-center justify-between">
                      <span>{t(b.label)}</span>
                      {b.fixUrl === "/efaktura" ? (
                        /* Peppol nedostatky sa riešia spárovaním na tejto stránke —
                           odkaz na tú istú stránku by nespravil nič. */
                        <button
                          type="button"
                          onClick={() =>
                            document
                              .getElementById("sparovanie")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                          className="text-xs text-primary hover:underline"
                        >
                          {t("Spárovať")} →
                        </button>
                      ) : b.fixUrl ? (
                        <Link to={b.fixUrl} className="text-xs text-primary hover:underline">
                          {t("Opraviť")} →
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {readinessQuery.data.missing.filter((m) => m.severity === "warning").length > 0 && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-sm font-medium">{t("Upozornenia — zatiaľ nesplnené")}</div>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {readinessQuery.data.missing
                    .filter((m) => m.severity === "warning")
                    .map((m) => (
                      <li key={m.key}>
                        • {t(m.label)}
                        {m.hint ? ` — ${t(m.hint)}` : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {readinessQuery.isError && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {t("Skóre pripravenosti sa nepodarilo načítať:")}{" "}
            {(readinessQuery.error as Error).message}
          </div>
        )}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-7">{t("Čo je eFaktúra?")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("eFaktúra nie je PDF ani sken faktúry. Ide o štruktúrovaný XML formát, ktorému rozumejú účtovné a podnikové systémy.")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
            <h2 className="font-semibold">{t("Kontrola pripravenosti")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Skontrolujeme, či máte vyplnené všetko potrebné na prechod na eFaktúru.")}
            </p>
            <ul className="mt-4 divide-y divide-border">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center justify-between py-3">
                  <span className="text-sm">{t(item.label)}</span>
                  <StatusPill status={item.status} />
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <Link
                to="/firma"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50"
              >
                {t("Upraviť firemné údaje")}
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold">{t("Koho sa bude eFaktúra týkať")}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t("Platitelia DPH")}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t("Neplatitelia DPH pri prijímaní eFaktúr")}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t("B2B a B2G transakcie")}</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <Circle className="mt-0.5 h-4 w-4" />
                <span>{t("B2C transakcie zatiaľ nie")}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Odber noviniek dáva zmysel, kým firma eFaktúru nemá zapnutú. */}
        {!profil?.enabled && (
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <h2 className="font-semibold">{t("Chcem dostávať novinky k eFaktúre")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Pošleme vám e-mail pri každom dôležitom kroku — termíny povinnosti, zmeny pravidiel a novinky vo Fakteri.")}
                </p>
                <form onSubmit={onSignup} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("vas@email.sk")}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting ? t("Odosielam…") : t("Chcem novinky k eFaktúre")}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
