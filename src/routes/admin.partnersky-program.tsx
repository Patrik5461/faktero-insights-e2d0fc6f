import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Loader2, Pause, Play, Plus, Save, Trash2, X } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { potvrd } from "@/lib/potvrdenie";
import { formatujMenu } from "@/lib/faktero/mena";
import {
  NAZOV_STAVU_PARTNERA,
  NAZOV_STAVU_PROVIZIE,
  odkazPartnera,
  stavProvizieDnes,
  type StavPartnera,
  type StavProvizie,
  type ZdrojPriradenia,
} from "@/lib/faktero/partner-program";
import {
  zoznamPartnerovUctovnikovFn,
  detailPartneraUctovnikaFn,
  upravPartneraUctovnikaFn,
  priradFirmuPartneroviAdminFn,
  oznacProvizieVyplateneFn,
  najdiUcetPrePartneraFn,
  pridajPartneraAdminFn,
  type PartnerVAdmine,
  type FirmaPartnera,
  type ProviziaPartnera,
} from "@/lib/faktero/partner-program.functions";

/*
  Admin → Partnerský program: účtovníci, ktorí odporúčajú Faktero klientom.
  Žiadosti sa schvaľujú tu (partner dostane kód a odkaz), tu sa mení provízia,
  priraďujú firmy a označujú provízie ako vyplatené po bankovom prevode.
  Čítať smie každý platform admin, meniť len superadmin (stráži server).
  Nezamieňať s Admin → Partneri — to sú logá v páse na hlavnej stránke.
*/
export const Route = createFileRoute("/admin/partnersky-program")({
  head: () => ({ meta: [{ title: "Admin · Partnerský program — Faktero" }] }),
  component: AdminPartnerskyProgramPage,
});

type Filter = StavPartnera | "vsetci";

const FILTRE: Array<{ k: Filter; text: string }> = [
  { k: "ziadost", text: "Žiadosti" },
  { k: "aktivny", text: "Aktívni" },
  { k: "pozastaveny", text: "Pozastavení" },
  { k: "zamietnuty", text: "Zamietnutí" },
  { k: "vsetci", text: "Všetci" },
];

const PORADIE_STAVU: Record<StavPartnera, number> = {
  ziadost: 0,
  aktivny: 1,
  pozastaveny: 2,
  zamietnuty: 3,
};

const TRIEDA_STAVU: Record<StavPartnera, string> = {
  ziadost: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  aktivny: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  pozastaveny: "bg-muted text-muted-foreground",
  zamietnuty: "bg-destructive/10 text-destructive",
};

const TRIEDA_PROVIZIE: Record<StavProvizie, string> = {
  caka: "bg-muted text-muted-foreground",
  na_vyplatu: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  vyplatene: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  storno: "bg-destructive/10 text-destructive",
};

/** Zdroj priradenia z pohľadu admina (NAZOV_ZDROJA je písaný pre partnera). */
const ZDROJ_ADMIN: Record<ZdrojPriradenia, string> = {
  odkaz: "Odkaz partnera",
  clen: "Partner je členom",
  admin: "Priradil admin",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const eur = (cents: number) => formatujMenu(cents / 100, "EUR");

function kedy(s: string | null | undefined, sCasom = false) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return sCasom ? d.toLocaleString("sk-SK") : d.toLocaleDateString("sk-SK");
}

function chyba(e: unknown, predvolene: string) {
  toast.error((e as Error)?.message || predvolene);
}

async function skopiruj(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Skopírované");
  } catch {
    toast.error("Kopírovanie zlyhalo.");
  }
}

function StavPartneraZnacka({ s }: { s: StavPartnera }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${TRIEDA_STAVU[s]}`}>
      {NAZOV_STAVU_PARTNERA[s]}
    </span>
  );
}

const TLACIDLO =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50";
const TLACIDLO_HLAVNE =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
const VSTUP = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const KLUC_ZOZNAMU = ["admin-partneri-uctovnici"] as const;

function AdminPartnerskyProgramPage() {
  const nacitaj = useServerFn(zoznamPartnerovUctovnikovFn);
  const {
    data: partneri,
    isLoading,
    error,
  } = useQuery({
    queryKey: KLUC_ZOZNAMU,
    queryFn: () => nacitaj(),
  });
  const [filter, setFilter] = useState<Filter>("vsetci");
  const [vybranyId, setVybranyId] = useState<string | null>(null);
  const [pridavam, setPridavam] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const pocty = useMemo(() => {
    const p: Record<Filter, number> = {
      ziadost: 0,
      aktivny: 0,
      pozastaveny: 0,
      zamietnuty: 0,
      vsetci: 0,
    };
    for (const r of partneri ?? []) {
      p[r.stav] += 1;
      p.vsetci += 1;
    }
    return p;
  }, [partneri]);

  const vyber = useMemo(
    () =>
      (partneri ?? [])
        .filter((r) => filter === "vsetci" || r.stav === filter)
        .sort((a, b) => PORADIE_STAVU[a.stav] - PORADIE_STAVU[b.stav]),
    [partneri, filter],
  );

  const vybrany = (partneri ?? []).find((p) => p.id === vybranyId) ?? null;

  useEffect(() => {
    if (vybranyId) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [vybranyId]);

  return (
    <>
      <AdminPageHeader
        title="Partnerský program"
        description="Účtovníci, ktorí odporúčajú Faktero klientom — schválenie, provízie a výplaty. Logá na hlavnej stránke sú v časti Partneri (logá na webe)."
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTRE.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              aria-pressed={filter === f.k}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === f.k
                  ? "border-primary bg-primary/10 text-primary"
                  : f.k === "ziadost" && pocty.ziadost > 0
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                    : "border-border hover:bg-secondary"
              }`}
            >
              {f.text}
              {partneri ? ` (${pocty[f.k]})` : ""}
            </button>
          ))}
          <button
            onClick={() => setPridavam((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Pridať partnera
          </button>
        </div>

        {pridavam && (
          <PridatPartnera
            onZavri={() => setPridavam(false)}
            onPridany={(id) => {
              setPridavam(false);
              setFilter("vsetci");
              setVybranyId(id);
            }}
          />
        )}

        <div ref={panelRef} className="scroll-mt-4">
          {vybrany && (
            <DetailPartnera key={vybrany.id} partner={vybrany} onZavri={() => setVybranyId(null)} />
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">E-mail / kontakt</th>
                <th className="px-3 py-2">Klientov (uvedené)</th>
                <th className="px-3 py-2">Stav</th>
                <th className="px-3 py-2">Kód</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2 text-right">Firiem / platiacich</th>
                <th className="px-3 py-2 text-right">Na výplatu</th>
                <th className="px-3 py-2 text-right">Vyplatené</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Načítavam…
                  </td>
                </tr>
              ) : vyber.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    {partneri?.length
                      ? "V tomto stave nikto nie je."
                      : "Zatiaľ sa nikto neprihlásil."}
                  </td>
                </tr>
              ) : (
                vyber.map((p) => (
                  <KlikatelnyRiadok
                    key={p.id}
                    naKlik={() => setVybranyId((v) => (v === p.id ? null : p.id))}
                    className={`border-t border-border align-top ${
                      p.id === vybranyId ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.nazov}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.ico ? `IČO ${p.ico}` : "bez IČO"} · {kedy(p.created_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="break-all">{p.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {[p.kontakt_meno, p.telefon].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{p.pocet_klientov || "—"}</td>
                    <td className="px-3 py-2">
                      <StavPartneraZnacka s={p.stav} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.kod ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.provizia_pct} %</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.firiem} / {p.platiacich}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                        p.naVyplatuCents > 0 ? "font-medium text-amber-700 dark:text-amber-400" : ""
                      }`}
                    >
                      {eur(p.naVyplatuCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {eur(p.vyplateneCents)}
                    </td>
                  </KlikatelnyRiadok>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminPageBody>
    </>
  );
}

function Udaj({ nazov, children }: { nazov: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{nazov}</dt>
      <dd className="break-words text-sm">{children || "—"}</dd>
    </div>
  );
}

function DetailPartnera({ partner, onZavri }: { partner: PartnerVAdmine; onZavri: () => void }) {
  const qc = useQueryClient();
  const nacitajDetail = useServerFn(detailPartneraUctovnikaFn);
  const upravFn = useServerFn(upravPartneraUctovnikaFn);
  const priradFn = useServerFn(priradFirmuPartneroviAdminFn);
  const vyplatFn = useServerFn(oznacProvizieVyplateneFn);

  const klucDetailu = ["admin-partner-uctovnik", partner.id];
  const { data: detail, isLoading } = useQuery({
    queryKey: klucDetailu,
    queryFn: () => nacitajDetail({ data: { id: partner.id } }),
  });
  const obnov = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: KLUC_ZOZNAMU }),
      qc.invalidateQueries({ queryKey: klucDetailu }),
    ]);

  const [priraditClenstva, setPriraditClenstva] = useState(partner.stav !== "pozastaveny");
  const [pct, setPct] = useState(String(partner.provizia_pct));
  const [poznamka, setPoznamka] = useState(partner.poznamka_admin ?? "");
  const [noveId, setNoveId] = useState("");
  const [vysledokSchvalenia, setVysledokSchvalenia] = useState<number | null>(null);

  useEffect(() => setPct(String(partner.provizia_pct)), [partner.provizia_pct]);
  useEffect(() => setPoznamka(partner.poznamka_admin ?? ""), [partner.poznamka_admin]);

  const uprava = useMutation({
    mutationFn: (zmena: {
      stav?: StavPartnera;
      provizia_pct?: number;
      poznamka_admin?: string | null;
      priraditClenstva?: boolean;
    }) => upravFn({ data: { id: partner.id, ...zmena } }),
    onSuccess: async (r, zmena) => {
      if (zmena.stav === "aktivny") {
        setVysledokSchvalenia(r.priradenych);
        toast.success(
          partner.stav === "ziadost" || partner.stav === "zamietnuty"
            ? "Partner schválený"
            : "Partner znovu aktívny",
        );
      } else if (zmena.stav) toast.success(`Stav: ${NAZOV_STAVU_PARTNERA[zmena.stav]}`);
      else toast.success("Uložené");
      await obnov();
    },
    onError: (e) => chyba(e, "Zmena zlyhala."),
  });

  const priradenie = useMutation({
    mutationFn: (v: { companyId: string; partnerId: string | null }) => priradFn({ data: v }),
    onSuccess: async (_r, v) => {
      toast.success(v.partnerId ? "Firma priradená" : "Firma odobratá");
      if (v.partnerId) setNoveId("");
      await obnov();
    },
    onError: (e) => chyba(e, "Priradenie zlyhalo."),
  });

  const vyplata = useMutation({
    mutationFn: () => vyplatFn({ data: { partnerId: partner.id } }),
    onSuccess: async (r) => {
      toast.success(
        r.pocet
          ? `Označené ako vyplatené: ${r.pocet} provízií, ${eur(r.sumaCents)}`
          : "Nebolo čo označiť.",
      );
      await obnov();
    },
    onError: (e) => chyba(e, "Označenie zlyhalo."),
  });

  const provizie: ProviziaPartnera[] = detail?.provizie ?? [];
  const firmy: FirmaPartnera[] = detail?.firmy ?? [];
  const naVyplatuCents = detail
    ? provizie
        .filter((p) => stavProvizieDnes(p) === "na_vyplatu")
        .reduce((s, p) => s + p.provizia_cents, 0)
    : partner.naVyplatuCents;

  const odkaz = partner.kod ? odkazPartnera(partner.kod) : null;
  const zaneprazdneny = uprava.isPending;

  async function schval() {
    uprava.mutate({ stav: "aktivny", priraditClenstva });
  }

  async function zmenStav(stav: StavPartnera, otazka: string) {
    if (!(await potvrd(otazka))) return;
    uprava.mutate({ stav });
  }

  async function ulozPct() {
    const n = Number(pct.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100)
      return toast.error("Provízia musí byť 0 až 100 %.");
    uprava.mutate({ provizia_pct: n });
  }

  async function odober(f: FirmaPartnera) {
    if (
      !(await potvrd(
        `Odobrať firmu „${f.nazov}" partnerovi ${partner.nazov}? Z jej ďalších platieb už provízia nevznikne.`,
      ))
    )
      return;
    priradenie.mutate({ companyId: f.company_id, partnerId: null });
  }

  async function pridaj() {
    const id = noveId.trim();
    if (!UUID.test(id)) return toast.error("Zadajte ID firmy (UUID z Admin → Firmy).");
    if (firmy.some((f) => f.company_id === id)) return toast.error("Firma už partnerovi patrí.");
    if (
      !(await potvrd(
        `Priradiť firmu ${id} partnerovi ${partner.nazov}? Ak má firma iného partnera, prepíše sa.`,
        { potvrdit: "Priradiť" },
      ))
    )
      return;
    priradenie.mutate({ companyId: id, partnerId: partner.id });
  }

  async function vyplat() {
    if (naVyplatuCents <= 0) return;
    const iban = partner.iban
      ? `Pošlite ${eur(naVyplatuCents)} na IBAN ${partner.iban} (${partner.nazov}).`
      : `Partner nemá vyplnený IBAN — ${eur(naVyplatuCents)} treba poslať podľa dohody.`;
    if (
      !(await potvrd(
        `${iban}\n\nOznačiť všetky provízie na výplatu ako vyplatené? Urobte to až po odoslaní prevodu.`,
        { potvrdit: `Vyplatené (${eur(naVyplatuCents)})` },
      ))
    )
      return;
    vyplata.mutate();
  }

  return (
    <section
      aria-label={`Detail partnera ${partner.nazov}`}
      className="mb-6 rounded-xl border border-primary/30 bg-card p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{partner.nazov}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StavPartneraZnacka s={partner.stav} />
            <span>Prihlásený {kedy(partner.created_at, true)}</span>
            {partner.schvalene_at && <span>· schválený {kedy(partner.schvalene_at)}</span>}
          </div>
        </div>
        <button onClick={onZavri} className={TLACIDLO} aria-label="Zavrieť detail">
          <X className="h-4 w-4" /> Zavrieť
        </button>
      </div>

      {/* Prihláška */}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Udaj nazov="IČO">{partner.ico}</Udaj>
        <Udaj nazov="Kontaktná osoba">{partner.kontakt_meno}</Udaj>
        <Udaj nazov="E-mail">
          <a href={`mailto:${partner.email}`} className="hover:underline">
            {partner.email}
          </a>
        </Udaj>
        <Udaj nazov="Telefón">{partner.telefon}</Udaj>
        <Udaj nazov="Web">
          {partner.web && (
            <a
              href={/^https?:\/\//i.test(partner.web) ? partner.web : `https://${partner.web}`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:underline"
            >
              {partner.web}
            </a>
          )}
        </Udaj>
        <Udaj nazov="Počet klientov (uvedené)">{partner.pocet_klientov}</Udaj>
        <Udaj nazov="IBAN na výplatu">
          {partner.iban && (
            <span className="inline-flex items-center gap-1 font-mono">
              {partner.iban}
              <button
                onClick={() => skopiruj(partner.iban!)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Skopírovať IBAN"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </Udaj>
        <Udaj nazov="Používateľ">
          <Link to="/admin/users/$id" params={{ id: partner.user_id }} className="hover:underline">
            Otvoriť účet
          </Link>
        </Udaj>
        <div className="sm:col-span-2 lg:col-span-4">
          <Udaj nazov="Poznámka z prihlášky">
            {partner.poznamka && <span className="whitespace-pre-wrap">{partner.poznamka}</span>}
          </Udaj>
        </div>
      </dl>

      {/* Kód a odkaz */}
      {partner.kod && odkaz && (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {vysledokSchvalenia !== null && (
            <div className="mb-2 flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Hotovo — priradených firiem podľa členstva: {vysledokSchvalenia}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Kód: <span className="font-mono font-semibold">{partner.kod}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              Odkaz: <span className="break-all font-mono text-xs">{odkaz}</span>
              <button
                onClick={() => skopiruj(odkaz)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Skopírovať odkaz"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        </div>
      )}

      {/* Akcie so stavom */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {(partner.stav === "ziadost" ||
          partner.stav === "zamietnuty" ||
          partner.stav === "pozastaveny") && (
          <>
            <label className="mr-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={priraditClenstva}
                onChange={(e) => setPriraditClenstva(e.target.checked)}
              />
              Priradiť firmy, kde je už členom
            </label>
            <button onClick={schval} disabled={zaneprazdneny} className={TLACIDLO_HLAVNE}>
              {zaneprazdneny ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : partner.stav === "pozastaveny" ? (
                <Play className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {partner.stav === "pozastaveny" ? "Znovu aktivovať" : "Schváliť"}
            </button>
          </>
        )}
        {partner.stav === "ziadost" && (
          <button
            onClick={() => zmenStav("zamietnuty", `Zamietnuť prihlášku „${partner.nazov}"?`)}
            disabled={zaneprazdneny}
            className={`${TLACIDLO} text-destructive`}
          >
            <X className="h-4 w-4" /> Zamietnuť
          </button>
        )}
        {partner.stav === "aktivny" && (
          <button
            onClick={() =>
              zmenStav(
                "pozastaveny",
                `Pozastaviť partnera „${partner.nazov}"? Jeho odkaz prestane priraďovať nové firmy.`,
              )
            }
            disabled={zaneprazdneny}
            className={TLACIDLO}
          >
            <Pause className="h-4 w-4" /> Pozastaviť
          </button>
        )}
      </div>

      {/* Provízia a poznámka */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <label htmlFor="partner-pct" className="mb-1 block text-xs text-muted-foreground">
            Provízia (%)
          </label>
          <div className="flex gap-2">
            <input
              id="partner-pct"
              inputMode="decimal"
              className={VSTUP}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
            <button
              onClick={ulozPct}
              disabled={zaneprazdneny || Number(pct.replace(",", ".")) === partner.provizia_pct}
              className={TLACIDLO}
              aria-label="Uložiť províziu"
            >
              <Save className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Platí pre nové platby, staré provízie sa nemenia.
          </p>
        </div>
        <div>
          <label htmlFor="partner-poznamka" className="mb-1 block text-xs text-muted-foreground">
            Interná poznámka (partner ju nevidí)
          </label>
          <textarea
            id="partner-poznamka"
            rows={2}
            className={VSTUP}
            value={poznamka}
            onChange={(e) => setPoznamka(e.target.value)}
          />
          <div className="mt-1 flex justify-end">
            <button
              onClick={() => uprava.mutate({ poznamka_admin: poznamka.trim() || null })}
              disabled={zaneprazdneny || poznamka === (partner.poznamka_admin ?? "")}
              className={TLACIDLO}
            >
              <Save className="h-4 w-4" /> Uložiť poznámku
            </button>
          </div>
        </div>
      </div>

      {/* Firmy */}
      <h3 className="mt-6 mb-2 text-sm font-semibold">Firmy partnera ({firmy.length})</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Načítavam…
        </p>
      ) : firmy.length === 0 ? (
        <p className="text-sm text-muted-foreground">Zatiaľ žiadne firmy.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Firma</th>
                <th className="px-3 py-2">Priradenie</th>
                <th className="px-3 py-2">Predplatné</th>
                <th className="px-3 py-2">Od</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {firmy.map((f) => (
                <tr key={f.company_id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <Link
                      to="/admin/companies/$id"
                      params={{ id: f.company_id }}
                      className="font-medium hover:underline"
                    >
                      {f.nazov}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {f.ico ? `IČO ${f.ico}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">{ZDROJ_ADMIN[f.zdroj] ?? f.zdroj}</td>
                  <td className="px-3 py-2">
                    {f.plan ?? "—"}
                    <div className="text-xs text-muted-foreground">
                      {f.zadarmo ? "zadarmo" : (f.stav_predplatneho ?? "bez predplatného")}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{kedy(f.od)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => odober(f)}
                      disabled={priradenie.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Odobrať
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          aria-label="ID firmy na priradenie"
          className={`${VSTUP} max-w-sm font-mono`}
          placeholder="ID firmy (UUID)"
          value={noveId}
          onChange={(e) => setNoveId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void pridaj();
          }}
        />
        <button
          onClick={pridaj}
          disabled={priradenie.isPending || !noveId.trim()}
          className={TLACIDLO}
        >
          <Plus className="h-4 w-4" /> Priradiť firmu
        </button>
      </div>

      {/* Provízie */}
      <div className="mt-6 mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Provízie ({provizie.length})</h3>
        <button
          onClick={vyplat}
          disabled={vyplata.isPending || naVyplatuCents <= 0}
          className={`${TLACIDLO_HLAVNE} ml-auto`}
        >
          {vyplata.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Označiť ako vyplatené ({eur(naVyplatuCents)})
        </button>
      </div>
      {naVyplatuCents > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {partner.iban ? (
            <>
              Poslať na IBAN <span className="font-mono text-foreground">{partner.iban}</span>
            </>
          ) : (
            <span className="text-destructive">Partner nemá vyplnený IBAN.</span>
          )}
        </p>
      )}
      {!isLoading && provizie.length === 0 ? (
        <p className="text-sm text-muted-foreground">Zatiaľ žiadne provízie.</p>
      ) : (
        provizie.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Zaplatené</th>
                  <th className="px-3 py-2">Firma</th>
                  <th className="px-3 py-2 text-right">Základ bez DPH</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Provízia</th>
                  <th className="px-3 py-2">Stav</th>
                  <th className="px-3 py-2">Vyplatená</th>
                </tr>
              </thead>
              <tbody>
                {provizie.map((p) => {
                  const stav = stavProvizieDnes(p);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{kedy(p.zaplatene_at)}</td>
                      <td className="px-3 py-2">{p.firma ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {formatujMenu(p.zaklad_cents / 100, p.mena)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.provizia_pct} %</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium">
                        {formatujMenu(p.provizia_cents / 100, p.mena)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${TRIEDA_PROVIZIE[stav]}`}
                        >
                          {NAZOV_STAVU_PROVIZIE[stav]}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {kedy(p.vyplatene_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

/* ───────────────────────── Ručné pridanie ───────────────────────── */

/**
 * Admin pridá účtovníka sám (napr. po telefonáte): účet musí existovať,
 * názov a IČO sa dajú prevziať z jeho firmy. Predvolene rovno aktívny.
 */
function PridatPartnera({
  onZavri,
  onPridany,
}: {
  onZavri: () => void;
  onPridany: (id: string) => void;
}) {
  const qc = useQueryClient();
  const najdiFn = useServerFn(najdiUcetPrePartneraFn);
  const pridajFn = useServerFn(pridajPartneraAdminFn);
  const [email, setEmail] = useState("");
  const [ucet, setUcet] = useState<Awaited<ReturnType<typeof najdiFn>> | null>(null);
  const [hladam, setHladam] = useState(false);
  const [nazov, setNazov] = useState("");
  const [ico, setIco] = useState("");
  const [kontakt, setKontakt] = useState("");
  const [telefon, setTelefon] = useState("");
  const [iban, setIban] = useState("");
  const [pct, setPct] = useState("20");
  const [poznamka, setPoznamka] = useState("");
  const [aktivovat, setAktivovat] = useState(true);
  const [priradit, setPriradit] = useState(true);

  async function over() {
    if (!email.trim()) return;
    setHladam(true);
    try {
      const r = await najdiFn({ data: { email: email.trim() } });
      setUcet(r);
      if (r.existuje) {
        if (!kontakt && r.meno) setKontakt(r.meno);
        const prva = r.firmy[0];
        if (prva && !nazov) {
          setNazov(prva.nazov);
          setIco(prva.ico ?? "");
        }
      }
    } catch (e) {
      chyba(e, "Účet sa nepodarilo overiť.");
    } finally {
      setHladam(false);
    }
  }

  const pridaj = useMutation({
    mutationFn: () => {
      const n = Number(pct.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Provízia musí byť 0 až 100 %.");
      return pridajFn({
        data: {
          email: email.trim(),
          nazov: nazov.trim(),
          ico: ico.trim() || null,
          kontakt_meno: kontakt.trim() || null,
          telefon: telefon.trim() || null,
          iban: iban.trim() || null,
          provizia_pct: n,
          poznamka_admin: poznamka.trim() || null,
          aktivovat,
          priraditClenstva: priradit,
        },
      });
    },
    onSuccess: async (r) => {
      toast.success(
        aktivovat
          ? `Partner pridaný a aktívny${r.kod ? ` (kód ${r.kod})` : ""}, priradených firiem: ${r.priradenych}.`
          : "Partner pridaný ako žiadosť.",
      );
      await qc.invalidateQueries({ queryKey: KLUC_ZOZNAMU });
      onPridany(r.id);
    },
    onError: (e) => chyba(e, "Partnera sa nepodarilo pridať."),
  });

  const vstup =
    "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const mozePridat = ucet?.existuje && !ucet.uzPartner && nazov.trim().length >= 2;

  return (
    <div className="mb-4 rounded-xl border border-primary/40 bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Pridať partnera ručne</h2>
        <button onClick={onZavri} className="rounded p-1 hover:bg-muted" aria-label="Zavrieť">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void over();
        }}
      >
        <label className="min-w-0 flex-1 text-xs font-medium sm:max-w-sm">
          E-mail účtu vo Fakteri
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setUcet(null);
            }}
            className={vstup}
            placeholder="uctovnik@kancelaria.sk"
          />
        </label>
        <button
          type="submit"
          disabled={hladam || !email.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {hladam && <Loader2 className="h-4 w-4 animate-spin" />}
          Overiť účet
        </button>
      </form>

      {ucet && !ucet.existuje && (
        <p className="mt-3 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          Účet s týmto e-mailom neexistuje. Nech sa účtovník najprv zaregistruje na
          faktero.sk/registracia (voľba „Účtovník alebo kancelária“) — potom ho sem pridáte.
        </p>
      )}
      {ucet?.uzPartner && (
        <p className="mt-3 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          Tento účet už v programe je — nájdete ho v zozname nižšie.
        </p>
      )}

      {ucet?.existuje && !ucet.uzPartner && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            pridaj.mutate();
          }}
        >
          {ucet.firmy.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Firmy účtu (klik prevezme názov a IČO):
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ucet.firmy.slice(0, 12).map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setNazov(f.nazov);
                      setIco(f.ico ?? "");
                    }}
                    className="max-w-full truncate rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground hover:bg-muted"
                  >
                    {f.nazov}
                    {f.ico ? ` · ${f.ico}` : ""}
                  </button>
                ))}
                {ucet.firmy.length > 12 && <span>+ {ucet.firmy.length - 12} ďalších</span>}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              Názov kancelárie *
              <input
                required
                minLength={2}
                value={nazov}
                onChange={(e) => setNazov(e.target.value)}
                className={vstup}
              />
            </label>
            <label className="text-xs font-medium">
              IČO
              <input value={ico} onChange={(e) => setIco(e.target.value)} className={vstup} />
            </label>
            <label className="text-xs font-medium">
              Kontaktná osoba
              <input
                value={kontakt}
                onChange={(e) => setKontakt(e.target.value)}
                className={vstup}
              />
            </label>
            <label className="text-xs font-medium">
              Telefón
              <input
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                className={vstup}
              />
            </label>
            <label className="text-xs font-medium">
              IBAN na výplatu (dá sa doplniť neskôr)
              <input value={iban} onChange={(e) => setIban(e.target.value)} className={vstup} />
            </label>
            <label className="text-xs font-medium">
              Provízia %
              <input
                inputMode="decimal"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className={vstup}
              />
            </label>
          </div>
          <label className="block text-xs font-medium">
            Interná poznámka
            <textarea
              rows={2}
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              className={vstup}
            />
          </label>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={aktivovat}
                onChange={(e) => setAktivovat(e.target.checked)}
              />
              Rovno aktivovať (dostane kód a odkaz)
            </label>
            <label className={`inline-flex items-center gap-2 ${aktivovat ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={priradit}
                disabled={!aktivovat}
                onChange={(e) => setPriradit(e.target.checked)}
              />
              Priradiť firmy, kde je už členom ({ucet.firmy.length})
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onZavri}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              disabled={!mozePridat || pridaj.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pridaj.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Pridať do programu
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
