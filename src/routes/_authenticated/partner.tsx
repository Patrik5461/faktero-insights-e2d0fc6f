import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Handshake, Hourglass, Info, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";
import { ChybovyStav, NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { listPlans } from "@/lib/faktero/billing.functions";
import { formatujMenu } from "@/lib/faktero/mena";
import {
  NAZOV_STAVU_PROVIZIE,
  NAZOV_ZDROJA,
  PREDVOLENA_PROVIZIA_PCT,
  odkazPartnera,
  stavProvizieDnes,
  suhrnProvizii,
  type StavProvizie,
} from "@/lib/faktero/partner-program";
import {
  mojPartnerskyProgramFn,
  prihlasitDoPartnerskehoProgramuFn,
  type FirmaPartnera,
  type PartnerUctovnik,
  type ProviziaPartnera,
} from "@/lib/faktero/partner-program.functions";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

export const Route = createFileRoute("/_authenticated/partner")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Partnerský program — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>) => zoznamSearch(s),
  component: PartnerPage,
});

const QUERY_KEY = ["partnersky-program"];

/** Výber v prihláške — uloží sa text, admin ho len číta. */
const POCTY_KLIENTOV = ["do 10", "10–50", "50–150", "viac ako 150"];

const STAV_PREDPLATNEHO: Record<string, string> = {
  trialing: "Skúšobná verzia",
  active: "Aktívne",
  past_due: "Po splatnosti",
  cancelled: "Zrušené",
  expired: "Neaktívne",
};

const TON_PREDPLATNEHO: Record<string, TonStavu> = {
  trialing: "informacia",
  active: "uspech",
  past_due: "chyba",
  cancelled: "zruseny",
  expired: "neutralny",
};

const TON_PROVIZIE: Record<StavProvizie, TonStavu> = {
  caka: "priebeh",
  na_vyplatu: "pozor",
  vyplatene: "uspech",
  storno: "zruseny",
};

function eur(cents: number, mena = "EUR") {
  return formatujMenu(cents / 100, mena || "EUR");
}

function PartnerPage() {
  const { t } = useT();
  const nacitaj = useServerFn(mojPartnerskyProgramFn);
  const q = useQuery({ queryKey: QUERY_KEY, queryFn: () => nacitaj() });
  const partner = q.data?.partner ?? null;

  let obsah: ReactNode;
  if (q.isLoading) obsah = <NacitavanieStav />;
  else if (q.isError)
    obsah = (
      <ChybovyStav
        nadpis="Partnerský program sa nepodarilo načítať."
        popis={q.error instanceof Error ? q.error.message : undefined}
        akcia={
          <Button variant="outline" onClick={() => q.refetch()}>
            {t("Skúsiť znova")}
          </Button>
        }
      />
    );
  else if (!partner) obsah = <BezZaznamu />;
  else if (partner.stav === "ziadost") obsah = <CakaNaSchvalenie partner={partner} />;
  else if (partner.stav === "aktivny")
    obsah = <AktivnyPartner partner={partner} firmy={q.data!.firmy} provizie={q.data!.provizie} />;
  else obsah = <Neaktivny partner={partner} />;

  return (
    <>
      <PageHeader
        title={t("Partnerský program")}
        description={t("Pre účtovné kancelárie: odporúčajte Faktero klientom a dostávajte províziu.")}
      />
      <PageBody>{obsah}</PageBody>
    </>
  );
}

/* ───────────────────────── Stavy ───────────────────────── */

function Vysvetlenie() {
  const { t } = useT();
  const body = [
    t("Účet Faktero zdarma pre vašu kanceláriu — podmienky dohodneme pri schválení prihlášky."),
    t(
      "Provízia {pct} % z predplatného vašich klientov (bez DPH) po celý čas, kým klient platí.",
      { pct: PREDVOLENA_PROVIZIA_PCT },
    ),
    t("Provízia sa vypláca po 30 dňoch od platby klienta na váš IBAN."),
    t(
      "Klienti sa vám priradia odkazom na odporúčanie pri registrácii alebo tým, že ste v ich firme členom (napr. ako účtovník).",
    ),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="h-4 w-4 text-primary" /> {t("Ako program funguje")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {body.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function BezZaznamu() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <Vysvetlenie />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Prihláška do partnerského programu")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularPrihlasky partner={null} />
        </CardContent>
      </Card>
    </div>
  );
}

function CakaNaSchvalenie({ partner }: { partner: PartnerUctovnik }) {
  const { t, jazyk } = useT();
  const [upravujem, setUpravujem] = useState(false);
  const riadky: [string, string | null][] = [
    ["Názov kancelárie", partner.nazov],
    ["IČO", partner.ico],
    ["Kontaktná osoba", partner.kontakt_meno],
    ["E-mail", partner.email],
    ["Telefón", partner.telefon],
    ["Web", partner.web],
    ["IBAN na výplatu provízií", partner.iban],
    ["Počet klientov", partner.pocet_klientov],
    ["Poznámka", partner.poznamka],
  ];
  return (
    <div className="space-y-6">
      <Oznam ikona={<Hourglass className="h-4 w-4" />} nadpis={t("Prihláška čaká na schválenie")}>
        {t("Prihlášku sme prijali {datum}. Ozveme sa vám e-mailom, keď ju schválime.", {
          datum: new Date(partner.created_at).toLocaleDateString(lokalJazyka(jazyk)),
        })}
      </Oznam>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("Vaša prihláška")}</CardTitle>
          {!upravujem && (
            <Button variant="outline" size="sm" onClick={() => setUpravujem(true)}>
              {t("Upraviť prihlášku")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {upravujem ? (
            <FormularPrihlasky partner={partner} onHotovo={() => setUpravujem(false)} />
          ) : (
            <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              {riadky.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{t(k)}</dt>
                  <dd className="min-w-0 break-words max-sm:mb-1">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
      <Vysvetlenie />
    </div>
  );
}

function Neaktivny({ partner }: { partner: PartnerUctovnik }) {
  const { t } = useT();
  // Poznámka admina je interná — neukazuje sa.
  return partner.stav === "zamietnuty" ? (
    <Oznam ikona={<Info className="h-4 w-4" />} nadpis={t("Prihláška nebola schválená")}>
      {t("Vašu prihlášku do partnerského programu sme neschválili. Ak máte otázky, napíšte nám cez Pomoc a podporu.")}
    </Oznam>
  ) : (
    <Oznam ikona={<Info className="h-4 w-4" />} nadpis={t("Partnerstvo je pozastavené")}>
      {t("Nové provízie teraz nevznikajú. Ak máte otázky, napíšte nám cez Pomoc a podporu.")}
    </Oznam>
  );
}

function AktivnyPartner({
  partner,
  firmy,
  provizie,
}: {
  partner: PartnerUctovnik;
  firmy: FirmaPartnera[];
  provizie: ProviziaPartnera[];
}) {
  const { t } = useT();
  const odkaz = partner.kod ? odkazPartnera(partner.kod) : null;
  const suhrn = useMemo(() => suhrnProvizii(provizie), [provizie]);
  const platiace = firmy.filter((f) => f.stav_predplatneho === "active" && !f.zadarmo).length;

  async function kopiruj() {
    if (!odkaz) return;
    try {
      await navigator.clipboard.writeText(odkaz);
      toast.success(t("Odkaz skopírovaný"));
    } catch {
      toast.error(t("Kopírovanie sa nepodarilo — označte odkaz a skopírujte ho ručne."));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Váš odkaz na odporúčanie")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {odkaz ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Input
                readOnly
                value={odkaz}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t("Odkaz na odporúčanie")}
                className="min-w-0 flex-1 basis-64 font-mono text-xs"
              />
              <Button onClick={kopiruj} className="gap-1.5">
                <Copy className="h-4 w-4" /> {t("Kopírovať")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Kód partnera ešte nemáte pridelený.")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t(
              "Firma, ktorú klient založí cez tento odkaz, sa vám priradí. Priradia sa aj firmy, v ktorých ste členom. Provízia: {pct} % z predplatného bez DPH.",
              { pct: partner.provizia_pct },
            )}
          </p>
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Dlazdica nazov={t("Firiem")} hodnota={String(firmy.length)} />
        <Dlazdica nazov={t("Platiace")} hodnota={String(platiace)} />
        <Dlazdica nazov={t("Tento mesiac")} hodnota={eur(suhrn.tentoMesiacCents)} />
        <Dlazdica nazov={t("Čaká 30 dní")} hodnota={eur(suhrn.cakaCents)} />
        <Dlazdica nazov={t("Na výplatu")} hodnota={eur(suhrn.naVyplatuCents)} />
        <Dlazdica nazov={t("Vyplatené")} hodnota={eur(suhrn.vyplateneCents)} />
      </div>

      <Zoznamy firmy={firmy} provizie={provizie} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Údaje na výplatu")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularPrihlasky partner={partner} lenKontakt />
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────────────────── Zoznamy ───────────────────────── */

function Zoznamy({ firmy, provizie }: { firmy: FirmaPartnera[]; provizie: ProviziaPartnera[] }) {
  const { t, jazyk } = useT();
  const datum = (d: string | null) => (d ? new Date(d).toLocaleDateString(lokalJazyka(jazyk)) : "—");
  const nacitajPlany = useServerFn(listPlans);
  const plany = useQuery({ queryKey: ["plany-predplatneho"], queryFn: () => nacitajPlany() });
  const nazovPlanu = (slug: string | null) =>
    !slug ? "—" : ((plany.data ?? []) as any[]).find((p) => p.slug === slug)?.name ?? slug;

  // Obe tabuľky zdieľajú stránkovanie v adrese — vidno vždy len jednu záložku.
  const [zalozka, setZalozka] = useState<"klienti" | "provizie">("klienti");
  const lf = useListFilters({ pageSizeKey: "partner" });
  const strKlienti = useStrankovanie(
    firmy.map((f) => ({ ...f, id: f.company_id })),
    lf,
    { reset: zalozka },
  );
  const strProvizie = useStrankovanie(provizie, lf);
  const dnes = useMemo(() => new Date(), []);

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs value={zalozka} onValueChange={(v) => setZalozka(v as typeof zalozka)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="klienti">
                {t("Klienti")} ({firmy.length})
              </TabsTrigger>
              <TabsTrigger value="provizie">
                {t("Provízie")} ({provizie.length})
              </TabsTrigger>
            </TabsList>
            <Link
              to="/firmy"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <Users className="h-4 w-4" /> {t("Prehľad všetkých klientov")}
            </Link>
          </div>

          <TabsContent value="klienti" className="mt-4">
            {firmy.length === 0 ? (
              <Prazdne>{t("Zatiaľ vám nie je priradená žiadna firma.")}</Prazdne>
            ) : (
              <>
                {/* Mobil: karty */}
                <div className="space-y-2 md:hidden">
                  {strKlienti.viditelne.map((f) => (
                    <div key={f.company_id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="min-w-0 break-words font-semibold">{f.nazov}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-1 text-xs text-muted-foreground">
                        {f.ico && <span>{t("IČO {ico}", { ico: f.ico })} ·</span>}
                        <span>{t(NAZOV_ZDROJA[f.zdroj])} · {datum(f.od)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs">{nazovPlanu(f.plan)}</span>
                        <StavPredplatneho f={f} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{t("Firma")}</th>
                        <th className="px-3 py-2">{t("IČO")}</th>
                        <th className="px-3 py-2">{t("Ako priradená")}</th>
                        <th className="px-3 py-2">{t("Od")}</th>
                        <th className="px-3 py-2">{t("Plán")}</th>
                        <th className="px-3 py-2">{t("Predplatné")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strKlienti.viditelne.map((f) => (
                        <tr key={f.company_id} className="border-t border-border">
                          <td className="min-w-[200px] px-3 py-2 font-semibold">{f.nazov}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{f.ico ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{t(NAZOV_ZDROJA[f.zdroj])}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{datum(f.od)}</td>
                          <td className="px-3 py-2">{nazovPlanu(f.plan)}</td>
                          <td className="px-3 py-2">
                            <StavPredplatneho f={f} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {strKlienti.stranky()}
              </>
            )}
          </TabsContent>

          <TabsContent value="provizie" className="mt-4">
            {provizie.length === 0 ? (
              <Prazdne>{t("Provízie vzniknú z prvej zaplatenej platby predplatného vašich klientov.")}</Prazdne>
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {strProvizie.viditelne.map((p) => {
                    const stav = stavProvizieDnes(p, dnes);
                    return (
                      <div key={p.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 break-words font-semibold">{p.firma ?? "—"}</span>
                          <span className="font-semibold tabular-nums">{eur(p.provizia_cents, p.mena)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{datum(p.zaplatene_at)}</span>
                          <span>
                            {p.provizia_pct} % {t("z")} {eur(p.zaklad_cents, p.mena)}
                          </span>
                          <StavOdznak ton={TON_PROVIZIE[stav]} maly>
                            {t(NAZOV_STAVU_PROVIZIE[stav])}
                          </StavOdznak>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{t("Dátum platby")}</th>
                        <th className="px-3 py-2">{t("Firma")}</th>
                        <th className="px-3 py-2 text-right">{t("Základ bez DPH")}</th>
                        <th className="px-3 py-2 text-right">%</th>
                        <th className="px-3 py-2 text-right">{t("Provízia")}</th>
                        <th className="px-3 py-2">{t("Stav")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strProvizie.viditelne.map((p) => {
                        const stav = stavProvizieDnes(p, dnes);
                        return (
                          <tr key={p.id} className="border-t border-border">
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{datum(p.zaplatene_at)}</td>
                            <td className="min-w-[180px] px-3 py-2">{p.firma ?? "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {eur(p.zaklad_cents, p.mena)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {p.provizia_pct} %
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                              {eur(p.provizia_cents, p.mena)}
                            </td>
                            <td className="px-3 py-2">
                              <StavOdznak ton={TON_PROVIZIE[stav]} maly>
                                {t(NAZOV_STAVU_PROVIZIE[stav])}
                              </StavOdznak>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {strProvizie.stranky()}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StavPredplatneho({ f }: { f: FirmaPartnera }) {
  const { t } = useT();
  if (f.zadarmo) return <StavOdznak ton="neutralny" maly>{t("Zadarmo")}</StavOdznak>;
  if (!f.stav_predplatneho) return <span className="text-muted-foreground">—</span>;
  return (
    <StavOdznak ton={TON_PREDPLATNEHO[f.stav_predplatneho] ?? "neutralny"} maly>
      {t(STAV_PREDPLATNEHO[f.stav_predplatneho] ?? f.stav_predplatneho)}
    </StavOdznak>
  );
}

/* ───────────────────────── Formulár ───────────────────────── */

type Udaje = {
  nazov: string;
  ico: string;
  kontakt_meno: string;
  telefon: string;
  web: string;
  iban: string;
  pocet_klientov: string;
  poznamka: string;
};

function udajeZ(p: PartnerUctovnik | null): Udaje {
  return {
    nazov: p?.nazov ?? "",
    ico: p?.ico ?? "",
    kontakt_meno: p?.kontakt_meno ?? "",
    telefon: p?.telefon ?? "",
    web: p?.web ?? "",
    iban: p?.iban ?? "",
    pocet_klientov: p?.pocet_klientov ?? "",
    poznamka: p?.poznamka ?? "",
  };
}

/**
 * Prihláška aj jej úprava. Schválený partner (`lenKontakt`) mení len kontakt
 * a IBAN — server názov a IČO po schválení aj tak ignoruje.
 */
function FormularPrihlasky({
  partner,
  lenKontakt = false,
  onHotovo,
}: {
  partner: PartnerUctovnik | null;
  lenKontakt?: boolean;
  onHotovo?: () => void;
}) {
  const { t } = useT();
  const odosli = useServerFn(prihlasitDoPartnerskehoProgramuFn);
  const qc = useQueryClient();
  const [u, setU] = useState<Udaje>(() => udajeZ(partner));
  const [busy, setBusy] = useState(false);
  useEffect(() => setU(udajeZ(partner)), [partner]);
  /*
    Nová prihláška: názov a IČO z aktívnej firmy (účtovník po registrácii
    má založenú práve svoju kanceláriu). Prepíše len prázdne polia.
  */
  useEffect(() => {
    if (partner) return;
    const id = getActiveCompanyId();
    if (!id) return;
    let zrusene = false;
    void supabase
      .from("companies")
      .select("name, ico")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (zrusene || !data) return;
        setU((s) => ({
          ...s,
          nazov: s.nazov || data.name || "",
          ico: s.ico || data.ico || "",
        }));
      });
    return () => {
      zrusene = true;
    };
  }, [partner]);

  const pole = (k: keyof Udaje) => ({
    id: `partner-${k}`,
    value: u[k],
    onChange: (e: { target: { value: string } }) => setU((s) => ({ ...s, [k]: e.target.value })),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (u.nazov.trim().length < 2) {
      toast.error(t("Vyplňte názov kancelárie."));
      return;
    }
    setBusy(true);
    try {
      const r = await odosli({ data: u });
      toast.success(
        r.nova
          ? t("Prihláška odoslaná. Ozveme sa vám po schválení.")
          : lenKontakt
            ? t("Údaje na výplatu uložené.")
            : t("Prihláška upravená."),
      );
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
      onHotovo?.();
    } catch (err: any) {
      toast.error(err?.message ?? t("Uloženie sa nepodarilo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {!lenKontakt && (
          <>
            <Pole label={t("Názov kancelárie")} id="partner-nazov" povinne>
              <Input {...pole("nazov")} required minLength={2} maxLength={200} />
            </Pole>
            <Pole label={t("IČO")} id="partner-ico">
              <Input {...pole("ico")} maxLength={20} inputMode="numeric" />
            </Pole>
          </>
        )}
        <Pole label={t("Kontaktná osoba")} id="partner-kontakt_meno">
          <Input {...pole("kontakt_meno")} maxLength={200} autoComplete="name" />
        </Pole>
        <Pole label={t("Telefón")} id="partner-telefon">
          <Input {...pole("telefon")} maxLength={50} type="tel" autoComplete="tel" />
        </Pole>
        <Pole label={t("Web")} id="partner-web">
          <Input {...pole("web")} maxLength={300} placeholder="https://" />
        </Pole>
        <Pole label={t("IBAN na výplatu provízií")} id="partner-iban">
          <Input {...pole("iban")} maxLength={50} className="font-mono" placeholder="SK00 0000 0000 0000 0000 0000" />
        </Pole>
        {!lenKontakt && (
          <Pole label={t("Počet klientov")} id="partner-pocet_klientov">
            <select
              {...pole("pocet_klientov")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("Vyberte…")}</option>
              {POCTY_KLIENTOV.map((p) => (
                <option key={p} value={p}>
                  {t(p)}
                </option>
              ))}
            </select>
          </Pole>
        )}
      </div>
      {!lenKontakt && (
        <Pole label={t("Poznámka")} id="partner-poznamka">
          <Textarea {...pole("poznamka")} maxLength={2000} rows={3} />
        </Pole>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onHotovo && (
          <Button type="button" variant="outline" onClick={onHotovo} disabled={busy}>
            {t("Zrušiť")}
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy
            ? t("Ukladám…")
            : partner
              ? t("Uložiť")
              : t("Odoslať prihlášku")}
        </Button>
      </div>
    </form>
  );
}

/* ───────────────────────── Drobnosti ───────────────────────── */

function Pole({
  label,
  id,
  povinne,
  children,
}: {
  label: string;
  id: string;
  povinne?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {povinne && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function Oznam({ ikona, nadpis, children }: { ikona: ReactNode; nadpis: string; children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{ikona}</span>
      <div className="min-w-0">
        <div className="font-semibold text-foreground">{nadpis}</div>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function Dlazdica({ nazov, hodnota }: { nazov: string; hodnota: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="truncate text-xs text-muted-foreground">{nazov}</div>
      <div className="mt-1 break-words text-lg font-semibold tabular-nums">{hodnota}</div>
    </div>
  );
}

function Prazdne({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{children}</div>;
}
