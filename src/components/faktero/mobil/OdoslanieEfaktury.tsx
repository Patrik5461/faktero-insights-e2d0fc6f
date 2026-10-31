import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  Paperclip,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useOperacia } from "@/lib/mobile/server-most";
import { SERVER } from "@/lib/mobile/operacie";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  CESTA_AKTIVACIE,
  dovodBezServera,
  klucStavu,
  vyhodnotPripravu,
  type NalezAppky,
  type PripravaEfaktury,
  type StavOdoslania,
} from "@/lib/mobile/efaktura-odoslanie";
import { velkost } from "@/lib/faktero/faktura-prilohy";
import {
  EF_ODHAD_PDF,
  dovodNepovolenej,
  predvolenyVyber,
  skontrolujVyber,
  type PrilohaNaVyber,
} from "@/lib/faktero/efaktura/prilohy-efaktury";
import { VelkeTlacidlo } from "./MobilChrome";
import { useDatumPredOdoslanim } from "./datum-pred-odoslanim";
import { datum } from "./PrijateDoklady";

/**
 * „Odoslať eFaktúru“ v appke — po vystavení faktúry a v jej detaile.
 *
 * To isté ako okno na webe (`OdoslanieEfakturyOkno`): dátum vystavenia pred
 * prvým odoslaním, kontrola pred odoslaním (chyby blokujú), potvrdenie
 * (odoslanie sa nedá vziať späť), PDF faktúry a prílohy. Odosiela tá istá
 * serverová funkcia (`posliEfakturuFn`), ktorá všetko overí znova.
 *
 * Bez signálu sa eFaktúra do fronty **nezaraďuje** — ani e-mail sa z appky
 * naslepo neposiela a odoslanie do Peppolu sa nedá vziať späť; človek musí
 * vidieť kontrolu a potvrdiť ju. Povie sa mu, že to pôjde po pripojení.
 */
export function OdoslanieEfaktury({
  firmaId,
  faktura,
  onOdoslane,
}: {
  firmaId: string;
  faktura: { id: string; invoice_number: string; status: string; type: string };
  /** Po úspešnom odoslaní — volajúci si obnoví stav faktúry. */
  onOdoslane?: (r: { status: string; testovaci: boolean }) => void;
}) {
  const { t, locale: loc } = usePreklad();
  const pripravFn = useOperacia<PripravaEfaktury>("efaktura-priprav");
  const posliFn = useOperacia<{ documentId: string; status: string }>("efaktura-posli");
  const overDatum = useDatumPredOdoslanim();
  const [zistujem, setZistujem] = useState(false);
  const [okno, setOkno] = useState<{
    stav: StavOdoslania;
    priprava: PripravaEfaktury;
    potvrdenyStaryDatum: boolean;
  } | null>(null);
  const [vysledok, setVysledok] = useState<{ status: string; testovaci: boolean } | null>(null);

  const bezServera = dovodBezServera(faktura);
  if (bezServera?.skryt) return null;
  if (bezServera) {
    return (
      <p className="px-1 pt-1 text-[13px] text-app-text-2" data-efaktura="nedostupna">
        {t(bezServera.kluc)}
      </p>
    );
  }

  async function zacni() {
    setZistujem(true);
    try {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) {
        toast.error(t("efo.posli.bezSignalu"));
        return;
      }
      let p = await pripravFn({ data: { company_id: firmaId, invoice_id: faktura.id } });
      let stav = vyhodnotPripravu(p);
      let potvrdenyStaryDatum = false;
      /*
        Dátum vystavenia až keď sa dá odosielať — firme bez eFaktúry netreba
        meniť dátum. Zmena dátumu mení aj eFaktúru, preto kontrola znova.
      */
      if (stav.druh === "mozno") {
        const d = await overDatum(faktura.id);
        if (!d) return;
        potvrdenyStaryDatum = d.potvrdenyStaryDatum;
        if (d.zmenene) {
          p = await pripravFn({ data: { company_id: firmaId, invoice_id: faktura.id } });
          stav = vyhodnotPripravu(p);
        }
      }
      setOkno({ stav, priprava: p, potvrdenyStaryDatum });
    } catch (e: any) {
      toast.error(e?.message ?? t("efo.posli.chybaPripravy"));
    } finally {
      setZistujem(false);
    }
  }

  if (vysledok) {
    const kluc = klucStavu(vysledok.status);
    return (
      <VelkeTlacidlo
        icon={Check}
        label={vysledok.testovaci ? t("efo.posli.odoslanaTest") : t("efo.posli.odoslana")}
        hint={kluc ? t("efo.posli.stav", { stav: t(kluc) }) : undefined}
        disabled
        onClick={() => {}}
      />
    );
  }

  return (
    <>
      <VelkeTlacidlo
        icon={Send}
        label={zistujem ? t("efo.posli.overujem") : t("efo.posli.tlacidlo")}
        hint={t("efo.posli.popis")}
        disabled={zistujem}
        onClick={zacni}
      />
      {okno && (
        <OknoEfaktury
          firmaId={firmaId}
          faktura={faktura}
          stav={okno.stav}
          priprava={okno.priprava}
          potvrdenyStaryDatum={okno.potvrdenyStaryDatum}
          posliFn={posliFn}
          onZavriet={() => setOkno(null)}
          onOdoslane={(r) => {
            const testovaci = okno.priprava.testovaci;
            setOkno(null);
            setVysledok({ status: r.status, testovaci });
            /* V testovacom režime doklad do Peppolu nejde — povedať to, ako web. */
            if (testovaci) toast.warning(t("efo.posli.hotovoTest"), { duration: 10000 });
            else {
              const kluc = klucStavu(r.status);
              toast.success(t("efo.posli.hotovo", { stav: kluc ? t(kluc) : r.status }));
            }
            onOdoslane?.({ status: r.status, testovaci });
          }}
          datumOdoslania={(v) => datum(v, loc)}
        />
      )}
    </>
  );
}

function Nalezy({ nalezy, chyba }: { nalezy: NalezAppky[]; chyba: boolean }) {
  const { t } = usePreklad();
  if (!nalezy.length) return null;
  return (
    <ul
      className={`space-y-1.5 rounded-app-sm p-3 text-[13px] ${chyba ? "bg-app-chyba-jemna" : "bg-app-pozor-jemna"}`}
      data-efaktura={chyba ? "chyby" : "varovania"}
    >
      {nalezy.map((n, i) => (
        <li key={`${n.kod}-${i}`} className="flex gap-2">
          {chyba ? (
            <XCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-app-chyba"
              aria-label={t("efo.posli.chyba")}
            />
          ) : (
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-app-pozor"
              aria-label={t("efo.posli.varovanie")}
            />
          )}
          <span className="min-w-0 break-words">
            {n.text} <span className="font-mono text-[11px] text-app-text-2">{n.kod}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OknoEfaktury({
  firmaId,
  faktura,
  stav,
  priprava,
  potvrdenyStaryDatum,
  posliFn,
  onZavriet,
  onOdoslane,
  datumOdoslania,
}: {
  firmaId: string;
  faktura: { id: string; invoice_number: string };
  stav: StavOdoslania;
  priprava: PripravaEfaktury;
  potvrdenyStaryDatum: boolean;
  posliFn: (v: { data: any }) => Promise<{ documentId: string; status: string }>;
  onZavriet: () => void;
  onOdoslane: (r: { documentId: string; status: string }) => void;
  datumOdoslania: (v: string) => string;
}) {
  const { t } = usePreklad();
  const zoznamFn = useOperacia("prilohy-zoznam");
  const [odosielam, setOdosielam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [sPdf, setSPdf] = useState(true);
  const [prilohy, setPrilohy] = useState<PrilohaNaVyber[] | null>(null);
  const [vybrane, setVybrane] = useState<string[]>([]);
  useZatvorNaEscape(odosielam ? null : onZavriet);
  const mozno = stav.druh === "mozno";

  useEffect(() => {
    if (!mozno) return;
    let zive = true;
    zoznamFn({ data: { druh: "invoice", dokladId: faktura.id } })
      .then((r: any) => {
        if (!zive) return;
        const zoznam = (r?.prilohy ?? []) as PrilohaNaVyber[];
        setPrilohy(zoznam);
        setVybrane(predvolenyVyber(zoznam, true));
      })
      .catch(() => zive && setPrilohy([]));
    return () => {
      zive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faktura.id, mozno]);

  const vyber = useMemo(
    () =>
      skontrolujVyber(
        sPdf ? EF_ODHAD_PDF : null,
        (prilohy ?? []).filter((p) => vybrane.includes(p.id)),
      ),
    [sPdf, vybrane, prilohy],
  );

  async function odosli() {
    setOdosielam(true);
    setChyba(null);
    try {
      const r = await posliFn({
        data: {
          company_id: firmaId,
          invoice_id: faktura.id,
          s_pdf: sPdf,
          prilohy: vybrane,
          potvrdeny_stary_datum: potvrdenyStaryDatum || undefined,
        },
      });
      onOdoslane(r);
    } catch (e: any) {
      setChyba(e?.message ?? t("efo.posli.chybaOdoslania"));
    } finally {
      setOdosielam(false);
    }
  }

  const test = priprava.testovaci;
  const nadpis =
    stav.druh === "neaktivna"
      ? t("efo.posli.neaktivnaNadpis")
      : stav.druh === "nedaSa"
        ? t("efo.posli.nedaSaNadpis")
        : stav.druh === "chyby"
          ? t("efo.posli.chybyNadpis")
          : test
            ? t("efo.posli.nadpisTest", { cislo: faktura.invoice_number })
            : t("efo.posli.nadpis", { cislo: faktura.invoice_number });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={() => !odosielam && onZavriet()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={nadpis}
        data-efaktura-stav={stav.druh}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full space-y-3 overflow-y-auto rounded-t-[20px] bg-app-karta p-4 text-app-text"
        style={{ paddingBottom: "calc(var(--safe-bottom, 0px) + 1rem)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[17px] font-bold leading-snug">{nadpis}</h3>
          <button
            onClick={onZavriet}
            disabled={odosielam}
            aria-label={t("efo.posli.zavriet")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-text-2 active:bg-app-ramik"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {stav.druh === "neaktivna" && (
          <>
            <p className="text-[14px] leading-snug text-app-text-2">{t("efo.posli.neaktivna")}</p>
            <button
              onClick={() => {
                window.open(`${SERVER}${CESTA_AKTIVACIE}`, "_blank");
                onZavriet();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-app-sm bg-app-zelena-plocha px-4 py-3 text-[15px] font-semibold text-white"
            >
              <ExternalLink className="h-4 w-4" /> {t("efo.posli.aktivovat")}
            </button>
          </>
        )}

        {stav.druh === "nedaSa" && (
          <p
            className="rounded-app-sm bg-app-chyba-jemna p-3 text-[14px] leading-snug"
            role="alert"
          >
            {stav.dovod}
          </p>
        )}

        {stav.druh === "chyby" && (
          <>
            <p className="text-[14px] leading-snug text-app-text-2">{t("efo.posli.chyby")}</p>
            <Nalezy nalezy={stav.kontrola.chyby} chyba />
            <Nalezy nalezy={stav.kontrola.varovania} chyba={false} />
          </>
        )}

        {stav.druh === "mozno" && (
          <>
            {test ? (
              <p className="rounded-app-sm bg-app-pozor-jemna p-3 text-[13px] leading-snug text-app-pozor">
                {t("efo.posli.testovaci")}
              </p>
            ) : (
              <p className="text-[14px] leading-snug text-app-text-2">{t("efo.posli.natrvalo")}</p>
            )}
            {stav.znova && priprava.dorucenie && (
              <p
                className="rounded-app-sm bg-app-pozor-jemna p-3 text-[13px] leading-snug text-app-pozor"
                data-efaktura="znova"
              >
                {priprava.dorucenie.sent_at
                  ? t("efo.posli.uzOdoslanaKedy", {
                      kedy: datumOdoslania(priprava.dorucenie.sent_at),
                    })
                  : t("efo.posli.uzOdoslana")}
              </p>
            )}
            {stav.kontrola && <Nalezy nalezy={stav.kontrola.varovania} chyba={false} />}

            <label className="flex items-start gap-3 rounded-app-sm border border-app-ramik p-3 text-[14px]">
              <input
                type="checkbox"
                checked={sPdf}
                disabled={odosielam}
                onChange={(e) => setSPdf(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[var(--app-zelena)]"
              />
              <span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <FileText className="h-4 w-4" aria-hidden="true" /> {t("efo.posli.pdf")}
                </span>
                <span className="block text-[12px] text-app-text-2">{t("efo.posli.pdfPopis")}</span>
              </span>
            </label>

            {prilohy === null ? (
              <p className="text-[12px] text-app-text-2">{t("efo.posli.nacitavamPrilohy")}</p>
            ) : prilohy.length > 0 ? (
              <fieldset className="space-y-2 rounded-app-sm border border-app-ramik p-3">
                <legend className="px-1 text-[13px] font-medium">
                  <Paperclip className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {t("efo.posli.prilohy")}
                </legend>
                {prilohy.map((p) => {
                  const dovod = dovodNepovolenej(p);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-start gap-3 text-[14px] ${dovod ? "text-app-text-2" : ""}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!!dovod || odosielam}
                        checked={!dovod && vybrane.includes(p.id)}
                        onChange={(e) =>
                          setVybrane((v) =>
                            e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id),
                          )
                        }
                        className="mt-0.5 h-5 w-5 accent-[var(--app-zelena)]"
                      />
                      <span className="min-w-0">
                        <span className="break-all">{p.name}</span>{" "}
                        <span className="text-[12px] text-app-text-2">{velkost(p.size)}</span>
                        {dovod && <span className="block text-[12px]">{dovod}</span>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ) : null}

            {vyber.chyby.length > 0 && (
              <div className="space-y-1 rounded-app-sm bg-app-chyba-jemna p-3 text-[13px] text-app-chyba">
                {vyber.chyby.map((c) => (
                  <p key={c}>{c}</p>
                ))}
              </div>
            )}
          </>
        )}

        {chyba && (
          <p
            role="alert"
            className="whitespace-pre-line rounded-app-sm bg-app-chyba-jemna p-3 text-[13px] text-app-chyba"
          >
            {chyba}
          </p>
        )}

        {stav.druh === "mozno" ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={onZavriet}
              disabled={odosielam}
              className="rounded-app-sm border border-app-ramik px-4 py-3 text-[15px] disabled:opacity-50"
            >
              {t("efo.posli.zrusit")}
            </button>
            <button
              onClick={odosli}
              disabled={odosielam || prilohy === null || vyber.chyby.length > 0}
              className="rounded-app-sm bg-app-zelena-plocha px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {odosielam
                ? t("efo.posli.odosielam")
                : stav.znova
                  ? t("efo.posli.odoslatZnova")
                  : t("efo.posli.odoslat")}
            </button>
          </div>
        ) : stav.druh !== "neaktivna" ? (
          <button
            onClick={onZavriet}
            className="w-full rounded-app-sm border border-app-ramik px-4 py-3 text-[15px]"
          >
            {t("efo.posli.rozumiem")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
