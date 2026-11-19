import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileCode2, Loader2, X } from "lucide-react";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { triedaStavu, type TonStavu } from "@/components/faktero/web/Stav";
import { ulozCiselnikZXmlFn } from "@/lib/faktero/predkontacie.functions";
import { DRUHY_CISELNIKA, nazovAgendy, ziadostCiselnikov, type DruhCiselnika } from "@/lib/faktero/predkontacie";
import {
  dekodujXml,
  nahladXml,
  poctyPodlaDruhu,
  prepocitajNahladXml,
  rozoberXmlCiselnikov,
  type ExistujuciXml,
  type PoleZmenyXml,
  type RiadokXml,
  type StavXml,
} from "@/lib/faktero/ciselnik-xml";

/*
  Okno „Nahrať XML z Pohody“ (Predkontácie → číselník): odpoveď Pohody na
  žiadosť o číselníky → náhľad so stavom oproti číselníku firmy → uloženie
  vybraných so zdrojom 'pohoda'. Nič sa nemaže ani nevypína; existujúci kód
  sa len doplní (popis, účty).
*/

const MAX_MB = 10;

const NAZOV_STAVU: Record<StavXml, string> = { novy: "Nový", zmena: "Zmena", bez_zmeny: "Bez zmeny" };
const TON: Record<StavXml, TonStavu> = { novy: "uspech", zmena: "pozor", bez_zmeny: "neutralny" };
const NAZOV_POLA: Record<PoleZmenyXml, string> = { popis: "popis", ucet_md: "MD", ucet_d: "D", aktivne: "zapne sa" };
const nazovDruhu = (d: DruhCiselnika) => DRUHY_CISELNIKA.find((x) => x.kod === d)?.nazov ?? d;

export function ImportZXmlOkno({
  companyId,
  ico,
  existujuce,
  subor: prvySubor,
  onClose,
  onUlozene,
}: {
  companyId: string;
  /** IČO firmy do žiadosti pre Pohodu. */
  ico?: string | null;
  /** Číselník firmy (všetky druhy) — stav riadkov sa počíta z neho. */
  existujuce: ExistujuciXml[];
  /** Súbor vybraný už mimo okna (karta „Nahrať súbor“). */
  subor?: File | null;
  onClose: () => void;
  onUlozene: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const uloz = useServerFn(ulozCiselnikZXmlFn);
  const vstupSuboru = useRef<HTMLInputElement>(null);
  const [nazov, setNazov] = useState<string | null>(null);
  const [riadky, setRiadky] = useState<RiadokXml[] | null>(null);
  const [upozornenia, setUpozornenia] = useState<string[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [aktivneVsetky, setAktivneVsetky] = useState(false);
  const [filter, setFilter] = useState<DruhCiselnika | "">("");
  const [busy, setBusy] = useState<string | null>(null);

  const nacitajSubor = useCallback(
    async (f: File) => {
      setChyba(null);
      if (f.size > MAX_MB * 1024 * 1024) {
        setChyba(t("Súbor je väčší ako {n} MB.", { n: MAX_MB }));
        return;
      }
      setBusy("citam");
      try {
        const xml = dekodujXml(new Uint8Array(await f.arrayBuffer()));
        const r = rozoberXmlCiselnikov(xml);
        if (r.chyba) {
          setChyba(t(r.chyba));
          return;
        }
        setNazov(f.name);
        setUpozornenia(r.upozornenia);
        setFilter("");
        setRiadky(nahladXml(r.zaznamy, existujuce, { neaktivneAkoAktivne: aktivneVsetky }));
      } catch (e: any) {
        setChyba(e?.message ?? t("Súbor sa nepodarilo načítať"));
      } finally {
        setBusy(null);
      }
    },
    [existujuce, aktivneVsetky, t],
  );

  // Súbor vybraný na karte „Nahrať súbor“ sa načíta hneď.
  const prvy = useRef(prvySubor);
  useEffect(() => {
    if (prvy.current) void nacitajSubor(prvy.current);
    prvy.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function prepniAktivne(v: boolean) {
    setAktivneVsetky(v);
    if (riadky) setRiadky(prepocitajNahladXml(riadky, existujuce, { neaktivneAkoAktivne: v }));
  }

  function stiahniZiadost() {
    const blob = new Blob([ziadostCiselnikov(ico)], { type: "text/xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "faktero-ziadost-predkontacie.xml";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const pocty = useMemo(() => poctyPodlaDruhu(riadky ?? []), [riadky]);
  const viditelne = useMemo(
    () => (riadky ?? []).map((r, i) => ({ r, i })).filter(({ r }) => !filter || r.druh === filter),
    [riadky, filter],
  );
  const vybrane = useMemo(() => (riadky ?? []).filter((r) => r.vybrany), [riadky]);
  const pocetStavov = useMemo(() => {
    const m = new Map<StavXml, number>();
    for (const r of riadky ?? []) m.set(r.stav, (m.get(r.stav) ?? 0) + 1);
    return m;
  }, [riadky]);
  const neaktivnych = (riadky ?? []).filter((r) => !r.aktivne).length;
  const naVyber = viditelne.filter(({ r }) => r.stav !== "bez_zmeny");

  async function ulozit() {
    if (!vybrane.length) return;
    setBusy("ulozit");
    try {
      const r = await uloz({
        data: {
          company_id: companyId,
          neaktivne_ako_aktivne: aktivneVsetky,
          zaznamy: vybrane.map((x) => ({
            druh: x.druh as any,
            kod: x.kod,
            popis: x.popis,
            agenda: x.agenda ?? "",
            ucet_md: x.ucet_md,
            ucet_d: x.ucet_d,
            pohoda_id: x.pohoda_id,
            aktivne: x.aktivne,
          })),
        },
      });
      toast.success(
        t("Uložené: {n} nových, {z} zmenených", { n: r.novych, z: r.zmenenych }) +
          (r.bezZmeny ? t(" · {p} bez zmeny alebo preskočených", { p: r.bezZmeny }) : ""),
      );
      onUlozene();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-2 backdrop-blur-[2px] sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Nahrať XML z Pohody")}
        data-import-z-xml=""
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{t("Nahrať XML z Pohody")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Predkontácie, členenia DPH, číselné rady, strediská, činnosti, zákazky a bankové účty z odpovede Pohody. Pred uložením všetko skontrolujete; nič sa nezmaže ani nevypne.",
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
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm sm:p-4" data-navod-xml="">
                <div className="font-semibold">{t("Ako dostať XML z POHODY")}</div>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>
                    {t("Stiahnite si žiadosť o číselníky:")}{" "}
                    <button
                      type="button"
                      onClick={stiahniZiadost}
                      className="inline-flex items-center gap-1 font-semibold text-primary underline"
                    >
                      <Download className="h-3.5 w-3.5" /> {t("Stiahnuť žiadosť")}
                    </button>
                  </li>
                  <li>
                    {t(
                      "V POHODE otvorte Súbor → Dátová komunikácia → XML import/export, vyberte stiahnutú žiadosť a dokončite sprievodcu.",
                    )}
                  </li>
                  <li>
                    {t(
                      "POHODA uloží odpoveď do podpriečinka Response vedľa žiadosti (nájdete ju aj v agende XML log). Tento súbor nahrajte sem.",
                    )}
                  </li>
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(
                    "Ponuka „Export do XML…“ (pravé tlačidlo v tabuľke agendy) je v dokumentácii POHODY opísaná pre agendy ako Adresár či Zásoby, nie pre predkontácie a členenie DPH — preto ide číselník cez žiadosť. Keď beží konektor Pohody, vypýta si ho sám.",
                  )}
                </p>
              </div>

              <div
                data-zona-xml=""
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void nacitajSubor(f);
                }}
                className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center sm:p-6"
              >
                <FileCode2 className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm">
                  {t("Pretiahnite sem XML súbor z Pohody, alebo")}{" "}
                  <button
                    type="button"
                    onClick={() => vstupSuboru.current?.click()}
                    disabled={!!busy}
                    className="font-semibold text-primary underline disabled:opacity-50"
                  >
                    {t("vyberte súbor")}
                  </button>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("XML vo Windows-1250 aj UTF-8, najviac {n} MB.", { n: MAX_MB })}
                </p>
                <input
                  ref={vstupSuboru}
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  className="hidden"
                  data-vstup-xml=""
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void nacitajSubor(f);
                    e.target.value = "";
                  }}
                />
                {busy === "citam" && <Loader2 className="mx-auto mt-2 h-5 w-5 animate-spin text-muted-foreground" />}
              </div>
              {chyba && (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                  {chyba}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="block text-sm">
                  <span className="text-xs font-medium text-muted-foreground">{t("Číselník")}</span>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as DruhCiselnika | "")}
                    aria-label={t("Číselník")}
                    className="mt-1 block rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">
                      {t("Všetky")} ({riadky.length})
                    </option>
                    {DRUHY_CISELNIKA.filter((d) => pocty.get(d.kod)).map((d) => (
                      <option key={d.kod} value={d.kod}>
                        {t(d.nazov)} ({pocty.get(d.kod)})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-1.5 text-xs" data-suhrn-stavov="">
                  <span className="max-w-[16rem] truncate text-muted-foreground" title={nazov ?? undefined}>
                    {nazov}
                  </span>
                  {(Object.keys(NAZOV_STAVU) as StavXml[])
                    .filter((s) => pocetStavov.get(s))
                    .map((s) => (
                      <span key={s} className={triedaStavu(TON[s], true)}>
                        {t(NAZOV_STAVU[s])}: {pocetStavov.get(s)}
                      </span>
                    ))}
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm" data-neaktivne-ako-aktivne="">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={aktivneVsetky}
                  onChange={(e) => prepniAktivne(e.target.checked)}
                />
                <span>
                  {t("Importovať aj neaktívne ako aktívne")}
                  <span className="block text-xs text-muted-foreground">
                    {neaktivnych
                      ? t(
                          "Neaktívne v Pohode: {n} (Pohoda ich neponúka alebo už neplatia). Zapnite, ak ich na dokladoch potrebujete — napr. UDpdp.",
                          { n: neaktivnych },
                        )
                      : t("Všetky kódy v súbore sú v Pohode aktívne.")}
                  </span>
                </span>
              </label>

              {upozornenia.length > 0 && (
                <ul className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  {upozornenia.map((u, i) => (
                    <li key={i}>
                      {t("Pohoda pri časti žiadosti vrátila chybu:")} {u}
                    </li>
                  ))}
                </ul>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-sm" data-nahlad-xml="">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={t("Vybrať všetky nové a zmenené")}
                          checked={naVyber.length > 0 && naVyber.every(({ r }) => r.vybrany)}
                          onChange={(e) => {
                            const idx = new Set(naVyber.map(({ i }) => i));
                            setRiadky(riadky.map((r, i) => (idx.has(i) ? { ...r, vybrany: e.target.checked } : r)));
                          }}
                        />
                      </th>
                      <th className="px-2 py-2 font-semibold">{t("Stav")}</th>
                      {!filter && <th className="px-2 py-2 font-semibold">{t("Číselník")}</th>}
                      <th className="px-2 py-2 font-semibold">{t("Kód")}</th>
                      <th className="px-2 py-2 font-semibold">{t("Popis")}</th>
                      <th className="px-2 py-2 font-semibold">{t("Agenda")}</th>
                      <th className="px-2 py-2 font-semibold">MD</th>
                      <th className="px-2 py-2 font-semibold">D</th>
                      <th className="px-2 py-2 font-semibold">{t("V Pohode")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viditelne.map(({ r, i }) => (
                      <tr
                        key={`${r.druh}|${r.kod}|${r.agenda}`}
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
                          {r.zmeny.length > 0 && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {r.zmeny.map((z) => t(NAZOV_POLA[z])).join(", ")}
                            </div>
                          )}
                        </td>
                        {!filter && <td className="whitespace-nowrap px-2 py-1.5 text-xs">{t(nazovDruhu(r.druh))}</td>}
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{r.kod}</td>
                        <td className="min-w-[14rem] px-2 py-1.5">{r.popis ?? "—"}</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">
                          {r.druh === "predkontacia" ? t(nazovAgendy(r.agenda)) : r.agenda || "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{r.ucet_md ?? ""}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{r.ucet_d ?? ""}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                          {r.aktivne ? t("aktívny") : <span className="text-amber-700 dark:text-amber-300">{t("neaktívny")}</span>}
                        </td>
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
                setNazov(null);
              }}
              disabled={!!busy}
              className="mr-auto rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {t("Iný súbor")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          {riadky !== null && (
            <button
              type="button"
              onClick={ulozit}
              disabled={!vybrane.length || !!busy}
              data-ulozit-z-xml=""
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
