/**
 * Demo dáta: vystavené doklady Demo s.r.o. — faktúry (aj v cudzej mene
 * s označeným prepočtom), zálohové faktúry, doklady k prijatej platbe,
 * dobropisy, úhrady, upomienky, e-maily, ponuky, prijaté objednávky,
 * opakované faktúry a číselné rady.
 *
 * Sumy sa počítajú z položiek (množstvo × cena − zľava → základ → DPH →
 * spolu, na centy), takže zoznam, detail aj prehľad sedia.
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA, FIRMA_CZ, MAJITEL, UCTOVNIK } from "./zaklad";
import { KONTAKTY, kontakt, kontaktData, produkt, PRODUKTY, type DemoKontakt } from "./kontakty";
import { cas, den, nahoda, pridajDni, r2, riadok, uid } from "./pomocne";

const IBAN = "SK00 0000 0000 0000 0000 0001";

/** Kurzy ECB (jednotiek meny za 1 EUR) — vymyslené, ale realistické. */
export const KURZY: Record<string, number> = { USD: 1.0842, CZK: 25.214, EUR: 1 };

type Polozka = {
  kluc?: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  discount_percent?: number;
};

function odberatel(k: DemoKontakt) {
  return {
    customer_id: kontakt(k.kluc),
    customer_name: k.name,
    customer_ico: k.ico,
    customer_dic: k.dic ?? null,
    customer_ic_dph: k.ic_dph ?? null,
    customer_street: k.street,
    customer_city: k.city,
    customer_zip: k.zip,
    customer_country: k.country,
    customer_email: k.email,
  };
}

function sumy(polozky: Polozka[]) {
  let subtotal = 0;
  let vat = 0;
  const riadky = polozky.map((p, i) => {
    const s = riadok(p.quantity, p.unit_price, p.vat_rate, p.discount_percent ?? 0);
    subtotal += s.subtotal;
    vat += s.vat_amount;
    return { ...p, ...s, position: i };
  });
  return { riadky, subtotal: r2(subtotal), vat_total: r2(vat), total: r2(subtotal + vat) };
}

function polozkaZProduktu(kluc: string, mnozstvo: number, zlava = 0, sadzba?: number): Polozka {
  const p = PRODUKTY.find((x) => x.kluc === kluc)!;
  return {
    kluc,
    name: p.name,
    quantity: mnozstvo,
    unit: p.unit,
    unit_price: p.unit_price,
    vat_rate: sadzba ?? p.vat_rate,
    discount_percent: zlava,
  };
}

export const FAKTURY: Riadok[] = [];

export function naplnFaktury(db: DemoDb) {
  const n = nahoda(20261101);

  /* ------------------------------------------------ číselné rady */
  const rady: [string, string, string][] = [
    ["invoice", "Faktúry", "{YYYY}{NNNN}"],
    ["proforma", "Zálohové faktúry", "ZF{YYYY}{NNN}"],
    ["credit_note", "Dobropisy", "DB{YYYY}{NNN}"],
    ["advance_payment", "Doklady k prijatej platbe", "DZ{YYYY}{NNN}"],
    ["quote", "Cenové ponuky", "CP{YYYY}{NNN}"],
    ["sales_order", "Prijaté objednávky", "OBJ{YYYY}{NNN}"],
    ["purchase_order", "Objednávky u dodávateľa", "OD{YYYY}{NNN}"],
    ["cash", "Pokladničné doklady", "PD{YYYY}{NNN}"],
    ["self_billing", "Samofaktúry", "SF{YYYY}{NNN}"],
  ];
  db.vloz(
    "number_series",
    rady.map(([kind, name, format]) => ({
      id: uid(`rad:${kind}`),
      company_id: FIRMA,
      kind,
      name,
      format,
      is_default: true,
      active: true,
      start_from: 1,
      created_at: cas(-400),
    })),
  );
  db.vloz("number_series", [
    {
      id: uid("rad:invoice:pobocka"),
      company_id: FIRMA,
      kind: "invoice",
      name: "Pobočka Košice",
      format: "KE{YYYY}{NNN}",
      is_default: false,
      active: true,
      start_from: 1,
      created_at: cas(-200),
    },
  ]);

  const cisla = new Map<string, number>();
  const cislo = (format: string, datum: string) => {
    const rok = datum.slice(0, 4);
    const kl = format + rok;
    const nn = (cisla.get(kl) ?? 0) + 1;
    cisla.set(kl, nn);
    return format
      .replace("{YYYY}", rok)
      .replace(/\{(N+)\}/, (_m, ns: string) => String(nn).padStart(ns.length, "0"));
  };

  const odberatelia = KONTAKTY.filter((k) => k.odberatel);
  const sablonyPoloziek: (() => Polozka[])[] = [
    () => [polozkaZProduktu("konz", n.cele(2, 12)), polozkaZProduktu("doprava", n.cele(40, 220))],
    () => [polozkaZProduktu("vyvoj", n.cele(10, 60))],
    () => [
      polozkaZProduktu("notebook", n.cele(1, 4), n.sanca(0.3) ? 5 : 0),
      polozkaZProduktu("mys", n.cele(1, 4)),
      polozkaZProduktu("kabel", n.cele(1, 6)),
    ],
    () => [polozkaZProduktu("podpora", 1), polozkaZProduktu("hosting", 1)],
    () => [polozkaZProduktu("skolenie", n.cele(1, 3)), polozkaZProduktu("kniha", n.cele(5, 20))],
    () => [
      polozkaZProduktu("monitor", n.cele(1, 5)),
      polozkaZProduktu("stolicka", n.cele(1, 3), 10),
    ],
    () => [polozkaZProduktu("dlhy", n.cele(1, 2)), polozkaZProduktu("doprava", n.cele(30, 90))],
    () => [polozkaZProduktu("licencia", n.cele(1, 10)), polozkaZProduktu("konz", 2)],
    () => [polozkaZProduktu("papier", n.cele(10, 40)), polozkaZProduktu("kava", n.cele(2, 6))],
  ];

  const faktury: Riadok[] = [];
  const formatDokladu = new Map<string, string>();
  const polozkyVsetky: Riadok[] = [];
  const platby: Riadok[] = [];
  const upomienky: Riadok[] = [];
  const maily: Riadok[] = [];

  const pridajDoklad = (
    zaklad: Partial<Riadok> & {
      type: string;
      issue_date: string;
      kontakt: DemoKontakt;
      polozky: Polozka[];
      mena?: string;
      format: string;
      splatnost?: number;
    },
  ) => {
    const { riadky, subtotal, vat_total, total } = sumy(zaklad.polozky);
    const zn = zaklad.type === "credit_note" ? -1 : 1;
    const mena = zaklad.mena ?? "EUR";
    const kurz = KURZY[mena] ?? 1;
    const id = uid(`faktura:${zaklad.type}:${faktury.length}`);
    const cisloDokladu = cislo(zaklad.format, zaklad.issue_date);
    const splatnost = pridajDni(zaklad.issue_date, zaklad.splatnost ?? 14);
    const { kontakt: k, polozky: _p, mena: _m, format: _f, splatnost: _s, ...zvysok } = zaklad;
    const f: Riadok = {
      id,
      company_id: FIRMA,
      created_by: MAJITEL,
      invoice_number: cisloDokladu,
      variable_symbol: cisloDokladu.replace(/\D/g, ""),
      constant_symbol: "0308",
      delivery_date: zaklad.issue_date,
      due_date: splatnost,
      currency: mena,
      subtotal: zn * subtotal,
      vat_total: zn * vat_total,
      total: zn * total,
      payment_method: "bank_transfer",
      payment_iban: IBAN,
      payment_swift: "DEMOSKBX",
      payment_bank_name: "Demo banka",
      payment_account_id: uid("ucet-firmy:hlavny"),
      language: k.country === "SK" ? "sk" : k.country === "CZ" ? "cs" : "en",
      public_token: uid(`token:${id}`).replace(/-/g, ""),
      pdf_token: uid(`pdf:${id}`).replace(/-/g, ""),
      created_at: zaklad.issue_date + "T09:15:00.000Z",
      updated_at: zaklad.issue_date + "T09:15:00.000Z",
      ...odberatel(k),
      ...zvysok,
    };
    if (mena !== "EUR") {
      f.exchange_rate = kurz;
      f.exchange_rate_date = pridajDni(zaklad.issue_date, -1);
      f.exchange_rate_source = "ECB";
      f.subtotal_eur = r2(f.subtotal / kurz);
      f.vat_total_eur = r2(f.vat_total / kurz);
      f.total_eur = r2(f.subtotal_eur + f.vat_total_eur);
    }
    formatDokladu.set(id, zaklad.format);
    faktury.push(f);
    for (const p of riadky) {
      polozkyVsetky.push({
        id: uid(`polozka:${id}:${p.position}`),
        invoice_id: id,
        product_id: p.kluc ? produkt(p.kluc) : null,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        unit_price: p.unit_price,
        vat_rate: p.vat_rate,
        discount_percent: p.discount_percent ?? 0,
        subtotal: zn * p.subtotal,
        vat_amount: zn * p.vat_amount,
        total: zn * p.total,
        position: p.position,
        created_at: f.created_at,
      });
    }
    return f;
  };

  /* ------------------------------------------------ bežné faktúry za 13 mesiacov */
  const POCET = 118;
  const datumy = Array.from(
    { length: POCET },
    (_, i) => -395 + Math.floor((i * 393) / POCET) + n.cele(0, 2),
  ).sort((a, b) => a - b);
  datumy.forEach((posun, i) => {
    const datum = den(posun);
    let k = odberatelia[(i * 7 + n.cele(0, 3)) % odberatelia.length];
    let mena = "EUR";
    if (k.kluc === "omikron") mena = "USD";
    if (k.kluc === "kappa") mena = "CZK";
    let polozky = n.vyber(sablonyPoloziek)();
    let pdp: Partial<Riadok> = {};
    if (k.kluc === "iota" || k.kluc === "omikron") {
      // Služby do zahraničia — prenesenie daňovej povinnosti, bez DPH.
      polozky = [{ ...polozkaZProduktu("vyvoj", n.cele(20, 80)), vat_rate: 0 }];
      pdp = { reverse_charge: true, eu_plnenie: k.country === "AT" ? "sluzby" : null };
    }
    if (mena !== "EUR")
      polozky = polozky.map((p) => ({ ...p, unit_price: r2(p.unit_price * KURZY[mena]) }));
    const splatnost = k.kluc === "alfa" ? 30 : 14;
    const due = pridajDni(datum, splatnost);
    const dnes = den(0);
    // Stav podľa veku: staršie zaplatené, časť po splatnosti, nové odoslané/vystavené.
    let status = "paid";
    const vek = -posun;
    if (vek < 12) status = n.vyber(["sent", "issued", "sent", "draft"]);
    else if (vek < 60) status = n.sanca(0.45) ? "sent" : "paid";
    else if (vek < 150) status = n.sanca(0.12) ? "sent" : "paid";
    if (i === 40 || i === 77) status = "cancelled";
    // Koncepty (rozpracované, nevystavené) — aj starší zabudnutý.
    if (i === POCET - 2 || i === POCET - 7 || i === 95) status = "draft";
    const zaplatena = status === "paid";
    const platbaDen = zaplatena
      ? pridajDni(datum, Math.min(splatnost + n.cele(-10, 12), Math.max(1, vek - 1)))
      : null;
    const f = pridajDoklad({
      type: "regular",
      issue_date: datum,
      kontakt: k,
      polozky,
      mena,
      format: "{YYYY}{NNNN}",
      splatnost,
      status,
      paid_at: zaplatena ? platbaDen + "T10:00:00.000Z" : null,
      sent_at: status !== "draft" && status !== "issued" ? datum + "T09:30:00.000Z" : null,
      cancelled_at: status === "cancelled" ? pridajDni(datum, 2) + "T12:00:00.000Z" : null,
      notes:
        i % 9 === 0
          ? "Ďakujeme za objednávku. Tovar zostáva do úplného zaplatenia majetkom dodávateľa."
          : null,
      order_number: i % 5 === 0 ? `OBJ-${2000 + i}` : null,
      stitky: i % 11 === 0 ? ["projekt A"] : i % 13 === 0 ? ["dôležité", "web"] : [],
      zauctovane_at:
        vek > 45 && status !== "draft" ? pridajDni(datum, 20) + "T08:00:00.000Z" : null,
      exported_at: vek > 45 && status !== "draft" ? pridajDni(datum, 20) + "T08:00:00.000Z" : null,
      pohoda_predkontacia: vek > 45 ? "3Fv" : null,
      pohoda_clenenie_dph: vek > 45 ? (pdp.reverse_charge ? "UDpdp" : "UD") : null,
      ...pdp,
    });
    if (zaplatena) {
      platby.push({
        id: uid(`platba:${f.id}`),
        company_id: FIRMA,
        invoice_id: f.id,
        amount: f.total,
        method: "bank_transfer",
        paid_at: platbaDen,
        note: "Úhrada z bankového výpisu",
        created_at: platbaDen + "T10:00:00.000Z",
      });
    }
    if (f.sent_at) {
      maily.push({
        id: uid(`mail:${f.id}`),
        company_id: FIRMA,
        invoice_id: f.id,
        recipient_email: k.email,
        subject: `Faktúra ${f.invoice_number}`,
        message: "Dobrý deň,\n\nv prílohe Vám posielame faktúru.\n\nĎakujeme za spoluprácu.",
        status: "sent",
        provider_message_id: `demo-${i}`,
        sent_at: f.sent_at,
        created_at: f.sent_at,
      });
    }
    // Upomienky k neuhradeným po splatnosti
    if (!zaplatena && status === "sent" && due < dnes) {
      const dniPo = Math.round((Date.parse(dnes) - Date.parse(due)) / 86400000);
      const pocet = dniPo > 14 ? 3 : dniPo > 7 ? 2 : dniPo > 3 ? 1 : 0;
      for (let r = 1; r <= pocet; r++) {
        upomienky.push({
          id: uid(`upomienka:${f.id}:${r}`),
          company_id: FIRMA,
          invoice_id: f.id,
          reminder_number: r,
          email_to: k.email,
          subject: `${r}. upomienka – faktúra ${f.invoice_number}`,
          message: "Dobrý deň, evidujeme neuhradenú faktúru po splatnosti. Prosíme o úhradu.",
          status: "sent",
          triggered_by: r === 3 ? "manual" : "auto",
          sent_at: pridajDni(due, [3, 7, 14][r - 1]) + "T08:00:00.000Z",
          created_at: pridajDni(due, [3, 7, 14][r - 1]) + "T08:00:00.000Z",
        });
      }
    }
  });

  /* ------------------------------------------------ zálohové faktúry + doklady k platbe + vyúčtovanie */
  for (let i = 0; i < 9; i++) {
    const posun = -300 + i * 33;
    const k = odberatelia[(i * 3 + 1) % 8];
    const polozky = [
      {
        name: `Záloha na dodávku – projekt ${String.fromCharCode(65 + i)}`,
        quantity: 1,
        unit: "ks",
        unit_price: 500 + i * 250,
        vat_rate: 23,
      },
    ];
    const zaplatena = i < 7;
    const zf = pridajDoklad({
      type: "proforma",
      issue_date: den(posun),
      kontakt: k,
      polozky,
      format: "ZF{YYYY}{NNN}",
      status: zaplatena ? "paid" : "sent",
      paid_at: zaplatena ? den(posun + 5) + "T10:00:00.000Z" : null,
      sent_at: den(posun) + "T10:00:00.000Z",
    });
    if (!zaplatena) continue;
    platby.push({
      id: uid(`platba:${zf.id}`),
      company_id: FIRMA,
      invoice_id: zf.id,
      amount: zf.total,
      method: "bank_transfer",
      paid_at: den(posun + 5),
      created_at: cas(posun + 5),
    });
    // Daňový doklad k prijatej platbe
    pridajDoklad({
      type: "advance_payment",
      issue_date: den(posun + 5),
      kontakt: k,
      polozky,
      format: "DZ{YYYY}{NNN}",
      status: "paid",
      paid_at: den(posun + 5) + "T10:00:00.000Z",
      advance_invoice_id: zf.id,
    });
    // Ostrá faktúra s odpočtom zálohy (prvých 5)
    if (i < 5) {
      const plnenie = [
        {
          name: `Dodávka – projekt ${String.fromCharCode(65 + i)}`,
          quantity: 1,
          unit: "ks",
          unit_price: 1500 + i * 400,
          vat_rate: 23,
        },
        {
          name: "Odpočet zálohy " + zf.invoice_number,
          quantity: -1,
          unit: "ks",
          unit_price: polozky[0].unit_price,
          vat_rate: 23,
        },
      ];
      const fin = pridajDoklad({
        type: "regular",
        issue_date: den(posun + 20),
        kontakt: k,
        polozky: plnenie,
        format: "{YYYY}{NNNN}",
        status: posun + 20 < -30 ? "paid" : "sent",
        paid_at: posun + 20 < -30 ? den(posun + 30) + "T10:00:00.000Z" : null,
        sent_at: den(posun + 20) + "T10:00:00.000Z",
        advance_invoice_id: zf.id,
        advance_amount: zf.total,
      });
      db.vloz("invoice_advances", [
        {
          id: uid(`zaloha:${fin.id}`),
          company_id: FIRMA,
          invoice_id: fin.id,
          advance_invoice_id: zf.id,
          amount: zf.total,
          created_at: fin.created_at,
        },
      ]);
      if (fin.status === "paid") {
        platby.push({
          id: uid(`platba:${fin.id}`),
          company_id: FIRMA,
          invoice_id: fin.id,
          amount: fin.total,
          method: "bank_transfer",
          paid_at: den(posun + 30),
          created_at: cas(posun + 30),
        });
      }
    }
  }

  /* ------------------------------------------------ dobropisy (záporné sumy) */
  const naDobropis = faktury
    .filter((f) => f.type === "regular" && f.status === "paid" && f.currency === "EUR")
    .slice(5, 30);
  naDobropis
    .filter((_, i) => i % 5 === 0)
    .forEach((povodna, i) => {
      const k = KONTAKTY.find((x) => kontakt(x.kluc) === povodna.customer_id)!;
      const db1 = pridajDoklad({
        type: "credit_note",
        issue_date: pridajDni(povodna.issue_date, 12),
        kontakt: k,
        polozky: [
          {
            name: i === 0 ? "Vrátenie reklamovaného tovaru" : "Zľava za oneskorenú dodávku",
            quantity: 1,
            unit: "ks",
            unit_price: r2(Math.abs(povodna.subtotal) * 0.1),
            vat_rate: 23,
          },
        ],
        format: "DB{YYYY}{NNN}",
        status: i < 3 ? "paid" : "sent",
        paid_at: i < 3 ? pridajDni(povodna.issue_date, 20) + "T10:00:00.000Z" : null,
        sent_at: pridajDni(povodna.issue_date, 12) + "T10:00:00.000Z",
        opravuje_fakturu_id: povodna.id,
        notes: `Opravný doklad k faktúre ${povodna.invoice_number}.`,
      });
      void db1;
    });

  /* ------------------------------------------------ jedna faktúra s dlhým textom a veľa položkami */
  pridajDoklad({
    type: "regular",
    issue_date: den(-3),
    kontakt: kontaktData("dlhy"),
    polozky: PRODUKTY.slice(0, 14).map((p, i) => ({
      kluc: p.kluc,
      name: p.name,
      quantity: (i % 4) + 1,
      unit: p.unit,
      unit_price: p.unit_price,
      vat_rate: p.vat_rate,
      discount_percent: i % 5 === 0 ? 10 : 0,
    })),
    format: "{YYYY}{NNNN}",
    status: "sent",
    sent_at: den(-3) + "T11:00:00.000Z",
    intro_note:
      "Fakturujeme Vám dodávku tovaru a služieb podľa zmluvy o dielo č. 2026/0042 zo dňa 1. 9. 2026 vrátane dopravy, montáže a zaškolenia obsluhy na mieste realizácie.",
    notes:
      "Dlhá poznámka pre test zalamovania: Tovar zostáva až do úplného zaplatenia kúpnej ceny vo vlastníctve predávajúceho. Reklamácie uplatňujte písomne do 14 dní od prevzatia tovaru. Pri platbe uveďte variabilný symbol.",
    stitky: ["veľká zákazka", "montáž", "zaškolenie"],
  });

  /*
   * Čísla sa pri tvorbe dávali v poradí vzniku — zálohy a ich vyúčtovanie by
   * mali vysoké číslo so starým dátumom. Prečíslovanie podľa dátumu vystavenia
   * (v rámci radu a roka) a oprava odkazov na čísla v textoch.
   */
  {
    const skupiny = new Map<string, Riadok[]>();
    for (const f of faktury) {
      const k = `${formatDokladu.get(f.id)}|${String(f.issue_date).slice(0, 4)}`;
      skupiny.set(k, [...(skupiny.get(k) ?? []), f]);
    }
    const nove = new Map<string, string>();
    for (const [k, fs] of skupiny) {
      const [format, rok] = k.split("|");
      fs.sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)));
      fs.forEach((f, i) => {
        const c = format
          .replace("{YYYY}", rok)
          .replace(/\{(N+)\}/, (_m, ns: string) => String(i + 1).padStart(ns.length, "0"));
        nove.set(f.invoice_number, c);
      });
    }
    const docasne = (t: string) =>
      t
        .replace(/\b[A-Z]{0,2}\d{7,8}\b/g, (m) => (nove.has(m) ? `\u0000${nove.get(m)}\u0000` : m))
        .replace(/\u0000/g, "");
    for (const f of faktury) {
      f.invoice_number = nove.get(f.invoice_number) ?? f.invoice_number;
      f.variable_symbol = f.invoice_number.replace(/\D/g, "");
      if (f.notes) f.notes = docasne(f.notes);
    }
    for (const p of polozkyVsetky) p.name = docasne(p.name);
    for (const m of maily) m.subject = docasne(m.subject);
    for (const u of upomienky) u.subject = docasne(u.subject);
  }

  db.vloz("invoices", faktury);
  db.vloz("invoice_items", polozkyVsetky);
  db.vloz("payments", platby);
  db.vloz("invoice_reminders", upomienky);
  db.vloz("invoice_email_logs", maily);
  FAKTURY.length = 0;
  FAKTURY.push(...faktury);

  // Prílohy a história zmien pri niekoľkých faktúrach
  const sPrilohou = faktury.filter((f) => f.type === "regular").slice(-6);
  db.vloz(
    "invoice_attachments",
    sPrilohou.map((f, i) => ({
      id: uid(`priloha:${f.id}`),
      company_id: FIRMA,
      invoice_id: f.id,
      name: i % 2 ? "dodaci-list.pdf" : "objednavka-zakaznika.pdf",
      mime: "application/pdf",
      path: `${FIRMA}/${f.id}/${i % 2 ? "dodaci-list.pdf" : "objednavka-zakaznika.pdf"}`,
      size: 48211,
      created_by: MAJITEL,
      created_at: f.created_at,
    })),
  );
  db.vloz(
    "historia_dokladov",
    faktury
      .filter((f) => f.status === "paid")
      .slice(-10)
      .flatMap((f, i) => [
        {
          id: uid(`hist:${f.id}:1`),
          company_id: FIRMA,
          agenda: "faktura",
          doklad_id: f.id,
          pole: "due_date",
          pred: pridajDni(f.due_date, -7),
          po: f.due_date,
          kto: i % 2 ? UCTOVNIK : MAJITEL,
          kedy: f.created_at,
        },
        {
          id: uid(`hist:${f.id}:2`),
          company_id: FIRMA,
          agenda: "faktura",
          doklad_id: f.id,
          pole: "status",
          pred: "sent",
          po: "paid",
          kto: MAJITEL,
          kedy: f.paid_at,
        },
      ]),
  );

  /* ------------------------------------------------ cenové ponuky */
  const ponukyStavy = [
    "draft",
    "sent",
    "sent",
    "accepted",
    "rejected",
    "expired",
    "converted",
    "sent",
    "accepted",
    "draft",
    "sent",
    "converted",
    "sent",
    "rejected",
  ];
  const ponuky: Riadok[] = [];
  const ponukyPolozky: Riadok[] = [];
  ponukyStavy.forEach((stav, i) => {
    const posun = -150 + i * 11;
    const k = odberatelia[(i * 5 + 2) % odberatelia.length];
    const { riadky, subtotal, vat_total, total } = sumy(n.vyber(sablonyPoloziek)());
    const id = uid(`ponuka:${i}`);
    const datum = den(posun);
    const konvertovana =
      stav === "converted"
        ? faktury.find(
            (f) =>
              f.type === "regular" && f.customer_id === kontakt(k.kluc) && f.issue_date >= datum,
          )
        : null;
    ponuky.push({
      id,
      company_id: FIRMA,
      created_by: MAJITEL,
      quote_number: cislo("CP{YYYY}{NNN}", datum),
      issue_date: datum,
      valid_until: pridajDni(datum, 30),
      status: stav,
      currency: "EUR",
      subtotal,
      vat_total,
      total,
      sent_at: stav !== "draft" ? datum + "T10:00:00.000Z" : null,
      responded_at: ["accepted", "rejected", "converted"].includes(stav)
        ? pridajDni(datum, 4) + "T14:00:00.000Z"
        : null,
      response_note: stav === "rejected" ? "Ďakujeme, zvolili sme inú ponuku." : null,
      converted_at: konvertovana ? konvertovana.created_at : null,
      converted_invoice_id: konvertovana?.id ?? null,
      approval_token: uid(`ponuka-token:${i}`).replace(/-/g, ""),
      notes:
        i === 3 ? "Cena platí pri objednávke do konca mesiaca. Dodacia lehota 3 týždne." : null,
      created_at: datum + "T09:00:00.000Z",
      ...odberatel(k),
    });
    for (const p of riadky) {
      ponukyPolozky.push({
        id: uid(`ponuka-polozka:${id}:${p.position}`),
        quote_id: id,
        product_id: p.kluc ? produkt(p.kluc) : null,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        unit_price: p.unit_price,
        vat_rate: p.vat_rate,
        discount_percent: p.discount_percent ?? 0,
        subtotal: p.subtotal,
        vat_amount: p.vat_amount,
        total: p.total,
        position: p.position,
      });
    }
  });
  db.vloz("quotes", ponuky);
  db.vloz("quote_items", ponukyPolozky);

  /* ------------------------------------------------ prijaté objednávky */
  const objStavy = [
    "draft",
    "confirmed",
    "confirmed",
    "partially_invoiced",
    "completed",
    "completed",
    "cancelled",
    "confirmed",
    "partially_invoiced",
    "confirmed",
  ];
  const objednavky: Riadok[] = [];
  const objPolozky: Riadok[] = [];
  objStavy.forEach((stav, i) => {
    const posun = -90 + i * 9;
    const k = odberatelia[(i * 4 + 1) % odberatelia.length];
    const pol = [
      polozkaZProduktu("notebook", (i % 3) + 1),
      polozkaZProduktu("monitor", (i % 2) + 1),
      polozkaZProduktu("kabel", 4),
    ];
    const { riadky, subtotal, vat_total, total } = sumy(pol);
    const id = uid(`objednavka:${i}`);
    const datum = den(posun);
    objednavky.push({
      id,
      company_id: FIRMA,
      created_by: MAJITEL,
      order_number: cislo("OBJ{YYYY}{NNN}", datum),
      order_date: datum,
      requested_date: pridajDni(datum, 14),
      customer_order_number: `PO-${4500 + i}`,
      status: stav,
      currency: "EUR",
      subtotal,
      vat_total,
      total,
      confirmed_at: stav !== "draft" ? datum + "T12:00:00.000Z" : null,
      note: i === 1 ? "Doručiť na prevádzku, nie do sídla." : null,
      customer_id: kontakt(k.kluc),
      customer_name: k.name,
      customer_email: k.email,
      customer_ico: k.ico,
      created_at: datum + "T09:00:00.000Z",
    });
    for (const p of riadky) {
      const vyfakturovane =
        stav === "completed"
          ? p.quantity
          : stav === "partially_invoiced" && p.position === 0
            ? p.quantity
            : 0;
      objPolozky.push({
        id: uid(`obj-polozka:${id}:${p.position}`),
        sales_order_id: id,
        product_id: p.kluc ? produkt(p.kluc) : null,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        unit_price: p.unit_price,
        vat_rate: p.vat_rate,
        invoiced_quantity: vyfakturovane,
        position: p.position,
      });
    }
  });
  db.vloz("sales_orders", objednavky);
  db.vloz("sales_order_items", objPolozky);

  /* ------------------------------------------------ opakované faktúry */
  const opak: [string, string, Polozka[], string, boolean][] = [
    ["Mesačná podpora – Alfa Stavby", "alfa", [polozkaZProduktu("podpora", 1)], "monthly", true],
    ["Hosting – Beta Logistik", "beta", [polozkaZProduktu("hosting", 3)], "monthly", true],
    [
      "Štvrťročný servis – Ni Hotel",
      "ni",
      [polozkaZProduktu("konz", 6), polozkaZProduktu("doprava", 120)],
      "quarterly",
      true,
    ],
    [
      "Ročná licencia – Epsilon Medical",
      "epsilon",
      [polozkaZProduktu("licencia", 12)],
      "yearly",
      true,
    ],
    [
      "Týždenný upratovací balík – Zeta Kaviareň",
      "zeta",
      [{ name: "Upratovanie prevádzky", quantity: 1, unit: "týž", unit_price: 85, vat_rate: 23 }],
      "weekly",
      false,
    ],
    [
      "Prenájom techniky – Stredoeurópske centrum (dlhý názov šablóny pre test zalamovania)",
      "dlhy",
      [polozkaZProduktu("notebook", 1), polozkaZProduktu("monitor", 2)],
      "monthly",
      true,
    ],
  ];
  const opakRiadky: Riadok[] = [];
  const opakLogy: Riadok[] = [];
  opak.forEach(([nazov, kl, pol, frekv, aktivna], i) => {
    const k = kontaktData(kl);
    const { subtotal, vat_total, total } = sumy(pol);
    const id = uid(`opakovana:${i}`);
    const posledna = faktury
      .filter((f) => f.customer_id === kontakt(kl) && f.type === "regular")
      .at(-1);
    opakRiadky.push({
      id,
      company_id: FIRMA,
      created_by: MAJITEL,
      name: nazov,
      frequency: frekv,
      next_run: den(
        frekv === "weekly" ? 3 : frekv === "monthly" ? 5 + i : frekv === "quarterly" ? 40 : 120,
      ),
      currency: "EUR",
      due_days: 14,
      payment_method: "bank_transfer",
      active: aktivna,
      items: pol.map(({ kluc: _k, ...p }) => ({ ...p, product_id: _k ? produkt(_k) : null })),
      subtotal,
      vat_total,
      total,
      last_run_at: posledna ? posledna.created_at : null,
      last_invoice_id: posledna?.id ?? null,
      intro_note: "",
      notes: null,
      created_at: cas(-300 + i * 10),
      ...odberatel(k),
    });
    for (let m = 1; m <= 4; m++) {
      opakLogy.push({
        id: uid(`opak-log:${id}:${m}`),
        company_id: FIRMA,
        recurring_invoice_id: id,
        invoice_id: m === 1 ? (posledna?.id ?? null) : null,
        status: m === 3 && i === 2 ? "failed" : "success",
        error_message: m === 3 && i === 2 ? "Odberateľ nemá vyplnený e-mail (demo)" : null,
        run_type: "automatic",
        created_at: cas(-30 * m),
      });
    }
  });
  db.vloz("recurring_invoices", opakRiadky);
  db.vloz("recurring_invoice_logs", opakLogy);

  /* ------------------------------------------------ česká firma — pár faktúr v CZK */
  const czKontakt = {
    kluc: "cz:1",
    name: "Ukázková obchodní s.r.o.",
    ico: "40000001",
    dic: "CZ40000001",
    ic_dph: "CZ40000001",
    street: "Hlavní 1",
    city: "Praha",
    zip: "110 00",
    country: "CZ",
    email: "fakturace@ukazkova.example",
    odberatel: true,
    dodavatel: false,
  } as DemoKontakt;
  const czFaktury: Riadok[] = [];
  const czPolozky: Riadok[] = [];
  for (let i = 0; i < 12; i++) {
    const datum = den(-170 + i * 14);
    const pol = [
      { name: "Konzultační služby", quantity: 4 + i, unit: "hod", unit_price: 1450, vat_rate: 21 },
      { name: "Cestovné", quantity: 1, unit: "ks", unit_price: 380, vat_rate: 21 },
    ];
    const { riadky, subtotal, vat_total, total } = sumy(pol);
    const id = uid(`cz-faktura:${i}`);
    const c = `${datum.slice(0, 4)}${String(i + 1).padStart(4, "0")}`;
    czFaktury.push({
      id,
      company_id: FIRMA_CZ,
      invoice_number: c,
      variable_symbol: c,
      type: "regular",
      status: i < 9 ? "paid" : "sent",
      issue_date: datum,
      delivery_date: datum,
      due_date: pridajDni(datum, 14),
      paid_at: i < 9 ? pridajDni(datum, 10) + "T10:00:00Z" : null,
      currency: "CZK",
      subtotal,
      vat_total,
      total,
      language: "cs",
      payment_iban: "CZ00 0000 0000 0000 0000 0002",
      created_by: MAJITEL,
      created_at: datum + "T09:00:00Z",
      ...odberatel(czKontakt),
      customer_id: uid("kontakt:cz:1"),
    });
    riadky.forEach((p) =>
      czPolozky.push({
        id: uid(`cz-polozka:${id}:${p.position}`),
        invoice_id: id,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        unit_price: p.unit_price,
        vat_rate: p.vat_rate,
        subtotal: p.subtotal,
        vat_amount: p.vat_amount,
        total: p.total,
        position: p.position,
      }),
    );
  }
  db.vloz("invoices", czFaktury);
  db.vloz("invoice_items", czPolozky);
}
