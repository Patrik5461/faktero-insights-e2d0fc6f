import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import {
  NAZVY_KATEGORII,
  odkazNaPravidlo,
  skontrolujEfakturu,
  type NalezKontroly,
  type VysledokKontroly,
} from "@/lib/faktero/efaktura/kontrola";

type Filter = "vsetko" | "chyba" | "varovanie";

const OBLASTI: Record<NalezKontroly["oblast"], string> = {
  xml: "XML",
  en16931: "EN 16931",
  peppol: "Peppol BIS",
  sk: "Slovensko",
};

/**
 * Kontrola e-faktúry — nahratie UBL XML a zoznam chýb a varovaní.
 *
 * Všetko beží v prehliadači (`skontrolujEfakturu`), súbor sa nikam
 * neposiela ani neukladá. Rovnaký komponent používa aplikácia aj verejná
 * stránka /nastroje/kontrola-efaktury, líši sa len strop veľkosti.
 */
export function KontrolaEfaktury({ maxVelkost }: { maxVelkost: number }) {
  const { t } = useT();
  const vstup = useRef<HTMLInputElement>(null);
  const [vysledok, setVysledok] = useState<VysledokKontroly | null>(null);
  const [nazov, setNazov] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracujem, setPracujem] = useState(false);
  const [tahanie, setTahanie] = useState(false);
  const [vlozit, setVlozit] = useState(false);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("vsetko");

  const mb = Math.round(maxVelkost / 1024 / 1024);

  const skontroluj = (xml: string, meno: string | null) => {
    setChyba(null);
    setPracujem(true);
    setNazov(meno);
    setFilter("vsetko");
    // Prenechá prehliadaču vykresliť „Kontrolujem…“ pred dlhším výpočtom.
    setTimeout(() => {
      try {
        setVysledok(skontrolujEfakturu(xml));
      } catch {
        setVysledok(null);
        setChyba(t("Súbor sa nepodarilo skontrolovať."));
      } finally {
        setPracujem(false);
      }
    }, 10);
  };

  const nacitajSubor = async (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > maxVelkost) {
      setVysledok(null);
      setChyba(t("Súbor je väčší ako {mb} MB.", { mb }));
      return;
    }
    skontroluj(await f.text(), f.name);
  };

  const zobrazene = (vysledok?.nalezy ?? []).filter(
    (n) => filter === "vsetko" || n.zavaznost === filter,
  );

  const popisNalezu = (n: NalezKontroly) => {
    const p: Record<string, string | number> = { ...n.parametre };
    if (n.kategoria) {
      const nazovKat = NAZVY_KATEGORII[n.kategoria];
      p.kat = nazovKat ? `${n.kategoria} (${t(nazovKat)})` : n.kategoria;
    }
    return t(n.popis, p);
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setTahanie(true);
        }}
        onDragLeave={() => setTahanie(false)}
        onDrop={(e) => {
          e.preventDefault();
          setTahanie(false);
          void nacitajSubor(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          tahanie ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <FileCode2 className="mx-auto h-9 w-9 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">{t("Pretiahnite sem XML e-faktúry")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("UBL 2.1 Invoice alebo CreditNote (Peppol BIS Billing 3.0), najviac {mb} MB.", { mb })}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => vstup.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Upload className="h-4 w-4" /> {t("Vybrať súbor")}
          </button>
          <button
            type="button"
            onClick={() => setVlozit((v) => !v)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            {t("Vložiť XML ako text")}
          </button>
        </div>
        <input
          ref={vstup}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => {
            void nacitajSubor(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          {t("Súbor sa kontroluje len vo vašom prehliadači — nikam sa neodosiela ani neukladá.")}
        </p>
      </div>

      {vlozit && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={
              '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" …'
            }
            aria-label={t("XML e-faktúry")}
            className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
          />
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => {
              if (text.length > maxVelkost) setChyba(t("Súbor je väčší ako {mb} MB.", { mb }));
              else skontroluj(text, null);
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("Skontrolovať")}
          </button>
        </div>
      )}

      {pracujem && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Kontrolujem…")}
        </p>
      )}
      {chyba && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {chyba}
        </p>
      )}

      {vysledok && !pracujem && (
        <section aria-live="polite" className="space-y-4">
          <div
            className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 ${
              vysledok.platny
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-destructive/40 bg-destructive/10"
            }`}
          >
            {vysledok.platny ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-6 w-6 shrink-0 text-destructive" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {vysledok.platny
                  ? vysledok.pocetVarovani
                    ? t("Bez chýb, {n} varovaní", { n: vysledok.pocetVarovani })
                    : t("Bez chýb a varovaní")
                  : t("Chyby: {c}, varovania: {v}", {
                      c: vysledok.pocetChyb,
                      v: vysledok.pocetVarovani,
                    })}
              </p>
              <p className="mt-0.5 break-all text-xs text-muted-foreground">
                {nazov ? `${nazov} · ` : ""}
                {t("skontrolovaných pravidiel: {n}", { n: vysledok.pocetPravidiel })}
              </p>
            </div>
          </div>

          {vysledok.suhrn && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-2">
              {(
                [
                  [
                    t("Doklad"),
                    vysledok.suhrn.druh === "CreditNote"
                      ? t("Dobropis (CreditNote)")
                      : t("Faktúra (Invoice)"),
                  ],
                  [t("Číslo"), vysledok.suhrn.cislo],
                  [t("Typ (UNCL 1001)"), vysledok.suhrn.typ],
                  [t("Dátum vystavenia"), vysledok.suhrn.datum],
                  [t("Predávajúci"), vysledok.suhrn.predavajuci],
                  [t("Kupujúci"), vysledok.suhrn.kupujuci],
                  [
                    t("Na úhradu"),
                    vysledok.suhrn.sumaNaUhradu != null &&
                    Number.isFinite(vysledok.suhrn.sumaNaUhradu)
                      ? `${vysledok.suhrn.sumaNaUhradu.toFixed(2)} ${vysledok.suhrn.mena ?? ""}`
                      : null,
                  ],
                  [t("Riadky"), String(vysledok.suhrn.pocetRiadkov)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-2">
                  <dt className="shrink-0 text-muted-foreground">{k}:</dt>
                  <dd className="min-w-0 break-words font-medium">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          )}

          {vysledok.nalezy.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1" role="tablist">
                {(
                  [
                    ["vsetko", t("Všetko ({n})", { n: vysledok.nalezy.length })],
                    ["chyba", t("Chyby ({n})", { n: vysledok.pocetChyb })],
                    ["varovanie", t("Varovania ({n})", { n: vysledok.pocetVarovani })],
                  ] as const
                ).map(([k, popis]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={filter === k}
                    onClick={() => setFilter(k)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      filter === k
                        ? "bg-primary text-primary-foreground"
                        : "border border-border hover:bg-secondary"
                    }`}
                  >
                    {popis}
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {zobrazene.map((n, i) => {
                  const odkaz = odkazNaPravidlo(n.kod);
                  return (
                    <li key={`${n.kod}-${i}`} className="flex gap-3 p-3 text-sm">
                      {n.zavaznost === "chyba" ? (
                        <XCircle
                          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                          aria-label={t("Chyba")}
                        />
                      ) : (
                        <AlertTriangle
                          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                          aria-label={t("Varovanie")}
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words">{popisNalezu(n)}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {odkaz ? (
                            <a
                              href={odkaz}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                            >
                              {n.kod} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span
                              className="font-mono font-semibold"
                              title={t("Vlastná kontrola Faktera")}
                            >
                              {n.kod}
                            </span>
                          )}
                          <span>{n.oblast === "sk" ? t("Slovensko") : OBLASTI[n.oblast]}</span>
                          {n.riadok != null && (
                            <span>
                              {t("riadok {r}, stĺpec {s}", { r: n.riadok, s: n.stlpec ?? 1 })}
                            </span>
                          )}
                        </div>
                        {n.cesta && (
                          <p className="break-all font-mono text-[11px] text-muted-foreground">
                            {n.cesta}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        {t(
          "Kontrola pokrýva najčastejšie pravidlá EN 16931 a Peppol BIS Billing 3.0 (povinné údaje, výpočty súm, DPH podľa kategórií, číselníky) a slovenské zvyklosti eFaktúry. Kódy začínajúce FAKTERO sú vlastné kontroly. Úplnú kontrolu schémou a schematronom robí poskytovateľ pri odoslaní.",
        )}
      </p>
    </div>
  );
}
