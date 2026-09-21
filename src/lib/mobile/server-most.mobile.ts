/**
 * Most na server — verzia pre zabalenú appku.
 *
 * Namiesto serverovej funkcie sa volá endpoint `/api/mobil/<operácia>` na
 * `www.faktero.sk` s tokenom prihlásenia. Endpoint zavolá tú istú serverovú
 * funkciu, takže sa logika nikde nezdvojuje.
 *
 * Tento súbor nahrádza `server-most.ts` aliasom vo `vite.config.mobile.ts` —
 * v balíčku tak neostane ani riadok zo serverového jadra TanStacku.
 */
import { supabase } from "@/integrations/supabase/client";
import { SERVER, type Operacia } from "./operacie";
import { BEZ_VYZVY_NA_NAKUP, jeBlokPlanu } from "@/lib/faktero/plan-error";

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function volajOperaciu<T = any>(kluc: Operacia, data: any): Promise<T> {
  const jwt = await token();
  if (!jwt) throw new Error("Nie ste prihlásený.");

  const r = await fetch(`${SERVER}/api/mobil/${kluc}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ data }),
  });

  if (!r.ok) {
    // Server posiela dôvod v tele; keď nie, aspoň nech je jasné, čo zlyhalo.
    let dovod = "";
    try {
      const json = await r.json();
      dovod = json?.error ?? "";
    } catch {
      dovod = (await r.text().catch(() => "")).slice(0, 200);
    }
    if (r.status === 401) throw new Error(dovod || "Prihlásenie vypršalo.");
    /*
      Server hlási neaktívne predplatné vetou „…aktivujte si plán“. Na webe je
      to správne, v appke z App Store je to výzva na nákup mimo nej (3.1.1).
      Väčšina obrazoviek ukazuje chybu tak, ako príde, preto sa prekladá tu.
    */
    if (jeBlokPlanu(dovod)) throw new Error(BEZ_VYZVY_NA_NAKUP);
    throw new Error(dovod || `Server odpovedal ${r.status}.`);
  }

  const json = await r.json();
  return json?.vysledok as T;
}

export function useOperacia<T = any>(kluc: Operacia): (vstup: { data: any }) => Promise<T> {
  return (vstup) => volajOperaciu<T>(kluc, vstup?.data);
}
