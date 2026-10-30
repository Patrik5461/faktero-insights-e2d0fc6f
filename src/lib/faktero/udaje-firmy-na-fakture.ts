/**
 * Čo chýba na faktúre z údajov vlastnej firmy.
 *
 * Nová firma bez nastavení vystavila faktúru bez chyby, ale v PDF bolo
 * „IBAN —“, dodávateľ bez adresy a bez IČO (overené 30. 10. 2026). Vystavenie
 * sa nemá blokovať — faktúra je už očíslovaná — ale človek sa to musí dozvedieť
 * hneď, nie až od odberateľa, ktorý nemá kam zaplatiť.
 */
type Firma = {
  ico?: string | null;
  street?: string | null;
  city?: string | null;
  iban?: string | null;
};

export function chybajuceUdajeFirmy(
  firma: Firma | null | undefined,
  faktura: { payment_method?: string | null; payment_iban?: string | null },
): string[] {
  if (!firma) return [];
  const prazdne = (v: unknown) => !String(v ?? "").trim();
  const von: string[] = [];
  if (prazdne(firma.ico)) von.push("IČO");
  if (prazdne(firma.street) || prazdne(firma.city)) von.push("adresa");
  if (
    faktura.payment_method === "bank_transfer" &&
    prazdne(faktura.payment_iban) &&
    prazdne(firma.iban)
  )
    von.push("IBAN");
  return von;
}
