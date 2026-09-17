import { createSign, generateKeyPairSync } from "crypto";
import { jeBezny, oknoVypisu, pohybyZVypisu, ucetZWise, type WiseZostatok } from "./wise";

/**
 * Komunikácia s Wise.
 *
 * Wise nie je PSD2 ako Tatra banka: netreba vzájomné certifikáty ani
 * presmerovania, stačí osobný token, ktorý si človek vygeneruje vo svojom
 * účte. Zádrhel je inde — **čítanie výpisu je chránené silným overením**
 * (SCA). Prvé volanie skončí na 403 s jednorazovým kľúčom v hlavičke
 * `x-2fa-approval`; ten treba podpísať súkromným kľúčom, ktorého verejnú
 * polovicu má človek nahratú vo Wise, a volanie zopakovať s podpisom.
 *
 * Pár kľúčov vyrábame my a súkromný držíme zašifrovaný — človek nemá dôvod
 * pracovať s kryptografiou, aby si pozrel zostatok. Verejný mu ukážeme na
 * skopírovanie do Wise.
 *
 * Server-only: pracuje s tajomstvami a s privátnym kľúčom.
 */

const ZAKLAD = process.env.WISE_API_URL || "https://api.transferwise.com";

export type WiseSpojenie = {
  token: string;
  privateKeyPem: string | null;
  profileId: string | null;
};

/** Nový pár kľúčov pre podpisovanie SCA. Verejný ide do Wise, súkromný k nám. */
export function vyrobKluce(): { verejny: string; sukromny: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    // Wise podpisuje PKCS#1 v1.5 nad SHA-256; formát kľúča je na nás.
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { verejny: publicKey, sukromny: privateKey };
}

/**
 * Podpis jednorazového kľúča z výzvy SCA.
 *
 * Exportované kvôli testu: keby sa tu zmenil algoritmus alebo kódovanie, Wise
 * by odpovedal len „403" a hľadalo by sa to ťažko.
 */
export function podpis(jednorazovyKluc: string, privateKeyPem: string): string {
  const s = createSign("RSA-SHA256");
  s.update(jednorazovyKluc, "ascii");
  s.end();
  return s.sign(privateKeyPem, "base64");
}

class WiseChyba extends Error {
  constructor(
    public stav: number,
    sprava: string,
  ) {
    super(sprava);
    this.name = "WiseChyba";
  }
}

/**
 * Volanie Wise vrátane odpovede na výzvu SCA.
 *
 * Opakuje sa **raz**. Keď podpis neprejde ani na druhý pokus, kľúč vo Wise
 * nesedí s tým naším a ďalšie pokusy to nezmenia — povie sa to nahlas.
 */
async function volaj<T>(
  spojenie: WiseSpojenie,
  cesta: string,
  { podpisovat = false }: { podpisovat?: boolean } = {},
): Promise<T> {
  const posli = (hlavicky: Record<string, string>) =>
    fetch(`${ZAKLAD}${cesta}`, {
      headers: {
        authorization: `Bearer ${spojenie.token}`,
        "content-type": "application/json",
        "user-agent": "faktero",
        ...hlavicky,
      },
    });

  let r = await posli({});

  if (r.status === 403 && podpisovat) {
    const jednorazovy = r.headers.get("x-2fa-approval");
    if (!jednorazovy) throw new WiseChyba(403, "Wise žiada overenie, ale neposlal kľúč.");
    if (!spojenie.privateKeyPem) {
      throw new WiseChyba(
        403,
        "Wise žiada overenie podpisom. Nahrajte verejný kľúč vo svojom účte Wise (Settings → API tokens).",
      );
    }
    r = await posli({
      "x-2fa-approval": jednorazovy,
      "X-Signature": podpis(jednorazovy, spojenie.privateKeyPem),
    });
  }

  if (!r.ok) {
    const telo = (await r.text().catch(() => "")).slice(0, 300);
    if (r.status === 401) throw new WiseChyba(401, "Token do Wise neplatí alebo bol zrušený.");
    if (r.status === 403) {
      throw new WiseChyba(
        403,
        "Wise podpis neprijal. Skontrolujte, či je vo Wise nahratý ten verejný kľúč, ktorý ukazuje Faktero.",
      );
    }
    throw new WiseChyba(r.status, `Wise odpovedal ${r.status}. ${telo}`);
  }
  return (await r.json()) as T;
}

/** Profily účtu. Firemný má prednosť — faktúry patria firme, nie človeku. */
export async function nacitajProfil(token: string): Promise<{ id: string; typ: string }> {
  const profily = await volaj<{ id: number | string; type?: string }[]>(
    { token, privateKeyPem: null, profileId: null },
    "/v2/profiles",
  );
  const zoznam = Array.isArray(profily) ? profily : [];
  if (!zoznam.length) throw new WiseChyba(404, "K tomuto tokenu nepatrí žiadny profil Wise.");
  const firemny = zoznam.find((p) => String(p.type).toUpperCase() === "BUSINESS");
  const vybrany = firemny ?? zoznam[0];
  return { id: String(vybrany.id), typ: String(vybrany.type ?? "PERSONAL") };
}

/** Zostatky po menách — každý bude vo Fakteri samostatný účet. */
export async function nacitajUcty(spojenie: WiseSpojenie) {
  if (!spojenie.profileId) throw new WiseChyba(400, "Spojenie s Wise nemá profil.");
  const zostatky = await volaj<WiseZostatok[]>(
    spojenie,
    `/v4/profiles/${spojenie.profileId}/balances?types=STANDARD`,
  );
  return (zostatky ?? []).filter(jeBezny).map(ucetZWise);
}

/** Výpis jedného zostatku za posledný rok. Toto je to volanie, ktoré chce SCA. */
export async function nacitajPohyby(
  spojenie: WiseSpojenie,
  balanceId: string,
  mena: string,
  teraz: Date = new Date(),
) {
  if (!spojenie.profileId) throw new WiseChyba(400, "Spojenie s Wise nemá profil.");
  const { od, do: doKedy } = oknoVypisu(teraz);
  const parametre = new URLSearchParams({
    currency: mena,
    type: "COMPACT",
    intervalStart: od,
    intervalEnd: doKedy,
  });
  const vypis = await volaj<{ transactions?: unknown[] }>(
    spojenie,
    `/v1/profiles/${spojenie.profileId}/balance-statements/${balanceId}/statement.json?${parametre}`,
    { podpisovat: true },
  );
  return pohybyZVypisu(vypis as any, balanceId);
}

/**
 * Pripojenie firmy aj s rozšifrovanými tajomstvami.
 *
 * Býva v `wise.functions`, ale musí byť dosiahnuteľné aj pre nočný beh, ktorý
 * žiadneho prihláseného človeka nemá. A práve preto stojí tu: `*.functions` sa
 * balí aj pre prehliadač a čokoľvek, čo z neho vyváža cestu k `payment-crypto`,
 * pritiahne do prehliadača `node:crypto` a build spadne.
 */
export async function spojenieFirmy(companyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin
    .from("bank_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("provider", "wise")
    .maybeSingle();
  if (!conn) throw new Error("Wise nie je pripojený.");
  const { decryptSecret } = await import("./payment-crypto.server");
  const meta = (conn.metadata as any) ?? {};
  return {
    conn,
    supabaseAdmin,
    spojenie: {
      token: decryptSecret(conn.access_token as string),
      privateKeyPem: meta.private_key ? decryptSecret(meta.private_key) : null,
      profileId: meta.profile_id ?? null,
    },
  };
}

/**
 * Účty aj pohyby naraz, bez prihláseného človeka — pre nočný beh.
 *
 * Spolu preto, že zostatok sa mení rovnako ako pohyby: sťahovať ich zvlášť by
 * znamenalo, že prehľad ukazuje starý zostatok k novým pohybom.
 */
export async function synchronizujWiseZoServera(companyId: string) {
  const { conn, supabaseAdmin, spojenie } = await spojenieFirmy(companyId);
  const { upsertBankAccounts } = await import("./tatrabanka.server");
  const { stiahniPohybyPripojenia } = await import("./bank-sync.server");

  const ucty = await nacitajUcty(spojenie);
  await upsertBankAccounts(companyId, conn.id as string, ucty);
  const { vlozenych, problemy } = await stiahniPohybyPripojenia(
    supabaseAdmin,
    companyId,
    conn.id as string,
    (u) => nacitajPohyby(spojenie, u.external_account_id, u.currency),
  );
  return { accounts: ucty.length, inserted: vlozenych, problemy };
}
