/*
  Uložený doklad so zlou DPH (staré dáta — prenos z Doklada len s hlavičkou,
  vyťaženie s dopočítanou „sadzbou“ 16,82 % a pod.): jasné upozornenie
  s tlačidlom „Opraviť rozpis DPH“ a okno, v ktorom sa rozpis opraví po
  riadkoch zákonných sadzieb. Hlavička sa uloží zo súčtov rozpisu, odpočet
  nezdanenej zálohy prijatej faktúry má vlastné pole (`advance_amount`).
*/
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { hlaskaSpustacaDph } from "@/lib/faktero/dph-pravidlo";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { formatujMenu } from "@/lib/faktero/mena";
import { DesatinnePole } from "@/components/faktero/DesatinnePole";
import type { VysledokKontroly } from "@/lib/faktero/rozpis-dph-kontrola";
import { skontrolujDphDokladu } from "@/lib/faktero/dph-pravidlo";
import { zaokruhlenieZPoloziek } from "@/lib/faktero/zaokruhlenie-blocku";
import { EditorRozpisuDph } from "./EditorRozpisuDph";
import {
  hlavnaSadzba,
  historickeSadzbyNaVyber,
  kontrolaFormulara,
  rozpisZDokladu,
  sadzbyNaVyber,
  spoluPoOprave,
  suctyRozpisu,
  type RiadokRozpisu,
} from "./dph-formular";

export type TabulkaDokladu = "purchase_invoices" | "expense_documents";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Kontrola DPH uloženého dokladu — prijatá faktúra alebo bloček — tým istým
 * pravidlom, ktoré stráži databáza (`skontrolujDphDokladu`). Zálohová faktúra,
 * koncept a samofaktúra sa nekontrolujú.
 */
export function kontrolaDphDokladu(
  tabulka: TabulkaDokladu,
  d: Record<string, any> | null | undefined,
  krajina: string | null | undefined,
): VysledokKontroly {
  if (!d) return { ok: true, chyby: [] };
  const chyby = skontrolujDphDokladu(tabulka, d, krajina);
  return { ok: chyby.length === 0, chyby: chyby.map((c) => ({ kod: "riadok_dph", sprava: c.text })) };
}

/** Kontrola rozpisu v okne opravy: zákonná sadzba, DPH zo základu (hlavička = súčty). */
export function kontrolaOpravy(
  riadky: RiadokRozpisu[],
  krajina: string | null | undefined,
  den: string | null | undefined,
  krajinaDodavatela?: string | null,
  poloziek?: number,
): VysledokKontroly {
  return kontrolaFormulara({ riadky, krajina, den, krajinaDodavatela, poloziek });
}

export function OknoOpravyRozpisuDph({
  tabulka,
  id,
  krajina,
  onZavri,
  onUlozene,
}: {
  tabulka: TabulkaDokladu;
  id: string;
  krajina: string | null | undefined;
  onZavri: () => void;
  onUlozene?: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onZavri);
  const [doklad, setDoklad] = useState<Record<string, any> | null>(null);
  const [riadky, setRiadky] = useState<RiadokRozpisu[]>([]);
  const [zaloha, setZaloha] = useState<number | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const prijata = tabulka === "purchase_invoices";

  useEffect(() => {
    let zrusene = false;
    (async () => {
      const { data, error } = await supabase.from(tabulka).select("*").eq("id", id).maybeSingle();
      if (zrusene) return;
      if (error || !data) {
        toast.error(t("Doklad sa nepodarilo načítať."));
        onZavri();
        return;
      }
      const d = data as Record<string, any>;
      setDoklad(d);
      const r = rozpisZDokladu({
        vat_breakdown: d.vat_breakdown,
        vat_rate: d.vat_rate,
        zaklad: prijata ? d.amount_without_vat : d.net_amount,
        dph: d.vat_amount,
      });
      setRiadky(r.length ? r : [{ sadzba: sadzbyNaVyber(krajina)[0] ?? 0, zaklad: 0, dph: 0 }]);
      setZaloha(d.advance_amount != null ? Math.abs(Number(d.advance_amount)) : null);
    })();
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabulka, id]);

  const den = doklad ? (prijata ? doklad.delivery_date || doklad.issue_date : doklad.issue_date) : null;
  const krajinaDod = doklad?.supplier_country ?? null;
  const sadzby = useMemo(() => sadzbyNaVyber(krajina, den, krajinaDod), [krajina, den, krajinaDod]);
  const historicke = useMemo(() => historickeSadzbyNaVyber(krajina, krajinaDod), [krajina, krajinaDod]);
  const dobropis =
    Boolean(doklad?.opravuje_cislo) ||
    (Number(prijata ? doklad?.amount_total : doklad?.total_amount) || 0) < 0;
  const kontrola = kontrolaOpravy(
    riadky,
    krajina,
    den,
    krajinaDod,
    Array.isArray(doklad?.items) ? doklad.items.length : undefined,
  );
  const s = suctyRozpisu(riadky);
  const mena = doklad?.currency ?? "EUR";
  const zaokr = !prijata && doklad ? zaokruhlenieZPoloziek(doklad.items) : 0;
  const stareSpolu = doklad ? Number(prijata ? doklad.amount_total : doklad.total_amount) || 0 : 0;
  /* Prijatá: uložená suma ostáva, keď sa od základ + DPH líši len o zaokrúhlenie (CZ haliere). */
  const noveSpolu = prijata ? spoluPoOprave(stareSpolu, s.zaklad, s.dph, mena) : r2(s.spolu + zaokr);

  async function uloz() {
    if (!doklad) return;
    if (!kontrola.ok) {
      toast.error(t("Rozpis DPH nesedí — opravte označené riadky."));
      return;
    }
    setUkladam(true);
    try {
      const vat_breakdown = riadky.map((r) => ({
        sadzba: r.sadzba,
        zaklad: r2(r.zaklad),
        dph: r2(r.dph),
        ...(r.vat_category ? { vat_category: r.vat_category } : {}),
        ...(r.pdp ? { pdp: true } : {}),
      }));
      const zmena: Record<string, unknown> = prijata
        ? {
            vat_breakdown,
            amount_without_vat: s.zaklad,
            vat_amount: s.dph,
            amount_total: noveSpolu,
            advance_amount: zaloha ? r2(Math.abs(zaloha)) : null,
          }
        : {
            vat_breakdown,
            net_amount: s.zaklad,
            vat_amount: s.dph,
            vat_rate: hlavnaSadzba(riadky),
            total_amount: noveSpolu,
          };
      const { error } = await supabase.from(tabulka).update(zmena as never).eq("id", id);
      if (error) throw error;
      // Kontrola „na kontrolu“ kvôli rozpisu je vybavená — človek ho práve opravil.
      await supabase
        .from(tabulka)
        .update({ na_kontrolu_at: null, na_kontrolu_dovod: null } as never)
        .eq("id", id)
        .like("na_kontrolu_dovod", "Rozpis DPH%");
      toast.success(t("Rozpis DPH je opravený"));
      onUlozene?.();
      onZavri();
    } catch (e) {
      // Databáza (spúšťač FAKTERO_DPH) odmietla DPH mimo zákonných sadzieb — povedz prečo.
      const dph = hlaskaSpustacaDph(e);
      if (dph) {
        toast.error(dph);
        return;
      }
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      toast.error(t(friendlyError(e, "Uloženie zlyhalo")));
    } finally {
      setUkladam(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onZavri();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Oprava rozpisu DPH")}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold">{t("Oprava rozpisu DPH")}</h2>
          <button
            type="button"
            aria-label={t("Zavrieť")}
            onClick={onZavri}
            className="rounded p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!doklad ? (
          <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "Prepíšte rozpis podľa tabuľky DPH na doklade — sadzba sa vyberá zo zákonných, DPH sa počíta zo základu. Sumy dokladu sa uložia zo súčtov.",
              )}
            </p>
            <EditorRozpisuDph
              riadky={riadky}
              onChange={setRiadky}
              sadzby={sadzby}
              historicke={historicke}
              dobropis={dobropis}
              mena={mena}
              kontrola={kontrola}
            />
            {prijata ? (
              <label className="flex flex-wrap items-center justify-end gap-2 text-sm">
                <span className="text-muted-foreground">{t("Odpočet nezdanenej zálohy")}</span>
                <span aria-hidden>−</span>
                <DesatinnePole
                  aria-label={t("Odpočet zálohy")}
                  hodnota={zaloha ?? 0}
                  naZmenu={(v) => setZaloha(Math.abs(v) || null)}
                  className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-right tabular-nums"
                />
                {mena}
              </label>
            ) : null}
            {Math.abs(noveSpolu - stareSpolu) > 0.009 && stareSpolu ? (
              <p className="text-xs text-muted-foreground">
                {t("Suma spolu sa zmení z {stara} na {nova}.", {
                  stara: formatujMenu(stareSpolu, mena),
                  nova: formatujMenu(noveSpolu, mena),
                })}
              </p>
            ) : null}
            {prijata && zaloha ? (
              <p className="text-right text-sm font-medium">
                {t("Na úhradu")}: {formatujMenu(r2(noveSpolu - zaloha), mena)}
              </p>
            ) : null}
            {!kontrola.ok ? (
              <ul role="alert" className="dk-pozor list-disc space-y-0.5 rounded-lg border p-3 pl-7 text-xs">
                {kontrola.chyby.map((c, i) => (
                  <li key={i}>{c.sprava}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onZavri}
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
              >
                {t("Zrušiť")}
              </button>
              <button
                type="button"
                disabled={ukladam || !kontrola.ok}
                onClick={uloz}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {ukladam ? t("Ukladám…") : t("Uložiť rozpis")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Upozornenie na detaile uloženého dokladu so zlou DPH + tlačidlo na opravu.
 * Pri sediacom rozpise nekreslí nič.
 */
export function UpozornenieZlejDph({
  tabulka,
  doklad,
  krajina,
  onOpravene,
  zamknute = false,
  className = "",
}: {
  tabulka: TabulkaDokladu;
  doklad: Record<string, any> | null | undefined;
  krajina: string | null | undefined;
  onOpravene?: () => void;
  /** Odovzdaný / zamknutý doklad — upozornenie áno, oprava až po vrátení. */
  zamknute?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const [okno, setOkno] = useState(false);
  const kontrola = kontrolaDphDokladu(tabulka, doklad, krajina);
  if (!doklad?.id || kontrola.ok) return null;
  return (
    <>
      <div
        role="alert"
        data-testid="zla-dph-dokladu"
        className={`dk-pozor flex items-start gap-2 rounded-lg border p-3 text-xs ${className}`}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <div className="font-semibold">{t("DPH na doklade nesedí so zákonnými sadzbami")}</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {kontrola.chyby.map((c, i) => (
              <li key={i} className="break-words">
                {c.sprava}
              </li>
            ))}
          </ul>
          {zamknute ? (
            <p className="text-muted-foreground">
              {t("Doklad je odovzdaný do účtovníctva alebo zamknutý — rozpis opravíte po jeho vrátení.")}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setOkno(true)}
              className="mt-1 inline-flex h-8 items-center rounded-md border border-current/30 px-3 font-medium hover:bg-background/60"
            >
              {t("Opraviť rozpis DPH")}
            </button>
          )}
        </div>
      </div>
      {okno ? (
        <OknoOpravyRozpisuDph
          tabulka={tabulka}
          id={doklad.id}
          krajina={krajina}
          onZavri={() => setOkno(false)}
          onUlozene={onOpravene}
        />
      ) : null}
    </>
  );
}
