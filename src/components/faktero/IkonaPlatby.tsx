import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Landmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TonStavu } from "@/components/faktero/web/Stav";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { potvrd } from "@/lib/potvrdenie";
import type { StavPlatby } from "@/lib/faktero/stav-platby";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { cn } from "@/lib/utils";

/**
 * Ikonka banky s farebnou bodkou pri doklade v zozname (prijaté faktúry,
 * bločky, doklady…) — namiesto veľkého panela s návrhmi nad zoznamom.
 *
 * Klik otvorí na desktope malé okno pri ikonke, na mobile (< 768 px) spodné
 * okno. Okno je `role="dialog"` s `aria-modal`, zatvára ho Esc, klik mimo aj
 * krížik a fokus sa vráti na ikonku. Tlačidlo aj okno majú `data-neotvarat`,
 * takže klik neotvorí detail riadku (`useKlikNaRiadok`); okno je navyše
 * v portáli, mimo DOM riadku.
 *
 * Komponent je zámerne bez znalosti tabuliek: dáta pohybu, dôvody zhody
 * a akcie dodá zoznam. Nič nepáruje sám — potvrdenie je vždy klik človeka.
 */

export type PohybPlatby = {
  datum?: string | null;
  suma?: number | null;
  mena?: string | null;
  ucet?: string | null;
  vs?: string | null;
  protistrana?: string | null;
  odkaz?: string | null;
};

export type VlastnostiIkonyPlatby = {
  stav: StavPlatby | null;
  pohyb?: PohybPlatby | null;
  /** Už preložené texty alebo kľúče pre `t()`. */
  dovody?: string[];
  /** Istota 'auto' → tlačidlo „Spárovať“, inak „Áno, patrí k sebe“. */
  ista?: boolean;
  zaneprazdnene?: boolean;
  onSparuj?: () => void | Promise<void>;
  onNie?: () => void;
  /** Pri 'sparovana' — zruší väzbu (po potvrdení cez `potvrd()`). */
  onZrus?: () => void | Promise<void>;
  /** Pri 'nenajdena' — kam ísť spárovať ručne (Banka). */
  odkazRucne?: string | null;
  /** Pri 'nenajdena' — vlastný text namiesto predvolenej vety o Banke (už preložený alebo kľúč pre `t()`). */
  popisNenajdena?: string;
  className?: string;
};

/** Tón redizajnu pre stav platby — farby len z `.stav-*` (web.css). */
export const TON_STAVU_PLATBY: Record<StavPlatby, TonStavu> = {
  sparovana: "uspech",
  navrh: "pozor",
  nenajdena: "chyba",
};

/** Slovenský text stavu (kľúč pre `t()`). */
export const POPIS_STAVU_PLATBY: Record<StavPlatby, string> = {
  sparovana: "Spárovaná s pohybom z účtu",
  navrh: "Nájdená platba čaká na potvrdenie",
  nenajdena: "Platba sa zatiaľ nenašla",
};

const NADPIS: Record<StavPlatby, string> = {
  sparovana: "Spárovaná platba",
  navrh: "Nájdená platba",
  nenajdena: "Platba sa zatiaľ nenašla",
};

const SIRKA_OKNA = 344;
const HRANICA_MOBILU = 768;
/** Pred zmeraním: neviditeľné, ale fokusovateľné (`visibility: hidden` by fokus do okna nepustilo). */
const SKRYTE: CSSProperties = { top: 0, left: 0, opacity: 0 };

function datumSk(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

/** Bodka farby stavu (tón cez `.stav-*` premenné). */
export function BodkaPlatby({ stav, className }: { stav: StavPlatby; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-stav-platby={stav}
      className={cn(`stav-${TON_STAVU_PLATBY[stav]}`, "block rounded-full bg-[var(--s-bod)]", className)}
    />
  );
}

/**
 * Obsah okna (bez umiestnenia). Exportovaný kvôli testom a pre prípad, že ho
 * niekto chce vložiť inam (napr. do detailu dokladu).
 */
export function ObsahPlatby({
  stav,
  pohyb,
  dovody,
  ista,
  zaneprazdnene,
  onSparuj,
  onNie,
  onZrus,
  odkazRucne,
  popisNenajdena,
  onZavri,
  idNadpisu,
}: Omit<VlastnostiIkonyPlatby, "className" | "stav"> & {
  stav: StavPlatby;
  onZavri?: () => void;
  idNadpisu?: string;
}) {
  const { t } = useT();
  const [pracuje, setPracuje] = useState(false);
  const zamknute = !!zaneprazdnene || pracuje;

  const spusti = async (akcia: (() => void | Promise<void>) | undefined) => {
    if (!akcia) return;
    setPracuje(true);
    try {
      await akcia();
      onZavri?.();
    } finally {
      setPracuje(false);
    }
  };

  const zrus = async () => {
    const ok = await potvrd(t("Zrušiť väzbu dokladu s pohybom z účtu?"), {
      potvrdit: t("Zrušiť väzbu"),
      nebezpecne: true,
    });
    if (ok) await spusti(onZrus);
  };

  const riadky: [string, string][] = [];
  if (pohyb && stav !== "nenajdena") {
    const d = datumSk(pohyb.datum);
    if (d) riadky.push([t("Dátum"), d]);
    if (pohyb.suma != null) riadky.push([t("Suma"), formatujSumu(pohyb.suma, pohyb.mena)]);
    if (pohyb.protistrana) riadky.push([t("Protistrana"), pohyb.protistrana]);
    if (pohyb.ucet) riadky.push([t("Účet"), pohyb.ucet]);
    if (pohyb.vs) riadky.push([t("VS"), pohyb.vs]);
  }

  const odkazPohybu = pohyb?.odkaz && stav !== "nenajdena" ? (
    <a
      href={pohyb.odkaz}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {t("Pohyb")}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  ) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <span className={cn(`stav-${TON_STAVU_PLATBY[stav]}`, "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--s-plocha)] text-[var(--s-text)]")}>
          <Landmark className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={idNadpisu} className="text-sm font-semibold leading-tight">
            {t(NADPIS[stav])}
          </h2>
          {stav === "navrh" && (
            <p className="mt-0.5 text-xs text-muted-foreground">{t("Patrí tento pohyb z účtu k dokladu?")}</p>
          )}
        </div>
        {onZavri && (
          <button
            type="button"
            onClick={onZavri}
            aria-label={t("Zavrieť")}
            className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {riadky.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {riadky.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 text-right font-medium tabular-nums [overflow-wrap:anywhere]">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {stav === "navrh" && dovody && dovody.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("Prečo sa zhoduje")}</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {dovody.map((d) => (
              <li key={d} className="stav stav-maly stav-pozor">
                {t(d)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stav === "nenajdena" && (popisNenajdena || odkazRucne) && (
        <p className="text-sm text-muted-foreground">
          {popisNenajdena
            ? t(popisNenajdena)
            : t("Pohyb z účtu, ktorý by k dokladu sedel, sme zatiaľ nenašli. Ak platba odišla, spárujte ju ručne v Banke.")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {stav === "navrh" && (
          <>
            <Button size="sm" disabled={zamknute || !onSparuj} onClick={() => void spusti(onSparuj)}>
              {ista ? t("Spárovať") : t("Áno, patrí k sebe")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={zamknute || !onNie}
              onClick={() => {
                onNie?.();
                onZavri?.();
              }}
            >
              {t("Nie")}
            </Button>
          </>
        )}
        {stav === "sparovana" && onZrus && (
          <Button size="sm" variant="outline" disabled={zamknute} onClick={() => void zrus()}>
            {t("Zrušiť väzbu")}
          </Button>
        )}
        {stav === "nenajdena" && odkazRucne && (
          <Button size="sm" variant="outline" asChild>
            <a href={odkazRucne}>{t("Spárovať ručne v Banke")}</a>
          </Button>
        )}
        {odkazPohybu && <span className="ml-auto">{odkazPohybu}</span>}
      </div>
    </div>
  );
}

export function IkonaPlatby(p: VlastnostiIkonyPlatby) {
  const { t } = useT();
  const tlacidlo = useRef<HTMLButtonElement>(null);
  const okno = useRef<HTMLDivElement>(null);
  const idNadpisu = useId();
  const [otvorene, setOtvorene] = useState<null | { mobil: boolean; kontajner: HTMLElement }>(null);
  const [poloha, setPoloha] = useState<CSSProperties>(SKRYTE);

  const zavri = useCallback(() => {
    setOtvorene(null);
    // Poistka: `useZatvorNaEscape` vracia fokus sám, ale nie keď ho okno nemalo.
    requestAnimationFrame(() => {
      const el = tlacidlo.current;
      if (el && el.isConnected && document.activeElement === document.body) el.focus({ preventScroll: true });
    });
  }, []);

  useZatvorNaEscape(otvorene ? zavri : null);

  // Umiestnenie okna pri ikonke (desktop): pod ňou, a keď sa nezmestí, nad ňou.
  useLayoutEffect(() => {
    if (!otvorene || otvorene.mobil) return;
    const b = tlacidlo.current?.getBoundingClientRect();
    const h = okno.current?.offsetHeight ?? 0;
    if (!b) return;
    const sirka = Math.min(SIRKA_OKNA, window.innerWidth - 16);
    const left = Math.max(8, Math.min(b.left - 12, window.innerWidth - sirka - 8));
    const dole = b.bottom + 6;
    const top = dole + h > window.innerHeight - 8 && b.top - 6 - h > 8 ? b.top - 6 - h : dole;
    setPoloha({ top, left, width: sirka });
  }, [otvorene]);

  // Pri posúvaní stránky by okno odplávalo od riadku — zavrieť.
  useEffect(() => {
    if (!otvorene || otvorene.mobil) return;
    const h = (e: Event) => {
      if (okno.current && e.target instanceof Node && okno.current.contains(e.target)) return;
      zavri();
    };
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", zavri);
    return () => {
      window.removeEventListener("scroll", h, true);
      window.removeEventListener("resize", zavri);
    };
  }, [otvorene, zavri]);

  if (!p.stav) return null;
  const stav = p.stav;
  const popis = t(POPIS_STAVU_PLATBY[stav]);

  const otvor = (e: MouseEvent) => {
    e.stopPropagation();
    if (otvorene) return zavri();
    const el = tlacidlo.current;
    // Portál do obalu redizajnu, aby okno dostalo jeho premenné (písmo, tiene).
    const kontajner = (el?.closest("[data-web-redizajn]") as HTMLElement | null) ?? document.body;
    setPoloha(SKRYTE);
    setOtvorene({ mobil: window.innerWidth < HRANICA_MOBILU, kontajner });
  };

  const obsah = (
    <ObsahPlatby
      stav={stav}
      pohyb={p.pohyb}
      dovody={p.dovody}
      ista={p.ista}
      zaneprazdnene={p.zaneprazdnene}
      onSparuj={p.onSparuj}
      onNie={p.onNie}
      onZrus={p.onZrus}
      odkazRucne={p.odkazRucne}
      popisNenajdena={p.popisNenajdena}
      onZavri={zavri}
      idNadpisu={idNadpisu}
    />
  );

  const zastav = (e: MouseEvent) => e.stopPropagation();

  return (
    <>
      <button
        ref={tlacidlo}
        type="button"
        data-neotvarat=""
        data-stav-platby={stav}
        aria-label={t("Platba: {stav}", { stav: popis })}
        title={popis}
        aria-haspopup="dialog"
        aria-expanded={!!otvorene}
        onClick={otvor}
        className={cn(
          "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          otvorene && "bg-muted text-foreground",
          p.className,
        )}
      >
        <Landmark className="h-4 w-4" aria-hidden="true" />
        <BodkaPlatby stav={stav} className="absolute right-0.5 top-0.5 h-2 w-2 ring-2 ring-background" />
      </button>
      {otvorene &&
        createPortal(
          otvorene.mobil ? (
            <div
              className="fixed inset-0 z-50 flex items-end bg-[var(--w-prekrytie,rgb(0_0_0/0.4))]"
              data-neotvarat=""
              onClick={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) zavri();
              }}
            >
              <div
                ref={okno}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idNadpisu}
                data-neotvarat=""
                data-okno-platby="spodne"
                className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-[var(--w-tien-okno,0_-8px_30px_rgb(0_0_0/0.2))]"
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" aria-hidden="true" />
                {obsah}
              </div>
            </div>
          ) : (
            <div
              className="fixed inset-0 z-50"
              data-neotvarat=""
              onClick={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) zavri();
              }}
            >
              <div
                ref={okno}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idNadpisu}
                data-neotvarat=""
                data-okno-platby="pri-ikonke"
                onClick={zastav}
                style={{ position: "fixed", ...poloha }}
                className="rounded-xl border bg-popover p-4 text-popover-foreground shadow-[var(--w-tien-plavajuci,0_10px_30px_rgb(0_0_0/0.15))]"
              >
                {obsah}
              </div>
            </div>
          ),
          otvorene.kontajner,
        )}
    </>
  );
}
