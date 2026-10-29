import { useRef, useState } from "react";
import { CheckCircle2, FileCode2, Loader2, Upload, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { skontrolujEfakturu, type VysledokKontroly } from "@/lib/faktero/efaktura/kontrola";
import { NalezyKontrolyEfaktury } from "@/components/faktero/NalezyKontrolyEfaktury";

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
  // Nová kontrola začne znova s filtrom „Všetko“.
  const [kolo, setKolo] = useState(0);

  const mb = Math.round(maxVelkost / 1024 / 1024);

  const skontroluj = (xml: string, meno: string | null) => {
    setChyba(null);
    setPracujem(true);
    setNazov(meno);
    setKolo((k) => k + 1);
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
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
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

          <NalezyKontrolyEfaktury
            key={kolo}
            nalezy={vysledok.nalezy}
            pocetChyb={vysledok.pocetChyb}
            pocetVarovani={vysledok.pocetVarovani}
          />
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
