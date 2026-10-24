import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, PanelLeft, X } from "lucide-react";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import { useT } from "@/lib/i18n/useT";

/** Súbor na náhľad — PDF kreslí pdf.js, obrázok (sken bločku, fotka) ide cez `<img>`. */
export type SuborNahladu = { url: string; obrazok?: boolean } | null;

const KLUC = "faktero.bocnyNahlad.";

/**
 * Zapamätaná voľba „Náhľad vedľa zoznamu“ — pri účtovaní ju má človek
 * zapnutú stále, tak nech ju nemusí zapínať pri každom príchode.
 */
export function useBocnyNahlad(zoznam: string) {
  const [zapnuty, setZapnuty] = useState(false);
  const [vybrany, setVybrany] = useState<string | null>(null);
  useEffect(() => {
    try {
      setZapnuty(window.localStorage.getItem(KLUC + zoznam) === "1");
    } catch {
      /* súkromný režim — voľba sa nezapamätá */
    }
  }, [zoznam]);
  function prepni(on: boolean) {
    setZapnuty(on);
    if (!on) setVybrany(null);
    try {
      window.localStorage.setItem(KLUC + zoznam, on ? "1" : "0");
    } catch {
      /* nič */
    }
  }
  /**
   * Na úzkej obrazovke sa náhľad vedľa zoznamu nezmestí — tam ťuknutie
   * na riadok ďalej otvára detail.
   */
  const aktivny = () =>
    zapnuty && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  return { zapnuty, prepni, vybrany, setVybrany, aktivny };
}

/** Prepínač nad zoznamom. */
export function PrepinacNahladu({
  zapnuty,
  prepni,
}: {
  zapnuty: boolean;
  prepni: (on: boolean) => void;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      aria-pressed={zapnuty}
      onClick={() => prepni(!zapnuty)}
      title={t(
        "Po kliknutí na riadok sa doklad ukáže vľavo vedľa zoznamu. Šípkami hore a dole prechádzate ďalšie.",
      )}
      className={`hidden items-center gap-1.5 rounded-md border px-3 py-2 text-sm lg:inline-flex ${
        zapnuty
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border hover:bg-secondary"
      }`}
    >
      <PanelLeft className="h-4 w-4" /> {t("Náhľad vedľa zoznamu")}
    </button>
  );
}

/**
 * Rozloženie zoznamu s náhľadom vľavo. Bez zapnutého náhľadu vráti len zoznam.
 *
 * `nacitaj` dostane id vybraného dokladu a vráti adresu súboru; volá sa pri
 * každej zmene výberu, staršia odpoveď sa zahodí.
 */
export function SNahladom({
  zapnuty,
  vybrany,
  nazov,
  nacitaj,
  onOtvorit,
  onZavriet,
  children,
}: {
  zapnuty: boolean;
  vybrany: string | null;
  nazov?: string | null;
  nacitaj: (id: string) => Promise<SuborNahladu>;
  onOtvorit: (id: string) => void;
  onZavriet: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  const [subor, setSubor] = useState<SuborNahladu>(null);
  const [stav, setStav] = useState<"prazdny" | "citam" | "hotovo" | "chyba">("prazdny");

  useEffect(() => {
    if (!zapnuty || !vybrany) {
      setSubor(null);
      setStav("prazdny");
      return;
    }
    let zive = true;
    setStav("citam");
    nacitaj(vybrany)
      .then((s) => {
        if (!zive) return;
        setSubor(s);
        setStav(s ? "hotovo" : "chyba");
      })
      .catch(() => zive && setStav("chyba"));
    return () => {
      zive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zapnuty, vybrany]);

  if (!zapnuty) return <>{children}</>;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-4">
      <aside
        aria-label={t("Náhľad dokladu")}
        className="sticky top-20 hidden h-[calc(100dvh-6rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:flex"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">
            {vybrany ? (nazov ?? t("Doklad")) : t("Náhľad dokladu")}
          </span>
          {vybrany && (
            <>
              <button
                type="button"
                onClick={() => onOtvorit(vybrany)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {t("Otvoriť detail")}
              </button>
              <button
                type="button"
                aria-label={t("Zavrieť náhľad")}
                onClick={onZavriet}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
          {stav === "prazdny" && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t(
                "Kliknite na doklad v zozname a ukáže sa tu. Šípkami hore a dole prejdete na ďalší.",
              )}
            </p>
          )}
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
              <img src={subor.url} alt={nazov ?? ""} className="mx-auto max-w-full" />
            ) : (
              <NahladPdf key={subor.url} url={subor.url} />
            )
          ) : null}
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Šípky hore/dole posúvajú výber v náhľade. Nereaguje, keď človek píše
 * do poľa, aby šípka v čísle či dátume robila to, čo má.
 */
export function useSipkyNahladu(
  aktivne: boolean,
  idcka: string[],
  vybrany: string | null,
  setVybrany: (id: string) => void,
) {
  useEffect(() => {
    if (!aktivne) return;
    function klaves(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const ciel = e.target as HTMLElement | null;
      if (ciel && (ciel.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ciel.tagName)))
        return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (!idcka.length) return;
      e.preventDefault();
      const i = vybrany ? idcka.indexOf(vybrany) : -1;
      const dalsi = e.key === "ArrowDown" ? Math.min(idcka.length - 1, i + 1) : Math.max(0, i - 1);
      const id = idcka[dalsi];
      setVybrany(id);
      document.querySelector(`[data-nahlad-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
    }
    window.addEventListener("keydown", klaves);
    return () => window.removeEventListener("keydown", klaves);
  }, [aktivne, idcka, vybrany, setVybrany]);
}

const KLUC_DETAIL = "faktero.detailNahlad";

/**
 * Náhľad PDF v detaile dokladu — predvolene zapnutý, kto ho skryje, tomu
 * ostane skrytý aj pri ďalšej faktúre.
 */
export function useNahladVDetaile() {
  const [zapnuty, setZapnuty] = useState(true);
  useEffect(() => {
    try {
      setZapnuty(window.localStorage.getItem(KLUC_DETAIL) !== "0");
    } catch {
      /* súkromný režim — ostáva zapnutý */
    }
  }, []);
  function prepni(on: boolean) {
    setZapnuty(on);
    try {
      window.localStorage.setItem(KLUC_DETAIL, on ? "1" : "0");
    } catch {
      /* nič */
    }
  }
  /** Široká obrazovka — len tam sa PDF zmestí vedľa údajov. */
  const siroka = () =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  return { zapnuty, prepni, siroka };
}

/**
 * Detail dokladu s PDF stále vľavo a údajmi vpravo (len na širokej
 * obrazovke). Bez náhľadu vráti obsah tak, ako bol.
 */
export function DetailSNahladom({
  zobrazit,
  subor,
  nazov,
  onSkryt,
  akcie,
  children,
}: {
  zobrazit: boolean;
  /** `undefined` = ešte sa načítava, `null` = súbor nie je. */
  subor: SuborNahladu | undefined;
  nazov?: string | null;
  onSkryt: () => void;
  akcie?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useT();
  if (!zobrazit) return <>{children}</>;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside
        aria-label={t("Náhľad dokladu")}
        className="sticky top-20 hidden h-[calc(100dvh-6rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:flex"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">
            {nazov ?? t("Náhľad dokladu")}
          </span>
          {akcie}
          <button
            type="button"
            aria-label={t("Skryť náhľad")}
            title={t("Skryť náhľad")}
            onClick={onSkryt}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
          {subor === undefined ? (
            <div className="flex justify-center p-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : subor === null ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t("K dokladu nie je súbor na náhľad.")}
            </p>
          ) : subor.obrazok ? (
            <img src={subor.url} alt={nazov ?? ""} className="mx-auto max-w-full" />
          ) : (
            <NahladPdf key={subor.url} url={subor.url} />
          )}
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
