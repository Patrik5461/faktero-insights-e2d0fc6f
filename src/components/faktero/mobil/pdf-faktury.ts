/**
 * Otvorenie PDF faktúry v telefóne.
 *
 * Dve veci, ktoré sa dajú spraviť zle a vyzerá to ako pokazené tlačidlo:
 *
 * 1. Podpísaná adresa z úložiska nesie `download`, takže server pošle prílohu
 *    na stiahnutie. V prehliadači telefónu z toho ostane prázdna karta. Bez
 *    toho parametra sa PDF zobrazí.
 * 2. Okno sa musí otvoriť ešte pred čakaním na server. Po `await` už kliknutie
 *    neplatí a prehliadač otvorenie zablokuje.
 */

export function adresaNaZobrazenie(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("download");
    return u.toString();
  } catch {
    return url;
  }
}

/** Bajty → base64 po kúskoch; naraz to pri väčšom PDF prepadne zásobník. */
function base64ZBajtov(bajty: Uint8Array): string {
  let binarne = "";
  const kus = 0x8000;
  for (let i = 0; i < bajty.length; i += kus) {
    binarne += String.fromCharCode(...Array.from(bajty.subarray(i, i + kus)));
  }
  return btoa(binarne);
}

/**
 * Poslanie faktúry cez systémové menu zdieľania.
 *
 * Na telefóne sa faktúra najčastejšie posiela cez WhatsApp alebo Messenger,
 * nie mailom — a to sa cez otvorenie PDF v prehliadači spraviť nedá. Súbor
 * preto ide do systémového menu ako príloha.
 *
 * Zrušenie zdieľania nie je chyba: keď človek menu zavrie, plugin vyhodí
 * výnimku a bez tohto rozlíšenia by mu appka nadávala, že sa niečo nepodarilo.
 */
export async function zdielajPdfFaktury(
  ziskaj: () => Promise<{ signedUrl: string }>,
  cisloFaktury: string,
  text?: string,
): Promise<{ zrusene: boolean }> {
  const { signedUrl } = await ziskaj();
  const odpoved = await fetch(adresaNaZobrazenie(signedUrl));
  if (!odpoved.ok) throw new Error("PDF sa nepodarilo stiahnuť.");
  const base64 = base64ZBajtov(new Uint8Array(await odpoved.arrayBuffer()));

  const { sharePdf } = await import("@/lib/mobile/share-pdf");
  const r = await sharePdf({
    fileName: `${cisloFaktury}.pdf`,
    base64,
    title: `Faktúra ${cisloFaktury}`,
    text,
  });
  if (r.ok) return { zrusene: false };
  if (/cancel|zrušen|dismiss/i.test(r.error ?? "")) return { zrusene: true };
  throw new Error(r.error ?? "Zdieľanie zlyhalo.");
}

export async function otvorPdfFaktury(ziskaj: () => Promise<{ signedUrl: string }>): Promise<void> {
  const okno = window.open("", "_blank");
  try {
    const { signedUrl } = await ziskaj();
    const adresa = adresaNaZobrazenie(signedUrl);
    if (okno) {
      okno.opener = null;
      okno.location.href = adresa;
    } else {
      // Keď okno neprejde (zablokované), aspoň sa otvorí na mieste.
      window.location.href = adresa;
    }
  } catch (e) {
    okno?.close();
    throw e;
  }
}
