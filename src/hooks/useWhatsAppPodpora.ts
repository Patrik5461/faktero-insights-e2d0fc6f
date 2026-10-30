import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { kanalyPodporyFn, whatsappPodporaFn } from "@/lib/faktero/whatsapp.functions";

export type WhatsAppPodpora = { cislo: string | null; prepojeny: boolean };

/** Kľúč je spoločný — ponuka pod avatarom aj stránka podpory čítajú jeden výsledok. */
export const WHATSAPP_PODPORA_KLUC = ["whatsapp-podpora"] as const;
export const KANALY_PODPORY_KLUC = ["kanaly-podpory"] as const;

/**
 * Prihlásená aplikácia: je WhatsApp podpory zapnutý a má človek číslo
 * prepojené s účtom? Načíta sa raz za reláciu, chyba servera = „nie je“.
 */
export function useWhatsAppPodpora(): WhatsAppPodpora | null {
  const infoFn = useServerFn(whatsappPodporaFn);
  const { data } = useQuery<WhatsAppPodpora | null>({
    queryKey: WHATSAPP_PODPORA_KLUC,
    queryFn: () => infoFn().catch(() => null),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return data?.cislo ? data : null;
}

/**
 * Verejný web (bez prihlásenia): číslo WhatsAppu podpory, alebo `null`, kým
 * integrácia nie je zapnutá — tlačidlo sa vtedy neukáže.
 */
export function useWhatsAppVerejne(): string | null {
  const infoFn = useServerFn(kanalyPodporyFn);
  const { data } = useQuery<{ whatsapp: string | null } | null>({
    queryKey: KANALY_PODPORY_KLUC,
    queryFn: () => infoFn().catch(() => null),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return data?.whatsapp ?? null;
}
