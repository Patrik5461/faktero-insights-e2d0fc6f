/*
  Konvertor tabuľky (XLSX/CSV) na dávku XML Pohody.

  Účtovníčka dostane od klienta doklady v Exceli, nie vo Fakteri. Vyplní ich
  do predpripravenej šablóny (vydané faktúry, prijaté faktúry alebo bločky),
  Faktero z riadkov poskladá doklady v pamäti a prevedie ich tým istým
  exportom, ktorým idú do Pohody doklady z Faktera. **Nič sa neukladá** —
  výsledok je len súbor na stiahnutie.

  Čisté funkcie: šablóna (hlavičky a vzorový riadok) a prevod riadkov na
  doklady v tvare, ktorý čítajú `polozkyFaktur` a `polozkyDokladov`.
*/

export type DruhKonvertora = "vydane" | "prijate" | "blocky";

export const DRUHY_KONVERTORA: { kod: DruhKonvertora; nazov: string }[] = [
  { kod: "vydane", nazov: "Vydané faktúry" },
  { kod: "prijate", nazov: "Prijaté faktúry" },
  { kod: "blocky", nazov: "Bločky" },
];

type Stlpec = { kluc: string; nazov: string; povinny?: boolean; vzor: string | number };

/*
  Hlavičky šablóny. Riadky s rovnakým číslom dokladu sú jeden doklad —
  pri vydanej faktúre ďalšia položka, pri prijatej faktúre a bločku ďalšia
  sadzba DPH v rozpise.
*/
export const STLPCE_KONVERTORA: Record<DruhKonvertora, Stlpec[]> = {
  vydane: [
    { kluc: "cislo", nazov: "Číslo faktúry", povinny: true, vzor: "2026001" },
    { kluc: "typ", nazov: "Typ (faktúra/dobropis)", vzor: "faktúra" },
    { kluc: "vystavenie", nazov: "Dátum vystavenia", povinny: true, vzor: "2026-10-01" },
    { kluc: "dodanie", nazov: "Dátum dodania", vzor: "2026-10-01" },
    { kluc: "splatnost", nazov: "Dátum splatnosti", vzor: "2026-10-15" },
    { kluc: "partner", nazov: "Odberateľ", povinny: true, vzor: "Vzorová firma s.r.o." },
    { kluc: "ico", nazov: "IČO", vzor: "12345678" },
    { kluc: "dic", nazov: "DIČ", vzor: "2020123456" },
    { kluc: "icDph", nazov: "IČ DPH", vzor: "SK2020123456" },
    { kluc: "ulica", nazov: "Ulica", vzor: "Hlavná 1" },
    { kluc: "mesto", nazov: "Mesto", vzor: "Bratislava" },
    { kluc: "psc", nazov: "PSČ", vzor: "81101" },
    { kluc: "krajina", nazov: "Krajina", vzor: "SK" },
    { kluc: "email", nazov: "E-mail", vzor: "" },
    { kluc: "vs", nazov: "Variabilný symbol", vzor: "2026001" },
    { kluc: "ks", nazov: "Konštantný symbol", vzor: "" },
    { kluc: "mena", nazov: "Mena", vzor: "EUR" },
    { kluc: "platba", nazov: "Forma úhrady (prevod/hotovosť/karta/dobierka)", vzor: "prevod" },
    { kluc: "text", nazov: "Text nad položkami", vzor: "Fakturujeme vám za služby" },
    { kluc: "poznamka", nazov: "Poznámka", vzor: "" },
    { kluc: "polozka", nazov: "Položka", povinny: true, vzor: "Konzultácie" },
    { kluc: "mnozstvo", nazov: "Množstvo", vzor: 2 },
    { kluc: "mj", nazov: "MJ", vzor: "hod" },
    { kluc: "cena", nazov: "Jednotková cena bez DPH", povinny: true, vzor: 50 },
    { kluc: "sadzba", nazov: "Sadzba DPH %", vzor: 23 },
    { kluc: "predkontacia", nazov: "Predkontácia", vzor: "" },
    { kluc: "clenenie", nazov: "Členenie DPH", vzor: "" },
  ],
  prijate: [
    { kluc: "cislo", nazov: "Číslo faktúry dodávateľa", povinny: true, vzor: "FA-2026-118" },
    { kluc: "vs", nazov: "Variabilný symbol", vzor: "2026118" },
    { kluc: "vystavenie", nazov: "Dátum vystavenia", povinny: true, vzor: "2026-10-02" },
    { kluc: "dodanie", nazov: "Dátum dodania", vzor: "2026-10-02" },
    { kluc: "dorucenie", nazov: "Dátum doručenia", vzor: "2026-10-04" },
    { kluc: "splatnost", nazov: "Dátum splatnosti", vzor: "2026-10-16" },
    { kluc: "partner", nazov: "Dodávateľ", povinny: true, vzor: "Dodávateľ a.s." },
    { kluc: "ico", nazov: "IČO", vzor: "87654321" },
    { kluc: "dic", nazov: "DIČ", vzor: "2021876543" },
    { kluc: "icDph", nazov: "IČ DPH", vzor: "SK2021876543" },
    { kluc: "ulica", nazov: "Ulica", vzor: "Priemyselná 5" },
    { kluc: "mesto", nazov: "Mesto", vzor: "Žilina" },
    { kluc: "psc", nazov: "PSČ", vzor: "01001" },
    { kluc: "krajina", nazov: "Krajina", vzor: "SK" },
    { kluc: "iban", nazov: "IBAN dodávateľa", vzor: "" },
    { kluc: "mena", nazov: "Mena", vzor: "EUR" },
    { kluc: "kurz", nazov: "Kurz (pri cudzej mene)", vzor: "" },
    { kluc: "platba", nazov: "Forma úhrady (prevod/hotovosť/karta/dobierka)", vzor: "prevod" },
    { kluc: "text", nazov: "Text", vzor: "Materiál na stavbu" },
    { kluc: "zaklad", nazov: "Základ DPH", povinny: true, vzor: 100 },
    { kluc: "sadzba", nazov: "Sadzba DPH %", vzor: 23 },
    { kluc: "dph", nazov: "DPH", vzor: 23 },
    { kluc: "predkontacia", nazov: "Predkontácia", vzor: "" },
    { kluc: "clenenie", nazov: "Členenie DPH", vzor: "" },
    { kluc: "poznamka", nazov: "Poznámka", vzor: "" },
  ],
  blocky: [
    { kluc: "vystavenie", nazov: "Dátum", povinny: true, vzor: "2026-10-03" },
    { kluc: "partner", nazov: "Obchodník", povinny: true, vzor: "Čerpacia stanica" },
    { kluc: "ico", nazov: "IČO", vzor: "11223344" },
    { kluc: "icDph", nazov: "IČ DPH", vzor: "SK2020112233" },
    { kluc: "cislo", nazov: "Číslo dokladu", vzor: "B-555" },
    { kluc: "platba", nazov: "Spôsob platby (hotovosť/karta/prevod)", vzor: "karta" },
    { kluc: "zaklad", nazov: "Základ DPH", povinny: true, vzor: 40.65 },
    { kluc: "sadzba", nazov: "Sadzba DPH %", vzor: 23 },
    { kluc: "dph", nazov: "DPH", vzor: 9.35 },
    { kluc: "predkontacia", nazov: "Predkontácia", vzor: "" },
    { kluc: "clenenie", nazov: "Členenie DPH", vzor: "" },
    { kluc: "poznamka", nazov: "Poznámka", vzor: "" },
  ],
};

/** Hlavička a vzorový riadok šablóny (pre `aoa_to_sheet`). */
export function sablonaKonvertora(druh: DruhKonvertora): (string | number)[][] {
  const s = STLPCE_KONVERTORA[druh];
  return [s.map((x) => (x.povinny ? `${x.nazov} *` : x.nazov)), s.map((x) => x.vzor)];
}

/** Názov stĺpca bez diakritiky, hviezdičky a veľkosti písmen — na porovnanie hlavičky. */
function normNazov(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Číslo zo šablóny: „1 234,56", „1234.56", 1234.56. Prázdne = `null`. */
export function cisloZBunky(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[\s €%]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes("."))
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Dátum zo šablóny: „2026-10-01", „1.10.2026", sériové číslo Excelu. Zlý = `""`. */
export function datumZBunky(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return platnyDatum(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(s);
  if (m) return platnyDatum(+m[3], +m[2], +m[1]);
  return "";
}

function platnyDatum(r: number, mes: number, d: number): string {
  const x = new Date(Date.UTC(r, mes - 1, d));
  if (x.getUTCFullYear() !== r || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== d) return "";
  return x.toISOString().slice(0, 10);
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Sadzba „23", „23 %" alebo 0,23 (bunka vo formáte percent). */
function sadzbaZBunky(v: unknown): number {
  const n = cisloZBunky(v) ?? 0;
  return n > 0 && n < 1 ? r2(n * 100) : n;
}

function platbaZBunky(v: unknown): string {
  const s = normNazov(v);
  if (!s) return "prevod";
  if (s.startsWith("hot")) return "hotovost";
  if (s.startsWith("kart") || s === "card") return "karta";
  if (s.startsWith("dob")) return "dobierka";
  if (s.startsWith("zap")) return "zapocet";
  return "prevod";
}

/** Krátky stály odtlačok — rovnaký doklad dostane pri druhom prevode to isté id (kontrola duplicity v Pohode). */
function odtlacok(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type VysledokKonvertora = {
  /** Vydané faktúry v tvare pre `polozkyFaktur`. */
  faktury: { invoice: Record<string, unknown>; items: Record<string, unknown>[] }[];
  /** Prijaté faktúry a bločky v tvare pre `polozkyDokladov`. */
  doklady: Record<string, unknown>[];
  /** Riadky, ktoré sa nedali previesť — doklad z nich do súboru nejde. */
  chyby: string[];
};

/** Riadky tabuľky (objekty podľa hlavičky) → hodnoty podľa kľúča stĺpca. */
export function riadkyPodlaKluca(
  druh: DruhKonvertora,
  riadky: Record<string, unknown>[],
): Record<string, unknown>[] {
  const mapa = new Map(STLPCE_KONVERTORA[druh].map((s) => [normNazov(s.nazov), s.kluc]));
  return riadky.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r ?? {})) {
      const kluc = mapa.get(normNazov(k));
      if (kluc) out[kluc] = typeof v === "string" ? v.trim() : v;
    }
    return out;
  });
}

const text = (v: unknown, max = 255) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

/**
 * Prevedie riadky šablóny na doklady. `riadky` sú objekty podľa hlavičky
 * (tak, ako ich vráti `sheet_to_json`); prázdne riadky sa preskočia.
 */
export function prevedRiadky(
  druh: DruhKonvertora,
  riadky: Record<string, unknown>[],
  opts: { domacaMena?: string } = {},
): VysledokKonvertora {
  const domaca = (opts.domacaMena || "EUR").toUpperCase();
  const chyby: string[] = [];
  const zoznam = riadkyPodlaKluca(druh, riadky)
    .map((r, i) => ({ r, cisloRiadku: i + 2 }))
    .filter(({ r }) => Object.values(r).some((v) => v !== "" && v != null));
  const povinne = STLPCE_KONVERTORA[druh].filter((s) => s.povinny);

  // Skupiny riadkov = doklady.
  const skupiny = new Map<string, { r: Record<string, unknown>; cisloRiadku: number }[]>();
  for (const x of zoznam) {
    const chyba = povinne.find((s) => x.r[s.kluc] == null || x.r[s.kluc] === "");
    if (chyba) {
      chyby.push(`Riadok ${x.cisloRiadku}: chýba „${chyba.nazov}"`);
      continue;
    }
    const cislo = text(x.r.cislo);
    const kluc =
      druh === "blocky" && !cislo
        ? `riadok-${x.cisloRiadku}`
        : [
            cislo,
            druh === "vydane" ? "" : normNazov(x.r.partner),
            druh === "blocky" ? text(x.r.vystavenie) : "",
          ].join("|");
    skupiny.set(kluc, [...(skupiny.get(kluc) ?? []), x]);
  }

  const faktury: VysledokKonvertora["faktury"] = [];
  const doklady: Record<string, unknown>[] = [];

  for (const [kluc, sk] of skupiny) {
    const h = sk[0].r;
    const odkial =
      sk.length > 1
        ? `riadky ${sk[0].cisloRiadku}–${sk[sk.length - 1].cisloRiadku}`
        : `riadok ${sk[0].cisloRiadku}`;
    const vystavenie = datumZBunky(h.vystavenie);
    if (!vystavenie) {
      chyby.push(
        `${odkial}: dátum vystavenia nie je platný dátum (napr. 2026-10-01 alebo 1.10.2026)`,
      );
      continue;
    }
    const mena = (text(h.mena, 3) || domaca).toUpperCase();
    const id = `XLS-${druh}-${odtlacok(`${kluc}|${vystavenie}`)}`;
    const dodanie = datumZBunky(h.dodanie);

    if (druh === "vydane") {
      const items: Record<string, unknown>[] = [];
      let zla = "";
      for (const { r, cisloRiadku } of sk) {
        const mnozstvo = cisloZBunky(r.mnozstvo) ?? 1;
        const cena = cisloZBunky(r.cena);
        if (cena == null) {
          zla = `Riadok ${cisloRiadku}: jednotková cena nie je číslo`;
          break;
        }
        const sadzba = sadzbaZBunky(r.sadzba);
        const zaklad = r2(mnozstvo * cena);
        const dph = r2((zaklad * sadzba) / 100);
        items.push({
          name: text(r.polozka, 90),
          quantity: mnozstvo,
          unit: text(r.mj, 10) || "ks",
          unit_price: cena,
          vat_rate: sadzba,
          subtotal: zaklad,
          vat_amount: dph,
          total: r2(zaklad + dph),
          pohoda_predkontacia: text(r.predkontacia, 30) || null,
          pohoda_clenenie_dph: text(r.clenenie, 30) || null,
        });
      }
      if (zla) {
        chyby.push(zla);
        continue;
      }
      const dobropis = normNazov(h.typ).startsWith("dobropis");
      faktury.push({
        invoice: {
          id,
          type: dobropis ? "credit_note" : "regular",
          invoice_number: text(h.cislo, 32),
          issue_date: vystavenie,
          delivery_date: dodanie || vystavenie,
          due_date: datumZBunky(h.splatnost) || null,
          customer_name: text(h.partner, 96),
          customer_ico: text(h.ico, 15) || null,
          customer_dic: text(h.dic, 18) || null,
          customer_ic_dph: text(h.icDph, 18) || null,
          customer_street: text(h.ulica, 64) || null,
          customer_city: text(h.mesto, 45) || null,
          customer_zip: text(h.psc, 15) || null,
          customer_country: text(h.krajina, 2).toUpperCase() || null,
          customer_email: text(h.email, 98) || null,
          variable_symbol: text(h.vs, 20).replace(/\D/g, "") || null,
          constant_symbol: text(h.ks, 4).replace(/\D/g, "") || null,
          currency: mena,
          payment_method: platbaZBunky(h.platba),
          intro_note: text(h.text, 240) || null,
          notes: text(h.poznamka, 200) || null,
          total: r2(items.reduce((a, it) => a + Number(it.total), 0)),
          reverse_charge: false,
          status: "issued",
        },
        items,
      });
      continue;
    }

    // Prijatá faktúra a bloček — rozpis po sadzbách.
    const po = new Map<number, { sadzba: number; zaklad: number; dph: number }>();
    let zla = "";
    for (const { r, cisloRiadku } of sk) {
      const zaklad = cisloZBunky(r.zaklad);
      if (zaklad == null) {
        zla = `Riadok ${cisloRiadku}: základ DPH nie je číslo`;
        break;
      }
      const sadzba = sadzbaZBunky(r.sadzba);
      const dph = cisloZBunky(r.dph) ?? r2((zaklad * sadzba) / 100);
      const x = po.get(sadzba) ?? { sadzba, zaklad: 0, dph: 0 };
      x.zaklad = r2(x.zaklad + zaklad);
      x.dph = r2(x.dph + dph);
      po.set(sadzba, x);
    }
    if (zla) {
      chyby.push(zla);
      continue;
    }
    const rozpis = [...po.values()].sort((a, b) => b.sadzba - a.sadzba);
    const spolu = r2(rozpis.reduce((a, x) => a + x.zaklad + x.dph, 0));
    const spolocne = {
      id,
      supplier_name: text(h.partner, 96),
      supplier_ico: text(h.ico, 15) || null,
      supplier_ic_dph: text(h.icDph, 18) || null,
      document_number: text(h.cislo, 32) || null,
      issue_date: vystavenie,
      currency: mena,
      payment_method: platbaZBunky(h.platba),
      note: text(h.poznamka, 200) || null,
      pohoda_predkontacia: text(h.predkontacia, 30) || null,
      pohoda_clenenie_dph: text(h.clenenie, 30) || null,
      total_amount: spolu,
      net_amount: r2(rozpis.reduce((a, x) => a + x.zaklad, 0)),
      vat_amount: r2(rozpis.reduce((a, x) => a + x.dph, 0)),
      vat_breakdown: rozpis,
    };
    if (druh === "blocky") {
      doklady.push(spolocne);
      continue;
    }
    const vs = text(h.vs, 20).replace(/\D/g, "");
    doklady.push({
      ...spolocne,
      supplier_dic: text(h.dic, 18) || null,
      supplier_street: text(h.ulica, 64) || null,
      supplier_city: text(h.mesto, 45) || null,
      supplier_zip: text(h.psc, 15) || null,
      supplier_country: text(h.krajina, 2).toUpperCase() || null,
      _typPohody: spolu < 0 ? "receivedCreditNotice" : "receivedInvoice",
      _povodneCislo: text(h.cislo, 32),
      _symVar: vs || null,
      _datumDph: dodanie || vystavenie,
      _datumDorucenia: datumZBunky(h.dorucenie) || null,
      _splatnost: datumZBunky(h.splatnost) || null,
      _ucetDodavatela: text(h.iban, 34).replace(/\s/g, "") || null,
      _kurz: cisloZBunky(h.kurz),
      _text: text(h.text, 240) || null,
    });
  }

  return { faktury, doklady, chyby };
}
