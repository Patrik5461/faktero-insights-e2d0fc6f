import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { jeAktualna, kolizia, koniecOdstavky, type Odstavka } from "@/lib/faktero/odstavky";

const OBNOVA_MS = 15 * 60_000;
const KLUC = "faktero.odstavka-zavreta.";

function zavreta(id: string): boolean {
  try {
    return localStorage.getItem(KLUC + id) === "1";
  } catch {
    return false;
  }
}

/**
 * Pás s plánovanými odstávkami služieb inštitúcií (Finančná správa,
 * slovensko.sk, poisťovne) — FAK-523. Ukazuje schválené odstávky od 3 dní
 * pred začiatkom do konca; človek ho môže zavrieť (pamätá si prehliadač).
 * Odstávka Finančnej správy tesne pred 25. dňom dostane upozornenie na
 * lehotu DPH. Chyba načítania (aj chýbajúca tabuľka) = nič.
 */
export function OdstavkyInstitucii() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const [odstavky, setOdstavky] = useState<Odstavka[]>([]);
  const [skryte, setSkryte] = useState<Record<string, true>>({});
  const vypnute = useRef(false);

  const nacitaj = useCallback(async () => {
    if (vypnute.current) return;
    try {
      const { data, error } = await (supabase as any)
        .from("odstavky_institucii")
        .select("id, zdroj, guid, institucia, sluzba, nazov, popis, url, zaciatok, koniec, stav, automaticky, created_at")
        .eq("stav", "schvalene")
        .or(`koniec.is.null,koniec.gte.${new Date(Date.now() - 24 * 3600_000).toISOString()}`)
        .order("zaciatok", { ascending: true })
        .limit(20);
      if (error) {
        if (error.code === "PGRST205" || error.code === "42P01") vypnute.current = true;
        return;
      }
      setOdstavky((data ?? []) as Odstavka[]);
    } catch {
      /* výpadok siete — skúsi sa pri ďalšej obnove */
    }
  }, []);

  useEffect(() => {
    void nacitaj();
    const obnova = window.setInterval(() => void nacitaj(), OBNOVA_MS);
    return () => window.clearInterval(obnova);
  }, [nacitaj]);

  const teraz = Date.now();
  const viditelne = odstavky.filter((o) => jeAktualna(o, teraz) && !skryte[o.id] && !zavreta(o.id));
  if (!viditelne.length) return null;

  const cas = (iso: string) =>
    new Date(iso).toLocaleString(loc, {
      timeZone: "Europe/Bratislava",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      {viditelne.slice(0, 3).map((o) => {
        const prebieha = Date.parse(o.zaciatok!) <= teraz;
        const doo = koniecOdstavky(o);
        const dph = kolizia(o) === "dph";
        return (
          <div
            key={o.id}
            role="status"
            data-odstavka={o.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-6 lg:px-8 ${prebieha || dph ? "dk-pozor" : "dk-info"}`}
          >
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong>
                {prebieha ? t("Prebieha odstávka") : t("Plánovaná odstávka")}: {o.sluzba || o.institucia}
              </strong>{" "}
              {o.sluzba && o.sluzba !== o.institucia ? `(${o.institucia}) ` : ""}
              {cas(o.zaciatok!)}
              {doo ? ` – ${cas(new Date(doo).toISOString())}` : ""}
              {dph ? ` · ${t("pred termínom podania DPH (25.) — podajte radšej skôr")}` : ""}
            </span>
            {o.url && (
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs underline"
              >
                {t("Oznam")} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              aria-label={t("Zavrieť")}
              title={t("Zavrieť")}
              className="rounded p-1 hover:bg-black/5"
              onClick={() => {
                try {
                  localStorage.setItem(KLUC + o.id, "1");
                } catch {
                  /* súkromný režim — skryje sa do obnovenia stránky */
                }
                setSkryte((s) => ({ ...s, [o.id]: true }));
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </>
  );
}
