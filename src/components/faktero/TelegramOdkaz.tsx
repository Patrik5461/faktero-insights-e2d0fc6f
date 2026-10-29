import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { telegramPodporaFn, telegramPrepojZakaznikaFn } from "@/lib/faktero/telegram.functions";

/**
 * „Napíšte nám na Telegram“ na stránke Pomoc a podpora. Ukáže sa, len keď je
 * bot nastavený (`TELEGRAM_BOT_USERNAME`). Druhý odkaz chat rovno prepojí
 * s účtom — požiadavky z Telegramu potom podpora vidí pri ňom.
 */
export function TelegramOdkaz() {
  const { t } = useT();
  const infoFn = useServerFn(telegramPodporaFn);
  const prepojFn = useServerFn(telegramPrepojZakaznikaFn);
  const [info, setInfo] = useState<{ bot: string | null; prepojeny: boolean } | null>(null);
  const [odkaz, setOdkaz] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let zruseny = false;
    infoFn()
      .then((d) => !zruseny && setInfo(d))
      .catch(() => !zruseny && setInfo(null));
    return () => {
      zruseny = true;
    };
  }, [infoFn]);

  if (!info?.bot) return null;

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

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <a
        href={`https://t.me/${info.bot}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-foreground"
      >
        <Send className="h-4 w-4" /> {t("Napíšte nám na Telegram")}
      </a>
      {info.prepojeny ? (
        <span className="text-xs">{t("Telegram je prepojený s vaším účtom.")}</span>
      ) : odkaz ? (
        <a
          href={odkaz}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          {t("Otvoriť Telegram a prepojiť s účtom")}
        </a>
      ) : (
        <button
          onClick={prepoj}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
          title={t("Požiadavky z Telegramu sa priradia k vášmu účtu.")}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {t("Prepojiť s mojím účtom")}
        </button>
      )}
    </span>
  );
}
