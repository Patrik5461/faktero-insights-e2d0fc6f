import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardList, Lock } from "lucide-react";
import { RozpisDph } from "@/components/faktero/RozpisDph";
import type { SkupinaRozpisu } from "@/lib/faktero/rozpis-dph";
import type { StavZauctovania } from "@/lib/faktero/udaje-pre-uctovnika";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujCislo, formatujMenu } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";

/**
 * Šírka, pri ktorej je PDF vedľa údajov (rovnaká hranica ako v
 * DetailSNahladom). Na užšej obrazovke sa PDF nekreslí, preto detail
 * ostáva v pôvodnom rozložení so všetkými údajmi rozbalenými.
 */
export function useSirokaPreNahlad() {
  const [siroka, setSiroka] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const zmena = () => setSiroka(mq.matches);
    zmena();
    mq.addEventListener("change", zmena);
    return () => mq.removeEventListener("change", zmena);
  }, []);
  return siroka;
}

export type UdajeUctovnika = {
  cislo: string | null | undefined;
  /** Druh dokladu, už preložený. */
  druh: string;
  /** „Odberateľ“ pri vystavenej, „Dodávateľ“ pri prijatej. */
  stranaNadpis: "Odberateľ" | "Dodávateľ";
  strana: {
    nazov: string | null | undefined;
    ico?: string | null;
    dic?: string | null;
    icDph?: string | null;
  };
  /** Napr. odkaz „Zmeniť“ pri odberateľovi. */
  stranaDoplnok?: ReactNode;
  vystavenie: string | null | undefined;
  /** Dátum dodania (DUZP); prázdny = ako vystavenie. */
  dodanie: string | null | undefined;
  /** Popis splatnosti (popisSplatnosti), aj s predĺžením. */
  splatnost: string | null | undefined;
  vs: string | null | undefined;
  /** Forma úhrady, už preložená. */
  formaUhrady: string | null | undefined;
  mena: string;
  /** Kurz pri cudzej mene. */
  kurz?: number | null;
  kurzDatum?: string | null;
  rozpis: SkupinaRozpisu[];
  zaklad: number;
  dph: number;
  /** Zľava na doklad (kladné číslo). */
  zlava?: number | null;
  /** Odpočítaná záloha (kladné číslo); s ňou sa ukáže aj `kUhrade`. */
  zaloha?: number | null;
  kUhrade?: number | null;
  spolu: number;
  /** Úprava sumy na zobrazenie (dobropis bez mínusu). */
  naZobrazenie?: (n: number) => number;
  /** Režim DPH — kľúče pre t() (rezimDphVystavenej / rezimDphPrijatej). */
  rezimy: string[];
  uhrada: {
    uhradena: boolean;
    datum?: string | null;
    zostava?: number | null;
    ciastocne?: boolean;
    /** Stornovaný doklad alebo návrh — úhrada sa neukazuje. */
    bezUhrady?: boolean;
  };
  zauctovanie?:
    | (StavZauctovania & {
        predkontacia?: string | null;
        clenenie?: string | null;
        kv?: string | null;
      })
    | null;
};

/**
 * Kompaktná karta „Údaje pre účtovníka“ vpravo od náhľadu PDF — protistrana,
 * dátumy, VS, sumy podľa sadzieb, režim DPH, úhrada a zaúčtovanie v hustej
 * mriežke štítok → hodnota. Spoločná pre vystavenú aj prijatú faktúru.
 */
export function UdajePreUctovnika({ u }: { u: UdajeUctovnika }) {
  const { t } = useT();
  const z = u.naZobrazenie ?? ((n: number) => n);
  const suma = (n: number) => formatujMenu(z(n), u.mena);
  const cudzia = u.kurz != null && Number(u.kurz) > 0 && u.mena !== "EUR";

  return (
    <section
      aria-label={t("Údaje pre účtovníka")}
      className="@container min-w-0 rounded-xl border border-border bg-card p-4 text-sm"
    >
      <h2 className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" /> {t("Údaje pre účtovníka")}
      </h2>

      <dl className="mt-2 grid grid-cols-1 gap-x-6 @md:grid-cols-2">
        <Udaj popis={t("Číslo dokladu")}>{u.cislo || "—"}</Udaj>
        <Udaj popis={t("Druh")}>{u.druh}</Udaj>
        <Udaj
          popis={
            <span className="inline-flex items-center gap-2">
              {t(u.stranaNadpis)}
              {u.stranaDoplnok}
            </span>
          }
          cela
        >
          {u.strana.nazov || "—"}
        </Udaj>
        <Udaj popis={t("IČO")}>{u.strana.ico || "—"}</Udaj>
        <Udaj popis={t("DIČ")}>{u.strana.dic || "—"}</Udaj>
        <Udaj popis={t("IČ DPH")}>{u.strana.icDph || "—"}</Udaj>
        <Udaj popis={t("Vystavenie")}>{datumNaDoklade(u.vystavenie)}</Udaj>
        <Udaj popis={t("Dodanie (DUZP)")}>{datumNaDoklade(u.dodanie || u.vystavenie)}</Udaj>
        <Udaj popis={t("Splatnosť")}>{u.splatnost || "—"}</Udaj>
        <Udaj popis={t("VS")}>
          <span className="font-mono">{u.vs || "—"}</span>
        </Udaj>
        <Udaj popis={t("Forma úhrady")}>{u.formaUhrady || "—"}</Udaj>
        <Udaj popis={t("Mena")}>
          {u.mena}
          {cudzia
            ? ` · ${t("kurz {kurz}", { kurz: formatujCislo(u.kurz, 2, 4) })}${
                u.kurzDatum ? ` (${datumNaDoklade(u.kurzDatum)})` : ""
              }`
            : ""}
        </Udaj>
        {u.rezimy.length ? (
          <Udaj popis={t("Režim DPH")} cela>
            {u.rezimy.map((r) => t(r)).join(" · ")}
          </Udaj>
        ) : null}
      </dl>

      {/* Sumy: rozpis podľa sadzieb a spolu. */}
      <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2">
        <RozpisDph skupiny={u.rozpis} mena={u.mena} naZobrazenie={z} />
        <div className="mt-1 space-y-0.5 tabular-nums">
          {u.zlava && Number(u.zlava) > 0 ? (
            <Suma popis={t("Zľava")} hodnota={`−${formatujMenu(u.zlava, u.mena)}`} />
          ) : null}
          <Suma popis={t("Základ dane")} hodnota={suma(u.zaklad)} />
          <Suma popis={t("DPH")} hodnota={suma(u.dph)} />
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1 font-semibold">
            <span>{t("Spolu")}</span>
            <span className="text-right">{suma(u.spolu)}</span>
          </div>
          {u.zaloha && Number(u.zaloha) > 0 ? (
            <>
              <Suma popis={t("Zúčtovaná záloha")} hodnota={`−${formatujMenu(u.zaloha, u.mena)}`} />
              {u.kUhrade != null ? (
                <div className="flex items-baseline justify-between gap-3 font-semibold">
                  <span>{t("Spolu k úhrade")}</span>
                  <span className="text-right">{suma(u.kUhrade)}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-6 @md:grid-cols-2">
        {!u.uhrada.bezUhrady ? (
          <Udaj popis={t("Úhrada")} cela>
            {u.uhrada.uhradena ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {u.uhrada.datum
                  ? t("Uhradená {datum}", { datum: datumNaDoklade(u.uhrada.datum) })
                  : t("Uhradená")}
              </span>
            ) : (
              <>
                {t("Zostáva uhradiť {suma}", {
                  suma: formatujMenu(u.uhrada.zostava ?? z(u.spolu), u.mena),
                })}
                {u.uhrada.ciastocne ? ` · ${t("čiastočne uhradená")}` : ""}
              </>
            )}
          </Udaj>
        ) : null}
        {u.zauctovanie ? (
          <>
            <Udaj popis={t("Predkontácia")}>
              <span className="font-mono">{u.zauctovanie.predkontacia || "—"}</span>
            </Udaj>
            <Udaj popis={t("Členenie DPH")}>
              <span className="font-mono">{u.zauctovanie.clenenie || "—"}</span>
            </Udaj>
            {u.zauctovanie.kv ? (
              <Udaj popis={t("Členenie KV DPH")}>
                <span className="font-mono">{u.zauctovanie.kv}</span>
              </Udaj>
            ) : null}
            <Udaj popis={t("Zaúčtovanie")} cela={!u.zauctovanie.kv}>
              <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5">
                {t(u.zauctovanie.text)}
                {u.zauctovanie.kedy ? ` ${datumNaDoklade(u.zauctovanie.kedy)}` : ""}
                {u.zauctovanie.zamknute ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-muted-foreground"
                    title={t("Doklad je zamknutý proti úpravám")}
                  >
                    <Lock className="h-3 w-3" /> {t("zamknutá")}
                  </span>
                ) : null}
              </span>
            </Udaj>
          </>
        ) : null}
      </dl>
    </section>
  );
}

function Udaj({
  popis,
  cela,
  children,
}: {
  popis: ReactNode;
  cela?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 items-baseline justify-between gap-3 border-b border-border/50 py-1 ${
        cela ? "@md:col-span-2" : ""
      }`}
    >
      <dt className="shrink-0 text-muted-foreground">{popis}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

function Suma({ popis, hodnota }: { popis: string; hodnota: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{popis}</span>
      <span className="text-right">{hodnota}</span>
    </div>
  );
}
