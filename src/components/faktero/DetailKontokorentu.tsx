import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, RefreshCw, Undo2 } from "lucide-react";
import {
  detailKontokorentuFn,
  potvrdPoplatokFn,
  sparujKontokorentTerazFn,
  zrusPoplatokFn,
} from "@/lib/faktero/kontokorent.functions";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { OBDOBIA_UROCENIA, type StavRamca } from "@/lib/faktero/kontokorent";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/button";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { SadzbaZmluvy } from "./SadzbaZmluvy";
import { nazovIndexu } from "@/lib/faktero/pohybliva-sadzba";

/**
 * Detail kontokorentného úveru.
 *
 * Kontokorent nemá splátkový kalendár, takže sa tu ukazuje to, čo firma o
 * rámci potrebuje vedieť: limit, koľko z neho práve čerpá (podľa zostatku
 * napojeného účtu), koľko jej ostáva, a čo banka za rámec strhla — úroky
 * (finančný náklad) a poplatky zvlášť.
 */

type Poplatok = {
  id: string;
  kind: "urok" | "poplatok";
  amount: number;
  currency: string;
  charged_on: string;
  source: string;
  popis: string | null;
};

type Navrh = {
  transactionId: string;
  contractId: string;
  druh: "urok" | "poplatok";
  suma: number;
  datum: string;
  dovody: string[];
  popis: string | null;
};

type Detail = {
  ucet: {
    account_name: string | null;
    iban: string | null;
    currency: string;
    last_synced_at: string | null;
  } | null;
  stav: StavRamca;
  poplatky: Poplatok[];
  sucty: { uroky: number; poplatky: number };
  navrhy: Navrh[];
};

function datum(d: string): string {
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("sk-SK");
}

const NAZOV_DRUHU = { urok: "Úrok", poplatok: "Poplatok" } as const;

export function DetailKontokorentu({
  cid,
  zmluva,
}: {
  cid: string;
  zmluva: {
    id: string;
    currency: string;
    credit_limit: number | string | null;
    interest_rate: number | string | null;
    limit_fee_yearly: number | string | null;
    valid_until: string | null;
    interest_period: string | null;
    account_iban: string | null;
    bank_account_id: string | null;
    note: string | null;
    rate_type?: string | null;
    reference_index?: string | null;
    rate_margin?: number | string | null;
    index_floor?: number | string | null;
    day_count?: string | null;
  };
}) {
  const { t } = useT();
  const nacitaj = useServerFn(detailKontokorentuFn);
  const sparuj = useServerFn(sparujKontokorentTerazFn);
  const potvrd = useServerFn(potvrdPoplatokFn);
  const zrus = useServerFn(zrusPoplatokFn);
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const mena = zmluva.currency || "EUR";

  const obnov = useCallback(async () => {
    try {
      setD((await nacitaj({ data: { company_id: cid, id: zmluva.id } })) as unknown as Detail);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("Kontokorent sa nepodarilo načítať."));
    }
  }, [cid, zmluva.id, nacitaj]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  async function urobit(praca: () => Promise<unknown>, hlaska: string) {
    setBusy(true);
    try {
      await praca();
      toast.success(t(hlaska));
      await obnov();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("Nepodarilo sa to."));
    } finally {
      setBusy(false);
    }
  }

  const limit = Number(zmluva.credit_limit) || 0;
  const stav = d?.stav;
  const obdobie = OBDOBIA_UROCENIA.find((o) => o.kluc === zmluva.interest_period)?.nazov;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Úverový rámec", formatujSumu(limit, mena)],
          ["Čerpané", stav?.znamy ? formatujSumu(stav.cerpanie, mena) : "—"],
          ["Voľný rámec", stav?.znamy ? formatujSumu(stav.volny, mena) : "—"],
          [
            "Úroky a poplatky spolu",
            d ? formatujSumu(d.sucty.uroky + d.sucty.poplatky, mena) : "—",
          ],
        ].map(([popis, hodnota]) => (
          <div key={popis} className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-sm text-muted-foreground">{t(popis)}</div>
            <div className="suma mt-1 text-xl">{hodnota}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm sm:p-5">
        <dl className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          <div className="flex min-w-0 justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{t("Účet")}</dt>
            <dd className="min-w-0 truncate text-right">
              {d?.ucet
                ? [d.ucet.account_name, d.ucet.iban].filter(Boolean).join(" · ")
                : zmluva.account_iban
                  ? t("{iban} (nenapojený)", { iban: zmluva.account_iban })
                  : t("nevybraný")}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{t("Zostatok účtu")}</dt>
            <dd className={stav?.znamy ? "suma text-right" : "text-right"}>
              {stav?.znamy ? formatujSumu(stav.zostatok, mena) : t("zostatok účtu nie je známy")}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{t("Úrok")}</dt>
            <dd className="min-w-0 text-right tabular-nums">
              {zmluva.rate_type === "pohybliva"
                ? t("{index} + marža {marza} % p. a.", {
                    index: nazovIndexu(zmluva.reference_index),
                    marza: String(Number(zmluva.rate_margin)).replace(".", ","),
                  })
                : zmluva.interest_rate !== null && zmluva.interest_rate !== ""
                  ? t("{sadzba} % p. a.", {
                      sadzba: String(Number(zmluva.interest_rate)).replace(".", ","),
                    })
                  : "—"}
              {zmluva.day_count ? `, ${zmluva.day_count}` : ""}
              {obdobie ? t(", strháva sa {obdobie}", { obdobie: t(obdobie) }) : ""}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{t("Poplatok za rámec")}</dt>
            <dd className="text-right tabular-nums">
              {Number(zmluva.limit_fee_yearly) > 0
                ? t("{suma} ročne", { suma: formatujSumu(Number(zmluva.limit_fee_yearly), mena) })
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{t("Rámec platí do")}</dt>
            <dd className="whitespace-nowrap text-right">{zmluva.valid_until ? datum(zmluva.valid_until) : t("doba neurčitá")}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{t("Úroky / poplatky")}</dt>
            <dd className="text-right tabular-nums">
              {d
                ? `${formatujSumu(d.sucty.uroky, mena)} / ${formatujSumu(d.sucty.poplatky, mena)}`
                : "—"}
            </dd>
          </div>
        </dl>
        {stav?.znamy && stav.zdroj === "disponibilny" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "Banka neposlala zaúčtovaný zostatok, čerpanie je z disponibilného. Ten niektoré banky uvádzajú aj s nevyčerpaným rámcom — porovnajte ho s internetbankingom.",
            )}
          </p>
        )}
        {!zmluva.bank_account_id && (
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            {t(
              "Zmluva nemá vybraný napojený účet — čerpanie sa nedá zistiť a úroky sa samy nespárujú. Vyberte účet v úprave zmluvy.",
            )}
          </p>
        )}
      </div>

      <SadzbaZmluvy
        cid={cid}
        contractId={zmluva.id}
        mena={mena}
        pohybliva={zmluva.rate_type === "pohybliva"}
        dayCount={zmluva.day_count ?? null}
        indexFloor={zmluva.index_floor ?? null}
      />

      {(d?.navrhy.length ?? 0) > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 sm:p-5">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
            <Link2 className="h-4 w-4 text-warning" /> {t("Pohyby, ktoré sem asi patria")}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {t(
              "Sami sa nespárovali — text pohybu kontokorent výslovne nespomína, alebo je na účte viac rámcov.",
            )}
          </p>
          <div className="space-y-2">
            {d!.navrhy.map((n) => (
              <div
                key={n.transactionId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold">
                    <span className="whitespace-nowrap">{datum(n.datum)}</span> ·{" "}
                    <span className="suma">{formatujSumu(n.suma, mena)}</span> · {t(NAZOV_DRUHU[n.druh])}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[n.popis, ...n.dovody].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {(["urok", "poplatok"] as const).map((druh) => (
                    <button
                      key={druh}
                      onClick={() =>
                        void urobit(
                          () =>
                            potvrd({
                              data: {
                                company_id: cid,
                                contract_id: zmluva.id,
                                transaction_id: n.transactionId,
                                kind: druh,
                              },
                            }),
                          druh === "urok" ? "Priradené ako úrok." : "Priradené ako poplatok.",
                        )
                      }
                      disabled={busy}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        druh === n.druh
                          ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                          : "border border-input bg-background hover:bg-accent"
                      }`}
                    >
                      {druh === "urok" ? t("Je to úrok") : t("Je to poplatok")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
          <h2 className="text-base font-semibold">{t("Úroky a poplatky strhnuté bankou")}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void urobit(async () => {
                const r = await sparuj({ data: { company_id: cid } });
                if (r.zapisanych === 0 && r.navrhov === 0) {
                  throw new Error(
                    r.pohybov === 0
                      ? t("Na účte s rámcom nie sú žiadne nespárované odchádzajúce pohyby.")
                      : t(
                          "Prezrelo sa {n} pohybov a ani jeden nie je úrokom ani poplatkom z kontokorentu.",
                          { n: r.pohybov },
                        ),
                  );
                }
              }, "Párovanie s bankou prebehlo.")
            }
            disabled={busy}
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{" "}
            {t("Spárovať s bankou")}
          </Button>
        </div>
        {!d ? (
          <NacitavanieStav className="py-8" />
        ) : d.poplatky.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t(
              "Zatiaľ nič. Úroky a poplatky z účtu s rámcom sa sem priradia samy pri sťahovaní pohybov z banky.",
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-semibold whitespace-nowrap">{t("Dátum")}</th>
                  <th className="p-3 text-left font-semibold whitespace-nowrap">{t("Druh")}</th>
                  <th className="p-3 text-left font-semibold whitespace-nowrap">{t("Pohyb")}</th>
                  <th className="p-3 text-right font-semibold whitespace-nowrap">{t("Suma")}</th>
                  <th className="p-3">
                    <span className="sr-only">{t("Akcie")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.poplatky.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap p-3">{datum(r.charged_on)}</td>
                    <td className="p-3">{t(NAZOV_DRUHU[r.kind])}</td>
                    <td className="max-w-[18rem] truncate p-3 text-muted-foreground">
                      {r.popis ?? "—"}
                      {r.source === "rucne" ? " " + t("(priradené ručne)") : ""}
                    </td>
                    <td className="suma p-3 text-right">
                      {formatujSumu(r.amount, r.currency)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        title={t("Zrušiť priradenie")}
                        onClick={() =>
                          void urobit(
                            () => zrus({ data: { company_id: cid, id: r.id } }),
                            "Priradenie zrušené.",
                          )
                        }
                        disabled={busy}
                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        {t(
          "Do účtovníctva: úrok je finančný náklad (562), poplatok za rámec ostatný finančný náklad (568). Čerpaný kontokorent je krátkodobý bankový úver (231) — to je stav účtu, nie platba, takže sa nevyváža ako splátka.",
        )}
      </p>
    </div>
  );
}
