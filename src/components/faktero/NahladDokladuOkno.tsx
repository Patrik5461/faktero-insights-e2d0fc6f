import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Eye, Loader2, X } from "lucide-react";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import { PanelNahladu } from "@/components/faktero/PanelNahladu";
import type { SuborNahladu } from "@/components/faktero/BocnyNahlad";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Náhľad dokladu v okne priamo zo zoznamu (C1-3) — bez opustenia zoznamu.
 *
 * Zoznam drží len id otvoreného dokladu (`useNahladOkna`) a poradie riadkov,
 * ako ich práve ukazuje (filter, triedenie). Šípky v okne a klávesy ←/→
 * prechádzajú na susedný doklad v tom istom poradí; Esc okno zavrie.
 *
 * PDF kreslí pdf.js (`NahladPdf`), sken/fotka ide cez `<img>`. Na úzkej
 * obrazovke je okno na celú obrazovku.
 *
 * Rozdiel oproti „Náhľad vedľa zoznamu" (`BocnyNahlad`): ten je trvalý stĺpec
 * pri účtovaní na širokom monitore, toto je rýchle pozretie odkiaľkoľvek,
 * aj z telefónu.
 */
export function useNahladOkna() {
  const [id, setId] = useState<string | null>(null);
  const otvor = useCallback((nove: string) => setId(nove), []);
  const zavri = useCallback(() => setId(null), []);
  return { id, otvor, zavri, setId };
}

export type NahladOkna = ReturnType<typeof useNahladOkna>;

/** Ikona oka do riadku zoznamu. Klik neotvorí detail riadku (stopPropagation). */
export function TlacidloNahladu({
  onClick,
  popis,
  className,
}: {
  onClick: () => void;
  /** Napr. číslo dokladu — do aria-label. */
  popis?: string | null;
  className?: string;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      title={t("Náhľad")}
      aria-label={popis ? t("Náhľad {cislo}", { cislo: popis }) : t("Náhľad dokladu")}
      data-nahlad-okno=""
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Eye className="h-4 w-4" />
    </button>
  );
}

type Stav = "citam" | "hotovo" | "chyba";

export function NahladDokladuOkno({
  okno,
  idcka,
  nacitaj,
  nazov,
  poznamka,
  onOtvorit,
}: {
  okno: NahladOkna;
  /** Id riadkov v poradí, ako ich zoznam práve ukazuje. */
  idcka: string[];
  /** Adresa súboru dokladu; `null` = doklad súbor nemá. */
  nacitaj: (id: string) => Promise<SuborNahladu>;
  nazov: (id: string) => string | null | undefined;
  poznamka?: (id: string) => string | null | undefined;
  /** Prechod na detail dokladu (okno sa pred tým zavrie). */
  onOtvorit?: (id: string) => void;
}) {
  const { t } = useT();
  const { id, zavri, setId } = okno;
  const [subor, setSubor] = useState<SuborNahladu>(null);
  const [stav, setStav] = useState<Stav>("citam");
  const panel = useRef<HTMLDivElement>(null);
  const nacitajRef = useRef(nacitaj);
  nacitajRef.current = nacitaj;

  const index = id ? idcka.indexOf(id) : -1;
  const predosle = index > 0 ? idcka[index - 1] : null;
  const dalsie = index >= 0 && index < idcka.length - 1 ? idcka[index + 1] : null;

  // Hooky nepodmienene (pravidlo ručne kreslených okien): `null` = zavreté.
  useZatvorNaEscape(id ? zavri : null);

  useEffect(() => {
    if (!id) return;
    let zive = true;
    setStav("citam");
    setSubor(null);
    nacitajRef
      .current(id)
      .then((s) => {
        if (!zive) return;
        setSubor(s);
        setStav(s ? "hotovo" : "chyba");
      })
      .catch(() => zive && setStav("chyba"));
    // Riadok v zozname za oknom sa posunie do výhľadu — po zatvorení je človek tam, kde skončil.
    document
      .querySelector<HTMLElement>(`[data-nahlad-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
    return () => {
      zive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    function klaves(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const ciel = e.target as HTMLElement | null;
      if (ciel && (ciel.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ciel.tagName)))
        return;
      const kam = e.key === "ArrowLeft" ? predosle : dalsie;
      if (!kam) return;
      e.preventDefault();
      setId(kam);
    }
    window.addEventListener("keydown", klaves);
    return () => window.removeEventListener("keydown", klaves);
  }, [id, predosle, dalsie, setId]);

  // Nový doklad začína hore, nie v polovici predošlého.
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [id]);

  if (!id) return null;
  const meno = nazov(id) || t("Doklad");
  const pozn = poznamka?.(id);
  const tlacidlo =
    "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-6"
      onClick={zavri}
    >
      <PanelNahladu
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("Náhľad {nazov}", { nazov: meno })}
        data-nahlad-dokladu-okno=""
        className="h-dvh w-full overflow-hidden bg-card shadow-xl sm:h-[calc(100dvh-3rem)] sm:max-w-4xl sm:rounded-xl"
        obsahClassName="bg-muted/30 p-2 sm:p-3"
        onClick={(e) => e.stopPropagation()}
        toolbar={
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-2 sm:p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{meno}</div>
              {pozn && <div className="truncate text-xs text-muted-foreground">{pozn}</div>}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={tlacidlo}
                disabled={!predosle}
                onClick={() => predosle && setId(predosle)}
                aria-label={t("Predchádzajúci doklad")}
                title={t("Predchádzajúci doklad (←)")}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {index >= 0 && (
                <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
                  {index + 1} / {idcka.length}
                </span>
              )}
              <button
                type="button"
                className={tlacidlo}
                disabled={!dalsie}
                onClick={() => dalsie && setId(dalsie)}
                aria-label={t("Ďalší doklad")}
                title={t("Ďalší doklad (→)")}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {onOtvorit && (
              <button
                type="button"
                className={tlacidlo}
                onClick={() => {
                  zavri();
                  onOtvorit(id);
                }}
                title={t("Otvoriť detail")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="max-sm:sr-only">{t("Otvoriť detail")}</span>
              </button>
            )}
            {subor && (
              <a
                href={subor.url}
                target="_blank"
                rel="noopener noreferrer"
                className={tlacidlo}
                title={t("Stiahnuť")}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="max-sm:sr-only">{t("Stiahnuť")}</span>
              </a>
            )}
            <button
              type="button"
              onClick={zavri}
              aria-label={t("Zavrieť")}
              className="rounded-md p-1.5 hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        }
      >
        {stav === "citam" && (
          <div className="flex justify-center p-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {stav === "chyba" && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t("K dokladu nie je súbor na náhľad.")}
          </p>
        )}
        {stav === "hotovo" && subor ? (
          subor.obrazok ? (
            <img src={subor.url} alt={meno} className="mx-auto block max-w-full" />
          ) : (
            <NahladPdf key={subor.url} url={subor.url} />
          )
        ) : null}
      </PanelNahladu>
    </div>
  );
}
