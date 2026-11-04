/**
 * Demo dáta: DOKLADY Demo s.r.o. — bločky, prijaté faktúry (aj zálohové,
 * samofaktúry, cudzia mena, prenesenie DPH), úhrady prijatých, nespracované
 * doklady, ostatné doklady, vyúčtovania výdavkov, kôš, schvaľovanie, doklady
 * mailom a komentáre.
 *
 * Sumy: základ + DPH = spolu (na centy), položky sedia s hlavičkou. Cudzia
 * mena má vždy kurz a sumy v EUR (`*_eur`). Všetko je vymyslené.
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA, MAJITEL, UCTOVNIK, VLASTNY } from "./zaklad";
import { KONTAKTY, kontakt, type DemoKontakt } from "./kontakty";
import { cas, den, nahoda, pridajDni, r2, uid } from "./pomocne";

/** Prijaté faktúry (všetky typy) — modul banka ich páruje s pohybmi. */
export const PRIJATE: Riadok[] = [];
/** Bločky (expense_documents) — modul banka/pokladňa ich môže párovať. */
export const BLOCKY: Riadok[] = [];

const KURZ_USD = 1.0842;

type Pol = { name: string; quantity: number; unit: string; unit_price: number; vat_rate: number };

/** Položky → základ, DPH, spolu + položky v tvare `items` (total s DPH). */
function spocitaj(polozky: Pol[]) {
  let zaklad = 0;
  let dph = 0;
  const rozpis = new Map<number, { sadzba: number; zaklad: number; dph: number }>();
  const items = polozky.map((p) => {
    const z = r2(p.quantity * p.unit_price);
    const d = r2((z * p.vat_rate) / 100);
    zaklad += z;
    dph += d;
    const r = rozpis.get(p.vat_rate) ?? { sadzba: p.vat_rate, zaklad: 0, dph: 0 };
    r.zaklad = r2(r.zaklad + z);
    r.dph = r2(r.dph + d);
    rozpis.set(p.vat_rate, r);
    return { ...p, total: r2(z + d) };
  });
  return {
    items,
    zaklad: r2(zaklad),
    dph: r2(dph),
    spolu: r2(zaklad + dph),
    rozpis: [...rozpis.values()],
  };
}

function dodavatel(k: DemoKontakt) {
  const i = KONTAKTY.indexOf(k);
  return {
    supplier_name: k.name,
    supplier_ico: k.ico,
    supplier_dic: k.dic ?? null,
    supplier_ic_dph: k.ic_dph ?? null,
    supplier_street: k.street,
    supplier_city: k.city,
    supplier_zip: k.zip,
    supplier_country: k.country,
    supplier_email: k.email,
    supplier_iban: `SK00 1100 0000 0000 0000 ${String(1000 + i).slice(-4)}`,
    customer_id: kontakt(k.kluc),
  };
}

const D = (kluc: string) => KONTAKTY.find((k) => k.kluc === kluc)!;

export function naplnDoklady(db: DemoDb) {
  const n = nahoda(4242);
  PRIJATE.length = 0;
  BLOCKY.length = 0;

  /* ================================================= prijaté faktúry */
  const prijate: Riadok[] = [];
  const uhrady: Riadok[] = [];
  const prilohy: Riadok[] = [];

  const pridajPrijatu = (o: {
    kluc: string;
    k: DemoKontakt;
    datum: string;
    polozky: Pol[];
    cislo: string;
    splatnost?: number;
    stav: string;
    mena?: string;
    typ?: string;
    pdp?: boolean;
    extra?: Partial<Riadok>;
  }) => {
    const s = spocitaj(o.polozky);
    const id = uid(`prijata:${o.kluc}`);
    const mena = o.mena ?? "EUR";
    const due = pridajDni(o.datum, o.splatnost ?? 14);
    const zaplatena = o.stav === "paid";
    const dnes = den(0);
    const datumUhrady = zaplatena
      ? pridajDni(o.datum, Math.min((o.splatnost ?? 14) - 2, 20)) < dnes
        ? pridajDni(o.datum, Math.min((o.splatnost ?? 14) - 2, 20))
        : dnes
      : null;
    const r: Riadok = {
      id,
      company_id: FIRMA,
      created_by: n.sanca(0.7) ? MAJITEL : UCTOVNIK,
      type: o.typ ?? "regular",
      status: o.stav,
      invoice_number: o.cislo,
      variable_symbol: o.cislo.replace(/\D/g, "").slice(-10),
      constant_symbol: "0308",
      issue_date: o.datum,
      delivery_date: o.datum,
      received_date: pridajDni(o.datum, 2),
      due_date: due,
      currency: mena,
      amount_without_vat: s.zaklad,
      vat_amount: o.pdp ? 0 : s.dph,
      amount_total: o.pdp ? s.zaklad : s.spolu,
      items: o.pdp
        ? s.items.map((p) => ({
            ...p,
            vat_rate: 0,
            total: r2(p.quantity * p.unit_price),
            pdp: true,
          }))
        : s.items,
      payment_method: "prevod",
      payment_date: datumUhrady,
      source: n.vyber(["rucne", "mail", "nahratie"]),
      file_path: `${FIRMA}/prijate/${id}.pdf`,
      file_mime: "application/pdf",
      file_size: 27720,
      odpocet: true,
      reverse_charge: !!o.pdp,
      dph_rezim: o.pdp ? "samozdanenie" : "tuzemsko",
      category: null,
      stitky: [],
      created_at: pridajDni(o.datum, 2) + "T08:30:00.000Z",
      updated_at: pridajDni(o.datum, 2) + "T08:30:00.000Z",
      ...dodavatel(o.k),
      ...o.extra,
    };
    if (mena !== "EUR") {
      r.exchange_rate = KURZ_USD;
      r.exchange_rate_source = "ECB";
      r.amount_without_vat_eur = r2(r.amount_without_vat / KURZ_USD);
      r.vat_amount_eur = r2(r.vat_amount / KURZ_USD);
    }
    if (["booked", "paid"].includes(o.stav) && o.datum < pridajDni(dnes, -20)) {
      r.zauctovane_at = pridajDni(o.datum, 10) + "T09:00:00.000Z";
      r.zauctoval = UCTOVNIK;
      r.pohoda_predkontacia = "1PZ";
      r.pohoda_clenenie_dph = o.pdp ? "PDpdp" : "PD";
      r.kv_clenenie = o.pdp ? "B1" : "B2";
    }
    if (o.stav === "paid" && o.datum < pridajDni(dnes, -45)) {
      r.exported_at = pridajDni(o.datum, 25) + "T07:00:00.000Z";
      r.pocet_exportov = 1;
      r.prvy_export_at = r.exported_at;
    }
    prijate.push(r);
    if (zaplatena && datumUhrady) {
      uhrady.push({
        id: uid(`uhrada-prijatej:${id}`),
        company_id: FIRMA,
        purchase_invoice_id: id,
        amount: r.amount_total,
        currency: mena,
        paid_at: datumUhrady,
        method: "prevod",
        zdroj: "rucne",
        note: null,
        created_by: MAJITEL,
        created_at: datumUhrady + "T12:00:00.000Z",
      });
    }
    return r;
  };

  // Pravidelné mesačné faktúry (13 mesiacov): nájom, energia, telekom, účtovníctvo.
  const mesacne: [string, string, Pol[]][] = [
    [
      "prenajom",
      "Nájom kancelárie",
      [
        {
          name: "Nájomné – kancelária 2. posch., 85 m²",
          quantity: 1,
          unit: "mes",
          unit_price: 1150,
          vat_rate: 23,
        },
        {
          name: "Služby spojené s nájmom",
          quantity: 1,
          unit: "mes",
          unit_price: 180,
          vat_rate: 23,
        },
      ],
    ],
    [
      "energia",
      "Elektrina",
      [
        {
          name: "Dodávka elektriny – odberné miesto Ukážková 12",
          quantity: n.cele(380, 520),
          unit: "kWh",
          unit_price: 0.189,
          vat_rate: 23,
        },
        {
          name: "Distribúcia a poplatky",
          quantity: 1,
          unit: "mes",
          unit_price: 21.4,
          vat_rate: 23,
        },
      ],
    ],
    [
      "telekom",
      "Telekom",
      [
        { name: "Paušál Biznis – 4 SIM", quantity: 4, unit: "ks", unit_price: 14.9, vat_rate: 23 },
        {
          name: "Internet optika 1 Gb/s",
          quantity: 1,
          unit: "mes",
          unit_price: 29.9,
          vat_rate: 23,
        },
      ],
    ],
    [
      "ucto",
      "Účtovníctvo",
      [
        {
          name: "Vedenie podvojného účtovníctva",
          quantity: 1,
          unit: "mes",
          unit_price: 290,
          vat_rate: 23,
        },
      ],
    ],
  ];
  for (let m = 12; m >= 0; m--) {
    const datum = den(-m * 30 - 3);
    mesacne.forEach(([kl, , pol], j) => {
      const vek = m * 30 + 3;
      let stav = "paid";
      if (vek < 10) stav = j === 3 ? "draft" : "received";
      else if (vek < 40) stav = j % 2 ? "booked" : "received";
      pridajPrijatu({
        kluc: `${kl}:${m}`,
        k: D(kl),
        datum,
        polozky: pol.map((p) =>
          kl === "energia"
            ? { ...p, quantity: p.unit === "kWh" ? 380 + ((m * 37) % 140) : p.quantity }
            : p,
        ),
        cislo: `${kl.slice(0, 2).toUpperCase()}${datum.slice(0, 4)}${String(1200 + m * 7 + j).padStart(5, "0")}`,
        splatnost: kl === "prenajom" ? 10 : 14,
        stav,
      });
    });
  }
  // Nákupy tovaru a materiálu (nepravidelné)
  const nakupy: [string, Pol[]][] = [
    [
      "velkoobchod",
      [
        {
          name: 'Notebook Demo 14" (nákup na sklad)',
          quantity: 5,
          unit: "ks",
          unit_price: 640,
          vat_rate: 23,
        },
        { name: 'Monitor 27" QHD', quantity: 6, unit: "ks", unit_price: 198, vat_rate: 23 },
      ],
    ],
    [
      "velkoobchod",
      [
        { name: "Bezdrôtová myš", quantity: 30, unit: "ks", unit_price: 13.5, vat_rate: 23 },
        { name: "Kábel USB-C 2 m", quantity: 50, unit: "ks", unit_price: 4.2, vat_rate: 23 },
      ],
    ],
    [
      "kancel",
      [
        {
          name: "Kancelársky papier A4, 500 listov",
          quantity: 40,
          unit: "bal",
          unit_price: 3.9,
          vat_rate: 23,
        },
        { name: "Tonery do tlačiarne", quantity: 4, unit: "ks", unit_price: 54, vat_rate: 23 },
      ],
    ],
    [
      "mi",
      [
        {
          name: "Elektroinštalačné práce – serverovňa",
          quantity: 16,
          unit: "hod",
          unit_price: 32,
          vat_rate: 23,
        },
        {
          name: "Materiál (káble, lišty, ističe)",
          quantity: 1,
          unit: "súb",
          unit_price: 412.6,
          vat_rate: 23,
        },
      ],
    ],
    [
      "theta",
      [
        {
          name: "Tlač katalógov A4, 32 strán",
          quantity: 500,
          unit: "ks",
          unit_price: 1.84,
          vat_rate: 23,
        },
      ],
    ],
    [
      "servis",
      [
        {
          name: "Servisná prehliadka vozidla BL-123XY",
          quantity: 1,
          unit: "ks",
          unit_price: 189,
          vat_rate: 23,
        },
        {
          name: "Výmena brzdových platničiek",
          quantity: 1,
          unit: "ks",
          unit_price: 96.5,
          vat_rate: 23,
        },
      ],
    ],
    [
      "poistovna",
      [
        {
          name: "Poistenie zodpovednosti za škodu – ročné",
          quantity: 1,
          unit: "rok",
          unit_price: 640,
          vat_rate: 0,
        },
      ],
    ],
    [
      "gama",
      [
        {
          name: "Subdodávka vývoja – modul reporty",
          quantity: 42,
          unit: "hod",
          unit_price: 48,
          vat_rate: 23,
        },
      ],
    ],
    [
      "kancel",
      [
        {
          name: "Kancelárska stolička ergonomická",
          quantity: 3,
          unit: "ks",
          unit_price: 149,
          vat_rate: 23,
        },
        {
          name: "Kancelársky stôl 160 × 80 cm, výškovo nastaviteľný s elektrickým motorom a pamäťou polôh",
          quantity: 2,
          unit: "ks",
          unit_price: 389,
          vat_rate: 23,
        },
      ],
    ],
    [
      "velkoobchod",
      [
        {
          name: "Priemyselný regálový systém (nákup)",
          quantity: 2,
          unit: "ks",
          unit_price: 760,
          vat_rate: 23,
        },
      ],
    ],
    [
      "mi",
      [
        {
          name: "Revízia elektroinštalácie",
          quantity: 1,
          unit: "ks",
          unit_price: 220,
          vat_rate: 23,
        },
      ],
    ],
    [
      "theta",
      [
        {
          name: "Vizitky, 4 mená × 250 ks",
          quantity: 4,
          unit: "bal",
          unit_price: 19.9,
          vat_rate: 23,
        },
      ],
    ],
  ];
  nakupy.forEach(([kl, pol], i) => {
    const posun = -360 + i * 31 + n.cele(0, 6);
    const vek = -posun;
    const stav = vek < 15 ? "received" : vek < 50 ? (i % 2 ? "booked" : "received") : "paid";
    pridajPrijatu({
      kluc: `nakup:${i}`,
      k: D(kl),
      datum: den(posun),
      polozky: pol,
      cislo: `FA${den(posun).slice(0, 4)}${String(300 + i * 13).padStart(4, "0")}`,
      splatnost: kl === "velkoobchod" ? 21 : 14,
      stav,
      extra:
        i === 0
          ? {
              stitky: ["sklad", "investícia"],
              note: "Tovar prijatý na sklad Bratislava, dodací list DL-2026-0141.",
            }
          : i === 8
            ? { stitky: ["kancelária"] }
            : {},
    });
  });
  // Po splatnosti (neuhradené, niekoľko týždňov)
  pridajPrijatu({
    kluc: "po-splatnosti:1",
    k: D("velkoobchod"),
    datum: den(-48),
    polozky: [
      { name: 'Tablet 11" 128 GB', quantity: 4, unit: "ks", unit_price: 289, vat_rate: 23 },
    ],
    cislo: "FA20260777",
    splatnost: 14,
    stav: "received",
  });
  pridajPrijatu({
    kluc: "po-splatnosti:2",
    k: D("mi"),
    datum: den(-37),
    polozky: [
      { name: "Oprava klimatizácie", quantity: 1, unit: "ks", unit_price: 345, vat_rate: 23 },
    ],
    cislo: "MI-2026-0412",
    splatnost: 14,
    stav: "booked",
  });
  // Zahraničný hosting — prenesenie daňovej povinnosti, mesačne; posledné 4 v USD (s kurzom ECB)
  for (let m = 6; m >= 0; m--) {
    const usd = m < 4;
    const datum = den(-m * 30 - 1);
    pridajPrijatu({
      kluc: `hosting:${m}`,
      k: D("hosting"),
      datum,
      polozky: [
        {
          name: "Cloud server – plan Business (EU-West)",
          quantity: 1,
          unit: "mes",
          unit_price: usd ? 129 : 119,
          vat_rate: 23,
        },
      ],
      cislo: `INV-${datum.replace(/-/g, "").slice(0, 6)}-${4400 + m}`,
      splatnost: 7,
      stav: m === 0 ? "received" : "paid",
      mena: usd ? "USD" : "EUR",
      pdp: true,
      extra: { eu_plnenie: "sluzby", reverse_charge_type: "eu_sluzby" },
    });
  }
  // Koncepty a storno
  pridajPrijatu({
    kluc: "koncept:1",
    k: D("kancel"),
    datum: den(-1),
    polozky: [
      {
        name: "Kancelárske potreby (rozpracované)",
        quantity: 1,
        unit: "súb",
        unit_price: 64.2,
        vat_rate: 23,
      },
    ],
    cislo: "KP-2026-1180",
    stav: "draft",
  });
  pridajPrijatu({
    kluc: "storno:1",
    k: D("theta"),
    datum: den(-75),
    polozky: [
      {
        name: "Tlač letákov (stornované – chybná objednávka)",
        quantity: 1000,
        unit: "ks",
        unit_price: 0.12,
        vat_rate: 23,
      },
    ],
    cislo: "TP-2026-0233",
    stav: "cancelled",
  });
  // Prijatý dobropis (záporné sumy)
  pridajPrijatu({
    kluc: "dobropis:1",
    k: D("velkoobchod"),
    datum: den(-20),
    polozky: [
      {
        name: "Dobropis – vrátenie 1 ks monitora",
        quantity: -1,
        unit: "ks",
        unit_price: 198,
        vat_rate: 23,
      },
    ],
    cislo: "DB-2026-0031",
    stav: "booked",
    extra: { opravuje_cislo: "FA20260300", note: "Opravný doklad k faktúre FA20260300." },
  });

  /* ---------- prijaté zálohové faktúry (proforma) + vyúčtovanie ostrou faktúrou */
  for (let i = 0; i < 6; i++) {
    const k = D(["velkoobchod", "mi", "gama", "prenajom", "velkoobchod", "theta"][i]);
    const posun = -200 + i * 30;
    const pol = [
      {
        name: `Záloha na dodávku č. ${i + 1}`,
        quantity: 1,
        unit: "ks",
        unit_price: 400 + i * 150,
        vat_rate: 23,
      },
    ];
    const zaplatena = i < 5;
    const zf = pridajPrijatu({
      kluc: `zaloha:${i}`,
      k,
      datum: den(posun),
      polozky: pol,
      cislo: `ZF-${den(posun).slice(0, 4)}-${String(50 + i).padStart(3, "0")}`,
      splatnost: 7,
      stav: zaplatena ? "paid" : "received",
      typ: "proforma",
    });
    if (i < 3) {
      const plnenie = [
        {
          name: `Dodávka podľa zálohovej faktúry ${zf.invoice_number}`,
          quantity: 1,
          unit: "ks",
          unit_price: 1200 + i * 300,
          vat_rate: 23,
        },
      ];
      const s = spocitaj(plnenie);
      pridajPrijatu({
        kluc: `zaloha-vyuct:${i}`,
        k,
        datum: den(posun + 18),
        polozky: plnenie,
        cislo: `FA-${den(posun + 18).slice(0, 4)}-${String(800 + i).padStart(4, "0")}`,
        stav: posun + 18 < -30 ? "paid" : "received",
        extra: {
          advance_invoice_id: zf.id,
          advance_amount: zf.amount_total,
          note: `Odpočet zálohy ${zf.amount_total.toFixed(2)} € — na úhradu ostáva ${r2(s.spolu - zf.amount_total).toFixed(2)} €.`,
        },
      });
    }
  }

  /* ---------- samofaktúry (vyhotovené odberateľom) */
  [
    ["caka", -6],
    ["odsuhlasena", -40],
    [null, -2],
    ["zamietnuta", -25],
  ].forEach(([stav, posun], i) => {
    const datum = den(posun as number);
    pridajPrijatu({
      kluc: `samofaktura:${i}`,
      k: D("gama"),
      datum,
      polozky: [
        {
          name: "Provízia za sprostredkovanie predaja licencií",
          quantity: 1,
          unit: "ks",
          unit_price: 350 + i * 75,
          vat_rate: 23,
        },
      ],
      cislo: `SF${datum.slice(0, 4)}${String(i + 1).padStart(3, "0")}`,
      stav: stav === "odsuhlasena" ? "booked" : "draft",
      extra: {
        samofakturacia: true,
        samofakturacia_stav: stav,
        samofakturacia_token: uid(`sf-token:${i}`).replace(/-/g, ""),
        samofakturacia_odoslana_at: stav ? datum + "T10:00:00.000Z" : null,
        samofakturacia_rozhodnutie_at:
          stav === "odsuhlasena" || stav === "zamietnuta"
            ? pridajDni(datum, 2) + "T15:00:00.000Z"
            : null,
        samofakturacia_poznamka:
          stav === "zamietnuta" ? "Nesúhlasíme so sumou provízie za september." : null,
        number_series_id: uid("rad:self_billing"),
        source: "samofakturacia",
      },
    });
  });

  /* Kto doklad nahral, uložil a zaúčtoval (stĺpec „Nahral / Zaúčtoval“, riadok v detaile):
     nahratie pred zápisom (prenos z Nespracovaných), mail s odosielateľom,
     zaúčtovanie automatom a neskoršia oprava kódov iným človekom. */
  prijate.forEach((r, i) => {
    const vytvorene = String(r.created_at);
    r.nahrane_at = new Date(Date.parse(vytvorene) - 40 * 60 * 1000).toISOString();
    if (r.source === "mail") {
      r.odosielatel_mailu = "faktury@dodavatel.example";
      r.created_by = MAJITEL;
    }
    if (r.source !== "rucne" && r.source !== "samofakturacia") {
      r.spracoval = UCTOVNIK;
      r.spracovane_at = vytvorene;
    }
    if (r.zauctovane_at && i % 4 === 1) {
      // Automat (pravidlo) — bez človeka.
      r.zauctoval = null;
      r.zauctovanie_zdroj = "pravidlo";
      r.zauctovanie_istota = 100;
    }
    if (r.zauctovane_at && i % 4 === 2) {
      // Po prvom zaúčtovaní niekto zmenil predkontáciu — posledné zaúčtovanie.
      r.naposledy_zauctoval = MAJITEL;
      r.naposledy_zauctovane_at = new Date(Date.parse(String(r.zauctovane_at)) + 26 * 3600 * 1000).toISOString();
    }
  });
  db.vloz("purchase_invoices", prijate);
  db.vloz("purchase_invoice_payments", uhrady);
  PRIJATE.push(...prijate);

  /* História zmien (spúšťač zapis_historiu_dokladu): pri niekoľkých zaúčtovaných
     prijatých faktúrach úprava sumy a položiek, zaúčtovanie automatom, zmena
     predkontácie, odovzdanie konektorom a spárovanie s platbou. */
  db.vloz(
    "historia_dokladov",
    prijate
      .filter((r) => r.zauctovane_at && r.type === "regular")
      .slice(0, 6)
      .flatMap((r, i) => {
        const t0 = Date.parse(String(r.created_at));
        const kedy = (h: number) => new Date(t0 + h * 3600 * 1000).toISOString();
        const h = (n: number, pole: string, pred: unknown, po: unknown, kto: string | null, kto_typ: string, kto_popis: string | null = null) => ({
          id: uid(`hist-prijata:${r.id}:${n}`),
          company_id: FIRMA,
          agenda: "prijata",
          doklad_id: r.id,
          pole,
          pred,
          po,
          kto,
          kto_typ,
          kto_popis,
          kedy: kedy(n),
        });
        const suma = Number(r.amount_total ?? 0);
        const predk = String(r.pohoda_predkontacia ?? "501/321");
        return [
          h(1, "amount_total", r2(suma - 10), suma, UCTOVNIK, i % 2 ? "appka" : "clovek"),
          h(1, "items", { pocet: 1, suma: r2(suma - 10) }, { pocet: 2, suma }, UCTOVNIK, i % 2 ? "appka" : "clovek"),
          h(2, "zauctovane_at", null, kedy(2), null, "automat", "ai"),
          h(2, "zauctovanie_zdroj", null, "ai", null, "automat", "ai"),
          h(2, "pohoda_predkontacia", null, "501/321", null, "automat", "ai"),
          h(3, "pohoda_predkontacia", "501/321", predk === "501/321" ? "518/321" : predk, MAJITEL, "clovek"),
          h(4, "exported_at", null, kedy(4), UCTOVNIK, "clovek", "konektor"),
          h(5, "_platba", null, { suma: -suma, mena: r.currency ?? "EUR", datum: String(kedy(5)).slice(0, 10), protistrana: r.supplier_name }, null, "api", "Banka – import"),
        ];
      }),
  );

  /* ================================================= bločky */
  const kategorie = [
    "kancelarske_potreby",
    "palivo",
    "reprezentacia",
    "parkovne",
    "postovne",
    "software",
    "spotrebny_material",
    "cestovne",
  ];
  const obchody: [string, string | null, string, string, Pol[]][] = [
    [
      "Čerpacie stanice Demo s.r.o.",
      "30000006",
      "palivo",
      "karta",
      [{ name: "Natural 95", quantity: 42.1, unit: "l", unit_price: 1.329, vat_rate: 23 }],
    ],
    [
      "Čerpacie stanice Demo s.r.o.",
      "30000006",
      "palivo",
      "karta",
      [
        { name: "Diesel", quantity: 55.4, unit: "l", unit_price: 1.289, vat_rate: 23 },
        { name: "Umytie auta", quantity: 1, unit: "ks", unit_price: 7.24, vat_rate: 23 },
      ],
    ],
    [
      "Papiernictvo U Demo",
      "50000001",
      "kancelarske_potreby",
      "hotovost",
      [
        { name: "Perá gélové 10 ks", quantity: 2, unit: "bal", unit_price: 4.07, vat_rate: 23 },
        { name: "Zošity A4", quantity: 5, unit: "ks", unit_price: 1.22, vat_rate: 23 },
      ],
    ],
    [
      "Reštaurácia Pod Demo hradom",
      "50000002",
      "reprezentacia",
      "karta",
      [
        { name: "Obedové menu", quantity: 3, unit: "ks", unit_price: 7.39, vat_rate: 19 },
        { name: "Nealko nápoje", quantity: 3, unit: "ks", unit_price: 1.94, vat_rate: 23 },
      ],
    ],
    [
      "Mestské parkovisko Demo",
      null,
      "parkovne",
      "hotovost",
      [{ name: "Parkovné 3 h", quantity: 1, unit: "ks", unit_price: 2.44, vat_rate: 23 }],
    ],
    [
      "Demo Pošta a.s.",
      "50000003",
      "postovne",
      "hotovost",
      [{ name: "Doporučený list", quantity: 4, unit: "ks", unit_price: 2.44, vat_rate: 23 }],
    ],
    [
      "Elektro Demo Market",
      "50000004",
      "spotrebny_material",
      "karta",
      [
        { name: "Batérie AA 8 ks", quantity: 2, unit: "bal", unit_price: 6.5, vat_rate: 23 },
        { name: "Predlžovací kábel 5 m", quantity: 1, unit: "ks", unit_price: 11.38, vat_rate: 23 },
      ],
    ],
    [
      "Kaviareň Demo Espresso",
      "50000005",
      "reprezentacia",
      "hotovost",
      [
        { name: "Káva s mliekom", quantity: 2, unit: "ks", unit_price: 2.69, vat_rate: 19 },
        { name: "Koláč", quantity: 2, unit: "ks", unit_price: 2.52, vat_rate: 19 },
      ],
    ],
    [
      "Hotel Demo Centrum – ubytovanie a reštaurácia s celodennou prevádzkou a konferenčnými priestormi",
      "50000006",
      "cestovne",
      "karta",
      [
        {
          name: "Ubytovanie 1 noc, jednolôžková izba",
          quantity: 1,
          unit: "noc",
          unit_price: 72.73,
          vat_rate: 5,
        },
        { name: "Raňajky", quantity: 1, unit: "ks", unit_price: 9.17, vat_rate: 19 },
      ],
    ],
    [
      "Aplikácie Demo Store",
      null,
      "software",
      "karta",
      [
        {
          name: "Predplatné aplikácie (mesačne)",
          quantity: 1,
          unit: "mes",
          unit_price: 9.75,
          vat_rate: 23,
        },
      ],
    ],
  ];
  const blocky: Riadok[] = [];
  for (let i = 0; i < 56; i++) {
    // ~15 dokladov v tomto mesiaci (zoznam sa otvára na aktuálnom mesiaci), zvyšok za 4 mesiace dozadu
    const posun = i < 16 ? -Math.floor(i * 1.6) : -20 - Math.floor((i - 16) * 2.6);
    const datum = den(posun);
    const [obchod, ico, kat, platba, pol] = obchody[i % obchody.length];
    const polozky = pol.map((p) => ({
      ...p,
      quantity: p.unit === "l" ? r2(p.quantity + (i % 7) * 1.3) : p.quantity,
    }));
    const s = spocitaj(polozky);
    const id = uid(`blocek:${i}`);
    const novy = i % 6 === 2 || i === 1;
    const chybaUdajov = i === 1 || i === 8;
    const stav = novy ? "new" : "processed";
    const exportovany = !novy && -posun > 35;
    const sadzby = s.rozpis.map((r) => r.sadzba);
    const r: Riadok = {
      id,
      company_id: FIRMA,
      created_by: i % 5 === 0 ? VLASTNY : MAJITEL,
      issue_date: chybaUdajov && i === 8 ? null : datum,
      supplier_name: chybaUdajov && i === 1 ? null : obchod,
      supplier_ico: ico,
      supplier_ic_dph: ico ? `SK20${ico}` : null,
      document_number: `${String(100000 + i * 37).slice(-6)}`,
      net_amount: s.zaklad,
      vat_amount: s.dph,
      total_amount: s.spolu,
      vat_rate: sadzby.length === 1 ? sadzby[0] : Math.max(...sadzby),
      vat_breakdown: s.rozpis,
      items: s.items.map(({ unit: _u, ...p }) => p),
      currency: "EUR",
      payment_method: i % 9 === 4 ? "prevod" : platba,
      category: i % 11 === 10 ? null : kat,
      status: stav,
      source: i % 3 === 0 ? "qr" : "photo",
      qr_raw: i % 3 === 0 ? `O-DEMO${String(i).padStart(4, "0")}DEMO0000000000000000` : null,
      file_path: `${FIRMA}/blocky/${id}.png`,
      file_mime: "image/png",
      file_size: 21561,
      processed_at: stav === "processed" ? datum + "T16:00:00.000Z" : null,
      processed_by: stav === "processed" ? MAJITEL : null,
      exported_at: exportovany ? pridajDni(datum, 20) + "T07:00:00.000Z" : null,
      pocet_exportov: exportovany ? 1 : 0,
      zauctovane_at: !novy && -posun > 10 ? pridajDni(datum, 3) + "T09:00:00.000Z" : null,
      zauctoval: !novy && -posun > 10 ? UCTOVNIK : null,
      pohoda_predkontacia: !novy && -posun > 10 ? (kat === "palivo" ? "5PHM" : "5DOK") : null,
      pohoda_clenenie_dph: !novy && -posun > 10 ? "PD" : null,
      odpocet: kat !== "reprezentacia",
      stitky: i % 10 === 3 ? ["služobná cesta"] : i % 13 === 5 ? ["projekt A", "kancelária"] : [],
      note: i === 9 ? "Služobná cesta Košice – rokovanie so zákazníkom Epsilon Medical." : null,
      created_at: (datum ?? den(posun)) + "T15:30:00.000Z",
      updated_at: (datum ?? den(posun)) + "T15:30:00.000Z",
    };
    blocky.push(r);
  }
  // Jeden bloček v cudzej mene (CZK) s kurzom ECB
  {
    const pol = [
      {
        name: "Diaľničná známka CZ (10 dní)",
        quantity: 1,
        unit: "ks",
        unit_price: 223.97,
        vat_rate: 21,
      },
    ];
    const s = spocitaj(pol);
    blocky.push({
      id: uid("blocek:czk"),
      company_id: FIRMA,
      created_by: MAJITEL,
      issue_date: den(-9),
      supplier_name: "Dálniční známky Demo CZ",
      document_number: "CZ-778812",
      net_amount: s.zaklad,
      vat_amount: s.dph,
      total_amount: s.spolu,
      vat_rate: 21,
      vat_breakdown: s.rozpis,
      items: s.items,
      currency: "CZK",
      exchange_rate: 25.214,
      exchange_rate_date: den(-10),
      exchange_rate_source: "ECB",
      payment_method: "karta",
      category: "parkovne",
      status: "processed",
      source: "photo",
      odpocet: false,
      file_path: `${FIRMA}/blocky/czk.png`,
      file_mime: "image/png",
      processed_at: cas(-9),
      note: `Prepočet kurzom ECB 25,214 CZK/EUR = ${r2(s.spolu / 25.214).toFixed(2)} €.`,
      created_at: cas(-9, 14),
    });
  }

  /* ---------- vyúčtovania výdavkov */
  const vyuct: Riadok[] = [
    {
      id: uid("vyuct:1"),
      company_id: FIRMA,
      nazov: "Služobná cesta Košice – október",
      typ: "zaloha",
      zamestnanec_meno: "Martina Demová",
      obdobie_od: den(-30),
      obdobie_do: den(-5),
      zaloha: 300,
      mena: "EUR",
      stav: "otvorene",
      poznamka: "Záloha vyplatená z pokladne.",
      created_by: MAJITEL,
      created_at: cas(-30),
    },
    {
      id: uid("vyuct:2"),
      company_id: FIRMA,
      nazov: "Výdavky z vlastných prostriedkov – september",
      typ: "vlastne",
      zamestnanec_meno: "Peter Účtovný",
      obdobie_od: den(-60),
      obdobie_do: den(-31),
      zaloha: 0,
      mena: "EUR",
      stav: "uzavrete",
      vyplatene_at: cas(-28),
      datum_uctovania: den(-28),
      predkontacia: "5DOK",
      clenenie_dph: "PD",
      created_by: UCTOVNIK,
      created_at: cas(-60),
    },
    {
      id: uid("vyuct:3"),
      company_id: FIRMA,
      nazov: "Firemná karta – platby za tento mesiac",
      typ: "karta",
      zamestnanec_meno: null,
      obdobie_od: den(-25),
      obdobie_do: den(0),
      zaloha: 0,
      mena: "EUR",
      stav: "otvorene",
      created_by: MAJITEL,
      created_at: cas(-25),
    },
    {
      id: uid("vyuct:4"),
      company_id: FIRMA,
      nazov:
        "Veľtrh Brno – vyúčtovanie zálohy (dlhý názov pre test zalamovania v zozname vyúčtovaní)",
      typ: "zaloha",
      zamestnanec_meno: "Jana Obmedzená",
      obdobie_od: den(-90),
      obdobie_do: den(-80),
      zaloha: 150,
      mena: "EUR",
      stav: "uzavrete",
      vyplatene_at: cas(-75),
      created_by: MAJITEL,
      created_at: cas(-90),
    },
  ];
  // Priradenie bločkov k vyúčtovaniam (podľa obdobia a spôsobu úhrady)
  for (const b of blocky) {
    if (!b.issue_date || b.status !== "processed") continue;
    const d = b.issue_date as string;
    if (b.payment_method === "hotovost" && d >= vyuct[0].obdobie_od && d <= vyuct[0].obdobie_do)
      b.vyuctovanie_id = vyuct[0].id;
    else if (b.payment_method === "karta" && d >= vyuct[2].obdobie_od && b.currency === "EUR")
      b.vyuctovanie_id = vyuct[2].id;
    else if (
      b.payment_method === "hotovost" &&
      d >= vyuct[1].obdobie_od &&
      d <= vyuct[1].obdobie_do
    )
      b.vyuctovanie_id = vyuct[1].id;
    else if (d >= vyuct[3].obdobie_od && d <= vyuct[3].obdobie_do) b.vyuctovanie_id = vyuct[3].id;
  }
  // Jedna drobná prijatá faktúra platená z vlastných (vyúčtovanie 2)
  const drobna = prijate.find(
    (p) =>
      p.supplier_name === "Kancelária Plus s.r.o." &&
      p.issue_date >= vyuct[1].obdobie_od &&
      p.issue_date <= vyuct[1].obdobie_do,
  );
  if (drobna) drobna.vyuctovanie_id = vyuct[1].id;

  db.vloz("vyuctovania_vydavkov", vyuct);
  // Bločky: nahratie pred spracovaním, jeden prišiel e-mailom.
  blocky.forEach((r, i) => {
    if (r.created_at) r.nahrane_at = new Date(Date.parse(String(r.created_at)) - 25 * 60 * 1000).toISOString();
    if (i === 2) r.odosielatel_mailu = "pokladna@obchod.example";
  });
  // Duplicita: ten istý bloček dvakrát (raz QR, raz fotka) — nezaúčtuje sa ani jeden.
  {
    const vzor = blocky.find((b) => b.status === "processed" && !b.zauctovane_at && !b.exported_at && b.supplier_ico);
    if (vzor) {
      blocky.push({
        ...vzor,
        id: uid("blocek:duplicita"),
        qr_raw: null,
        source: "photo",
        pdf_token: null,
        created_at: new Date(Date.parse(String(vzor.created_at)) + 3 * 3600 * 1000).toISOString(),
      });
    }
  }
  db.vloz("expense_documents", blocky);
  BLOCKY.push(...blocky);

  // Prílohy (navyše ku skenu) pri pár prijatých faktúrach a bločkoch
  prijate.slice(-12, -6).forEach((p, i) => {
    prilohy.push({
      id: uid(`priloha-dokladu:p:${i}`),
      company_id: FIRMA,
      purchase_invoice_id: p.id,
      name: i % 2 ? "dodaci-list.pdf" : "objednavka.pdf",
      mime: "application/pdf",
      path: `${FIRMA}/prilohy/${p.id}/${i % 2 ? "dodaci-list.pdf" : "objednavka.pdf"}`,
      size: 27720,
      created_by: MAJITEL,
      created_at: p.created_at,
    });
  });
  blocky.slice(0, 3).forEach((b, i) => {
    prilohy.push({
      id: uid(`priloha-dokladu:b:${i}`),
      company_id: FIRMA,
      expense_document_id: b.id,
      name: "potvrdenie-platby.png",
      mime: "image/png",
      path: `${FIRMA}/prilohy/${b.id}/potvrdenie-platby.png`,
      size: 21561,
      created_by: MAJITEL,
      created_at: b.created_at,
    });
  });
  db.vloz("prilohy_dokladov", prilohy);

  /* ================================================= doklady mailom */
  const adresa = {
    id: uid("inbox:adresa:majitel"),
    company_id: FIRMA,
    user_id: MAJITEL,
    local_part: "demo-sro-k7m2",
    active: true,
    last_received_at: cas(-1, 9, 12),
    created_at: cas(-200),
  };
  db.vloz("inbox_addresses", [
    adresa,
    {
      id: uid("inbox:adresa:uctovnik"),
      company_id: FIRMA,
      user_id: UCTOVNIK,
      local_part: "demo-sro-u3p9",
      active: true,
      last_received_at: cas(-12),
      created_at: cas(-150),
    },
  ]);
  const spravy: Riadok[] = [];
  const mailStavy: [string, string, string, string | null][] = [
    ["hotovo", "faktury@demo-telekom.example", "Vaša faktúra za október", null],
    ["hotovo", "zakaznik@demo-energia.example", "Faktúra za elektrinu – vyúčtovanie", null],
    ["prijate", "predaj@kancelaria-plus.example", "Faktúra KP-2026-1180", null],
    [
      "bez_prilohy",
      "info@cs-demo.example",
      "Potvrdenie objednávky (bez prílohy)",
      "Mail nemal prílohu s dokladom.",
    ],
    ["hotovo", "billing@cloud-hosting.example", "Invoice INV-202610-4400", null],
    [
      "chyba",
      "objednavky@velkoobchod.example",
      "Faktúra – poškodené PDF",
      "Príloha sa nedala prečítať (poškodený súbor).",
    ],
    [
      "odmietnute",
      "neznamy@spam.example",
      "Neuhradená faktúra – kliknite sem",
      "Odosielateľ nie je medzi povolenými.",
    ],
    [
      "potvrdenie",
      "forwarding-noreply@mail.example",
      "Potvrdenie preposielania pošty",
      "Kliknite na odkaz v nastaveniach preposielania.",
    ],
  ];
  mailStavy.forEach(([stav, od, predmet, detail], i) => {
    spravy.push({
      id: uid(`inbox:sprava:${i}`),
      company_id: FIRMA,
      address_id: adresa.id,
      from_email: od,
      to_email: `${adresa.local_part}@doklady.faktero.example`,
      subject: predmet,
      text_mailu: "Dobrý deň,\n\nv prílohe posielame doklad.\n\nS pozdravom\nDemo dodávateľ",
      received_at: cas(-i * 3 - 1, 9 + (i % 8), 12),
      status: stav,
      detail,
      attachment_count: stav === "bez_prilohy" ? 0 : 1,
      provider_email_id: `demo-mail-${i}`,
      created_invoice_ids: [],
      created_other_ids: [],
      created_nespracovane_ids: stav === "hotovo" ? [uid(`nesprac:${i}`)] : [],
    });
  });
  db.vloz("inbox_messages", spravy);
  db.vloz("mail_nepriradene", [
    {
      id: uid("mail-nepr:1"),
      user_id: MAJITEL,
      company_id: null,
      zdroj: "mail",
      from_email: "faktury@novy-dodavatel.example",
      subject: "Faktúra 2026/0912",
      file_name: "faktura-2026-0912.pdf",
      file_mime: "application/pdf",
      file_size: 27720,
      file_path: `nepriradene/${MAJITEL}/faktura-2026-0912.pdf`,
      prilohy: [{ nazov: "faktura-2026-0912.pdf", mime: "application/pdf" }],
      received_at: cas(-2, 11),
      status: "caka",
      detail: "Neviem určiť firmu — odberateľ na doklade nesedí so žiadnou vašou firmou.",
    },
    {
      id: uid("mail-nepr:2"),
      user_id: MAJITEL,
      company_id: null,
      zdroj: "mail",
      from_email: "uctovnictvo@partner.example",
      subject: "Dobropis k reklamácii",
      file_name: "dobropis.pdf",
      file_mime: "application/pdf",
      file_size: 27720,
      file_path: `nepriradene/${MAJITEL}/dobropis.pdf`,
      prilohy: [{ nazov: "dobropis.pdf", mime: "application/pdf" }],
      received_at: cas(-4, 15),
      status: "caka",
      detail: null,
    },
  ]);

  /* ================================================= nespracované doklady */
  const nesprac: Riadok[] = [];
  const nespracDruhy: [string | null, string, string, DemoKontakt, Pol[]][] = [
    [
      "faktura",
      "vytazene",
      "mail",
      D("telekom"),
      [{ name: "Paušál Biznis – 4 SIM", quantity: 4, unit: "ks", unit_price: 14.9, vat_rate: 23 }],
    ],
    [
      "faktura",
      "vytazene",
      "mail",
      D("energia"),
      [{ name: "Dodávka elektriny", quantity: 455, unit: "kWh", unit_price: 0.189, vat_rate: 23 }],
    ],
    [
      "blocek",
      "vytazene",
      "apka",
      D("palivo"),
      [{ name: "Natural 95", quantity: 38.2, unit: "l", unit_price: 1.329, vat_rate: 23 }],
    ],
    [
      "zalohova",
      "vytazene",
      "nahratie",
      D("velkoobchod"),
      [
        {
          name: "Záloha na dodávku techniky",
          quantity: 1,
          unit: "ks",
          unit_price: 1500,
          vat_rate: 23,
        },
      ],
    ],
    [
      "faktura",
      "vytazene",
      "mail",
      D("hosting"),
      [
        {
          name: "Cloud server – plan Business",
          quantity: 1,
          unit: "mes",
          unit_price: 119,
          vat_rate: 0,
        },
      ],
    ],
    [
      "dobropis",
      "vytazene",
      "nahratie",
      D("kancel"),
      [
        {
          name: "Dobropis – vrátenie tonerov",
          quantity: -2,
          unit: "ks",
          unit_price: 54,
          vat_rate: 23,
        },
      ],
    ],
    ["ostatny", "vytazene", "mail", D("poistovna"), []],
    [
      null,
      "vytazene",
      "nahratie",
      D("servis"),
      [{ name: "Pneuservis – prezutie", quantity: 1, unit: "ks", unit_price: 48, vat_rate: 23 }],
    ],
    [
      "faktura",
      "vytazene",
      "mail",
      D("gama"),
      [
        {
          name: "Subdodávka vývoja – október",
          quantity: 38,
          unit: "hod",
          unit_price: 48,
          vat_rate: 23,
        },
      ],
    ],
    [
      "faktura",
      "vytazene",
      "apka",
      D("mi"),
      [
        {
          name: "Montáž osvetlenia v sklade s dlhým popisom položky pre test zalamovania textu v detaile dokladu",
          quantity: 12,
          unit: "hod",
          unit_price: 32,
          vat_rate: 23,
        },
      ],
    ],
    [null, "cita", "mail", D("theta"), []],
    [null, "cita", "nahratie", D("kancel"), []],
    [null, "chyba", "mail", D("velkoobchod"), []],
    [null, "chyba", "nahratie", D("prenajom"), []],
  ];
  nespracDruhy.forEach(([druh, stav, zdroj, k, pol], i) => {
    const id = uid(`nesprac:${i}`);
    const s = spocitaj(pol);
    const datum = den(-i - 1);
    const vytazene = stav === "vytazene";
    const pdp = k.kluc === "hosting";
    const ai =
      vytazene || stav === "chyba"
        ? {
            supplier_name: k.name,
            supplier_ico: k.ico,
            supplier_dic: k.dic ?? null,
            supplier_ic_dph: k.ic_dph ?? null,
            buyer_name: "Demo s.r.o.",
            buyer_ico: "00000001",
            buyer_dic: "2020000001",
            buyer_ic_dph: "SK2020000001",
          }
        : null;
    const udaje = vytazene
      ? {
          dodavatel: {
            nazov: k.name,
            ico: k.ico,
            dic: k.dic ?? "",
            icDph: k.ic_dph ?? "",
            iban: dodavatel(k).supplier_iban,
            ulica: k.street,
            mesto: k.city,
            psc: k.zip,
            krajina: k.country,
            email: k.email,
          },
          cislo:
            druh === "ostatny" ? "" : `ND-${datum.slice(0, 4)}-${String(500 + i).padStart(4, "0")}`,
          vs: druh === "blocek" || druh === "ostatny" ? "" : String(2026000500 + i),
          popis: pol[0]?.name ?? "Predpis poistného na rok 2027",
          datumVystavenia: datum,
          datumDodania: datum,
          splatnost: druh === "blocek" ? datum : pridajDni(datum, 14),
          mena: "EUR",
          rozpis: pdp ? [{ sadzba: 0, zaklad: s.zaklad, dph: 0 }] : s.rozpis,
          celkom: druh === "ostatny" ? 640 : pdp ? s.zaklad : s.spolu,
          platba: druh === "blocek" ? "karta" : "prevod",
          kategoria: druh === "blocek" ? "palivo" : "",
          opravuje: druh === "dobropis" ? "KP-2026-0950" : "",
          jobId: "",
          poznamka: "",
          ostatny:
            druh === "ostatny"
              ? {
                  druh: "poistovna",
                  predmet: "Predpis poistného na rok 2027",
                  lehota: pridajDni(datum, 30),
                }
              : { druh: "", predmet: "", lehota: "" },
          kody: {
            predkontacia: i % 3 === 0 ? "1PZ" : "",
            clenenie: i % 3 === 0 ? "PD" : "",
            kv: "",
            stredisko: "",
            cinnost: "",
            rad: "",
            intPoznamka: "",
          },
          polozky: s.items.map((p) => ({ ...p, pdp })),
          prenesenie: pdp,
        }
      : {};
    nesprac.push({
      id,
      company_id: FIRMA,
      created_by: zdroj === "apka" ? VLASTNY : MAJITEL,
      zdroj,
      stav,
      druh,
      file_name: stav === "cita" ? `sken-${i}.jpg` : `${k.kluc}-doklad-${i}.pdf`,
      file_mime: stav === "cita" ? "image/jpeg" : "application/pdf",
      file_size: 27720,
      file_path: `${FIRMA}/nespracovane/${id}.${stav === "cita" ? "jpg" : "pdf"}`,
      ai,
      udaje,
      chyba:
        stav === "chyba"
          ? i % 2
            ? "Súbor je zaheslované PDF — doklad sa nedá prečítať."
            : "Rozpoznávanie zlyhalo (demo) — skúste znova."
          : null,
      inbox_message_id: zdroj === "mail" && i < 8 ? uid(`inbox:sprava:${i % 8}`) : null,
      created_at: cas(-i - 1, 8 + (i % 9), 5),
      updated_at: cas(-i - 1, 8 + (i % 9), 5),
    });
  });
  /* Tá istá prijatá faktúra prišla mailom znova (Patrik 4. 11.: MOKOŠÁK
     1126817) — detail ukáže „Táto faktúra už je v evidencii“, zoznam odznak
     „Duplicita“ a „Vytvoriť“ ju druhýkrát nezaloží. */
  {
    const p = prijate.find(
      (r) => r.zauctovane_at && r.supplier_ico && !r.deleted_at && r.type === "regular" && Number(r.amount_total) > 0,
    );
    if (p) {
      const id = uid("nesprac:duplicita");
      const zaklad = Number(p.amount_without_vat ?? 0);
      const dph = Number(p.vat_amount ?? 0);
      nesprac.push({
        id,
        company_id: FIRMA,
        created_by: MAJITEL,
        zdroj: "mail",
        stav: "vytazene",
        druh: "faktura",
        file_name: `faktura-${p.invoice_number}.pdf`,
        file_mime: "application/pdf",
        file_size: 27720,
        file_path: `${FIRMA}/nespracovane/${id}.pdf`,
        ai: { supplier_name: p.supplier_name, supplier_ico: p.supplier_ico, buyer_name: "Demo s.r.o.", buyer_ico: "00000001" },
        udaje: {
          dodavatel: { nazov: p.supplier_name, ico: p.supplier_ico, dic: "", icDph: "", iban: p.supplier_iban ?? "", ulica: "", mesto: "", psc: "", krajina: "SK", email: "" },
          cislo: p.invoice_number,
          vs: p.variable_symbol ?? "",
          popis: "",
          datumVystavenia: p.issue_date,
          datumDodania: p.delivery_date ?? p.issue_date,
          splatnost: p.due_date ?? p.issue_date,
          mena: p.currency ?? "EUR",
          rozpis: [{ sadzba: 23, zaklad, dph }],
          celkom: Number(p.amount_total),
          platba: "prevod",
          kategoria: "",
          opravuje: "",
          jobId: "",
          poznamka: "",
          ostatny: { druh: "", predmet: "", lehota: "" },
          kody: { predkontacia: "1PZ", clenenie: "PD", kv: "", stredisko: "", cinnost: "", rad: "", intPoznamka: "" },
          polozky: [],
        },
        chyba: null,
        inbox_message_id: null,
        created_at: cas(0, 11, 48),
        updated_at: cas(0, 11, 48),
      });
    }
  }
  db.vloz("nespracovane_doklady", nesprac);

  /* ================================================= ostatné doklady */
  const ostatne: Riadok[] = [];
  const subory: Riadok[] = [];
  const ostDef: [string, string, string, number | null, number | null, string, string | null][] = [
    [
      "exekucia",
      "Exekútorský úrad Demo",
      "Upovedomenie o začatí exekúcie – zamestnanec (zrážky zo mzdy)",
      1840.5,
      15,
      "new",
      "Personalistika",
    ],
    [
      "poistovna",
      "Demo Poisťovňa a.s.",
      "Predpis poistného – flotila vozidiel 2027",
      2160,
      30,
      "processed",
      null,
    ],
    [
      "danovy_urad",
      "Daňový úrad Demo",
      "Výzva na doplnenie daňového priznania k DPH",
      null,
      8,
      "new",
      "Úrady",
    ],
    [
      "socialna_zdravotna",
      "Sociálna poisťovňa – pobočka Demo",
      "Výkaz poistného a príspevkov – oznámenie o nedoplatku",
      112.4,
      10,
      "processed",
      "Úrady",
    ],
    [
      "zmluva",
      "Prenájom Priestorov Demo s.r.o.",
      "Dodatok č. 3 k nájomnej zmluve – predĺženie do 2028",
      null,
      null,
      "exported",
      "Zmluvy 2026",
    ],
    [
      "zmluva",
      "Gama Soft s.r.o.",
      "Zmluva o dielo – modul reporty",
      24000,
      null,
      "processed",
      "Zmluvy 2026",
    ],
    [
      "leasing_uver",
      "Demo Leasing a.s.",
      "Splátkový kalendár – osobné vozidlo BL-123XY",
      18900,
      null,
      "processed",
      null,
    ],
    [
      "uradny_list",
      "Okresný úrad Demo – odbor živnostenského podnikania",
      "Rozhodnutie o zmene údajov v živnostenskom registri",
      null,
      null,
      "exported",
      "Úrady",
    ],
    [
      "ine",
      "Demo Energia a.s.",
      "Oznámenie o zmene cenníka elektriny od 1. 1. 2027",
      null,
      null,
      "new",
      null,
    ],
    [
      "poistovna",
      "Demo Poisťovňa a.s.",
      "Poistná zmluva – zodpovednosť za škodu",
      640,
      21,
      "processed",
      null,
    ],
    [
      "danovy_urad",
      "Daňový úrad Demo",
      "Platobný výmer – daň z motorových vozidiel",
      386,
      4,
      "new",
      "Úrady",
    ],
    [
      "zmluva",
      "Demo Telekom a.s.",
      "Rámcová zmluva o poskytovaní elektronických komunikačných služieb",
      null,
      null,
      "processed",
      "Zmluvy 2026",
    ],
    [
      "exekucia",
      "Exekútorský úrad Demo",
      "Príkaz na začatie exekúcie – zastavenie",
      null,
      null,
      "exported",
      "Personalistika",
    ],
    [
      "ine",
      "Mestský úrad Demo",
      "Rozhodnutie o miestnom poplatku za komunálny odpad",
      96,
      -3,
      "new",
      null,
    ],
    [
      "socialna_zdravotna",
      "Zdravotná poisťovňa Demo",
      "Ročné zúčtovanie zdravotného poistenia – preplatok",
      -54.2,
      null,
      "processed",
      "Úrady",
    ],
    [
      "uradny_list",
      "Štatistický úrad Demo",
      "Výzva na vyplnenie štatistického výkazu",
      null,
      12,
      "new",
      "Úrady",
    ],
  ];
  ostDef.forEach(([kind, sender, subject, amount, lehota, status, priecinok], i) => {
    const id = uid(`ostatny:${i}`);
    const prijate2 = den(-i * 6 - 2);
    ostatne.push({
      id,
      company_id: FIRMA,
      kind,
      sender,
      subject,
      received_date: prijate2,
      amount,
      currency: "EUR",
      due_date: lehota == null ? null : den(lehota),
      note:
        i === 0 ? "Zrážky zo mzdy začať od najbližšej výplaty. Kópiu odovzdať účtovníčke." : null,
      status,
      processed_at: status !== "new" ? cas(-i * 6) : null,
      processed_by: status !== "new" ? MAJITEL : null,
      exported_at: status === "exported" ? cas(-i * 6 + 5) : null,
      priecinok,
      stitky: i % 5 === 1 ? ["dôležité"] : [],
      created_by: MAJITEL,
      created_at: prijate2 + "T09:00:00.000Z",
      updated_at: prijate2 + "T09:00:00.000Z",
    });
    const pocet = i % 4 === 0 ? 2 : 1;
    for (let f = 0; f < pocet; f++) {
      subory.push({
        id: uid(`ostatny-subor:${i}:${f}`),
        document_id: id,
        company_id: FIRMA,
        path: `${FIRMA}/ostatne/${id}/${f === 0 ? "dokument.pdf" : "priloha.png"}`,
        name: f === 0 ? `${kind}-${i + 1}.pdf` : "fotka-obalky.png",
        mime: f === 0 ? "application/pdf" : "image/png",
        size: f === 0 ? 27720 : 21561,
        position: f,
        created_at: prijate2 + "T09:00:00.000Z",
      });
    }
  });
  db.vloz("other_documents", ostatne);
  db.vloz("other_document_files", subory);

  /* ================================================= kôš */
  const vKosi: Riadok[] = [];
  [0, 1, 2].forEach((i) => {
    const pol = [
      {
        name: ["Parkovné (duplicitný sken)", "Káva (omylom nahratý)", "Taxi – súkromná jazda"][i],
        quantity: 1,
        unit: "ks",
        unit_price: [2.44, 3.25, 14.6][i],
        vat_rate: 23,
      },
    ];
    const s = spocitaj(pol);
    const zaznamId = uid(`kos:blocek:${i}`);
    const zaznam = db.doplnRiadok("expense_documents", {
      id: zaznamId,
      company_id: FIRMA,
      created_by: MAJITEL,
      issue_date: den(-10 - i * 9),
      supplier_name: ["Mestské parkovisko Demo", "Kaviareň Demo Espresso", "Taxi Demo"][i],
      document_number: `KOS-${i + 1}`,
      net_amount: s.zaklad,
      vat_amount: s.dph,
      total_amount: s.spolu,
      vat_rate: 23,
      vat_breakdown: s.rozpis,
      items: s.items,
      currency: "EUR",
      payment_method: "hotovost",
      status: "new",
      file_path: `${FIRMA}/blocky/${zaznamId}.png`,
      created_at: cas(-10 - i * 9),
    });
    vKosi.push({
      id: uid(`kos:${i}`),
      company_id: FIRMA,
      druh: "doklad",
      zaznam_id: zaznamId,
      zaznam,
      vazby: { banka: [] },
      popis: [zaznam.supplier_name, zaznam.document_number].join(" · "),
      zmazal: i === 1 ? UCTOVNIK : MAJITEL,
      zmazane_at: cas(-3 - i * 11, 14),
    });
  });
  {
    const zaznam = db.doplnRiadok("nespracovane_doklady", {
      id: uid("kos:nesprac:1"),
      company_id: FIRMA,
      created_by: MAJITEL,
      zdroj: "mail",
      stav: "vytazene",
      druh: "faktura",
      file_name: "reklama-newsletter.pdf",
      udaje: {
        dodavatel: { nazov: "Newsletter Demo" },
        cislo: "NL-1",
        datumVystavenia: den(-15),
        celkom: 0,
        mena: "EUR",
      },
      created_at: cas(-15),
    });
    vKosi.push({
      id: uid("kos:3"),
      company_id: FIRMA,
      druh: "nespracovany",
      zaznam_id: zaznam.id,
      zaznam,
      vazby: {},
      popis: "Newsletter Demo · NL-1 (nie je doklad)",
      zmazal: MAJITEL,
      zmazane_at: cas(-14, 9),
    });
  }
  db.vloz("kos_dokladov", vKosi);

  /* ================================================= schvaľovanie */
  const firma = db.tabulka("companies").find((c) => c.id === FIRMA);
  if (firma) {
    firma.schvalovanie_zapnute = true;
    firma.schvalovanie_od = cas(-21, 0);
    firma.schvalovanie_agendy = ["doklad", "prijata"];
    firma.schvalovanie_auto_pod = 20;
  }
  const cestaHlavna = uid("schval-cesta:predvolena");
  const cestaVelke = uid("schval-cesta:velke");
  db.vloz("schvalovacie_cesty", [
    {
      id: cestaHlavna,
      company_id: FIRMA,
      nazov: "Bežné doklady — účtovník",
      urovne: [[UCTOVNIK]],
      podmienky: {},
      predvolena: true,
      poradie: 0,
      created_at: cas(-60),
    },
    {
      id: cestaVelke,
      company_id: FIRMA,
      nazov: "Prijaté faktúry nad 1 000 € — účtovník a majiteľ",
      urovne: [[UCTOVNIK], [MAJITEL]],
      podmienky: { agenda: "prijata", suma_od: 1000 },
      predvolena: false,
      poradie: 1,
      created_at: cas(-60),
    },
  ]);
  const odSchval = den(-21);
  const naSchval = [
    ...prijate
      .filter((p) => p.created_at >= odSchval)
      .map((p) => ({ agenda: "prijata", d: p, suma: Number(p.amount_total) })),
    ...blocky
      .filter((b) => b.created_at >= odSchval)
      .map((b) => ({ agenda: "doklad", d: b, suma: Number(b.total_amount) })),
  ];
  const schval: Riadok[] = [];
  const hist: Riadok[] = [];
  naSchval.forEach(({ agenda, d, suma }, i) => {
    const velke = agenda === "prijata" && suma >= 1000;
    const urovne = velke ? [[UCTOVNIK], [MAJITEL]] : [[UCTOVNIK]];
    const varianty = ["caka", "schvaleny", "caka", "vrateny", "schvaleny", "zamietnuty"];
    const stav = varianty[i % varianty.length];
    const uroven = stav === "schvaleny" ? urovne.length : stav === "caka" && velke && i % 2 ? 1 : 0;
    const id = uid(`schval:${agenda}:${d.id}`);
    schval.push({
      id,
      company_id: FIRMA,
      agenda,
      doklad_id: d.id,
      cesta_id: velke ? cestaVelke : cestaHlavna,
      urovne,
      schvalena_uroven: uroven,
      stav,
      created_at: d.created_at,
      updated_at: d.created_at,
    });
    if (uroven >= 1)
      hist.push({
        id: uid(`schval-h:${id}:1`),
        schvalovanie_id: id,
        company_id: FIRMA,
        user_id: UCTOVNIK,
        akcia: "schvalil",
        uroven: 1,
        poznamka: null,
        created_at: pridajDni(String(d.created_at).slice(0, 10), 1) + "T10:00:00.000Z",
      });
    if (uroven >= 2)
      hist.push({
        id: uid(`schval-h:${id}:2`),
        schvalovanie_id: id,
        company_id: FIRMA,
        user_id: MAJITEL,
        akcia: "schvalil",
        uroven: 2,
        poznamka: "OK, uhradiť v termíne.",
        created_at: pridajDni(String(d.created_at).slice(0, 10), 2) + "T10:00:00.000Z",
      });
    if (stav === "vrateny")
      hist.push({
        id: uid(`schval-h:${id}:v`),
        schvalovanie_id: id,
        company_id: FIRMA,
        user_id: UCTOVNIK,
        akcia: "vratil",
        uroven: 1,
        poznamka: "Chýba číslo objednávky, prosím doplniť.",
        created_at: pridajDni(String(d.created_at).slice(0, 10), 1) + "T11:00:00.000Z",
      });
    if (stav === "zamietnuty")
      hist.push({
        id: uid(`schval-h:${id}:z`),
        schvalovanie_id: id,
        company_id: FIRMA,
        user_id: UCTOVNIK,
        akcia: "zamietol",
        uroven: 1,
        poznamka: "Súkromný výdavok — nepatrí do firmy.",
        created_at: pridajDni(String(d.created_at).slice(0, 10), 1) + "T11:30:00.000Z",
      });
  });
  db.vloz("schvalovanie", schval);
  db.vloz("schvalovanie_historia", hist);

  /* ================================================= komentáre */
  const kom: Riadok[] = [];
  const naKom: [string, Riadok, string, string, string[]][] = [
    [
      "prijata",
      prijate.find((p) => p.status === "received")!,
      "Peter, prosím skontroluj, či sedí počet kusov s dodacím listom.",
      MAJITEL,
      [UCTOVNIK],
    ],
    [
      "prijata",
      prijate.find((p) => p.status === "received")!,
      "Sedí, 5 ks notebookov aj 6 monitorov prijatých na sklad.",
      UCTOVNIK,
      [],
    ],
    [
      "prijata",
      prijate.filter((p) => p.status === "booked")[0],
      "Predkontáciu som zmenil na 518 – služby.",
      UCTOVNIK,
      [],
    ],
    ["doklad", blocky[0], "Toto je tankovanie služobného auta, nie súkromné.", MAJITEL, []],
    ["doklad", blocky[2], "Chýba čitateľný sken — vieš nahrať lepšiu fotku?", UCTOVNIK, [MAJITEL]],
    ["doklad", blocky[9], "Reprezentácia — bez nároku na odpočet DPH.", UCTOVNIK, []],
  ];
  naKom.forEach(([agenda, d, text, kto, upozornit], i) => {
    if (!d) return;
    kom.push({
      id: uid(`koment:${i}`),
      company_id: FIRMA,
      agenda,
      doklad_id: d.id,
      user_id: kto,
      text,
      upozornit,
      vyriesili: i === 1 ? [MAJITEL] : [],
      created_at: cas(-3 + Math.floor(i / 2), 9 + i, 10),
    });
  });
  db.vloz("komentare_dokladov", kom);
  /* Duplicita (duplicita-zauctovania.ts): tá istá faktúra nahratá druhýkrát —
     prvá je zaúčtovaná, druhá sa zaúčtovať nedá. Druhý pár: ani jedna nie je. */
  {
    const pred = prijate.length;
    const pol = [{ name: "Kancelársky papier A4 (krabica)", quantity: 4, unit: "ks", unit_price: 28.5, vat_rate: 23 }];
    const prva = pridajPrijatu({ kluc: "duplicita:1", k: D("velkoobchod"), datum: den(-9), polozky: pol, cislo: "FA-2026-7701", stav: "booked" });
    prva.zauctovane_at = prva.created_at;
    prva.zauctoval = UCTOVNIK;
    prva.pohoda_predkontacia = "501";
    prva.pohoda_clenenie_dph = "PD";
    pridajPrijatu({ kluc: "duplicita:2", k: D("velkoobchod"), datum: den(-9), polozky: pol, cislo: "FA 2026 7701", stav: "received", extra: { source: "mail" } });
    const pol2 = [{ name: "Servis tlačiarne", quantity: 1, unit: "ks", unit_price: 89, vat_rate: 23 }];
    pridajPrijatu({ kluc: "duplicita:3", k: D("gama"), datum: den(-4), polozky: pol2, cislo: "2026-0415", stav: "received" });
    pridajPrijatu({ kluc: "duplicita:4", k: D("gama"), datum: den(-4), polozky: pol2, cislo: "2026-0415", stav: "received", extra: { source: "mail" } });
    // Na konci modulu, aby pridané volania náhody nezmenili ostatné demo dáta.
    db.vloz("purchase_invoices", prijate.slice(pred));
    PRIJATE.push(...prijate.slice(pred));
  }
}
