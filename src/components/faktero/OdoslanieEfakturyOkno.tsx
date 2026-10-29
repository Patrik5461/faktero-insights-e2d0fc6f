import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Paperclip, FileText, AlertTriangle } from "lucide-react";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { velkost } from "@/lib/faktero/faktura-prilohy";
import { prilohyFakturyFn } from "@/lib/faktero/faktura-prilohy.functions";
import {
  posliEfakturuFn,
  skontrolujPredOdoslanimFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import {
  KontrolaPredOdoslanimPanel,
  blokujeOdoslanie,
  type StavKontroly,
} from "@/components/faktero/KontrolaPredOdoslanim";
import { useAktualnyDatum } from "@/components/faktero/AktualnyDatumOkno";
import {
  EF_MAX_SPOLU,
  EF_MAX_SUBOROV,
  EF_ODHAD_PDF,
  dovodNepovolenej,
  predvolenyVyber,
  skontrolujVyber,
  type PrilohaNaVyber,
} from "@/lib/faktero/efaktura/prilohy-efaktury";

/**
 * Okno odoslania eFaktúry: potvrdenie (odoslanie sa nedá vziať späť),
 * „Priložiť PDF faktúry" a výber príloh dokladu. Limity ePoštáka sa
 * kontrolujú ešte pred odoslaním; server ich overí znova.
 *
 * Po otvorení sa faktúra skontroluje podľa pravidiel EN 16931 a Peppol BIS
 * (`skontrolujPredOdoslanimFn`) — pri chybe je Odoslať zablokované. Server
 * tú istú kontrolu spraví znova pri odoslaní.
 */
export function OdoslanieEfakturyOkno({
  companyId,
  invoiceId,
  cislo,
  test,
  onClose,
  onOdoslane,
  onZmenaDatumu,
}: {
  companyId: string;
  invoiceId: string;
  cislo: string;
  /** Testovací režim ePoštáka — odberateľovi nepríde nič. */
  test: boolean;
  onClose: () => void;
  onOdoslane: (r: { documentId: string; status: string }) => void;
  /** Dátum vystavenia sa pred odoslaním zmenil na dnes — nech si volajúci faktúru načíta znova. */
  onZmenaDatumu?: () => void;
}) {
  const { t } = useT();
  const nacitaj = useServerFn(prilohyFakturyFn);
  const posli = useServerFn(posliEfakturuFn);
  const skontroluj = useServerFn(skontrolujPredOdoslanimFn);
  const [stavKontroly, setStavKontroly] = useState<StavKontroly>({ druh: "nacitavam" });
  const [prilohy, setPrilohy] = useState<PrilohaNaVyber[] | null>(null);
  const [sPdf, setSPdf] = useState(true);
  const [vybrane, setVybrane] = useState<string[]>([]);
  const [odosielam, setOdosielam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  /*
    Prvé odoslanie len s dnešným dátumom vystavenia — kým sa to nevyrieši,
    okno eFaktúry sa neukáže. Zrušenie zavrie celé odosielanie.
  */
  const datumOkno = useAktualnyDatum();
  const [datumVyrieseny, setDatumVyrieseny] = useState(false);
  const [potvrdenyStaryDatum, setPotvrdenyStaryDatum] = useState(false);
  useEffect(() => {
    let zive = true;
    datumOkno.over(invoiceId).then((v) => {
      if (!zive) return;
      if (!v) return onClose();
      setPotvrdenyStaryDatum(v.potvrdenyStaryDatum);
      if (v.zmenene) onZmenaDatumu?.();
      setDatumVyrieseny(true);
    });
    return () => {
      zive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);
  useZatvorNaEscape(odosielam || !datumVyrieseny ? null : onClose);

  // Kontrola až po vyriešení dátumu — zmena dátumu vystavenia mení aj UBL.
  const [kolo, setKolo] = useState(0);
  useEffect(() => {
    if (!datumVyrieseny) return;
    let zive = true;
    setStavKontroly({ druh: "nacitavam" });
    skontroluj({ data: { company_id: companyId, invoice_ids: [invoiceId] } })
      .then((r) => {
        if (!zive) return;
        const v = r[invoiceId];
        if (!v) setStavKontroly({ druh: "nedaSa", dovod: t("Faktúra nepatrí tejto firme.") });
        else if (v.kontrola) setStavKontroly({ druh: "hotovo", kontrola: v.kontrola });
        else
          setStavKontroly({
            druh: "nedaSa",
            dovod: v.nedaSa ?? t("eFaktúru nie je možné odoslať."),
          });
      })
      .catch(
        (e) =>
          zive && setStavKontroly({ druh: "zlyhala", dovod: String((e as Error)?.message ?? e) }),
      );
    return () => {
      zive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datumVyrieseny, invoiceId, companyId, kolo]);

  useEffect(() => {
    let zive = true;
    nacitaj({ data: { druh: "invoice", dokladId: invoiceId } })
      .then((r) => {
        if (!zive) return;
        const zoznam = r.prilohy as PrilohaNaVyber[];
        setPrilohy(zoznam);
        setVybrane(predvolenyVyber(zoznam, true));
      })
      .catch(() => zive && setPrilohy([]));
    return () => {
      zive = false;
    };
  }, [invoiceId]);

  const kontrola = useMemo(
    () =>
      skontrolujVyber(
        sPdf ? EF_ODHAD_PDF : null,
        (prilohy ?? []).filter((p) => vybrane.includes(p.id)),
      ),
    [sPdf, vybrane, prilohy],
  );

  function prepni(id: string, zapnut: boolean) {
    setVybrane((v) => (zapnut ? [...v, id] : v.filter((x) => x !== id)));
  }

  async function odosli() {
    setOdosielam(true);
    setChyba(null);
    try {
      // Poradie príloh drží server (PDF prvé, potom poradie nahratia).
      const r: any = await posli({
        data: {
          company_id: companyId,
          invoice_id: invoiceId,
          s_pdf: sPdf,
          prilohy: vybrane,
          potvrdeny_stary_datum: potvrdenyStaryDatum || undefined,
        },
      });
      onOdoslane(r);
    } catch (e) {
      setChyba((e as Error).message);
    } finally {
      setOdosielam(false);
    }
  }

  if (!datumVyrieseny) return <>{datumOkno.okno}</>;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !odosielam && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Odoslať eFaktúru")}
        className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {test ? t("Odoslať eFaktúru (test)") : t("Odoslať eFaktúru")} {cislo}
        </h3>
        {test ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            {t(
              "eFaktúra beží v TESTOVACOM režime — faktúra odíde len do skúšobného prostredia a odberateľovi nepríde nič. Pošlite mu ju aj e-mailom.",
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("Faktúra odíde odberateľovi cez sieť Peppol a odoslanie sa nedá vziať späť.")}
          </p>
        )}

        <label className="flex items-start gap-2 rounded-md border border-border bg-secondary/30 p-3 text-sm">
          <input
            type="checkbox"
            checked={sPdf}
            onChange={(e) => setSPdf(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <FileText className="h-4 w-4" aria-hidden="true" /> {t("Priložiť PDF faktúry")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                "To isté PDF, ktoré ide e-mailom. Odberateľ si faktúru otvorí aj bez programu na eFaktúry.",
              )}
            </span>
          </span>
        </label>

        {prilohy === null ? (
          <p className="text-xs text-muted-foreground">{t("Načítavam prílohy…")}</p>
        ) : prilohy.length > 0 ? (
          <fieldset className="space-y-1.5 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              <Paperclip className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {t("Prílohy dokladu")}
            </legend>
            {prilohy.map((p) => {
              const dovod = dovodNepovolenej(p);
              return (
                <label
                  key={p.id}
                  className={`flex items-start gap-2 text-sm ${dovod ? "text-muted-foreground" : ""}`}
                >
                  <input
                    type="checkbox"
                    disabled={!!dovod || odosielam}
                    checked={!dovod && vybrane.includes(p.id)}
                    onChange={(e) => prepni(p.id, e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="break-all">{p.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">{velkost(p.size)}</span>
                    {dovod && <span className="block text-xs">{t(dovod)}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("Príloh: {n} z {max} · spolu približne {spolu} z {limit}", {
            n: kontrola.poradie.length,
            max: EF_MAX_SUBOROV,
            spolu: velkost(kontrola.spolu) || "0 B",
            limit: velkost(EF_MAX_SPOLU),
          })}
        </p>
        <KontrolaPredOdoslanimPanel stav={stavKontroly} onZnova={() => setKolo((k) => k + 1)} />

        {kontrola.chyby.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              {kontrola.chyby.map((c) => (
                <p key={c}>{t(c)}</p>
              ))}
            </div>
          </div>
        )}
        {chyba && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {chyba}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={odosielam}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {t("Zrušiť")}
          </button>
          <button
            onClick={odosli}
            disabled={
              odosielam ||
              prilohy === null ||
              kontrola.chyby.length > 0 ||
              blokujeOdoslanie(stavKontroly)
            }
            title={
              stavKontroly.druh === "hotovo" && !stavKontroly.kontrola.mozno
                ? t("Najprv opravte chyby z kontroly eFaktúry.")
                : undefined
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {odosielam
              ? t("Odosielam…")
              : test
                ? t("Odoslať eFaktúru (test)")
                : t("Odoslať eFaktúru")}
          </button>
        </div>
      </div>
    </div>
  );
}
