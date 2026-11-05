import { Plus, Trash2 } from "lucide-react";
import { KodPohody } from "./KodPohody";
import {
  BunkaPolozky,
  PodriadokPolozky,
  POLE_POLOZKY,
  PolozkyHlavicka,
  PolozkyKontajner,
  RiadokPolozky,
  VYBER_POLOZKY,
} from "./PolozkyResponzivne";
import type { Navrhy } from "./ZauctovaniePanel";
import { KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import {
  VYROVNAVACIA_POLOZKA,
  rozdielPoloziek,
  vyrovnajPolozky,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { useT } from "@/lib/i18n/useT";
import { zoradSadzby } from "@/lib/faktero/vat-rates";

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
        <PolozkyKontajner
          stlpce="minmax(0,1fr) 4.5rem 5.5rem 7rem 2.5rem 2rem"
          className={vypnute ? "pointer-events-none opacity-50" : undefined}
        >
          <PolozkyHlavicka
            stlpce={[
              { text: t("Názov") },
              { text: t("Počet"), vpravo: true },
              { text: t("DPH") },
              { text: t("Suma"), vpravo: true },
              { text: t("PDP"), stred: true, title: t("Prenesenie daňovej povinnosti") },
              { text: t("Akcie"), skryty: true },
            ]}
          />
          {u.polozky.map((p, i) => (
            <RiadokPolozky key={i}>
              <BunkaPolozky popis={t("Názov")} uzky={10} poradie={1}>
                <input
                  aria-label={t("Názov položky {n}", { n: i + 1 })}
                  value={p.name}
                  onChange={(e) => zmen(i, { name: e.target.value })}
                  className={POLE_POLOZKY}
                />
              </BunkaPolozky>
              <BunkaPolozky popis={t("Počet")} uzky={2} poradie={3}>
                <input
                  aria-label={t("Počet položky {n}", { n: i + 1 })}
                  inputMode="decimal"
                  value={p.quantity ?? ""}
                  onChange={(e) => zmen(i, { quantity: cislo(e.target.value) })}
                  className={`${POLE_POLOZKY} text-right tabular-nums`}
                />
              </BunkaPolozky>
              <BunkaPolozky popis={t("DPH")} uzky={4} poradie={4}>
                <select
                  aria-label={t("Sadzba DPH položky {n}", { n: i + 1 })}
                  value={String(p.vat_rate ?? "")}
                  onChange={(e) =>
                    zmen(i, { vat_rate: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className={VYBER_POLOZKY}
                >
                  <option value="">—</option>
                  {zoradSadzby([
                    ...new Set([...sadzby, ...(p.vat_rate != null ? [Number(p.vat_rate)] : [])]),
                  ]).map((s) => (
                    <option key={s} value={s}>
                      {s} %
                    </option>
                  ))}
                </select>
              </BunkaPolozky>
              <BunkaPolozky popis={t("Suma")} uzky={4} poradie={5}>
                <input
                  aria-label={t("Suma položky {n}", { n: i + 1 })}
                  inputMode="decimal"
                  value={p.total ?? ""}
                  onChange={(e) => zmen(i, { total: cislo(e.target.value) })}
                  className={`${POLE_POLOZKY} text-right tabular-nums`}
                />
              </BunkaPolozky>
              <BunkaPolozky popis={t("PDP")} uzky={2} poradie={6} stred>
                <input
                  type="checkbox"
                  className="my-2"
                  aria-label={t("Položka {n} v prenesení daňovej povinnosti", { n: i + 1 })}
                  checked={pdpCela || Boolean(p.pdp)}
                  disabled={pdpCela}
                  onChange={(e) => zmen(i, { pdp: e.target.checked || undefined })}
                />
              </BunkaPolozky>
              <BunkaPolozky uzky={2} poradie={2} vpravo>
                <button
                  type="button"
                  aria-label={t("Odstrániť položku {n}", { n: i + 1 })}
                  onClick={() => setU({ ...u, polozky: u.polozky.filter((_, j) => j !== i) })}
                  className="rounded p-2 text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </BunkaPolozky>
              {sKodmi ? (
                <PodriadokPolozky poradie={7}>
                  <BunkaPolozky ako="label" popis={t("Predkontácia")} vzdyPopis uzky={6} siroky={4}>
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
                  </BunkaPolozky>
                  <BunkaPolozky ako="label" popis={t("Členenie DPH")} vzdyPopis uzky={6} siroky={4}>
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
                  </BunkaPolozky>
                  <BunkaPolozky ako="label" popis={t("Členenie KV")} vzdyPopis uzky={12} siroky={4}>
                    <select
                      aria-label={t("Členenie KV položky {n}", { n: i + 1 })}
                      value={p.kv ?? ""}
                      onChange={(e) => zmen(i, { kv: e.target.value || null })}
                      className={`${vstupKodu} truncate`}
                    >
                      <option value="">
                        {zdedena.kv
                          ? t("ako doklad ({kod})", { kod: zdedena.kv })
                          : t("ako doklad")}
                      </option>
                      {KV_PRIJATE.map((k) => (
                        <option key={k.kod} value={k.kod}>
                          {t(k.nazov)}
                        </option>
                      ))}
                    </select>
                  </BunkaPolozky>
                  {!p.predkontacia && !p.clenenie && (zdedena.predkontacia || zdedena.clenenie) ? (
                    <span className="col-span-12 min-w-0 break-words text-[11px] text-muted-foreground">
                      {t("Zdedí z dokladu: {kody}", {
                        kody: [zdedena.predkontacia, zdedena.clenenie].filter(Boolean).join(" / "),
                      })}
                    </span>
                  ) : null}
                  {p.predkontacia && navrhy?.pomerove?.includes(p.predkontacia) ? (
                    <span className="col-span-12 text-[11px] text-primary">
                      {t("rozúčtuje sa pomerom")}
                    </span>
                  ) : null}
                </PodriadokPolozky>
              ) : null}
            </RiadokPolozky>
          ))}
        </PolozkyKontajner>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("Doklad nemá položky — do účtovníctva pôjde súhrn podľa sadzieb.")}
        </p>
      )}

      {nesuhlas ? (
        <div
          role="alert"
          className="dk-chyba flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs"
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
            className="rounded-md border border-input bg-card px-2 py-1 font-semibold text-foreground hover:bg-secondary"
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
        <label className="inline-flex min-w-0 items-center gap-2 text-xs">
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
