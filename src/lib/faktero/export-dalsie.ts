/**
 * Ďalšie formáty účtovného exportu.
 *
 * Pohoda, Omega a Money majú vlastné natívne súbory (v `export.server.ts`).
 * Zvyšok trhu — ABRA Flexi, MRP, Premier, Helios, Alfa, Excel u účtovníčky —
 * berie buď ISDOC, alebo obyčajnú tabuľku. Tieto dva formáty preto pokrývajú
 * všetko ostatné, čo firma stretne.
 *
 * Sumy sa berú z dokladu, nie z položiek: hlavička už obsahuje zľavu na
 * doklad aj zaokrúhlenie, kým súčet riadkov nie.
 *
 * Dobropis je v databáze uložený kladne a za opravný ho označuje `type`
 * (rovnako to má Pohoda aj Omega). Každý formát, ktorý sumy sčítava, mu preto
 * musí sám otočiť znamienko — inak účtovníčke dobropis výnosy zvýši.
 */

export type RiadokFaktury = {
  invoice_number?: unknown;
  type?: unknown;
  issue_date?: unknown;
  delivery_date?: unknown;
  due_date?: unknown;
  currency?: unknown;
  variable_symbol?: unknown;
  constant_symbol?: unknown;
  specific_symbol?: unknown;
  payment_method?: unknown;
  customer_name?: unknown;
  customer_ico?: unknown;
  customer_dic?: unknown;
  customer_ic_dph?: unknown;
  customer_street?: unknown;
  customer_city?: unknown;
  customer_zip?: unknown;
  customer_country?: unknown;
  subtotal?: unknown;
  vat_total?: unknown;
  total?: unknown;
  discount_total?: unknown;
  reverse_charge?: unknown;
  notes?: unknown;
  intro_note?: unknown;
  exchange_rate?: unknown;
  subtotal_eur?: unknown;
  vat_total_eur?: unknown;
  total_eur?: unknown;
};

export type PolozkaFaktury = {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  vat_rate?: unknown;
  subtotal?: unknown;
  vat_amount?: unknown;
  total?: unknown;
};

const cislo = (h: unknown): number => {
  const n = Number(h);
  return Number.isFinite(n) ? n : 0;
};

const dve = (h: unknown): string => cislo(h).toFixed(2);

/** Desatinná čiarka a bodkočiarka ako oddeľovač — tak to číta slovenský Excel. */
const dveSk = (h: unknown): string => dve(h).replace(".", ",");

const text = (h: unknown): string => String(h ?? "").trim();

/** Text do CSV: bodkočiarka, úvodzovka ani nový riadok nesmú rozbiť riadok. */
function csvPole(h: unknown): string {
  const s = text(h).replace(/\r?\n/g, " ");
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Dobropis znižuje výnos, ale v databáze má kladné sumy — pre súpisku aj pre
 * Flexi mu treba otočiť znamienko, lebo oba doklady len sčítavajú.
 */
const znamienko = (typ: unknown, celkom?: unknown): number =>
  text(typ) === "credit_note" && !(Number(celkom) < 0) ? -1 : 1;

const NAZOV_TYPU: Record<string, string> = {
  regular: "Faktúra",
  proforma: "Zálohová faktúra",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
  advance_payment: "Doklad k prijatej platbe",
};

const NAZOV_UHRADY: Record<string, string> = {
  bank_transfer: "Prevod",
  cash: "Hotovosť",
  card: "Karta",
};

/** Sadzby na doklade od najvyššej — do stĺpcov rekapitulácie. */
function sadzby(polozky: PolozkaFaktury[]): number[] {
  return [...new Set(polozky.map((p) => cislo(p.vat_rate)))]
    .filter((r) => r > 0)
    .sort((a, b) => b - a);
}

function zaSadzbu(polozky: PolozkaFaktury[], sadzba: number, zn = 1) {
  const vybrane = polozky.filter((p) => cislo(p.vat_rate) === sadzba);
  return {
    zaklad: zn * vybrane.reduce((a, p) => a + cislo(p.subtotal), 0),
    dan: zn * vybrane.reduce((a, p) => a + cislo(p.vat_amount), 0),
  };
}

/**
 * Súpiska faktúr ako tabuľka — jeden riadok na doklad.
 *
 * Toto berie účtovníčka, ktorá má MRP, Premier, Helios alebo len Excel:
 * stĺpce sú pomenované po slovensky a rekapitulácia DPH je rozpísaná po
 * sadzbách, takže doklad sa dá zaúčtovať bez otvárania PDF.
 */
export function buildUniverzalCsv(opts: {
  invoices: { invoice: RiadokFaktury; items: PolozkaFaktury[] }[];
}): string {
  /* Stĺpce sadzieb podľa toho, čo sa v dávke naozaj vyskytlo — prázdne by len zavadzali. */
  const pouziteSadzby = [...new Set(opts.invoices.flatMap(({ items }) => sadzby(items)))].sort(
    (a, b) => b - a,
  );

  /* Stĺpce kurzu pribudnú len vtedy, keď je v dávke doklad v cudzej mene.
     Bez nich by si účtovníčka sčítala koruny s eurami do jedného súčtu. */
  const cudziaMena = opts.invoices.some(
    ({ invoice }) => (text(invoice.currency) || "EUR") !== "EUR",
  );

  const hlavicka = [
    "Číslo dokladu",
    "Typ dokladu",
    "Dátum vystavenia",
    "Dátum dodania",
    "Dátum splatnosti",
    "Odberateľ",
    "IČO",
    "DIČ",
    "IČ DPH",
    "Ulica",
    "Mesto",
    "PSČ",
    "Štát",
    "Mena",
    ...(cudziaMena ? ["Kurz"] : []),
    "Variabilný symbol",
    "Konštantný symbol",
    "Špecifický symbol",
    "Forma úhrady",
    ...pouziteSadzby.flatMap((r) => [`Základ ${r} %`, `DPH ${r} %`]),
    "Základ 0 %",
    "Zľava",
    "Základ spolu",
    "DPH spolu",
    "Celkom",
    ...(cudziaMena ? ["Celkom v EUR"] : []),
    "Prenos daňovej povinnosti",
    "Poznámka",
  ];

  const riadky = opts.invoices.map(({ invoice, items }) => {
    const zn = znamienko(invoice.type, invoice.total);
    const nulova =
      zn * items.filter((p) => cislo(p.vat_rate) === 0).reduce((a, p) => a + cislo(p.subtotal), 0);
    /* Suma v EUR: pri domácej mene je to tá istá suma, inak prepočet uložený na doklade. */
    const vEur =
      (text(invoice.currency) || "EUR") === "EUR" ? cislo(invoice.total) : cislo(invoice.total_eur);
    const bunky = [
      text(invoice.invoice_number),
      NAZOV_TYPU[text(invoice.type) || "regular"] ?? "Faktúra",
      text(invoice.issue_date),
      text(invoice.delivery_date) || text(invoice.issue_date),
      text(invoice.due_date),
      text(invoice.customer_name),
      text(invoice.customer_ico),
      text(invoice.customer_dic),
      text(invoice.customer_ic_dph),
      text(invoice.customer_street),
      text(invoice.customer_city),
      text(invoice.customer_zip),
      text(invoice.customer_country) || "SK",
      text(invoice.currency) || "EUR",
      ...(cudziaMena ? [invoice.exchange_rate ? dveSk(invoice.exchange_rate) : ""] : []),
      text(invoice.variable_symbol),
      text(invoice.constant_symbol),
      text(invoice.specific_symbol),
      NAZOV_UHRADY[text(invoice.payment_method)] ?? text(invoice.payment_method),
      ...pouziteSadzby.flatMap((r) => {
        const s = zaSadzbu(items, r, zn);
        return [dveSk(s.zaklad), dveSk(s.dan)];
      }),
      dveSk(nulova),
      dveSk(zn * cislo(invoice.discount_total)),
      dveSk(zn * cislo(invoice.subtotal)),
      dveSk(zn * cislo(invoice.vat_total)),
      dveSk(zn * cislo(invoice.total)),
      ...(cudziaMena ? [dveSk(zn * vEur)] : []),
      invoice.reverse_charge ? "áno" : "nie",
      text(invoice.notes) || text(invoice.intro_note),
    ];
    return bunky.map(csvPole).join(";");
  });

  return [hlavicka.map(csvPole).join(";"), ...riadky].join("\r\n") + "\r\n";
}

const esc = (h: unknown): string =>
  text(h)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * ABRA Flexi (winstrom) — dávka vydaných faktúr.
 *
 * Doklady idú ako `faktura-vydana` s položkami typu `typPolozky.obecny`;
 * sadzba sa neposiela číslom, ale priehradkou (`typSzbDph`), lebo Flexi si
 * percentá drží vo vlastnom číselníku podľa obdobia. Odberateľ sa nepáruje
 * na adresár — `nazFirmy` a adresa idú priamo na doklad, aby import
 * nespadol na chýbajúcom kóde firmy.
 *
 * Čo sa nevyváža a prečo:
 *  - **zálohová faktúra** — Flexi ju vedie ako vlastný typ „Záloha", ktorého
 *    kód si firma v číselníku premenúva. Poslať ju ako obyčajnú faktúru by
 *    v účtovníctve vyrobilo pohľadávku, ktorá neexistuje.
 *  - **cudzia mena** — základné polia (`sumZklCelkem`…) sú v domácej mene a
 *    cudzia patrí do `*Men` spolu s `kurz`om. Kým to nevieme naplniť z oboch
 *    strán, radšej doklad vynecháme, než by sme 10 000 Kč poslali ako eurá.
 */
export function buildFlexiXml(opts: {
  invoices: { invoice: RiadokFaktury; items: PolozkaFaktury[] }[];
}): { xml: string; preskocene: string[] } {
  const preskocene: string[] = [];
  const doklady: string[] = [];

  for (const { invoice, items } of opts.invoices) {
    const cislo_dokladu = text(invoice.invoice_number) || "?";
    const typ = text(invoice.type) || "regular";
    if (typ === "proforma") {
      preskocene.push(`${cislo_dokladu} — zálohová faktúra, Flexi ju vedie ako vlastný typ Záloha`);
      continue;
    }
    if (typ === "advance_payment") {
      preskocene.push(`${cislo_dokladu} — daňový doklad k prijatej platbe, vo Flexi ho založte k zálohe (účtuje sa len DPH)`);
      continue;
    }
    // Vyúčtovacia faktúra bez odpočtu by DPH zo zálohy priznala druhýkrát.
    if (cislo((invoice as any).advance_amount) > 0) {
      preskocene.push(`${cislo_dokladu} — faktúra s odpočtom zálohy, odpočet treba vo Flexi naviazať na zálohu ručne`);
      continue;
    }
    const mena = text(invoice.currency) || "EUR";
    if (mena !== "EUR") {
      preskocene.push(`${cislo_dokladu} — faktúra v mene ${mena}`);
      continue;
    }

    const zn = znamienko(typ, invoice.total);
    const zakladna = Math.max(0, ...items.map((p) => cislo(p.vat_rate)));
    const polozky = items
      .map((p) => {
        const sadzba = cislo(p.vat_rate);
        const priehradka =
          sadzba === 0
            ? "typSzbDph.dphOsv"
            : sadzba === zakladna
              ? "typSzbDph.dphZakl"
              : "typSzbDph.dphSniz";
        return `      <faktura-vydana-polozka>
        <nazev>${esc(p.name)}</nazev>
        <mnozMj>${dve(zn * cislo(p.quantity))}</mnozMj>
        <cenaMj>${dve(p.unit_price)}</cenaMj>
        <typCenyDphK>typCeny.bezDph</typCenyDphK>
        <typSzbDphK>${priehradka}</typSzbDphK>
        <szbDph>${dve(p.vat_rate)}</szbDph>
        <sumZkl>${dve(zn * cislo(p.subtotal))}</sumZkl>
        <sumDph>${dve(zn * cislo(p.vat_amount))}</sumDph>
        <sumCelkem>${dve(zn * cislo(p.total))}</sumCelkem>
      </faktura-vydana-polozka>`;
      })
      .join("\n");

    /* `typDokl` je odkaz do číselníka `typ-faktury-vydane`. Kódy FAKTURA a
       DOBROPIS sú v novej inštalácii predvolené; keď si ich firma premenovala,
       import spadne s jasnou hláškou — to je lepšie, než dobropis ticho
       zaúčtovaný ako faktúra. */
    const kodTypu = typ === "credit_note" ? "DOBROPIS" : "FAKTURA";

    doklady.push(`  <faktura-vydana>
    <kod>${esc(invoice.invoice_number)}</kod>
    <typDokl>code:${kodTypu}</typDokl>
    <datVyst>${esc(invoice.issue_date)}</datVyst>
    <duzpPuv>${esc(text(invoice.delivery_date) || text(invoice.issue_date))}</duzpPuv>
    <datSplat>${esc(invoice.due_date)}</datSplat>
    <varSym>${esc(invoice.variable_symbol)}</varSym>
    <mena>code:${esc(mena)}</mena>
    <nazFirmy>${esc(invoice.customer_name)}</nazFirmy>
    <ulice>${esc(invoice.customer_street)}</ulice>
    <mesto>${esc(invoice.customer_city)}</mesto>
    <psc>${esc(invoice.customer_zip)}</psc>
    <ic>${esc(invoice.customer_ico)}</ic>
    <dic>${esc(invoice.customer_ic_dph || invoice.customer_dic)}</dic>
    <popis>${esc(text(invoice.intro_note).slice(0, 255))}</popis>
    <poznam>${esc(text(invoice.notes).slice(0, 255))}</poznam>
    <sumZklCelkem>${dve(zn * cislo(invoice.subtotal))}</sumZklCelkem>
    <sumDphCelkem>${dve(zn * cislo(invoice.vat_total))}</sumDphCelkem>
    <sumCelkem>${dve(zn * cislo(invoice.total))}</sumCelkem>
    <polozkyFaktury>
${polozky}
    </polozkyFaktury>
  </faktura-vydana>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<winstrom version="1.0">
${doklady.join("\n")}
</winstrom>
`;
  return { xml, preskocene };
}
