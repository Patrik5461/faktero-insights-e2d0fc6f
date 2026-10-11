/**
 * Komunikácia s Fio bankou (API Bankovnictví).
 *
 * Jeden token = jeden účet = jedno pripojenie. Jedno volanie
 * `periods/{token}/{od}/{do}/transactions.json` vráti údaje účtu aj pohyby,
 * takže synchronizácia volá banku práve raz. Fio pustí na token najviac jedno
 * volanie za 30 sekúnd — preto si tu pamätáme posledné volanie a druhé v tej
 * istej polminúte ani neodošleme.
 *
 * Neplatný token Fio neodmietne hneď: odpovie 500 až po ~30 sekundách. Volanie
 * má preto vlastný strop 25 s, aby sa zmestilo pod 30 s strop nginxu.
 *
 * Server-only: pracuje s rozšifrovaným tokenom.
 */

import { createHash } from "crypto";
import { chybaFio, oknoFio, vypisZFio, type FioOdpoved } from "./fio";

const ZAKLAD = process.env.FIO_API_URL || "https://fioapi.fio.cz/v1/rest";
const STROP_MS = 25_000;
const ROZOSTUP_MS = 30_000;

/** Posledné volanie podľa odtlačku tokenu (token samotný v pamäti nedržíme). */
const posledne = new Map<string, number>();

export class FioChyba extends Error {
  constructor(
    public stav: number,
    sprava: string,
  ) {
    super(sprava);
    this.name = "FioChyba";
  }
}

/** Stiahne účet a pohyby za okno (predvolene posledných 89 dní). */
export async function stiahniFio(token: string, teraz: Date = new Date()) {
  const kluc = createHash("sha256").update(token).digest("hex");
  const pred = posledne.get(kluc);
  if (pred && Date.now() - pred < ROZOSTUP_MS) throw new FioChyba(409, chybaFio(409));
  posledne.set(kluc, Date.now());

  const { od, do: doKedy } = oknoFio(teraz);
  let r: Response;
  try {
    r = await fetch(
      `${ZAKLAD}/periods/${encodeURIComponent(token)}/${od}/${doKedy}/transactions.json`,
      {
        headers: { accept: "application/json", "user-agent": "faktero" },
        signal: AbortSignal.timeout(STROP_MS),
      },
    );
  } catch (e: any) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      // Neplatný token Fio „odmieta“ práve takto — dlhým čakaním a 500.
      throw new FioChyba(
        504,
        "Fio neodpovedalo do 25 sekúnd. Najčastejšie to znamená neplatný token — skontrolujte ho v internetbankingu.",
      );
    }
    throw new FioChyba(0, `Fio je nedostupné: ${String(e?.message ?? e).slice(0, 120)}`);
  }
  if (!r.ok) throw new FioChyba(r.status, chybaFio(r.status));
  const json = (await r.json()) as FioOdpoved;
  const vypis = vypisZFio(json);
  if (!vypis.ucet.external_account_id) throw new FioChyba(502, "Fio nevrátilo číslo účtu.");
  return vypis;
}

/** Pripojenie s rozšifrovaným tokenom — pre server fn aj nočný beh. */
export async function spojenieFio(connectionId: string, companyId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("provider", "fio");
  if (companyId) q = q.eq("company_id", companyId);
  const { data: conn } = await q.maybeSingle();
  if (!conn || !conn.access_token) throw new Error("Fio nie je pripojené.");
  const { decryptSecret } = await import("./payment-crypto.server");
  return { conn, supabaseAdmin, token: decryptSecret(conn.access_token as string) };
}

/**
 * Zapíše účet a nové pohyby jedného pripojenia. Používa ho pripojenie (hneď
 * po overení tokenu, aby sa nemuselo čakať 30 s na ďalšie volanie),
 * tlačidlo aj nočný beh.
 */
export async function zapisVypisFio(
  supabaseAdmin: any,
  companyId: string,
  connectionId: string,
  vypis: Awaited<ReturnType<typeof stiahniFio>>,
) {
  const { upsertBankAccounts } = await import("./tatrabanka.server");
  const { stiahniPohybyPripojenia } = await import("./bank-sync.server");
  await upsertBankAccounts(companyId, connectionId, [vypis.ucet]);
  // Pohyby sú už stiahnuté — spoločná funkcia len vynechá známe a zapíše nové.
  const { vlozenych, problemy } = await stiahniPohybyPripojenia(
    supabaseAdmin,
    companyId,
    connectionId,
    async () => vypis.pohyby,
  );
  await supabaseAdmin
    .from("bank_connections")
    .update({ last_synced_at: new Date().toISOString(), status: "connected" })
    .eq("id", connectionId);
  return { accounts: 1, inserted: vlozenych, problemy };
}

/** Synchronizácia jedného pripojenia bez prihláseného človeka — nočný beh. */
export async function synchronizujFioZoServera(connectionId: string) {
  const { conn, supabaseAdmin, token } = await spojenieFio(connectionId);
  const vypis = await stiahniFio(token);
  return zapisVypisFio(supabaseAdmin, conn.company_id as string, conn.id as string, vypis);
}
