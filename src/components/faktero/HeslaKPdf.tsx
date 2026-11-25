import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { PoleHesla } from "@/components/faktero/PoleHesla";
import { potvrd } from "@/lib/potvrdenie";
import {
  odomkniNespracovanyFn,
  pridajHesloPdfFn,
  zmazHesloPdfFn,
  zoznamHesielPdfFn,
  type HesloPdf,
} from "@/lib/faktero/pdf-hesla.functions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";

const pole =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * Zaheslovaný nespracovaný doklad — zadanie hesla priamo v detaile.
 * Po odomknutí sa súbor nahradí verziou bez hesla a doklad sa prečíta znova.
 */
export function OdomknutiePdf({
  companyId,
  id,
  onOdomknute,
  className = "",
}: {
  companyId: string;
  id: string;
  onOdomknute: () => void;
  className?: string;
}) {
  const { t } = useT();
  const odomkni = useServerFn(odomkniNespracovanyFn);
  const [heslo, setHeslo] = useState("");
  const [zapamatat, setZapamatat] = useState(true);
  const [busy, setBusy] = useState(false);

  async function potvrdit() {
    if (!heslo) return;
    setBusy(true);
    try {
      await odomkni({ data: { company_id: companyId, id, heslo, zapamatat } });
      toast.success(t("PDF je odomknuté — doklad sa číta."));
      setHeslo("");
      onOdomknute();
    } catch (e: any) {
      toast.error(t(e?.message ?? "PDF sa nepodarilo odomknúť."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`dk-pozor rounded-md border p-3 text-sm ${className}`}>
      <div className="flex items-center gap-2 font-semibold">
        <Lock className="h-4 w-4 shrink-0" /> {t("PDF je chránené heslom")}
      </div>
      <p className="mt-1 text-muted-foreground">
        {t("Zadajte heslo k súboru (býva to napríklad IČO, rodné alebo zákaznícke číslo). Faktero uloží kópiu bez hesla a doklad prečíta.")}
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void potvrdit();
        }}
      >
        <PoleHesla
          obal="min-w-0 flex-1 basis-48"
          className={pole}
          value={heslo}
          onChange={(e) => setHeslo(e.target.value)}
          autoComplete="off"
          placeholder={t("Heslo k PDF")}
          aria-label={t("Heslo k PDF")}
          popisZobraz={t("Zobraziť heslo")}
          popisSkry={t("Skryť heslo")}
        />
        <button
          type="submit"
          disabled={busy || !heslo}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {t("Odomknúť")}
        </button>
        <label className="flex basis-full items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={zapamatat} onChange={(e) => setZapamatat(e.target.checked)} />
          {t("Zapamätať heslo — ďalšie PDF od tohto odosielateľa sa odomknú samy")}
        </label>
      </form>
    </div>
  );
}

/** Uložené heslá firmy k PDF (stránka Príjem dokladov mailom). */
export function HeslaKPdf() {
  const { t } = useT();
  const companyId = getActiveCompanyId();
  const zoznam = useServerFn(zoznamHesielPdfFn);
  const pridaj = useServerFn(pridajHesloPdfFn);
  const zmaz = useServerFn(zmazHesloPdfFn);
  const [hesla, setHesla] = useState<HesloPdf[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nove, setNove] = useState({ nazov: "", odosielatel: "", heslo: "" });
  const [busy, setBusy] = useState(false);

  async function obnov() {
    if (!companyId) return;
    try {
      setHesla(await zoznam({ data: { company_id: companyId } }));
      setChyba(null);
    } catch (e: any) {
      setChyba(e?.message ?? t("Heslá sa nepodarilo načítať."));
    }
  }
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function ulozit() {
    if (!companyId || !nove.nazov.trim() || !nove.heslo) return;
    setBusy(true);
    try {
      await pridaj({
        data: {
          company_id: companyId,
          nazov: nove.nazov.trim(),
          odosielatel: nove.odosielatel.trim() || null,
          heslo: nove.heslo,
        },
      });
      setNove({ nazov: "", odosielatel: "", heslo: "" });
      toast.success(t("Heslo uložené."));
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Heslo sa nepodarilo uložiť."));
    } finally {
      setBusy(false);
    }
  }

  async function odstranit(h: HesloPdf) {
    if (!companyId) return;
    if (!(await potvrd(t("Zmazať heslo „{nazov}“?", { nazov: h.nazov })))) return;
    try {
      await zmaz({ data: { company_id: companyId, id: h.id } });
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Heslo sa nepodarilo zmazať."));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 text-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="h-4 w-4 text-primary" /> {t("Heslá k PDF")}
      </h2>
      <p className="mt-1 text-muted-foreground">
        {t("Niektorí dodávatelia (operátori, banky, poisťovne) posielajú faktúry v PDF s heslom. Uložte si ho a Faktero ich odomkne samo — z mailu aj pri nahratí. Heslo sa ukladá šifrovane a nikde sa už nezobrazí.")}
      </p>
      {chyba ? (
        <p className="mt-3 text-destructive">{chyba}</p>
      ) : hesla === null ? (
        <p className="mt-3 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
        </p>
      ) : (
        <>
          {hesla.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {hesla.map((h) => (
                <li key={h.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.nazov}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {h.odosielatel ? t("Odosielateľ: {o}", { o: h.odosielatel }) : t("Skúša sa pri každom PDF")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void odstranit(h)}
                    aria-label={t("Zmazať heslo")}
                    title={t("Zmazať heslo")}
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void ulozit();
            }}
          >
            <input
              className={pole}
              placeholder={t("Názov (napr. Telekom)")}
              aria-label={t("Názov hesla")}
              value={nove.nazov}
              onChange={(e) => setNove({ ...nove, nazov: e.target.value })}
            />
            <input
              className={pole}
              placeholder={t("Odosielateľ (nepovinné, napr. telekom.sk)")}
              aria-label={t("Odosielateľ")}
              value={nove.odosielatel}
              onChange={(e) => setNove({ ...nove, odosielatel: e.target.value })}
            />
            <PoleHesla
              className={pole}
              autoComplete="new-password"
              placeholder={t("Heslo k PDF")}
              aria-label={t("Heslo k PDF")}
              value={nove.heslo}
              onChange={(e) => setNove({ ...nove, heslo: e.target.value })}
              popisZobraz={t("Zobraziť heslo")}
              popisSkry={t("Skryť heslo")}
            />
            <button
              type="submit"
              disabled={busy || !nove.nazov.trim() || !nove.heslo}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("Uložiť")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
