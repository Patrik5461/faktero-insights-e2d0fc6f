/*
  Pozvánky do cudzích firiem, ktoré čakajú na prihláseného človeka.
  Okrem odkazu v e-maile sa dajú prijať alebo odmietnuť priamo vo webe:
  pás nad obsahom stránky (aj na onboardingu, keď človek ešte firmu nemá)
  a položka v zvončeku. Oba miesta zdieľajú jeden zoznam cez udalosť.
*/
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  mojePozvankyFn,
  odmietnutMojuPozvankuFn,
  prijatMojuPozvankuFn,
  type MojaPozvanka,
} from "@/lib/faktero/invitations.functions";
import { oznamZmenuFiriem, setActiveCompanyId } from "@/lib/faktero/active-company";
import { popisRoly } from "@/lib/faktero/rola-popis";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

const POZVANKY_ZMENENE = "faktero:pozvanky-zmenene";
/** Pozvánka nehorí — stačí sa pozrieť pri návrate na kartu a raz za pár minút. */
const OBNOVA_MS = 5 * 60 * 1000;

export function useMojePozvanky() {
  const nacitaj = useServerFn(mojePozvankyFn);
  const [pozvanky, setPozvanky] = useState<MojaPozvanka[]>([]);

  const obnov = useCallback(async () => {
    try {
      setPozvanky(await nacitaj());
    } catch {
      // Vedľajšia vec — nesmie zhodiť hlavičku ani stránku.
    }
  }, [nacitaj]);

  useEffect(() => {
    obnov();
    const casovac = setInterval(obnov, OBNOVA_MS);
    const naKarte = () => {
      if (document.visibilityState === "visible") obnov();
    };
    window.addEventListener(POZVANKY_ZMENENE, obnov);
    document.addEventListener("visibilitychange", naKarte);
    return () => {
      clearInterval(casovac);
      window.removeEventListener(POZVANKY_ZMENENE, obnov);
      document.removeEventListener("visibilitychange", naKarte);
    };
  }, [obnov]);

  return { pozvanky, obnov };
}

/** Tlačidlá Prijať / Odmietnuť pre jednu pozvánku. */
function AkciePozvanky({
  p,
  poPrijati,
  male,
}: {
  p: MojaPozvanka;
  /** `prepnut` = človek ešte nemá firmu, rovno ho do nej pustíme. */
  poPrijati: "prepnut" | "ponuknut";
  male?: boolean;
}) {
  const { t } = useT();
  const prijat = useServerFn(prijatMojuPozvankuFn);
  const odmietnut = useServerFn(odmietnutMojuPozvankuFn);
  const [beh, setBeh] = useState<"prijat" | "odmietnut" | null>(null);

  async function naPrijat() {
    setBeh("prijat");
    try {
      const r = await prijat({ data: { id: p.id } });
      window.dispatchEvent(new Event(POZVANKY_ZMENENE));
      if (poPrijati === "prepnut") {
        setActiveCompanyId(r.company_id);
        window.location.assign("/dashboard");
        return;
      }
      oznamZmenuFiriem();
      toast.success(t("Firma {firma} je pridaná medzi vaše firmy.", { firma: p.company_name }), {
        action: {
          label: t("Prepnúť do firmy"),
          onClick: () => {
            setActiveCompanyId(r.company_id);
            window.location.assign("/dashboard");
          },
        },
      });
    } catch (e: any) {
      toast.error(e?.message ?? t("Pozvánku sa nepodarilo prijať."));
      window.dispatchEvent(new Event(POZVANKY_ZMENENE));
    } finally {
      setBeh(null);
    }
  }

  async function naOdmietnut() {
    const ok = await potvrd(
      t("Odmietnuť pozvánku do firmy {firma}? Kto vás pozval, uvidí ju ako odmietnutú.", {
        firma: p.company_name,
      }),
      { potvrdit: t("Odmietnuť"), nebezpecne: true },
    );
    if (!ok) return;
    setBeh("odmietnut");
    try {
      await odmietnut({ data: { id: p.id } });
      toast.success(t("Pozvánka je odmietnutá."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Pozvánku sa nepodarilo odmietnuť."));
    } finally {
      setBeh(null);
      window.dispatchEvent(new Event(POZVANKY_ZMENENE));
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button size={male ? "sm" : "default"} onClick={naPrijat} disabled={beh !== null}>
        {beh === "prijat" && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("Prijať pozvánku")}
      </Button>
      <Button
        size={male ? "sm" : "default"}
        variant="outline"
        onClick={naOdmietnut}
        disabled={beh !== null}
      >
        {beh === "odmietnut" && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("Odmietnuť")}
      </Button>
    </div>
  );
}

function textPozvanky(p: MojaPozvanka, t: ReturnType<typeof useT>["t"]) {
  return p.pozval
    ? t("{kto} vás pozval do firmy {firma} s rolou {rola}.", {
        kto: p.pozval,
        firma: p.company_name,
        rola: t(popisRoly(p.role)),
      })
    : t("Máte pozvánku do firmy {firma} s rolou {rola}.", {
        firma: p.company_name,
        rola: t(popisRoly(p.role)),
      });
}

/** Pás nad obsahom stránky — kým pozvánku neprijme alebo neodmietne. */
export function PozvankyPas({ bezFirmy = false }: { bezFirmy?: boolean }) {
  const { t } = useT();
  const { pozvanky } = useMojePozvanky();
  if (!pozvanky.length) return null;
  return (
    <section
      aria-label={t("Pozvánky do firiem")}
      className={bezFirmy ? "mt-6 space-y-3" : "space-y-2 border-b border-primary/20 bg-primary/5 px-4 py-3 sm:px-6"}
    >
      {pozvanky.map((p) => (
        <div
          key={p.id}
          className={`flex flex-col gap-3 sm:flex-row sm:items-center ${
            bezFirmy ? "rounded-xl border border-primary/30 bg-primary/5 p-4" : ""
          }`}
        >
          <Building2 className="hidden h-5 w-5 shrink-0 text-primary sm:block" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{t("Pozvánka do firmy")}</span>{" "}
            <span className="text-muted-foreground">{textPozvanky(p, t)}</span>
          </p>
          <AkciePozvanky p={p} poPrijati={bezFirmy ? "prepnut" : "ponuknut"} male={!bezFirmy} />
        </div>
      ))}
    </section>
  );
}

/** Položky do zvončeka (nad ostatnými notifikáciami). */
export function PozvankyVZvoncku({ pozvanky }: { pozvanky: MojaPozvanka[] }) {
  const { t } = useT();
  if (!pozvanky.length) return null;
  return (
    <>
      {pozvanky.map((p) => (
        <div key={p.id} className="flex gap-2.5 border-b border-border/60 bg-primary/5 px-3 py-2.5">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("Pozvánka do firmy {firma}", { firma: p.company_name })}</p>
            <p className="mb-2 text-xs text-muted-foreground">{textPozvanky(p, t)}</p>
            <AkciePozvanky p={p} poPrijati="ponuknut" male />
          </div>
        </div>
      ))}
    </>
  );
}
