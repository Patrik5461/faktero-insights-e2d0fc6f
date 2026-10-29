import { vsetkoAkoData } from "./strankovanie";
import { sadzbyKrajiny } from "./vat-rates";
import { riadkySoZlavou } from "./zlavy";
import { prepocitajPolozku, sumySamofaktury, zapocitatelna } from "./samofakturacia";
import { rozpisPrijatej } from "./prijate-do-pohody";
/**
 * Doklady za zdaňovacie obdobie pre výkazy k DPH.
 *
 * Zbiera sa tu len to, čo výkazy potrebujú, a prekladá sa to na tvar z
 * `dph-vykazy.ts`. Doklad v cudzej mene sa nezamlčí — do výkazu by vošiel
 * v cudzej sume, čo je horšie než chýbajúci riadok, takže sa vypíše ako výtka.
 */

import {
  hraniceObdobia,
  odvodRezimPrijatej,
  jeCudziaDph,
  riadokZoSum,
  type Obdobie,
  type PrijataFaktura,
  type PrijatyDoklad,
  type SadzbovyRiadok,
  type Vstup,
  type Vytka,
  type VystavenaFaktura,
  odpocitajZdanenuZalohu,
  kvVystavenej,
} from "./dph-vykazy";
import { domacaMena, domacejZaJednotku } from "./kurzy";
import { kvSPredvolenym } from "./kv-clenenie";
import { krajinaDane } from "./vat-rates";

type Klient = {
  from: (t: string) => any;
};

/** Stavy, v ktorých doklad ešte nie je vystavený alebo už je zrušený. */
const NEPLATNE_STAVY = ["draft", "cancelled"];

function riadkyZPoloziek(
  polozky: {
    vat_rate: number | null;
    subtotal?: number | null;
    total?: number | null;
    quantity?: number | null;
    unit_price?: number | null;
  }[],
): SadzbovyRiadok[] {
  const mapa = new Map<number, SadzbovyRiadok>();
  for (const p of polozky) {
    const sadzba = Number(p.vat_rate ?? 0);
    const zaklad =
      p.subtotal != null ? Number(p.subtotal) : Number(p.quantity ?? 0) * Number(p.unit_price ?? 0);
    const dan = (zaklad * sadzba) / 100;
    const s = mapa.get(sadzba) ?? { sadzba, zaklad: 0, dan: 0 };
    s.zaklad += zaklad;
    s.dan += dan;
    mapa.set(sadzba, s);
  }
  return [...mapa.values()].map((s) => ({
    sadzba: s.sadzba,
    zaklad: Math.round(s.zaklad * 100) / 100,
    dan: Math.round(s.dan * 100) / 100,
  }));
}

/** Voľby načítania — dnes ich používa len nemecká UStVA. */
export type MoznostiVstupu = {
  /**
   * Ist-Versteuerung (§ 20 UStG): zdaniteľné riadky vystavených faktúr idú do
   * obdobia podľa prijatých platieb, pomerne pri čiastočnej úhrade. Pozri `ust-ist.ts`.
   */
  ist?: boolean;
  /** Výtka pri platbe na zálohovú faktúru bez dokladu k prijatej platbe (Mindest-Ist). */
  kontrolaZaloh?: boolean;
};

export async function nacitajVstup(
  supabase: Klient,
  companyId: string,
  obdobie: Obdobie,
  moznosti: MoznostiVstupu = {},
): Promise<{ vstup: Vstup; vytky: Vytka[] }> {
  const { od, do: doDna } = hraniceObdobia(obdobie);
  const vytky: Vytka[] = [];

  const [fakturyRes, prijateRes, dokladyRes] = await Promise.all([
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, type, status, issue_date, delivery_date, paid_at, total, currency, customer_ic_dph, customer_dic, customer_name, reverse_charge, reverse_charge_type, eu_plnenie, oss, oss_country, opravuje_fakturu_id, advance_invoice_id, discount_total, subtotal, vat_total, subtotal_eur, vat_total_eur, exchange_rate, oprava_25a, kv_clenenie, invoice_items(vat_rate, subtotal, quantity, unit_price, prenesenie, kv_clenenie)",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id")
        .range(zac, kon),
    ),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("purchase_invoices")
        .select(
          "id, invoice_number, supplier_name, supplier_ic_dph, supplier_dic, issue_date, delivery_date, received_date, currency, dph_rezim, odpocet, opravuje_cislo, amount_without_vat, vat_amount, amount_without_vat_eur, vat_amount_eur, exchange_rate, items, samofakturacia, samofakturacia_stav, discount_total, due_date, povodna_splatnost, status, payment_date, kv_clenenie, pohoda_predkontacia, rozuctovanie, amount_total, vehicle_id",
        )
        .eq("company_id", companyId)
        /*
          Prijatá zálohová faktúra nie je daňový doklad — daň z nej odpočítať
          nemožno, tú prinesie až ostrá faktúra od dodávateľa.
        */
        .eq("type", "regular")
        .is("deleted_at", null)
        .order("id")
        .range(zac, kon),
    ),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("expense_documents")
        .select(
          "id, document_number, supplier_name, supplier_ic_dph, issue_date, currency, status, vat_rate, net_amount, vat_amount, vat_breakdown, odpocet, kv_clenenie, pohoda_predkontacia, category, items, rozuctovanie, total_amount, vehicle_id",
        )
        .eq("company_id", companyId)
        .order("id")
        .range(zac, kon),
    ),
  ]);

  /*
    Účtovanie pomerom (napr. auto 50/50): podiel odpočítateľnej DPH sa berie
    z predkontácie dokladu — vlastnej, podľa kategórie alebo predvolenej.
  */
  const { pomeryPredkontacii, kodyPodlaKategorie } = await import("./predkontacie.server");
  const { riadkyDokladu, podielOdpoctuRiadkov, rozpisBlocku } = await import("./rozuctovanie");
  const [pomery, podlaKat, { data: firmaKody }] = await Promise.all([
    pomeryPredkontacii(supabase, companyId),
    kodyPodlaKategorie(supabase, companyId),
    supabase
      .from("companies")
      .select(
        "pohoda_predkontacia_prijata, pohoda_predkontacia_doklady, country, kv_clenenie_faktura, kv_clenenie_prijata, kv_clenenie_doklady",
      )
      .eq("id", companyId)
      .maybeSingle(),
  ]);
  /*
    Vozidlo s odpočtom DPH 50 % (osobné auto aj na súkromné účely, § 85n
    zákona o DPH): bez výslovného rozúčtovania sa odpočíta len polovica.
  */
  const { odpocetVozidielFirmy } = await import("./vozidlo-odpocet.server");
  const { odpocetDokladu } = await import("./vozidlo-odpocet");
  const vozidla = await odpocetVozidielFirmy(supabase, companyId, pomery);
  // Do výkazu ide domáca mena firmy (SK eurá, CZ koruny); cudzia je všetko ostatné.
  const domaca = domacaMena((firmaKody as any)?.country);
  /*
    Podiel odpočítateľnej DPH dokladu z jeho riadkov zaúčtovania — pomer
    predkontácie v hlavičke aj pri jednotlivých položkách (nafta 50/50 na
    bločku s bagetou), aj ručné rozúčtovanie.
  */
  const podiel = (doklad: any, rozpis: { sadzba: number; zaklad: number; dph: number }[], kod: unknown): number | undefined => {
    const k = String(kod ?? "").trim() || null;
    const r = riadkyDokladu(doklad, rozpis, k, null, pomery, odpocetDokladu(doklad, vozidla));
    const v = podielOdpoctuRiadkov(r);
    return v === 1 ? undefined : v;
  };

  const vDobe = (d: string | null | undefined) => {
    const s = String(d ?? "");
    return s >= od && s <= doDna;
  };

  const cisla = new Map<string, string>();
  for (const f of fakturyRes.data ?? []) cisla.set(f.id, f.invoice_number);

  /*
    Zálohy, ktoré už boli zdanené dokladom k prijatej platbe. Doklad býva z
    iného obdobia než vyúčtovanie, preto sa mapa stavia zo všetkých faktúr
    firmy, nie len z tých v období.
  */
  /*
    Ktoré zálohy si ktorá faktúra odpočítala. Väzba je vo vlastnej tabuľke,
    lebo faktúra ich môže mať viac; starší stĺpec ostáva len pre doklad k
    prijatej platbe.
  */
  const { data: odpoctyRiadky } = await vsetkoAkoData((zac, kon) =>
    supabase
      .from("invoice_advances")
      .select("invoice_id, advance_invoice_id")
      .eq("company_id", companyId)
      .order("id")
      .range(zac, kon),
  );
  const odpoctyFaktury = new Map<string, string[]>();
  for (const r of odpoctyRiadky ?? []) {
    const zoz = odpoctyFaktury.get(r.invoice_id) ?? [];
    zoz.push(r.advance_invoice_id);
    odpoctyFaktury.set(r.invoice_id, zoz);
  }

  /*
    Úhrady vystavených faktúr — len keď ich treba (Ist-Versteuerung, kontrola
    záloh). Načítajú sa všetky, lebo pri Ist rozhoduje aj to, koľko bolo
    zaplatené pred obdobím (preplatok sa nezdaní dvakrát).
  */
  const { platbyFaktury, podielUhradyVObdobi, riadkyPodielom, uhradeneDo } = await import("./ust-ist");
  const platbyPodlaFaktury = new Map<string, { suma: number; datum: string }[]>();
  if (moznosti.ist || moznosti.kontrolaZaloh) {
    const { data: platbyRiadky } = await vsetkoAkoData((zac, kon) =>
      supabase
        .from("payments")
        .select("id, invoice_id, amount, paid_at")
        .eq("company_id", companyId)
        .order("id")
        .range(zac, kon),
    );
    for (const p of (platbyRiadky ?? []) as any[]) {
      if (!p.invoice_id || !p.paid_at) continue;
      const zoz = platbyPodlaFaktury.get(p.invoice_id) ?? [];
      zoz.push({ suma: Number(p.amount ?? 0), datum: String(p.paid_at).slice(0, 10) });
      platbyPodlaFaktury.set(p.invoice_id, zoz);
    }
  }
  const platbyF = (f: any) => platbyFaktury(f, platbyPodlaFaktury.get(f.id) ?? []);
  const fakturaPodlaId = new Map<string, any>();
  for (const f of (fakturyRes.data ?? []) as any[]) fakturaPodlaId.set(f.id, f);

  const zdaneneZalohy = new Map<string, SadzbovyRiadok[]>();
  for (const f of (fakturyRes.data ?? []) as any[]) {
    if (f.type !== "advance_payment" || !f.advance_invoice_id) continue;
    zdaneneZalohy.set(
      f.advance_invoice_id,
      riadkyZPoloziek(riadkySoZlavou(f.invoice_items ?? [], f.discount_total)),
    );
  }

  const vystavene: VystavenaFaktura[] = [];
  for (const f of (fakturyRes.data ?? []) as any[]) {
    /*
      Opravná faktúra (dobropis, ťarchopis) patrí do obdobia, v ktorom bola
      vyhotovená (§ 25 ods. 1) — nie podľa dátumu dodania, ktorý môže niesť
      pôvodné plnenie z už podaného obdobia.
    */
    const opravna = f.type === "credit_note" || f.type === "debit_note" || Boolean(f.opravuje_fakturu_id);
    const den = opravna ? f.issue_date || f.delivery_date : f.delivery_date || f.issue_date;
    if (NEPLATNE_STAVY.includes(String(f.status))) continue;
    /*
      Mindest-Ist-Versteuerung (§ 13 Abs. 1 Nr. 1 Buchst. a S. 4 UStG): daň
      zo zálohy vzniká jej prijatím. Nesie ju doklad k prijatej platbe; keď
      na zálohovú faktúru prišli peniaze a doklad chýba, vo výkaze by daň chýbala.
    */
    if (moznosti.kontrolaZaloh && f.type === "proforma" && !zdaneneZalohy.has(f.id)) {
      if (platbyF(f).some((p) => vDobe(p.datum)))
        vytky.push({
          doklad: String(f.invoice_number),
          text: "Na zálohovú faktúru prišla v období platba, ale doklad k prijatej platbe k nej nie je. Daň zo zálohy vzniká už jej prijatím (§ 13 Abs. 1 Nr. 1 Buchst. a Satz 4 UStG) — vystavte doklad k prijatej platbe, inak v prehľade chýba.",
        });
      continue;
    }
    // Ist: ostrá faktúra a ťarchopis sa zdania podľa úhrad, nie podľa dodania.
    const podlaUhrad =
      Boolean(moznosti.ist) && (f.type === "regular" || f.type === "debit_note") && !f.oss;
    const soll = vDobe(den);
    if (!soll && !podlaUhrad) continue;
    // Mimo obdobia dodania a bez úhrady v období — pri Ist sem nepatrí.
    if (!soll && !platbyF(f).some((p) => vDobe(p.datum))) continue;
    /*
      Ist a opravná faktúra: keď pôvodná ešte nebola celá zaplatená, zníženie
      sa prejaví samo — zdaňuje sa len to, čo odberateľ naozaj zaplatí. Do
      výkazu ide len oprava už zaplatenej faktúry (vrátenie peňazí).
    */
    if (moznosti.ist && soll && f.type === "credit_note" && f.opravuje_fakturu_id) {
      const povodna = fakturaPodlaId.get(f.opravuje_fakturu_id);
      if (povodna) {
        const zaplatene = uhradeneDo(platbyF(povodna), String(f.issue_date || den));
        const suma = Number(povodna.total ?? 0);
        if (zaplatene < suma - 0.01) {
          if (zaplatene > 0.01)
            vytky.push({
              doklad: String(f.invoice_number),
              text: "Rechnungskorrektur k čiastočne zaplatenej faktúre pri Ist-Versteuerung — do prehľadu nevošla (zníženie sa prejaví na ďalších úhradách). Ak ste časť peňazí vracali, doplňte opravu ručne.",
            });
          continue;
        }
      }
    }
    /*
      Do výkazu patrí domáca mena. Keď je faktúra v cudzej mene, berú sa prepočítané
      sumy (SK kurz ECB zo dňa pred dodaním, CZ kurz ČNB) a riadky po sadzbách sa prepočítajú
      rovnakým pomerom — chýbajúci prepočet sa ozve, nezamlčí.
    */
    const cudzia = Boolean(f.currency && f.currency !== domaca);
    /*
      Zľava na doklad znižuje základ dane, ale v položkách nie je — do výkazu
      by inak išla vyššia daň, než faktúra pýta.
    */
    /*
      Zmiešaná faktúra: položky v prenesení daňovej povinnosti (bez celofaktúrového
      prenesenia) idú do výkazu ako samostatné plnenie v prenesení — v SK do KV
      A.2, v CZ do A.1 a ř. 25. Zľava na doklad sa rozdelí pomerom základov.
    */
    const vsetkyPolozky = (f.invoice_items ?? []) as any[];
    /*
      Členenie KV vystavenej faktúry (len SK — KV je slovenský výkaz): ručné na
      faktúre, inak predvolené firmy pri bežnej tuzemskej faktúre, inak
      automaticky (null). Rovnako ako v exporte do Pohody.
    */
    const slovenska = krajinaDane((firmaKody as any)?.country) === "SK";
    const kvHlavne: string | null =
      kvVystavenej(f.kv_clenenie) ??
      (f.type === "regular" && !f.reverse_charge && !opravna
        ? kvVystavenej(kvSPredvolenym(null, "faktura", (firmaKody as any)?.kv_clenenie_faktura, slovenska))
        : null);
    // Čo by faktúra dostala automaticky — položka s rovnakým kódom sa neoddeľuje.
    const kvAuto = opravna
      ? "C1"
      : f.reverse_charge
        ? f.reverse_charge_type === "domestic_69"
          ? "A2"
          : null
        : "A1";
    const jePdpPolozka = (x: any) => !f.reverse_charge && Boolean(x.prenesenie);
    /*
      Položka s vlastným členením KV, ktoré sa líši od hlavičky (prenesená
      položka od A.2), ide do výkazu ako samostatný záznam s týmto členením.
    */
    const kvPolozky = (x: any): string | null => {
      const k = slovenska ? kvVystavenej(x.kv_clenenie) : null;
      if (!k) return null;
      if (jePdpPolozka(x)) return k === "A2" ? null : k;
      return k === (kvHlavne ?? kvAuto) ? null : k;
    };
    const pdpPolozky = vsetkyPolozky.filter((x) => jePdpPolozka(x) && !kvPolozky(x));
    const vlastneKv = new Map<string, { pdp: boolean; kv: string; polozky: any[] }>();
    for (const x of vsetkyPolozky) {
      const k = kvPolozky(x);
      if (!k) continue;
      const kluc = `${jePdpPolozka(x) ? "pdp" : "bez"}:${k}`;
      const g = vlastneKv.get(kluc) ?? { pdp: jePdpPolozka(x), kv: k, polozky: [] };
      g.polozky.push(x);
      vlastneKv.set(kluc, g);
    }
    const hlavnePolozky = vsetkyPolozky.filter((x) => !jePdpPolozka(x) && !kvPolozky(x));
    const zakladPoloziek = (xs: any[]) =>
      xs.reduce((a, x) => a + (x.subtotal != null ? Number(x.subtotal) : Number(x.quantity ?? 0) * Number(x.unit_price ?? 0)), 0);
    const zlavaSpolu = Number(f.discount_total ?? 0);
    const zakladVsetko = zakladPoloziek(vsetkyPolozky);
    const zlavaCasti = (xs: any[]) =>
      zakladVsetko && xs.length ? (zlavaSpolu * zakladPoloziek(xs)) / zakladVsetko : 0;
    const zlavaPdp = zlavaCasti(pdpPolozky);
    const zlavyVlastne = [...vlastneKv.values()].map((g) => zlavaCasti(g.polozky));
    const zlavaVlastneSpolu = zlavyVlastne.reduce((a, z) => a + z, 0);
    const oddelene = pdpPolozky.length > 0 || vlastneKv.size > 0;
    const vDomacej = (riadkyX: SadzbovyRiadok[]): SadzbovyRiadok[] => {
      if (!cudzia) return riadkyX;
      // Kurz je v zápise banky krajiny firmy (SK ECB, CZ ČNB).
      const zaJednu = domacejZaJednotku(f.exchange_rate, (firmaKody as any)?.country);
      if (!(zaJednu > 0)) return riadkyX;
      return riadkyX.map((r) => ({
        sadzba: r.sadzba,
        zaklad: Math.round(r.zaklad * zaJednu * 100) / 100,
        dan: Math.round(r.dan * zaJednu * 100) / 100,
      }));
    };
    let riadky = vDomacej(
      riadkyZPoloziek(
        riadkySoZlavou(
          oddelene ? hlavnePolozky : vsetkyPolozky,
          oddelene ? zlavaSpolu - zlavaPdp - zlavaVlastneSpolu : f.discount_total,
        ),
      ),
    );
    const riadkyPdp = pdpPolozky.length ? vDomacej(riadkyZPoloziek(riadkySoZlavou(pdpPolozky, zlavaPdp))) : [];
    const riadkyVlastne = [...vlastneKv.values()].map((g, i) => ({
      ...g,
      riadky: vDomacej(riadkyZPoloziek(riadkySoZlavou(g.polozky, zlavyVlastne[i]))),
    }));
    if (cudzia && !(domacejZaJednotku(f.exchange_rate, (firmaKody as any)?.country) > 0)) {
      vytky.push({
        doklad: f.invoice_number,
        text: `Faktúra je v mene ${f.currency} a chýba jej prepočet kurzom. Otvorte ju a uložte znova, alebo sumu do výkazu opravte ručne.`,
      });
    }
    /*
      Vyúčtovanie zálohy, z ktorej sa už daň priznala: do výkazu ide len
      rozdiel, inak by tá istá daň prešla dvakrát.
    */
    if (f.type === "regular") {
      for (const idZalohy of odpoctyFaktury.get(f.id) ?? []) {
        const zaloha = zdaneneZalohy.get(idZalohy);
        if (zaloha?.length) riadky = odpocitajZdanenuZalohu(riadky, zaloha);
      }
    }

    const zaznam = (r: SadzbovyRiadok[]): VystavenaFaktura => ({
      cislo: String(f.invoice_number),
      typ: String(f.type),
      datumDodania: String(den),
      odberatelIcDph: f.customer_ic_dph,
      odberatelDic: f.customer_dic,
      odberatelNazov: f.customer_name,
      prenosDane: Boolean(f.reverse_charge),
      prenosTyp: f.reverse_charge_type,
      euPlnenie: f.eu_plnenie,
      oss: Boolean(f.oss),
      ossStat: f.oss_country,
      opravujeCislo: f.opravuje_fakturu_id ? (cisla.get(f.opravuje_fakturu_id) ?? null) : null,
      oprava25a: Boolean(f.oprava_25a),
      riadky: r,
      kv: kvHlavne,
    });
    if (podlaUhrad) {
      /*
        Ist (§ 20 UStG): riadky s daňou idú do obdobia podľa úhrad, pomerom
        zaplatenej hrubej sumy (platba je v mene faktúry, prepočíta sa rovnakým
        kurzom ako riadky). Prenesenie a nulové riadky ostávajú podľa dodania.
      */
      const zaJednu = cudzia ? domacejZaJednotku(f.exchange_rate, (firmaKody as any)?.country) : 1;
      const hruba = [...riadky, ...riadkyPdp].reduce((a, r) => a + r.zaklad + r.dan, 0);
      const podielObdobia = podielUhradyVObdobi(
        platbyF(f).map((p) => ({ suma: p.suma * (zaJednu > 0 ? zaJednu : 1), datum: p.datum })),
        Math.round(hruba * 100) / 100,
        od,
        doDna,
      );
      const sDanou = f.reverse_charge ? [] : riadky.filter((r) => Number(r.sadzba) > 0);
      const bezDane = f.reverse_charge ? riadky : riadky.filter((r) => !(Number(r.sadzba) > 0));
      if (soll && bezDane.length) vystavene.push(zaznam(bezDane));
      if (podielObdobia > 0 && sDanou.length) vystavene.push(zaznam(riadkyPodielom(sDanou, podielObdobia)));
      if (!soll) continue;
    } else {
      vystavene.push(zaznam(riadky));
    }
    if (riadkyPdp.length) {
      vystavene.push({
        cislo: String(f.invoice_number),
        typ: String(f.type),
        datumDodania: String(den),
        odberatelIcDph: f.customer_ic_dph,
        odberatelDic: f.customer_dic,
        odberatelNazov: f.customer_name,
        prenosDane: true,
        prenosTyp: "domestic_69",
        opravujeCislo: f.opravuje_fakturu_id ? (cisla.get(f.opravuje_fakturu_id) ?? null) : null,
        riadky: riadkyPdp,
      });
    }
    // Položky s vlastným členením KV — priznanie ich vidí rovnako ako doteraz, KV podľa ich kódu.
    for (const g of riadkyVlastne) {
      if (!g.riadky.length) continue;
      vystavene.push(
        g.pdp
          ? {
              ...zaznam(g.riadky),
              prenosDane: true,
              prenosTyp: "domestic_69",
              euPlnenie: null,
              oss: false,
              ossStat: null,
              kv: g.kv,
            }
          : { ...zaznam(g.riadky), kv: g.kv },
      );
    }
  }

  const prijate: PrijataFaktura[] = [];
  for (const p of (prijateRes.data ?? []) as any[]) {
    /*
      Prijatý dobropis: odpočet sa opraví v období, v ktorom ho firma dostala
      (§ 53 ods. 2) — dátum prijatia, inak vyhotovenia.
    */
    const dobropisP = Boolean(p.opravuje_cislo) || Number(p.amount_total ?? 0) < 0;
    const den = dobropisP
      ? p.received_date || p.issue_date || p.delivery_date
      : p.delivery_date || p.issue_date;
    if (!vDobe(den)) continue;
    /*
      Samofaktúra je daňový doklad až po odsúhlasení dodávateľom. Dovtedy sa
      z nej daň odpočítať nedá — pripomenie sa, aby sa na ňu nezabudlo.
    */
    if (!zapocitatelna(p)) {
      vytky.push({
        doklad: p.invoice_number ?? p.supplier_name ?? "samofaktúra",
        text: "Samofaktúra ešte nie je odsúhlasená dodávateľom — do výkazu sa započíta až po odsúhlasení.",
      });
      continue;
    }
    const cudziaP = Boolean(p.currency && p.currency !== domaca);
    const maPrepocet = p.vat_amount_eur != null || p.amount_without_vat_eur != null;
    if (cudziaP && !maPrepocet) {
      vytky.push({
        doklad: p.invoice_number ?? p.supplier_name ?? "prijatá faktúra",
        text: `Prijatá faktúra je v mene ${p.currency} a chýba jej prepočet kurzom ECB — do výkazu patria eurá.`,
      });
    }
    const dan = cudziaP && maPrepocet ? Number(p.vat_amount_eur ?? 0) : Number(p.vat_amount ?? 0);
    const zaklad =
      cudziaP && maPrepocet
        ? Number(p.amount_without_vat_eur ?? 0)
        : Number(p.amount_without_vat ?? 0);
    /*
      Zmiešaná faktúra (časť položiek v prenesení daňovej povinnosti, § 69
      ods. 12 — napr. roxor): prenesená časť sa samozdaní základnou sadzbou
      (r. 09/10, odpočet r. 19, KV B.1), zvyšok ide ako tuzemský nákup.
    */
    const rozpisP = cudziaP ? [] : rozpisPrijatej(p);
    const prenesene = rozpisP.filter((x) => x.pdp);
    if (prenesene.length && !p.opravuje_cislo) {
      const zakladna = sadzbyKrajiny(krajinaDane((firmaKody as any)?.country), String(den))[0] ?? 23;
      prijate.push({
        cislo: String(p.invoice_number ?? ""),
        dodavatelNazov: p.supplier_name,
        dodavatelIcDph: p.supplier_ic_dph,
        dodavatelDic: p.supplier_dic,
        datumDodania: String(den),
        rezim: "samozdanenie",
        odpocet: p.odpocet !== false,
        opravujeCislo: null,
        riadky: prenesene.map((x) => {
          const s = Number(x.sadzba) > 0 ? Number(x.sadzba) : zakladna;
          return { sadzba: s, zaklad: x.zaklad, dan: Math.round(x.zaklad * s) / 100 };
        }),
        // „Nezahŕňať" (X) si človek zvolil vedome; inak prenesenie patrí do B.1.
        kv: p.kv_clenenie === "X" ? "X" : "B1",
      });
    }
    const tuzemske = prenesene.length ? rozpisP.filter((x) => !x.pdp) : null;
    const domaciKod = String(krajinaDane((firmaKody as any)?.country));
    const rezimP =
      (p.dph_rezim as PrijataFaktura["rezim"]) ?? odvodRezimPrijatej(p.supplier_ic_dph, dan, domaciKod);
    if (!p.dph_rezim && jeCudziaDph(p.supplier_ic_dph, dan, domaciKod)) {
      vytky.push({
        doklad: p.invoice_number ?? p.supplier_name ?? "prijatá faktúra",
        text: `Faktúra od ${p.supplier_ic_dph} je s DPH iného štátu — do priznania nepatrí (vracia sa cez portál toho štátu). Ak ide o prenesenie, nastavte to na faktúre.`,
      });
    }
    // Celá prenesená faktúra už ide vyššie; druhý, prázdny záznam by KV zdvojil.
    if (tuzemske && !tuzemske.length) continue;
    prijate.push({
      cislo: String(p.invoice_number ?? ""),
      dodavatelNazov: p.supplier_name,
      dodavatelIcDph: p.supplier_ic_dph,
      dodavatelDic: p.supplier_dic,
      datumDodania: String(den),
      rezim: rezimP,
      odpocet: p.odpocet !== false,
      opravujeCislo: p.opravuje_cislo,
      riadky: tuzemske
        ? tuzemske.map((x) => ({ sadzba: x.sadzba, zaklad: x.zaklad, dan: x.dph }))
        : rezimP === "samozdanenie" && !dan && zaklad
          ? // Faktúra v prenesení nesie nulovú daň; odberateľ ju samozdaní základnou sadzbou.
            (() => {
              const sz = sadzbyKrajiny(krajinaDane((firmaKody as any)?.country), String(den))[0] ?? 23;
              return [{ sadzba: sz, zaklad, dan: Math.round(zaklad * sz) / 100 }];
            })()
          : riadkyPrijatej(p, zaklad, dan, den, cudziaP),
      // Predvolené KV firmy len pre bežnú tuzemskú faktúru (nie prenesenie ani opravnú).
      kv:
        p.kv_clenenie ||
        kvSPredvolenym(
          rezimP === "samozdanenie" || rezimP === "nadobudnutie" || p.opravuje_cislo ? null : "B2",
          "prijata",
          (firmaKody as any)?.kv_clenenie_prijata,
        ),
      podielOdpoctu: podiel(
        p,
        rozpisPrijatej(p).map((x) => ({ sadzba: x.sadzba, zaklad: Math.abs(x.zaklad), dph: Math.abs(x.dph) })),
        p.pohoda_predkontacia || firmaKody?.pohoda_predkontacia_prijata,
      ),
    });
    if (!p.invoice_number) {
      vytky.push({
        doklad: p.supplier_name ?? "prijatá faktúra",
        text: "Prijatá faktúra nemá číslo — kontrolný výkaz ho vyžaduje.",
      });
    }
  }

  const doklady: PrijatyDoklad[] = [];
  let nespracovanych = 0;
  for (const d of (dokladyRes.data ?? []) as any[]) {
    if (!vDobe(d.issue_date)) continue;
    const dan = Number(d.vat_amount ?? 0);
    if (dan === 0) continue;
    /*
      Nespracovaný doklad ešte nikto neskontroloval (sumy sú z čítania) — do
      odpočtu ide až po kontrole, rovnako ako do Pohody.
    */
    if (d.status === "new") {
      nespracovanych++;
      continue;
    }
    // Bloček nemá uložený prepočet na eurá; v cudzej mene by do výkazu išiel koruna za euro.
    if (d.currency && String(d.currency).toUpperCase() !== domaca) {
      vytky.push({
        doklad: d.document_number || d.supplier_name || "doklad",
        text: `Doklad je v mene ${d.currency} — do výkazu patrí ${domaca}. Odpočet z neho doplňte ručne prepočítaný kurzom.`,
      });
      continue;
    }
    const rozpis = Array.isArray(d.vat_breakdown) ? d.vat_breakdown : null;
    const riadky: SadzbovyRiadok[] = rozpis?.length
      ? rozpis.map((r: any) =>
          // Rozpis z bločku nesie daň v `dph` — predtým sa čítalo len `vat`
          // a `dan`, takže bloček s rozpisom išiel do odpočtu s nulovou daňou.
          riadokZoSum(
            Number(r.base ?? r.zaklad ?? 0),
            Number(r.dph ?? r.vat ?? r.dan ?? 0),
            d.issue_date,
          ),
        )
      : [riadokZoSum(Number(d.net_amount ?? 0), dan, d.issue_date)];
    doklady.push({
      dodavatelNazov: d.supplier_name,
      dodavatelIcDph: d.supplier_ic_dph,
      odpocet: d.odpocet !== false,
      riadky,
      kv: d.kv_clenenie || kvSPredvolenym("B3", "doklady", (firmaKody as any)?.kv_clenenie_doklady),
      cislo: d.document_number,
      datum: d.issue_date,
      podielOdpoctu: podiel(
        d,
        rozpisBlocku(d),
        d.pohoda_predkontacia ||
          podlaKat[String(d.category ?? "")]?.predkontacia ||
          firmaKody?.pohoda_predkontacia_doklady ||
          firmaKody?.pohoda_predkontacia_prijata,
      ),
    });
  }

  if (nespracovanych) {
    vytky.push({
      doklad: "Bločky",
      text: `${nespracovanych} ${nespracovanych === 1 ? "doklad ešte nie je skontrolovaný" : nespracovanych < 5 ? "doklady ešte nie sú skontrolované" : "dokladov ešte nie je skontrolovaných"} — do odpočtu vojdú až po spracovaní.`,
    });
  }

  /*
    § 53b — povinná oprava odpočtu z prijatých faktúr nezaplatených ani na
    101. deň po splatnosti (a opätovný odpočet po neskoršej úhrade). Prechádzajú
    sa všetky prijaté faktúry, nie len tie s dodaním v období: oprava patrí do
    obdobia 101. dňa alebo úhrady.
  */
  const { data: firmaDph } = await supabase
    .from("companies")
    .select("dan_z_prijatej_platby")
    .eq("id", companyId)
    .maybeSingle();
  const { opravy53b } = await import("./dph-nezaplatene");
  const naKontrolu = ((prijateRes.data ?? []) as any[])
    // Lehota sa počíta od pôvodnej splatnosti — predĺženie dohodou ju neposúva.
    .filter((p) => zapocitatelna(p) && (p.povodna_splatnost || p.due_date))
    .map((p) => {
      const den = p.delivery_date || p.issue_date;
      const cudziaP = Boolean(p.currency && p.currency !== domaca);
      const maPrepocet = p.vat_amount_eur != null || p.amount_without_vat_eur != null;
      const dan = cudziaP && maPrepocet ? Number(p.vat_amount_eur ?? 0) : Number(p.vat_amount ?? 0);
      const zaklad =
        cudziaP && maPrepocet ? Number(p.amount_without_vat_eur ?? 0) : Number(p.amount_without_vat ?? 0);
      return {
        cislo: String(p.invoice_number ?? ""),
        dodavatelIcDph: p.supplier_ic_dph,
        rezim: ((p.dph_rezim as PrijataFaktura["rezim"]) ??
          odvodRezimPrijatej(p.supplier_ic_dph, dan, String(krajinaDane((firmaKody as any)?.country)))) as PrijataFaktura["rezim"],
        odpocet: p.odpocet !== false,
        dobropis: Boolean(p.opravuje_cislo) || zaklad < 0,
        splatnost: String(p.povodna_splatnost || p.due_date),
        zaplatenaDna: p.payment_date ? String(p.payment_date).slice(0, 10) : null,
        zaplatena: p.status === "paid",
        riadky: riadkyPrijatej(p, zaklad, dan, den, cudziaP),
      };
    });
  const opravy = opravy53b(naKontrolu, od, doDna, Boolean((firmaDph as any)?.dan_z_prijatej_platby));
  for (const o of opravy) {
    if (!o.dodavatelIcDph) {
      vytky.push({
        doklad: o.cislo,
        text: "Oprava odpočtu podľa § 53b: prijatá faktúra nemá IČ DPH dodávateľa — časť C.2 ho vyžaduje.",
      });
    }
  }

  return { vstup: { obdobie, vystavene, prijate, doklady, opravy53b: opravy }, vytky };
}

/**
 * Samofaktúru sme písali my, takže jej položky so sadzbami poznáme presne —
 * rozpíše sa po sadzbách. Ostatné prijaté faktúry majú len súčty, sadzba sa
 * z nich odhaduje.
 */
function riadkyPrijatej(
  p: any,
  zaklad: number,
  dan: number,
  den: string,
  cudziaMena: boolean,
): SadzbovyRiadok[] {
  if (p.samofakturacia && !cudziaMena && Array.isArray(p.items) && p.items.length) {
    const sadzby = sumySamofaktury(
      p.items.map((x: any) => prepocitajPolozku(x, Number(x.vat_rate) > 0)),
      Number(p.discount_total ?? 0),
    ).sadzby;
    if (sadzby.length > 1) {
      return sadzby.map((x) => ({ sadzba: x.sadzba, zaklad: x.zaklad, dan: x.dan }));
    }
  }
  /*
    Faktúra s položkami vo viacerých sadzbách (materiál 23 % + kniha 5 %):
    keď položky sedia so súčtami, rozpíše sa po nich. Zo súčtov by vyšla jedna
    „priemerná" sadzba (20,65 % → 19 alebo 23 %) a zlé riadky priznania aj KV.
  */
  if (!cudziaMena) {
    const rozpis = rozpisPrijatej(p).filter((x: any) => !x.pdp);
    if (rozpis.length > 1) {
      return rozpis.map((x: any) => ({ sadzba: Number(x.sadzba) || 0, zaklad: x.zaklad, dan: x.dph }));
    }
  }
  return [riadokZoSum(zaklad, dan, den)];
}
