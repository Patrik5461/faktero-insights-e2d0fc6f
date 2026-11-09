/**
 * Splátky leasingu a úveru do Pohody — agenda **Ostatné záväzky**.
 *
 * Ostatné záväzky sú v Pohode faktúra (`inv:invoice`) typu `commitment`
 * (invoice.xsd, `invoiceTypeType`: „Závazek“) — rovnaká agenda, do ktorej ide
 * bloček zaplatený kartou. Každá splátka je jeden záväzok s položkami:
 *
 *  - **Istina** a **Úrok** — tak, ako sú v kalendári. Bez rozpadu by účtovník
 *    v Pohode musel splátku rozdeľovať ručne, a to je presne práca, ktorú
 *    kalendár šetrí.
 *  - **Poistenie** (havarijné, PZP), ak ho splátka obsahuje.
 *  - **Ostatné** — zvyšok do sumy splátky (poplatok za správu…), aby súčet
 *    záväzku sedel na cent so sumou, ktorú banka stiahne.
 *
 * DPH: keď splátka obsahuje DPH (operatívny leasing), istina a úrok sú základ
 * a daň sa rozdelí medzi ne pomerom; posledná zdaniteľná položka dostane
 * zvyšok, nech súčet dane sedí s kalendárom na cent. Inak sú položky bez DPH.
 *
 * Predkontácia, členenie DPH a členenie KV sa nastavujú raz na kalendári
 * (`financing_contracts.pohoda_*`); splátka ich môže prepísať vlastnými.
 * Rozúčtovanie (`pohoda_rozuctovanie`) dá istine, úroku, poisteniu a
 * poplatkom vlastnú predkontáciu a členenie DPH na položke — istina ide
 * na záväzok (napr. 479), úrok a poistenie do nákladov (562, 548).
 *
 * Čistý modul bez databázy — zostaví XML, nič nezapisuje. Generátor exportu
 * (`export.server.ts`) sa zámerne nevolá: splátka nie je doklad z adresára ani
 * prijatá faktúra a nemá ich polia.
 */
import { sadzbyKuDnu, krajinaDane, type KrajinaDane } from "./vat-rates";

export type ZmluvaPreExport = {
  id: string;
  kind: string;
  name: string;
  provider_name?: string | null;
  contract_number?: string | null;
  variable_symbol?: string | null;
  currency?: string | null;
  vat_rate?: number | string | null;
  term_months?: number | null;
  pohoda_predkontacia?: string | null;
  pohoda_clenenie_dph?: string | null;
  kv_clenenie?: string | null;
  pohoda_rad?: string | null;
  /** Kódy po zložkách splátky — `{ istina: { predkontacia, clenenie }, … }`. */
  pohoda_rozuctovanie?: Rozuctovanie | null;
};

export const ZLOZKY_SPLATKY = ["istina", "urok", "poistenie", "poplatky"] as const;
export type ZlozkaSplatky = (typeof ZLOZKY_SPLATKY)[number];
export type KodyZlozky = { predkontacia?: string | null; clenenie?: string | null };
export type Rozuctovanie = Partial<Record<ZlozkaSplatky, KodyZlozky>>;

export type SplatkaPreExport = {
  id: string;
  number: number;
  due_date: string;
  amount: number | string;
  principal_part: number | string;
  interest_part: number | string;
  vat_amount: number | string;
  insurance_part?: number | string | null;
  pohoda_predkontacia?: string | null;
  pohoda_clenenie_dph?: string | null;
  kv_clenenie?: string | null;
};

export type KodyZauctovania = {
  predkontacia: string | null;
  clenenie: string | null;
  kv: string | null;
  /** Splátka má aspoň jeden vlastný kód (prebíja kalendár). */
  vlastne: boolean;
};

export type PolozkaSplatky = {
  text: string;
  /** Zložka splátky; null = splátka bez rozpadu (jedna položka). */
  zlozka: ZlozkaSplatky | null;
  zaklad: number;
  dph: number;
  /** Sadzba DPH v percentách (0 = bez DPH). */
  sadzba: number;
};

type Priehradka = "none" | "low" | "high" | "third";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown) => String(v ?? "").trim();

function esc(v: unknown): string {
  return String(v ?? "")
    // Riadiace znaky XML 1.0 nepripúšťa — Pohoda by import odmietla celý.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function skrat(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function el(nazov: string, hodnota: unknown, odsadenie: string): string {
  const v = txt(hodnota);
  return v ? `\n${odsadenie}<${nazov}>${esc(v)}</${nazov}>` : "";
}

const suma = (nazov: string, n: number, odsadenie: string) =>
  `\n${odsadenie}<${nazov}>${r2(n).toFixed(2)}</${nazov}>`;

/** Kódy zaúčtovania splátky: vlastné na splátke, inak z kalendára. */
export function ucinneKody(zmluva: ZmluvaPreExport, splatka: SplatkaPreExport): KodyZauctovania {
  const pk = txt(splatka.pohoda_predkontacia);
  const cl = txt(splatka.pohoda_clenenie_dph);
  const kv = txt(splatka.kv_clenenie);
  return {
    predkontacia: pk || txt(zmluva.pohoda_predkontacia) || null,
    clenenie: cl || txt(zmluva.pohoda_clenenie_dph) || null,
    kv: kv || txt(zmluva.kv_clenenie) || null,
    vlastne: Boolean(pk || cl || kv),
  };
}

/**
 * Kódy jednej položky záväzku: rozúčtovanie zložky na kalendári, inak kódy
 * splátky a kalendára (`ucinneKody`). Splátka bez rozpadu ide podľa nich.
 */
export function kodyPolozky(
  zmluva: ZmluvaPreExport,
  kody: KodyZauctovania,
  zlozka: ZlozkaSplatky | null,
): KodyZauctovania {
  const r = zlozka ? zmluva.pohoda_rozuctovanie?.[zlozka] : null;
  return {
    ...kody,
    predkontacia: txt(r?.predkontacia) || kody.predkontacia,
    clenenie: txt(r?.clenenie) || kody.clenenie,
  };
}

/** Má kalendár rozúčtovanie aspoň jednej zložky? */
export function maRozuctovanie(zmluva: ZmluvaPreExport): boolean {
  const r = zmluva.pohoda_rozuctovanie ?? {};
  return ZLOZKY_SPLATKY.some((z) => txt(r[z]?.predkontacia) || txt(r[z]?.clenenie));
}

/**
 * Sadzba DPH splátky. Zmluva ju zvyčajne nesie; keď nie (kalendár prečítaný
 * z PDF bez hlavičky), odvodí sa z pomeru dane a základu a priradí k sadzbe,
 * ktorá v deň splatnosti platila.
 */
export function sadzbaSplatky(
  zmluva: ZmluvaPreExport,
  splatka: SplatkaPreExport,
  krajina: KrajinaDane = "SK",
): number {
  const dph = num(splatka.vat_amount);
  if (dph <= 0) return 0;
  const zo = num(zmluva.vat_rate);
  if (zo > 0) return zo;
  const zaklad = zakladDane(splatka);
  const tab = sadzbyKuDnu(krajina, splatka.due_date);
  if (zaklad <= 0) return tab.high;
  const odhad = (dph / zaklad) * 100;
  const kandidati = [tab.high, tab.low, ...(tab.third != null ? [tab.third] : [])];
  return kandidati.reduce((a, b) => (Math.abs(b - odhad) < Math.abs(a - odhad) ? b : a));
}

/** Základ dane: istina + úrok, a keď rozpad chýba, splátka bez dane a poistenia. */
function zakladDane(s: SplatkaPreExport): number {
  const iu = num(s.principal_part) + num(s.interest_part);
  if (iu > 0) return r2(iu);
  return r2(num(s.amount) - num(s.vat_amount) - num(s.insurance_part));
}

/**
 * Položky záväzku. Súčet (základ + daň) sedí so sumou splátky; keď časti
 * presahujú splátku, vráti sa výhrada a zvyšok sa nepridá.
 */
export function polozkySplatky(
  zmluva: ZmluvaPreExport,
  splatka: SplatkaPreExport,
  krajina: KrajinaDane = "SK",
): { polozky: PolozkaSplatky[]; vyhrady: string[] } {
  const vyhrady: string[] = [];
  const istina = r2(num(splatka.principal_part));
  const urok = r2(num(splatka.interest_part));
  const poistenie = r2(num(splatka.insurance_part));
  const dph = r2(num(splatka.vat_amount));
  const spolu = r2(num(splatka.amount));
  const sadzba = sadzbaSplatky(zmluva, splatka, krajina);
  const polozky: PolozkaSplatky[] = [];

  if (istina > 0 || urok > 0) {
    const zdanitelne = (
      [
        ["Istina", istina, "istina"],
        ["Úrok", urok, "urok"],
      ] as [string, number, ZlozkaSplatky][]
    ).filter(([, z]) => z > 0);
    const zakladSpolu = r2(zdanitelne.reduce((a, [, z]) => a + z, 0));
    let zostava = dph;
    zdanitelne.forEach(([text, z, zlozka], i) => {
      const posledna = i === zdanitelne.length - 1;
      const d = dph > 0 ? (posledna ? r2(zostava) : r2((dph * z) / zakladSpolu)) : 0;
      zostava = r2(zostava - d);
      polozky.push({ text, zlozka, zaklad: z, dph: d, sadzba: dph > 0 ? sadzba : 0 });
    });
  } else {
    const z = zakladDane(splatka);
    if (z > 0 || dph > 0) {
      polozky.push({ text: "Splátka", zlozka: null, zaklad: Math.max(z, 0), dph, sadzba: dph > 0 ? sadzba : 0 });
    }
  }
  if (poistenie > 0) polozky.push({ text: "Poistenie", zlozka: "poistenie", zaklad: poistenie, dph: 0, sadzba: 0 });

  const sucet = r2(polozky.reduce((a, p) => a + p.zaklad + p.dph, 0));
  const rozdiel = r2(spolu - sucet);
  if (rozdiel >= 0.01) {
    polozky.push({ text: "Ostatné (poplatky)", zlozka: "poplatky", zaklad: rozdiel, dph: 0, sadzba: 0 });
  } else if (rozdiel <= -0.01) {
    vyhrady.push(
      `Splátka č. ${splatka.number}: istina, úrok, poistenie a DPH spolu (${sucet.toFixed(2)}) sú viac než splátka (${spolu.toFixed(2)}) — skontrolujte kalendár.`,
    );
  }
  if (!polozky.length) {
    vyhrady.push(`Splátka č. ${splatka.number} je nulová — do Pohody nepôjde.`);
  }
  return { polozky, vyhrady };
}

function priehradka(sadzba: number, den: string, krajina: KrajinaDane): Priehradka {
  if (!sadzba) return "none";
  const tab = sadzbyKuDnu(krajina, den);
  if (sadzba === tab.high) return "high";
  if (sadzba === tab.low) return "low";
  if (tab.third != null && sadzba === tab.third) return "third";
  return sadzba > tab.low ? "high" : "low";
}

/** Variabilný symbol splátky: zo zmluvy, inak číslice čísla zmluvy. */
export function symbolSplatky(zmluva: ZmluvaPreExport): string {
  const vs = txt(zmluva.variable_symbol).replace(/\D/g, "");
  if (vs) return vs.slice(0, 20);
  return txt(zmluva.contract_number).replace(/\D/g, "").slice(0, 20);
}

const DRUH: Record<string, string> = { leasing: "leasing", uver: "úver", kontokorent: "kontokorent" };

/** Text záväzku v Pohode: „Splátka 5/60 – leasing UZF/26/80613“. */
export function textSplatky(zmluva: ZmluvaPreExport, splatka: SplatkaPreExport, pocet?: number): string {
  const poradie = pocet ? `${splatka.number}/${pocet}` : String(splatka.number);
  const co = [DRUH[zmluva.kind] ?? "", txt(zmluva.contract_number) || txt(zmluva.name)]
    .filter(Boolean)
    .join(" ");
  return skrat(`Splátka ${poradie} – ${co}`, 240);
}

function polozkaXml(p: PolozkaSplatky, kody: KodyZauctovania, den: string, krajina: KrajinaDane, kv: string | null): string {
  const o = "          ";
  return `
        <inv:invoiceItem>${el("inv:text", skrat(p.text, 90), o)}
          <inv:quantity>1</inv:quantity>
          <inv:payVAT>false</inv:payVAT>
          <inv:rateVAT>${priehradka(p.sadzba, den, krajina)}</inv:rateVAT>
          <inv:homeCurrency>${suma("typ:unitPrice", p.zaklad, "            ")}${suma("typ:price", p.zaklad, "            ")}${suma(
            "typ:priceVAT",
            p.dph,
            "            ",
          )}${suma("typ:priceSum", p.zaklad + p.dph, "            ")}
          </inv:homeCurrency>${
            kody.predkontacia ? `\n${o}<inv:accounting><typ:ids>${esc(kody.predkontacia)}</typ:ids></inv:accounting>` : ""
          }${kody.clenenie ? `\n${o}<inv:classificationVAT><typ:ids>${esc(kody.clenenie)}</typ:ids></inv:classificationVAT>` : ""}${
            kv ? `\n${o}<inv:classificationKVDPH><typ:ids>${esc(kv)}</typ:ids></inv:classificationKVDPH>` : ""
          }
        </inv:invoiceItem>`;
}

/** Jeden záväzok (`dataPackItem`) za splátku, bez obálky. */
export function polozkaBalikaSplatky(
  zmluva: ZmluvaPreExport,
  splatka: SplatkaPreExport,
  opts: { krajina?: KrajinaDane; pocetSplatok?: number } = {},
): { xml: string; vyhrady: string[] } {
  const krajina = opts.krajina ?? "SK";
  const { polozky, vyhrady } = polozkySplatky(zmluva, splatka, krajina);
  if (!polozky.length) return { xml: "", vyhrady };
  const kody = ucinneKody(zmluva, splatka);
  // Členenie KV DPH má len slovenská Pohoda; „X“ (nezahŕňať) skratku nemá.
  const kv = krajina === "SK" && kody.kv && kody.kv !== "X" ? kody.kv : null;
  const den = splatka.due_date;
  const vs = symbolSplatky(zmluva);
  const povodne = skrat(
    [txt(zmluva.contract_number) || txt(zmluva.name), String(splatka.number)].join("/"),
    32,
  );
  const o = "        ";
  const kosik = (p: Priehradka) =>
    polozky.filter((x) => priehradka(x.sadzba, den, krajina) === p);
  const zakl = (p: Priehradka) => kosik(p).reduce((a, x) => a + x.zaklad, 0);
  const dan = (p: Priehradka) => kosik(p).reduce((a, x) => a + x.dph, 0);
  const rad = txt(zmluva.pohoda_rad);
  const partner = txt(zmluva.provider_name);

  const xml = `
  <dat:dataPackItem id="${esc(`SPL-${splatka.id}`)}" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>commitment</inv:invoiceType>${
          rad ? `\n${o}<inv:number><typ:ids>${esc(skrat(rad, 10))}</typ:ids></inv:number>` : ""
        }${el("inv:symVar", vs, o)}${el("inv:symPar", vs, o)}${el("inv:originalDocument", povodne, o)}
        <inv:date>${esc(den)}</inv:date>
        <inv:dateTax>${esc(den)}</inv:dateTax>
        <inv:dateAccounting>${esc(den)}</inv:dateAccounting>
        <inv:dateDue>${esc(den)}</inv:dateDue>${
          kody.predkontacia ? `\n${o}<inv:accounting><typ:ids>${esc(kody.predkontacia)}</typ:ids></inv:accounting>` : ""
        }${kody.clenenie ? `\n${o}<inv:classificationVAT><typ:ids>${esc(kody.clenenie)}</typ:ids></inv:classificationVAT>` : ""}${
          kv ? `\n${o}<inv:classificationKVDPH><typ:ids>${esc(kv)}</typ:ids></inv:classificationKVDPH>` : ""
        }${el("inv:text", textSplatky(zmluva, splatka, opts.pocetSplatok), o)}${
          partner
            ? `
        <inv:partnerIdentity>
          <typ:address>${el("typ:company", skrat(partner, 96), "            ")}
          </typ:address>
        </inv:partnerIdentity>`
            : ""
        }
        <inv:paymentType><typ:paymentType>draft</typ:paymentType></inv:paymentType>${el(
          "inv:intNote",
          skrat(`Faktero · ${txt(zmluva.name)} · splátka č. ${splatka.number}`, 240),
          o,
        )}
      </inv:invoiceHeader>
      <inv:invoiceDetail>${polozky
        .map((p) =>
          polozkaXml(
            p,
            kodyPolozky(zmluva, kody, p.zlozka),
            den,
            krajina,
            // KV patrí len položke s daňou; poistenie či poplatok bez DPH v KV nie je.
            kv && (p.dph > 0 || !polozky.some((x) => x.dph > 0)) ? kv : null,
          ),
        )
        .join("")}
      </inv:invoiceDetail>
      <inv:invoiceSummary>
        <inv:roundingDocument>none</inv:roundingDocument>
        <inv:roundingVAT>none</inv:roundingVAT>
        <inv:homeCurrency>${suma("typ:priceNone", zakl("none"), "          ")}${suma("typ:priceLow", zakl("low"), "          ")}${suma(
          "typ:priceLowVAT",
          dan("low"),
          "          ",
        )}${suma("typ:priceHigh", zakl("high"), "          ")}${suma("typ:priceHighVAT", dan("high"), "          ")}${suma(
          "typ:price3",
          zakl("third"),
          "          ",
        )}${suma("typ:price3VAT", dan("third"), "          ")}
          <typ:round><typ:priceRound>0.00</typ:priceRound></typ:round>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>`;
  return { xml, vyhrady };
}

export type VysledokExportuSplatok = {
  xml: string;
  /** Koľko splátok je v balíku. */
  pocet: number;
  /** Id splátok, ktoré naozaj išli do balíka. */
  idSplatok: string[];
  vyhrady: string[];
};

/**
 * Celý balík `dataPack` so splátkami jedného kalendára.
 *
 * Splátky v cudzej mene sa nepošlú — záväzok v cudzej mene chce v Pohode kurz
 * ku dňu splatnosti a ten tu nie je; radšej výhrada než zle prepočítaná suma.
 */
export function xmlSplatokDoPohody(opts: {
  ico?: string | null;
  krajinaFirmy?: string | null;
  zmluva: ZmluvaPreExport;
  splatky: SplatkaPreExport[];
  /** Preklad kódu predkontácie na skratku Pohody (`predkontacieNaSkratky`). */
  prelozPredkontacie?: (xml: string) => string;
}): VysledokExportuSplatok {
  const krajina = krajinaDane(opts.krajinaFirmy);
  const domaca = krajina === "CZ" ? "CZK" : "EUR";
  const mena = txt(opts.zmluva.currency).toUpperCase() || domaca;
  if (mena !== domaca) {
    return {
      xml: "",
      pocet: 0,
      idSplatok: [],
      vyhrady: [
        `Kalendár je v mene ${mena} — záväzky v cudzej mene zatiaľ do Pohody neexportujeme (chýba kurz ku dňu splatnosti).`,
      ],
    };
  }
  const pocetSplatok = opts.zmluva.term_months || undefined;
  const zoradene = [...opts.splatky].sort((a, b) => a.number - b.number);
  const vyhrady: string[] = [];
  const idSplatok: string[] = [];
  let polozky = "";
  for (const s of zoradene) {
    const r = polozkaBalikaSplatky(opts.zmluva, s, { krajina, pocetSplatok });
    vyhrady.push(...r.vyhrady);
    if (!r.xml) continue;
    polozky += r.xml;
    idSplatok.push(s.id);
  }
  const rozuct = opts.zmluva.pohoda_rozuctovanie ?? {};
  const zlozkyBezKodu = ZLOZKY_SPLATKY.filter((z) => !txt(rozuct[z]?.predkontacia));
  if (
    !txt(opts.zmluva.pohoda_predkontacia) &&
    zoradene.some((s) => !txt(s.pohoda_predkontacia)) &&
    zlozkyBezKodu.length
  ) {
    const NAZVY: Record<ZlozkaSplatky, string> = { istina: "istina", urok: "úrok", poistenie: "poistenie", poplatky: "poplatky" };
    vyhrady.push(
      maRozuctovanie(opts.zmluva)
        ? `Bez predkontácie: ${zlozkyBezKodu.map((z) => NAZVY[z]).join(", ")} — tieto položky dostanú v Pohode „Neviem“. Doplňte ich v rozúčtovaní alebo predkontáciu kalendára.`
        : "Kalendár nemá predkontáciu — Pohoda dá záväzkom „Neviem“. Nastavte ju v časti Zaúčtovanie do Pohody.",
    );
  }
  if (!txt(opts.zmluva.pohoda_clenenie_dph) && zoradene.some((s) => !txt(s.pohoda_clenenie_dph))) {
    vyhrady.push("Kalendár nemá členenie DPH — Pohoda doplní predvolené z agendy.");
  }
  if (!polozky) return { xml: "", pocet: 0, idSplatok, vyhrady };
  const telo = opts.prelozPredkontacie ? opts.prelozPredkontacie(polozky) : polozky;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="SPL${Date.now()}" ico="${esc(txt(opts.ico).replace(/\s/g, ""))}" application="Faktero" version="2.0" note="${esc(
    skrat(`Splátky – ${txt(opts.zmluva.name)}`, 200),
  )}"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">${telo}
</dat:dataPack>`;
  return { xml, pocet: idSplatok.length, idSplatok, vyhrady };
}

/** Názov súboru: „splatky-UZF-26-80613-1-12.xml“. */
export function nazovSuboruSplatok(zmluva: ZmluvaPreExport, cisla: number[]): string {
  const zaklad =
    (txt(zmluva.contract_number) || txt(zmluva.name))
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "kalendar";
  const zor = [...cisla].sort((a, b) => a - b);
  const rozsah = zor.length ? (zor.length === 1 ? `${zor[0]}` : `${zor[0]}-${zor[zor.length - 1]}`) : "";
  return `splatky-${zaklad}${rozsah ? `-${rozsah}` : ""}.xml`;
}
