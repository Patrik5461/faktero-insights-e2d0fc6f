/*
  Kontrola e-mailu pred registráciou: jednorazová doména a doména, na ktorú
  sa nedá doručiť (bez MX záznamu).

  Skutočnú hrádzu proti jednorazovým doménam drží spúšťač na `auth.users`
  (migrácia ochrana_odosielania) — registrácia ide z prehliadača aj z appky
  priamo do Supabase a server Faktera ju nevidí. Táto kontrola je pred ňou,
  aby človek dostal zrozumiteľnú hlášku, a navyše overí MX, čo databáza
  urobiť nevie.

  Výpadok DNS registráciu nezastaví — overenie vtedy povolí.
*/

export const HLASKY_EMAILU = {
  jednorazova:
    "Jednorazové (dočasné) e-mailové adresy sa na registráciu nedajú použiť. Použite trvalú adresu, napríklad firemnú.",
  bezMx: "Na doménu {domena} sa nedajú doručiť e-maily. Skontrolujte, či je adresa správna.",
  neplatna: "E-mailová adresa nie je platná.",
} as const;

export type VysledokEmailu =
  | { ok: true }
  | { ok: false; dovod: "jednorazova" | "bez_mx" | "neplatna"; sprava: string; domena: string };

export function domenaEmailu(email: string): string {
  return (
    String(email ?? "")
      .trim()
      .toLowerCase()
      .split("@")[1]
      ?.replace(/\.+$/, "") ?? ""
  );
}

/**
 * Má doména MX záznam? `true` áno, `false` doména neexistuje alebo poštu
 * neprijíma (žiadny MX alebo „null MX" podľa RFC 7505), `null` nevieme
 * (DNS neodpovedal) — vtedy sa registrácia nezastaví.
 */
export async function maMx(domena: string, casMs = 3000): Promise<boolean | null> {
  const { Resolver } = await import("node:dns/promises");
  const r = new Resolver({ timeout: casMs, tries: 2 });
  let casovac: ReturnType<typeof setTimeout> | undefined;
  try {
    const zaznamy = await Promise.race([
      r.resolveMx(domena),
      new Promise<never>((_, nie) => {
        casovac = setTimeout(
          () => nie(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })),
          casMs * 2,
        );
      }),
    ]);
    return zaznamy.some((z) => z.exchange && z.exchange !== ".");
  } catch (e: any) {
    if (e?.code === "ENOTFOUND" || e?.code === "ENODATA") return false;
    return null;
  } finally {
    if (casovac) clearTimeout(casovac);
    r.cancel();
  }
}

/** Je doména (alebo nadradená) v zozname `blokovane_domeny`? `null` = nevieme. */
async function jeJednorazova(email: string): Promise<boolean | null> {
  const url = process.env.SUPABASE_URL;
  // Servisný kľúč — funkcia už nie je verejná (anon by z nej vyčítal zoznam domén).
  const kluc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !kluc) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/je_blokovana_domena`, {
      method: "POST",
      headers: {
        apikey: kluc,
        authorization: `Bearer ${kluc}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_email: email }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return (await r.json()) === true;
  } catch {
    return null;
  }
}

export async function overEmailNaRegistraciu(email: string): Promise<VysledokEmailu> {
  const domena = domenaEmailu(email);
  if (!domena || !domena.includes(".")) {
    return { ok: false, dovod: "neplatna", sprava: HLASKY_EMAILU.neplatna, domena };
  }
  const [jednorazova, mx] = await Promise.all([jeJednorazova(email), maMx(domena)]);
  if (jednorazova === true) {
    return { ok: false, dovod: "jednorazova", sprava: HLASKY_EMAILU.jednorazova, domena };
  }
  if (mx === false) {
    return { ok: false, dovod: "bez_mx", sprava: HLASKY_EMAILU.bezMx, domena };
  }
  return { ok: true };
}
