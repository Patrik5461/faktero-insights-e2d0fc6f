// Servisný klient, ktorý databáze povie, v čí mene zapisuje — história dokladov
// (spúšťač `zapis_historiu_dokladu`, funkcia `faktero_kto_historie`) podľa
// hlavičky zapíše „API kľúč <názov>“ alebo konkrétneho človeka namiesto „systém“.
// Hlavičky databáza berie len pri servisnom kľúči (bez auth.uid()).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabaseAdmin } from "./client.server";

type Admin = typeof supabaseAdmin;
const klienti = new Map<string, Admin>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function klientSHlavickou(meno: string, hodnota: string): Admin {
  const kluc = `${meno}=${hodnota}`;
  const uz = klienti.get(kluc);
  if (uz) return uz;
  const url = process.env.SUPABASE_URL;
  const tajny = process.env.FAKTERO_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !tajny) return supabaseAdmin;
  const k = createClient<Database>(url, tajny, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { headers: { [meno]: hodnota } },
  }) as unknown as Admin;
  // Strop, aby sa pri tisícoch kľúčov pamäť nezapĺňala.
  if (klienti.size > 500) klienti.clear();
  klienti.set(kluc, k);
  return k;
}

/** Zápisy cez API kľúč — história ukáže „API kľúč <názov>“. */
export function adminPreApiKluc(apiKeyId: string): Admin {
  return UUID.test(apiKeyId) ? klientSHlavickou("x-faktero-zdroj", `api:${apiKeyId}`) : supabaseAdmin;
}

/** Zápis servera v mene prihláseného človeka (po overení prístupu). */
export function adminZaCloveka(userId: string | null | undefined): Admin {
  return userId && UUID.test(userId) ? klientSHlavickou("x-faktero-kto", userId) : supabaseAdmin;
}
