/*
  Na ktorý účet majú prísť peniaze za faktúru. Faktúra si ho pamätá
  (`payment_iban`…); ponuka ani faktúra spred viacerých účtov ho nemá —
  vtedy platí účet firmy. Všetky miesta (PDF, QR, verejná stránka, e-maily,
  upomienky, ISDOC, eFaktúra, Pohoda) sa riadia týmto jedným pravidlom.
*/

type SUctom = { iban?: string | null; swift?: string | null; [k: string]: any };

export function sUctomFaktury<F extends SUctom>(
  firma: F,
  doklad: { payment_iban?: string | null; payment_swift?: string | null } | null | undefined,
): F {
  if (!doklad?.payment_iban) return firma;
  return { ...firma, iban: doklad.payment_iban, swift: doklad.payment_swift ?? null };
}

/** IBAN na zobrazenie: po štvoriciach, ako ho ľudia prepisujú z papiera. */
export function formatujIban(iban: string | null | undefined): string {
  return String(iban ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/** IBAN z formulára: bez medzier, veľkými písmenami; `null`, keď nie je platný. */
export function upravIban(vstup: string): string | null {
  const t = vstup.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/.test(t)) return null;
  // Kontrolný súčet podľa ISO 13616 (mod 97).
  const presun = t.slice(4) + t.slice(0, 4);
  const cisla = presun.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let zvysok = 0;
  for (const c of cisla) zvysok = (zvysok * 10 + Number(c)) % 97;
  return zvysok === 1 ? t : null;
}
