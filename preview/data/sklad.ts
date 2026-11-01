/**
 * Demo dáta: sklad a cenník Demo s.r.o.
 *
 * - sklady, kategórie, skladové karty (tovar z cenníka + ďalší tovar),
 * - pohyby za ~10 mesiacov: príjmy od dodávateľov (rôzne nákupné ceny),
 *   výdaje cez faktúry (odkaz na skutočnú faktúru a jej položku), ručné
 *   výdaje na zákazky, opravy, inventúra, presuny medzi skladmi,
 * - stav skladu (`stock_levels`) = súčet pohybov, vážená nákupná cena
 *   prepočítaná pohyb po pohybe ako trigger v databáze,
 * - objednávky u dodávateľa, rezervácie, inventúry, dodacie listy (AI import),
 * - cenník: cenové skupiny, ceny pre skupinu/odberateľa, akcie.
 *
 * Konvencia množstva ako v DB: príjem/výdaj/faktúra/dobropis kladne (smer
 * určuje typ), oprava a inventúra so znamienkom.
 */
import type { DemoDb, Riadok } from "../server/db";
import { registrujRpc } from "../server/rpc";
import { FIRMA, MAJITEL, UCTOVNIK } from "./zaklad";
import { kontakt, kontaktData, produkt, PRODUKTY } from "./kontakty";
import { zakazka } from "./zakazky";
import { cas, den, nahoda, pridajDni, r2, uid } from "./pomocne";

export const SKLAD_HLAVNY = uid("sklad:hlavny");
export const SKLAD_KOSICE = uid("sklad:kosice");
export const SKLAD_EXTERNY = uid("sklad:externy");

/** Tovar navyše (produkt sa založí tu) — kľúč, názov, MJ, predajná cena, kategória. */
const DALSI_TOVAR: [string, string, string, number, string][] = [
  ["toner", "Toner do tlačiarne čierny (kompatibilný)", "ks", 39.9, "spotreba"],
  ["router", "Wi-Fi router dvojpásmový", "ks", 89, "elektro"],
  ["headset", "Slúchadlá s mikrofónom USB", "ks", 49.9, "elektro"],
  ["klavesnica", "Klávesnica SK/CZ bezdrôtová", "ks", 34.9, "elektro"],
  ["dok", "Dokovacia stanica USB-C", "ks", 129, "elektro"],
  ["ssd", "SSD disk 1 TB", "ks", 79, "elektro"],
  ["stol", "Písací stôl výškovo nastaviteľný", "ks", 389, "nabytok"],
  ["skrina", "Kancelárska skriňa uzamykateľná", "ks", 259, "nabytok"],
  ["segregator", "Šanón A4 8 cm", "ks", 2.9, "kancel"],
  ["pero", "Guľôčkové pero modré (balenie 10 ks)", "bal", 4.5, "kancel"],
  ["obalky", "Obálky C5 samolepiace (50 ks)", "bal", 6.2, "kancel"],
  ["caj", "Čaj zelený, 20 vrecúšok", "bal", 2.4, "potraviny"],
  ["voda", "Minerálna voda 1,5 l (balenie 6 ks)", "bal", 3.6, "potraviny"],
  [
    "kabelaz",
    'Štruktúrovaná kabeláž – sada patch káblov Cat6A v rôznych dĺžkach a farbách vrátane organizéra do racku 19"',
    "sada",
    149,
    "elektro",
  ],
];

const KATEGORIE: [string, string, string][] = [
  ["elektro", "Elektronika a príslušenstvo", "modra"],
  ["kancel", "Kancelárske potreby", "zelena"],
  ["nabytok", "Nábytok", "oranzova"],
  ["potraviny", "Potraviny a nápoje", "zlta"],
  ["spotreba", "Spotrebný materiál", "siva"],
];

/** Kategória tovaru z cenníka */
const KATEGORIA_PRODUKTU: Record<string, string> = {
  notebook: "elektro",
  monitor: "elektro",
  mys: "elektro",
  kabel: "elektro",
  papier: "kancel",
  kniha: "kancel",
  kava: "potraviny",
  dlhy: "nabytok",
  stolicka: "nabytok",
  licencia: "elektro",
};

export const kartaSkladu = (kluc: string) => uid(`skladova-karta:${kluc}`);

export function naplnSklad(db: DemoDb) {
  const n = nahoda(4242);

  /* ------------------------------------------------ sklady a kategórie */
  db.vloz("warehouses", [
    {
      id: SKLAD_HLAVNY,
      company_id: FIRMA,
      name: "Hlavný sklad – Bratislava",
      address: "Ukážková 12, 811 01 Bratislava",
      active: true,
      created_at: cas(-330),
    },
    {
      id: SKLAD_KOSICE,
      company_id: FIRMA,
      name: "Pobočka Košice",
      address: "Nová 1, 040 01 Košice",
      active: true,
      created_at: cas(-250),
    },
    {
      id: SKLAD_EXTERNY,
      company_id: FIRMA,
      name: "Externý konsignačný sklad u logistického partnera – Senec, hala C (dlhý názov)",
      address: "Priemyselná zóna 3, 903 01 Senec",
      active: true,
      created_at: cas(-120),
    },
  ]);
  db.vloz(
    "stock_categories",
    KATEGORIE.map(([k, name, color], i) => ({
      id: uid(`kategoria:${k}`),
      company_id: FIRMA,
      name,
      color,
      note: i === 0 ? "Hardvér, periférie, káble" : null,
      created_at: cas(-330 + i),
    })),
  );

  /* ------------------------------------------------ produkty navyše */
  db.vloz(
    "products",
    DALSI_TOVAR.map(([k, name, unit, cena], i) => ({
      id: produkt(k),
      company_id: FIRMA,
      code: `TOV-${200 + i}`,
      name,
      unit,
      unit_price: cena,
      vat_rate: k === "caj" || k === "voda" ? 19 : 23,
      active: true,
      created_at: cas(-320 + i),
    })),
  );

  /* ------------------------------------------------ skladové karty */
  type Karta = {
    kluc: string;
    sale: number;
    unit: string;
    vat: number;
    kat: string;
    dodavatel: string;
    min: number;
    opt: number;
    track: boolean;
    code: string;
  };
  const karty: Karta[] = [];
  for (const p of PRODUKTY) {
    if (p.code.startsWith("SLU")) continue; // služby sa neskladujú
    karty.push({
      kluc: p.kluc,
      sale: p.unit_price,
      unit: p.unit,
      vat: p.vat_rate,
      kat: KATEGORIA_PRODUKTU[p.kluc] ?? "spotreba",
      dodavatel: ["papier", "kniha", "kava"].includes(p.kluc) ? "kancel" : "velkoobchod",
      min: p.unit_price > 300 ? 2 : p.unit_price > 50 ? 5 : 20,
      opt: p.unit_price > 300 ? 6 : p.unit_price > 50 ? 15 : 60,
      track: p.kluc !== "licencia",
      code: p.code,
    });
  }
  DALSI_TOVAR.forEach(([k, , unit, cena, kat], i) => {
    karty.push({
      kluc: k,
      sale: cena,
      unit,
      vat: k === "caj" || k === "voda" ? 19 : 23,
      kat,
      dodavatel:
        kat === "kancel" || kat === "potraviny" || kat === "spotreba" ? "kancel" : "velkoobchod",
      min: cena > 300 ? 1 : cena > 50 ? 4 : 25,
      opt: cena > 300 ? 4 : cena > 50 ? 10 : 80,
      track: true,
      code: `TOV-${200 + i}`,
    });
  });
  const nakupna = (k: Karta) => r2(k.sale * 0.68);

  /* ------------------------------------------------ udalosti pohybov */
  type Udalost = {
    den: string;
    karta: string;
    sklad: string;
    typ: "prijem" | "vydaj" | "faktura" | "oprava" | "inventura" | "dobropis";
    mnozstvo: number; // príjem/výdaj kladne, oprava/inventúra so znamienkom
    cena?: number; // nákupná pri príjme / predajná pri faktúre
    poznamka?: string;
    ref?: Partial<Riadok>;
  };
  const udalosti: Udalost[] = [];

  // Počiatočný stav (príjemka po založení skladu)
  for (const k of karty) {
    if (!k.track) continue;
    udalosti.push({
      den: den(-300 + n.cele(0, 10)),
      karta: k.kluc,
      sklad: SKLAD_HLAVNY,
      typ: "prijem",
      mnozstvo: k.opt + n.cele(0, k.opt),
      cena: nakupna(k),
      poznamka: "Počiatočný stav skladu",
      ref: { source_document_type: "receipt_note" },
    });
  }

  // Výdaje cez vystavené faktúry (skutočné položky faktúr)
  const kartaPodlaProduktu = new Map(karty.map((k) => [produkt(k.kluc), k]));
  const faktury = new Map(
    db
      .tabulka("invoices")
      .filter((f) => f.company_id === FIRMA)
      .map((f) => [f.id, f]),
  );
  for (const it of db.tabulka("invoice_items")) {
    const f = faktury.get(it.invoice_id);
    const k = it.product_id ? kartaPodlaProduktu.get(it.product_id) : undefined;
    if (!f || !k || !k.track) continue;
    if (
      f.type !== "regular" ||
      ["draft", "cancelled"].includes(f.status) ||
      f.issue_date < den(-290)
    )
      continue;
    if (Number(it.quantity) <= 0) continue;
    udalosti.push({
      den: f.issue_date,
      karta: k.kluc,
      sklad: SKLAD_HLAVNY,
      typ: "faktura",
      mnozstvo: Number(it.quantity),
      cena: Number(it.unit_price),
      ref: {
        reference_type: "invoice",
        reference_id: f.id,
        reference_item_id: it.id,
        source_document_type: "invoice",
        source_document_id: f.id,
        job_id: f.job_id ?? null,
      },
    });
  }

  // Ručné výdaje (aj na zákazky), opravy, príjmy do Košíc a externého skladu
  const sTrackom = karty.filter((k) => k.track);
  for (let i = 0; i < 70; i++) {
    const k = n.vyber(sTrackom);
    const posun = -280 + Math.floor((i * 275) / 70);
    const naZakazku = i % 3 === 0 ? [0, 1, 2, 3, 4, 5, 9, 10][i % 8] : null;
    udalosti.push({
      den: den(posun),
      karta: k.kluc,
      sklad: i % 7 === 0 ? SKLAD_KOSICE : SKLAD_HLAVNY,
      typ: "vydaj",
      mnozstvo: Math.max(1, Math.round(k.opt / n.cele(4, 8))),
      poznamka:
        naZakazku != null
          ? "Výdaj materiálu na zákazku"
          : n.vyber([
              "Spotreba v kancelárii",
              "Vzorka pre zákazníka",
              "Výdajka – interná potreba",
              "Výmena reklamovaného kusu",
            ]),
      ref: {
        source_document_type: "issue_note",
        job_id: naZakazku != null ? zakazka(naZakazku) : null,
      },
    });
  }
  for (let i = 0; i < 12; i++) {
    const k = sTrackom[(i * 5) % sTrackom.length];
    udalosti.push({
      den: den(-240 + i * 18),
      karta: k.kluc,
      sklad: i % 2 ? SKLAD_KOSICE : SKLAD_EXTERNY,
      typ: "prijem",
      mnozstvo: k.opt,
      cena: r2(nakupna(k) * (0.95 + n.cislo() * 0.12)),
      poznamka: "Príjemka od dodávateľa",
      ref: { source_document_type: "receipt_note" },
    });
  }
  for (let i = 0; i < 6; i++) {
    const k = sTrackom[(i * 7 + 3) % sTrackom.length];
    udalosti.push({
      den: den(-200 + i * 30),
      karta: k.kluc,
      sklad: SKLAD_HLAVNY,
      typ: "oprava",
      mnozstvo: i % 2 ? -1 : 1,
      poznamka: i % 2 ? "Poškodený kus – odpis" : "Nájdený kus pri upratovaní skladu",
      ref: { source_document_type: "manual" },
    });
  }

  /* ------------------------------------------------ presuny medzi skladmi */
  const presuny: Riadok[] = [];
  const presunyPolozky: Riadok[] = [];
  const presunyDef: [number, string, string, string, string[]][] = [
    [-180, SKLAD_HLAVNY, SKLAD_KOSICE, "completed", ["notebook", "mys", "klavesnica"]],
    [-120, SKLAD_HLAVNY, SKLAD_KOSICE, "completed", ["papier", "segregator", "pero"]],
    [-60, SKLAD_EXTERNY, SKLAD_HLAVNY, "completed", ["monitor", "dok"]],
    [-15, SKLAD_HLAVNY, SKLAD_EXTERNY, "completed", ["stol", "skrina"]],
    [-3, SKLAD_HLAVNY, SKLAD_KOSICE, "draft", ["toner", "headset"]],
    [-40, SKLAD_KOSICE, SKLAD_HLAVNY, "cancelled", ["router"]],
  ];
  presunyDef.forEach(([posun, z, kam, stav, polozky], i) => {
    const id = uid(`presun:${i}`);
    presuny.push({
      id,
      company_id: FIRMA,
      warehouse_from_id: z,
      warehouse_to_id: kam,
      status: stav,
      note: i === 0 ? "Vybavenie novej pobočky" : null,
      created_by: MAJITEL,
      created_at: cas(posun, 9),
      completed_at: stav === "completed" ? cas(posun, 15) : null,
    });
    polozky.forEach((kl, j) => {
      const k = karty.find((x) => x.kluc === kl)!;
      const q = Math.max(1, Math.round(k.opt / 4));
      presunyPolozky.push({
        id: uid(`presun-polozka:${i}:${j}`),
        transfer_id: id,
        source_stock_item_id: kartaSkladu(kl),
        target_stock_item_id: kartaSkladu(kl),
        quantity: q,
        unit_price: nakupna(k),
        created_at: cas(posun, 9),
      });
      if (stav === "completed") {
        const ref = { reference_type: "transfer", reference_id: id };
        udalosti.push({
          den: den(posun),
          karta: kl,
          sklad: z,
          typ: "vydaj",
          mnozstvo: q,
          poznamka: "Presun medzi skladmi",
          ref,
        });
        udalosti.push({
          den: den(posun),
          karta: kl,
          sklad: kam,
          typ: "prijem",
          mnozstvo: q,
          poznamka: "Presun medzi skladmi",
          ref: { ...ref, presun: true } as Partial<Riadok>,
        });
      }
    });
  });

  /* ------------------------------------------------ objednávky u dodávateľa */
  const objStavy: [number, string, string, string[], number | null][] = [
    [-200, "received", "velkoobchod", ["notebook", "monitor", "dok"], 2],
    [-150, "received", "kancel", ["papier", "segregator", "pero", "obalky"], null],
    [-95, "received", "velkoobchod", ["router", "ssd", "kabelaz"], 1],
    [-50, "partially_received", "velkoobchod", ["headset", "klavesnica", "mys"], null],
    [-20, "sent", "velkoobchod", ["notebook", "stolicka", "stol"], 0],
    [-8, "sent", "kancel", ["kava", "caj", "voda"], null],
    [-2, "draft", "velkoobchod", ["monitor", "dlhy"], 4],
    [-70, "cancelled", "kancel", ["toner"], null],
  ];
  const objednavky: Riadok[] = [];
  const objPolozky: Riadok[] = [];
  objStavy.forEach(([posun, stav, dod, polozky, zak], i) => {
    const id = uid(`objednavka-dodavatel:${i}`);
    const d = den(posun);
    const dodavatel = kontaktData(dod);
    objednavky.push({
      id,
      company_id: FIRMA,
      order_number: `OD${d.slice(0, 4)}${String(i + 1).padStart(3, "0")}`,
      order_date: d,
      expected_date: pridajDni(d, 10),
      status: stav,
      supplier_id: kontakt(dod),
      supplier_name: dodavatel.name,
      warehouse_id: SKLAD_HLAVNY,
      currency: "EUR",
      job_id: zak != null ? zakazka(zak) : null,
      note: i === 4 ? "Dodať najneskôr do konca mesiaca, inak storno." : null,
      sent_at: stav !== "draft" ? d + "T10:00:00.000Z" : null,
      received_at: stav === "received" ? pridajDni(d, 7) + "T13:00:00.000Z" : null,
      number_series_id: uid("rad:purchase_order"),
      created_by: MAJITEL,
      created_at: d + "T09:00:00.000Z",
    });
    polozky.forEach((kl, j) => {
      const k = karty.find((x) => x.kluc === kl)!;
      const q = k.opt;
      const prijate =
        stav === "received"
          ? q
          : stav === "partially_received"
            ? j === 0
              ? q
              : j === 1
                ? Math.floor(q / 2)
                : 0
            : 0;
      const cena = r2(nakupna(k) * (0.97 + n.cislo() * 0.08));
      objPolozky.push({
        id: uid(`obj-dod-polozka:${i}:${j}`),
        purchase_order_id: id,
        stock_item_id: kartaSkladu(kl),
        name: PRODUKTY.find((p) => p.kluc === kl)?.name ?? DALSI_TOVAR.find((x) => x[0] === kl)![1],
        quantity: q,
        received_quantity: prijate,
        unit: k.unit,
        unit_price: cena,
        vat_rate: k.vat,
        position: j,
        created_at: d + "T09:00:00.000Z",
      });
      if (prijate > 0) {
        udalosti.push({
          den: pridajDni(d, 7),
          karta: kl,
          sklad: SKLAD_HLAVNY,
          typ: "prijem",
          mnozstvo: prijate,
          cena,
          poznamka: "Príjem z objednávky u dodávateľa",
          ref: {
            reference_type: "purchase_order",
            reference_id: id,
            source_document_type: "receipt_note",
          },
        });
      }
    });
  });

  /* ------------------------------------------------ dodacie listy (AI import) */
  const dodacie: Riadok[] = [];
  [-160, -110, -75, -33, -12].forEach((posun, i) => {
    const kl = [
      ["toner", "ssd"],
      ["headset", "klavesnica", "mys"],
      ["voda", "caj"],
      ["segregator", "obalky", "pero"],
      ["router", "kabel"],
    ][i];
    const dod = i % 2 ? "kancel" : "velkoobchod";
    const polozky = kl.map((x) => {
      const k = karty.find((y) => y.kluc === x)!;
      return {
        kluc: x,
        name: PRODUKTY.find((p) => p.kluc === x)?.name ?? DALSI_TOVAR.find((t) => t[0] === x)![1],
        code: k.code,
        quantity: Math.round(k.opt / 2),
        unit: k.unit,
        unit_price: r2(nakupna(k) * 1.02),
      };
    });
    const cislo = `DL-${2026}-${String(310 + i * 17).padStart(5, "0")}`;
    dodacie.push({
      id: uid(`dodaci-list:${i}`),
      company_id: FIRMA,
      user_id: i % 2 ? UCTOVNIK : MAJITEL,
      action: "ai_delivery_import",
      entity_type: "stock_movements",
      entity_id: null,
      created_at: cas(posun, 11),
      metadata: {
        storage_path: `${FIRMA}/dodacie-listy/${cislo}.pdf`,
        source_filename: `${cislo}.pdf`,
        supplier: kontaktData(dod).name,
        delivery_number: cislo,
        counts: {
          createdProducts: 0,
          updatedProducts: i === 1 ? 1 : 0,
          createdItems: 0,
          movements: polozky.length,
          errors: 0,
        },
        items: polozky.map(({ kluc: _k, ...p }) => p),
      },
    });
    for (const p of polozky) {
      udalosti.push({
        den: den(posun),
        karta: p.kluc,
        sklad: SKLAD_HLAVNY,
        typ: "prijem",
        mnozstvo: p.quantity,
        cena: p.unit_price,
        poznamka: `Dodací list ${cislo}`,
        ref: { source_document_type: "receipt_note" },
      });
    }
  });

  /* ------------------------------------------------ inventúra (dokončená) */
  const invDen = den(-90);
  const invId = uid("inventura:1");
  const invPolozkyKarty = sTrackom.slice(0, 12).map((k) => k.kluc);
  // Rozdiely inventúry sa doplnia pri prechode udalosťami (poznáme očakávaný stav).
  const inventuraRozdiely: Record<string, number> = { mys: -2, papier: 3, kabel: -1 };

  /* ------------------------------------------------ prechod udalosťami */
  udalosti.sort(
    (a, b) =>
      a.den.localeCompare(b.den) || (a.typ === "prijem" ? -1 : 1) - (b.typ === "prijem" ? -1 : 1),
  );
  const stav = new Map<string, number>(); // karta|sklad
  const celkom = new Map<string, number>(); // karta
  const priemer = new Map<string, number>();
  const posledna = new Map<string, number>();
  const pohyby: Riadok[] = [];
  const invPolozky: Riadok[] = [];
  let inventuraHotova = false;
  let poradie = 0;

  const pridajPohyb = (u: Udalost) => {
    const k = karty.find((x) => x.kluc === u.karta)!;
    const kl = `${u.karta}|${u.sklad}`;
    const delta =
      u.typ === "prijem" || u.typ === "dobropis"
        ? u.mnozstvo
        : u.typ === "vydaj" || u.typ === "faktura"
          ? -u.mnozstvo
          : u.mnozstvo;
    const pred = celkom.get(u.karta) ?? 0;
    const avg = priemer.get(u.karta) ?? nakupna(k);
    let unitCost = avg;
    if (u.typ === "prijem") {
      const c = u.cena ?? avg;
      unitCost = c;
      const presun = (u.ref as any)?.presun;
      if (!presun) {
        priemer.set(
          u.karta,
          pred <= 0 ? c : r2(((pred * avg + u.mnozstvo * c) / (pred + u.mnozstvo)) * 1000) / 1000,
        );
        posledna.set(u.karta, c);
      }
    }
    stav.set(kl, (stav.get(kl) ?? 0) + delta);
    celkom.set(u.karta, pred + delta);
    const { presun: _p, ...ref } = (u.ref ?? {}) as Riadok;
    const jednotkova =
      u.typ === "faktura" ? (u.cena ?? k.sale) : u.typ === "prijem" ? unitCost : avg;
    pohyby.push({
      id: uid(`pohyb:${poradie++}`),
      company_id: FIRMA,
      warehouse_id: u.sklad,
      stock_item_id: kartaSkladu(u.karta),
      type: u.typ,
      quantity: u.mnozstvo,
      unit_price: r2(jednotkova),
      unit_cost: r2(unitCost * 100000) / 100000,
      total_value: r2(Math.abs(u.mnozstvo) * jednotkova),
      side_costs_total: u.typ === "prijem" ? 0 : null,
      note: u.poznamka ?? null,
      created_by: poradie % 4 === 0 ? UCTOVNIK : MAJITEL,
      created_at:
        u.den +
        `T${String(8 + (poradie % 9)).padStart(2, "0")}:${String((poradie * 7) % 60).padStart(2, "0")}:00.000Z`,
      reference_type: null,
      reference_id: null,
      reference_item_id: null,
      source_document_type: null,
      source_document_id: null,
      job_id: null,
      ...ref,
    });
  };

  for (const u of udalosti) {
    if (!inventuraHotova && u.den > invDen) {
      inventuraHotova = true;
      for (const kl of invPolozkyKarty) {
        const ocak = stav.get(`${kl}|${SKLAD_HLAVNY}`) ?? 0;
        const roz = inventuraRozdiely[kl] ?? 0;
        invPolozky.push({
          id: uid(`inv-polozka:1:${kl}`),
          inventory_count_id: invId,
          stock_item_id: kartaSkladu(kl),
          expected_quantity: ocak,
          counted_quantity: ocak + roz,
          difference: roz,
          note: roz ? (roz < 0 ? "Chýba" : "Prebytok") : null,
          created_at: invDen + "T08:00:00.000Z",
        });
        if (roz)
          pridajPohyb({
            den: invDen,
            karta: kl,
            sklad: SKLAD_HLAVNY,
            typ: "inventura",
            mnozstvo: roz,
            poznamka: "Inventúrny rozdiel",
            ref: {
              reference_type: "inventory_count",
              reference_id: invId,
              source_document_type: "inventory",
            },
          });
      }
    }
    // Výdaj nesmie ísť do mínusu — pred ním sa doplní príjem od dodávateľa.
    if (u.typ === "vydaj" || u.typ === "faktura") {
      const dostupne = stav.get(`${u.karta}|${u.sklad}`) ?? 0;
      if (dostupne < u.mnozstvo) {
        const k = karty.find((x) => x.kluc === u.karta)!;
        pridajPohyb({
          den: u.den,
          karta: u.karta,
          sklad: u.sklad,
          typ: "prijem",
          mnozstvo: u.mnozstvo - dostupne + k.opt,
          cena: r2(nakupna(k) * (0.94 + n.cislo() * 0.14)),
          poznamka: "Príjemka od dodávateľa",
          ref: { source_document_type: "receipt_note" },
        });
      }
    }
    pridajPohyb(u);
  }

  // Doplnenie hlavného skladu, aby aktuálny stav pokryl rezervácie aj minimum
  // (posledné výdaje faktúrami ho inak často vynulovali).
  const podMinimom = ["toner", "headset", "ssd", "kava"];
  for (const k of sTrackom) {
    if (podMinimom.includes(k.kluc)) continue;
    const akt = stav.get(`${k.kluc}|${SKLAD_HLAVNY}`) ?? 0;
    const ciel = Math.max(k.min + 5, Math.round(k.opt * 0.6));
    if (akt < ciel)
      pridajPohyb({
        den: den(-6),
        karta: k.kluc,
        sklad: SKLAD_HLAVNY,
        typ: "prijem",
        mnozstvo: ciel - akt,
        cena: r2(nakupna(k) * (0.96 + n.cislo() * 0.08)),
        poznamka: "Príjemka od dodávateľa",
        ref: { source_document_type: "receipt_note" },
      });
  }

  // Niekoľko kariet pod minimom (podklad pre „Pod minimom“ a dashboard).
  for (const kl of podMinimom) {
    const k = karty.find((x) => x.kluc === kl)!;
    const akt = stav.get(`${kl}|${SKLAD_HLAVNY}`) ?? 0;
    const ciel = Math.max(0, k.min - 2);
    if (akt > ciel)
      pridajPohyb({
        den: den(-1),
        karta: kl,
        sklad: SKLAD_HLAVNY,
        typ: "vydaj",
        mnozstvo: akt - ciel,
        poznamka: "Výdaj na reklamné akcie",
        ref: { source_document_type: "issue_note" },
      });
  }

  db.vloz("stock_movements", pohyby);
  db.vloz("stock_transfers", presuny);
  db.vloz("stock_transfer_items", presunyPolozky);
  db.vloz("purchase_orders", objednavky);
  db.vloz("purchase_order_items", objPolozky);
  db.vloz("stock_audit_logs", dodacie);

  /* ------------------------------------------------ rezervácie */
  const rezervacie: Riadok[] = [];
  const objednavkyOdberatelov = db
    .tabulka("sales_orders")
    .filter(
      (o) => o.company_id === FIRMA && ["confirmed", "partially_invoiced"].includes(o.status),
    );
  objednavkyOdberatelov.slice(0, 4).forEach((o, i) => {
    const kl = ["notebook", "monitor", "kabel", "notebook"][i];
    rezervacie.push({
      id: uid(`rezervacia:${i}`),
      company_id: FIRMA,
      stock_item_id: kartaSkladu(kl),
      warehouse_id: SKLAD_HLAVNY,
      quantity: i + 1,
      status: "active",
      source_document_type: "sales_order",
      source_document_id: o.id,
      note: `Objednávka ${o.order_number}`,
      expires_at: cas(14),
      created_by: MAJITEL,
      created_at: o.created_at,
    });
  });
  rezervacie.push({
    id: uid("rezervacia:ponuka"),
    company_id: FIRMA,
    stock_item_id: kartaSkladu("stolicka"),
    warehouse_id: SKLAD_HLAVNY,
    quantity: 2,
    status: "active",
    source_document_type: "quote",
    source_document_id: uid("ponuka:1"),
    note: "Rezervácia k cenovej ponuke",
    expires_at: cas(7),
    created_by: MAJITEL,
    created_at: cas(-5),
  });
  rezervacie.push({
    id: uid("rezervacia:stara"),
    company_id: FIRMA,
    stock_item_id: kartaSkladu("mys"),
    warehouse_id: SKLAD_HLAVNY,
    quantity: 3,
    status: "released",
    source_document_type: "manual",
    source_document_id: null,
    note: "Uvoľnená rezervácia",
    expires_at: cas(-10),
    created_by: UCTOVNIK,
    created_at: cas(-25),
  });
  db.vloz("stock_reservations", rezervacie);
  const rezervovane = new Map<string, number>();
  for (const r of rezervacie)
    if (r.status === "active")
      rezervovane.set(
        `${r.stock_item_id}|${r.warehouse_id}`,
        (rezervovane.get(`${r.stock_item_id}|${r.warehouse_id}`) ?? 0) + r.quantity,
      );

  /* ------------------------------------------------ karty a stavy */
  db.vloz(
    "stock_items",
    karty.map((k, i) => ({
      id: kartaSkladu(k.kluc),
      company_id: FIRMA,
      product_id: produkt(k.kluc),
      sku: k.code,
      barcode: `858${String(1000000000 + i * 7919).slice(0, 10)}`,
      category_id: uid(`kategoria:${k.kat}`),
      supplier_id: kontakt(k.dodavatel),
      unit: k.unit,
      vat_rate: k.vat,
      sale_price: k.sale,
      purchase_price: nakupna(k),
      avg_purchase_price: priemer.get(k.kluc) ?? nakupna(k),
      last_purchase_price: posledna.get(k.kluc) ?? nakupna(k),
      min_stock: k.min,
      optimal_stock: k.opt,
      track_stock: k.track,
      location: k.track
        ? `${"ABC"[i % 3]}-${String((i % 6) + 1).padStart(2, "0")}-${String((i % 4) + 1).padStart(2, "0")}`
        : null,
      name_en: i % 4 === 0 ? `Demo item ${k.code}` : null,
      description:
        k.kluc === "kabelaz"
          ? "Sada obsahuje 48 káblov v dĺžkach 0,5–3 m, organizér a popisovacie štítky."
          : null,
      archived_at: k.kluc === "caj" ? cas(-20) : null,
      created_at: cas(-310 + i),
    })),
  );
  const levely: Riadok[] = [];
  for (const [kl, q] of stav) {
    const [karta, sklad] = kl.split("|");
    const itemId = kartaSkladu(karta);
    levely.push({
      id: uid(`stav:${kl}`),
      company_id: FIRMA,
      warehouse_id: sklad,
      stock_item_id: itemId,
      quantity: r2(q),
      reserved_quantity: rezervovane.get(`${itemId}|${sklad}`) ?? 0,
      updated_at: cas(-1),
    });
  }
  db.vloz("stock_levels", levely);

  db.vloz("inventory_counts", [
    {
      id: invId,
      company_id: FIRMA,
      warehouse_id: SKLAD_HLAVNY,
      status: "completed",
      started_at: invDen + "T07:30:00.000Z",
      completed_at: invDen + "T15:00:00.000Z",
      created_by: MAJITEL,
      created_at: invDen + "T07:30:00.000Z",
    },
    {
      id: uid("inventura:2"),
      company_id: FIRMA,
      warehouse_id: SKLAD_KOSICE,
      status: "open",
      started_at: cas(-1, 8),
      completed_at: null,
      created_by: UCTOVNIK,
      created_at: cas(-1, 8),
    },
  ]);
  const kosiceKarty = [...stav.keys()]
    .filter((k) => k.endsWith(`|${SKLAD_KOSICE}`))
    .map((k) => k.split("|")[0]);
  db.vloz("inventory_count_items", [
    ...invPolozky,
    ...kosiceKarty.map((kl, i) => {
      const ocak = r2(stav.get(`${kl}|${SKLAD_KOSICE}`) ?? 0);
      const spocitane = i < 3 ? ocak - (i === 1 ? 1 : 0) : null;
      return {
        id: uid(`inv-polozka:2:${kl}`),
        inventory_count_id: uid("inventura:2"),
        stock_item_id: kartaSkladu(kl),
        expected_quantity: ocak,
        counted_quantity: spocitane,
        difference: spocitane == null ? null : spocitane - ocak,
        note: null,
        created_at: cas(-1, 8),
      };
    }),
  ]);

  /* ------------------------------------------------ pohľad stock_items_with_availability */
  db.pohlady.set("stock_items_with_availability", (d) => {
    const lv = d.tabulka("stock_levels");
    return d.tabulka("stock_items").map((s) => {
      const moje = lv.filter((l) => l.stock_item_id === s.id);
      const naSklade = moje.reduce((a, l) => a + Number(l.quantity || 0), 0);
      const rez = moje.reduce((a, l) => a + Number(l.reserved_quantity || 0), 0);
      return { ...s, on_hand_qty: naSklade, reserved_qty: rez, available_qty: naSklade - rez };
    });
  });

  registrujRpc("recompute_stock_avg_cost", (a, d) => {
    const it = d.tabulka("stock_items").find((s) => s.id === (a._stock_item_id ?? a.stock_item_id));
    return it ? Number(it.avg_purchase_price ?? 0) : null;
  });

  /* ------------------------------------------------ cenník */
  const skupiny: [string, string, number, string | null][] = [
    ["vip", "VIP zákazníci", 10, "Dlhodobí odberatelia s ročným obratom nad 20 000 €"],
    ["velkoobchod", "Veľkoobchod", 15, null],
    ["partner", "Partneri", 5, "Spolupracujúce firmy"],
    ["skola", "Školy a neziskové organizácie", 20, null],
  ];
  db.vloz(
    "price_groups",
    skupiny.map(([k, name, z, note], i) => ({
      id: uid(`cenova-skupina:${k}`),
      company_id: FIRMA,
      name,
      discount_percent: z,
      note,
      created_at: cas(-280 + i),
    })),
  );
  // Priradenie odberateľov do skupín a individuálne zľavy (úprava riadkov adresára).
  const priradenie: Record<string, [string | null, number | null]> = {
    alfa: ["vip", null],
    beta: ["velkoobchod", null],
    epsilon: ["vip", null],
    gama: ["partner", null],
    dlhy: ["skola", null],
    ni: [null, 7],
    eta: [null, 3],
  };
  for (const c of db.tabulka("customers")) {
    for (const [kl, [sk, zl]] of Object.entries(priradenie)) {
      if (c.id !== kontakt(kl)) continue;
      c.price_group_id = sk ? uid(`cenova-skupina:${sk}`) : null;
      c.discount_percent = zl;
    }
  }
  const ceny: Riadok[] = [];
  const cenaPr = (kl: string) =>
    PRODUKTY.find((p) => p.kluc === kl)?.unit_price ?? DALSI_TOVAR.find((t) => t[0] === kl)![3];
  [
    ["vip", "notebook", 0.9, 0],
    ["vip", "monitor", 0.88, 0],
    ["velkoobchod", "papier", 0.8, 50],
    ["velkoobchod", "toner", 0.82, 10],
    ["velkoobchod", "mys", 0.85, 20],
    ["partner", "konz", 0.92, 0],
    ["partner", "vyvoj", 0.9, 40],
    ["skola", "skolenie", 0.75, 0],
  ].forEach(([sk, kl, k, min], i) =>
    ceny.push({
      id: uid(`cena:skupina:${i}`),
      company_id: FIRMA,
      price_group_id: uid(`cenova-skupina:${sk}`),
      customer_id: null,
      product_id: produkt(kl as string),
      unit_price: r2(cenaPr(kl as string) * (k as number)),
      min_quantity: min,
      note:
        (min as number) > 0
          ? `Pri odbere od ${min} ${PRODUKTY.find((p) => p.kluc === kl)?.unit ?? "ks"}`
          : null,
      created_at: cas(-200 + i),
    }),
  );
  [
    ["alfa", "konz", 58],
    ["alfa", "doprava", 0.55],
    ["beta", "hosting", 34.9],
    ["ni", "podpora", 129],
    ["epsilon", "licencia", 320],
    ["dlhy", "dlhy", 1149],
  ].forEach(([kl, pr, c], i) =>
    ceny.push({
      id: uid(`cena:odberatel:${i}`),
      company_id: FIRMA,
      price_group_id: null,
      customer_id: kontakt(kl as string),
      product_id: produkt(pr as string),
      unit_price: c,
      min_quantity: 0,
      note: i === 0 ? "Dohodnutá cena podľa rámcovej zmluvy" : null,
      created_at: cas(-150 + i),
    }),
  );
  db.vloz("product_prices", ceny);

  const akcie: [
    string,
    string,
    number,
    number | null,
    boolean,
    boolean,
    string[],
    string | null,
  ][] = [
    [
      "Jesenný výpredaj elektroniky",
      "akcia:jesen",
      -10,
      20,
      true,
      false,
      ["monitor", "mys", "klavesnica", "headset"],
      "Platí do vypredania zásob",
    ],
    ["Black Friday 2026", "akcia:bf", 20, 30, true, false, ["notebook", "dok", "ssd"], null],
    [
      "Zľava na celý sortiment pre nových zákazníkov",
      "akcia:vsetko",
      -60,
      null,
      true,
      true,
      [],
      "Akcia bez konca",
    ],
    [
      "Letná akcia na nábytok",
      "akcia:leto",
      -150,
      -90,
      true,
      false,
      ["stolicka", "stol", "skrina"],
      null,
    ],
    ["Pozastavená akcia na kávu", "akcia:kava", -30, 30, false, false, ["kava"], null],
  ];
  const akcieRiadky: Riadok[] = [];
  const akcieProdukty: Riadok[] = [];
  akcie.forEach(([name, k, od, doo, aktivna, vsetko, produkty, note], i) => {
    const id = uid(k);
    const zlava = vsetko ? 5 : [12, 18, 0, 15, 10][i];
    akcieRiadky.push({
      id,
      company_id: FIRMA,
      name,
      valid_from: den(od),
      valid_to: doo == null ? null : den(doo),
      active: aktivna,
      applies_to_all: vsetko,
      discount_percent: zlava,
      note,
      created_at: cas(od - 5),
    });
    produkty.forEach((kl, j) => {
      akcieProdukty.push({
        id: uid(`${k}:${kl}`),
        company_id: FIRMA,
        price_action_id: id,
        product_id: produkt(kl),
        unit_price: i === 1 && j === 0 ? 749 : r2(cenaPr(kl) * (1 - zlava / 100)),
        created_at: cas(od - 5),
      });
    });
  });
  db.vloz("price_actions", akcieRiadky);
  db.vloz("price_action_products", akcieProdukty);
}
