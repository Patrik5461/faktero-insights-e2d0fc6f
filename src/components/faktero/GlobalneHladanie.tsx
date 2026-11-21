/*
  Hľadanie v hlavičke (⌘K) — funkcie a nastavenia, potom agendy aktívnej firmy.

  Prvá skupina „Funkcie a nastavenia“ (od 1 znaku, hneď, bez servera —
  `hladanie-funkcie.ts`): stránky, nastavenia, rýchle akcie a pod ňou „Pomoc“
  (články manuálov). Potom (od 2 znakov, po 250 ms) doklady po skupinách:
  vystavené a prijaté faktúry, bločky, nespracované, kontakty, ponuky, banka,
  zákazky. Šípky vyberajú naprieč skupinami, Enter otvorí vybraný riadok. Keď
  názov funkcie presne sedí („upomienky“), je predvybraná; inak Enter bez
  výberu ostáva ako predtým — zoznam vystavených faktúr vyhľadaný podľa textu.

  Na telefóne je pole v hlavičke skryté — ikona lupy otvorí celú obrazovku
  s rovnakými výsledkami. Hľadá server (`globalne-hladanie.functions.ts`)
  klientom prihláseného, skupiny mimo jeho oblastí sa nepýtajú.
*/
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  ChevronRight,
  FileInput,
  FileSignature,
  FileText,
  Inbox,
  KeyRound,
  Landmark,
  Loader2,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { globalneHladanieFn } from "@/lib/faktero/globalne-hladanie.functions";
import {
  MIN_DLZKA,
  NAZOV_SKUPINY,
  upravDotaz,
  type Navigacia,
  type SkupinaHladania,
  type SkupinaVysledkov,
  type VysledokHladania,
} from "@/lib/faktero/globalne-hladanie";
import {
  funkciePreKontext,
  hladajFunkcie,
  type Funkcia,
  type KontextFunkcii,
  type VysledokFunkcii,
} from "@/lib/faktero/hladanie-funkcie";
import { NAV } from "@/components/faktero/nav";
import { formatujMenu } from "@/lib/faktero/mena";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { cn } from "@/lib/utils";

const IKONA: Record<SkupinaHladania, LucideIcon> = {
  vystavene: FileText,
  prijate: FileInput,
  blocky: Receipt,
  nespracovane: Inbox,
  kontakty: Users,
  ponuky: FileSignature,
  banka: Landmark,
  zakazky: Briefcase,
};

const ODKLAD_MS = 250;

/** Ikona skupiny lišty pre stránku funkcie (Banka → Landmark…). */
const IKONA_LISTY: Record<string, LucideIcon> = Object.fromEntries(NAV.map((g) => [g.key, g.icon]));

function ikonaFunkcie(f: Funkcia): LucideIcon {
  if (f.druh === "akcia") return Plus;
  if (f.druh === "pomoc") return BookOpen;
  if (f.druh === "admin") return ShieldCheck;
  if (f.druh === "nastavenie") return f.odkaz.to.startsWith("/api") || f.odkaz.to.startsWith("/webhooky") ? KeyRound : Settings;
  return (f.skupinaNav && IKONA_LISTY[f.skupinaNav]) || FileText;
}

/** Riadok, na ktorý sa dá prejsť šípkami — funkcia, výsledok alebo „Zobraziť všetky“. */
type Polozka =
  | { druh: "funkcia"; f: Funkcia }
  | { druh: "vysledok"; v: VysledokHladania }
  | { druh: "vsetky"; skupina: SkupinaHladania; odkaz: Navigacia };

function polozkyNaVyber(funkcie: VysledokFunkcii, skupiny: SkupinaVysledkov[]): Polozka[] {
  return [
    ...funkcie.funkcie.map((f): Polozka => ({ druh: "funkcia", f })),
    ...funkcie.pomoc.map((f): Polozka => ({ druh: "funkcia", f })),
    ...skupiny.flatMap((g) => [
      ...g.polozky.map((v): Polozka => ({ druh: "vysledok", v })),
      ...(g.vsetky && g.pocet > g.polozky.length
        ? [{ druh: "vsetky", skupina: g.skupina, odkaz: g.vsetky } as Polozka]
        : []),
    ]),
  ];
}

const ZIADNE_FUNKCIE: VysledokFunkcii = { funkcie: [], pomoc: [], najlepsie: 0 };

/** Funkcie a pomoc pre text — v prehliadači, hneď pri písaní. */
function useFunkcie(kontext: KontextFunkcii, text: string): VysledokFunkcii {
  const { t } = useT();
  const { isCompanyAdmin, krajina, rola, opravnenia, adminPlatformy, modulZamestnanci, knihaJazd } =
    kontext;
  const zoznam = useMemo(
    () =>
      funkciePreKontext({
        isCompanyAdmin,
        krajina,
        rola,
        opravnenia,
        adminPlatformy,
        modulZamestnanci,
        knihaJazd,
      }),
    [isCompanyAdmin, krajina, rola, opravnenia, adminPlatformy, modulZamestnanci, knihaJazd],
  );
  const dotaz = upravDotaz(text);
  return useMemo(
    () => (dotaz ? hladajFunkcie(zoznam, dotaz, (s) => t(s)) : ZIADNE_FUNKCIE),
    [zoznam, dotaz, t],
  );
}

type Stav = {
  dotaz: string;
  skupiny: SkupinaVysledkov[];
  nacitava: boolean;
  chyba: string | null;
};

/** Výsledky pre text — odklad, zahodenie starej odpovede, pamäť posledných dotazov. */
function useVysledky(companyId: string | null, text: string): Stav {
  const hladaj = useServerFn(globalneHladanieFn);
  const [stav, setStav] = useState<Stav>({ dotaz: "", skupiny: [], nacitava: false, chyba: null });
  const pamat = useRef(new Map<string, SkupinaVysledkov[]>());
  const poradie = useRef(0);
  const dotaz = upravDotaz(text);

  useEffect(() => {
    if (!companyId || dotaz.length < MIN_DLZKA) {
      poradie.current++;
      setStav({ dotaz, skupiny: [], nacitava: false, chyba: null });
      return;
    }
    const kluc = `${companyId}|${dotaz.toLowerCase()}`;
    const ulozene = pamat.current.get(kluc);
    if (ulozene) {
      setStav({ dotaz, skupiny: ulozene, nacitava: false, chyba: null });
      return;
    }
    setStav((s) => ({ ...s, nacitava: true, chyba: null }));
    const moje = ++poradie.current;
    const casovac = window.setTimeout(async () => {
      try {
        const r = await hladaj({ data: { company_id: companyId, q: dotaz } });
        if (moje !== poradie.current) return;
        pamat.current.set(kluc, r.skupiny);
        if (pamat.current.size > 30) pamat.current.delete(pamat.current.keys().next().value!);
        setStav({ dotaz, skupiny: r.skupiny, nacitava: false, chyba: null });
      } catch (e) {
        if (moje !== poradie.current) return;
        setStav({
          dotaz,
          skupiny: [],
          nacitava: false,
          chyba: e instanceof Error ? e.message : String(e),
        });
      }
    }, ODKLAD_MS);
    return () => window.clearTimeout(casovac);
  }, [companyId, dotaz, hladaj]);

  // Pri zmene firmy sa výsledky predchádzajúcej nesmú ukázať ani z pamäte.
  useEffect(() => {
    pamat.current.clear();
  }, [companyId]);

  return stav;
}

function datumText(d: string | null, jazyk: string): string {
  if (!d) return "";
  const t = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return "";
  const loc = jazyk === "de" ? "de-DE" : jazyk === "cs" ? "cs-CZ" : "sk-SK";
  return t.toLocaleDateString(loc, { timeZone: "UTC" });
}

/** Skupina „Funkcie a nastavenia“ alebo „Pomoc“ — ikona, názov, cesta v menu. */
function SkupinaFunkcii({
  nadpis,
  polozky,
  vsetky,
  aktivny,
  setAktivny,
  otvor,
  idZoznamu,
}: {
  nadpis: string;
  polozky: Funkcia[];
  vsetky: Polozka[];
  aktivny: number;
  setAktivny: (i: number) => void;
  otvor: (p: Polozka) => void;
  idZoznamu: string;
}) {
  const { t } = useT();
  if (!polozky.length) return null;
  return (
    <div role="group" aria-label={nadpis} className="py-1">
      <div className="px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {nadpis}
      </div>
      {polozky.map((f) => {
        const i = vsetky.findIndex((p) => p.druh === "funkcia" && p.f === f);
        const vybrany = i === aktivny;
        const Ikona = ikonaFunkcie(f);
        return (
          <div
            key={f.kluc}
            id={`${idZoznamu}-${i}`}
            role="option"
            aria-selected={vybrany}
            data-hladanie-funkcia={f.kluc}
            onMouseMove={() => !vybrany && setAktivny(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => otvor({ druh: "funkcia", f })}
            className={cn(
              "mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5",
              vybrany ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                f.druh === "akcia" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <Ikona className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{t(f.nazov)}</span>
              {f.cesta.length > 0 && (
                <span className="flex min-w-0 items-center gap-0.5 truncate text-[11.5px] text-muted-foreground">
                  {f.cesta.map((c, j) => (
                    <span key={j} className="flex min-w-0 items-center gap-0.5">
                      {j > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
                      <span className="truncate">{t(c)}</span>
                    </span>
                  ))}
                </span>
              )}
            </span>
            {vybrany && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

function Vysledky({
  stav,
  funkcie,
  text,
  aktivny,
  setAktivny,
  otvor,
  idZoznamu,
  mobil,
}: {
  stav: Stav;
  funkcie: VysledokFunkcii;
  text: string;
  aktivny: number;
  setAktivny: (i: number) => void;
  otvor: (p: Polozka) => void;
  idZoznamu: string;
  mobil?: boolean;
}) {
  const { t, jazyk } = useT();
  const dotaz = upravDotaz(text);
  const loc = jazyk === "de" ? "de-DE" : jazyk === "cs" ? "cs-CZ" : "sk-SK";
  const vsetky = useMemo(() => polozkyNaVyber(funkcie, stav.skupiny), [funkcie, stav.skupiny]);
  const maFunkcie = funkcie.funkcie.length + funkcie.pomoc.length > 0;
  const dokladyHotove = stav.dotaz === dotaz && !stav.nacitava;

  if (!dotaz)
    return (
      <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
        {t("Hľadajte funkciu alebo nastavenie (napr. upomienky, logo), číslo dokladu, partnera, IČO, sumu alebo IBAN.")}
      </p>
    );

  const skupinyFunkcii = (
    <>
      <SkupinaFunkcii
        nadpis={t("Funkcie a nastavenia")}
        polozky={funkcie.funkcie}
        vsetky={vsetky}
        aktivny={aktivny}
        setAktivny={setAktivny}
        otvor={otvor}
        idZoznamu={idZoznamu}
      />
      <SkupinaFunkcii
        nadpis={t("Pomoc")}
        polozky={funkcie.pomoc}
        vsetky={vsetky}
        aktivny={aktivny}
        setAktivny={setAktivny}
        otvor={otvor}
        idZoznamu={idZoznamu}
      />
    </>
  );

  // Jeden znak — doklady sa ešte nehľadajú, funkcie áno.
  if (dotaz.length < MIN_DLZKA)
    return maFunkcie ? (
      <div id={idZoznamu} role="listbox" aria-label={t("Výsledky hľadania")} className="py-1">
        {skupinyFunkcii}
      </div>
    ) : (
      <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
        {t("Hľadajte funkciu alebo nastavenie (napr. upomienky, logo), číslo dokladu, partnera, IČO, sumu alebo IBAN.")}
      </p>
    );

  // Kostra pri prvom načítaní; pri ďalšom písaní ostanú staré výsledky.
  if (stav.nacitava && !stav.skupiny.length && !maFunkcie)
    return (
      <div className="space-y-1 p-2" aria-busy="true" aria-label={t("Hľadám…")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );

  if (stav.chyba && !maFunkcie)
    return (
      <p className="px-4 py-6 text-center text-[12.5px] text-destructive">
        {t("Hľadanie sa nepodarilo. Skúste to znova.")}
      </p>
    );

  if (!stav.skupiny.length && dokladyHotove && !maFunkcie)
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-[13px] font-medium">{t("Nič sa nenašlo pre „{q}“", { q: dotaz })}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("Skúste číslo dokladu, názov partnera, IČO alebo sumu (napr. 123,45).")}
        </p>
      </div>
    );

  return (
    <div id={idZoznamu} role="listbox" aria-label={t("Výsledky hľadania")} className="py-1">
      {skupinyFunkcii}
      {stav.chyba && (
        <p className="px-3 py-2 text-[12px] text-destructive">
          {t("Hľadanie sa nepodarilo. Skúste to znova.")}
        </p>
      )}
      {stav.skupiny.map((g) => {
        const Ikona = IKONA[g.skupina];
        return (
          <div key={g.skupina} role="group" aria-label={t(NAZOV_SKUPINY[g.skupina])} className="py-1">
            <div className="flex items-center justify-between px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{t(NAZOV_SKUPINY[g.skupina])}</span>
              <span className="tabular-nums">{g.pocet}</span>
            </div>
            {g.polozky.map((v) => {
              const i = vsetky.findIndex((p) => p.druh === "vysledok" && p.v === v);
              const vybrany = i === aktivny;
              return (
                <div
                  key={v.id}
                  id={`${idZoznamu}-${i}`}
                  role="option"
                  aria-selected={vybrany}
                  data-hladanie-vysledok={v.skupina}
                  onMouseMove={() => !vybrany && setAktivny(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => otvor({ druh: "vysledok", v })}
                  className={cn(
                    "mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5",
                    vybrany ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Ikona className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {v.cislo || t("Bez čísla")}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {[v.partner, v.ico ? `${t("IČO")} ${v.ico}` : null].filter(Boolean).join(" · ") ||
                        " "}
                    </span>
                  </span>
                  <span className={cn("flex shrink-0 flex-col items-end gap-0.5", mobil && "max-w-[45%]")}>
                    {v.suma != null && (
                      <span className="text-[12.5px] font-medium tabular-nums">
                        {formatujMenu(v.suma, v.mena || "EUR", loc)}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      {v.datum && (
                        <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                          {datumText(v.datum, jazyk)}
                        </span>
                      )}
                      {v.stav && (
                        <StavOdznak ton={v.stav.ton} maly>
                          {t(v.stav.text)}
                        </StavOdznak>
                      )}
                    </span>
                  </span>
                </div>
              );
            })}
            {g.pocet > g.polozky.length &&
              (g.vsetky ? (
                (() => {
                  const i = vsetky.findIndex((p) => p.druh === "vsetky" && p.skupina === g.skupina);
                  const vybrany = i === aktivny;
                  return (
                    <div
                      id={`${idZoznamu}-${i}`}
                      role="option"
                      aria-selected={vybrany}
                      onMouseMove={() => !vybrany && setAktivny(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => otvor({ druh: "vsetky", skupina: g.skupina, odkaz: g.vsetky! })}
                      className={cn(
                        "mx-1 flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-primary",
                        vybrany ? "bg-accent" : "hover:bg-muted/60",
                      )}
                    >
                      {t("Zobraziť všetky ({n})", { n: g.pocet })}
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  );
                })()
              ) : (
                <p className="px-3 py-1 text-[11.5px] text-muted-foreground">
                  {t("a ďalšie ({n})", { n: g.pocet - g.polozky.length })}
                </p>
              ))}
          </div>
        );
      })}
      {stav.nacitava && (
        <div className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {t("Hľadám…")}
        </div>
      )}
    </div>
  );
}

/** Šípky, Enter a otvorenie výsledku — spoločné pre pole v hlavičke aj mobil. */
/** Funkcia je predvybraná (Enter ju otvorí), keď jej názov dotaz presne obsahuje od začiatku. */
const SKORE_PREDVYBERU = 90;

function useOvladanie(stav: Stav, funkcie: VysledokFunkcii, text: string, zavri: () => void) {
  const navigate = useNavigate();
  const [aktivny, setAktivny] = useState(-1);
  const polozky = useMemo(() => polozkyNaVyber(funkcie, stav.skupiny), [funkcie, stav.skupiny]);
  const predvyber = funkcie.najlepsie >= SKORE_PREDVYBERU && upravDotaz(text).length >= 3 ? 0 : -1;
  useEffect(() => setAktivny(predvyber), [stav.skupiny, funkcie, predvyber]);

  function otvor(p: Polozka) {
    zavri();
    if (p.druh === "funkcia") {
      const o = p.f.odkaz;
      navigate({
        to: o.to as any,
        search: (o.search ?? {}) as any,
        ...(o.hash ? { hash: o.hash } : {}),
      });
      return;
    }
    const n = p.druh === "vysledok" ? p.v.odkaz : p.odkaz;
    navigate({ to: n.to as any, params: n.params as any, search: (n.search ?? {}) as any });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && polozky.length) {
      e.preventDefault();
      setAktivny((i) => (i + 1) % polozky.length);
    } else if (e.key === "ArrowUp" && polozky.length) {
      e.preventDefault();
      setAktivny((i) => (i <= 0 ? polozky.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = polozky[aktivny];
      if (p) return otvor(p);
      // Bez výberu ako doteraz — vystavené faktúry vyhľadané podľa textu.
      const q = upravDotaz(text);
      if (!q) return;
      zavri();
      navigate({ to: "/faktury", search: { q } as any });
    }
  }
  return { aktivny, setAktivny, otvor, onKeyDown };
}

export function GlobalneHladanie({
  companyId,
  inputRef,
  kontext,
}: {
  companyId: string | null;
  /** Pole, ktoré ⌘K / Ctrl+K zameria (skratku obsluhuje AppShell). */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Kto je prihlásený — funkcie sa filtrujú rovnako ako menu (AppShell). */
  kontext: KontextFunkcii;
}) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [otvorene, setOtvorene] = useState(false);
  const [mobil, setMobil] = useState(false);
  const stav = useVysledky(companyId, text);
  const funkcie = useFunkcie(kontext, text);
  const obal = useRef<HTMLDivElement>(null);
  const idZoznamu = useId();

  const zavri = () => {
    setOtvorene(false);
    setMobil(false);
  };
  const ovl = useOvladanie(stav, funkcie, text, () => {
    zavri();
    inputRef.current?.blur();
  });
  useZatvorNaEscape(otvorene && !mobil ? () => setOtvorene(false) : null);

  // Klik mimo zavrie panel.
  useEffect(() => {
    if (!otvorene) return;
    const h = (e: MouseEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) setOtvorene(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [otvorene]);

  const ukazPanel = otvorene && upravDotaz(text).length >= 1;

  return (
    <>
      <div ref={obal} className="relative hidden min-w-0 flex-1 md:block">
        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="relative max-w-[400px]"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOtvorene(true);
            }}
            onFocus={() => setOtvorene(true)}
            onClick={() => setOtvorene(true)}
            onKeyDown={(e) => {
              if (!otvorene && (e.key === "ArrowDown" || e.key === "ArrowUp")) setOtvorene(true);
              ovl.onKeyDown(e);
            }}
            placeholder={t("Hľadať funkcie, doklady, firmy…")}
            aria-label={t("Hľadať")}
            role="combobox"
            aria-expanded={ukazPanel}
            aria-controls={idZoznamu}
            aria-autocomplete="list"
            aria-activedescendant={ovl.aktivny >= 0 ? `${idZoznamu}-${ovl.aktivny}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-full bg-muted/60 pl-8 pr-12 text-[12.5px] placeholder:text-muted-foreground focus:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {stav.nacitava ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          )}
        </form>
        {ukazPanel && (
          <div
            data-globalne-hladanie
            className="absolute left-0 top-full z-50 mt-1.5 max-h-[min(70vh,560px)] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <Vysledky
              stav={stav}
              funkcie={funkcie}
              text={text}
              aktivny={ovl.aktivny}
              setAktivny={ovl.setAktivny}
              otvor={ovl.otvor}
              idZoznamu={idZoznamu}
            />
          </div>
        )}
      </div>

      {/* Telefón — pole v hlavičke sa nezmestí, lupa otvorí celú obrazovku. */}
      <button
        type="button"
        onClick={() => setMobil(true)}
        aria-label={t("Hľadať")}
        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary-foreground hover:bg-white/15 md:hidden"
      >
        <Search className="h-4 w-4" />
      </button>
      {mobil && (
        <MobilneHladanie
          text={text}
          setText={setText}
          stav={stav}
          funkcie={funkcie}
          ovl={ovl}
          idZoznamu={`${idZoznamu}-m`}
          zavri={() => setMobil(false)}
        />
      )}
    </>
  );
}

function MobilneHladanie({
  text,
  setText,
  stav,
  funkcie,
  ovl,
  idZoznamu,
  zavri,
}: {
  text: string;
  setText: (v: string) => void;
  stav: Stav;
  funkcie: VysledokFunkcii;
  ovl: ReturnType<typeof useOvladanie>;
  idZoznamu: string;
  zavri: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(zavri);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Hľadať")}
      className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground md:hidden"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={ovl.onKeyDown}
            placeholder={t("Hľadať funkcie, doklady, firmy…")}
            aria-label={t("Hľadať")}
            role="combobox"
            aria-expanded={upravDotaz(text).length >= 1}
            aria-activedescendant={ovl.aktivny >= 0 ? `${idZoznamu}-${ovl.aktivny}` : undefined}
            aria-controls={idZoznamu}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-10 w-full rounded-full bg-muted pl-9 pr-9 text-[15px] placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {stav.nacitava && (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <button
          type="button"
          onClick={zavri}
          aria-label={t("Zavrieť")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <Vysledky
          stav={stav}
          funkcie={funkcie}
          text={text}
          aktivny={ovl.aktivny}
          setAktivny={ovl.setAktivny}
          otvor={ovl.otvor}
          idZoznamu={idZoznamu}
          mobil
        />
      </div>
    </div>
  );
}
