import { useEffect, useMemo, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import {
  BadgeCheck,
  Camera,
  CloudOff,
  FileText,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  ExternalLink,
  FileInput,
} from "lucide-react";
import { DOKLADY, sPoctom } from "@/lib/faktero/mnozne";
import { fronta, zmazZFronty, type CakajuciDoklad } from "@/lib/mobile/doklady-fronta";
import { odosliCakajuce } from "@/lib/mobile/doklady-odoslanie";
import { MobilObrazovka, Pracujem } from "./MobilChrome";
import { formatovacMeny } from "@/lib/faktero/mena";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
/**
 * Prijaté doklady v mobilnej aplikácii.
 *
 * Naskenovaný bloček bolo dovtedy vidieť len v prehliadači — v telefóne po
 * uložení zmizol a nedalo sa overiť, či sa vôbec uložil. Tu je zoznam za
 * vybranú firmu a detail dokladu vrátane prílohy a položiek.
 */

type Doklad = {
  id: string;
  supplier_name: string | null;
  supplier_ico: string | null;
  supplier_ic_dph: string | null;
  document_number: string | null;
  issue_date: string | null;
  total_amount: number | string | null;
  vat_amount: number | string | null;
  net_amount: number | string | null;
  vat_rate: number | string | null;
  currency: string | null;
  payment_method: "hotovost" | "karta" | "prevod" | null;
  status: string | null;
  source: string | null;
  note: string | null;
  file_path: string | null;
  file_mime: string | null;
  items: unknown;
  vat_breakdown: unknown;
  created_at: string;
};

type Uhrada = "hotovost" | "karta" | "prevod";

/* Kľúče, nie hotové texty — konštanta je mimo komponentu a preklad tam
   nedosiahne. Prekladá sa až tam, kde sa spôsob úhrady vypisuje. */
const UHRADY: Record<Uhrada, Kluc> = {
  hotovost: "pd.hotovost",
  karta: "pd.kartou",
  prevod: "pd.prevodom",
};

function cislo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function suma(v: unknown, mena = "EUR"): string {
  const n = cislo(v);
  if (n == null) return "—";
  return formatovacMeny(mena, "sk-SK")(n);
}

/** „2026-08-09" → „9. 8. 2026". Zápis v ISO nikto nečíta ako dátum. */
export function datum(v?: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

/** „2026-08" → „august 2026" — mesiac sa v zozname používa ako predel. */
function nazovMesiaca(kluc: string): string {
  const [r, m] = kluc.split("-").map(Number);
  const d = new Date(r, (m || 1) - 1, 1);
  return d.toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
}

export function PrijateDoklady({
  firma,
  onSpat,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
}) {
  const { t } = usePreklad();
  const nacitaj = useOperacia("vydavky-zoznam");
  const navrhyFn = useOperacia("doklady-navrhy-parovania");
  const sparujFn = useOperacia("doklad-sparuj");
  const uhradyFn = useOperacia("doklady-uhrady");
  /** Ktorý doklad je uhradený z účtu, kedy a ktorým pohybom. Kľúč je id dokladu. */
  const [uhrady, setUhrady] = useState<Record<string, { datum: string; transactionId: string }>>(
    {},
  );
  const [navrhy, setNavrhy] = useState<any[]>([]);
  const [parujem, setParujem] = useState<string | null>(null);
  const citajBlocek = useOperacia("blocek-precitaj");
  const vytvorDoklad = useOperacia("vydavok-uloz");
  const [doklady, setDoklady] = useState<Doklad[] | null>(null);
  const [cakajuce, setCakajuce] = useState<CakajuciDoklad[]>([]);
  const [odosielam, setOdosielam] = useState(false);
  const [hladanie, setHladanie] = useState("");
  const [otvoreny, setOtvoreny] = useState<Doklad | null>(null);
  /** Zoznam sa nepodarilo načítať, lebo nie je signál. */
  const [nedostupne, setNedostupne] = useState(false);

  async function obnov() {
    setCakajuce(await fronta(firma.id));
    try {
      const rows = (await nacitaj({ data: { company_id: firma.id } })) as Doklad[];
      setDoklady(rows);
      /*
        Úhrady a návrhy sú príjemné, nie nutné — keď zlyhajú, zoznam dokladov
        sa aj tak ukáže. Preto zvlášť a ticho.
      */
      void (async () => {
        try {
          const ids = (rows ?? []).map((r: any) => r.id).slice(0, 200);
          const u = (await uhradyFn({ data: { company_id: firma.id, ids } })) as any;
          setUhrady(u?.uhrady ?? {});
          const n = (await navrhyFn({ data: { company_id: firma.id } })) as any;
          setNavrhy(n?.zhody ?? []);
        } catch {
          /* párovanie je nadstavba — bez neho zoznam funguje ďalej */
        }
      })();
    } catch (e: any) {
      // Bez signálu je prázdny zoznam očakávaný stav, nie chyba — hlásenie
      // „Failed to fetch" by tu človeka len postrašilo.
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      const online = await isOnline();
      // „Zatiaľ žiadne doklady" je tvrdenie, ktoré bez signálu nemáme čím
      // podložiť — a človek by si myslel, že o naskenované bločky prišiel.
      setNedostupne(!online);
      if (online) toast.error(e?.message ?? t("pd.chybaNacitania"));
      setDoklady([]);
    }
  }

  /**
   * Odloženú frontu skúsime poslať pri každom otvorení zoznamu a znovu, len čo
   * sa vráti signál — človek sa o to nemá prečo starať.
   */
  async function posliFrontu(nahlas: boolean) {
    if (odosielam) return;
    setOdosielam(true);
    try {
      const r = await odosliCakajuce(firma.id, citajBlocek as any, vytvorDoklad as any);
      if (r.odoslane > 0) toast.success(`Odoslané doklady: ${r.odoslane}`);
      else if (nahlas && r.zostalo > 0) toast.error(t("pd.bezSignalu"));
      if (r.odoslane > 0) await obnov();
      else setCakajuce(await fronta(firma.id));
    } finally {
      setOdosielam(false);
    }
  }

  useEffect(() => {
    (async () => {
      await obnov();
      if ((await fronta(firma.id)).length) await posliFrontu(false);
    })();
    // eslint-disable-next-line
  }, [firma.id]);

  useEffect(() => {
    const naSignal = () => posliFrontu(false);
    window.addEventListener("online", naSignal);
    return () => window.removeEventListener("online", naSignal);
    // eslint-disable-next-line
  }, [firma.id]);

  const najdene = useMemo(() => {
    const q = hladanie.trim().toLowerCase();
    if (!q) return doklady ?? [];
    return (doklady ?? []).filter((d) =>
      [d.supplier_name, d.document_number, d.supplier_ico]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [doklady, hladanie]);

  /* Zoskupenie po mesiacoch — bez neho je zoznam nekonečná stena riadkov. */
  const mesiace = useMemo(() => {
    const mapa = new Map<string, Doklad[]>();
    for (const d of najdene) {
      const kluc = (d.issue_date ?? d.created_at).slice(0, 7);
      if (!mapa.has(kluc)) mapa.set(kluc, []);
      mapa.get(kluc)!.push(d);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [najdene]);

  if (otvoreny) {
    return (
      <DetailDokladu
        uhrada={uhrady[otvoreny.id] ?? null}
        onRozparovane={() =>
          setUhrady((u) => {
            const kopia = { ...u };
            delete kopia[otvoreny.id];
            return kopia;
          })
        }
        doklad={otvoreny}
        firmaId={firma.id}
        onSpat={() => setOtvoreny(null)}
        onZmena={async () => {
          setOtvoreny(null);
          setDoklady(null);
          await obnov();
        }}
      />
    );
  }

  if (doklady === null) return <Pracujem text={t("pd.nacitavam")} />;

  return (
    <MobilObrazovka title={t("pd.nazov")} subtitle={firma.name} onBack={onSpat}>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={hladanie}
          onChange={(e) => setHladanie(e.target.value)}
          placeholder={t("pd.hladat")}
          className="w-full rounded-2xl border border-border/70 bg-card py-3 pl-9 pr-3 text-[15px] shadow-[var(--shadow-card)]"
        />
      </div>

      {/*
        Doklady, ktoré čakajú na signál. Sú hore a inak zafarbené — kým sa
        neodošlú, nie sú v účtovníctve a človek to musí vidieť na prvý pohľad.
      */}
      {cakajuce.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 px-4 py-3">
            <CloudOff className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <span className="flex-1 text-[14px] font-medium text-amber-800 dark:text-amber-200">
              Čaká na odoslanie: {sPoctom(cakajuce.length, DOKLADY)}
            </span>
            <button
              onClick={() => posliFrontu(true)}
              disabled={odosielam}
              className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-[13px] font-medium text-amber-900 disabled:opacity-60 dark:text-amber-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${odosielam ? "animate-spin" : ""}`} />
              {odosielam ? "Odosielam…" : t("pd.odoslat")}
            </button>
          </div>
          {cakajuce.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 border-t border-amber-500/25 px-4 py-3 text-[14px]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {d.vysledok?.supplier ?? t("pd.neprecitany")}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {new Date(d.ts).toLocaleString("sk-SK")}
                  {d.chyba ? ` · ${d.chyba}` : d.qr_raw ? " · s QR kódom" : ""}
                </span>
              </span>
              <button
                onClick={async () => {
                  await zmazZFronty(d.id);
                  setCakajuce(await fronta(firma.id));
                }}
                aria-label={t("pd.zahodit")}
                className="rounded-xl p-2 text-muted-foreground active:bg-secondary"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/*
        Návrhy na spárovanie s bankou. Hotovosť sa sem nedostane — v banke sa
        neobjaví. Nič sa nepáruje potichu, aj „isté" dvojice čakajú na ťuknutie.
      */}
      {navrhy.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-primary/40 bg-primary/5">
          <div className="px-4 py-3 text-[14px] font-medium">
            Našli sme platby k dokladom ({navrhy.length})
          </div>
          {navrhy.map((z) => (
            <div key={z.transactionId} className="border-t border-primary/20 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {z.doklad?.supplier_name ?? "Doklad"}
                </span>
                <span className="shrink-0 text-[14px] tabular-nums">
                  {suma(z.doklad?.total_amount, z.doklad?.currency ?? "EUR")}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {datum(z.pohyb?.booking_date)} · {z.dovody.join(" · ")}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={parujem === z.transactionId}
                  onClick={async () => {
                    setParujem(z.transactionId);
                    try {
                      await sparujFn({
                        data: { transaction_id: z.transactionId, expense_id: z.expenseId },
                      });
                      setUhrady((u) => ({
                        ...u,
                        [z.expenseId]: {
                          datum: z.pohyb?.booking_date,
                          transactionId: z.transactionId,
                        },
                      }));
                      setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId));
                      toast.success(t("pd.uhradenyZUctu"));
                    } catch (e: any) {
                      toast.error(e?.message ?? t("pd.chybaParovania"));
                    } finally {
                      setParujem(null);
                    }
                  }}
                  className="flex-1 rounded-xl bg-primary/15 px-3 py-2 text-[13px] font-medium text-primary disabled:opacity-60"
                >
                  {z.istota === "auto" ? t("pd.sparovat") : t("pd.anoPatriKSebe")}
                </button>
                <button
                  onClick={() =>
                    setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId))
                  }
                  className="rounded-xl border border-border px-3 py-2 text-[13px] text-muted-foreground"
                >
                  Nie
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {najdene.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <Receipt className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {hladanie ? t("pd.nicSaNenaslo") : nedostupne ? t("pd.bezPripojenia") : t("pd.ziadne")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hladanie
              ? t("pd.skusteInak")
              : nedostupne
                ? t("pd.odlozeneOdoslu")
                : t("pd.ziadnePopis")}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {mesiace.map(([kluc, riadky]) => {
            const spolu = riadky.reduce((s, d) => s + (cislo(d.total_amount) ?? 0), 0);
            return (
              <div key={kluc}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {nazovMesiaca(kluc)}
                  </h2>
                  <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                    {riadky.length} × · {suma(spolu, riadky[0]?.currency ?? "EUR")}
                  </span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
                  {riadky.map((d, i) => (
                    <button
                      key={d.id}
                      onClick={() => setOtvoreny(d)}
                      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-secondary ${
                        i > 0 ? "border-t border-border/70" : ""
                      }`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        {d.source === "qr" ? (
                          <QrCode className="h-4 w-4" />
                        ) : d.file_mime === "application/pdf" ? (
                          <FileText className="h-4 w-4" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-tight">
                          {d.supplier_name ?? t("pd.bezDodavatela")}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                          {datum(d.issue_date)}
                          {d.payment_method ? ` · ${t(UHRADY[d.payment_method])}` : ""}
                          {uhrady[d.id] ? ` · uhradené z účtu ${datum(uhrady[d.id].datum)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                        {suma(d.total_amount, d.currency ?? "EUR")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </MobilObrazovka>
  );
}

/* ------------------------- Detail dokladu ------------------------- */

function DetailDokladu({
  doklad,
  firmaId,
  onSpat,
  onZmena,
  uhrada: uhradaZUctu,
  onRozparovane,
}: {
  doklad: Doklad;
  firmaId: string;
  onSpat: () => void;
  onZmena: () => void;
  /** Pohyb, ktorým je doklad uhradený. `null`, keď spárovaný nie je. */
  uhrada: { datum: string; transactionId: string } | null;
  onRozparovane: () => void;
}) {
  const { t } = usePreklad();
  const urlFn = useOperacia("vydavok-subor");
  const rozparujFn = useOperacia("doklad-zrus-parovanie");
  const [rozparujem, setRozparujem] = useState(false);
  const updateFn = useOperacia("vydavok-uprav");
  const deleteFn = useOperacia("vydavok-zmaz");

  const [priloha, setPriloha] = useState<string | null>(null);
  const [uhrada, setUhrada] = useState<Uhrada | null>(doklad.payment_method ?? null);
  const [mazem, setMazem] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Faktúru od dodávateľa netreba nosiť do počítača — presunie sa rovno tu. */
  const [presuvam, setPresuvam] = useState(false);

  const mena = doklad.currency ?? "EUR";
  const polozky = Array.isArray(doklad.items) ? (doklad.items as any[]) : [];
  const rozpis = Array.isArray(doklad.vat_breakdown) ? (doklad.vat_breakdown as any[]) : [];

  useEffect(() => {
    if (!doklad.file_path) return;
    urlFn({ data: { file_path: doklad.file_path } })
      .then((r: any) => setPriloha(r.url))
      .catch(() => setPriloha(null));
    // eslint-disable-next-line
  }, [doklad.file_path]);

  /* Spôsob úhrady sa mení najčastejšie — pri skenovaní sa dá ľahko preklepnúť. */
  async function zmenUhradu(u: Uhrada) {
    setUhrada(u);
    setBusy(true);
    try {
      await updateFn({ data: { id: doklad.id, patch: { payment_method: u } } });
      toast.success(t("pd.sposobZmeneny"));
    } catch (e: any) {
      setUhrada(doklad.payment_method ?? null);
      toast.error(e?.message ?? "Zmena zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  async function doPrijatych() {
    setPresuvam(true);
    try {
      const { volajOperaciu } = await import("@/lib/mobile/server-most-volanie");
      await volajOperaciu("doklad-presun", { company_id: firmaId, id: doklad.id });
      toast.success(t("pd.presunuty"));
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Presun sa nepodaril.");
      setPresuvam(false);
    }
  }

  async function zmaz() {
    setBusy(true);
    try {
      await deleteFn({ data: { id: doklad.id } });
      toast.success(t("pd.zmazany"));
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Mazanie zlyhalo.");
      setBusy(false);
    }
  }

  return (
    <MobilObrazovka
      title={doklad.supplier_name ?? "Doklad"}
      subtitle={doklad.issue_date ? datum(doklad.issue_date) : undefined}
      onBack={onSpat}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="text-[32px] font-semibold leading-none tabular-nums">
            {suma(doklad.total_amount, mena)}
          </div>
          {cislo(doklad.vat_amount) != null && (
            <div className="mt-2 text-[13px] text-muted-foreground">
              základ {suma(doklad.net_amount, mena)} · DPH {suma(doklad.vat_amount, mena)}
              {rozpis.length > 1 ? ` (${rozpis.map((s) => `${s.sadzba} %`).join(" + ")})` : ""}
            </div>
          )}
          {doklad.source === "qr" && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <BadgeCheck className="h-3.5 w-3.5" /> Z Finančnej správy
            </div>
          )}
        </div>

        {/*
          Úhrada z účtu. Zrušiť sa dá tu, kde je vidieť — nie na inej obrazovke:
          keď človek zistí, že sa doklad spároval s cudzou platbou, je práve pri
          ňom a nemá to kde hľadať.
        */}
        {uhradaZUctu && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            <span className="min-w-0 flex-1 text-[14px]">
              Uhradené z účtu {datum(uhradaZUctu.datum)}
            </span>
            <button
              disabled={rozparujem}
              onClick={async () => {
                setRozparujem(true);
                try {
                  await rozparujFn({ data: { transaction_id: uhradaZUctu.transactionId } });
                  onRozparovane();
                  toast.success(t("pd.parovanieZrusene"));
                } catch (e: any) {
                  toast.error(e?.message ?? t("pd.chybaZrusenia"));
                } finally {
                  setRozparujem(false);
                }
              }}
              className="shrink-0 rounded-xl border border-border px-3 py-2 text-[13px] disabled:opacity-60"
            >
              Zrušiť
            </button>
          </div>
        )}

        <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-4 text-[14px] shadow-[var(--shadow-card)]">
          <Riadok label="IČO" value={doklad.supplier_ico ?? "—"} />
          <Riadok label="IČ DPH" value={doklad.supplier_ic_dph ?? "—"} />
          <Riadok label={t("pd.cisloDokladu")} value={doklad.document_number ?? "—"} />
          {doklad.note && <Riadok label={t("pd.poznamka")} value={doklad.note} />}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Spôsob úhrady</div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(UHRADY) as Uhrada[]).map((id) => (
              <button
                key={id}
                disabled={busy}
                onClick={() => zmenUhradu(id)}
                className={`rounded-2xl border py-3 text-[14px] transition active:scale-[0.98] disabled:opacity-60 ${
                  uhrada === id
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border/70 bg-card"
                }`}
              >
                {t(UHRADY[id])}
              </button>
            ))}
          </div>
        </div>

        {polozky.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border/70 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Položky ({polozky.length})
            </div>
            {polozky.map((p, i) => (
              <div
                key={i}
                className={`flex items-start justify-between gap-3 px-4 py-2.5 text-[14px] ${
                  i > 0 ? "border-t border-border/70" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block">{p.name || "—"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.quantity} × {suma(p.unit_price, mena)} · {p.vat_rate} %
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {suma(p.total ?? p.quantity * p.unit_price, mena)}
                </span>
              </div>
            ))}
          </div>
        )}

        {doklad.file_path && (
          <div>
            <div className="mb-2 text-sm font-medium">Doklad</div>
            {priloha ? (
              doklad.file_mime === "application/pdf" ? (
                <a
                  href={priloha}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm"
                >
                  <ExternalLink className="h-4 w-4" /> Otvoriť PDF
                </a>
              ) : (
                <a href={priloha} target="_blank" rel="noreferrer">
                  <img
                    src={priloha}
                    alt="doklad"
                    className="w-full rounded-xl border border-border object-contain"
                  />
                </a>
              )
            ) : (
              <p className="text-xs text-muted-foreground">Načítavam prílohu…</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={doPrijatych}
          disabled={busy || presuvam}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm disabled:opacity-50"
        >
          <FileInput className="h-4 w-4" />
          {presuvam ? t("pd.presuvam") : t("pd.presunut")}
        </button>

        {mazem ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium">Naozaj zmazať tento doklad?</p>
            <p className="mt-1 text-xs text-muted-foreground">Vrátiť sa to nedá.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setMazem(false)}
                className="rounded-xl border border-border px-4 py-2.5 text-sm"
              >
                Ponechať
              </button>
              <button
                onClick={zmaz}
                disabled={busy}
                className="rounded-xl bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              >
                Zmazať
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setMazem(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm text-muted-foreground"
          >
            <Trash2 className="h-4 w-4" /> Zmazať doklad
          </button>
        )}
      </div>
    </MobilObrazovka>
  );
}

function Riadok({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
