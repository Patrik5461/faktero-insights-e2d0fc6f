import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { vystavFakturuFn } from "@/lib/faktero/faktura-vystavenie.functions";
import {
  nacitajPrenos,
  spocitajZadarmo,
  zmazPrenos,
  type FakturaZadarmo,
} from "@/lib/faktero/faktura-zadarmo";
import { vytvorKonceptZPrenosu } from "@/lib/faktero/faktura-zadarmo-prenos";
import { formatujMenu } from "@/lib/faktero/mena";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";

/**
 * Karta na nástenke: človek si pred registráciou vystavil „Faktúru zadarmo“
 * a v onboardingu ju nepreniesol (alebo už firmu mal). Jedným kliknutím z nej
 * bude odberateľ v adresári a koncept faktúry.
 */
export function PrenosFakturyZadarmo() {
  const { t, jazyk } = useT();
  const [f, setF] = useState<FakturaZadarmo | null>(null);
  const [pracujem, setPracujem] = useState(false);
  const vystav = useServerFn(vystavFakturuFn);

  useEffect(() => {
    setF(nacitajPrenos());
  }, []);

  if (!f) return null;

  async function vytvor() {
    const cid = getActiveCompanyId();
    if (!cid || !f) return;
    setPracujem(true);
    try {
      const { invoiceId } = await vytvorKonceptZPrenosu(f, cid, vystav as any);
      zmazPrenos();
      toast.success(t("Koncept faktúry je pripravený."));
      window.location.assign(`/faktury/${invoiceId}`);
    } catch (e: any) {
      setPracujem(false);
      toast.error(e?.message ? t(e.message) : t("Koncept sa nepodarilo vytvoriť."));
    }
  }

  const spolu = spocitajZadarmo(f).spolu;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-medium">{t("Faktúra, ktorú ste vytvorili pred registráciou")}</div>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">
            {f.cislo} · {f.odberatel.nazov} · {formatujMenu(spolu, f.mena, lokalJazyka(jazyk))}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={vytvor}
          disabled={pracujem}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pracujem && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("Uložiť ako koncept faktúry")}
        </button>
        <button
          type="button"
          onClick={() => {
            zmazPrenos();
            setF(null);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
        >
          <X className="h-4 w-4" /> {t("Zahodiť")}
        </button>
      </div>
    </div>
  );
}
