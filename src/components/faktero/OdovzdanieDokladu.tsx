import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Loader2, PencilLine } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import {
  opravZauctovanieFn,
  potvrdOpravuVPohodeFn,
} from "@/lib/faktero/oprava-zauctovania.functions";
import {
  NAZVY_POLI_OPRAVY,
  stavOdovzdania,
  textCesty,
  textVarovaniaVratenia,
  zauctovanieZRiadku,
  zmenyOpravy,
  type DruhDokladuOdovzdania,
  type PoleOpravy,
} from "@/lib/faktero/stav-odovzdania";
import { KV_CLENENIA, KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import { KodPohody } from "./KodPohody";
import type { Navrhy } from "./ZauctovaniePanel";

/*
  Odovzdanie dokladu do účtovníctva — história (P-1008) a „Opraviť
  zaúčtovanie“ (P-1009). Spoločné pre vystavené, prijaté faktúry aj bločky,
  v klasickom aj kompaktnom detaile.
*/

const KV_VYDANE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));

const kedy = (iso: string | null, loc: string) =>
  iso ? new Date(iso).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" }) : "";

/** Text potvrdenia pred „Vrátiť z Pohody“ — podľa toho, ako doklad odišiel. */
export function useVarovanieVratenia() {
  const { t } = useT();
  return (druh: DruhDokladuOdovzdania, row: any) =>
    t(textVarovaniaVratenia(druh, stavOdovzdania(row).cesta));
}

/**
 * Riadok histórie pod odznakom: kedy a ako doklad odišiel, či bol vrátený a
 * čo treba prepísať v Pohode po oprave zaúčtovania.
 */
export function HistoriaOdovzdania({
  row,
  druh,
  cisloVPohode,
  onZmena,
}: {
  row: any;
  druh: DruhDokladuOdovzdania;
  cisloVPohode?: string | null;
  onZmena: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const potvrd = useServerFn(potvrdOpravuVPohodeFn);
  const [busy, setBusy] = useState(false);
  const s = stavOdovzdania(row);
  if (s.druh === "nie") return null;
  const cesta = textCesty(s.cesta);
  const prvy = t("Prvýkrát odovzdané {kedy}", { kedy: kedy(s.prvy, loc) });
  const kolko = s.pocet > 1 ? ` · ${t("odovzdané {n}×", { n: s.pocet })}` : "";
  const cislo = cisloVPohode ?? row.pohoda_cislo ?? null;

  if (s.druh === "vratene")
    return (
      <div
        role="status"
        className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <div className="flex flex-wrap items-center gap-1.5 font-medium">
          <History className="h-3.5 w-3.5 shrink-0" />
          {t("Odovzdané, vrátené na opravu")}
          {s.vratene ? ` ${kedy(s.vratene, loc)}` : ""} — {t("treba znova odovzdať")}
        </div>
        <p className="mt-1">
          {prvy}
          {cesta ? ` ${t(cesta)}` : ""}
          {kolko}.{" "}
          {t(
            "V Pohode doklad ostal — Faktero ho tam nezmaže. Pred ďalším odovzdaním ho v Pohode zmažte, inak tam bude dvakrát.",
          )}
        </p>
      </div>
    );

  if (s.druh === "oprava_zauctovania") {
    const zmeny = zmenyOpravy(row.oprava_zauctovania_povodne, row);
    async function prepisane() {
      setBusy(true);
      try {
        await potvrd({ data: { druh, company_id: row.company_id, id: row.id } });
        toast.success(t("Zaúčtovanie je v zhode s Pohodou"));
        onZmena();
      } catch (e: any) {
        toast.error(t(e?.message ?? "Nepodarilo sa"));
      } finally {
        setBusy(false);
      }
    }
    return (
      <div
        role="status"
        className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <div className="flex flex-wrap items-center gap-1.5 font-medium">
          <PencilLine className="h-3.5 w-3.5 shrink-0" />
          {t("Zaúčtovanie opravené — prepíšte ho aj v Pohode")}
        </div>
        <p className="mt-1">
          {cislo
            ? t("Pohoda doklad z XML neprepíše. Otvorte v Pohode doklad {cislo} a zmeňte:", {
                cislo,
              })
            : t("Pohoda doklad z XML neprepíše. Otvorte ho v Pohode a zmeňte:")}
        </p>
        {zmeny.length ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {zmeny.map((z) => (
              <li key={z.pole} className="break-words">
                {t(NAZVY_POLI_OPRAVY[z.pole])}: <strong>{z.v_pohode ?? "—"}</strong> →{" "}
                <strong>{z.teraz ?? t("predvolené")}</strong>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={() => void prepisane()}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2 py-1 font-medium hover:bg-amber-100 disabled:opacity-50 dark:bg-transparent"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {t("Prepísané v Pohode")}
        </button>
      </div>
    );
  }

  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {prvy}
      {cesta ? ` ${t(cesta)}` : ""}
      {kolko}
      {s.druh === "odovzdane_znova" ? ` · ${t("po vrátení odovzdané znova")}` : ""}.
    </p>
  );
}

type Hodnoty = Record<PoleOpravy, string>;

/**
 * „Opraviť zaúčtovanie“ — okno so zaúčtovacími poľami odovzdaného dokladu.
 * Sumy, dátumy ani strany v ňom nie sú a server ich ani neprijme.
 */
export function OpravitZauctovanie({
  row,
  druh,
  onZmena,
  className,
}: {
  row: any;
  druh: DruhDokladuOdovzdania;
  onZmena: () => void;
  className?: string;
}) {
  const { t } = useT();
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const uloz = useServerFn(opravZauctovanieFn);
  const [otvorene, setOtvorene] = useState(false);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [h, setH] = useState<Hodnoty | null>(null);
  const [busy, setBusy] = useState(false);
  const zavri = () => !busy && setOtvorene(false);
  useZatvorNaEscape(otvorene ? zavri : null);

  if (!row?.exported_at || row?.locked_at) return null;

  function otvor() {
    const z = zauctovanieZRiadku(row);
    setH(Object.fromEntries(Object.entries(z).map(([k, v]) => [k, v ?? ""])) as Hodnoty);
    setOtvorene(true);
    if (!navrhy)
      nacitajNavrhy({
        data: {
          company_id: row.company_id,
          pre: druh === "faktura" ? "vystavena" : druh,
          ...(druh === "faktura" && row.type ? { typ: String(row.type) } : {}),
        },
      })
        .then(setNavrhy)
        .catch(() => {});
  }

  async function ulozit() {
    if (!h) return;
    setBusy(true);
    try {
      const r = await uloz({
        data: {
          druh,
          company_id: row.company_id,
          id: row.id,
          hodnoty: Object.fromEntries(
            Object.entries(h).map(([k, v]) => [k, v.trim() || null]),
          ) as any,
        },
      });
      toast.success(
        r.zmeny.length
          ? t("Zaúčtovanie opravené — prepíšte ho aj v Pohode")
          : t("Zaúčtovanie je rovnaké ako v Pohode"),
      );
      setOtvorene(false);
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const vstup =
    "mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
  const kv = druh === "faktura" ? KV_VYDANE : KV_PRIJATE;
  return (
    <>
      <button
        type="button"
        onClick={otvor}
        title={t(
          "Zmení len predkontáciu, členenie, stredisko, činnosť a účtovnú poznámku. Doklad ostane v Pohode, nič sa nemaže.",
        )}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
        }
      >
        <PencilLine className="h-3.5 w-3.5" /> {t("Opraviť zaúčtovanie")}
      </button>
      {otvorene && h ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={zavri}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Opraviť zaúčtovanie")}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-5 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">{t("Opraviť zaúčtovanie")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Doklad ostáva v Pohode a nič sa v nej nemaže. Sumy, dátumy ani odberateľ či dodávateľ sa tu nemenia. Pohoda doklad z XML neprepíše — opravené kódy potom prepíšte aj v Pohode; Faktero vám ukáže, ktoré.",
              )}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <label className="block sm:col-span-2">
                <span className="text-xs text-muted-foreground">{t("Predkontácia")}</span>
                <KodPohody
                  ariaLabel="Predkontácia"
                  value={h.pohoda_predkontacia}
                  onChange={(v) => setH({ ...h, pohoda_predkontacia: v })}
                  moznosti={navrhy?.predkontacie ?? []}
                  placeholder={navrhy?.predvolenaPredkontacia ?? "—"}
                  className={vstup}
                  vyber
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t("Členenie DPH")}</span>
                <KodPohody
                  ariaLabel="Členenie DPH"
                  value={h.pohoda_clenenie_dph}
                  onChange={(v) => setH({ ...h, pohoda_clenenie_dph: v })}
                  moznosti={navrhy?.clenenia ?? []}
                  placeholder={navrhy?.predvoleneClenenie ?? "—"}
                  className={vstup}
                  vyber
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t("Členenie KV DPH")}</span>
                <select
                  value={h.kv_clenenie}
                  onChange={(e) => setH({ ...h, kv_clenenie: e.target.value })}
                  className={vstup}
                >
                  <option value="">{t("automaticky")}</option>
                  {kv.map((k) => (
                    <option key={k.kod} value={k.kod}>
                      {t(k.nazov)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t("Stredisko")}</span>
                <KodPohody
                  value={h.stredisko}
                  onChange={(v) => setH({ ...h, stredisko: v })}
                  moznosti={navrhy?.strediska ?? []}
                  placeholder={navrhy?.predvoleneStredisko ?? "—"}
                  className={vstup}
                  vyber
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t("Činnosť")}</span>
                <KodPohody
                  value={h.cinnost}
                  onChange={(v) => setH({ ...h, cinnost: v })}
                  moznosti={navrhy?.cinnosti ?? []}
                  placeholder="—"
                  className={vstup}
                  vyber
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-muted-foreground">{t("Účtovná poznámka")}</span>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={h.int_poznamka}
                  onChange={(e) => setH({ ...h, int_poznamka: e.target.value })}
                  className="mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={zavri}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                {t("Zrušiť")}
              </button>
              <button
                type="button"
                onClick={() => void ulozit()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("Uložiť opravu")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
