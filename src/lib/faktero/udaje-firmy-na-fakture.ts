/**
 * Čo chýba na faktúre z údajov vlastnej firmy.
 *
 * Nová firma bez nastavení vystavila faktúru bez chyby, ale v PDF bolo
 * „IBAN —“, dodávateľ bez adresy a bez IČO (overené 30. 10. 2026). Vystavenie
 * sa nemá blokovať — faktúra je už očíslovaná — ale človek sa to musí dozvedieť
 * hneď, nie až od odberateľa, ktorý nemá kam zaplatiť.
 */
type Firma = {
  country?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
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
  /*
    Nemecko IČO nepozná — na faktúre má byť Steuernummer (v poli DIČ) alebo
    USt-IdNr. (§ 14 Abs. 4 Nr. 2 UStG, `firma-de.ts`). Predtým nemecká firma
    po každej faktúre dostala výzvu doplniť „Firmen-ID (IČO)“.
  */
  if (String(firma.country ?? "").toUpperCase() === "DE") {
    if (prazdne(firma.dic) && prazdne(firma.ic_dph)) von.push("Steuernummer alebo USt-IdNr.");
  } else if (prazdne(firma.ico)) von.push("IČO");
  if (prazdne(firma.street) || prazdne(firma.city)) von.push("adresa");
  if (
    faktura.payment_method === "bank_transfer" &&
    prazdne(faktura.payment_iban) &&
    prazdne(firma.iban)
  )
    von.push("IBAN");
  return von;
}
