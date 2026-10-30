import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { telegramPrepojZakaznikaFn } from "@/lib/faktero/telegram.functions";
import { useTelegramPodpora } from "@/hooks/useTelegramPodpora";
import { odkazNaTelegram } from "@/lib/faktero/telegram-podpora";

/**
 * Prepojenie chatu s účtom — požiadavky z Telegramu potom podpora vidí pri ňom.
 * Kým nie je prepojený, ponúkne tlačidlo; po kliknutí odkaz s jednorazovým kódom.
 */
function TelegramPrepojenie({ prepojeny }: { prepojeny: boolean }) {
  const { t } = useT();
  const prepojFn = useServerFn(telegramPrepojZakaznikaFn);
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
    return <span className="text-xs">{t("Telegram je prepojený s vaším účtom.")}</span>;
  if (odkaz)
    return (
      <a
        href={odkaz}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary hover:underline"
      >
        {t("Otvoriť Telegram a prepojiť s účtom")}
      </a>
    );
  return (
    <button
      type="button"
      onClick={prepoj}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
      title={t("Požiadavky z Telegramu sa priradia k vášmu účtu.")}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {t("Prepojiť s mojím účtom")}
    </button>
  );
}

/**
 * Výrazné tlačidlo „Napíšte nám na Telegram“ do hlavičky stránky Pomoc a podpora.
 * Patrik: „musí byť viditeľné, nie schované“ — preto nie odkaz v päte, ale
 * plnohodnotné tlačidlo hneď pri nadpise. Ukáže sa, len keď je bot nastavený.
 */
export function TelegramTlacidlo() {
  const { t } = useT();
  const info = useTelegramPodpora();
  if (!info?.bot) return null;

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 lg:items-end">
      <a
        href={odkazNaTelegram(info.bot)}
        target="_blank"
        rel="noopener noreferrer"
        data-telegram-tlacidlo=""
        className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-primary/40 bg-card px-4 text-sm font-medium text-foreground shadow-sm transition hover:border-primary hover:bg-secondary"
      >
        <Send className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">{t("Napíšte nám na Telegram")}</span>
      </a>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground lg:justify-end">
        <span>{t("Odpovieme priamo v Telegrame")}</span>
        <span aria-hidden>·</span>
        <TelegramPrepojenie prepojeny={info.prepojeny} />
      </div>
    </div>
  );
}

/**
 * Malý odkaz „Napíšte nám na Telegram“ v päte stránky Pomoc a podpora,
 * vedľa e-mailu a telefónu. Ukáže sa, len keď je bot nastavený.
 */
export function TelegramOdkaz() {
  const { t } = useT();
  const info = useTelegramPodpora();
  if (!info?.bot) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <a
        href={odkazNaTelegram(info.bot)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-foreground"
      >
        <Send className="h-4 w-4" /> {t("Napíšte nám na Telegram")}
      </a>
      <TelegramPrepojenie prepojeny={info.prepojeny} />
    </span>
  );
}
