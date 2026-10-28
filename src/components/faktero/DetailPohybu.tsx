import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Loader2, Receipt, Unlink, Wand2, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import { formatovacMeny } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import {
  detailPohybuFn,
  oznacPohybFn,
  type DokladPohybu,
} from "@/lib/faktero/pohyb-vybavenie.functions";
import {
  hladaniePravidlaZPohybu,
  nazovVybavenia,
  pokrytiePohybu,
  stavPohybu,
} from "@/lib/faktero/pohyb-vybavenie";
import { zrusParovanie } from "@/lib/faktero/parovanie.functions";
import { zrusParovaniePrijatej } from "@/lib/faktero/prijata-parovanie.functions";
import { zrusParovanieDokladu } from "@/lib/faktero/doklad-parovanie.functions";
import { zrusSparovanieSplatkyFn } from "@/lib/faktero/financovanie.functions";

type Detail = Awaited<ReturnType<typeof detailPohybuFn>>;

const DRUH_DOKLADU: Record<DokladPohybu["druh"], string> = {
  faktura: "Vystavená faktúra",
  prijata: "Prijatá faktúra",
  doklad: "Doklad",
  splatka: "Splátka",
  poplatok: "Úrok alebo poplatok z úveru",
};

/**
 * Detail bankového pohybu: údaje platby, spárované doklady so súčtom
 * („Spolu X € z Y €“), označenie bez dokladu a pravidlo z pohybu.
 */
export function DetailPohybu({
  companyId,
  pohybId,
  onClose,
  onZmena,
}: {
  companyId: string;
  pohybId: string;
  onClose: () => void;
  onZmena: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const nacitajDetail = useServerFn(detailPohybuFn);
  const oznac = useServerFn(oznacPohybFn);
  const zrusFakturu = useServerFn(zrusParovanie);
  const zrusPrijatu = useServerFn(zrusParovaniePrijatej);
  const zrusDoklad = useServerFn(zrusParovanieDokladu);
  const zrusSplatku = useServerFn(zrusSparovanieSplatkyFn);

  const [d, setD] = useState<Detail | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [poznamka, setPoznamka] = useState("");
  const [busy, setBusy] = useState(false);

  async function nacitaj() {
    try {
      const r = await nacitajDetail({ data: { company_id: companyId, id: pohybId } });
      setD(r);
      setPoznamka(String(r.pohyb.vybavenie_poznamka ?? ""));
    } catch (e: any) {
      setChyba(e?.message ?? t("Pohyb sa nepodarilo načítať."));
    }
  }
  useEffect(() => {
    void nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pohybId]);

  const p = d?.pohyb;
  const mena = String(p?.currency ?? "EUR");
  const fmt = (n: number, c = mena) => formatovacMeny(c, "sk-SK")(n);
  const stav = p ? stavPohybu(p) : null;
  const suma = Number(p?.amount ?? 0);
  const pokrytie = d ? pokrytiePohybu(suma, d.doklady) : null;

  async function nastav(vybavenie: "bez_dokladu" | "transakcna_dan" | null) {
    setBusy(true);
    try {
      await oznac({
        data: {
          company_id: companyId,
          id: pohybId,
          vybavenie,
          poznamka: vybavenie ? poznamka : null,
        },
      });
      toast.success(
        vybavenie === "transakcna_dan"
          ? t("Pohyb je označený ako transakčná daň.")
          : vybavenie
            ? t("Pohyb je označený ako spárovaný bez dokladu.")
            : t("Označenie zrušené, pohyb je znovu medzi nespárovanými."),
      );
      onZmena();
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť."));
    } finally {
      setBusy(false);
    }
  }

  async function odparujJeden(doklad: DokladPohybu) {
    switch (doklad.druh) {
      case "faktura":
        return zrusFakturu({ data: { companyId, transactionId: pohybId } });
      case "prijata":
        return zrusPrijatu({ data: { transaction_id: pohybId } });
      case "doklad":
        return zrusDoklad({ data: { transaction_id: pohybId } });
      case "splatka":
        return zrusSplatku({ data: { company_id: companyId, installment_id: doklad.id } });
      default:
        return null;
    }
  }

  async function odparuj(doklady: DokladPohybu[]) {
    const ciel = doklady.filter((x) => x.druh !== "poplatok");
    if (!ciel.length) return;
    const ok = await potvrd(
      ciel.length === 1
        ? t("Zrušiť párovanie pohybu s dokladom {cislo}?", { cislo: ciel[0].cislo ?? "—" })
        : t("Odpárovať od pohybu všetky doklady ({n})?", { n: ciel.length }),
      { potvrdit: t("Odpárovať"), nebezpecne: true },
    );
    if (!ok) return;
    setBusy(true);
    const zlyhali: string[] = [];
    for (const x of ciel) {
      try {
        await odparujJeden(x);
      } catch (e: any) {
        zlyhali.push(`${x.cislo ?? "—"}: ${e?.message ?? ""}`);
      }
    }
    setBusy(false);
    if (zlyhali.length)
      toast.error(t("Nepodarilo sa odpárovať: {doklady}", { doklady: zlyhali.join(", ") }));
    else toast.success(t("Párovanie zrušené."));
    onZmena();
    await nacitaj();
  }

  const odkazDokladu = (x: DokladPohybu) =>
    x.druh === "faktura" ? (
      <Link to="/faktury/$id" params={{ id: x.id }} className="text-primary hover:underline">
        {t("Detail")}
      </Link>
    ) : x.druh === "prijata" ? (
      <Link
        to="/prijate-faktury/$id"
        params={{ id: x.id }}
        className="text-primary hover:underline"
      >
        {t("Detail")}
      </Link>
    ) : x.druh === "splatka" || x.druh === "poplatok" ? null : (
      <Link to="/doklady" className="text-primary hover:underline">
        {t("Doklady")}
      </Link>
    );

  const riadok = (nazov: string, hodnota: React.ReactNode) => (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1">
      <dt className="text-xs text-muted-foreground">{nazov}</dt>
      <dd className="min-w-0 break-words text-right text-sm">{hodnota || "—"}</dd>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Detail pohybu")}
        className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">{t("Detail pohybu")}</h3>
          <button
            onClick={onClose}
            aria-label={t("Zavrieť")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {chyba && <p className="mt-3 text-sm text-destructive">{chyba}</p>}
        {!p && !chyba && (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {p && (
          <>
            <dl className="mt-3 divide-y divide-border/60">
              {riadok(suma < 0 ? t("Príjemca") : t("Odosielateľ"), p.counterparty)}
              {riadok(
                t("IBAN protistrany"),
                p.counterparty_iban && (
                  <span className="font-mono text-xs">{p.counterparty_iban}</span>
                ),
              )}
              {riadok(
                t("Variabilný symbol"),
                p.variable_symbol && <span className="font-mono">{p.variable_symbol}</span>,
              )}
              {riadok(t("Typ platby"), suma < 0 ? t("Výdaj (debet)") : t("Príjem (kredit)"))}
              {riadok(t("Dátum"), datumNaDoklade(p.booking_date))}
              {riadok(t("Účet"), d?.ucet ? (d.ucet.account_name ?? d.ucet.iban) : null)}
              {riadok(t("Popis"), p.description)}
              {riadok(
                t("Suma"),
                <span
                  className={`font-semibold tabular-nums ${suma < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}
                >
                  {fmt(suma)}
                </span>,
              )}
            </dl>

            <div className="mt-4 rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {stav === "sparovany" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : stav === "nesparovany" ? (
                  <CircleDashed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Receipt className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                )}
                {stav === "sparovany"
                  ? t("Spárovaný pohyb")
                  : stav === "nesparovany"
                    ? t("Nespárovaný pohyb")
                    : t(nazovVybavenia(stav) ?? "")}
              </div>

              {stav === "sparovany" && d && pokrytie && (
                <>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {d.doklady.map((x) => (
                          <tr key={`${x.druh}:${x.id}`} className="border-t border-border/60">
                            <td className="py-1.5 pr-2">
                              <div className="text-xs text-muted-foreground">
                                {t(DRUH_DOKLADU[x.druh])}
                              </div>
                              <div className="min-w-0 break-words">
                                {[x.cislo, x.partner].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {fmt(x.suma, x.mena ?? mena)}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-xs">{odkazDokladu(x)}</td>
                            <td className="py-1.5 text-right">
                              {x.druh !== "poplatok" && (
                                <button
                                  onClick={() => void odparuj([x])}
                                  disabled={busy}
                                  title={t("Odpárovať")}
                                  aria-label={t("Odpárovať")}
                                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                >
                                  <Unlink className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <span
                      className={`text-sm ${pokrytie.uplne ? "" : "text-amber-700 dark:text-amber-300"}`}
                    >
                      {t("Spolu {spolu} z {z}", { spolu: fmt(pokrytie.spolu), z: fmt(pokrytie.z) })}
                    </span>
                    {d.doklady.some((x) => x.druh !== "poplatok") && (
                      <button
                        onClick={() => void odparuj(d.doklady)}
                        disabled={busy}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-secondary disabled:opacity-50"
                      >
                        <Unlink className="h-3.5 w-3.5" /> {t("Odpárovať všetky doklady")}
                      </button>
                    )}
                  </div>
                </>
              )}

              {(stav === "bez_dokladu" || stav === "transakcna_dan") && (
                <div className="mt-2 space-y-1 text-sm">
                  {p.vybavenie_poznamka && <p>{p.vybavenie_poznamka}</p>}
                  <p className="text-xs text-muted-foreground">
                    {d?.pravidlo
                      ? t("Označené pravidlom „{nazov}“.", { nazov: d.pravidlo.nazov })
                      : p.vybavil
                        ? t("Označené ručne.")
                        : t("Označené automaticky podľa popisu banky.")}{" "}
                    {stav === "transakcna_dan" &&
                      t("Vo výpise do Pohody dostane predkontáciu pre transakčnú daň.")}
                  </p>
                  <button
                    onClick={() => void nastav(null)}
                    disabled={busy}
                    className="mt-1 inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs hover:bg-secondary disabled:opacity-50"
                  >
                    {t("Zrušiť označenie")}
                  </button>
                </div>
              )}

              {stav === "nesparovany" && (
                <div className="mt-2">
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">{t("Poznámka")}</span>
                    <input
                      value={poznamka}
                      maxLength={100}
                      onChange={(e) => setPoznamka(e.target.value)}
                      placeholder={t("napr. mzda 10/2026")}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    />
                    <span className="mt-0.5 block text-right text-[11px] text-muted-foreground">
                      {poznamka.length}/100
                    </span>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => void nastav("bez_dokladu")}
                      disabled={busy}
                      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
                    >
                      {t("Pohyb nemá doklad")}
                    </button>
                    <button
                      onClick={() => void nastav("transakcna_dan")}
                      disabled={busy}
                      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
                    >
                      {t("Označiť ako transakčná daň")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Link
                to="/uctovnictvo/pravidla"
                search={
                  hladaniePravidlaZPohybu({
                    suma,
                    protistrana: p.counterparty,
                    protiucet: p.counterparty_iban,
                    vs: p.variable_symbol,
                  }) as never
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-primary hover:bg-secondary"
              >
                <Wand2 className="h-4 w-4" /> {t("Vytvoriť pravidlo z tohto pohybu")}
              </Link>
              <button
                onClick={onClose}
                className="h-9 rounded-md border border-border px-3 text-sm hover:bg-secondary"
              >
                {t("Zavrieť")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
