/**
 * Demo dáta: banka a pokladňa Demo s.r.o.
 *
 * - bankové účty firmy (na faktúre) + pripojenia a účty z banky,
 * - pohyby za ~6 mesiacov: príjmy spárované s úhradami faktúr (`payments`),
 *   výdavky spárované s prijatými faktúrami a bločkami (ak ich modul doklady
 *   naplnil), splátky leasingu/úveru, poplatky, nespárované pohyby a pár
 *   platieb s VS otvorených faktúr na stránku „Párovanie“,
 * - zostatky účtov = počiatočný stav + súčet pohybov (každá mena zvlášť),
 * - výpisy (PDF + XML), príkazy na úhradu, e-mailové notifikácie banky,
 * - financovanie (leasing, úver s pohyblivou sadzbou, kontokorent) so
 *   splátkovým kalendárom istina + úrok + DPH = splátka,
 * - pokladňa — príjmy/výdaje, zostatok (aj s bločkami v hotovosti) nikdy záporný.
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA, MAJITEL, UCTOVNIK } from "./zaklad";
import { FAKTURY } from "./faktury";
import { cas, den, nahoda, pridajDni, r2, uid } from "./pomocne";

const OKNO = 180; // dní histórie pohybov

export const UCET_HLAVNY = uid("bank-ucet:hlavny");
export const UCET_REZERVA = uid("bank-ucet:rezerva");
export const UCET_USD = uid("bank-ucet:usd");
export const UCET_STARY = uid("bank-ucet:stary");
export const UCET_EMAIL = uid("bank-ucet:email");

const IBAN_HLAVNY = "SK00 0000 0000 0000 0000 0001";
const IBAN_REZERVA = "SK00 0000 0000 0000 0000 0011";
const IBAN_USD = "SK00 0000 0000 0000 0000 0021";
const IBAN_STARY = "SK00 1100 0000 0000 0000 0031";
const IBAN_EMAIL = "SK00 0900 0000 0000 0000 0041";

const bezMedzier = (iban: string) => iban.replace(/\s/g, "");

/** Anuitná splátka (bez DPH). */
function anuita(istina: number, rocnaSadzba: number, mesiacov: number) {
  const i = rocnaSadzba / 100 / 12;
  if (i === 0) return istina / mesiacov;
  return (istina * i) / (1 - Math.pow(1 + i, -mesiacov));
}

function posunMesiac(datum: string, n: number) {
  const d = new Date(datum + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function naplnBanka(db: DemoDb) {
  const n = nahoda(4242);
  const dnes = den(0);
  const od = den(-OKNO);

  /* ------------------------------------------------ účty firmy (na faktúrach) */
  db.vloz("company_bank_accounts", [
    {
      id: uid("ucet-firmy:hlavny"),
      company_id: FIRMA,
      name: "Hlavný účet",
      iban: IBAN_HLAVNY,
      swift: "DEMOSKBX",
      bank_name: "Demo banka (Tatra banka)",
      currency: "EUR",
      is_default: true,
      position: 0,
      pohoda_skratka: "TB",
      created_at: cas(-420),
    },
    {
      id: uid("ucet-firmy:rezerva"),
      company_id: FIRMA,
      name: "Rezervný účet",
      iban: IBAN_REZERVA,
      swift: "DEMOSKBX",
      bank_name: "Demo banka (Tatra banka)",
      currency: "EUR",
      is_default: false,
      position: 1,
      pohoda_skratka: "TB2",
      created_at: cas(-300),
    },
    {
      id: uid("ucet-firmy:usd"),
      company_id: FIRMA,
      name: "Dolárový účet",
      iban: IBAN_USD,
      swift: "DEMOSKBX",
      bank_name: "Demo banka (Tatra banka)",
      currency: "USD",
      is_default: false,
      position: 2,
      pohoda_skratka: "USD",
      created_at: cas(-250),
    },
  ]);

  /* ------------------------------------------------ pripojenia a účty z banky */
  const CONN_TB = uid("bank-conn:tb");
  const CONN_IMPORT = uid("bank-conn:import");
  const CONN_STARY = uid("bank-conn:tb-stary");
  const CONN_EMAIL = uid("bank-conn:email");
  db.vloz("bank_connections", [
    {
      id: CONN_TB,
      company_id: FIRMA,
      provider: "tatrabanka",
      status: "connected",
      consent_id: "demo-consent-1",
      access_token: "demo",
      refresh_token: "demo",
      token_expires_at: cas(64),
      last_synced_at: cas(0, 6, 5),
      metadata: { demo: true },
      created_at: cas(-200),
    },
    {
      id: CONN_IMPORT,
      company_id: FIRMA,
      provider: "import",
      status: "connected",
      last_synced_at: cas(-6, 14),
      metadata: { zdroj: "camt.053" },
      created_at: cas(-250),
    },
    // Súhlas vypršal — karta ukáže „Súhlas banky vypršal…“ a účet „Pohyby sa nesťahujú“.
    {
      id: CONN_STARY,
      company_id: FIRMA,
      provider: "tatrabanka",
      status: "connected",
      consent_id: "demo-consent-0",
      access_token: "demo",
      refresh_token: "demo",
      token_expires_at: cas(-9),
      last_synced_at: cas(-9, 6, 5),
      metadata: { demo: true },
      created_at: cas(-400),
    },
    {
      id: CONN_EMAIL,
      company_id: FIRMA,
      provider: "email",
      status: "connected",
      last_synced_at: cas(-1, 16, 20),
      metadata: {},
      created_at: cas(-120),
    },
  ]);

  /* ------------------------------------------------ pohyby */
  const pohyby: Riadok[] = [];
  let poradie = 0;
  const pohyb = (
    p: Partial<Riadok> & {
      bank_account_id: string;
      booking_date: string;
      amount: number;
      currency?: string;
    },
  ) => {
    const id = uid(`bank-tx:${poradie++}`);
    const r: Riadok = {
      id,
      company_id: FIRMA,
      currency: "EUR",
      transaction_reference: `DEMO${String(100000 + poradie)}`,
      zdroj: "banka",
      created_at: p.booking_date + "T06:00:00.000Z",
      ...p,
      amount: r2(p.amount),
    };
    pohyby.push(r);
    return r;
  };

  // Príjmy — úhrady vystavených faktúr
  const faktury = FAKTURY.length
    ? FAKTURY
    : db.tabulka("invoices").filter((f) => f.company_id === FIRMA);
  const fakturaPodlaId = new Map(faktury.map((f) => [f.id, f]));
  for (const p of db.tabulka("payments")) {
    if (p.company_id !== FIRMA || !p.paid_at || p.paid_at < od || p.paid_at > dnes) continue;
    const f = fakturaPodlaId.get(p.invoice_id);
    if (!f) continue;
    if (f.currency === "CZK") continue; // CZK úhrady prišli na účet mimo Fakteru
    const usd = f.currency === "USD";
    const tx = pohyb({
      bank_account_id: usd ? UCET_USD : UCET_HLAVNY,
      booking_date: p.paid_at,
      amount: Number(p.amount),
      currency: usd ? "USD" : "EUR",
      counterparty: f.customer_name,
      counterparty_iban: usd
        ? "US00DEMO0000000000000015"
        : `SK00 5600 0000 0000 0000 ${String(1000 + (poradie % 900)).slice(-4)}`.replace(/\s/g, ""),
      variable_symbol: f.variable_symbol,
      description: `${f.type === "credit_note" ? "Vrátenie" : "Úhrada"} faktúry ${f.invoice_number}`,
      matched_invoice_id: f.id,
    });
    p.bank_transaction_id = tx.id;
  }

  // Platby s VS otvorených faktúr — na stránku Párovanie (zatiaľ nespárované).
  const otvorene = faktury
    .filter(
      (f) =>
        f.type === "regular" &&
        ["sent", "issued"].includes(f.status) &&
        f.currency === "EUR" &&
        !f.paid_at,
    )
    .slice(0, 4);
  otvorene.forEach((f, i) => {
    pohyb({
      bank_account_id: UCET_HLAVNY,
      booking_date: den(-1 - i),
      amount: i === 3 ? r2(Number(f.total) / 2) : Number(f.total),
      counterparty: f.customer_name,
      variable_symbol: i === 2 ? null : f.variable_symbol,
      description:
        i === 2
          ? `Platba za ${f.invoice_number}`
          : i === 3
            ? "Čiastočná úhrada – 1. splátka"
            : "Úhrada faktúry",
    });
  });

  // Výdavky — prijaté faktúry (modul doklady) uhradené prevodom
  const prijate = db
    .tabulka("purchase_invoices")
    .filter((p) => p.company_id === FIRMA && !p.deleted_at);
  const platbyPrijatych = db.tabulka("purchase_invoice_payments");
  const novePlatbyPrijatych: Riadok[] = [];
  for (const pi of prijate) {
    if (pi.status !== "paid") continue;
    const existujuca = platbyPrijatych.find((x) => x.purchase_invoice_id === pi.id);
    const datum = (existujuca?.paid_at ?? pi.payment_date ?? pi.due_date ?? pi.issue_date) as
      string | null;
    if (!datum || datum < od || datum > dnes) continue;
    const mena = pi.currency || "EUR";
    if (mena !== "EUR" && mena !== "USD") continue;
    const suma = Number(existujuca?.amount ?? pi.amount_total) || 0;
    if (!suma) continue;
    const tx = pohyb({
      bank_account_id: mena === "USD" ? UCET_USD : UCET_HLAVNY,
      booking_date: datum.slice(0, 10),
      amount: -suma,
      currency: mena,
      counterparty: pi.supplier_name ?? "Dodávateľ",
      counterparty_iban: pi.supplier_iban ? bezMedzier(pi.supplier_iban) : null,
      variable_symbol: pi.variable_symbol ?? null,
      description: `Úhrada dokladu ${pi.invoice_number ?? pi.document_number ?? ""}`.trim(),
      matched_purchase_invoice_id: pi.id,
    });
    if (existujuca) existujuca.bank_transaction_id = tx.id;
    else
      novePlatbyPrijatych.push({
        id: uid(`pi-platba:${pi.id}`),
        company_id: FIRMA,
        purchase_invoice_id: pi.id,
        amount: suma,
        currency: mena,
        paid_at: datum.slice(0, 10),
        method: "prevod",
        zdroj: "banka",
        bank_transaction_id: tx.id,
        created_by: MAJITEL,
        created_at: datum.slice(0, 10) + "T08:00:00.000Z",
      });
  }
  if (novePlatbyPrijatych.length) db.vloz("purchase_invoice_payments", novePlatbyPrijatych);

  // Výdavky — bločky platené kartou
  for (const e of db.tabulka("expense_documents")) {
    if (e.company_id !== FIRMA || e.deleted_at || e.payment_method !== "karta") continue;
    const datum = e.issue_date as string | null;
    if (!datum || datum < od || datum > dnes) continue;
    if ((e.currency ?? "EUR") !== "EUR") continue;
    pohyb({
      bank_account_id: UCET_HLAVNY,
      booking_date: datum,
      amount: -Number(e.total_amount || 0),
      counterparty: e.supplier_name ?? "Platba kartou",
      description: `Platba kartou ${e.supplier_name ?? ""}`.trim(),
      matched_expense_id: e.id,
    });
  }

  // Pravidelné pohyby (mzdy, odvody, poplatky, prevody na rezervu)
  for (let m = 0; m < 6; m++) {
    const mesiac = posunMesiac(dnes.slice(0, 8) + "01", -m);
    const d = (dn: number) => pridajDni(mesiac, dn - 1);
    const vOkne = (x: string) => x >= od && x <= dnes;
    if (vOkne(d(10))) {
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: d(10),
        amount: -4250 - m * 15,
        counterparty: "Mzdy zamestnancov (hromadný príkaz)",
        description: "Výplaty miezd",
        vybavenie: "bez_dokladu",
        vybavenie_poznamka: "Mzdy — doklad vedie mzdová účtovníčka",
        vybavene_at: d(10) + "T09:00:00Z",
        vybavil: UCTOVNIK,
      });
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: d(10),
        amount: -1830.4,
        counterparty: "Sociálna poisťovňa (demo)",
        counterparty_iban: "SK0000000000000000000099",
        variable_symbol: "0000000001",
        description: "Odvody SP",
      });
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: d(10),
        amount: -712.15,
        counterparty: "Zdravotná poisťovňa (demo)",
        description: "Odvody ZP",
      });
    }
    if (vOkne(d(25))) {
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: d(25),
        amount: -2384.6 - m * 40,
        counterparty: "Daňový úrad (demo)",
        variable_symbol: "1100000001",
        description: "DPH za predchádzajúci mesiac",
      });
    }
    const posledny = pridajDni(posunMesiac(mesiac, 1), -1);
    if (vOkne(posledny)) {
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: posledny,
        amount: -4.9,
        counterparty: "Demo banka",
        description: "Poplatok za vedenie účtu",
        vybavenie: "bez_dokladu",
        vybavene_at: posledny + "T07:00:00Z",
      });
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: posledny,
        amount: -3.42 - m * 0.37,
        counterparty: "Demo banka",
        description: "Transakčná daň",
        vybavenie: "transakcna_dan",
        vybavene_at: posledny + "T07:00:00Z",
      });
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: posledny,
        amount: 0.38,
        counterparty: "Demo banka",
        description: "Kreditný úrok",
      });
      pohyb({
        bank_account_id: UCET_USD,
        booking_date: posledny,
        amount: -2.5,
        currency: "USD",
        counterparty: "Demo banka",
        description: "Poplatok za vedenie účtu (USD)",
        vybavenie: "bez_dokladu",
      });
      pohyb({
        bank_account_id: UCET_REZERVA,
        booking_date: posledny,
        amount: 1.12,
        counterparty: "Demo banka",
        description: "Úrok na sporiacom účte",
      });
    }
    if (vOkne(d(15))) {
      pohyb({
        bank_account_id: UCET_HLAVNY,
        booking_date: d(15),
        amount: -1000,
        counterparty: "Demo s.r.o.",
        counterparty_iban: bezMedzier(IBAN_REZERVA),
        description: "Prevod na rezervný účet",
      });
      pohyb({
        bank_account_id: UCET_REZERVA,
        booking_date: d(15),
        amount: 1000,
        counterparty: "Demo s.r.o.",
        counterparty_iban: bezMedzier(IBAN_HLAVNY),
        description: "Prevod z hlavného účtu",
      });
    }
  }
  // Nespárované drobnosti
  pohyb({
    bank_account_id: UCET_HLAVNY,
    booking_date: den(-12),
    amount: 86.4,
    counterparty: "Neznámy platiteľ",
    description: "Platba bez VS — treba priradiť",
  });
  pohyb({
    bank_account_id: UCET_HLAVNY,
    booking_date: den(-33),
    amount: -59.9,
    counterparty: "Internetový obchod Demo",
    description: "Platba kartou — chýba doklad",
  });
  pohyb({
    bank_account_id: UCET_HLAVNY,
    booking_date: den(-47),
    amount: 1250,
    counterparty:
      "Stredoeurópske centrum pre inovácie, výskum, vývoj a medzinárodnú spoluprácu v oblasti obnoviteľných zdrojov energie, n. o.",
    description:
      "Preplatok vrátený na základe dohody o vzájomnom započítaní pohľadávok a záväzkov č. 2026/17 (dlhý popis pre test zalamovania)",
  });
  // Starý účet so zlyhaným súhlasom — pohyby len do dátumu vypršania
  for (let i = 0; i < 14; i++) {
    const dd = den(-170 + i * 12);
    if (dd > den(-9)) break;
    pohyb({
      bank_account_id: UCET_STARY,
      booking_date: dd,
      amount: i % 3 === 0 ? 350 : -r2(40 + n.cele(0, 200) + n.cislo()),
      counterparty:
        i % 3 === 0
          ? "Gama Soft s.r.o."
          : n.vyber([
              "Demo Telekom a.s.",
              "Kancelária Plus s.r.o.",
              "Čerpacie stanice Demo s.r.o.",
            ]),
      description: i % 3 === 0 ? "Úhrada" : "Platba",
    });
  }
  // Účet z e-mailových notifikácií
  for (let i = 0; i < 8; i++) {
    const dd = den(-110 + i * 13);
    pohyb({
      bank_account_id: UCET_EMAIL,
      booking_date: dd,
      amount: i % 2 ? -r2(120 + i * 17.3) : r2(480 + i * 21.5),
      counterparty: i % 2 ? "Prenájom Priestorov Demo s.r.o." : "Ni Hotel a wellness s.r.o.",
      description: i % 2 ? "Nájomné" : "Úhrada",
      zdroj: "email",
    });
  }

  /* ------------------------------------------------ splátky financovania (pohyby + kalendár) */
  const zmluvy: Riadok[] = [];
  const splatky: Riadok[] = [];
  const poplatky: Riadok[] = [];
  const sadzby: Riadok[] = [];
  const LEASING = uid("financovanie:leasing");
  const UVER = uid("financovanie:uver");
  const KONTO = uid("financovanie:kontokorent");
  const SKONCENY = uid("financovanie:skonceny");

  const kalendar = (
    zmluva: string,
    istina: number,
    sadzba: (k: number) => number,
    mesiacov: number,
    prva: string,
    dph: number,
    protistrana: string,
    vs: string,
    zostatkova = 0,
  ) => {
    let zostatok = istina;
    for (let k = 1; k <= mesiacov; k++) {
      const s = sadzba(k);
      const i = s / 100 / 12;
      const zost = mesiacov - k + 1;
      const anu =
        i === 0
          ? (zostatok - zostatkova) / zost
          : ((zostatok - zostatkova / Math.pow(1 + i, zost)) * i) / (1 - Math.pow(1 + i, -zost));
      const urok = r2(zostatok * i);
      let istinaCast = r2(anu - urok);
      if (k === mesiacov) istinaCast = r2(zostatok - zostatkova);
      zostatok = r2(zostatok - istinaCast);
      const vat = r2(((istinaCast + urok) * dph) / 100);
      const suma = r2(istinaCast + urok + vat);
      const datum = posunMesiac(prva, k - 1);
      const zaplatena = datum < den(-4);
      let txId: string | null = null;
      if (zaplatena && datum >= od) {
        txId = pohyb({
          bank_account_id: UCET_HLAVNY,
          booking_date: datum,
          amount: -suma,
          counterparty: protistrana,
          variable_symbol: vs,
          description: `Splátka č. ${k}`,
          matched_installment_id: uid(`splatka:${zmluva}:${k}`),
        }).id;
      }
      splatky.push({
        id: uid(`splatka:${zmluva}:${k}`),
        company_id: FIRMA,
        contract_id: zmluva,
        number: k,
        due_date: datum,
        amount: suma,
        principal_part: istinaCast,
        interest_part: urok,
        vat_amount: vat,
        remaining_principal: zostatok,
        paid_at: zaplatena ? datum : null,
        paid_amount: zaplatena ? suma : null,
        bank_transaction_id: txId,
        created_at: cas(-430),
      });
    }
  };

  const leasingPrva = posunMesiac(den(-430).slice(0, 8) + "15", 0);
  zmluvy.push({
    id: LEASING,
    company_id: FIRMA,
    kind: "leasing",
    name: "Leasing – Škoda Octavia Combi (demo)",
    provider_name: "Demo Leasing a.s.",
    contract_number: "LZ-2025-004512",
    variable_symbol: "4004512",
    counterparty_hint: "Demo Leasing",
    currency: "EUR",
    principal: 24000,
    interest_rate: 5.9,
    term_months: 48,
    first_due_date: leasingPrva,
    payment_amount: r2(anuita(24000, 5.9, 48) * 1.23),
    vat_rate: 23,
    down_payment: 6000,
    residual_value: 0,
    day_count: "ACT/365",
    rate_type: "pevna",
    schedule_source: "vypocet",
    status: "active",
    created_by: MAJITEL,
    note: "Operatívny leasing služobného vozidla, DPH zo splátky.",
    created_at: cas(-440),
  });
  kalendar(LEASING, 24000, () => 5.9, 48, leasingPrva, 23, "Demo Leasing a.s.", "4004512");

  const uverPrva = posunMesiac(den(-250).slice(0, 8) + "20", 0);
  zmluvy.push({
    id: UVER,
    company_id: FIRMA,
    kind: "uver",
    name: "Investičný úver – technológie",
    provider_name: "Demo banka (Tatra banka)",
    contract_number: "UV/2026/0088",
    variable_symbol: "88002026",
    counterparty_hint: "Demo banka",
    currency: "EUR",
    principal: 50000,
    interest_rate: 4.85,
    term_months: 60,
    first_due_date: uverPrva,
    payment_amount: r2(anuita(50000, 4.85, 60)),
    vat_rate: 0,
    down_payment: 0,
    residual_value: 0,
    day_count: "ACT/360",
    rate_type: "pohybliva",
    reference_index: "EURIBOR_3M",
    rate_margin: 2.2,
    index_floor: 0,
    fixing_rule: "pred_zaciatkom_obdobia",
    fixing_offset_days: 2,
    rate_reset: "stvrtrocne",
    schedule_source: "vypocet",
    status: "active",
    interest_period: "mesacne",
    interest_from: pridajDni(uverPrva, -30),
    created_by: MAJITEL,
    created_at: cas(-260),
  });
  const uverSadzby = [4.85, 4.71, 4.62];
  kalendar(
    UVER,
    50000,
    (k) => uverSadzby[Math.min(2, Math.floor((k - 1) / 3))],
    60,
    uverPrva,
    0,
    "Demo banka",
    "88002026",
  );
  uverSadzby.forEach((s, i) =>
    sadzby.push({
      id: uid(`sadzba:${UVER}:${i}`),
      company_id: FIRMA,
      contract_id: UVER,
      period_start: posunMesiac(uverPrva, i * 3 - 1),
      rate: s,
      source: i === 0 ? "rucne" : "auto",
      note:
        i === 0
          ? "Pri podpise: 3M EURIBOR 2,65 % + marža 2,20 %"
          : `3M EURIBOR ${(s - 2.2).toFixed(2).replace(".", ",")} % + marža 2,20 %`,
      created_by: MAJITEL,
      created_at: cas(-260 + i * 90),
    }),
  );

  zmluvy.push({
    id: KONTO,
    company_id: FIRMA,
    kind: "kontokorent",
    name: "Kontokorent k hlavnému účtu",
    provider_name: "Demo banka (Tatra banka)",
    contract_number: "KK-2026-11",
    currency: "EUR",
    credit_limit: 10000,
    bank_account_id: UCET_HLAVNY,
    account_iban: IBAN_HLAVNY,
    limit_fee_yearly: 120,
    valid_until: den(200),
    interest_rate: 8.5,
    interest_period: "mesacne",
    rate_type: "pevna",
    status: "active",
    schedule_source: "vypocet",
    created_by: MAJITEL,
    created_at: cas(-160),
  });
  zmluvy.push({
    id: SKONCENY,
    company_id: FIRMA,
    kind: "uver",
    name: "Prevádzkový úver 2024 (splatený)",
    provider_name: "Demo banka (Tatra banka)",
    contract_number: "UV/2024/0012",
    currency: "EUR",
    principal: 6000,
    interest_rate: 6.2,
    term_months: 12,
    first_due_date: posunMesiac(den(-700).slice(0, 8) + "10", 0),
    payment_amount: r2(anuita(6000, 6.2, 12)),
    vat_rate: 0,
    down_payment: 0,
    residual_value: 0,
    day_count: "ACT/365",
    rate_type: "pevna",
    schedule_source: "vypocet",
    status: "closed",
    created_by: MAJITEL,
    created_at: cas(-710),
  });
  kalendar(
    SKONCENY,
    6000,
    () => 6.2,
    12,
    posunMesiac(den(-700).slice(0, 8) + "10", 0),
    0,
    "Demo banka",
    "12002024",
  );

  // Kontokorent — úroky z čerpania a poplatok za rámec, každý spárovaný s pohybom.
  for (let m = 1; m <= 5; m++) {
    const datum = pridajDni(posunMesiac(dnes.slice(0, 8) + "01", -m + 1), -1);
    if (datum < den(-150)) continue;
    const urok = r2(6.4 + m * 1.73);
    const txU = pohyb({
      bank_account_id: UCET_HLAVNY,
      booking_date: datum,
      amount: -urok,
      counterparty: "Demo banka",
      description: "Úrok z čerpania kontokorentu",
    });
    const txP = pohyb({
      bank_account_id: UCET_HLAVNY,
      booking_date: datum,
      amount: -10,
      counterparty: "Demo banka",
      description: "Poplatok za úverový rámec",
    });
    poplatky.push(
      {
        id: uid(`poplatok:u:${m}`),
        company_id: FIRMA,
        contract_id: KONTO,
        kind: "urok",
        amount: urok,
        currency: "EUR",
        charged_on: datum,
        bank_transaction_id: txU.id,
        source: "auto",
        created_at: datum + "T07:00:00Z",
      },
      {
        id: uid(`poplatok:p:${m}`),
        company_id: FIRMA,
        contract_id: KONTO,
        kind: "poplatok",
        amount: 10,
        currency: "EUR",
        charged_on: datum,
        bank_transaction_id: txP.id,
        source: m % 2 ? "auto" : "rucne",
        created_by: m % 2 ? null : MAJITEL,
        created_at: datum + "T07:00:00Z",
      },
    );
  }

  // Referenčné sadzby (vymyslené, plynulo klesajúce) — pohyblivá sadzba úveru z nich počíta.
  const referencne: Riadok[] = [];
  const zaklady: Record<string, number> = {
    EURIBOR_1M: 2.45,
    EURIBOR_3M: 2.7,
    EURIBOR_6M: 2.78,
    EURIBOR_12M: 2.85,
    ESTR: 2.4,
  };
  for (const [index, zaklad] of Object.entries(zaklady)) {
    for (let dd = -330; dd <= 0; dd++) {
      const datum = den(dd);
      const hodnota =
        Math.round((zaklad - (dd + 330) * 0.00095 + Math.sin(dd / 9) * 0.012) * 10000) / 10000;
      const tyzden = new Date(datum + "T00:00:00Z").getUTCDay();
      if (index === "EURIBOR_3M" && tyzden !== 0 && tyzden !== 6) {
        referencne.push({
          index,
          druh: "denna",
          datum,
          hodnota,
          zdroj: "demo",
          nacitane: datum + "T11:00:00Z",
        });
      }
      if (datum.endsWith("-01")) {
        referencne.push({
          index,
          druh: "mesacny_priemer",
          datum,
          hodnota,
          zdroj: "demo",
          nacitane: datum + "T11:00:00Z",
        });
      }
    }
  }
  db.vloz("referencne_sadzby", referencne);

  db.vloz("financing_contracts", zmluvy);
  db.vloz("financing_installments", splatky);
  db.vloz("financing_charges", poplatky);
  db.vloz("financing_rate_periods", sadzby);

  /* ------------------------------------------------ zostatky = počiatočný stav + pohyby */
  pohyby.sort((a, b) =>
    a.booking_date < b.booking_date ? -1 : a.booking_date > b.booking_date ? 1 : 0,
  );
  const pociatok: Record<string, number> = {
    [UCET_HLAVNY]: 12450,
    [UCET_REZERVA]: 15000,
    [UCET_USD]: 3200,
    [UCET_STARY]: 1800,
    [UCET_EMAIL]: 2600,
  };
  const zostatky: Record<string, number> = {};
  for (const ucet of Object.keys(pociatok)) {
    let s = 0;
    let min = 0;
    for (const p of pohyby.filter((x) => x.bank_account_id === ucet)) {
      s = r2(s + p.amount);
      min = Math.min(min, s);
    }
    // Počiatočný stav tak, aby účet nikdy nešiel do mínusu.
    const zac = Math.max(pociatok[ucet], r2(-min + 500));
    pociatok[ucet] = zac;
    zostatky[ucet] = r2(zac + s);
  }
  db.vloz("bank_transactions", pohyby);

  db.vloz("bank_accounts", [
    {
      id: UCET_HLAVNY,
      company_id: FIRMA,
      bank_connection_id: CONN_TB,
      iban: bezMedzier(IBAN_HLAVNY),
      account_name: "Hlavný účet",
      currency: "EUR",
      balance: zostatky[UCET_HLAVNY],
      booked_balance: r2(zostatky[UCET_HLAVNY] + 59.9),
      external_account_id: "demo-acc-1",
      last_synced_at: cas(0, 6, 5),
      pohyby_ok_at: cas(0, 6, 5),
      created_at: cas(-200),
    },
    {
      id: UCET_REZERVA,
      company_id: FIRMA,
      bank_connection_id: CONN_TB,
      iban: bezMedzier(IBAN_REZERVA),
      account_name: "Rezervný účet",
      currency: "EUR",
      balance: zostatky[UCET_REZERVA],
      booked_balance: zostatky[UCET_REZERVA],
      external_account_id: "demo-acc-2",
      last_synced_at: cas(0, 6, 5),
      pohyby_ok_at: cas(0, 6, 5),
      created_at: cas(-199),
    },
    {
      id: UCET_USD,
      company_id: FIRMA,
      bank_connection_id: CONN_IMPORT,
      iban: bezMedzier(IBAN_USD),
      account_name: "Dolárový účet (USD)",
      currency: "USD",
      balance: zostatky[UCET_USD],
      booked_balance: zostatky[UCET_USD],
      last_synced_at: cas(-6, 14),
      pohyby_ok_at: cas(-6, 14),
      created_at: cas(-250),
    },
    {
      id: UCET_STARY,
      company_id: FIRMA,
      bank_connection_id: CONN_STARY,
      iban: bezMedzier(IBAN_STARY),
      account_name: "Účet v inej banke (cez TB)",
      currency: "EUR",
      balance: zostatky[UCET_STARY],
      booked_balance: zostatky[UCET_STARY],
      external_account_id: "demo-acc-3",
      last_synced_at: cas(-9, 6, 5),
      pohyby_ok_at: cas(-9, 6, 5),
      pohyby_chyba: "Súhlas na čítanie pohybov vypršal (demo).",
      pohyby_chyba_suhlas: true,
      created_at: cas(-400),
    },
    {
      id: UCET_EMAIL,
      company_id: FIRMA,
      bank_connection_id: CONN_EMAIL,
      iban: bezMedzier(IBAN_EMAIL),
      account_name: "Účet v Demo sporiteľni (notifikácie)",
      currency: "EUR",
      balance: zostatky[UCET_EMAIL],
      booked_balance: zostatky[UCET_EMAIL],
      last_synced_at: cas(-1, 16, 20),
      pohyby_ok_at: cas(-1, 16, 20),
      created_at: cas(-120),
    },
  ]);

  /* ------------------------------------------------ výpisy */
  const vypisy: Riadok[] = [];
  for (let m = 1; m <= 6; m++) {
    const zac = posunMesiac(dnes.slice(0, 8) + "01", -m);
    const kon = pridajDni(posunMesiac(zac, 1), -1);
    const ucty: [string, string][] = [
      [UCET_HLAVNY, "bank"],
      [UCET_REZERVA, "bank"],
      [UCET_EMAIL, "faktero"],
    ];
    if (m <= 4) ucty.push([UCET_USD, m === 4 ? "unsupported" : "faktero"]);
    for (const [ucet, zdroj] of ucty) {
      for (const typ of ["PDF", "XML"]) {
        const nepodporovany = zdroj === "unsupported";
        vypisy.push({
          id: uid(`vypis:${ucet}:${zac}:${typ}`),
          company_id: FIRMA,
          bank_account_id: ucet,
          period_start: zac,
          period_end: kon,
          export_type: typ,
          source: nepodporovany ? "faktero" : zdroj,
          status: nepodporovany
            ? "unsupported"
            : ucet === UCET_REZERVA && m === 1 && typ === "PDF"
              ? "failed"
              : "ready",
          error: nepodporovany
            ? "Za obdobie nie sú načítané všetky pohyby (demo)."
            : ucet === UCET_REZERVA && m === 1 && typ === "PDF"
              ? "Banka vrátila chybu 500 (demo)."
              : null,
          storage_path: `${FIRMA}/vypisy/${ucet}/${zac.slice(0, 7)}.${typ === "PDF" ? "pdf" : "xml"}`,
          file_size: typ === "PDF" ? 48211 + m * 1013 : 12877 + m * 407,
          statement_id: `demo-${m}-${typ}`,
          created_at: pridajDni(kon, 2) + "T05:00:00Z",
        });
      }
    }
  }
  // Aktuálny mesiac — banka ešte generuje
  const tentoMes = posunMesiac(dnes.slice(0, 8) + "01", 0);
  for (const typ of ["PDF", "XML"]) {
    vypisy.push({
      id: uid(`vypis:aktualny:${typ}`),
      company_id: FIRMA,
      bank_account_id: UCET_HLAVNY,
      period_start: tentoMes,
      period_end: pridajDni(posunMesiac(tentoMes, 1), -1),
      export_type: typ,
      source: "bank",
      status: "pending",
      created_at: cas(0, 5),
    });
  }
  db.vloz("bank_statements", vypisy);

  /* ------------------------------------------------ príkazy na úhradu */
  const naUhradu = prijate
    .filter((p) => p.status !== "paid" && (p.currency ?? "EUR") === "EUR")
    .slice(0, 6);
  const stavyPrikazov = [
    "pending_authorization",
    "pending_authorization",
    "authorized",
    "submitted",
    "submitted",
    "rejected",
  ];
  const prikazy: Riadok[] = stavyPrikazov.map((stav, i) => {
    const pi = naUhradu[i];
    const suma = pi ? Number(pi.amount_total) : r2(120 + i * 87.35);
    return {
      id: uid(`prikaz:${i}`),
      company_id: FIRMA,
      bank_connection_id: CONN_TB,
      purchase_invoice_id: pi?.id ?? null,
      creditor_name:
        pi?.supplier_name ??
        [
          "Kancelária Plus s.r.o.",
          "Demo Telekom a.s.",
          "Prenájom Priestorov Demo s.r.o.",
          "Demo Energia a.s.",
          "Účtovná kancelária Demo s.r.o.",
          "Autoservis Demo",
        ][i],
      creditor_iban: pi?.supplier_iban
        ? bezMedzier(pi.supplier_iban)
        : `SK00110000000000000010${String(10 + i)}`,
      debtor_iban: bezMedzier(IBAN_HLAVNY),
      amount: suma,
      currency: "EUR",
      remittance_info: pi
        ? `VS${pi.variable_symbol ?? ""} ${pi.invoice_number ?? ""}`.trim()
        : `Úhrada faktúry ${2026100 + i}`,
      requested_execution_date: den(i < 3 ? 1 : -2 - i),
      status: stav,
      sca_status:
        stav === "pending_authorization"
          ? "received"
          : stav === "rejected"
            ? "failed"
            : "finalised",
      transaction_status:
        stav === "submitted"
          ? "ACSC"
          : stav === "rejected"
            ? "RJCT"
            : stav === "authorized"
              ? "ACTC"
              : "RCVD",
      error_message:
        stav === "rejected"
          ? "Banka platbu zamietla: nedostatočný disponibilný zostatok (demo)."
          : null,
      payment_id: `demo-pay-${i}`,
      end_to_end_id: `E2E-DEMO-${i}`,
      metadata: i === 0 || i === 1 ? { hromadny: "HP-2026-11-01", pocet: 2 } : {},
      created_by: MAJITEL,
      created_at: cas(-2 - i, 9 + i),
      updated_at: cas(-1 - (i % 2), 10),
    };
  });
  db.vloz("bank_payments", prikazy);

  /* ------------------------------------------------ e-mailové notifikácie banky */
  const ADRESA = uid("banka-notif:adresa");
  db.vloz("banka_notifikacie_adresy", [
    {
      id: ADRESA,
      company_id: FIRMA,
      bank_account_id: UCET_EMAIL,
      banka: "slsp",
      token: "demo7k2m9q",
      active: true,
      created_by: MAJITEL,
      last_received_at: cas(-1, 16, 20),
      created_at: cas(-120),
    },
    {
      id: uid("banka-notif:adresa2"),
      company_id: FIRMA,
      bank_account_id: null,
      banka: "ina",
      token: "demox4p1zr",
      active: false,
      created_by: MAJITEL,
      last_received_at: null,
      created_at: cas(-30),
    },
  ]);
  const emailTx = pohyby.filter((p) => p.bank_account_id === UCET_EMAIL);
  const maily: Riadok[] = emailTx.map((t, i) => ({
    id: uid(`banka-notif:mail:${i}`),
    company_id: FIRMA,
    adresa_id: ADRESA,
    bank_account_id: UCET_EMAIL,
    bank_transaction_id: t.id,
    banka: "slsp",
    from_email: "notifikacie@demo-sporitelna.example",
    subject: t.amount > 0 ? "Pripísanie platby na účet" : "Odpísanie platby z účtu",
    received_at: t.booking_date + "T16:20:00Z",
    stav: "spracovane",
    sposob: i % 3 === 0 ? "ai" : "pravidlo",
    overenie: "dkim_ok",
    message_id: `<demo-${i}@demo-sporitelna.example>`,
    udaje: {
      smer: t.amount > 0 ? "kredit" : "debet",
      suma: Math.abs(t.amount),
      mena: "EUR",
      datum: t.booking_date,
      protistrana: t.counterparty,
      sprava: t.description,
    },
    text_mailu: `Vážený klient, na Váš účet ${IBAN_EMAIL} bola ${t.amount > 0 ? "pripísaná" : "odpísaná"} suma ${Math.abs(t.amount).toFixed(2).replace(".", ",")} EUR. (vymyslený e-mail)`,
  }));
  maily.push(
    {
      id: uid("banka-notif:mail:kontrola"),
      company_id: FIRMA,
      adresa_id: ADRESA,
      bank_account_id: UCET_EMAIL,
      banka: "slsp",
      from_email: "notifikacie@demo-sporitelna.example",
      subject: "Pripísanie platby na účet",
      received_at: cas(0, 8, 12),
      stav: "na_kontrolu",
      sposob: "ai",
      overenie: "dkim_ok",
      dovod: "AI si nie je istá sumou — skontrolujte.",
      udaje: {
        smer: "kredit",
        suma: 642.5,
        mena: "EUR",
        datum: den(0),
        vs: "20260091",
        protistrana: "Beta Logistik a.s.",
      },
      text_mailu:
        "Vážený klient, na Váš účet bola pripísaná suma 642,50 EUR, VS 20260091. (vymyslený e-mail)",
    },
    {
      id: uid("banka-notif:mail:chyba"),
      company_id: FIRMA,
      adresa_id: ADRESA,
      bank_account_id: UCET_EMAIL,
      banka: "slsp",
      from_email: "neznamy@podvrh.example",
      subject: "Pohyb na účte",
      received_at: cas(-3, 11),
      stav: "chyba",
      sposob: "ai",
      overenie: "dkim_chyba",
      dovod: "E-mail neprešiel overením odosielateľa (DKIM) — demo.",
      udaje: {},
      text_mailu: "Podozrivý e-mail bez overenia. (vymyslený)",
    },
    {
      id: uid("banka-notif:mail:duplicita"),
      company_id: FIRMA,
      adresa_id: ADRESA,
      bank_account_id: UCET_EMAIL,
      banka: "slsp",
      from_email: "notifikacie@demo-sporitelna.example",
      subject: "Odpísanie platby z účtu",
      received_at: cas(-5, 9),
      stav: "duplicita",
      sposob: "pravidlo",
      overenie: "dkim_ok",
      dovod: "Rovnaký pohyb už je zaradený.",
      udaje: {
        smer: "debet",
        suma: emailTx[1] ? Math.abs(emailTx[1].amount) : 100,
        mena: "EUR",
        datum: emailTx[1]?.booking_date ?? den(-5),
      },
      text_mailu: "Duplicitné upozornenie. (vymyslený e-mail)",
    },
  );
  db.vloz("banka_notifikacie_maily", maily);

  /* ------------------------------------------------ pokladňa */
  // Bločky v hotovosti z modulu doklady znižujú pokladňu — príjmy ich musia pokryť.
  const hotovostneVydavky = db
    .tabulka("expense_documents")
    .filter(
      (e) =>
        e.company_id === FIRMA &&
        !e.deleted_at &&
        e.payment_method === "hotovost" &&
        e.mimo_pokladne === false &&
        !e.vyuctovanie_id,
    )
    .map((e) => ({ datum: String(e.issue_date ?? den(0)), suma: -Number(e.total_amount || 0) }));
  const pokladna: {
    datum: string;
    typ: "prijem" | "vydaj";
    suma: number;
    popis: string;
    kategoria: string | null;
    poznamka?: string;
  }[] = [
    {
      datum: den(-200),
      typ: "prijem",
      suma: 1500,
      popis: "Počiatočný vklad do pokladne",
      kategoria: "Vklad",
    },
  ];
  for (let m = 0; m < 7; m++) {
    const zac = -195 + m * 28;
    pokladna.push(
      {
        datum: den(zac + 2),
        typ: "prijem",
        suma: r2(180 + m * 23.5),
        popis: "Tržba – predaj v hotovosti",
        kategoria: "Tržby",
      },
      {
        datum: den(zac + 6),
        typ: "vydaj",
        suma: r2(38.9 + m * 3.1),
        popis: "Poštovné a kolky",
        kategoria: "Poštovné",
      },
      {
        datum: den(zac + 11),
        typ: "vydaj",
        suma: r2(64.2 + m * 4.4),
        popis: "Drobný kancelársky materiál",
        kategoria: "Kancelária",
      },
      {
        datum: den(zac + 15),
        typ: "prijem",
        suma: 400,
        popis: "Výber z bankového účtu do pokladne",
        kategoria: "Prevod z banky",
      },
      {
        datum: den(zac + 20),
        typ: "vydaj",
        suma: r2(120 + m * 6),
        popis: "Záloha na služobnú cestu – Ing. Ján Vzorový",
        kategoria: "Cestovné",
        poznamka: "Vyúčtovanie do 10 dní po návrate",
      },
    );
  }
  pokladna.push({
    datum: den(-4),
    typ: "vydaj",
    suma: 18.6,
    popis:
      "Občerstvenie na poradu s klientom Stredoeurópske centrum pre inovácie (dlhý popis pre test zalamovania v pokladničnej knihe)",
    kategoria: "Reprezentácia",
  });
  // Aktuálny mesiac nesmie byť prázdny (pokladňa sa otvára na ňom).
  pokladna.push(
    {
      datum: den(0),
      typ: "prijem",
      suma: 96.4,
      popis: "Tržba – predaj v hotovosti",
      kategoria: "Tržby",
    },
    {
      datum: den(0),
      typ: "vydaj",
      suma: 12.5,
      popis: "Parkovné – stretnutie u klienta",
      kategoria: "Cestovné",
    },
  );
  pokladna.sort((a, b) => (a.datum < b.datum ? -1 : 1));
  // Kontrola zostatku vrátane bločkov — keby išiel do mínusu, pridá sa vklad.
  const priebeh = [
    ...pokladna.map((p) => ({ datum: p.datum, suma: p.typ === "prijem" ? p.suma : -p.suma })),
    ...hotovostneVydavky,
  ].sort((a, b) => (a.datum < b.datum ? -1 : 1));
  let stav = 0;
  let minimum = 0;
  for (const p of priebeh) {
    stav = r2(stav + p.suma);
    minimum = Math.min(minimum, stav);
  }
  if (minimum < 0) pokladna[0].suma = r2(pokladna[0].suma - minimum + 100);
  const pocitadlo = new Map<string, number>();
  db.vloz(
    "cash_entries",
    pokladna.map((p, i) => {
      const rok = p.datum.slice(0, 4);
      const nn = (pocitadlo.get(rok) ?? 0) + 1;
      pocitadlo.set(rok, nn);
      return {
        id: uid(`pokladna:${i}`),
        company_id: FIRMA,
        entry_number: `PD${rok}${String(nn).padStart(3, "0")}`,
        number_series_id: uid("rad:cash"),
        entry_date: p.datum,
        type: p.typ,
        amount: p.suma,
        description: p.popis,
        category: p.kategoria,
        note: p.poznamka ?? null,
        created_by: i % 4 === 0 ? UCTOVNIK : MAJITEL,
        exported_at: p.datum < den(-45) ? pridajDni(p.datum, 20) + "T08:00:00Z" : null,
        pohoda_cislo: p.datum < den(-45) ? `PD${rok}${String(nn).padStart(3, "0")}` : null,
        created_at: p.datum + "T12:00:00Z",
      };
    }),
  );
}
