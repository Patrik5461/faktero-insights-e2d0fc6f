/**
 * Demo dáta: zákazky Demo s.r.o. — aktívne, uzavreté aj zrušené.
 *
 * Zákazky sa napájajú na existujúce doklady: faktúry, ponuky a prijaté
 * objednávky odberateľa zo zákazky dostanú `job_id` (len tie z obdobia
 * zákazky), výdaje zo skladu a objednávky u dodávateľa ich majú už
 * z `sklad.ts` (rovnaké id cez `zakazka(i)`). Prijaté faktúry, bločky
 * a jazdy môžu ďalšie moduly naviazať cez `zakazka(i)`.
 */
import type { DemoDb } from "../server/db";
import { FIRMA, MAJITEL, UCTOVNIK } from "./zaklad";
import { kontakt, kontaktData } from "./kontakty";
import { cas, den, pridajDni, uid } from "./pomocne";

export type DemoZakazka = {
  nazov: string;
  kontakt: string;
  stav: "active" | "closed" | "cancelled";
  /** začiatok — dni od dneška */
  od: number;
  /** trvanie v dňoch (null = bez konca) */
  dni: number | null;
  vynos: number | null;
  naklad: number | null;
  poznamka?: string;
};

export const ZAKAZKY: DemoZakazka[] = [
  {
    nazov: "Rekonštrukcia kancelárií – 2. poschodie",
    kontakt: "alfa",
    stav: "active",
    od: -75,
    dni: 120,
    vynos: 18500,
    naklad: 11200,
    poznamka: "Etapa 1 hotová, čaká sa na dodávku nábytku.",
  },
  {
    nazov: "Dodávka IT vybavenia – pobočka Petržalka",
    kontakt: "beta",
    stav: "active",
    od: -40,
    dni: 60,
    vynos: 9800,
    naklad: 7400,
  },
  {
    nazov: "Implementácia skladového systému",
    kontakt: "gama",
    stav: "active",
    od: -120,
    dni: 200,
    vynos: 24000,
    naklad: 9000,
  },
  {
    nazov: "Vybavenie ordinácií",
    kontakt: "epsilon",
    stav: "active",
    od: -60,
    dni: 90,
    vynos: 15600,
    naklad: 12100,
  },
  {
    nazov:
      "Komplexná modernizácia technologického zázemia, dátovej siete a kancelárskych priestorov vrátane školení zamestnancov a dlhodobej podpory (dlhý názov)",
    kontakt: "dlhy",
    stav: "active",
    od: -30,
    dni: 365,
    vynos: 48000,
    naklad: 31000,
    poznamka: "Rámcová zmluva na rok, fakturuje sa mesačne podľa skutočného plnenia.",
  },
  {
    nazov: "Webová prezentácia a e-shop",
    kontakt: "lambda",
    stav: "active",
    od: -20,
    dni: 45,
    vynos: 4200,
    naklad: 900,
  },
  {
    nazov: "Servis techniky hotela",
    kontakt: "ni",
    stav: "active",
    od: -200,
    dni: null,
    vynos: null,
    naklad: null,
    poznamka: "Priebežná zákazka bez plánu.",
  },
  {
    nazov: "Školenia obsluhy – Eta Agro",
    kontakt: "eta",
    stav: "active",
    od: -10,
    dni: 30,
    vynos: 2400,
    naklad: 600,
  },
  {
    nazov: "Tlačové stroje – servisná zmluva 2025",
    kontakt: "theta",
    stav: "closed",
    od: -380,
    dni: 300,
    vynos: 7200,
    naklad: 3100,
  },
  {
    nazov: "Kancelárske vybavenie – Delta Reštaurácie",
    kontakt: "delta",
    stav: "closed",
    od: -260,
    dni: 40,
    vynos: 3500,
    naklad: 2600,
  },
  {
    nazov: "Elektroinštalácia skladu",
    kontakt: "mi",
    stav: "closed",
    od: -180,
    dni: 50,
    vynos: 6800,
    naklad: 5200,
  },
  {
    nazov: "Migrácia dát do cloudu",
    kontakt: "gama",
    stav: "closed",
    od: -330,
    dni: 90,
    vynos: 12000,
    naklad: 4800,
  },
  {
    nazov: "Kaviareň – nové pokladničné miesto",
    kontakt: "zeta",
    stav: "cancelled",
    od: -90,
    dni: 20,
    vynos: 1800,
    naklad: 1100,
    poznamka: "Zákazník projekt odložil.",
  },
  {
    nazov: "Konzultácie pre rakúsku pobočku",
    kontakt: "iota",
    stav: "cancelled",
    od: -150,
    dni: 60,
    vynos: 5000,
    naklad: 1000,
  },
];

/** id zákazky podľa poradia v `ZAKAZKY` */
export const zakazka = (i: number) => uid(`zakazka:${i}`);

/** Číslo zákazky ZAK{rok}{NNN} podľa roku začiatku a poradia. */
function cislaZakaziek(): string[] {
  const poradie = new Map<string, number>();
  const zoradene = ZAKAZKY.map((z, i) => ({ i, d: den(z.od) })).sort((a, b) =>
    a.d.localeCompare(b.d),
  );
  const out: string[] = [];
  for (const { i, d } of zoradene) {
    const rok = d.slice(0, 4);
    const n = (poradie.get(rok) ?? 0) + 1;
    poradie.set(rok, n);
    out[i] = `ZAK${rok}${String(n).padStart(3, "0")}`;
  }
  return out;
}

export function naplnZakazky(db: DemoDb) {
  const cisla = cislaZakaziek();
  db.vloz(
    "jobs",
    ZAKAZKY.map((z, i) => {
      const k = kontaktData(z.kontakt);
      const start = den(z.od);
      const koniec = z.dni == null ? null : pridajDni(start, z.dni);
      return {
        id: zakazka(i),
        company_id: FIRMA,
        job_number: cisla[i],
        name: z.nazov,
        customer_id: kontakt(k.kluc),
        customer_name: k.name,
        status: z.stav,
        start_date: start,
        end_date: koniec,
        planned_revenue: z.vynos,
        planned_cost: z.naklad,
        note: z.poznamka ?? null,
        manazer_id: i % 3 === 1 ? UCTOVNIK : MAJITEL,
        created_by: MAJITEL,
        closed_at:
          z.stav === "closed" && koniec
            ? koniec + "T16:00:00.000Z"
            : z.stav === "cancelled"
              ? cas(z.od + 10)
              : null,
        created_at: start + "T08:30:00.000Z",
      };
    }),
  );

  // Doklady odberateľa z obdobia zákazky → job_id (len kým ho nemajú).
  ZAKAZKY.forEach((z, i) => {
    if (z.stav === "cancelled") return;
    const zak = kontakt(z.kontakt);
    const od = den(z.od);
    const po = z.dni == null ? den(0) : pridajDni(od, z.dni);
    const vObdobi = (d: string | null) => !!d && d >= od && d <= po;
    for (const f of db.tabulka("invoices")) {
      if (f.company_id === FIRMA && f.customer_id === zak && !f.job_id && vObdobi(f.issue_date))
        f.job_id = zakazka(i);
    }
    for (const q of db.tabulka("quotes")) {
      if (q.company_id === FIRMA && q.customer_id === zak && !q.job_id && vObdobi(q.issue_date))
        q.job_id = zakazka(i);
    }
    for (const o of db.tabulka("sales_orders")) {
      if (o.company_id === FIRMA && o.customer_id === zak && !o.job_id && vObdobi(o.order_date))
        o.job_id = zakazka(i);
    }
  });

  // Plán zladený so skutočnosťou, aby percentá plnenia vyzerali uveriteľne:
  // otvorené zákazky sú zhruba v polovici, uzavreté tesne okolo plánu.
  const vynosy = new Map<string, number>();
  for (const f of db.tabulka("invoices")) {
    if (
      !f.job_id ||
      ["draft", "cancelled"].includes(f.status) ||
      ["proforma", "advance_payment"].includes(f.type)
    )
      continue;
    vynosy.set(f.job_id, (vynosy.get(f.job_id) ?? 0) + Number(f.subtotal || 0));
  }
  for (const j of db.tabulka("jobs")) {
    if (j.company_id !== FIRMA || j.planned_revenue == null) continue;
    const skutocne = vynosy.get(j.id) ?? 0;
    if (skutocne <= 0) continue;
    const koef = j.status === "closed" ? 0.97 : 1.9;
    const plan = Math.round((skutocne * koef) / 100) * 100;
    j.planned_cost =
      Math.round((plan * Number(j.planned_cost)) / Number(j.planned_revenue) / 100) * 100;
    j.planned_revenue = plan;
  }
}
