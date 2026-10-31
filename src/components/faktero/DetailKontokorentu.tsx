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
          <div key={popis} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{t(popis)}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{hodnota}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex min-w-0 justify-between gap-3">
            <dt className="text-muted-foreground">{t("Účet")}</dt>
            <dd className="min-w-0 truncate text-right">
              {d?.ucet
                ? [d.ucet.account_name, d.ucet.iban].filter(Boolean).join(" · ")
                : zmluva.account_iban
                  ? t("{iban} (nenapojený)", { iban: zmluva.account_iban })
                  : t("nevybraný")}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("Zostatok účtu")}</dt>
            <dd className="text-right tabular-nums">
              {stav?.znamy ? formatujSumu(stav.zostatok, mena) : t("zostatok účtu nie je známy")}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("Úrok")}</dt>
            <dd className="text-right tabular-nums">
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
            <dt className="text-muted-foreground">{t("Poplatok za rámec")}</dt>
            <dd className="tabular-nums">
              {Number(zmluva.limit_fee_yearly) > 0
                ? t("{suma} ročne", { suma: formatujSumu(Number(zmluva.limit_fee_yearly), mena) })
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("Rámec platí do")}</dt>
            <dd>{zmluva.valid_until ? datum(zmluva.valid_until) : t("doba neurčitá")}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("Úroky / poplatky")}</dt>
            <dd className="tabular-nums">
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
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
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
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4" /> {t("Pohyby, ktoré sem asi patria")}
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
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {datum(n.datum)} · {formatujSumu(n.suma, mena)} · {t(NAZOV_DRUHU[n.druh])}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[n.popis, ...n.dovody].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
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
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        druh === n.druh ? "bg-primary text-primary-foreground" : "border"
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

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="text-sm font-medium">{t("Úroky a poplatky strhnuté bankou")}</h2>
          <button
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
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{" "}
            {t("Spárovať s bankou")}
          </button>
        </div>
        {!d ? (
          <p className="p-4 text-sm text-muted-foreground">{t("Načítavam…")}</p>
        ) : d.poplatky.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t(
              "Zatiaľ nič. Úroky a poplatky z účtu s rámcom sa sem priradia samy pri sťahovaní pohybov z banky.",
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-medium">{t("Dátum")}</th>
                  <th className="p-3 text-left font-medium">{t("Druh")}</th>
                  <th className="p-3 text-left font-medium">{t("Pohyb")}</th>
                  <th className="p-3 text-right font-medium">{t("Suma")}</th>
                  <th className="p-3">
                    <span className="sr-only">{t("Akcie")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.poplatky.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3">{datum(r.charged_on)}</td>
                    <td className="p-3">{t(NAZOV_DRUHU[r.kind])}</td>
                    <td className="max-w-[18rem] truncate p-3 text-muted-foreground">
                      {r.popis ?? "—"}
                      {r.source === "rucne" ? " " + t("(priradené ručne)") : ""}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
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
                        className="text-muted-foreground hover:text-foreground"
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
