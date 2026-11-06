/*
  Viac hotovostných pokladní — výber pokladne vo formulároch a správa
  pokladní (pridať, premenovať, mena, skratka pre Pohodu, predvolená,
  archivovať, zmazať prázdnu). Logika je v `lib/faktero/pokladne.ts`.
*/
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getCashBook,
  listPokladne,
  ulozPokladnu,
  zmazPokladnu,
} from "@/lib/faktero/pokladna.functions";
import {
  aktivnePokladne,
  ukazatVyberPokladne,
  zoradPokladne,
  type Pokladna,
} from "@/lib/faktero/pokladne";
import { MENY } from "@/lib/faktero/mena";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

/** Pokladne aktívnej firmy; `obnov()` po zmene. */
export function usePokladne(companyId: string | null | undefined) {
  const nacitajFn = useServerFn(listPokladne);
  const [pokladne, setPokladne] = useState<Pokladna[]>([]);
  const [nacitane, setNacitane] = useState(false);
  const obnov = useCallback(() => {
    if (!companyId) return;
    nacitajFn({ data: { company_id: companyId } })
      .then((r: any) => setPokladne(zoradPokladne((r?.pokladne ?? []) as Pokladna[])))
      // Bez práva na oblasť pokladne ostane zoznam prázdny — výber sa neukáže.
      .catch(() => setPokladne([]))
      .finally(() => setNacitane(true));
  }, [companyId, nacitajFn]);
  useEffect(obnov, [obnov]);
  return { pokladne, nacitane, obnov };
}

/**
 * Výber pokladne pri pohybe alebo doklade platenom hotovosťou. Pri jednej
 * aktívnej pokladni sa nevykreslí nič — firme s jednou sa formulár nemení.
 */
export function VyberPokladne({
  pokladne,
  value,
  onChange,
  className,
  disabled,
  label,
  bezPopisu,
  selectClassName,
}: {
  pokladne: readonly Pokladna[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  disabled?: boolean;
  label?: string;
  /** Len samotný výber — popis dodá obal (napr. `Pole` v kompaktnom detaile). */
  bezPopisu?: boolean;
  selectClassName?: string;
}) {
  const { t } = useT();
  if (!ukazatVyberPokladne(pokladne)) return null;
  const akt = aktivnePokladne(pokladne);
  // Archivovaná pokladňa uloženého dokladu ostane vo výbere, nech sa nezmení potichu.
  const archivovana =
    value && !akt.some((p) => p.id === value) ? pokladne.find((p) => p.id === value) : null;
  const vyber = (
    <select
      aria-label={label ?? t("Pokladňa")}
      className={
        selectClassName ?? "w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      }
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {[...akt, ...(archivovana ? [archivovana] : [])].map((p) => (
        <option key={p.id} value={p.id}>
          {p.nazov} ({p.mena}){p.predvolena ? ` · ${t("predvolená")}` : ""}
          {!p.aktivna ? ` · ${t("archivovaná")}` : ""}
        </option>
      ))}
    </select>
  );
  if (bezPopisu) return vyber;
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs text-muted-foreground">{label ?? t("Pokladňa")}</span>
      {vyber}
    </label>
  );
}

type PokladnaSPoctom = Pokladna & { stav?: { pocet?: number } };

/**
 * Správa pokladní mimo stránky Pokladňa (Prepojenie s Pohodou). Pokladne
 * sa načítajú s počtom pohybov — podľa neho sa dá zmeniť mena a zmazať.
 */
export function PokladneVNastaveniach({
  companyId,
  className,
}: {
  companyId: string;
  className?: string;
}) {
  const nacitajFn = useServerFn(getCashBook);
  const [pokladne, setPokladne] = useState<PokladnaSPoctom[] | null>(null);
  const obnov = useCallback(() => {
    // Mesiac len skráti zoznam riadkov; stav (aj počet) pokladne je z celej histórie.
    const mesiac = new Date().toISOString().slice(0, 7);
    nacitajFn({ data: { company_id: companyId, month: mesiac, pokladna_id: null } })
      .then((r: any) => setPokladne(((r?.pokladne ?? []) as PokladnaSPoctom[]).filter((p) => p.id)))
      .catch(() => setPokladne([]));
  }, [companyId, nacitajFn]);
  useEffect(obnov, [obnov]);
  if (!pokladne) return null;
  return (
    <SpravaPokladni
      companyId={companyId}
      pokladne={pokladne}
      onZmena={obnov}
      className={className}
    />
  );
}

/** Správa pokladní firmy. `onZmena` po každom uložení (obnoví knihu). */
export function SpravaPokladni({
  companyId,
  pokladne,
  onZmena,
  className,
}: {
  companyId: string;
  pokladne: readonly PokladnaSPoctom[];
  onZmena: () => void;
  className?: string;
}) {
  const { t } = useT();
  const domaca = useMenaFirmy().kod;
  const ulozFn = useServerFn(ulozPokladnu);
  const zmazFn = useServerFn(zmazPokladnu);
  const [busy, setBusy] = useState(false);
  const [nova, setNova] = useState({ nazov: "", mena: domaca as string, kod_pohoda: "" });
  const [upravy, setUpravy] = useState<
    Record<string, { nazov: string; mena: string; kod_pohoda: string }>
  >({});

  const zoznam = zoradPokladne(pokladne).filter((p) => p.id);
  const hodnota = (p: Pokladna) =>
    upravy[p.id] ?? { nazov: p.nazov, mena: p.mena, kod_pohoda: p.kod_pohoda ?? "" };

  async function vykonaj(fn: () => Promise<unknown>, hlaska: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(hlaska);
      onZmena();
      return true;
    } catch (e: any) {
      toast.error(t(e?.message ?? "Pokladňu sa nepodarilo uložiť."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const uloz = (p: Pokladna, zmena: Record<string, unknown>, hlaska = t("Pokladňa je uložená")) =>
    vykonaj(
      () =>
        ulozFn({
          data: { company_id: companyId, id: p.id, nazov: hodnota(p).nazov, ...zmena } as any,
        }),
      hlaska,
    );

  async function pridaj(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.nazov.trim()) return;
    const ok = await vykonaj(
      () =>
        ulozFn({
          data: {
            company_id: companyId,
            nazov: nova.nazov.trim(),
            mena: nova.mena,
            kod_pohoda: nova.kod_pohoda.trim() || null,
          },
        }),
      t("Pokladňa je pridaná"),
    );
    if (ok) setNova({ nazov: "", mena: domaca, kod_pohoda: "" });
  }

  async function zmaz(p: PokladnaSPoctom) {
    if (!(await potvrd(t("Naozaj zmazať pokladňu {nazov}?", { nazov: p.nazov })))) return;
    await vykonaj(
      () => zmazFn({ data: { company_id: companyId, id: p.id } }),
      t("Pokladňa je zmazaná"),
    );
  }

  const pole = "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";
  const ikona =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50";

  return (
    <section
      aria-label={t("Pokladne")}
      className={cn("space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5", className)}
    >
      <div>
        <h2 className="text-sm font-semibold">{t("Pokladne")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            "Každá pokladňa má vlastný zostatok a menu. Skratka pre Pohodu určí, do ktorej pokladne v Pohode pohyby pôjdu.",
          )}
        </p>
      </div>

      {zoznam.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {zoznam.map((p) => {
            const h = hodnota(p);
            const zmenene =
              h.nazov !== p.nazov || h.mena !== p.mena || h.kod_pohoda !== (p.kod_pohoda ?? "");
            const prazdna = !(p.stav?.pocet ?? 0);
            return (
              <li
                key={p.id}
                className={cn(
                  "grid gap-2 p-3 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1fr)_auto] sm:items-end",
                  !p.aktivna && "opacity-70",
                )}
              >
                <label className="block min-w-0">
                  <span className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {t("Názov")}
                    {p.predvolena && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {t("predvolená")}
                      </span>
                    )}
                    {!p.aktivna && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                        {t("archivovaná")}
                      </span>
                    )}
                  </span>
                  <input
                    className={pole}
                    value={h.nazov}
                    maxLength={80}
                    onChange={(e) =>
                      setUpravy({ ...upravy, [p.id]: { ...h, nazov: e.target.value } })
                    }
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs text-muted-foreground">{t("Mena")}</span>
                  <select
                    className={pole}
                    value={h.mena}
                    // Mena sa po prvom pohybe nemení — sumy pohybov sú v nej.
                    disabled={!prazdna}
                    title={!prazdna ? t("Pokladňa s pohybmi si menu nemení") : undefined}
                    onChange={(e) =>
                      setUpravy({ ...upravy, [p.id]: { ...h, mena: e.target.value } })
                    }
                  >
                    {MENY.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {t("Skratka v Pohode")}
                  </span>
                  <input
                    className={pole}
                    value={h.kod_pohoda}
                    maxLength={19}
                    placeholder={t("napr. HP")}
                    onChange={(e) =>
                      setUpravy({ ...upravy, [p.id]: { ...h, kod_pohoda: e.target.value } })
                    }
                  />
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {zmenene && (
                    <button
                      type="button"
                      disabled={busy || !h.nazov.trim()}
                      onClick={async () => {
                        if (
                          await uloz(p, { mena: h.mena, kod_pohoda: h.kod_pohoda.trim() || null })
                        ) {
                          const { [p.id]: _, ...zvysok } = upravy;
                          setUpravy(zvysok);
                        }
                      }}
                      className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                    >
                      {t("Uložiť")}
                    </button>
                  )}
                  {!p.predvolena && p.aktivna && (
                    <button
                      type="button"
                      disabled={busy}
                      className={ikona}
                      onClick={() =>
                        uloz(p, { predvolena: true }, t("Predvolená pokladňa je zmenená"))
                      }
                      aria-label={t("Nastaviť ako predvolenú")}
                      title={t("Nastaviť ako predvolenú")}
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  {!p.predvolena && (
                    <button
                      type="button"
                      disabled={busy}
                      className={ikona}
                      onClick={() =>
                        uloz(
                          p,
                          { aktivna: !p.aktivna },
                          p.aktivna ? t("Pokladňa je archivovaná") : t("Pokladňa je obnovená"),
                        )
                      }
                      aria-label={p.aktivna ? t("Archivovať") : t("Obnoviť")}
                      title={p.aktivna ? t("Archivovať") : t("Obnoviť")}
                    >
                      {p.aktivna ? (
                        <Archive className="h-4 w-4" />
                      ) : (
                        <ArchiveRestore className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  {!p.predvolena && prazdna && (
                    <button
                      type="button"
                      disabled={busy}
                      className={cn(ikona, "text-destructive hover:bg-destructive/10")}
                      onClick={() => zmaz(p)}
                      aria-label={t("Zmazať pokladňu")}
                      title={t("Zmazať pokladňu")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={pridaj}
        className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">{t("Nová pokladňa")}</span>
          <input
            className={pole}
            value={nova.nazov}
            maxLength={80}
            required
            placeholder={t("napr. Pokladňa CZK, Predajňa")}
            onChange={(e) => setNova({ ...nova, nazov: e.target.value })}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">{t("Mena")}</span>
          <select
            className={pole}
            value={nova.mena}
            onChange={(e) => setNova({ ...nova, mena: e.target.value })}
          >
            {MENY.map((m) => (
              <option key={m.code} value={m.code}>
                {m.code}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">{t("Skratka v Pohode")}</span>
          <input
            className={pole}
            value={nova.kod_pohoda}
            maxLength={19}
            placeholder={t("napr. HP")}
            onChange={(e) => setNova({ ...nova, kod_pohoda: e.target.value })}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !nova.nazov.trim()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {t("Pridať pokladňu")}
        </button>
      </form>
    </section>
  );
}
