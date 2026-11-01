/**
 * Demo dáta: eFaktúra (Peppol cez ePoštáka) — profil firmy, vygenerované
 * a odoslané eFaktúry k faktúram z `faktury.ts`, doručenia v rôznych stavoch,
 * prijaté eFaktúry od dodávateľov a záznam, že demo používatelia oznam
 * o povinnej e-fakturácii 2027 už videli (inak modálne okno zakryje stránky).
 * Žiadne skutočné Peppol ID ani kľúče — všetko vymyslené.
 */
import type { DemoDb, Riadok } from "../server/db";
import { DEMO_UCTY } from "../server/ucty";
import { FIRMA, FIRMA_CZ, FIRMA_PRAZDNA, MAJITEL } from "./zaklad";
import { FAKTURY } from "./faktury";
import { kontakt } from "./kontakty";
import { cas, den, pridajDni, r2, uid } from "./pomocne";

const XML = (cislo: string, suma: number) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Vymyslená eFaktúra pre preview -->\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>${cislo}</ID><DocumentCurrencyCode>EUR</DocumentCurrencyCode><LegalMonetaryTotal><PayableAmount currencyID="EUR">${suma.toFixed(2)}</PayableAmount></LegalMonetaryTotal></Invoice>`;

export function naplnEfaktura(db: DemoDb) {
  const profilId = uid("efaktura-profil:demo");
  db.vloz("efaktura_profiles", [
    {
      id: profilId,
      company_id: FIRMA,
      enabled: true,
      test_mode: false,
      rezim: "plny",
      preferred_channel: "peppol",
      default_document_format: "peppol_bis_3",
      peppol_provider: "epostak",
      peppol_scheme: "0245",
      peppol_participant_id: "0245:2020000001",
      epostak_firm_id: "demo-firma-0001",
      prijem_poskytovatel: "epostak",
      prijem_ciel: "prijate",
      prijem_automaticky: false,
      prijem_otvorit: true,
      readiness_score: 100,
      readiness_details: { firma: true, iban: true, dic: true, peppol: true },
      readiness_checked_at: cas(-2),
      activated_at: cas(-90),
      created_at: cas(-120),
    },
  ]);
  db.vloz("efaktura_odosielanie_ziadosti", [
    {
      id: uid("efaktura-ziadost:demo"),
      company_id: FIRMA,
      dic: "2020000001",
      customer_ref: "demo-ref-0001",
      stav: "active",
      relationship_mode: "technical_delegation",
      contact_email: "fakturacia@demo-sro.example",
      prijem_poskytovatel: "epostak",
      epostak_firm_id: "demo-firma-0001",
      epostak_stav: "ACTIVE",
      client_message_sk: "Odosielanie eFaktúr je aktívne (demo).",
      vytvoril: MAJITEL,
      vytvorene_at: cas(-100),
      aktualizovane_at: cas(-90),
      aktivovane_at: cas(-90),
    },
  ]);
  db.vloz("efaktura_webhooky", [
    {
      company_id: FIRMA,
      epostak_firm_id: "demo-firma-0001",
      webhook_id: "demo-webhook-1",
      stav: "aktivny",
      vytvorene_at: cas(-90),
      posledna_udalost_at: cas(-1, 15),
    },
  ]);

  // Odoslané eFaktúry: posledné vystavené tuzemské faktúry odberateľom s IČ DPH
  const naOdoslanie = FAKTURY.filter(
    (f) =>
      f.company_id === FIRMA &&
      f.type === "regular" &&
      f.sent_at &&
      f.customer_country === "SK" &&
      f.customer_ic_dph,
  ).slice(-18);
  const dokumenty: Riadok[] = [];
  const dorucenia: Riadok[] = [];
  const stavy = [
    "delivered",
    "delivered",
    "accepted",
    "delivered",
    "sent",
    "delivered",
    "failed",
    "delivered",
    "rejected",
    "delivered",
    "pending",
    "delivered",
  ];
  naOdoslanie.forEach((f, i) => {
    const docId = uid(`efaktura-doc:${f.id}`);
    dokumenty.push({
      id: docId,
      company_id: FIRMA,
      invoice_id: f.id,
      profile_id: profilId,
      document_number: f.invoice_number,
      issue_date: f.issue_date,
      currency: f.currency,
      total: f.total,
      format: "peppol_bis_3",
      schema_version: "3.0",
      customization_id:
        "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
      status: i === 17 ? "invalid" : "validated",
      validation_errors:
        i === 17 ? [{ kod: "BR-CO-15", sprava: "Súčet DPH nesedí s položkami (demo chyba)" }] : [],
      generated_at: f.sent_at,
      payload_hash: `demo${i}`,
      xml_payload: XML(f.invoice_number, Number(f.total)),
      created_at: f.sent_at,
    });
    if (i === 17) return;
    const stav = stavy[i % stavy.length];
    dorucenia.push({
      id: uid(`efaktura-dorucenie:${f.id}`),
      company_id: FIRMA,
      document_id: docId,
      channel: "peppol",
      provider: "epostak",
      status: stav,
      attempt_count: stav === "failed" ? 3 : 1,
      recipient_scheme: "0245",
      recipient_participant_id: `0245:${f.customer_dic ?? "0000000000"}`,
      provider_message_id: `demo-msg-${i}`,
      sent_at: f.sent_at,
      delivered_at: ["delivered", "accepted"].includes(stav)
        ? pridajDni(String(f.sent_at).slice(0, 10), 0) + "T09:31:00.000Z"
        : null,
      error_code:
        stav === "failed"
          ? "RECIPIENT_NOT_FOUND"
          : stav === "rejected"
            ? "REJECTED_BY_RECIPIENT"
            : null,
      error_message:
        stav === "failed"
          ? "Príjemca nie je registrovaný v sieti Peppol (demo)."
          : stav === "rejected"
            ? "Odberateľ eFaktúru odmietol: nesprávne číslo objednávky (demo)."
            : null,
      created_at: f.sent_at,
      updated_at: f.sent_at,
    });
  });
  db.vloz("efaktura_documents", dokumenty);
  db.vloz("efaktura_deliveries", dorucenia);

  // Prijaté eFaktúry od dodávateľov
  const dodavatelia: [string, string, string, number, number][] = [
    ["energia", "Demo Energia a.s.", "SK2022000002", 186.4, 23],
    ["telekom", "Demo Telekom a.s.", "SK2022000003", 54.9, 23],
    ["prenajom", "Prenájom Priestorov Demo s.r.o.", "SK2022000004", 1200, 23],
    ["kancel", "Kancelária Plus s.r.o.", "SK2022000001", 87.35, 23],
    ["velkoobchod", "Veľkoobchod s elektronikou Demo s.r.o.", "SK2022000008", 2349.9, 23],
    ["ucto", "Účtovná kancelária Demo s.r.o.", "SK2022000007", 320, 23],
  ];
  const prijate: Riadok[] = [];
  for (let i = 0; i < 12; i++) {
    const [kl, meno, icdph, zaklad, sadzba] = dodavatelia[i % dodavatelia.length];
    const zakladI = r2(zaklad * (1 + (i % 3) * 0.07));
    const dph = r2((zakladI * sadzba) / 100);
    const datum = den(-80 + i * 7);
    const cislo = `${kl.toUpperCase().slice(0, 3)}-${datum.slice(0, 4)}-${String(100 + i)}`;
    const status = i < 5 ? "accepted" : i < 9 ? "parsed" : i === 9 ? "rejected" : "received";
    prijate.push({
      id: uid(`efaktura-prijata:${i}`),
      company_id: FIRMA,
      channel: "peppol",
      format: "peppol_bis_3",
      sender_name: meno,
      sender_scheme: "0245",
      sender_participant_id: `0245:${icdph.slice(2)}`,
      sender_vat_id: icdph,
      document_number: cislo,
      issue_date: datum,
      due_date: pridajDni(datum, 14),
      currency: "EUR",
      total: r2(zakladI + dph),
      vat_total: dph,
      status,
      received_at: datum + "T07:12:00.000Z",
      processed_at: status === "accepted" ? datum + "T10:00:00.000Z" : null,
      parsed_data: {
        documentKind: i === 11 ? "creditNote" : "invoice",
        supplier: { name: meno, vatId: icdph, customerId: kontakt(kl) },
        lines: [{ name: "Plnenie podľa zmluvy", net: zakladI, vatRate: sadzba }],
      },
      parse_errors: [],
      kontrola_chyby: i === 9 ? 1 : 0,
      kontrola_varovania: i % 4 === 1 ? 1 : 0,
      kontrola_vysledok:
        i === 9
          ? {
              chyby: [{ kod: "IBAN", sprava: "IBAN dodávateľa sa nezhoduje s adresárom (demo)" }],
              varovania: [],
            }
          : {
              chyby: [],
              varovania:
                i % 4 === 1
                  ? [{ kod: "SPLATNOST", sprava: "Splatnosť kratšia ako 14 dní (demo)" }]
                  : [],
            },
      skontrolovane_at: datum + "T07:13:00.000Z",
      xml_payload: XML(cislo, r2(zakladI + dph)),
      created_at: datum + "T07:12:00.000Z",
    });
  }
  db.vloz("efaktura_received_documents", prijate);

  // Oznam o e-fakturácii 2027: demo používatelia ho už zavreli (v každej firme).
  const oznamy: Riadok[] = [];
  for (const firma of [FIRMA, FIRMA_CZ, FIRMA_PRAZDNA]) {
    for (const u of DEMO_UCTY) {
      oznamy.push({
        company_id: firma,
        user_id: u.id,
        dismissed_at: cas(-10),
        cta_clicked: firma === FIRMA,
        cta_clicked_at: firma === FIRMA ? cas(-90) : null,
        created_at: cas(-30),
      });
    }
  }
  db.vloz("efaktura_oznam", oznamy);
}
