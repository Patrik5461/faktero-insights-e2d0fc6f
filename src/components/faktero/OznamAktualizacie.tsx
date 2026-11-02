import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Info, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import {
  casVBratislave,
  klucTrvania,
  klucVidenehoOkna,
  vyberOznam,
  type PlatformovyOznam,
  type StavOznamu,
} from "@/lib/faktero/oznam-aktualizacie";

/** Kedy sa táto stránka načítala — stránka spred konca aktualizácie má ešte staré vydanie. */
const NACITANE = Date.now();
const OBNOVA_MS = 60_000;
const TIK_MS = 10_000;

function videlOkno(id: string): boolean {
  try {
    return localStorage.getItem(klucVidenehoOkna(id)) === "1";
  } catch {
    return false;
  }
}

function zapamatajOkno(id: string) {
  try {
    localStorage.setItem(klucVidenehoOkna(id), "1");
  } catch {
    /* súkromné okno / plné úložisko — okno sa najviac ukáže znova */
  }
}

/**
 * Oznam o plánovanej aktualizácii (Admin → Oznamy, skript
 * scripts/oznam-aktualizacie.mjs). Načíta aktívne oznamy pri štarte, každých
 * 60 s a pri návrate do karty; čo ukázať, rozhoduje `vyberOznam`.
 * Chyba načítania (aj chýbajúca tabuľka pred aplikovaním migrácie) = nič.
 */
export function OznamAktualizacie() {
  const { t } = useT();
  const [oznamy, setOznamy] = useState<PlatformovyOznam[]>([]);
  const [teraz, setTeraz] = useState(() => Date.now());
  const [videne, setVidene] = useState<Record<string, true>>({});
  const vypnute = useRef(false);

  const nacitaj = useCallback(async () => {
    if (vypnute.current) return;
    try {
      const { data, error } = await supabase
        .from("platformove_oznamy")
        .select("id, typ, text, zaciatok, trvanie_min, plati_do, aktivny")
        .eq("aktivny", true)
        .order("zaciatok", { ascending: false })
        .limit(10);
      if (error) {
        // Tabuľka ešte neexistuje (migrácia neaplikovaná) — do konca relácie sa nepýtať.
        if (error.code === "PGRST205" || error.code === "42P01") vypnute.current = true;
        return;
      }
      setOznamy((data ?? []) as PlatformovyOznam[]);
      setTeraz(Date.now());
    } catch {
      /* výpadok siete — skúsi sa pri ďalšej obnove */
    }
  }, []);

  useEffect(() => {
    void nacitaj();
    const obnova = window.setInterval(() => void nacitaj(), OBNOVA_MS);
    const tik = window.setInterval(() => setTeraz(Date.now()), TIK_MS);
    const naNavrat = () => {
      if (document.visibilityState === "visible") void nacitaj();
    };
    document.addEventListener("visibilitychange", naNavrat);
    return () => {
      window.clearInterval(obnova);
      window.clearInterval(tik);
      document.removeEventListener("visibilitychange", naNavrat);
    };
  }, [nacitaj]);

  const stav = vyberOznam(oznamy, teraz, NACITANE, (id) => !!videne[id] || videlOkno(id));
  const zavriOkno =
    stav.faza === "pred" && stav.okno
      ? () => {
          zapamatajOkno(stav.oznam.id);
          setVidene((v) => ({ ...v, [stav.oznam.id]: true }));
        }
      : null;
  useZatvorNaEscape(zavriOkno);

  if (stav.faza === "nic") return null;

  return (
    <>
      <Pas stav={stav} />
      {zavriOkno && stav.faza === "pred" && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 dk-prekrytie p-4"
          onClick={zavriOkno}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="oznam-aktualizacie-nadpis"
            data-oznam-aktualizacie-okno
            className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="dk-pozor mt-0.5 shrink-0 rounded-full border p-2">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <h2 id="oznam-aktualizacie-nadpis" className="text-lg font-semibold">
                  {t("Plánovaná aktualizácia o {cas}", { cas: casVBratislave(stav.zaciatok) })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  <TextPred stav={stav} />
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("Po aktualizácii stačí obnoviť stránku.")}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={zavriOkno} autoFocus>
                {t("Rozumiem")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TextPred({ stav }: { stav: { oznam: PlatformovyOznam; zaciatok: number } }) {
  const { t } = useT();
  const o = stav.oznam;
  if (o.text?.trim()) return <>{o.text}</>;
  const n = Math.max(1, Math.round(o.trvanie_min || 1));
  return (
    <>
      {t("Aktualizácia o {cas} – Faktero bude {trvanie} nedostupné. Rozpísanú prácu si uložte.", {
        cas: casVBratislave(stav.zaciatok),
        trvanie: t(klucTrvania(n), { n }),
      })}
    </>
  );
}

function Pas({ stav }: { stav: Exclude<StavOznamu, { faza: "nic" }> }) {
  const { t } = useT();
  const zaklad =
    "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-6 lg:px-8";

  if (stav.faza === "po") {
    return (
      <div role="status" data-oznam-aktualizacie="po" className={`${zaklad} dk-uspech`}>
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 font-medium">{t("Faktero je aktualizované")}</span>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {t("Obnoviť stránku")}
        </Button>
      </div>
    );
  }
  if (stav.faza === "pocas") {
    return (
      <div role="status" data-oznam-aktualizacie="pocas" className={`${zaklad} dk-pozor`}>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="min-w-0 flex-1 font-medium">{t("Prebieha aktualizácia…")}</span>
      </div>
    );
  }
  if (stav.faza === "info") {
    return (
      <div role="status" data-oznam-aktualizacie="info" className={`${zaklad} dk-info`}>
        <Info className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">{stav.oznam.text}</span>
      </div>
    );
  }
  return (
    <div role="status" data-oznam-aktualizacie="pred" className={`${zaklad} dk-pozor`}>
      <CalendarClock className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <TextPred stav={stav} />
      </span>
    </div>
  );
}
