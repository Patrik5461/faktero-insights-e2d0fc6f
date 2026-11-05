import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, ScanText, X } from "lucide-react";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { triedaStavu, type TonStavu } from "@/components/faktero/web/Stav";
import {
  rozpoznajCiselnikZObrazkaFn,
  ulozCiselnikZObrazkaFn,
} from "@/lib/faktero/ciselnik-obrazok.functions";
import {
  DRUHY_Z_OBRAZKA,
  NAZOV_STAVU,
  NAZVY_DRUHOV_Z_OBRAZKA,
  nahlad,
  normalizujRiadky,
  spojRiadky,
  type DruhZObrazka,
  type ExistujuciZaznam,
  type RiadokNahladu,
  type StavRiadku,
} from "@/lib/faktero/ciselnik-obrazok";

/*
  Okno „Importovať z obrázka“ (Predkontácie → číselník): screenshot tabuľky
  z Pohody → AI prečíta riadky → náhľad so stavom oproti číselníku firmy →
  uloženie vybraných. Kód z Pohody či ručne zadaný je predvolene neodškrtnutý
  a prepíše sa len na výslovné zaškrtnutie.
*/

type Obrazok = { id: string; nazov: string; mime: string; base64: string; nahlad: string };

const MAX_MB = 8;
const MIME = ["image/png", "image/jpeg", "image/webp"];

const TON: Record<StavRiadku, TonStavu> = {
  novy: "uspech",
  zmena: "pozor",
  existuje_pohoda: "informacia",
  existuje_rucne: "informacia",
  bez_zmeny: "neutralny",
};

const vstup = "w-full min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm";

/**
 * Malý screenshot (typicky okno Pohody pri 100 %) sa pred odoslaním zväčší
 * na dvojnásobok — AI potom spoľahlivejšie číta diakritiku drobného písma.
 * Overené naostro: 1× 18/19 textov presne, 2× 19/19.
 */
async function zvacsiMaly(o: Obrazok): Promise<Obrazok> {
  try {
    const img = await new Promise<HTMLImageElement>((ok, chyba) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = chyba;
      i.src = o.nahlad;
    });
    if (!img.naturalWidth || img.naturalWidth >= 1400) return o;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth * 2;
    c.height = img.naturalHeight * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return o;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/png");
    const base64 = url.slice(url.indexOf(",") + 1);
    if (base64.length > MAX_MB * 1024 * 1024 * 1.37) return o;
    return { ...o, mime: "image/png", base64 };
  } catch {
    return o;
  }
}

function citajSubor(f: File): Promise<Obrazok> {
  return new Promise((ok, chyba) => {
    const r = new FileReader();
    r.onerror = () => chyba(r.error);
    r.onload = () => {
      const url = String(r.result ?? "");
      ok({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nazov: f.name || "obrázok",
        mime: f.type,
        base64: url.slice(url.indexOf(",") + 1),
        nahlad: url,
      });
    };
    r.readAsDataURL(f);
  });
}

export function ImportZObrazkaOkno({
  companyId,
  existujuce,
  predvolenyDruh,
  onClose,
  onUlozene,
}: {
  companyId: string;
  /** Číselník firmy (všetky druhy) — stav riadkov sa počíta z neho. */
  existujuce: ExistujuciZaznam[];
  /** Otvorená záložka číselníka, ak je medzi druhmi z obrázka. */
  predvolenyDruh?: string;
  onClose: () => void;
  /** Po uložení — s druhom, do ktorého sa ukladalo (záložka číselníka sa prepne naň). */
  onUlozene: (druh: DruhZObrazka) => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const rozpoznaj = useServerFn(rozpoznajCiselnikZObrazkaFn);
  const uloz = useServerFn(ulozCiselnikZObrazkaFn);
  const subor = useRef<HTMLInputElement>(null);
  const [druhVolba, setDruhVolba] = useState<DruhZObrazka | "auto">(
    (DRUHY_Z_OBRAZKA as readonly string[]).includes(predvolenyDruh ?? "") ? (predvolenyDruh as DruhZObrazka) : "auto",
  );
  const [obrazky, setObrazky] = useState<Obrazok[]>([]);
  const [druh, setDruh] = useState<DruhZObrazka | null>(null);
  const [riadky, setRiadky] = useState<RiadokNahladu[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [vynechanych, setVynechanych] = useState(0);

  const pridajSubory = useCallback(
    async (subory: File[]) => {
      const dobre = subory.filter((f) => MIME.includes(f.type));
      if (subory.length && !dobre.length) {
        toast.error(t("Nahrajte obrázok PNG, JPG alebo WebP."));
        return;
      }
      const velke = dobre.filter((f) => f.size > MAX_MB * 1024 * 1024);
      if (velke.length) toast.error(t("Obrázok je väčší ako {n} MB.", { n: MAX_MB }));
      const nove = await Promise.all(dobre.filter((f) => f.size <= MAX_MB * 1024 * 1024).map(citajSubor));
      if (nove.length) setObrazky((o) => [...o, ...nove].slice(0, 10));
    },
    [t],
  );

  // Ctrl+V: obrázok zo schránky (screenshot) sa pridá rovno.
  useEffect(() => {
    const naVlozenie = (e: ClipboardEvent) => {
      const subory = [...(e.clipboardData?.items ?? [])]
        .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (!subory.length) return;
      e.preventDefault();
      void pridajSubory(subory);
    };
    window.addEventListener("paste", naVlozenie);
    return () => window.removeEventListener("paste", naVlozenie);
  }, [pridajSubory]);

  async function rozpoznat() {
    if (!obrazky.length) return;
    setBusy("rozpoznat");
    try {
      const vysledky: { druh: DruhZObrazka; riadky: RiadokNahladu[] }[] = [];
      let vyn = 0;
      for (let i = 0; i < obrazky.length; i++) {
        setBusy(`rozpoznat:${i + 1}`);
        const o = await zvacsiMaly(obrazky[i]);
        const r = await rozpoznaj({
          data: { company_id: companyId, druh: druhVolba, mime: o.mime as any, base64: o.base64 },
        });
        vysledky.push({ druh: r.druh as DruhZObrazka, riadky: r.riadky as RiadokNahladu[] });
        vyn += r.vynechanych;
      }
      // Pri „automaticky“ rozhodne druh, ktorý vyšiel na väčšine obrázkov.
      const pocty = new Map<DruhZObrazka, number>();
      for (const v of vysledky) pocty.set(v.druh, (pocty.get(v.druh) ?? 0) + v.riadky.length);
      const vysledny =
        druhVolba !== "auto" ? druhVolba : [...pocty.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "clenenie_dph";
      setDruh(vysledny);
      setRiadky(nahlad(spojRiadky(...vysledky.map((v) => v.riadky)), vysledny, existujuce));
      setVynechanych(vyn);
    } catch (e: any) {
      toast.error(e?.message ?? t("Obrázok sa nepodarilo prečítať."));
    } finally {
      setBusy(null);
    }
  }

  /** Úprava riadku v náhľade — stav sa prepočíta, zaškrtnutie sa vráti na predvolené pri zmene stavu. */
  function upravRiadok(i: number, zmena: Partial<RiadokNahladu>) {
    if (!riadky || !druh) return;
    setRiadky(
      riadky.map((r, j) => {
        if (j !== i) return r;
        const [n] = normalizujRiadky([{ ...r, ...zmena }], druh);
        if (!n) return { ...r, ...zmena };
        const [novy] = nahlad([n], druh, existujuce);
        return novy.stav === r.stav && novy.podozrivy === r.podozrivy ? { ...novy, vybrany: r.vybrany } : novy;
      }),
    );
  }

  function zmenDruh(d: DruhZObrazka) {
    if (!riadky) return;
    setDruh(d);
    setRiadky(nahlad(normalizujRiadky(riadky, d), d, existujuce));
  }

  const vybrane = useMemo(() => (riadky ?? []).filter((r) => r.vybrany), [riadky]);
  const pocetStavov = useMemo(() => {
    const m = new Map<StavRiadku, number>();
    for (const r of riadky ?? []) m.set(r.stav, (m.get(r.stav) ?? 0) + 1);
    return m;
  }, [riadky]);
  const chranene = (s: StavRiadku) => s === "existuje_pohoda" || s === "existuje_rucne";
  const podozrive = (riadky ?? []).filter((r) => r.podozrivy).length;

  async function ulozit() {
    if (!druh || !vybrane.length) return;
    setBusy("ulozit");
    try {
      const r = await uloz({
        data: {
          company_id: companyId,
          druh,
          riadky: vybrane.map((x) => ({
            kod: x.kod,
            popis: x.popis,
            kategoria: x.kategoria,
            ucet_md: x.ucet_md,
            ucet_d: x.ucet_d,
            typ_dokladu: x.typ_dokladu,
            prepisat: chranene(x.stav),
          })),
        },
      });
      toast.success(
        t("Uložené: {n} nových, {z} zmenených", { n: r.novych, z: r.zmenenych }) +
          (r.preskocenych ? t(" · {p} bez zmeny alebo preskočených", { p: r.preskocenych }) : ""),
      );
      onUlozene(druh);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť"));
    } finally {
      setBusy(null);
    }
  }

  const predkontacie = druh === "predkontacia";
  const kv = druh === "kv_clenenie";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-2 backdrop-blur-[2px] sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Importovať z obrázka")}
        data-import-z-obrazka=""
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{t("Importovať z obrázka")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Screenshot tabuľky z Pohody (napr. Členenie KV DPH, ktoré Pohoda nevie vyexportovať). AI prečíta len riadky tabuľky; pred uložením všetko skontrolujete.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Zavrieť")}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {riadky === null ? (
            <div className="space-y-4">
              <label className="block max-w-sm text-sm">
                <span className="text-xs font-medium text-muted-foreground">{t("Druh číselníka")}</span>
                <select
                  value={druhVolba}
                  onChange={(e) => setDruhVolba(e.target.value as DruhZObrazka | "auto")}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="auto">{t("Rozpoznať automaticky")}</option>
                  {DRUHY_Z_OBRAZKA.map((d) => (
                    <option key={d} value={d}>
                      {t(NAZVY_DRUHOV_Z_OBRAZKA[d])}
                    </option>
                  ))}
                </select>
              </label>

              <div
                data-zona-obrazkov=""
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void pridajSubory([...e.dataTransfer.files]);
                }}
                className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center sm:p-6"
              >
                <ImagePlus className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm">
                  {t("Pretiahnite sem obrázky, vložte screenshot klávesmi Ctrl+V, alebo")}{" "}
                  <button
                    type="button"
                    onClick={() => subor.current?.click()}
                    className="font-semibold text-primary underline"
                  >
                    {t("vyberte súbory")}
                  </button>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("PNG alebo JPG, najviac {n} MB na obrázok. Dlhý číselník nafoťte na viac obrázkov.", { n: MAX_MB })}
                </p>
                <input
                  ref={subor}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  data-vstup-obrazkov=""
                  onChange={(e) => {
                    void pridajSubory([...(e.target.files ?? [])]);
                    e.target.value = "";
                  }}
                />
              </div>

              {obrazky.length > 0 && (
                <ul className="flex flex-wrap gap-3">
                  {obrazky.map((o) => (
                    <li key={o.id} className="relative w-36 overflow-hidden rounded-lg border border-border bg-card">
                      <img src={o.nahlad} alt={o.nazov} className="h-24 w-full object-cover object-top" />
                      <div className="truncate px-2 py-1 text-xs text-muted-foreground" title={o.nazov}>
                        {o.nazov}
                      </div>
                      <button
                        type="button"
                        onClick={() => setObrazky((x) => x.filter((y) => y.id !== o.id))}
                        aria-label={t("Odobrať obrázok {n}", { n: o.nazov })}
                        className="absolute right-1 top-1 rounded-full bg-popover/90 p-0.5 text-muted-foreground shadow hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="block text-sm">
                  <span className="text-xs font-medium text-muted-foreground">{t("Uložiť ako")}</span>
                  <select
                    value={druh ?? "clenenie_dph"}
                    onChange={(e) => zmenDruh(e.target.value as DruhZObrazka)}
                    className="mt-1 block rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    {DRUHY_Z_OBRAZKA.map((d) => (
                      <option key={d} value={d}>
                        {t(NAZVY_DRUHOV_Z_OBRAZKA[d])}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-1.5 text-xs" data-suhrn-stavov="">
                  <span className="text-muted-foreground">
                    {t("Rozpoznaných riadkov: {n}", { n: riadky.length })}
                  </span>
                  {(Object.keys(NAZOV_STAVU) as StavRiadku[])
                    .filter((s) => pocetStavov.get(s))
                    .map((s) => (
                      <span key={s} className={triedaStavu(TON[s], true)}>
                        {t(NAZOV_STAVU[s])}: {pocetStavov.get(s)}
                      </span>
                    ))}
                  {podozrive > 0 && (
                    <span className={triedaStavu("chyba", true)}>
                      {t("Podozrivé: {n}", { n: podozrive })}
                    </span>
                  )}
                </div>
              </div>
              {vynechanych > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("{n} riadkov AI vrátila bez kódu — vynechané.", { n: vynechanych })}
                </p>
              )}
              {riadky.some((r) => chranene(r.stav)) && (
                <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  {t(
                    "Kódy, ktoré už prišli z Pohody alebo boli zadané ručne, sa neprepíšu. Ak ich chcete prepísať údajmi z obrázka, zaškrtnite ich jednotlivo.",
                  )}
                </p>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm" data-nahlad-riadkov="">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={t("Vybrať všetky nové a zmenené")}
                          checked={
                            riadky.some((r) => (r.stav === "novy" || r.stav === "zmena") && !r.podozrivy) &&
                            riadky.every((r) => r.vybrany || !(r.stav === "novy" || r.stav === "zmena") || r.podozrivy)
                          }
                          onChange={(e) =>
                            setRiadky(
                              riadky.map((r) =>
                                (r.stav === "novy" || r.stav === "zmena") && !r.podozrivy
                                  ? { ...r, vybrany: e.target.checked }
                                  : r,
                              ),
                            )
                          }
                        />
                      </th>
                      <th className="px-2 py-2 font-semibold">{t("Stav")}</th>
                      <th className="px-2 py-2 font-semibold">{t("Kód")}</th>
                      <th className="px-2 py-2 font-semibold">{t("Popis")}</th>
                      <th className="px-2 py-2 font-semibold">{kv ? t("Typ") : t("Kategória")}</th>
                      {predkontacie && <th className="px-2 py-2 font-semibold">MD</th>}
                      {predkontacie && <th className="px-2 py-2 font-semibold">D</th>}
                      {!predkontacie && <th className="px-2 py-2 font-semibold">{t("Doklady")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {riadky.map((r, i) => (
                      <tr
                        key={i}
                        data-riadok-kod={r.kod}
                        data-stav={r.stav}
                        className={`border-t border-border align-top ${r.vybrany ? "" : "opacity-70"}`}
                      >
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            aria-label={t("Uložiť {kod}", { kod: r.kod })}
                            checked={r.vybrany}
                            onChange={(e) =>
                              setRiadky(riadky.map((x, j) => (j === i ? { ...x, vybrany: e.target.checked } : x)))
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <span className={triedaStavu(TON[r.stav], true)}>{t(NAZOV_STAVU[r.stav])}</span>
                          {chranene(r.stav) && r.vybrany && (
                            <div className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("prepíše sa")}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={r.kod}
                            aria-label={t("Kód riadku {n}", { n: i + 1 })}
                            onChange={(e) => upravRiadok(i, { kod: e.target.value })}
                            className={`${vstup} w-28 font-mono ${r.podozrivy ? "border-destructive" : ""}`}
                          />
                          {r.podozrivy && r.dovod && (
                            <div className="mt-0.5 max-w-[14rem] text-[11px] text-destructive">{t(r.dovod)}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={r.popis ?? ""}
                            aria-label={t("Popis riadku {n}", { n: i + 1 })}
                            onChange={(e) => upravRiadok(i, { popis: e.target.value || null })}
                            className={vstup}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={r.kategoria ?? ""}
                            aria-label={t("Typ riadku {n}", { n: i + 1 })}
                            onChange={(e) => upravRiadok(i, { kategoria: e.target.value || null })}
                            className={vstup}
                          />
                        </td>
                        {predkontacie && (
                          <td className="px-2 py-1.5">
                            <input
                              value={r.ucet_md ?? ""}
                              aria-label={t("MD riadku {n}", { n: i + 1 })}
                              onChange={(e) => upravRiadok(i, { ucet_md: e.target.value || null })}
                              className={`${vstup} w-20`}
                            />
                          </td>
                        )}
                        {predkontacie && (
                          <td className="px-2 py-1.5">
                            <input
                              value={r.ucet_d ?? ""}
                              aria-label={t("D riadku {n}", { n: i + 1 })}
                              onChange={(e) => upravRiadok(i, { ucet_d: e.target.value || null })}
                              className={`${vstup} w-20`}
                            />
                          </td>
                        )}
                        {!predkontacie && (
                          <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                            {kv ? (
                              t(r.typ_dokladu === "vydane" ? "vydané" : r.typ_dokladu === "prijate" ? "prijaté" : "všetky")
                            ) : (
                              <select
                                value={r.typ_dokladu ?? ""}
                                aria-label={t("Doklady riadku {n}", { n: i + 1 })}
                                onChange={(e) => upravRiadok(i, { typ_dokladu: e.target.value || null })}
                                className="rounded-md border border-input bg-background px-1.5 py-1 text-xs"
                              >
                                <option value="">{t("všetky")}</option>
                                <option value="vydane">{t("vydané")}</option>
                                <option value="prijate">{t("prijaté")}</option>
                              </select>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-3 sm:p-4">
          {riadky !== null && (
            <button
              type="button"
              onClick={() => {
                setRiadky(null);
                setDruh(null);
              }}
              disabled={!!busy}
              className="mr-auto rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {t("Späť na obrázky")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          {riadky === null ? (
            <button
              type="button"
              onClick={rozpoznat}
              disabled={!obrazky.length || !!busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {busy?.startsWith("rozpoznat") ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanText className="h-4 w-4" />
              )}
              {busy?.startsWith("rozpoznat:") && obrazky.length > 1
                ? t("Čítam obrázok {i} z {n}…", { i: busy.split(":")[1], n: obrazky.length })
                : t("Rozpoznať")}
            </button>
          ) : (
            <button
              type="button"
              onClick={ulozit}
              disabled={!vybrane.length || !!busy}
              data-ulozit-z-obrazka=""
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {busy === "ulozit" && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Uložiť vybrané ({n})", { n: vybrane.length })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
