/**
 * Text popisu stránky. Popis (`description` aj `popisDalej` v PageHeader)
 * je od 6. 11. schovaný v bubline ikony „?“ pri nadpise — bublina sa
 * vykresľuje do portálu mimo <main>. Funkcia ju otvorí, prečíta a zavrie.
 * Vráti text <main> spolu s textom bubliny (ak na stránke nejaká je).
 */
export async function textSPopisom(page) {
  const main = page.locator("main");
  const ikona = main.locator("[data-napoveda-otaznik]").first();
  let bublina = "";
  if (await ikona.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ikona.click();
    const b = page.locator("[data-napoveda-bublina]").last();
    await b.waitFor({ timeout: 10000 });
    bublina = await b.innerText();
    await ikona.click();
    await b.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  }
  return `${await main.innerText()}\n${bublina}`;
}
