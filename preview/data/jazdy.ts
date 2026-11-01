/**
 * Demo dáta: kniha jázd a vozový park Demo s.r.o. — vozidlá, jazdy za ~4
 * mesiace (tachometer nadväzuje: koniec − začiatok = km), tankovania,
 * doklady vozidiel s termínmi, palivové karty a ukážkové GPS pripojenie.
 * Pripojenia sa nikam nepripájajú (sieť preview je zamknutá).
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA, MAJITEL, UCTOVNIK, VLASTNY } from "./zaklad";
import { kontakt } from "./kontakty";
import { cas, den, nahoda, pridajDni, r2, uid } from "./pomocne";

export const vozidlo = (kluc: string) => uid(`vozidlo:${kluc}`);

type DemoVozidlo = {
  kluc: string;
  name: string;
  spz: string;
  znacka: string;
  model: string;
  palivo: string;
  spotreba: number;
  tachometer: number;
  rok: number;
  vlastnictvo: string;
  vodic: string;
  aktivne: boolean;
};

const VOZIDLA: DemoVozidlo[] = [
  {
    kluc: "octavia",
    name: "Škoda Octavia Combi",
    spz: "BA000DE",
    znacka: "Škoda",
    model: "Octavia Combi 2.0 TDI",
    palivo: "diesel",
    spotreba: 5.4,
    tachometer: 84210,
    rok: 2021,
    vlastnictvo: "vlastne",
    vodic: "Martina Demová",
    aktivne: true,
  },
  {
    kluc: "superb",
    name: "Škoda Superb",
    spz: "BA111DE",
    znacka: "Škoda",
    model: "Superb 2.0 TDI DSG",
    palivo: "diesel",
    spotreba: 6.1,
    tachometer: 41980,
    rok: 2023,
    vlastnictvo: "operativny_leasing",
    vodic: "Peter Účtovný",
    aktivne: true,
  },
  {
    kluc: "dodavka",
    name: "Dodávka Volkswagen Transporter T6.1 Kombi dlhý rázvor s chladiacou nadstavbou (servisné vozidlo)",
    spz: "TT222DE",
    znacka: "Volkswagen",
    model: "Transporter T6.1 2.0 TDI",
    palivo: "diesel",
    spotreba: 8.9,
    tachometer: 152300,
    rok: 2020,
    vlastnictvo: "financny_leasing",
    vodic: "Jana Obmedzená",
    aktivne: true,
  },
  {
    kluc: "model3",
    name: "Tesla Model 3",
    spz: "BA333EL",
    znacka: "Tesla",
    model: "Model 3 Long Range",
    palivo: "elektro",
    spotreba: 0,
    tachometer: 22150,
    rok: 2024,
    vlastnictvo: "vlastne",
    vodic: "Martina Demová",
    aktivne: true,
  },
  {
    kluc: "fabia",
    name: "Škoda Fabia (vyradená)",
    spz: "NR444DE",
    znacka: "Škoda",
    model: "Fabia 1.0 TSI",
    palivo: "benzin",
    spotreba: 5.9,
    tachometer: 198400,
    rok: 2015,
    vlastnictvo: "vlastne",
    vodic: "",
    aktivne: false,
  },
];

const TRASY: [string, string, number, string][] = [
  ["Bratislava, Ukážková 12", "Trnava, Kostolná 7", 54, "Stretnutie so zákazníkom Zeta Kaviareň"],
  ["Bratislava, Ukážková 12", "Nitra, Poľná 44", 92, "Obhliadka – Eta Agro družstvo"],
  ["Bratislava, Ukážková 12", "Žilina, Technická 5", 201, "Rokovanie Gama Soft"],
  ["Bratislava, Ukážková 12", "Piešťany, Kúpeľná 14", 84, "Servis u zákazníka Ni Hotel"],
  ["Bratislava, Ukážková 12", "Bratislava, Hlavná 1", 9, "Odovzdanie dokumentácie Alfa Stavby"],
  ["Bratislava, Ukážková 12", "Senec, Diaľničná 6", 26, "Nákup materiálu"],
  ["Bratislava, Ukážková 12", "Trenčín, Elektrárenská 13", 128, "Montáž – Mi Elektro"],
  [
    "Bratislava, Ukážková 12",
    "Banská Bystrica, Námestie SNP 3",
    211,
    "Školenie – Delta Reštaurácie",
  ],
  ["Bratislava, Ukážková 12", "Pezinok, Garážová 9", 22, "Servis vozidla"],
  [
    "Bratislava, Ukážková 12",
    "Liptovský Mikuláš, Veľmi dlhá ulica s dlhým názvom pri obchodnom centre 1234/56B",
    292,
    "Inštalácia regálového systému – Stredoeurópske centrum",
  ],
];
const SUKROMNE: [string, string, number][] = [
  ["Bratislava, Ukážková 12", "Bratislava, Petržalka", 12],
  ["Bratislava, Ukážková 12", "Malacky", 38],
];
const ZAKAZNIK_TRASY: (string | null)[] = [
  "zeta",
  "eta",
  "gama",
  "ni",
  "alfa",
  null,
  "mi",
  "delta",
  null,
  "dlhy",
];

export function naplnJazdy(db: DemoDb) {
  const n = nahoda(77001);
  const vodici = ["Martina Demová", "Peter Účtovný", "Jana Obmedzená"];
  const tvorcovia = [MAJITEL, UCTOVNIK, VLASTNY];

  /* ------------------------------------------------ vozidlá */
  db.vloz(
    "vehicles",
    VOZIDLA.map((v, i) => {
      const zaklad: Riadok = {
        id: vozidlo(v.kluc),
        company_id: FIRMA,
        name: v.name,
        license_plate: v.spz,
        znacka: v.znacka,
        model: v.model,
        vin: `TMBDEMO0000${String(100000 + i * 1111)}`.slice(0, 17),
        rok_vyroby: v.rok,
        datum_prvej_evidencie: `${v.rok}-03-15`,
        farba: ["sivá metalíza", "čierna", "biela", "červená", "modrá"][i],
        kategoria: v.kluc === "dodavka" ? "N1" : "M1",
        vehicle_type: v.kluc === "dodavka" ? "nákladné" : "osobné",
        fuel_type: v.palivo,
        consumption_l_100km: v.spotreba || null,
        objem_cm3: v.palivo === "elektro" ? null : v.kluc === "fabia" ? 999 : 1968,
        vykon_kw: [110, 140, 110, 324, 70][i],
        celkova_hmotnost_kg: [1990, 2160, 3200, 2232, 1560][i],
        pocet_miest: v.kluc === "dodavka" ? 9 : 5,
        initial_odometer: v.tachometer - 6000 - i * 500,
        vlastnictvo: v.vlastnictvo,
        vlastnik_nazov: v.vlastnictvo === "vlastne" ? "Demo s.r.o." : "Demo Leasing a.s.",
        vlastnik_ico: v.vlastnictvo === "vlastne" ? "00000001" : "50000001",
        drzitel_nazov: "Demo s.r.o.",
        datum_obstarania: `${v.rok}-04-01`,
        obstaravacia_cena: [28900, 41500, 37800, 46990, 14200][i],
        pouzitie: i === 3 ? "zmiesane" : "podnikanie",
        odpocet_dph: i === 3 ? "50" : "100",
        vodic: v.vodic || null,
        // Termíny: časť prepadnutá, časť čoskoro, zvyšok v poriadku.
        stk_do: [den(210), den(12), den(-5), den(600), den(-120)][i],
        ek_do: [den(210), den(12), den(-5), den(600), den(-120)][i],
        pzp_poistovna: "Demo Poisťovňa a.s.",
        pzp_cislo: `PZP-DEMO-${1000 + i}`,
        pzp_do: [den(95), den(25), den(160), den(310), den(-200)][i],
        havarijne_poistovna: i === 4 ? null : "Demo Poisťovňa a.s.",
        havarijne_cislo: i === 4 ? null : `HAV-DEMO-${2000 + i}`,
        havarijne_do: i === 4 ? null : [den(95), den(25), den(160), den(310), null][i],
        dialnicna_znamka_do: [den(60), den(60), den(8), den(60), null][i],
        servis_datum: [den(40), den(150), den(-2), den(300), null][i],
        servis_km: [90000, 60000, 155000, 40000, null][i],
        dmv: i === 1,
        active: v.aktivne,
        vyradene_dna: v.aktivne ? null : den(-90),
        poznamka: i === 2 ? "Chladiaca nadstavba – kontrola chladiva každých 12 mesiacov." : null,
        created_at: cas(-420 + i * 20),
      };
      return zaklad;
    }),
  );

  /* ------------------------------------------------ jazdy za ~4 mesiace */
  const jazdy: Riadok[] = [];
  const tankovania: Riadok[] = [];
  for (const v of VOZIDLA.filter((x) => x.aktivne)) {
    let tach = v.tachometer - 5200;
    const vi = VOZIDLA.indexOf(v);
    let poslTank = tach;
    for (let d = -125; d <= -1; d++) {
      const datum = den(d);
      const tyzden = new Date(datum + "T12:00:00Z").getUTCDay();
      if (tyzden === 0 || tyzden === 6) {
        if (!n.sanca(0.18)) continue;
      } else if (!n.sanca(v.kluc === "dodavka" ? 0.75 : 0.5)) continue;
      const sukromna = (tyzden === 0 || tyzden === 6) && v.kluc !== "dodavka";
      const [odkial, kam, km0, ucel] = sukromna ? [...n.vyber(SUKROMNE), ""] : n.vyber(TRASY);
      const ti = TRASY.findIndex((t) => t[1] === kam);
      const spiatocna = !sukromna && n.sanca(0.7);
      const km = r2((km0 + n.cele(-2, 4)) * (spiatocna ? 2 : 1));
      const zaciatok = n.cele(7, 14);
      const trvanie = Math.round((km / n.cele(55, 85)) * 3600);
      const start = new Date(
        `${datum}T${String(zaciatok).padStart(2, "0")}:${String(n.cele(0, 59)).padStart(2, "0")}:00+01:00`,
      );
      const koniec = new Date(start.getTime() + trvanie * 1000);
      const vodic = v.vodic || vodici[vi % 3];
      const kl = ti >= 0 ? ZAKAZNIK_TRASY[ti] : null;
      jazdy.push({
        id: uid(`jazda:${v.kluc}:${d}`),
        company_id: FIRMA,
        vehicle_id: vozidlo(v.kluc),
        trip_date: datum,
        start_time: start.toISOString(),
        end_time: koniec.toISOString(),
        start_location: odkial,
        end_location: spiatocna ? odkial : kam,
        route: spiatocna ? `${odkial} → ${kam} → ${odkial}` : `${odkial} → ${kam}`,
        start_odometer: Math.round(tach),
        end_odometer: Math.round(tach + km),
        distance_km: Math.round(tach + km) - Math.round(tach),
        duration_seconds: trvanie,
        average_speed_kmh: r2(km / (trvanie / 3600)),
        max_speed_kmh: n.cele(95, 135),
        classification: sukromna ? "private" : "business",
        purpose: sukromna ? null : ucel,
        driver_name: vodic,
        customer_id: !sukromna && kl ? kontakt(kl) : null,
        customer_name: null,
        fuel_consumption: v.spotreba ? r2((km * v.spotreba) / 100) : null,
        fuel_price: v.spotreba ? 1.629 : null,
        external_source: v.kluc === "dodavka" ? "gps" : null,
        external_id: v.kluc === "dodavka" ? `traccar-${d}` : null,
        imported_at: v.kluc === "dodavka" ? cas(d, 20) : null,
        note: d === -3 && vi === 0 ? "Zápcha na D1 pri Trnave – dlhší čas jazdy." : null,
        created_by: tvorcovia[vi % 3],
        created_at: koniec.toISOString(),
      });
      tach = Math.round(tach + km);
      // Tankovanie približne každých 650 km (nie elektromobil).
      if (v.spotreba && tach - poslTank > 650) {
        const litre = r2(((tach - poslTank) * v.spotreba) / 100);
        const cena = [1.589, 1.629, 1.599, 1.649][n.cele(0, 3)];
        tankovania.push({
          id: uid(`tankovanie:${v.kluc}:${d}`),
          company_id: FIRMA,
          vehicle_id: vozidlo(v.kluc),
          fuel_date: datum,
          liters: litre,
          price_per_liter: cena,
          total_amount: r2(litre * cena),
          station_name: n.vyber([
            "Čerpacie stanice Demo – Senec",
            "Čerpacie stanice Demo – Trnava",
            "Demo Pumpa Žilina",
          ]),
          receipt_number: `BL-${String(10000 + tankovania.length)}`,
          odometer_km: tach,
          external_source: v.kluc === "superb" ? "palivova_karta" : null,
          created_at: cas(d, 18),
        });
        poslTank = tach;
      }
    }
  }
  db.vloz("trips", jazdy);
  db.vloz("fuel_records", tankovania);

  /* ------------------------------------------------ doklady vozidiel */
  const druhy: [string, string, number][] = [
    ["tp1", "Osvedčenie o evidencii – časť I", 0],
    ["tp2", "Osvedčenie o evidencii – časť II", 0],
    ["pzp", "Zmluva PZP", 1],
    ["havarijne", "Havarijné poistenie", 2],
    ["stk", "Protokol STK", 3],
    ["ek", "Protokol emisnej kontroly", 3],
  ];
  const doklady: Riadok[] = [];
  VOZIDLA.forEach((v, i) => {
    for (const [druh, nazov, t] of druhy) {
      if (v.kluc === "model3" && druh === "ek") continue;
      if (v.kluc === "fabia" && ["havarijne", "ek"].includes(druh)) continue;
      const platne =
        t === 0
          ? null
          : t === 1
            ? [den(95), den(25), den(160), den(310), den(-200)][i]
            : t === 2
              ? [den(95), den(25), den(160), den(310), null][i]
              : [den(210), den(12), den(-5), den(600), den(-120)][i];
      const pdf = druh !== "tp1";
      doklady.push({
        id: uid(`dok-vozidla:${v.kluc}:${druh}`),
        company_id: FIRMA,
        vehicle_id: vozidlo(v.kluc),
        druh,
        nazov: `${nazov} – ${v.spz}`,
        file_path: `${FIRMA}/${vozidlo(v.kluc)}/${druh}.${pdf ? "pdf" : "jpg"}`,
        file_mime: pdf ? "application/pdf" : "image/jpeg",
        file_size: pdf ? 27720 : 21561,
        platne_do: platne,
        created_by: MAJITEL,
        created_at: cas(-300 + i * 10),
      });
    }
  });
  doklady.push({
    id: uid("dok-vozidla:dodavka:zmluva"),
    company_id: FIRMA,
    vehicle_id: vozidlo("dodavka"),
    druh: "zmluva",
    nazov:
      "Leasingová zmluva č. DEMO-LS-2020-0042 vrátane splátkového kalendára a všeobecných obchodných podmienok",
    file_path: `${FIRMA}/${vozidlo("dodavka")}/zmluva.pdf`,
    file_mime: "application/pdf",
    file_size: 27720,
    platne_do: den(420),
    created_by: MAJITEL,
    created_at: cas(-380),
  });
  db.vloz("vehicle_documents", doklady);
  db.vloz("vehicle_reminder_log", [
    {
      id: uid("pripomienka-vozidla:1"),
      company_id: FIRMA,
      vehicle_id: vozidlo("dodavka"),
      kind: "stk_do",
      due_date: den(-5),
      sent_at: cas(-35, 7),
    },
    {
      id: uid("pripomienka-vozidla:2"),
      company_id: FIRMA,
      vehicle_id: vozidlo("superb"),
      kind: "pzp_do",
      due_date: den(25),
      sent_at: cas(-5, 7),
    },
    {
      id: uid("pripomienka-vozidla:3"),
      company_id: FIRMA,
      vehicle_id: vozidlo("superb"),
      kind: "stk_do",
      due_date: den(12),
      sent_at: cas(-18, 7),
    },
  ]);

  /* ------------------------------------------------ palivové karty */
  const shell = uid("palivova-karta:shell");
  db.vloz("palivove_karty_pripojenia", [
    {
      id: shell,
      company_id: FIRMA,
      poskytovatel: "shell",
      nazov: "Shell Card – Demo",
      prihlasenie_sifrovane: null,
      prihlasenie_verejne: { zakaznik: "DEMO-000123" },
      rezim: "faktura",
      aktivne: true,
      auto_sync: true,
      stav: "ok",
      posledna_sync_at: cas(-1, 6),
      posledna_chyba: null,
      transakcie_do: den(-1),
      faktury_do: den(-30),
      created_by: MAJITEL,
      created_at: cas(-200),
    },
    {
      id: uid("palivova-karta:up"),
      company_id: FIRMA,
      poskytovatel: "up",
      nazov: "Up Slovensko (nepripojené – zlé prihlasovacie údaje)",
      prihlasenie_verejne: {},
      rezim: "len_tankovania",
      aktivne: false,
      auto_sync: false,
      stav: "chyba",
      posledna_sync_at: cas(-12, 6),
      posledna_chyba: "Prihlásenie zlyhalo – overte používateľa a heslo (demo).",
      created_by: MAJITEL,
      created_at: cas(-60),
    },
  ]);
  const karty: [string, string, string][] = [
    ["7002 0000 0000 1234", "BA111DE", "superb"],
    ["7002 0000 0000 5678", "TT222DE", "dodavka"],
    ["7002 0000 0000 9012", "", ""],
  ];
  db.vloz(
    "palivove_karty_vazby",
    karty.map(([karta, spz, kl], i) => ({
      id: uid(`vazba-karty:${i}`),
      company_id: FIRMA,
      pripojenie_id: shell,
      karta,
      spz: spz || null,
      vodic: kl ? vodici[i] : null,
      vehicle_id: kl ? vozidlo(kl) : null,
      rucne: i === 1,
      created_at: cas(-150),
    })),
  );
  const transakcie: Riadok[] = [];
  for (let i = 0; i < 26; i++) {
    const [karta, spz, kl] = karty[i % 3];
    const d = -3 - i * 4;
    const palivo = i % 5 !== 4;
    const mnozstvo = palivo ? r2(35 + n.cislo() * 30) : 1;
    const jednotkova = palivo ? 1.629 : 8.9;
    const spolu = r2(mnozstvo * jednotkova);
    const zaklad = r2(spolu / 1.23);
    transakcie.push({
      id: uid(`transakcia-karty:${i}`),
      company_id: FIRMA,
      pripojenie_id: shell,
      poskytovatel: "shell",
      externe_id: `SH-DEMO-${50000 + i}`,
      cas: cas(d, 7 + (i % 10), 15),
      datum: den(d),
      karta,
      spz: spz || null,
      vodic: kl ? vodici[i % 3] : null,
      vehicle_id: kl ? vozidlo(kl) : null,
      produkt: palivo ? (i % 2 ? "Diesel FuelSave" : "V-Power Diesel") : "Umytie vozidla",
      produkt_kod: palivo ? "D01" : "W01",
      je_palivo: palivo,
      mnozstvo,
      jednotka: palivo ? "l" : "ks",
      zaklad,
      dph: r2(spolu - zaklad),
      sadzba_dph: 23,
      spolu,
      mena: "EUR",
      krajina: "SK",
      krajina_dph: "SK",
      miesto: n.vyber(["Shell Senec", "Shell Trnava D1", "Shell Žilina – Rosinská"]),
      tachometer_km: kl ? 40000 + i * 310 : null,
      faktura_cislo: d < -30 ? `SHELL-${den(d).slice(0, 7).replace("-", "")}` : null,
      faktura_datum: d < -30 ? pridajDni(den(d).slice(0, 8) + "01", 32).slice(0, 8) + "05" : null,
      dobropis: i === 13,
      created_at: cas(d, 20),
    });
  }
  db.vloz("palivove_karty_transakcie", transakcie);
  db.vloz("palivove_karty_logy", [
    {
      id: uid("log-karty:1"),
      company_id: FIRMA,
      pripojenie_id: shell,
      druh: "sync",
      stav: "ok",
      sprava: "Načítaných 4 transakcií, 0 nových faktúr (demo).",
      detail: {},
      created_at: cas(-1, 6),
    },
    {
      id: uid("log-karty:2"),
      company_id: FIRMA,
      pripojenie_id: shell,
      druh: "sync",
      stav: "ciastocne",
      sprava: "Transakcie načítané, faktúra za september ešte nie je k dispozícii (demo).",
      detail: {},
      created_at: cas(-8, 6),
    },
    {
      id: uid("log-karty:3"),
      company_id: FIRMA,
      pripojenie_id: uid("palivova-karta:up"),
      druh: "test",
      stav: "chyba",
      sprava: "Prihlásenie zlyhalo (demo).",
      detail: {},
      created_at: cas(-12, 6),
    },
  ]);

  /* ------------------------------------------------ GPS, Commander, Tesla */
  const gps = uid("gps:traccar");
  db.vloz("gps_pripojenia", [
    {
      id: gps,
      company_id: FIRMA,
      poskytovatel: "traccar",
      nazov: "Traccar – servisné vozidlá (demo)",
      prihlasenie_verejne: { server: "https://gps.demo.example" },
      aktivne: true,
      auto_sync: true,
      stav: "ok",
      neuplne: false,
      posledna_sync_at: cas(-1, 5),
      posledna_chyba: null,
      tankovania_do: den(-1),
      created_by: MAJITEL,
      created_at: cas(-130),
    },
  ]);
  db.vloz("gps_vozidla_vazby", [
    {
      id: uid("gps-vazba:1"),
      company_id: FIRMA,
      pripojenie_id: gps,
      externe_id: "1001",
      nazov: "VW Transporter",
      spz: "TT222DE",
      vin: null,
      vehicle_id: vozidlo("dodavka"),
      jazdy_do: den(-1),
      posledna_sync_at: cas(-1, 5),
      created_at: cas(-130),
    },
    {
      id: uid("gps-vazba:2"),
      company_id: FIRMA,
      pripojenie_id: gps,
      externe_id: "1002",
      nazov: "Neznáme vozidlo GPS",
      spz: null,
      vin: null,
      vehicle_id: null,
      jazdy_do: null,
      posledna_sync_at: cas(-1, 5),
      created_at: cas(-130),
    },
  ]);
  db.vloz("gps_sync_logy", [
    {
      id: uid("gps-log:1"),
      company_id: FIRMA,
      pripojenie_id: gps,
      druh: "jazdy",
      stav: "ok",
      sprava: "Načítané 3 jazdy (demo).",
      detail: { jazdy: 3 },
      created_at: cas(-1, 5),
    },
    {
      id: uid("gps-log:2"),
      company_id: FIRMA,
      pripojenie_id: gps,
      druh: "vozidla",
      stav: "ok",
      sprava: "Načítané 2 vozidlá (demo).",
      detail: { vozidla: 2 },
      created_at: cas(-2, 5),
    },
    {
      id: uid("gps-log:3"),
      company_id: FIRMA,
      pripojenie_id: gps,
      druh: "jazdy",
      stav: "ciastocne",
      sprava: "Jedno vozidlo nie je priradené (demo).",
      detail: {},
      created_at: cas(-3, 5),
    },
  ]);
  // Commander: pripojenie existuje, ale je vypnuté (nepripojené).
  db.vloz("commander_connections", [
    {
      id: uid("commander:1"),
      company_id: FIRMA,
      username: "demo.commander",
      encrypted_password: null,
      enabled: false,
      auto_sync_daily: false,
      sync_status: "idle",
      last_sync_at: null,
      error_message: null,
      created_at: cas(-40),
    },
  ]);
}
