import { useEffect, useMemo, useRef, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import {
  BadgeCheck,
  Camera,
  Check,
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
import { fronta, zmazZFronty, type CakajuciDoklad } from "@/lib/mobile/doklady-fronta";
import { odosliCakajuce } from "@/lib/mobile/doklady-odoslanie";
import { MobilObrazovka, Pracujem } from "./MobilChrome";
import { formatovacMeny, formatujMenu } from "@/lib/faktero/mena";
import { potvrd } from "@/lib/potvrdenie";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import {
  daSaUpravit,
  orezVyber,
  prepniVyber,
  suhrnVyberu,
  vsetkyVybrane,
  vybratVsetko,
  type SucetMeny,
  type SuhrnVyberu,
} from "@/lib/mobile/vyber-dokladov";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
import { OznacenieDokladu, PoznamkaDokladu } from "./DokladOznacenie";
import { FilterChips } from "./ui";
import { PrijateFaktury } from "./PrijateFaktury";
import { daSaPresunutMedziPrijate } from "@/lib/faktero/doklad-je-blocek";
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
  /* Zoznam vracia celý riadok (`select *`) — tieto stĺpce potrebuje výber. */
  category?: string | null;
  exported_at?: string | null;
  locked_at?: string | null;
  komentar?: string | null;
  stav_id?: string | null;
  stitky?: string[] | null;
  /* Podľa nich sa pozná bloček z pokladnice — ten sa medzi prijaté faktúry nepresúva. */
  qr_raw?: string | null;
  ai_raw?: unknown;
};

/** Bločky a prijaté faktúry sú v Dokladoch vedľa seba — prepína ich lišta hore. */
export type AgendaDokladov = "blocky" | "faktury";

export function PrepinacDokladov({
  aktivna,
  onZmen,
}: {
  aktivna: AgendaDokladov;
  onZmen: (a: AgendaDokladov) => void;
}) {
  const { t } = usePreklad();
  return (
    <div className="mb-4">
      <FilterChips
        ariaLabel={t("pf.agenda")}
        aktivna={aktivna}
        onZmen={onZmen}
        moznosti={[
          { kod: "blocky", popis: t("pf.blocky") },
          { kod: "faktury", popis: t("pf.nazov") },
        ]}
      />
    </div>
  );
}

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

function suma(v: unknown, mena = "EUR", loc = "sk-SK"): string {
  const n = cislo(v);
  if (n == null) return "—";
  return formatovacMeny(mena, loc)(n);
}

/** „2026-08-09" → „9. 8. 2026". Zápis v ISO nikto nečíta ako dátum. */
export function datum(v?: string | null, loc = "sk-SK"): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  /* Poradie dňa a mesiaca je v každom jazyku iné — nechávame ho na systéme. */
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(loc);
}

/** „2026-08" → „august 2026" — mesiac sa v zozname používa ako predel. */
function nazovMesiaca(kluc: string, loc: string): string {
  const [r, m] = kluc.split("-").map(Number);
  const d = new Date(r, (m || 1) - 1, 1);
  return d.toLocaleDateString(loc, { month: "long", year: "numeric" });
}

export function PrijateDoklady({
  firma,
  onSpat,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
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
  const [agenda, setAgenda] = useState<AgendaDokladov>("blocky");
  /** Zoznam sa nepodarilo načítať, lebo nie je signál. */
  const [nedostupne, setNedostupne] = useState(false);
  /*
    Výber viacerých dokladov — dlhým podržaním riadku alebo tlačidlom
    „Vybrať". Dole sa ukáže lišta so súčtami a hromadnými akciami.
  */
  const [vyberam, setVyberam] = useState(false);
  const [vybrane, setVybrane] = useState<Set<string>>(() => new Set());
  const [hromadne, setHromadne] = useState(false);
  const upravFn = useOperacia("vydavok-uprav");
  const zmazFn = useOperacia("vydavok-zmaz");
  /** Dlhé podržanie: časovač a či už výber zapol (vtedy sa ťuknutie nepočíta). */
  const podrzanie = useRef<{ casovac: ReturnType<typeof setTimeout> | null; zaplo: boolean }>({
    casovac: null,
    zaplo: false,
  });

  async function obnov() {
    setCakajuce(await fronta(firma.id));
    try {
      const rows = (await nacitaj({ data: { company_id: firma.id } })) as Doklad[];
      setDoklady(rows);
      setVybrane((v) =>
        orezVyber(
          v,
          (rows ?? []).map((r) => r.id),
        ),
      );
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
      if (r.odoslane > 0) toast.success(t("pd.odoslaneDoklady", { pocet: r.odoslane }));
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

  const zobrazeneIds = useMemo(() => najdene.map((d) => d.id), [najdene]);
  const suhrn = useMemo(() => suhrnVyberu(doklady ?? [], vybrane), [doklady, vybrane]);

  function koniecVyberu() {
    setVyberam(false);
    setVybrane(new Set());
  }

  function zacniPodrzanie(id: string) {
    zrusPodrzanie();
    podrzanie.current.zaplo = false;
    podrzanie.current.casovac = setTimeout(() => {
      podrzanie.current.zaplo = true;
      setVyberam(true);
      setVybrane((v) => new Set(v).add(id));
      try {
        navigator.vibrate?.(15);
      } catch {
        /* vibrácia je len potvrdenie navyše */
      }
    }, 500);
  }

  function zrusPodrzanie() {
    if (podrzanie.current.casovac) clearTimeout(podrzanie.current.casovac);
    podrzanie.current.casovac = null;
  }

  function tukniNaRiadok(d: Doklad) {
    // Ťuknutie, ktoré dokončilo dlhé podržanie, riadok už vybralo.
    if (podrzanie.current.zaplo) {
      podrzanie.current.zaplo = false;
      return;
    }
    if (vyberam) setVybrane((v) => prepniVyber(v, d.id));
    else setOtvoreny(d);
  }

  /*
    Hromadné akcie idú po jednom cez tie isté operácie ako detail dokladu —
    každý doklad prejde právami (RLS) aj kontrolami servera samostatne a
    chyba jedného nezastaví ostatné.
  */
  async function hromadneKategoria(kod: string) {
    const vyber = (doklady ?? []).filter((d) => vybrane.has(d.id));
    const naZmenu = vyber.filter(daSaUpravit);
    const preskocene = vyber.length - naZmenu.length;
    if (!naZmenu.length) {
      toast.error(t("pd.preskoceneOdovzdane", { pocet: preskocene }));
      return;
    }
    const nazov = KATEGORIE_VYDAVKOV.find((k) => k.kod === kod)?.nazov ?? t("sken.bezKategorie");
    if (
      !(await potvrd(t("pd.zmenitKategoriuOtazka", { kategoria: nazov, pocet: naZmenu.length }), {
        potvrdit: t("pd.zmenit"),
        zrusit: t("spolocne.zrusit"),
      }))
    )
      return;
    setHromadne(true);
    let ok = 0;
    let chyba = "";
    for (const d of naZmenu) {
      try {
        await upravFn({ data: { id: d.id, patch: { category: kod || null } } });
        ok++;
      } catch (e: any) {
        chyba = e?.message ?? String(e ?? "");
      }
    }
    setHromadne(false);
    if (ok) toast.success(t("pd.kategoriaZmenena", { pocet: ok }));
    if (preskocene) toast(t("pd.preskoceneOdovzdane", { pocet: preskocene }));
    if (ok < naZmenu.length)
      toast.error(t("pd.hromadneZlyhalo", { pocet: naZmenu.length - ok, chyba }));
    await obnov();
  }

  async function hromadneZmaz() {
    const ids = (doklady ?? []).filter((d) => vybrane.has(d.id)).map((d) => d.id);
    if (!ids.length) return;
    if (
      !(await potvrd(t("pd.zmazatVybraneOtazka", { pocet: ids.length }), {
        potvrdit: t("pd.zmazatKratke"),
        zrusit: t("spolocne.zrusit"),
        nebezpecne: true,
      }))
    )
      return;
    setHromadne(true);
    let ok = 0;
    let chyba = "";
    for (const id of ids) {
      try {
        await zmazFn({ data: { id } });
        ok++;
      } catch (e: any) {
        chyba = e?.message ?? String(e ?? "");
      }
    }
    setHromadne(false);
    if (ok) toast.success(t("pd.zmazaneHromadne", { pocet: ok }));
    if (ok < ids.length) toast.error(t("pd.hromadneZlyhalo", { pocet: ids.length - ok, chyba }));
    await obnov();
    if (ok === ids.length) koniecVyberu();
  }

  if (agenda === "faktury") {
    return (
      <PrijateFaktury
        firma={firma}
        onSpat={onSpat}
        prepinac={<PrepinacDokladov aktivna="faktury" onZmen={setAgenda} />}
      />
    );
  }

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
        onOznacenie={(zmena) => {
          // Komentár, stav a štítky sa menia bez zatvorenia detailu.
          setOtvoreny((o) => (o ? { ...o, ...zmena } : o));
          setDoklady((z) => z?.map((d) => (d.id === otvoreny.id ? { ...d, ...zmena } : d)) ?? z);
        }}
      />
    );
  }

  if (doklady === null) return <Pracujem text={t("pd.nacitavam")} />;

  return (
    <MobilObrazovka
      title={t("pd.nazov")}
      subtitle={firma.name}
      onBack={vyberam ? koniecVyberu : onSpat}
      akcia={
        najdene.length > 0 || vyberam ? (
          <button
            onClick={() => (vyberam ? koniecVyberu() : setVyberam(true))}
            className="rounded-app-sm px-3 py-2 text-[15px] font-medium text-app-zelena"
          >
            {vyberam ? t("pd.koniecVyberu") : t("pd.vybrat")}
          </button>
        ) : undefined
      }
      footer={
        vyberam ? (
          <ListaVybranych
            suhrn={suhrn}
            loc={loc}
            pracujem={hromadne}
            onKategoria={(kod) => void hromadneKategoria(kod)}
            onZmaz={() => void hromadneZmaz()}
          />
        ) : undefined
      }
    >
      {!vyberam && <PrepinacDokladov aktivna="blocky" onZmen={setAgenda} />}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-text-2" />
        <input
          value={hladanie}
          onChange={(e) => setHladanie(e.target.value)}
          placeholder={t("pd.hladat")}
          className="w-full rounded-app border border-app-ramik bg-app-karta py-3 pl-9 pr-3 text-[15px] shadow-app"
        />
      </div>

      {/*
        Doklady, ktoré čakajú na signál. Sú hore a inak zafarbené — kým sa
        neodošlú, nie sú v účtovníctve a človek to musí vidieť na prvý pohľad.
      */}
      {cakajuce.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-app border border-app-ramik bg-amber-500/5">
          <div className="flex items-center gap-2 px-4 py-3">
            <CloudOff className="h-4 w-4 shrink-0 text-app-text-2" />
            <span className="flex-1 text-[14px] font-medium text-amber-800 dark:text-amber-200">
              {t("pd.cakaNaOdoslanie", {
                pocet: `${cakajuce.length} ${mnozne(cakajuce.length, {
                  one: t("spolocne.doklad1"),
                  few: t("spolocne.doklad2"),
                  other: t("spolocne.doklad5"),
                })}`,
              })}
            </span>
            <button
              onClick={() => posliFrontu(true)}
              disabled={odosielam}
              className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-[13px] font-medium text-amber-900 disabled:opacity-60 dark:text-amber-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${odosielam ? "animate-spin" : ""}`} />
              {odosielam ? t("pd.odosielam") : t("pd.odoslat")}
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
                <span className="block truncate text-[12px] text-app-text-2">
                  {new Date(d.ts).toLocaleString(loc)}
                  {d.chyba ? ` · ${d.chyba}` : d.qr_raw ? ` · ${t("pd.sQrKodom")}` : ""}
                </span>
              </span>
              <button
                onClick={async () => {
                  await zmazZFronty(d.id);
                  setCakajuce(await fronta(firma.id));
                }}
                aria-label={t("pd.zahodit")}
                className="rounded-app-sm p-2 text-app-text-2 active:bg-app-pozadie"
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
        <div className="mb-4 overflow-hidden rounded-app border border-app-zelena/40 bg-app-zelena-jemna">
          <div className="px-4 py-3 text-[14px] font-medium">
            {t("pd.najdenePlatby", { pocet: navrhy.length })}
          </div>
          {navrhy.map((z) => (
            <div key={z.transactionId} className="border-t border-primary/20 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {z.doklad?.supplier_name ?? t("pd.doklad")}
                </span>
                <span className="shrink-0 text-[14px] tabular-nums">
                  {suma(z.doklad?.total_amount, z.doklad?.currency ?? "EUR", loc)}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-app-text-2">
                {datum(z.pohyb?.booking_date, loc)} · {z.dovody.join(" · ")}
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
                  className="flex-1 rounded-app-sm bg-app-zelena-plocha/15 px-3 py-2 text-[13px] font-medium text-app-zelena disabled:opacity-60"
                >
                  {z.istota === "auto" ? t("pd.sparovat") : t("pd.anoPatriKSebe")}
                </button>
                <button
                  onClick={() =>
                    setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId))
                  }
                  className="rounded-app-sm border border-app-ramik px-3 py-2 text-[13px] text-app-text-2"
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
          <Receipt className="mb-3 h-10 w-10 text-app-text-2/50" />
          <p className="text-sm font-medium">
            {hladanie ? t("pd.nicSaNenaslo") : nedostupne ? t("pd.bezPripojenia") : t("pd.ziadne")}
          </p>
          <p className="mt-1 text-xs text-app-text-2">
            {hladanie
              ? t("pd.skusteInak")
              : nedostupne
                ? t("pd.odlozeneOdoslu")
                : t("pd.ziadnePopis")}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {vyberam && (
            <div className="-mb-2 flex items-center justify-between px-1">
              <span className="text-[13px] text-app-text-2">
                {vybrane.size
                  ? t("pd.vybranePocet", { pocet: vybrane.size })
                  : t("pd.vyberteDoklady")}
              </span>
              <button
                onClick={() => setVybrane((v) => vybratVsetko(v, zobrazeneIds))}
                className="rounded-app-sm px-2 py-1.5 text-[14px] font-medium text-app-zelena"
              >
                {vsetkyVybrane(vybrane, zobrazeneIds)
                  ? t("pd.odznacitVsetko")
                  : t("pd.vybratVsetko")}
              </button>
            </div>
          )}
          {mesiace.map(([kluc, riadky]) => {
            const spolu = riadky.reduce((s, d) => s + (cislo(d.total_amount) ?? 0), 0);
            return (
              <div key={kluc}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-app-text-2">
                    {nazovMesiaca(kluc, loc)}
                  </h2>
                  <span className="text-[13px] font-medium tabular-nums text-app-text-2">
                    {riadky.length} × · {suma(spolu, riadky[0]?.currency ?? "EUR", loc)}
                  </span>
                </div>
                <div className="overflow-hidden rounded-app border border-app-ramik bg-app-karta shadow-app">
                  {riadky.map((d, i) => (
                    <button
                      key={d.id}
                      onClick={() => tukniNaRiadok(d)}
                      onPointerDown={() => zacniPodrzanie(d.id)}
                      onPointerUp={zrusPodrzanie}
                      onPointerLeave={zrusPodrzanie}
                      onPointerCancel={zrusPodrzanie}
                      // Android by na dlhé podržanie otvoril vlastnú ponuku.
                      onContextMenu={(e) => e.preventDefault()}
                      aria-pressed={vyberam ? vybrane.has(d.id) : undefined}
                      data-vybrany={vybrane.has(d.id) || undefined}
                      className={`flex w-full select-none items-center gap-3 px-4 py-3.5 text-left transition active:bg-app-pozadie ${
                        i > 0 ? "border-t border-app-ramik" : ""
                      } ${vybrane.has(d.id) ? "bg-app-zelena-jemna" : ""}`}
                    >
                      {vyberam ? (
                        <span
                          aria-hidden
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${
                            vybrane.has(d.id)
                              ? "border-app-zelena bg-app-zelena-plocha text-white"
                              : "border-app-ramik bg-app-karta"
                          }`}
                        >
                          {vybrane.has(d.id) && <Check className="h-4 w-4" />}
                        </span>
                      ) : null}
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-app-sm bg-app-zelena-jemna text-app-zelena">
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
                        <span className="mt-0.5 block truncate text-[13px] text-app-text-2">
                          {datum(d.issue_date, loc)}
                          {d.payment_method ? ` · ${t(UHRADY[d.payment_method])}` : ""}
                          {uhrady[d.id]
                            ? ` · ${t("pd.uhradeneSkratka", { den: datum(uhrady[d.id].datum, loc) })}`
                            : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                        {suma(d.total_amount, d.currency ?? "EUR", loc)}
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

/* ------------------------- Lišta vybraných ------------------------- */

/** „12,30 € / 10,00 € bez DPH" za každú menu zvlášť — meny sa nesčítavajú. */
function SumyMien({ sumy, loc }: { sumy: SucetMeny[]; loc: string }) {
  const { t } = usePreklad();
  if (!sumy.length) return null;
  return (
    <>
      {sumy.map((s) => (
        <span key={s.mena} className="block whitespace-nowrap tabular-nums">
          <span className="font-semibold text-app-text">{formatujMenu(s.sDph, s.mena, loc)}</span>
          {" / "}
          {t("pd.bezDphSuma", { suma: formatujMenu(s.bezDph, s.mena, loc) })}
        </span>
      ))}
    </>
  );
}

/**
 * Spodná lišta pri výbere: koľko je vybraných a za koľko, koľko z nich ešte
 * pôjde do účtovníctva, a hromadné akcie. Exportované zvlášť, aby sa dala
 * vykresliť aj bez servera (testy obrazoviek).
 */
export function ListaVybranych({
  suhrn,
  loc,
  pracujem,
  onKategoria,
  onZmaz,
}: {
  suhrn: SuhrnVyberu;
  loc: string;
  pracujem: boolean;
  onKategoria: (kod: string) => void;
  onZmaz: () => void;
}) {
  const { t, mnozne } = usePreklad();
  const doklady = (n: number) =>
    `${n} ${mnozne(n, {
      one: t("spolocne.doklad1"),
      few: t("spolocne.doklad2"),
      other: t("spolocne.doklad5"),
    })}`;
  const nic = suhrn.pocet === 0 || pracujem;
  return (
    <div data-lista-vyberu className="space-y-2 pb-1">
      <div className="text-[13px] leading-snug text-app-text-2">
        {/* Keď sa suma k popisu nezmestí, zalomí sa pod neho — nie po slovách. */}
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <span className="font-medium text-app-text">
            {t("pd.vybrane", { pocet: doklady(suhrn.pocet) })}
          </span>
          <span className="ml-auto text-right">
            <SumyMien sumy={suhrn.sumy} loc={loc} />
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-x-3">
          <span>{t("pd.naExport", { pocet: doklady(suhrn.naExport.pocet) })}</span>
          <span className="ml-auto text-right">
            <SumyMien sumy={suhrn.naExport.sumy} loc={loc} />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {/*
          Natívny výber, nie vlastné okno — telefón ukáže svoj zoznam a po
          výbere sa opýtame, či naozaj. Hodnota sa hneď vráti na prázdnu,
          aby sa dala tá istá kategória vybrať aj druhýkrát.
        */}
        <select
          aria-label={t("pd.zmenitKategoriu")}
          value="__"
          disabled={nic}
          onChange={(e) => {
            const kod = e.target.value;
            if (kod !== "__") onKategoria(kod === "__nic" ? "" : kod);
          }}
          className="min-h-[44px] w-full min-w-0 rounded-app-sm border border-app-ramik bg-app-karta px-2 text-[14px] disabled:opacity-50"
        >
          <option value="__" disabled>
            {t("pd.zmenitKategoriu")}
          </option>
          <option value="__nic">{t("sken.bezKategorie")}</option>
          {KATEGORIE_VYDAVKOV.map((k) => (
            <option key={k.kod} value={k.kod}>
              {k.nazov}
            </option>
          ))}
        </select>
        <button
          onClick={onZmaz}
          disabled={nic}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-app-sm border border-app-chyba/40 px-3 text-[14px] font-medium text-app-chyba disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          {pracujem ? t("pd.pracujem") : t("pd.zmazatVybrane")}
        </button>
      </div>
    </div>
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
  onOznacenie,
}: {
  doklad: Doklad;
  firmaId: string;
  onSpat: () => void;
  onZmena: () => void;
  /** Zmena komentára, stavu, štítkov alebo poznámky — detail ostáva otvorený. */
  onOznacenie: (zmena: Partial<Doklad>) => void;
  /** Pohyb, ktorým je doklad uhradený. `null`, keď spárovaný nie je. */
  uhrada: { datum: string; transactionId: string } | null;
  onRozparovane: () => void;
}) {
  const { t, locale: loc } = usePreklad();
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
      title={doklad.supplier_name ?? t("pd.doklad")}
      subtitle={doklad.issue_date ? datum(doklad.issue_date, loc) : undefined}
      onBack={onSpat}
    >
      <div className="space-y-4">
        <div className="rounded-app border border-app-ramik bg-app-karta p-4 shadow-app">
          <div className="text-[32px] font-semibold leading-none tabular-nums">
            {suma(doklad.total_amount, mena, loc)}
          </div>
          {cislo(doklad.vat_amount) != null && (
            <div className="mt-2 text-[13px] text-app-text-2">
              {t("nf.zakladDph", {
                zaklad: suma(doklad.net_amount, mena, loc),
                dph: suma(doklad.vat_amount, mena, loc),
              })}
              {rozpis.length > 1 ? ` (${rozpis.map((s) => `${s.sadzba} %`).join(" + ")})` : ""}
            </div>
          )}
          {doklad.source === "qr" && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-app-zelena-jemna px-2 py-0.5 text-xs font-medium text-app-zelena">
              <BadgeCheck className="h-3.5 w-3.5" /> {t("pd.zFinancnejSpravy")}
            </div>
          )}
        </div>

        {/*
          Úhrada z účtu. Zrušiť sa dá tu, kde je vidieť — nie na inej obrazovke:
          keď človek zistí, že sa doklad spároval s cudzou platbou, je práve pri
          ňom a nemá to kde hľadať.
        */}
        {uhradaZUctu && (
          <div className="flex items-center gap-3 rounded-app border border-emerald-500/40 bg-emerald-500/5 p-4">
            <BadgeCheck className="h-5 w-5 shrink-0 text-app-zelena" />
            <span className="min-w-0 flex-1 text-[14px]">
              {t("pd.uhradeneZUctuDna", { den: datum(uhradaZUctu.datum, loc) })}
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
              className="shrink-0 rounded-app-sm border border-app-ramik px-3 py-2 text-[13px] disabled:opacity-60"
            >
              {t("pd.zrusit")}
            </button>
          </div>
        )}

        <div className="space-y-2 rounded-app border border-app-ramik bg-app-karta p-4 text-[14px] shadow-app">
          <Riadok label={t("pd.ico")} value={doklad.supplier_ico ?? "—"} />
          <Riadok label={t("pd.icDph")} value={doklad.supplier_ic_dph ?? "—"} />
          <Riadok label={t("pd.cisloDokladu")} value={doklad.document_number ?? "—"} />
        </div>

        <PoznamkaDokladu
          tabulka="expense_documents"
          id={doklad.id}
          firmaId={firmaId}
          agenda="blocek"
          poznamka={doklad.note}
          zamknute={!!(doklad.exported_at || doklad.locked_at)}
          onZmena={(note) => onOznacenie({ note })}
        />
        <OznacenieDokladu
          tabulka="expense_documents"
          firmaId={firmaId}
          doklad={doklad}
          onZmena={onOznacenie}
        />

        <div>
          <div className="mb-2 text-sm font-medium">{t("pd.sposobUhrady")}</div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(UHRADY) as Uhrada[]).map((id) => (
              <button
                key={id}
                disabled={busy}
                onClick={() => zmenUhradu(id)}
                className={`rounded-app border py-3 text-[14px] transition active:scale-[0.98] disabled:opacity-60 ${
                  uhrada === id
                    ? "border-primary bg-app-zelena-jemna font-semibold text-app-zelena"
                    : "border-app-ramik bg-app-karta"
                }`}
              >
                {t(UHRADY[id])}
              </button>
            ))}
          </div>
        </div>

        {polozky.length > 0 && (
          <div className="overflow-hidden rounded-app border border-app-ramik bg-app-karta shadow-app">
            <div className="border-b border-app-ramik px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-app-text-2">
              {t("pd.polozkyPocet", { pocet: polozky.length })}
            </div>
            {polozky.map((p, i) => (
              <div
                key={i}
                className={`flex items-start justify-between gap-3 px-4 py-2.5 text-[14px] ${
                  i > 0 ? "border-t border-app-ramik" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block">{p.name || "—"}</span>
                  <span className="block text-xs text-app-text-2">
                    {p.quantity} × {suma(p.unit_price, mena, loc)} · {p.vat_rate} %
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {suma(p.total ?? p.quantity * p.unit_price, mena, loc)}
                </span>
              </div>
            ))}
          </div>
        )}

        {doklad.file_path && (
          <div>
            <div className="mb-2 text-sm font-medium">{t("pd.doklad")}</div>
            {priloha ? (
              doklad.file_mime === "application/pdf" ? (
                <a
                  href={priloha}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-app-sm border border-app-ramik px-4 py-3 text-sm"
                >
                  <ExternalLink className="h-4 w-4" /> {t("pd.otvoritPdf")}
                </a>
              ) : (
                <a href={priloha} target="_blank" rel="noreferrer">
                  <img
                    src={priloha}
                    alt="doklad"
                    className="w-full rounded-app-sm border border-app-ramik object-contain"
                  />
                </a>
              )
            ) : (
              <p className="text-xs text-app-text-2">{t("pd.nacitavamPrilohu")}</p>
            )}
          </div>
        )}

        {/* Bloček z pokladnice faktúrou nie je — presun sa ponúka len tomu, čo ňou byť môže. */}
        {daSaPresunutMedziPrijate(doklad) && (
          <button
            type="button"
            onClick={doPrijatych}
            disabled={busy || presuvam}
            className="flex w-full items-center justify-center gap-2 rounded-app-sm border border-app-ramik px-4 py-3 text-sm disabled:opacity-50"
          >
            <FileInput className="h-4 w-4" />
            {presuvam ? t("pd.presuvam") : t("pd.presunut")}
          </button>
        )}

        {mazem ? (
          <div className="rounded-app border border-app-chyba/40 bg-app-chyba-jemna p-4">
            <p className="text-sm font-medium">{t("pd.naozajZmazat")}</p>
            <p className="mt-1 text-xs text-app-text-2">{t("pd.nedaSaVratit")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setMazem(false)}
                className="rounded-app-sm border border-app-ramik px-4 py-2.5 text-sm"
              >
                {t("pd.ponechat")}
              </button>
              <button
                onClick={zmaz}
                disabled={busy}
                className="rounded-app-sm bg-destructive px-4 py-2.5 text-sm font-medium text-app-chyba-foreground disabled:opacity-50"
              >
                {t("pd.zmazatKratke")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setMazem(true)}
            className="flex w-full items-center justify-center gap-2 rounded-app-sm px-4 py-3 text-sm text-app-text-2"
          >
            <Trash2 className="h-4 w-4" /> {t("pd.zmazat")}
          </button>
        )}
      </div>
    </MobilObrazovka>
  );
}

function Riadok({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-app-text-2">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
