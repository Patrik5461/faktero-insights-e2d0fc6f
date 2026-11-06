import { useEffect, useRef, type ReactNode } from "react";
import { Loader2, Power, PowerOff, Trash2, X } from "lucide-react";
import type { HromadnyVyber } from "@/hooks/useHromadnyVyber";
import { MAX_KODOV_V_ZOZNAME, type NaMazanie } from "@/lib/faktero/hromadny-vyber";
import { potvrd } from "@/lib/potvrdenie";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";

/*
  Zdieľané kúsky hromadného výberu v tabuľkách číselníkov: zaškrtávadlo v
  hlavičke (s čiastočným stavom), zaškrtávadlo riadku (Shift = rozsah),
  lišta akcií nad tabuľkou a hláška o použitých kódoch, ktoré sa nedali
  zmazať. Stav drží `useHromadnyVyber`.

  Zaškrtávadlo riadku patrí do prvej bunky `KlikatelnyRiadok` — zelené
  zvýraznenie označeného riadku kreslí `styles.css` z `:has(:checked)`.
*/

/** Zaškrtávadlo „označiť všetko" — len viditeľné riadky; pri čiastočnom výbere „indeterminate". */
export function ZaskrtavadloVsetkych({ vyber, className }: { vyber: HromadnyVyber; className?: string }) {
  const { t } = useT();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = vyber.stav === "cast";
  }, [vyber.stav]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={vyber.stav === "vsetko"}
      onChange={() => vyber.prepniVsetky()}
      aria-label={t("Označiť všetko zobrazené")}
      className={className ?? "h-4 w-4 cursor-pointer align-middle accent-primary"}
    />
  );
}

/** Zaškrtávadlo riadku; Shift+klik označí rozsah od posledného kliknutého riadku. */
export function ZaskrtavadloRiadku({
  vyber,
  id,
  popis,
  className,
}: {
  vyber: HromadnyVyber;
  id: string;
  /** Čo riadok je (napr. kód) — do popisu pre čítačku. */
  popis: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <input
      type="checkbox"
      checked={vyber.jeOznaceny(id)}
      // Stav mení onClick (pozná Shift); onChange len aby React nehlásil „read-only".
      onChange={() => {}}
      onClick={(e) => vyber.prepni(id, e.shiftKey)}
      // Shift+klik by inak označil text medzi riadkami.
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault();
      }}
      aria-label={t("Označiť {kod}", { kod: popis })}
      className={className ?? "h-4 w-4 cursor-pointer align-middle accent-primary"}
    />
  );
}

const tlacidlo =
  "inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-semibold hover:bg-secondary disabled:opacity-50";

/**
 * Lišta nad tabuľkou, keď je niečo označené. Tlačidlá Aktivovať/Deaktivovať
 * sa ukážu len so zadanou obsluhou (číselník bez stĺpca „aktívne" ich nemá)
 * a len keď majú čo zmeniť.
 */
export function ListaHromadnychAkcii({
  pocet,
  onZmazat,
  onAktivovat,
  onDeaktivovat,
  onZrusit,
  busy,
  children,
}: {
  pocet: number;
  /** Ďalšie akcie zoznamu (export, zaevidovanie…) — kreslia sa pred „Zrušiť výber". */
  children?: ReactNode;
  onZmazat?: () => void;
  /** Obsluha „Aktivovať označené" — bez nej (alebo `null`, keď nie je čo zapnúť) sa tlačidlo neukáže. */
  onAktivovat?: (() => void) | null;
  onDeaktivovat?: (() => void) | null;
  onZrusit: () => void;
  /** Práve beží akcia — tlačidlá sú vypnuté, pri nej sa točí koliesko. */
  busy?: "zmazat" | "aktivovat" | "deaktivovat" | null;
}) {
  const { t } = useT();
  if (!pocet) return null;
  const toci = (k: string) => (busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null);
  return (
    <div
      role="region"
      aria-label={t("Hromadné akcie")}
      className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm"
    >
      <span className="mr-1 font-semibold">
        {t("Označené:")} <span className="tabular-nums">{pocet}</span>
      </span>
      {onZmazat ? (
        <button
          type="button"
          onClick={onZmazat}
          disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          {toci("zmazat") ?? <Trash2 className="h-3.5 w-3.5" />} {t("Zmazať označené")}
        </button>
      ) : null}
      {onDeaktivovat ? (
        <button type="button" onClick={onDeaktivovat} disabled={!!busy} className={tlacidlo}>
          {toci("deaktivovat") ?? <PowerOff className="h-3.5 w-3.5" />} {t("Deaktivovať označené")}
        </button>
      ) : null}
      {onAktivovat ? (
        <button type="button" onClick={onAktivovat} disabled={!!busy} className={tlacidlo}>
          {toci("aktivovat") ?? <Power className="h-3.5 w-3.5" />} {t("Aktivovať označené")}
        </button>
      ) : null}
      {children}
      <button
        type="button"
        onClick={onZrusit}
        disabled={!!busy}
        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> {t("Zrušiť výber")}
      </button>
    </div>
  );
}

/**
 * Hláška po mazaní: kódy, ktoré sa nedali zmazať, lebo ich niečo používa,
 * a deaktivácia jedným klikom (bez nej len zoznam).
 */
export function PouziteNaDeaktivaciu({
  polozky,
  nadpis,
  onDeaktivovat,
  onZavriet,
  busy,
}: {
  polozky: { kod: string; kde?: string }[];
  /** Úvod hlášky (preložený); predvolene o záznamoch použitých v dokladoch. */
  nadpis?: string;
  onDeaktivovat?: () => void;
  onZavriet: () => void;
  busy?: boolean;
}) {
  const { t } = useT();
  if (!polozky.length) return null;
  const prve = polozky.slice(0, MAX_KODOV_V_ZOZNAME);
  const zvysok = polozky.length - prve.length;
  return (
    <div
      role="alert"
      className="mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
    >
      <p className="min-w-0 flex-1 basis-64">
        {nadpis ??
          (onDeaktivovat
            ? t("Tieto záznamy sa používajú, môžete ich iba deaktivovať:")
            : t("Tieto záznamy sa používajú a nedajú sa zmazať:"))}{" "}
        {prve.map((p, i) => (
          <span key={`${p.kod}-${i}`}>
            {i ? ", " : ""}
            <span className="font-mono font-semibold">{p.kod}</span>
            {p.kde ? <span className="text-xs text-muted-foreground"> ({p.kde})</span> : null}
          </span>
        ))}
        {zvysok > 0 ? ` ${t("+ {n} ďalších", { n: zvysok })}` : null}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {onDeaktivovat ? (
          <button
            type="button"
            onClick={onDeaktivovat}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PowerOff className="h-3.5 w-3.5" />}
            {t("Deaktivovať ({n})", { n: polozky.length })}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onZavriet}
          aria-label={t("Zavrieť")}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Pás pod lištou stránkovaného zoznamu: keď je označená celá strana a filter
 * má viac riadkov, ponúkne „Označiť všetkých N podľa filtra" (ako Gmail).
 * Po označení povie, že akcie zasiahnu celý filter, a dá výber zrušiť.
 */
export function PasVyberuFiltra({
  naStrane,
  celkom,
  vsetky,
  stranaOznacena,
  nacitava,
  onVsetky,
  onZrusit,
}: {
  /** Riadky na tejto strane. */
  naStrane: number;
  /** Riadky celého filtra. */
  celkom: number;
  /** Označené sú všetky riadky filtra. */
  vsetky: boolean;
  /** Označená je celá strana. */
  stranaOznacena: boolean;
  nacitava?: boolean;
  onVsetky: () => void;
  onZrusit: () => void;
}) {
  const { t } = useT();
  if (!stranaOznacena || celkom <= naStrane) return null;
  return (
    <div
      role="status"
      data-pas-vyberu-filtra
      className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-center text-xs"
    >
      {vsetky ? (
        <>
          <span>{t("Označených je všetkých {n} dokladov podľa filtra — hromadné akcie zasiahnu všetky.", { n: celkom })}</span>
          <button type="button" onClick={onZrusit} className="font-semibold text-primary-hover underline-offset-2 hover:underline">
            {t("Zrušiť výber")}
          </button>
        </>
      ) : (
        <>
          <span>{t("Označené sú všetky doklady na tejto strane ({n}).", { n: naStrane })}</span>
          <button
            type="button"
            onClick={onVsetky}
            disabled={nacitava}
            className="inline-flex items-center gap-1 font-semibold text-primary-hover underline-offset-2 hover:underline disabled:opacity-60"
          >
            {nacitava ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("Označiť všetkých {n} podľa filtra", { n: celkom })}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Potvrdenie hromadného mazania dokladov. Odovzdané do Pohody a zamknuté
 * (uzavreté obdobie) sa nemažú — okno povie koľko a prečo. Vráti, či mazať.
 */
export async function potvrdHromadneMazanie(
  t: (k: string, p?: Record<string, string | number>) => string,
  m: NaMazanie,
  otazka: string,
): Promise<boolean> {
  const dovody: string[] = [];
  if (m.odovzdane)
    dovody.push(t("{n} odovzdaných do Pohody sa nevymaže — najprv ich vráťte z Pohody.", { n: m.odovzdane }));
  if (m.zamknute) dovody.push(t("{n} zamknutých alebo v uzavretom období sa nevymaže.", { n: m.zamknute }));
  if (!m.ids.length) {
    toast.warning(t("Z označených dokladov sa nedá vymazať žiadny"), { description: dovody.join(" ") });
    return false;
  }
  return potvrd([otazka, ...dovody].join("\n"), { nebezpecne: true });
}
