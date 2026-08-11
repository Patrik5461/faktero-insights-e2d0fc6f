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
