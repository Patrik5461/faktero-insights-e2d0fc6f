/**
 * Demo dáta: účtovníctvo Demo s.r.o. — číselník predkontácií a členení DPH
 * (Pohoda), pravidlá a predlohy zaúčtovania, návrhy AI, história exportov
 * a importov, uložené výkazy DPH a uzávierka obdobia.
 *
 * Exporty nadväzujú na faktúry z `faktury.ts`: každá faktúra s `exported_at`
 * patrí do mesačného exportu do Pohody (export_jobs + export_logs).
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA, MAJITEL, UCTOVNIK } from "./zaklad";
import { FAKTURY } from "./faktury";
import { cas, den, pridajDni, uid } from "./pomocne";
import { systemoveRiadky } from "../../src/lib/faktero/predkontacie-systemove";

type Kod = [
  druh: string,
  kod: string,
  popis: string,
  agenda: string,
  md?: string | null,
  d?: string | null,
];

const CISELNIK: Kod[] = [
  // predkontácie
  ["predkontacia", "3Fv", "Tržby z predaja služieb", "issuedInvoice", "311", "602"],
  ["predkontacia", "3Ft", "Tržby z predaja tovaru", "issuedInvoice", "311", "604"],
  ["predkontacia", "3Fz", "Prijatá záloha od odberateľa", "issuedAdvanceInvoice", "221", "324"],
  ["predkontacia", "3Fd", "Dobropis k tržbám za služby", "issuedInvoice", "311", "602"],
  ["predkontacia", "1Fm", "Nákup materiálu na sklad", "receivedInvoice", "112", "321"],
  ["predkontacia", "1Fs", "Nákup služieb", "receivedInvoice", "518", "321"],
  ["predkontacia", "1Fe", "Energie (elektrina, plyn)", "receivedInvoice", "502", "321"],
  ["predkontacia", "1Ft", "Telekomunikačné služby", "receivedInvoice", "518", "321"],
  ["predkontacia", "1Fn", "Nájomné za kancelárske priestory", "receivedInvoice", "518", "321"],
  ["predkontacia", "1Fu", "Účtovnícke a poradenské služby", "receivedInvoice", "518", "321"],
  ["predkontacia", "1Fz", "Poskytnutá záloha dodávateľovi", "receivedAdvanceInvoice", "314", "321"],
  [
    "predkontacia",
    "1Fh",
    "Hosting a cloudové služby zo zahraničia (prenesenie daňovej povinnosti)",
    "receivedInvoice",
    "518",
    "321",
  ],
  ["predkontacia", "PHm", "Pohonné hmoty – služobné vozidlá", "cashPaid", "501", "211"],
  [
    "predkontacia",
    "PRe",
    "Reprezentácia – občerstvenie pre obchodných partnerov (daňovo neuznaný náklad)",
    "cashPaid",
    "513",
    "211",
  ],
  ["predkontacia", "PKp", "Kancelárske potreby", "cashPaid", "501", "211"],
  ["predkontacia", "PPv", "Vklad hotovosti do pokladne", "cashReceived", "211", "261"],
  ["predkontacia", "BVp", "Bankové poplatky", "bankIssued", "568", "221"],
  ["predkontacia", "BVu", "Úhrada od odberateľa", "bankReceived", "221", "311"],
  ["predkontacia", "BVd", "Úhrada dodávateľovi", "bankIssued", "321", "221"],
  ["predkontacia", "IDo", "Odpisy dlhodobého majetku", "internalDocument", "551", "082"],
  ["predkontacia", "IDk", "Kurzový rozdiel – strata", "internalDocument", "563", "311"],
  ["predkontacia", "OZl", "Leasingová splátka – osobné auto", "commitment", "518", "325"],
  // členenie DPH
  ["clenenie_dph", "UD", "Tuzemské plnenie – dodanie", "issuedInvoice"],
  ["clenenie_dph", "UDpdp", "Dodanie s prenesením daňovej povinnosti", "issuedInvoice"],
  ["clenenie_dph", "UDzahr", "Dodanie služby do EÚ (§ 15)", "issuedInvoice"],
  ["clenenie_dph", "PD", "Tuzemské prijatie – s odpočtom", "receivedInvoice"],
  ["clenenie_dph", "PDnadz", "Prijatie bez nároku na odpočet", "receivedInvoice"],
  ["clenenie_dph", "PDpdp", "Prijatie služby z EÚ – samozdanenie", "receivedInvoice"],
  ["clenenie_dph", "PN", "Nedaňový doklad", ""],
  // strediská a činnosti
  ["stredisko", "BA", "Centrála Bratislava", ""],
  ["stredisko", "KE", "Pobočka Košice", ""],
  ["stredisko", "VYV", "Vývoj softvéru", ""],
  ["cinnost", "PREDAJ", "Predaj tovaru", ""],
  ["cinnost", "SLUZBY", "Služby a poradenstvo", ""],
  ["cinnost", "SERVIS", "Servis a podpora", ""],
  // číselné rady, pokladne, zákazky, účty
  ["ciselny_rad", "FV", "Vydané faktúry", "issuedInvoice"],
  ["ciselny_rad", "FP", "Prijaté faktúry", "receivedInvoice"],
  ["ciselny_rad", "PD", "Pokladničné doklady", "cashPaid"],
  ["ciselny_rad", "ID", "Interné doklady", "internalDocument"],
  ["pokladna", "HP", "Hlavná pokladňa (EUR)", ""],
  ["pokladna", "HPKE", "Pokladňa pobočka Košice", ""],
  ["zakazka", "Z2026-01", "Rekonštrukcia kancelárií Alfa Stavby", ""],
  ["zakazka", "Z2026-02", "Informačný systém pre Epsilon Medical", ""],
  ["bankovy_ucet", "TB", "Bežný účet – Demo banka", ""],
  ["bankovy_ucet", "SPOR", "Sporiaci účet", ""],
];

const PRAVIDLA: Partial<Riadok>[] = [
  {
    nazov: "Pohonné hmoty – čerpacie stanice",
    druh: "blocek",
    dodavatel_ico: "30000006",
    predkontacia: "PHm",
    clenenie_dph: "PD",
    kv_clenenie: "B3",
    kategoria: "palivo",
  },
  {
    nazov: "Energie – Demo Energia",
    druh: "prijata",
    dodavatel_ico: "30000002",
    predkontacia: "1Fe",
    clenenie_dph: "PD",
    kv_clenenie: "B2",
  },
  {
    nazov: "Telekomunikácie",
    druh: "prijata",
    dodavatel_ico: "30000003",
    predkontacia: "1Ft",
    clenenie_dph: "PD",
    kv_clenenie: "B2",
  },
  {
    nazov: "Nájomné kancelárie",
    druh: "prijata",
    dodavatel_ico: "30000004",
    predkontacia: "1Fn",
    clenenie_dph: "PD",
    kv_clenenie: "B2",
  },
  {
    nazov: "Hosting zo zahraničia (samozdanenie)",
    druh: "prijata",
    dodavatel_text: "Cloud Hosting",
    predkontacia: "1Fh",
    clenenie_dph: "PDpdp",
    kv_clenenie: "A2",
  },
  {
    nazov: "Kancelárske potreby – hotovosť",
    druh: "blocek",
    sposob_uhrady: "hotovost",
    kategoria: "kancelaria",
    predkontacia: "PKp",
    clenenie_dph: "PD",
  },
  {
    nazov: "Vystavené faktúry – služby",
    druh: "vystavena",
    predkontacia: "3Fv",
    clenenie_dph: "UD",
    kv_clenenie: "A1",
  },
  {
    nazov: "Bankové poplatky",
    druh: "banka",
    smer: "vydaj",
    oznacenie: "poplatok",
    predkontacia: "BVp",
    bez_dokladu: true,
  },
  {
    nazov:
      "Reprezentácia – reštaurácie (neaktívne pravidlo s dlhým názvom pre test zalamovania v tabuľke pravidiel)",
    druh: "blocek",
    kategoria: "reprezentacia",
    predkontacia: "PRe",
    clenenie_dph: "PDnadz",
    aktivne: false,
    odpocet: false,
  },
];

const PREDLOHY: Partial<Riadok>[] = [
  {
    nazov: "Služby – tuzemsko",
    druh: "vystavena",
    predkontacia: "3Fv",
    clenenie_dph: "UD",
    kv_clenenie: "A1",
  },
  {
    nazov: "Tovar – tuzemsko",
    druh: "vystavena",
    predkontacia: "3Ft",
    clenenie_dph: "UD",
    kv_clenenie: "A1",
  },
  {
    nazov: "Nákup služieb",
    druh: "prijata",
    predkontacia: "1Fs",
    clenenie_dph: "PD",
    kv_clenenie: "B2",
  },
  {
    nazov: "Pohonné hmoty",
    druh: "blocek",
    predkontacia: "PHm",
    clenenie_dph: "PD",
    pokladna: "HP",
  },
];

export function naplnUctovnictvo(db: DemoDb) {
  db.vloz(
    "predkontacie",
    CISELNIK.map(([druh, kod, popis, agenda, md, d], i) => ({
      id: uid(`predkontacia:${druh}:${kod}`),
      company_id: FIRMA,
      druh,
      kod,
      popis,
      agenda,
      ucet_md: md ?? null,
      ucet_d: d ?? null,
      zdroj: i % 4 === 0 ? "rucne" : "pohoda",
      aktivne: kod !== "IDk",
      pohoda_id: i % 4 === 0 ? null : String(100 + i),
      created_at: cas(-200 + i),
      updated_at: cas(-60 + (i % 30)),
    })),
  );

  // Systémový číselník členenia DPH a KV (B1-1) — v ostrej DB ho zakladá migrácia a spúšťač na firme.
  const uzMa = new Set(CISELNIK.map(([druh, kod, , agenda]) => `${druh}|${kod}|${agenda ?? ""}`));
  db.vloz(
    "predkontacie",
    systemoveRiadky()
      .filter((r) => !uzMa.has(`${r.druh}|${r.kod}|${r.agenda}`))
      .map((r) => ({
        id: uid(`predkontacia-system:${r.druh}:${r.kod}`),
        company_id: FIRMA,
        ...r,
        ucet_md: null,
        ucet_d: null,
        zdroj: "system",
        aktivne: true,
        pohoda_id: null,
        druhy_dokladov: [],
        created_at: cas(-300),
        updated_at: cas(-300),
      })),
  );

  db.vloz(
    "pravidla_uctovania",
    PRAVIDLA.map((p, i) => ({
      id: uid(`pravidlo:${i}`),
      company_id: FIRMA,
      poradie: (i + 1) * 10,
      aktivne: true,
      created_by: i % 2 ? UCTOVNIK : MAJITEL,
      created_at: cas(-150 + i * 5),
      updated_at: cas(-20 + i),
      ...p,
    })),
  );

  db.vloz(
    "predlohy_uctovania",
    PREDLOHY.map((p, i) => ({
      id: uid(`predloha:${i}`),
      company_id: FIRMA,
      poradie: (i + 1) * 10,
      created_by: UCTOVNIK,
      created_at: cas(-120 + i),
      ...p,
    })),
  );

  // Návrhy AI k niekoľkým neodovzdaným faktúram (na kontrolu)
  const neexportovane = FAKTURY.filter(
    (f) =>
      f.company_id === FIRMA &&
      f.type === "regular" &&
      !f.exported_at &&
      f.status !== "draft" &&
      f.status !== "cancelled",
  );
  db.vloz(
    "ai_navrhy_zauctovania",
    neexportovane.slice(0, 5).map((f, i) => ({
      company_id: FIRMA,
      doklad_typ: "vystavena",
      doklad_id: f.id,
      odtlacok: `demo-${i}`,
      stav: "navrh",
      navrh: {
        predkontacia: "3Fv",
        clenenie_dph: "UD",
        kv_clenenie: "A1",
        istota: 0.82 + i * 0.03,
        dovod: "Odberateľ je tuzemská firma, položky sú služby (demo návrh).",
      },
      created_by: MAJITEL,
      created_at: cas(-3 + i * 0),
    })),
  );

  /* -------- história exportov: mesačné odovzdania do Pohody + iné formáty */
  const exportovane = FAKTURY.filter((f) => f.company_id === FIRMA && f.exported_at);
  const poMesiacoch = new Map<string, Riadok[]>();
  for (const f of exportovane) {
    const m = String(f.issue_date).slice(0, 7);
    poMesiacoch.set(m, [...(poMesiacoch.get(m) ?? []), f]);
  }
  const jobs: Riadok[] = [];
  const logy: Riadok[] = [];
  [...poMesiacoch.entries()].sort().forEach(([mesiac, fs], i) => {
    const jobId = uid(`export:${mesiac}`);
    const datumOd = `${mesiac}-01`;
    const datumDo = pridajDni(pridajDni(`${mesiac}-01`, 32).slice(0, 7) + "-01", -1);
    const format = i % 6 === 5 ? "isdoc_zip" : i % 7 === 3 ? "csv_univerzal" : "pohoda_xml";
    jobs.push({
      id: jobId,
      company_id: FIRMA,
      created_by: i % 2 ? UCTOVNIK : MAJITEL,
      format,
      target_system: format === "pohoda_xml" ? "pohoda" : "other",
      status: "completed",
      date_from: datumOd,
      date_to: datumDo,
      invoice_count: fs.length,
      file_name: `faktero-export-${mesiac}.${format === "pohoda_xml" ? "xml" : format === "csv_univerzal" ? "csv" : "zip"}`,
      file_content: null,
      created_at: fs[0].exported_at,
    });
    fs.forEach((f, j) =>
      logy.push({
        id: uid(`export-log:${f.id}`),
        company_id: FIRMA,
        export_job_id: jobId,
        invoice_id: f.id,
        invoice_number: f.invoice_number,
        status: "ok",
        pohoda_cislo: format === "pohoda_xml" ? `FV${String(f.invoice_number).slice(-5)}` : null,
        pohoda_stav: format === "pohoda_xml" ? "ok" : null,
        potvrdene_at: format === "pohoda_xml" ? f.exported_at : null,
        created_at: f.exported_at,
        error: j === 0 && i === 2 ? null : null,
      }),
    );
  });
  // Jeden neúspešný pokus
  jobs.push({
    id: uid("export:chyba"),
    company_id: FIRMA,
    created_by: MAJITEL,
    format: "money_s3_xml",
    target_system: "money",
    status: "failed",
    error: "Demo: vo faktúre 20260012 chýba IČO odberateľa",
    date_from: den(-40),
    date_to: den(-10),
    invoice_count: 0,
    file_name: null,
    created_at: cas(-9),
  });
  db.vloz("export_jobs", jobs);
  db.vloz("export_logs", logy);
  db.vloz(
    "pohoda_odoslane",
    exportovane
      .slice(0, 40)
      .map((f) => ({
        company_id: FIRMA,
        agenda: "faktura",
        zaznam_id: f.id,
        verzia: 0,
        odoslane_at: f.exported_at,
      })),
  );

  /* -------- uložené výkazy DPH (predchádzajúce mesiace) */
  const dnes = den(0);
  const vykazy: Riadok[] = [];
  for (let m = 1; m <= 5; m++) {
    const d = new Date(dnes.slice(0, 7) + "-15T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - m);
    const rok = d.getUTCFullYear();
    const mesiac = d.getUTCMonth() + 1;
    const podane = pridajDni(`${d.toISOString().slice(0, 7)}-01`, 55);
    for (const druh of ["priznanie", "kv"]) {
      vykazy.push({
        id: uid(`vykaz:${druh}:${rok}-${mesiac}`),
        company_id: FIRMA,
        druh,
        typ: "R",
        rok,
        mesiac,
        stvrtrok: null,
        data: {
          danovyUrad: "Daňový úrad Bratislava (demo)",
          konatel: "Martina Demová",
          demo: true,
        },
        podane_at: podane + "T09:00:00.000Z",
        created_by: UCTOVNIK,
        created_at: podane + "T08:30:00.000Z",
      });
    }
  }
  db.vloz("vat_reports", vykazy);

  /* -------- importy (prechod z iného programu) */
  const importy: [string, string, string, number, number, number][] = [
    ["superfaktura", "superfaktura-export-2025.zip", "completed", 64, 60, 4],
    ["superfaktura", "faktury-2026-q1.zip", "completed", 38, 38, 0],
    ["pohoda", "pohoda-adresar.xml", "failed", 0, 0, 0],
  ];
  importy.forEach(([source, file, status, total, ok, fail], i) => {
    const id = uid(`import:${i}`);
    db.vloz("import_jobs", [
      {
        id,
        company_id: FIRMA,
        created_by: MAJITEL,
        source,
        file_name: file,
        file_path: `${FIRMA}/importy/${file}`,
        status,
        total_rows: total,
        processed_rows: total,
        imported_invoices: ok,
        imported_customers: Math.round(ok / 4),
        failed_rows: fail,
        error_message:
          status === "failed"
            ? "Demo: súbor nemá očakávanú štruktúru (chýba element addressbook)."
            : null,
        completed_at: cas(-200 + i * 60, 14),
        created_at: cas(-200 + i * 60, 13),
      },
    ]);
    const logyImportu: Riadok[] = [];
    for (let r = 1; r <= Math.min(total, 12); r++) {
      const chyba = r <= fail;
      logyImportu.push({
        id: uid(`import-log:${i}:${r}`),
        company_id: FIRMA,
        import_job_id: id,
        row_number: r,
        entity_type: r % 4 === 0 ? "customer" : "invoice",
        status: chyba ? "error" : "ok",
        message: chyba ? "Duplicitné číslo faktúry – riadok preskočený" : "Importované",
        created_at: cas(-200 + i * 60, 14),
      });
    }
    if (status === "failed")
      logyImportu.push({
        id: uid(`import-log:${i}:0`),
        company_id: FIRMA,
        import_job_id: id,
        row_number: 0,
        entity_type: "file",
        status: "error",
        message: "Súbor sa nepodarilo načítať",
        created_at: cas(-80, 13),
      });
    db.vloz("import_logs", logyImportu);
  });

  /* -------- uzávierka: zamknuté obdobie do konca predminulého mesiaca */
  const firma = db.tabulka("companies").find((c) => c.id === FIRMA);
  if (firma) {
    const koniec = pridajDni(den(0).slice(0, 7) + "-01", -1).slice(0, 7) + "-01";
    firma.locked_until = pridajDni(koniec, -1);
    firma.uctovny_program = "pohoda";
    firma.pohoda_predkontacia = "3Fv";
    firma.pohoda_predkontacia_prijata = "1Fs";
    firma.pohoda_clenenie_dph = "UD";
    firma.pohoda_clenenie_dph_prijata = "PD";
    firma.pohoda_pokladna = "HP";
    firma.pohoda_banka = "TB";
    firma.auto_uctovanie_od = den(-60);
  }
}
