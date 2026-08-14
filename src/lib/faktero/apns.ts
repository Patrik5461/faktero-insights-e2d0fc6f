/**
 * Push cez APNs — časti, ktoré sa dajú overiť bez siete.
 *
 * iOS appka registruje **APNs token** (Capacitor plugin, žiadny Firebase).
 * Server dovtedy posielal cez FCM, ktoré čaká vlastné tokeny — tie dve veci si
 * nesadli a push nefungoval. Priame APNs to spája a hlavne: appka na to
 * nepotrebuje nový build, čiže push sa dá zapnúť bez ďalšieho schvaľovania.
 */

/**
 * APNs token je 64 znakov hexa; FCM token je dlhší reťazec s dvojbodkou.
 * Podľa toho vieme poslať každý token tam, kam patrí, bez toho aby volajúci
 * musel vedieť platformu.
 */
export function jeApnsToken(token: string | null | undefined): boolean {
  return typeof token === "string" && /^[0-9a-f]{64}$/i.test(token.trim());
}

export type PushSprava = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

/** Telo notifikácie pre APNs. Vlastné údaje idú vedľa `aps`, nie doň. */
export function apnsPayload(sprava: PushSprava): Record<string, unknown> {
  return {
    aps: {
      alert: { title: sprava.title, body: sprava.body },
      sound: "default",
      badge: 1,
    },
    ...(sprava.data ?? {}),
  };
}

/**
 * Odpovede APNs, po ktorých nemá zmysel skúšať znova — token je mŕtvy a patrí
 * zmazať, inak sa doň búši pri každej notifikácii.
 */
export function tokenJeMrtvy(status: number, reason?: string | null): boolean {
  if (status === 410) return true;
  return status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic");
}
