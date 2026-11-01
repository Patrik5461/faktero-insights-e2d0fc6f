/**
 * Demo dáta: zamestnanci Demo s.r.o. — osobné karty, zmluvy, dochádzka,
 * neprítomnosti, dokumenty, šablóny a pripomienky. Mená, adresy aj čísla sú
 * vymyslené. Rodné číslo a OP sú v skutočnosti šifrované v databáze — tu ich
 * vracajú RPC `employee_pii_present` / `employee_get_pii` (vymyslené hodnoty).
 */
import type { DemoDb, Riadok } from "../server/db";
import { registrujRpc } from "../server/rpc";
import { FIRMA, MAJITEL, UCTOVNIK } from "./zaklad";
import { cas, den, nahoda, pridajDni, uid } from "./pomocne";

type DemoZam = {
  kluc: string;
  meno: string;
  priezvisko: string;
  titulPred?: string;
  titulZa?: string;
  pozicia: string;
  oddelenie: string;
  nastup: number; // posun dní
  koniec?: number;
  zmluva: "pracovna_zmluva" | "dovp" | "dopc" | "brigadnicka" | "ina";
  plat: number;
  obdobie: "mesacne" | "hodinovo" | "odmena";
  hodiny: number;
  poistovna: string;
  mesto: string;
};

const ZAMESTNANCI: DemoZam[] = [
  {
    kluc: "1",
    meno: "Martina",
    priezvisko: "Demová",
    titulPred: "Ing.",
    pozicia: "Konateľka",
    oddelenie: "Vedenie",
    nastup: -1800,
    zmluva: "pracovna_zmluva",
    plat: 3200,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Všeobecná ZP",
    mesto: "Bratislava",
  },
  {
    kluc: "2",
    meno: "Tomáš",
    priezvisko: "Vzorný",
    titulPred: "Mgr.",
    pozicia: "Projektový manažér",
    oddelenie: "Projekty",
    nastup: -1200,
    zmluva: "pracovna_zmluva",
    plat: 2450,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Dôvera",
    mesto: "Bratislava",
  },
  {
    kluc: "3",
    meno: "Lucia",
    priezvisko: "Ukážková",
    pozicia: "Účtovníčka",
    oddelenie: "Ekonomika",
    nastup: -900,
    zmluva: "pracovna_zmluva",
    plat: 1850,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Union",
    mesto: "Pezinok",
  },
  {
    kluc: "4",
    meno: "Marek",
    priezvisko: "Testovací",
    titulPred: "Bc.",
    pozicia: "Programátor",
    oddelenie: "Vývoj",
    nastup: -700,
    zmluva: "pracovna_zmluva",
    plat: 2700,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Všeobecná ZP",
    mesto: "Trnava",
  },
  {
    kluc: "5",
    meno: "Zuzana",
    priezvisko: "Príkladná",
    pozicia: "Programátorka",
    oddelenie: "Vývoj",
    nastup: -420,
    zmluva: "pracovna_zmluva",
    plat: 2600,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Dôvera",
    mesto: "Senec",
  },
  {
    kluc: "6",
    meno: "Ján",
    priezvisko: "Montážny",
    pozicia: "Servisný technik",
    oddelenie: "Servis",
    nastup: -650,
    zmluva: "pracovna_zmluva",
    plat: 1650,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Všeobecná ZP",
    mesto: "Nitra",
  },
  {
    kluc: "7",
    meno: "Peter",
    priezvisko: "Šofér",
    pozicia: "Vodič – technik",
    oddelenie: "Servis",
    nastup: -75,
    zmluva: "pracovna_zmluva",
    plat: 1500,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Union",
    mesto: "Trenčín",
  },
  {
    kluc: "8",
    meno: "Alžbeta-Mária Kristína",
    priezvisko: "Dlhomenná-Vzorová von Ukážkovská",
    titulPred: "doc. Ing. Mgr.",
    titulZa: "PhD., MBA",
    pozicia: "Vedúca oddelenia strategického rozvoja, inovácií a medzinárodných projektov",
    oddelenie: "Strategický rozvoj a medzinárodná spolupráca",
    nastup: -300,
    zmluva: "pracovna_zmluva",
    plat: 3500,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Dôvera",
    mesto: "Liptovský Mikuláš",
  },
  {
    kluc: "9",
    meno: "Simona",
    priezvisko: "Brigádna",
    pozicia: "Administratívna výpomoc",
    oddelenie: "Ekonomika",
    nastup: -40,
    zmluva: "brigadnicka",
    plat: 6.5,
    obdobie: "hodinovo",
    hodiny: 15,
    poistovna: "Všeobecná ZP",
    mesto: "Bratislava",
  },
  {
    kluc: "10",
    meno: "Róbert",
    priezvisko: "Dohodár",
    pozicia: "Grafik",
    oddelenie: "Marketing",
    nastup: -200,
    zmluva: "dovp",
    plat: 900,
    obdobie: "odmena",
    hodiny: 0,
    poistovna: "Union",
    mesto: "Žilina",
  },
  {
    kluc: "11",
    meno: "Eva",
    priezvisko: "Činná",
    pozicia: "Upratovanie",
    oddelenie: "Prevádzka",
    nastup: -500,
    zmluva: "dopc",
    plat: 7.2,
    obdobie: "hodinovo",
    hodiny: 10,
    poistovna: "Dôvera",
    mesto: "Bratislava",
  },
  {
    kluc: "12",
    meno: "Michal",
    priezvisko: "Bývalý",
    pozicia: "Obchodník",
    oddelenie: "Obchod",
    nastup: -1000,
    koniec: -120,
    zmluva: "pracovna_zmluva",
    plat: 1900,
    obdobie: "mesacne",
    hodiny: 40,
    poistovna: "Všeobecná ZP",
    mesto: "Košice",
  },
  {
    kluc: "13",
    meno: "Katarína",
    priezvisko: "Odídená",
    pozicia: "Asistentka",
    oddelenie: "Vedenie",
    nastup: -800,
    koniec: -30,
    zmluva: "pracovna_zmluva",
    plat: 1400,
    obdobie: "mesacne",
    hodiny: 30,
    poistovna: "Union",
    mesto: "Bratislava",
  },
];

export const zamestnanec = (kluc: string) => uid(`zamestnanec:${kluc}`);

export function naplnZamestnanci(db: DemoDb) {
  const n = nahoda(55002);

  // Exekúcie z Iných dokladov (doklady.ts) patria zamestnancovi — záložka Exekúcie na karte.
  for (const d of db
    .tabulka("other_documents")
    .filter((x) => x.company_id === FIRMA && x.kind === "exekucia")) {
    d.employee_id = zamestnanec("3");
  }

  const zam: Riadok[] = ZAMESTNANCI.map((z, i) => ({
    id: zamestnanec(z.kluc),
    company_id: FIRMA,
    first_name: z.meno,
    last_name: z.priezvisko,
    title_before: z.titulPred ?? null,
    title_after: z.titulZa ?? null,
    birth_date: `${1970 + ((i * 3) % 32)}-${String((i % 12) + 1).padStart(2, "0")}-${String(((i * 7) % 27) + 1).padStart(2, "0")}`,
    birth_place: z.mesto,
    nationality: "SK",
    email: `${z.meno.split(/[ -]/)[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${i + 1}@demo-sro.example`,
    phone: `+421 900 555 ${String(100 + i)}`,
    street: `Vymyslená ${10 + i}`,
    city: z.mesto,
    zip: `${800 + i * 13} 01`.slice(0, 6),
    country: "SK",
    iban: `SK00 0900 0000 0000 0000 ${String(5000 + i)}`,
    health_insurer: z.poistovna,
    position: z.pozicia,
    department: z.oddelenie,
    start_date: den(z.nastup),
    end_date: z.koniec ? den(z.koniec) : null,
    status: z.koniec ? "ended" : "active",
    sp_registered_at: den(z.nastup - 1),
    zp_registered_at: den(z.nastup - 1),
    // Lekárska prehliadka a BOZP — niektoré čoskoro alebo po termíne (pripomienky).
    medical_check_due: z.koniec
      ? null
      : ([
          den(300),
          den(14),
          den(-3),
          den(200),
          den(90),
          den(25),
          den(330),
          den(400),
          null,
          null,
          den(160),
        ][i] ?? null),
    bozp_training_due: z.koniec
      ? null
      : ([
          den(120),
          den(60),
          den(9),
          den(-10),
          den(180),
          den(30),
          den(350),
          den(220),
          den(20),
          null,
          den(75),
        ][i] ?? null),
    note:
      i === 7
        ? "Pracuje čiastočne z domu (pondelok, piatok). Preferuje komunikáciu e-mailom."
        : null,
    rodne_cislo_enc: "demo-sifrovane",
    op_cislo_enc: i % 4 === 3 ? null : "demo-sifrovane",
    created_by: MAJITEL,
    created_at: cas(z.nastup),
    updated_at: cas(Math.max(z.nastup, -60)),
  }));
  db.vloz("employees", zam);

  /* ------------------------------------------------ zmluvy */
  const zmluvy: Riadok[] = [];
  ZAMESTNANCI.forEach((z, i) => {
    const id = uid(`zmluva:${z.kluc}`);
    const start = den(z.nastup);
    const urcita = z.zmluva !== "pracovna_zmluva" || i === 4 || i === 6;
    zmluvy.push({
      id,
      company_id: FIRMA,
      employee_id: zamestnanec(z.kluc),
      kind: z.zmluva,
      number: `PZ-${start.slice(0, 4)}-${String(i + 1).padStart(3, "0")}`,
      signed_at: pridajDni(start, -7),
      start_date: start,
      end_date: z.koniec ? den(z.koniec) : urcita ? den(i === 6 ? 20 : i === 4 ? 310 : 150) : null,
      probation_end: z.zmluva === "pracovna_zmluva" ? pridajDni(start, 90) : null,
      position: z.pozicia,
      workplace: i === 5 || i === 6 ? "Výjazdy u zákazníkov" : "Bratislava, Ukážková 12",
      weekly_hours: z.hodiny || null,
      salary: z.plat,
      salary_period: z.obdobie,
      currency: "EUR",
      status: z.koniec ? "ended" : "active",
      ended_at: z.koniec ? den(z.koniec) : null,
      termination_reason: z.koniec
        ? i === 11
          ? "Dohoda o skončení pracovného pomeru"
          : "Výpoveď zo strany zamestnanca"
        : null,
      note: null,
      created_at: cas(z.nastup - 7),
    });
    // Starší zamestnanci majú aj predchádzajúcu (skončenú) zmluvu.
    if (i === 1 || i === 3) {
      zmluvy.push({
        id: uid(`zmluva:${z.kluc}:stara`),
        company_id: FIRMA,
        employee_id: zamestnanec(z.kluc),
        kind: "dovp",
        number: `DOVP-${den(z.nastup - 200).slice(0, 4)}-0${i}`,
        signed_at: den(z.nastup - 210),
        start_date: den(z.nastup - 200),
        end_date: den(z.nastup - 1),
        position: "Externá spolupráca",
        salary: 1200,
        salary_period: "odmena",
        currency: "EUR",
        status: "ended",
        ended_at: den(z.nastup - 1),
        created_at: cas(z.nastup - 210),
      });
    }
  });
  db.vloz("employee_contracts", zmluvy);

  /* ------------------------------------------------ dochádzka (posledných ~45 dní) */
  const dochadzka: Riadok[] = [];
  const aktivni = ZAMESTNANCI.filter((z) => !z.koniec && z.zmluva !== "dovp");
  for (let d = -45; d <= -1; d++) {
    const datum = den(d);
    const tyzden = new Date(datum + "T12:00:00Z").getUTCDay();
    if (tyzden === 0 || tyzden === 6) continue;
    for (const z of aktivni) {
      if (den(z.nastup) > datum) continue;
      if (z.obdobie === "hodinovo" && n.sanca(0.5)) continue;
      const druh = n.sanca(0.12) ? "home_office" : n.sanca(0.05) ? "sluzobna_cesta" : "praca";
      const od = z.obdobie === "hodinovo" ? 14 : 8;
      const hodiny = z.obdobie === "hodinovo" ? n.cele(3, 5) : 8;
      const prestavka = hodiny >= 6 ? 30 : 0;
      dochadzka.push({
        id: uid(`dochadzka:${z.kluc}:${d}`),
        company_id: FIRMA,
        employee_id: zamestnanec(z.kluc),
        work_date: datum,
        time_from: `${String(od).padStart(2, "0")}:00`,
        time_to: `${String(od + hodiny + (prestavka ? 1 : 0)).padStart(2, "0")}:${prestavka ? "30" : "00"}`,
        break_minutes: prestavka,
        hours: hodiny,
        kind: druh,
        note: druh === "sluzobna_cesta" ? "Montáž u zákazníka v Žiline" : null,
        created_at: cas(d, 18),
      });
    }
  }
  db.vloz("employee_attendance", dochadzka);

  /* ------------------------------------------------ neprítomnosti */
  const nepr: [string, string, number, number, string | null][] = [
    ["2", "dovolenka", -60, -51, "Letná dovolenka"],
    ["3", "pn", -22, -15, null],
    ["4", "dovolenka", 10, 17, "Plánovaná dovolenka"],
    ["5", "ocr", -8, -6, "Starostlivosť o dieťa"],
    ["6", "nahradne_volno", -3, -3, "Za prácu cez víkend"],
    ["1", "dovolenka", -100, -90, null],
    ["8", "neplatene_volno", -35, -33, "Osobné dôvody"],
    ["2", "sviatok", -1, -1, null],
    ["7", "ine", -12, -12, "Školenie vodičov"],
  ];
  db.vloz(
    "employee_absences",
    nepr.map(([kl, druh, od, po, pozn], i) => {
      let dni = 0;
      for (let d = od; d <= po; d++) {
        const t = new Date(den(d) + "T12:00:00Z").getUTCDay();
        if (t !== 0 && t !== 6) dni++;
      }
      return {
        id: uid(`nepritomnost:${i}`),
        company_id: FIRMA,
        employee_id: zamestnanec(kl),
        kind: druh,
        date_from: den(od),
        date_to: den(po),
        days: dni,
        hours: dni * 8,
        note: pozn,
        created_at: cas(Math.min(od, -1) - 5),
      };
    }),
  );

  /* ------------------------------------------------ dokumenty */
  const dok: Riadok[] = [];
  ZAMESTNANCI.slice(0, 10).forEach((z, i) => {
    const eid = zamestnanec(z.kluc);
    dok.push({
      id: uid(`zam-dok:${z.kluc}:zmluva`),
      company_id: FIRMA,
      employee_id: eid,
      contract_id: uid(`zmluva:${z.kluc}`),
      kind: "zmluva",
      template_key: z.zmluva === "pracovna_zmluva" ? "pracovna_zmluva" : z.zmluva,
      title: `${z.zmluva === "pracovna_zmluva" ? "Pracovná zmluva" : "Dohoda"} – ${z.meno} ${z.priezvisko}`,
      file_path: `${FIRMA}/${eid}/zmluva.pdf`,
      file_mime: "application/pdf",
      file_size: 27720,
      created_by: MAJITEL,
      created_at: cas(z.nastup - 7),
    });
    if (i % 3 === 0) {
      dok.push({
        id: uid(`zam-dok:${z.kluc}:lekar`),
        company_id: FIRMA,
        employee_id: eid,
        contract_id: null,
        kind: "ine",
        template_key: null,
        title: "Posudok o zdravotnej spôsobilosti na prácu (sken)",
        file_path: `${FIRMA}/${eid}/posudok.jpg`,
        file_mime: "image/jpeg",
        file_size: 21561,
        created_by: UCTOVNIK,
        created_at: cas(z.nastup + 3),
      });
    }
  });
  db.vloz("employee_documents", dok);

  db.vloz("employee_doc_templates", [
    {
      id: uid("zam-sablona:potvrdenie"),
      company_id: FIRMA,
      key: "potvrdenie_prijmu",
      title: "Potvrdenie o príjme (upravené pre Demo s.r.o.)",
      body: "POTVRDENIE O PRÍJME\n\nZamestnávateľ {firma_nazov}, IČO {firma_ico}, potvrdzuje, že {zamestnanec_meno}, nar. {datum_narodenia}, je u nás zamestnaný/á od {datum_nastupu} na pozícii {pozicia}.\n\nVymyslený text šablóny – demo.",
      updated_at: cas(-50),
    },
  ]);

  db.vloz("employee_reminder_log", [
    {
      id: 1,
      company_id: FIRMA,
      employee_id: zamestnanec("3"),
      kind: "medical_check_due",
      due_date: den(-3),
      sent_at: cas(-33, 7),
    },
    {
      id: 2,
      company_id: FIRMA,
      employee_id: zamestnanec("4"),
      kind: "bozp_training_due",
      due_date: den(-10),
      sent_at: cas(-40, 7),
    },
    {
      id: 3,
      company_id: FIRMA,
      employee_id: zamestnanec("7"),
      kind: "koniec_zmluvy",
      due_date: den(20),
      sent_at: cas(-10, 7),
    },
  ]);
  db.vloz("employee_access_log", [
    {
      id: 1,
      company_id: FIRMA,
      employee_id: zamestnanec("2"),
      user_id: MAJITEL,
      action: "view_detail",
      created_at: cas(-2, 9),
    },
    {
      id: 2,
      company_id: FIRMA,
      employee_id: zamestnanec("2"),
      user_id: UCTOVNIK,
      action: "view_pii",
      created_at: cas(-2, 10),
    },
    {
      id: 3,
      company_id: FIRMA,
      employee_id: zamestnanec("8"),
      user_id: MAJITEL,
      action: "document",
      created_at: cas(-1, 11),
    },
  ]);

  /* ------------------------------------------------ RPC citlivých údajov (vymyslené hodnoty) */
  registrujRpc("employee_pii_present", (a, d) => {
    const z = d.tabulka("employees").find((x) => x.id === a._employee_id);
    return [{ ma_rodne_cislo: !!z?.rodne_cislo_enc, ma_op: !!z?.op_cislo_enc }];
  });
  registrujRpc("employee_get_pii", (a, d) => {
    const i = d.tabulka("employees").findIndex((x) => x.id === a._employee_id);
    const z = d.tabulka("employees")[i];
    if (!z) return [];
    return [
      {
        rodne_cislo: z.rodne_cislo_enc
          ? `${String(z.birth_date ?? "000000")
              .slice(2)
              .replace(/-/g, "")}/${String(1000 + i).slice(-4)}`
          : null,
        op_cislo: z.op_cislo_enc ? `EA${String(100000 + i * 7919).slice(-6)}` : null,
      },
    ];
  });
  registrujRpc("employee_set_pii", (a, d) => {
    const z = d.tabulka("employees").find((x) => x.id === a._employee_id);
    if (z) {
      if (a._rodne_cislo !== undefined)
        z.rodne_cislo_enc = a._rodne_cislo ? "demo-sifrovane" : null;
      if (a._op_cislo !== undefined) z.op_cislo_enc = a._op_cislo ? "demo-sifrovane" : null;
    }
    return null;
  });
}
