import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { adminWhatsAppStavFn } from "@/lib/faktero/whatsapp.functions";
import { cisloNaZobrazenie } from "@/lib/faktero/whatsapp";
import { WhatsAppIkona } from "./WhatsAppIkona";

const kedy = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("sk-SK") : "zatiaľ nikdy";

/**
 * Admin → Podpora → WhatsApp: stav napojenia na Cloud API. Ukazuje len, či sú
 * tajomstvá nastavené (nikdy ich hodnoty), či Meta overila webhook a kedy
 * prišla posledná správa. Odpovede sa píšu v požiadavkách ako pri e-maile.
 */
export function WhatsAppAdminKarta() {
  const stavFn = useServerFn(adminWhatsAppStavFn);
  const [stav, setStav] = useState<Awaited<ReturnType<typeof adminWhatsAppStavFn>> | null>(null);

  useEffect(() => {
    stavFn()
      .then(setStav)
      .catch((e) => toast.error((e as Error).message));
  }, [stavFn]);

  const chyba = "text-amber-700 dark:text-amber-400";
  const chybajuce = stav
    ? [
        !stav.nastavene.token && "WHATSAPP_TOKEN",
        !stav.nastavene.cisloId && "WHATSAPP_PHONE_NUMBER_ID",
        !stav.nastavene.appSecret && "WHATSAPP_APP_SECRET",
        !stav.nastavene.verifyToken && "WHATSAPP_VERIFY_TOKEN",
      ].filter(Boolean)
    : [];

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <WhatsAppIkona className="h-4 w-4 text-emerald-700" /> WhatsApp
        </h2>
        {!stav && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {stav && (
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p>
            Číslo: <span className="text-foreground">{cisloNaZobrazenie(stav.cislo)}</span>
            {" · "}
            {stav.zapnuty ? (
              <span className="text-foreground">zapnuté</span>
            ) : (
              <span className={chyba}>vypnuté — zákazníkom sa WhatsApp neponúka</span>
            )}
            {chybajuce.length > 0 && <span className={chyba}> · chýba {chybajuce.join(", ")}</span>}
          </p>
          <p>
            Webhook overený:{" "}
            <span className={stav.stav?.webhook_overeny_at ? "text-foreground" : chyba}>
              {kedy(stav.stav?.webhook_overeny_at)}
            </span>
            {" · "}posledná udalosť od Meta: {kedy(stav.stav?.posledna_udalost_at)}
            {" · "}posledná správa zákazníka: {kedy(stav.stav?.posledna_sprava_at)}
          </p>
          <p>
            Šablóna mimo 24 h okna:{" "}
            {stav.sablona ? (
              <span className="text-foreground">{stav.sablona}</span>
            ) : (
              <span className={chyba}>
                nenastavená (WHATSAPP_SABLONA) — mimo okna odíde len e-mail
              </span>
            )}
            {" · "}konverzácií: {stav.chatov}
            {stav.nedorucenych > 0 && (
              <span className={chyba}> · čaká na doručenie: {stav.nedorucenych}</span>
            )}
          </p>
          {stav.stav?.posledna_chyba && (
            <p className={chyba}>
              Posledná chyba ({kedy(stav.stav.posledna_chyba_at)}): {stav.stav.posledna_chyba}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
