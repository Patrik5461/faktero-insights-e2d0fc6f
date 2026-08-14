/**
 * Prevzatie toho, čo vzniklo na offline obrazovke.
 *
 * Keď sa appka nemá ako načítať (bez signálu), Capacitor ukáže obrazovku
 * zabalenú v binárke. Tá vie odfotiť doklad, ale nemôže ho odložiť do fronty
 * appky — beží na inom pôvode, takže má vlastný `localStorage` aj IndexedDB.
 * Preto sa fotka zapíše do súborov telefónu a jej zoznam do `Preferences`,
 * ktoré sú natívne a vidia do nich obe strany.
 *
 * Tento modul ten zoznam pri štarte prevezme, doklady preloží do bežnej fronty
 * a po sebe upratá.
 */

const KLUC = "faktero.offline.doklady";

/** Z offline obrazovky príde fotka, QR kód, alebo oboje. */
type OdlozenyDoklad = {
  id: string;
  path?: string | null;
  mime?: string;
  qr_raw?: string | null;
  ts?: number;
};

async function pluginy() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const [{ Preferences }, { Filesystem, Directory }] = await Promise.all([
    import("@capacitor/preferences"),
    import("@capacitor/filesystem"),
  ]);
  return { Preferences, Filesystem, Directory };
}

/**
 * Prenesie odložené doklady do fronty firmy. Vracia, koľko ich prevzal —
 * volajúci vie povedať človeku, že sa niečo objavilo.
 */
export async function prevezmiOfflineDoklady(companyId: string): Promise<number> {
  if (!companyId) return 0;
  const p = await pluginy();
  if (!p) return 0;

  let zoznam: OdlozenyDoklad[] = [];
  try {
    const ulozene = await p.Preferences.get({ key: KLUC });
    zoznam = JSON.parse(ulozene.value ?? "[]");
  } catch {
    return 0;
  }
  if (!Array.isArray(zoznam) || zoznam.length === 0) return 0;

  const { pridajDoFronty } = await import("./doklady-fronta");
  const zostavajuce: OdlozenyDoklad[] = [];
  let prevzate = 0;

  for (const doklad of zoznam) {
    try {
      let obrazok: string | null = null;
      if (doklad.path) {
        const subor = await p.Filesystem.readFile({
          path: doklad.path,
          directory: p.Directory.Data,
        });
        const base64 = typeof subor.data === "string" ? subor.data : "";
        if (!base64) throw new Error("prázdny súbor");
        obrazok = `data:${doklad.mime ?? "image/jpeg"};base64,${base64}`;
      }

      // Záznam bez fotky aj bez QR by bol prázdny doklad — ten do fronty nepatrí.
      if (!obrazok && !doklad.qr_raw) continue;

      await pridajDoFronty({
        company_id: companyId,
        obrazok,
        // Bez pripojenia sa nedalo vybrať; hotovosť je pri bločkoch najbežnejšia
        // a na doklade sa to dá opraviť.
        uhrada: "hotovost",
        qr_raw: doklad.qr_raw ?? null,
      });
      prevzate++;
      if (doklad.path) {
        await p.Filesystem.deleteFile({ path: doklad.path, directory: p.Directory.Data }).catch(
          () => {},
        );
      }
    } catch (e) {
      // Doklad, ktorý sa teraz nepodarilo prevziať, sa nezahodí — skúsi sa nabudúce.
      console.warn("[offline] doklad sa nepodarilo prevziať", e);
      zostavajuce.push(doklad);
    }
  }

  await p.Preferences.set({ key: KLUC, value: JSON.stringify(zostavajuce) });
  return prevzate;
}
