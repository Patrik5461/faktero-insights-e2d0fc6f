import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Settings2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/button";
import { ciselneRadyFn, ulozCiselnyRadFn } from "@/lib/faktero/ciselne-rady.functions";
import { nastavRadSplatokFn } from "@/lib/faktero/financovanie-pohoda.functions";
import {
  chybaSablony,
  normalizujSablonu,
  predlohyRadu,
  resetujeSaMesacne,
  ukazkaCisla,
  type CiselnyRad,
} from "@/lib/faktero/ciselne-rady";

const VSTUP = "mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";

/**
 * Vlastný číselný rad splátok kalendára.
 *
 * Rad je obyčajný číselný rad (Nastavenia → Číselné rady) druhu „Splátky
 * leasingov a úverov“ — viac kalendárov môže zdieľať jeden, alebo má každý
 * svoj. Po výbere dostanú čísla hneď všetky splátky bez čísla; pridelené
 * číslo sa už nemení. Bez radu číslo pridelí Pohoda pri importe.
 */
export function RadSplatok({
  cid,
  zmluva,
  onZmena,
  kontokorent,
}: {
  cid: string;
  zmluva: any;
  onZmena: () => Promise<void> | void;
  /** Kontokorent sa do Pohody neexportuje — rad sa len uloží. */
  kontokorent?: boolean;
}) {
  const { t } = useT();
  const nacitaj = useServerFn(ciselneRadyFn);
  const ulozRad = useServerFn(ulozCiselnyRadFn);
  const nastav = useServerFn(nastavRadSplatokFn);
  const [rady, setRady] = useState<CiselnyRad[]>([]);
  const [busy, setBusy] = useState(false);
  const [novy, setNovy] = useState<{ name: string; format: string; start_from: number } | null>(null);
  const aktualny = String(zmluva.number_series_id ?? "");
  const predlohy = predlohyRadu("financing");

  async function obnovRady() {
    try {
      const v = await nacitaj({ data: { company_id: cid } });
      setRady(v.rady.filter((r) => r.kind === "financing"));
    } catch {
      setRady([]);
    }
  }
  useEffect(() => {
    void obnovRady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  async function vyber(seriesId: string | null) {
    setBusy(true);
    try {
      const r = await nastav({ data: { company_id: cid, contract_id: zmluva.id, series_id: seriesId } });
      if (!seriesId) toast.success(t("Splátky budú bez vlastného čísla — pridelí ho Pohoda."));
      else if (r.pridelene) toast.success(t("Číselný rad uložený, čísla dostalo splátok: {n}.", { n: r.pridelene }));
      else toast.success(t("Číselný rad uložený."));
      await onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(false);
    }
  }

  async function zalozARobit() {
    if (!novy) return;
    const chyba = chybaSablony(novy.format);
    if (chyba) return toast.error(t(chyba));
    if (!novy.name.trim()) return toast.error(t("Zadajte názov radu."));
    setBusy(true);
    try {
      const { id } = await ulozRad({
        data: {
          company_id: cid,
          kind: "financing",
          name: novy.name.trim(),
          format: novy.format.trim(),
          is_default: !rady.some((r) => r.is_default),
          active: true,
          start_from: Math.max(1, Number(novy.start_from) || 1),
        },
      });
      setNovy(null);
      await obnovRady();
      setBusy(false);
      await vyber(id);
    } catch (e: any) {
      toast.error(e?.message ?? t("Rad sa nepodarilo uložiť."));
      setBusy(false);
    }
  }

  const ponuka = rady.filter((r) => r.active || r.id === aktualny);
  const vybrany = rady.find((r) => r.id === aktualny);
  const hotova = novy?.format ? normalizujSablonu(novy.format) : "";
  const chybaNoveho = novy?.format ? chybaSablony(novy.format) : null;

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("Číslo dokladu splátky")}</h3>
        <Link
          to="/ciselne-rady"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Settings2 className="h-3 w-3" /> {t("Číselné rady")}
        </Link>
      </div>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
        {kontokorent
          ? t("Kontokorent sa do Pohody zatiaľ neexportuje — rad sa len uloží pri zmluve.")
          : t("Každá splátka dostane vlastné číslo dokladu z tohto radu a export ho pošle do Pohody. Pridelené číslo sa už nemení. Bez radu číslo pridelí Pohoda.")}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 sm:max-w-sm">
          <span className="text-xs text-muted-foreground">{t("Vlastný číselný rad")}</span>
          <select
            aria-label={t("Vlastný číselný rad")}
            value={aktualny}
            disabled={busy}
            onChange={(e) => void vyber(e.target.value || null)}
            className={VSTUP}
          >
            <option value="">{t("bez vlastného čísla (pridelí Pohoda)")}</option>
            {ponuka.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.format}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setNovy({
              name: rady.length ? String(zmluva.contract_number || zmluva.name || "").slice(0, 60) : t("Splátky leasingov a úverov"),
              format: predlohy[0]?.format ?? "SPL{YYYY}{NNNN}",
              start_from: 1,
            })
          }
        >
          <Plus className="h-4 w-4" /> {t("Nový rad")}
        </Button>
      </div>
      {vybrany && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Tvar čísla: {c}", { c: ukazkaCisla(vybrany.format, vybrany.start_from ?? 1) })}
        </p>
      )}

      {novy && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-3 [&>*]:min-w-0">
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Názov")}</span>
            <input
              value={novy.name}
              maxLength={60}
              onChange={(e) => setNovy({ ...novy, name: e.target.value })}
              className={VSTUP}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Šablóna čísla")}</span>
            <input
              value={novy.format}
              maxLength={40}
              list="predlohy-radu-splatok"
              onChange={(e) => setNovy({ ...novy, format: e.target.value })}
              placeholder="LEAS{YYYY}{NNN}"
              className={`${VSTUP} font-mono`}
            />
            <datalist id="predlohy-radu-splatok">
              {predlohy.map((p) => (
                <option key={p.format} value={p.format}>
                  {t(p.popis)}
                </option>
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Začať od poradia")}</span>
            <input
              type="number"
              min={1}
              value={novy.start_from}
              onChange={(e) => setNovy({ ...novy, start_from: Number(e.target.value) || 1 })}
              className={`${VSTUP} tabular-nums`}
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            {chybaNoveho ? (
              <span className="text-destructive">{t(chybaNoveho)}</span>
            ) : hotova ? (
              <>
                {t("Prvé číslo:")} <strong className="tabular-nums">{ukazkaCisla(hotova, novy.start_from)}</strong> ·{" "}
                {resetujeSaMesacne(hotova) ? t("poradie sa resetuje mesačne") : t("poradie sa resetuje ročne")}
                {" · "}
                {t("{YYYY} rok, {YY} rok dvojčíslím, {MM} mesiac, {NNN} poradie — podľa splatnosti splátky.")}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button onClick={() => void zalozARobit()} disabled={busy || !!chybaNoveho}>
              {t("Založiť a použiť")}
            </Button>
            <Button variant="outline" onClick={() => setNovy(null)} disabled={busy}>
              {t("Zrušiť")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
