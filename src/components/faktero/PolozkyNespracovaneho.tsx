import { Fragment } from "react";
import { Plus, Trash2 } from "lucide-react";
import { KodPohody } from "./KodPohody";
import type { Navrhy } from "./ZauctovaniePanel";
import { KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import {
  VYROVNAVACIA_POLOZKA,
  rozdielPoloziek,
  vyrovnajPolozky,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { useT } from "@/lib/i18n/useT";

type Polozka = UdajeNespracovaneho["polozky"][number];

const cislo = (v: string) => {
  const n = Number(v.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Položky nespracovaného dokladu: sadzba DPH a prenesenie daňovej
 * povinnosti pri každej položke. Keď súčet položiek nesedí so sumou dokladu,
 * ukáže rozdiel a ponúkne vyrovnávaciu položku — inak by do účtovníctva
 * odišli položky, ktoré sa so súčtom nezhodujú.
 *
 * Pod každou položkou je jej zaúčtovanie: predkontácia (účtovná položka),
 * členenie DPH a členenie KV. Prázdne pole = kód dokladu (hlavičky); s
 * položkami sa prenesie do vytvorenej faktúry či bločku.
 */
export function PolozkyNespracovaneho({
  u,
  setU,
  sadzby,
  navrhy,
}: {
  u: UdajeNespracovaneho;
  setU: (u: UdajeNespracovaneho) => void;
  sadzby: number[];
  /** Číselník kódov firmy — bez neho sa zaúčtovanie položiek neukáže. */
  navrhy?: Navrhy | null;
}) {
  const { t } = useT();
  const nesuhlas = rozdielPoloziek(u);
  const vypnute = Boolean(u.polozkyVypnute);
  const zmen = (i: number, z: Partial<Polozka>) =>
    setU({ ...u, polozky: u.polozky.map((p, j) => (j === i ? { ...p, ...z } : p)) });
  const pdpCela = Boolean(u.prenesenie);
  const sKodmi = navrhy !== undefined;
  // Čo položka zdedí, keď kód nechá prázdny: kód dokladu, inak predvolený firmy.
  const zdedena = {
    predkontacia: u.kody.predkontacia.trim() || navrhy?.predvolenaPredkontacia || "",
    clenenie: u.kody.clenenie.trim() || navrhy?.predvoleneClenenie || "",
    kv: u.kody.kv.trim(),
  };
  const vstupKodu = "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs";

  return (
    <div className="space-y-2">
      {u.polozky.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {vypnute
              ? t("Položky sú vypnuté — doklad sa zaúčtuje len podľa súčtov a rozpisu DPH.")
              : t("Položky zle vyčítané? Vypnite ich a doklad pôjde podľa súčtov.")}
          </span>
          <button
            type="button"
            onClick={() => setU({ ...u, polozkyVypnute: !vypnute })}
            className="rounded-md border border-border px-2.5 py-1 hover:bg-secondary"
          >
            {vypnute ? t("Zapnúť položky") : t("Vypnúť položky")}
          </button>
        </div>
      )}
      {u.polozky.length ? (
        // `relative`: opora pre sr-only popis stĺpca, inak roztiahol stránku (styles.css).
        <div className={`relative overflow-x-auto ${vypnute ? "pointer-events-none opacity-50" : ""}`}>
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-normal">{t("Názov")}</th>
                <th className="w-16 py-1 pr-2 text-right font-normal">{t("Počet")}</th>
                <th className="w-20 py-1 pr-2 font-normal">{t("DPH")}</th>
                <th className="w-24 py-1 pr-2 text-right font-normal">{t("Suma")}</th>
                <th
                  className="w-12 py-1 pr-2 text-center font-normal"
                  title={t("Prenesenie daňovej povinnosti")}
                >
                  {t("PDP")}
                </th>
                <th className="w-8"><span className="sr-only">{t("Akcie")}</span></th>
              </tr>
            </thead>
            <tbody>
              {u.polozky.map((p, i) => (
                <Fragment key={i}>
                <tr className="border-t border-border">
                  <td className="py-1 pr-2">
                    <input
                      aria-label={t("Názov položky {n}", { n: i + 1 })}
                      value={p.name}
                      onChange={(e) => zmen(i, { name: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={t("Počet položky {n}", { n: i + 1 })}
                      inputMode="decimal"
                      value={p.quantity ?? ""}
                      onChange={(e) => zmen(i, { quantity: cislo(e.target.value) })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      aria-label={t("Sadzba DPH položky {n}", { n: i + 1 })}
                      value={String(p.vat_rate ?? "")}
                      onChange={(e) =>
                        zmen(i, { vat_rate: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      className="w-full rounded-md border border-input bg-background px-1 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {[
                        ...new Set([
                          ...sadzby,
                          ...(p.vat_rate != null ? [Number(p.vat_rate)] : []),
                        ]),
                      ].map((s) => (
                        <option key={s} value={s}>
                          {s} %
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={t("Suma položky {n}", { n: i + 1 })}
                      inputMode="decimal"
                      value={p.total ?? ""}
                      onChange={(e) => zmen(i, { total: cislo(e.target.value) })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="py-1 pr-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={t("Položka {n} v prenesení daňovej povinnosti", { n: i + 1 })}
                      checked={pdpCela || Boolean(p.pdp)}
                      disabled={pdpCela}
                      onChange={(e) => zmen(i, { pdp: e.target.checked || undefined })}
                    />
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      aria-label={t("Odstrániť položku {n}", { n: i + 1 })}
                      onClick={() => setU({ ...u, polozky: u.polozky.filter((_, j) => j !== i) })}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
                {sKodmi ? (
                  <tr>
                    <td colSpan={6} className="pb-2 pr-2">
                      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="block min-w-0">
                          <span className="text-[11px] text-muted-foreground">{t("Predkontácia")}</span>
                          <KodPohody
                            ariaLabel={t("Predkontácia položky {n}", { n: i + 1 })}
                            value={p.predkontacia ?? ""}
                            onChange={(v) => zmen(i, { predkontacia: v.trim() || null })}
                            moznosti={navrhy?.predkontacie ?? []}
                            vyber
                            bezPopisu
                            placeholder="ako doklad"
                            className={vstupKodu}
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="text-[11px] text-muted-foreground">{t("Členenie DPH")}</span>
                          <KodPohody
                            ariaLabel={t("Členenie DPH položky {n}", { n: i + 1 })}
                            value={p.clenenie ?? ""}
                            onChange={(v) => zmen(i, { clenenie: v.trim() || null })}
                            moznosti={navrhy?.clenenia ?? []}
                            vyber
                            bezPopisu
                            placeholder="ako doklad"
                            className={vstupKodu}
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="text-[11px] text-muted-foreground">{t("Členenie KV")}</span>
                          <select
                            aria-label={t("Členenie KV položky {n}", { n: i + 1 })}
                            value={p.kv ?? ""}
                            onChange={(e) => zmen(i, { kv: e.target.value || null })}
                            className={vstupKodu}
                          >
                            <option value="">
                              {zdedena.kv ? t("ako doklad ({kod})", { kod: zdedena.kv }) : t("ako doklad")}
                            </option>
                            {KV_PRIJATE.map((k) => (
                              <option key={k.kod} value={k.kod}>
                                {t(k.nazov)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {!p.predkontacia && !p.clenenie && (zdedena.predkontacia || zdedena.clenenie) ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {t("Zdedí z dokladu: {kody}", {
                            kody: [zdedena.predkontacia, zdedena.clenenie].filter(Boolean).join(" / "),
                          })}
                        </span>
                      ) : null}
                      {p.predkontacia && navrhy?.pomerove?.includes(p.predkontacia) ? (
                        <span className="mt-0.5 block text-[11px] text-primary">{t("rozúčtuje sa pomerom")}</span>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("Doklad nemá položky — do účtovníctva pôjde súhrn podľa sadzieb.")}
        </p>
      )}

      {nesuhlas ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          <span>
            {t(
              nesuhlas.netto
                ? "Súčet položiek {sucet} nesedí so sumou dokladu bez DPH — rozdiel {rozdiel} {mena}."
                : "Súčet položiek {sucet} nesedí so sumou dokladu — rozdiel {rozdiel} {mena}.",
              {
                sucet: nesuhlas.sucet.toFixed(2),
                rozdiel: `${nesuhlas.rozdiel > 0 ? "+" : ""}${nesuhlas.rozdiel.toFixed(2)}`,
                mena: u.mena,
              },
            )}
          </span>
          <button
            type="button"
            onClick={() => setU(vyrovnajPolozky(u))}
            className="rounded-md border border-red-300 bg-white px-2 py-1 font-medium hover:bg-red-100 dark:bg-transparent"
          >
            {t("Pridať vyrovnávaciu položku")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            setU({
              ...u,
              polozky: [
                ...u.polozky.filter((x) => x.name !== VYROVNAVACIA_POLOZKA),
                {
                  name: "",
                  quantity: 1,
                  unit: null,
                  unit_price: null,
                  vat_rate: sadzby[0] ?? null,
                  total: null,
                },
                ...u.polozky.filter((x) => x.name === VYROVNAVACIA_POLOZKA),
              ],
            })
          }
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> {t("Pridať položku")}
        </button>
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={pdpCela}
            onChange={(e) => setU({ ...u, prenesenie: e.target.checked || undefined })}
          />
          {t("Celá faktúra v prenesení daňovej povinnosti")}
        </label>
      </div>
    </div>
  );
}
