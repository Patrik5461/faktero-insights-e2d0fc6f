import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { whatsappPrepojZakaznikaFn } from "@/lib/faktero/whatsapp.functions";
import { useWhatsAppPodpora, useWhatsAppVerejne } from "@/hooks/useWhatsAppPodpora";
import { cisloNaZobrazenie, odkazNaWhatsApp } from "@/lib/faktero/whatsapp";
import { WhatsAppIkona } from "./WhatsAppIkona";

/**
 * Prepojenie čísla s účtom — požiadavky z WhatsAppu potom podpora vidí pri ňom.
 * Po kliknutí odkaz wa.me s predvyplneným jednorazovým kódom; stačí ho odoslať.
 */
function WhatsAppPrepojenie({ prepojeny }: { prepojeny: boolean }) {
  const { t } = useT();
  const prepojFn = useServerFn(whatsappPrepojZakaznikaFn);
  const [odkaz, setOdkaz] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function prepoj() {
    setBusy(true);
    try {
      setOdkaz((await prepojFn()).odkaz);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (prepojeny)
    return <span className="text-xs">{t("WhatsApp je prepojený s vaším účtom.")}</span>;
  if (odkaz)
    return (
      <a
        href={odkaz}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary hover:underline"
        title={t("Odošlite predvyplnenú správu s kódom — platí 10 minút.")}
      >
        {t("Otvoriť WhatsApp a prepojiť s účtom")}
      </a>
    );
  return (
    <button
      type="button"
      onClick={prepoj}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
      title={t("Požiadavky z WhatsAppu sa priradia k vášmu účtu.")}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {t("Prepojiť s mojím účtom")}
    </button>
  );
}

/**
 * Výrazné tlačidlo „Napíšte nám na WhatsApp“ do hlavičky stránky Pomoc
 * a podpora, vedľa Telegramu. Ukáže sa, len keď je integrácia zapnutá.
 */
export function WhatsAppTlacidlo() {
  const { t } = useT();
  const info = useWhatsAppPodpora();
  if (!info?.cislo) return null;

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 lg:items-end">
      <a
        href={odkazNaWhatsApp(info.cislo, t("Dobrý deň, potrebujem pomoc s Fakterom."))}
        target="_blank"
        rel="noopener noreferrer"
        data-whatsapp-tlacidlo=""
        className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-primary/40 bg-card px-4 text-sm font-medium text-foreground shadow-sm transition hover:border-primary hover:bg-secondary"
      >
        <WhatsAppIkona className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="truncate">{t("Napíšte nám na WhatsApp")}</span>
      </a>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground lg:justify-end">
        <span>{cisloNaZobrazenie(info.cislo)}</span>
        <span aria-hidden>·</span>
        <WhatsAppPrepojenie prepojeny={info.prepojeny} />
      </div>
    </div>
  );
}

/** Malý odkaz v päte stránky Pomoc a podpora, vedľa e-mailu, telefónu a Telegramu. */
export function WhatsAppOdkaz() {
  const { t } = useT();
  const info = useWhatsAppPodpora();
  if (!info?.cislo) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <a
        href={odkazNaWhatsApp(info.cislo, t("Dobrý deň, potrebujem pomoc s Fakterom."))}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-foreground"
      >
        <WhatsAppIkona className="h-4 w-4" /> {t("Napíšte nám na WhatsApp")}
      </a>
      <WhatsAppPrepojenie prepojeny={info.prepojeny} />
    </span>
  );
}

/**
 * Odkaz na WhatsApp podpory na verejnom webe (pätička, Kontakt, plávajúca
 * „Pomoc“). Bez prihlásenia — o zapnutí rozhodne verejná serverová funkcia;
 * kým integrácia nie je zapnutá, nič sa neukáže.
 */
export function WhatsAppVerejnyOdkaz({
  className,
  ikona = "h-4 w-4",
  sCislom = true,
}: {
  className?: string;
  ikona?: string;
  /** `false` = len „WhatsApp“ (úzke tlačidlá v plávajúcom okne). */
  sCislom?: boolean;
}) {
  const { t } = useT();
  const cislo = useWhatsAppVerejne();
  if (!cislo) return null;
  return (
    <a
      href={odkazNaWhatsApp(cislo, t("Dobrý deň, potrebujem pomoc s Fakterom."))}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <WhatsAppIkona className={ikona} />
      {sCislom ? `WhatsApp ${cisloNaZobrazenie(cislo)}` : "WhatsApp"}
    </a>
  );
}
