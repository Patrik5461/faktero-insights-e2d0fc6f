import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import type { KontrolaDatumu } from "@/lib/faktero/datum-vystavenia";
import {
  kontrolaDatumuVystaveniaFn,
  zmenDatumVystaveniaNaDnesFn,
} from "@/lib/faktero/datum-vystavenia.functions";

/** Ako dopadlo okno: `null` = zrušené, inak sa smie odoslať. */
export type VysledokDatumu = { zmenene: boolean; potvrdenyStaryDatum: boolean } | null;

/**
 * Pred prvým odoslaním faktúry: dátum vystavenia musí byť dnešný.
 *
 * `over(id)` sa opýta servera; keď je dátum starší, ukáže okno a počká na
 * rozhodnutie. Bez zmeny dátumu odoslanie nepokračuje — pôvodný dátum sa dá
 * potvrdiť len pri doklade, ktorý sa zmeniť nedá (uzamknuté obdobie, export).
 * Server rovnaké pravidlo kontroluje znova.
 */
export function useAktualnyDatum(): {
  over: (invoiceId: string) => Promise<VysledokDatumu>;
  okno: ReactNode;
} {
  const kontrolaFn = useServerFn(kontrolaDatumuVystaveniaFn);
  const [ziadost, setZiadost] = useState<{
    invoiceId: string;
    k: KontrolaDatumu;
    vyries: (v: VysledokDatumu) => void;
  } | null>(null);

  async function over(invoiceId: string): Promise<VysledokDatumu> {
    let k: KontrolaDatumu | undefined;
    try {
      k = (await kontrolaFn({ data: { invoiceIds: [invoiceId] } }))[invoiceId];
    } catch {
      // Kontrola nevyšla (výpadok) — rozhodne server pri odoslaní.
      return { zmenene: false, potvrdenyStaryDatum: false };
    }
    if (!k?.treba) return { zmenene: false, potvrdenyStaryDatum: false };
    return new Promise<VysledokDatumu>((vyries) => setZiadost({ invoiceId, k: k!, vyries }));
  }

  const okno = ziadost ? (
    <AktualnyDatumOkno
      invoiceId={ziadost.invoiceId}
      k={ziadost.k}
      onHotovo={(v) => {
        ziadost.vyries(v);
        setZiadost(null);
      }}
    />
  ) : null;

  return { over, okno };
}

export function AktualnyDatumOkno({
  invoiceId,
  k,
  onHotovo,
}: {
  invoiceId: string;
  k: KontrolaDatumu;
  onHotovo: (v: VysledokDatumu) => void;
}) {
  const { t } = useT();
  const zmenFn = useServerFn(zmenDatumVystaveniaNaDnesFn);
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const zrus = () => !pracujem && onHotovo(null);
  useZatvorNaEscape(zrus);

  const datum = datumNaDoklade(k.datum);
  const dnes = datumNaDoklade(k.dnes);

  async function zmen() {
    setPracujem(true);
    setChyba(null);
    try {
      await zmenFn({ data: { invoiceId } });
      onHotovo({ zmenene: true, potvrdenyStaryDatum: false });
    } catch (e) {
      setChyba(t((e as Error).message || "Dátum sa nepodarilo zmeniť."));
      setPracujem(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={zrus}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Dátum vystavenia nie je dnešný")}
        className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-700 dark:text-amber-400">
            {k.mozno ? <CalendarClock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-lg font-semibold">{t("Dátum vystavenia nie je dnešný")}</h3>
            <p className="text-sm text-muted-foreground">
              {t(
                "Dátum vystavenia je {datum}. Faktúra sa odosiela dnes — dátum vystavenia by mal byť aktuálny.",
                { datum },
              )}
            </p>
          </div>
        </div>

        {k.mozno ? (
          <ul className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <li>{t("Dátum vystavenia: {stary} → {novy}", { stary: datum, novy: dnes })}</li>
            {k.povodnaSplatnost && k.novaSplatnost && (
              <li>
                {t("Splatnosť: {stara} → {nova} (lehota ostáva rovnaká)", {
                  stara: datumNaDoklade(k.povodnaSplatnost),
                  nova: datumNaDoklade(k.novaSplatnost),
                })}
              </li>
            )}
            {k.dodanie && (
              <li className="text-muted-foreground">
                {t("Dátum dodania ostáva {datum}.", { datum: datumNaDoklade(k.dodanie) })}
              </li>
            )}
            {k.ineObdobie && k.cislo && (
              <li className="text-muted-foreground">
                {t(
                  k.ineObdobie === "rok"
                    ? "Faktúra sa presunie do iného roka. Číslo {cislo} ostáva pôvodné."
                    : "Faktúra sa presunie do iného mesiaca. Číslo {cislo} ostáva pôvodné.",
                  { cislo: k.cislo },
                )}
              </li>
            )}
          </ul>
        ) : (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            {t(k.dovod ?? "Dátum vystavenia sa zmeniť nedá.", {
              datum: datumNaDoklade(k.zamknuteDo),
            })}{" "}
            {t("Faktúru môžete odoslať len s pôvodným dátumom {datum}.", { datum })}
          </p>
        )}

        {chyba && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {chyba}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={zrus} disabled={pracujem}>
            {t("Zrušiť")}
          </Button>
          {k.mozno ? (
            <Button onClick={zmen} disabled={pracujem}>
              {pracujem ? t("Mením dátum…") : t("Zmeniť dátum vystavenia na dnes a odoslať")}
            </Button>
          ) : (
            <Button onClick={() => onHotovo({ zmenene: false, potvrdenyStaryDatum: true })}>
              {t("Odoslať s dátumom {datum}", { datum })}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
