/**
 * Upozornenie do telefónu, keď je faktúra uhradená.
 *
 * Doteraz appka upozorňovala len na to zlé — faktúru po splatnosti. Peniaze na
 * účte sa človek dozvedel, až keď si otvoril párovanie. Toto je opačná strana
 * a jediná správa, pre ktorú si ľudia appku nechajú na ploche.
 *
 * Upozornenie je zámerne tiché pri chybe: keď FCM nie je nastavené alebo
 * odoslanie zlyhá, platba je aj tak zapísaná a to je to podstatné.
 */

export type UhradenaFaktura = {
  id: string;
  invoice_number: string;
  total: number;
  currency?: string | null;
  customer_name?: string | null;
};

function suma(n: number, mena?: string | null): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: mena || "EUR",
  }).format(Number(n) || 0);
}

export async function oznamUhradu(
  companyId: string,
  faktury: UhradenaFaktura[],
): Promise<{ poslane: number }> {
  if (!faktury.length) return { poslane: 0 };
  try {
    const { isPushConfigured, sendPush } = await import("./push.server");
    if (!isPushConfigured()) return { poslane: 0 };

    let poslane = 0;
    for (const f of faktury) {
      const r = await sendPush({
        company_id: companyId,
        title: "Faktúra uhradená ✅",
        body: `${f.invoice_number} — ${suma(f.total, f.currency)}${
          f.customer_name ? ` od ${f.customer_name}` : ""
        }`,
        data: { invoice_id: f.id, typ: "invoice_paid" },
      });
      if ((r as any)?.ok) poslane++;
    }
    return { poslane };
  } catch (e: any) {
    console.warn("[push-uhrada] odoslanie zlyhalo:", e?.message ?? e);
    return { poslane: 0 };
  }
}
