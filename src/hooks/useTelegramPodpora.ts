import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { telegramPodporaFn } from "@/lib/faktero/telegram.functions";

export type TelegramPodpora = { bot: string | null; prepojeny: boolean };

/** Kľúč je spoločný — ponuka pod avatarom aj stránka podpory čítajú jeden výsledok. */
export const TELEGRAM_PODPORA_KLUC = ["telegram-podpora"] as const;

/**
 * Je bot podpory nastavený a má ho človek prepojený s účtom? Načíta sa raz
 * za reláciu a zdieľa medzi všetkými miestami, kde sa Telegram ponúka.
 * Chyba servera znamená „nie je“ — tlačidlo sa jednoducho neukáže.
 */
export function useTelegramPodpora(): TelegramPodpora | null {
  const infoFn = useServerFn(telegramPodporaFn);
  const { data } = useQuery<TelegramPodpora | null>({
    queryKey: TELEGRAM_PODPORA_KLUC,
    queryFn: () => infoFn().catch(() => null),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return data?.bot ? data : null;
}
