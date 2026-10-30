/*
  Mobilná appka (`/app`) v prehliadači — spoločné kroky tokov 27-apka-*.

  Do telefónu ide tá istá trasa zabalená do balíčka, takže čo sa tu preklikne,
  platí aj pre appku (okrem natívnych pluginov: kamera, GPS na pozadí, push).
  Kamera v prehliadači padne na výber súboru, preto sa doklady podstrkujú cez
  `filechooser`.
*/

/** Otvorí appku na mobilnej šírke s reláciou QA účtu a vybranou firmou. */
export async function otvorApku(t, { firma = "test", sirka = 390, jazyk } = {}) {
  const page = await t.novaStranka({ mobil: true, firma, sirka, jazyk });
  await t.go("/app", page);
  // Prehľad je hotový, keď je v ňom spodná lišta so skenerom.
  await lista(page).waitFor({ timeout: 40000 });
  return page;
}

/** Spodná lišta appky (Prehľad · Faktúry · [skener] · Doklady · Viac). */
export function lista(page) {
  return page.locator("nav").filter({ has: page.locator("[data-skener-v-liste]") });
}

/** Záložka spodnej lišty podľa poradia: 0 Prehľad, 1 Faktúry, 2 skener, 3 Doklady, posledná Viac. */
export async function zalozka(page, i) {
  const tl = lista(page).getByRole("button");
  // Hláška (sonner) sedí dole cez lištu a klik by zachytila ona — ťuknutie ide priamo na tlačidlo.
  const b = i < 0 ? tl.last() : tl.nth(i);
  await b.waitFor();
  await b.dispatchEvent("click");
  await page.waitForTimeout(800);
}

export const tlacidlo = (page, meno) => page.getByRole("button", { name: meno }).first();

/**
 * Vystaví faktúru sprievodcom (odberateľ → položka → Kontrola → Vystaviť).
 * `predVystavenim` dostane stránku na obrazovke Kontrola. Vráti text obrazovky
 * po vystavení (číslo faktúry alebo „odložená").
 */
export async function vystavVApke(
  page,
  { odberatel, polozka, mnozstvo = 1, cena, text = "Fakturujeme vám", predVystavenim },
) {
  await zalozka(page, 0);
  await page
    .locator("main")
    .getByRole("button", { name: /^Faktúra$/ })
    .first()
    .click();
  await page.getByPlaceholder("Hľadať odberateľa").fill(odberatel);
  await tlacidlo(page, new RegExp(`^${odberatel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).click();
  await page.getByPlaceholder("Názov položky").first().fill(polozka);
  if (mnozstvo !== 1)
    await page.locator('input[inputmode="decimal"]').first().fill(String(mnozstvo));
  await page.getByPlaceholder("0,00").first().fill(String(cena).replace(".", ","));
  await tlacidlo(page, /^Ďalej$/).click();
  await page
    .getByPlaceholder(/Napríklad: podľa objednávky/)
    .first()
    .fill(text);
  if (predVystavenim) await predVystavenim(page);
  await tlacidlo(page, /^Vystaviť faktúru$/).click();
  const hotovo = tlacidlo(page, /^Hotovo$/);
  await hotovo.waitFor({ timeout: 40000 });
  return (await page.locator("main").last().innerText()).trim();
}

/** Otvorí detail faktúry zo záložky Faktúry hľadaním podľa čísla. */
export async function otvorFakturuVApke(page, cislo) {
  await zalozka(page, 1);
  const pole = page.getByPlaceholder(/Hľadať číslo alebo odberateľa|^Hľadať$/).first();
  if (!(await pole.isVisible().catch(() => false))) await tlacidlo(page, /^Hľadať$/).click();
  await pole.fill(cislo);
  await tlacidlo(page, new RegExp(cislo)).click();
  await tlacidlo(page, /^Upraviť faktúru|^Zmazať faktúru/).waitFor({ timeout: 20000 });
}

/** Faktúra QA firmy podľa čísla (živá, nie v koši). */
export async function fakturaPodlaCisla(t, firma, cislo) {
  const r = await t.rest.get(
    `invoices?company_id=eq.${t.firmy[firma] ?? firma}&invoice_number=eq.${encodeURIComponent(cislo)}&deleted_at=is.null&select=*,invoice_items(*)`,
  );
  return r.data?.[0] ?? null;
}
