import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Undo2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { formatujCislo } from "@/lib/faktero/mena";
import {
  nazovIndexu,
  sadzbaZoSkutocnosti,
  type RiadokPorovnania,
  type SadzbaObdobia,
} from "@/lib/faktero/pohybliva-sadzba";
import { sadzbaZmluvyFn, ulozRucnuSadzbuFn } from "@/lib/faktero/pohybliva-sadzba.functions";

/**
 * Úroková sadzba zmluvy: dnešná (pri pohyblivej rozpísaná na index + maržu),
 * pri kontokorente vypočítaný úrok po mesiacoch porovnaný so strhnutým a
 * história sadzby po obdobiach fixácie s možnosťou zadať sadzbu ručne.
 */

type Odhad =
  | { ok: true; od: string; riadky: RiadokPorovnania[] }
  | { ok: false; dovod: "bez_uctu" | "bez_zostatku" | "bez_pohybov" };

type Data = {
  aktualna: SadzbaObdobia;
  historia: SadzbaObdobia[];
  rucne: { id: string; period_start: string; rate: number; note?: string | null }[];
  odhad: Odhad | null;
};

const DOVODY: Record<string, string> = {
  bez_uctu: "Zmluva nemá vybraný napojený účet — úrok sa nedá vypočítať.",
  bez_zostatku:
    "Banka neposiela zaúčtovaný zostatok účtu — bez neho sa čerpanie po dňoch spočítať nedá (disponibilný zostatok obsahuje aj nevyčerpaný rámec).",
  bez_pohybov: "Na účte zatiaľ nie sú žiadne pohyby z banky.",
};

function pct(n: number | null | undefined, des = 2): string {
  if (n === null || n === undefined) return "—";
  return `${formatujCislo(n, des, des)} %`;
}

export function SadzbaZmluvy({
  cid,
  contractId,
  mena,
  pohybliva,
  dayCount,
  indexFloor,
}: {
  cid: string;
  contractId: string;
  mena: string;
  pohybliva: boolean;
  dayCount: string | null;
  indexFloor: number | string | null;
}) {
  const { t, jazyk } = useT();
  const nacitaj = useServerFn(sadzbaZmluvyFn);
  const ulozRucnu = useServerFn(ulozRucnuSadzbuFn);
  const [d, setD] = useState<Data | null>(null);
  const [upravujem, setUpravujem] = useState<string | null>(null);
  const [hodnota, setHodnota] = useState("");
  const [busy, setBusy] = useState(false);

  const datum = (s: string | null | undefined) =>
    s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(lokalJazyka(jazyk)) : "—";
  const mesiac = (s: string) =>
    new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(lokalJazyka(jazyk), {
      month: "long",
      year: "numeric",
    });

  const obnov = useCallback(async () => {
    try {
      setD((await nacitaj({ data: { company_id: cid, id: contractId } })) as unknown as Data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("Sadzbu sa nepodarilo načítať."));
    }
  }, [cid, contractId, nacitaj, t]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  async function ulozSadzbu(
    periodStart: string,
    rate: number | null,
    source: "rucne" | "banka" = "rucne",
  ) {
    setBusy(true);
    try {
      await ulozRucnu({
        data: { company_id: cid, contract_id: contractId, period_start: periodStart, rate, source },
      });
      toast.success(
        rate === null
          ? t("Ručná sadzba zrušená, platí vypočítaná.")
          : t("Sadzba za obdobie uložená."),
      );
      setUpravujem(null);
      await obnov();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("Nepodarilo sa to."));
    } finally {
      setBusy(false);
    }
  }

  if (!d) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        {t("Načítavam…")}
      </div>
    );
  }

  const a = d.aktualna;
  const konvencia = dayCount || "ACT/365";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 text-sm">
        <h2 className="mb-2 text-sm font-medium">{t("Úroková sadzba")}</h2>
        {!pohybliva ? (
          <p>
            {t("Pevná sadzba {sadzba} p. a.", { sadzba: pct(a.sadzba) })}
            {a.zdroj === "rucne" ? ` ${t("(za toto obdobie zadaná ručne)")}` : ""}
          </p>
        ) : a.sadzba === null ? (
          <p className="text-amber-700 dark:text-amber-400">
            {t(
              "Hodnota indexu {index} ešte nie je načítaná — sadzba sa dopočíta po najbližšom stiahnutí sadzieb (denne ráno).",
              { index: nazovIndexu(a.index) },
            )}
          </p>
        ) : a.zdroj === "rucne" ? (
          <p className="text-base">
            {t("Aktuálna sadzba: {sadzba} p. a. (zadaná ručne za obdobie {od} – {do})", {
              sadzba: pct(a.sadzba),
              od: datum(a.od),
              do: datum(a.do),
            })}
          </p>
        ) : (
          <p className="text-base">
            {t("Aktuálna sadzba: {index} {hodnota} ({k}) + marža {marza} = {sadzba} p. a.", {
              index: nazovIndexu(a.index),
              hodnota: pct(a.indexHodnota, 3),
              k:
                a.indexDruh === "mesacny_priemer"
                  ? t("priemer za {mesiac}", { mesiac: mesiac(a.indexK!) })
                  : t("k {datum}", { datum: datum(a.indexK) }),
              marza: pct(a.marza),
              sadzba: pct(a.sadzba),
            })}
          </p>
        )}
        {pohybliva && a.floorPouzity && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Index je pod dolnou hranicou {floor}, počíta sa s hranicou.", {
              floor: pct(Number(indexFloor)),
            })}
          </p>
        )}
        {pohybliva && a.zdroj !== "rucne" && a.sadzba !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Obdobie fixácie {od} – {do}, deň fixingu {fixing}.", {
              od: datum(a.od),
              do: datum(a.do),
              fixing: datum(a.fixing),
            })}
          </p>
        )}
        {pohybliva && a.odhad && (
          <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            {t(
              "Odhad: EURIBOR je verejne zadarmo len ako mesačný priemer (ECB), zmluva ho však berie k dňu fixingu. Skutočný úrok určuje banka. Keď sadzbu poznáte (oznámenie banky, výpis), zadajte ju za obdobie ručne — prepíše vypočítanú.",
            )}
          </p>
        )}
        {pohybliva && a.predbezna && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">
            {t(
              "Predbežné: hodnota indexu k dňu fixingu ešte nie je zverejnená, použitá je posledná známa.",
            )}
          </p>
        )}
      </div>

      {d.odhad && (
        <div className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h2 className="text-sm font-medium">{t("Vypočítaný úrok a skutočnosť")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Úrok z čerpania na konci každého dňa (zaúčtovaný zostatok a pohyby z banky) × sadzba platná v ten deň, {konvencia}. Rozdiel oproti úroku, ktorý banka strhla, je najlepšia kontrola, či sadzba a fixing sedia.",
                { konvencia },
              )}
            </p>
          </div>
          {!d.odhad.ok ? (
            <p className="p-4 text-sm text-muted-foreground">{t(DOVODY[d.odhad.dovod] ?? "")}</p>
          ) : d.odhad.riadky.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("Zatiaľ nič na výpočet.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">{t("Obdobie")}</th>
                    <th className="p-3 text-right font-medium">{t("Priemerné čerpanie")}</th>
                    <th className="p-3 text-right font-medium">{t("Sadzba")}</th>
                    <th className="p-3 text-right font-medium">{t("Vypočítaný úrok")}</th>
                    <th className="p-3 text-right font-medium">{t("Strhla banka")}</th>
                    <th className="p-3 text-right font-medium">{t("Rozdiel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.odhad.riadky as RiadokPorovnania[]).map((r) => {
                    const navrh = sadzbaZoSkutocnosti(r);
                    // Ručnú sadzbu z rozdielu sa dá prevziať, len keď celé
                    // úrokové obdobie leží v jednom období fixácie.
                    const fixacia = d.historia.find((h) => h.od <= r.od && h.do >= r.do);
                    const ponuknut =
                      navrh !== null &&
                      fixacia &&
                      r.rozdiel !== null &&
                      Math.abs(r.rozdiel) >= 0.05;
                    return (
                      <tr key={r.od} className="border-b last:border-0 align-top">
                        <td className="p-3">
                          {datum(r.od)} – {datum(r.do)}
                          {r.predbezny && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {t("(predbežne)")}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatujSumu(r.priemerneCerpanie, mena)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {r.useky
                            .filter((u, i, p) => i === 0 || u.sadzba !== p[i - 1]!.sadzba)
                            .map((u) => pct(u.sadzba))
                            .join(" → ")}
                          {r.odhad && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {t("(odhad)")}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium tabular-nums">
                          {formatujSumu(r.urok, mena)}
                          {r.bezSadzby && (
                            <div className="text-xs font-normal text-amber-700 dark:text-amber-400">
                              {t("niektoré dni bez sadzby")}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {r.skutocny === null ? "—" : formatujSumu(r.skutocny, mena)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {r.rozdiel === null ? (
                            "—"
                          ) : (
                            <span
                              className={
                                Math.abs(r.rozdiel) >= 1 ? "text-amber-700 dark:text-amber-400" : ""
                              }
                            >
                              {r.rozdiel > 0 ? "+" : ""}
                              {formatujSumu(r.rozdiel, mena)}
                            </span>
                          )}
                          {ponuknut && (
                            <button
                              disabled={busy}
                              onClick={() => void ulozSadzbu(fixacia!.od, navrh!, "banka")}
                              className="mt-1 block w-full text-right text-xs text-primary underline"
                              title={t(
                                "Uloží sadzbu za obdobie fixácie tak, aby výpočet sedel so strhnutým úrokom.",
                              )}
                            >
                              {t("Prevziať sadzbu {s}", { s: pct(navrh, 3) })}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {d.historia.length > 0 && (
        <details className="rounded-xl border bg-card">
          <summary className="cursor-pointer p-4 text-sm font-medium">
            {t("História sadzby po obdobiach")}
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-medium">{t("Obdobie")}</th>
                  {pohybliva && <th className="p-3 text-left font-medium">{t("Fixing")}</th>}
                  {pohybliva && <th className="p-3 text-right font-medium">{t("Index")}</th>}
                  {pohybliva && <th className="p-3 text-right font-medium">{t("Marža")}</th>}
                  <th className="p-3 text-right font-medium">{t("Sadzba")}</th>
                  <th className="p-3 text-left font-medium">{t("Zdroj")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {d.historia.map((h) => (
                  <tr key={h.od} className="border-b last:border-0">
                    <td className="p-3">
                      {datum(h.od)} – {datum(h.do)}
                    </td>
                    {pohybliva && <td className="p-3">{datum(h.fixing)}</td>}
                    {pohybliva && (
                      <td className="p-3 text-right tabular-nums">
                        {pct(h.indexHodnota, 3)}
                        {h.floorPouzity ? ` (${t("hranica")})` : ""}
                      </td>
                    )}
                    {pohybliva && <td className="p-3 text-right tabular-nums">{pct(h.marza)}</td>}
                    <td className="p-3 text-right font-medium tabular-nums">
                      {upravujem === h.od ? (
                        <input
                          autoFocus
                          inputMode="decimal"
                          className="w-24 rounded border bg-background px-2 py-1 text-right"
                          value={hodnota}
                          onChange={(e) => setHodnota(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setUpravujem(null);
                          }}
                        />
                      ) : (
                        pct(h.sadzba)
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {h.zdroj === "rucne"
                        ? t("zadané ručne")
                        : h.zdroj === "pevna"
                          ? t("pevná")
                          : [
                              h.odhad ? t("odhad z mesačného priemeru") : t("vypočítané"),
                              h.predbezna ? t("predbežne") : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                    </td>
                    <td className="p-3 text-right">
                      {upravujem === h.od ? (
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={busy}
                            onClick={() => {
                              const n = Number(hodnota.replace(",", "."));
                              if (!hodnota.trim() || !Number.isFinite(n)) {
                                toast.error(t("Zadajte sadzbu v % p. a."));
                                return;
                              }
                              void ulozSadzbu(h.od, n);
                            }}
                            className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                          >
                            {t("Uložiť")}
                          </button>
                          <button
                            onClick={() => setUpravujem(null)}
                            className="rounded-lg border px-2.5 py-1 text-xs"
                          >
                            {t("Zrušiť")}
                          </button>
                        </div>
                      ) : h.zdroj === "rucne" ? (
                        <button
                          disabled={busy}
                          title={t("Zrušiť ručnú sadzbu")}
                          onClick={() => void ulozSadzbu(h.od, null)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          title={t("Zadať sadzbu ručne")}
                          onClick={() => {
                            setUpravujem(h.od);
                            setHodnota(h.sadzba === null ? "" : String(h.sadzba).replace(".", ","));
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t p-4 text-xs text-muted-foreground">
            {t(
              "Ručne zadaná sadzba (celková, teda index + marža) prepíše vypočítanú za celé obdobie fixácie — keď banka oznámi skutočnú sadzbu, alebo keď ju prevezmete zo strhnutého úroku.",
            )}
          </p>
        </details>
      )}
    </div>
  );
}
