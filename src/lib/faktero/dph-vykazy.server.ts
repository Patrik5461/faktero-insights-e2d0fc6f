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
  riadokZoSum,
  type Obdobie,
  type PrijataFaktura,
  type PrijatyDoklad,
  type SadzbovyRiadok,
  type Vstup,
  type Vytka,
  type VystavenaFaktura,
  odpocitajZdanenuZalohu,
} from "./dph-vykazy";

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

export async function nacitajVstup(
  supabase: Klient,
  companyId: string,
  obdobie: Obdobie,
): Promise<{ vstup: Vstup; vytky: Vytka[] }> {
  const { od, do: doDna } = hraniceObdobia(obdobie);
  const vytky: Vytka[] = [];

  const [fakturyRes, prijateRes, dokladyRes] = await Promise.all([
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, type, status, issue_date, delivery_date, currency, customer_ic_dph, customer_name, reverse_charge, reverse_charge_type, eu_plnenie, oss, oss_country, opravuje_fakturu_id, advance_invoice_id, discount_total, subtotal, vat_total, subtotal_eur, vat_total_eur, exchange_rate, oprava_25a, invoice_items(vat_rate, subtotal, quantity, unit_price)",
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
          "id, invoice_number, supplier_name, supplier_ic_dph, supplier_dic, issue_date, delivery_date, received_date, currency, dph_rezim, odpocet, opravuje_cislo, amount_without_vat, vat_amount, amount_without_vat_eur, vat_amount_eur, exchange_rate, items, samofakturacia, samofakturacia_stav, discount_total, due_date, povodna_splatnost, status, payment_date, kv_clenenie, pohoda_predkontacia, rozuctovanie, amount_total",
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
          "id, document_number, supplier_name, supplier_ic_dph, issue_date, currency, status, vat_rate, net_amount, vat_amount, vat_breakdown, odpocet, kv_clenenie, pohoda_predkontacia, category, items, rozuctovanie, total_amount",
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
      .select("pohoda_predkontacia_prijata, pohoda_predkontacia_doklady")
      .eq("id", companyId)
      .maybeSingle(),
  ]);
  /*
    Podiel odpočítateľnej DPH dokladu z jeho riadkov zaúčtovania — pomer
    predkontácie v hlavičke aj pri jednotlivých položkách (nafta 50/50 na
    bločku s bagetou), aj ručné rozúčtovanie.
  */
  const podiel = (doklad: any, rozpis: { sadzba: number; zaklad: number; dph: number }[], kod: unknown): number | undefined => {
    const k = String(kod ?? "").trim() || null;
    const r = riadkyDokladu(doklad, rozpis, k, null, pomery);
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
    if (!vDobe(den)) continue;
    if (NEPLATNE_STAVY.includes(String(f.status))) continue;
    /*
      Do výkazu patria eurá. Keď je faktúra v cudzej mene, berú sa prepočítané
      sumy (kurz ECB zo dňa pred dodaním) a riadky po sadzbách sa prepočítajú
      rovnakým pomerom — chýbajúci prepočet sa ozve, nezamlčí.
    */
    const cudzia = Boolean(f.currency && f.currency !== "EUR");
    /*
      Zľava na doklad znižuje základ dane, ale v položkách nie je — do výkazu
      by inak išla vyššia daň, než faktúra pýta.
    */
    let riadky = riadkyZPoloziek(riadkySoZlavou(f.invoice_items ?? [], f.discount_total));
    if (cudzia) {
      const kurz = Number(f.exchange_rate ?? 0);
      if (kurz > 0) {
        riadky = riadky.map((r) => ({
          sadzba: r.sadzba,
          zaklad: Math.round((r.zaklad / kurz) * 100) / 100,
          dan: Math.round((r.dan / kurz) * 100) / 100,
        }));
      } else {
        vytky.push({
          doklad: f.invoice_number,
          text: `Faktúra je v mene ${f.currency} a chýba jej prepočet kurzom ECB. Otvorte ju a uložte znova, alebo sumu do výkazu opravte ručne.`,
        });
      }
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

    vystavene.push({
      cislo: String(f.invoice_number),
      typ: String(f.type),
      datumDodania: String(den),
      odberatelIcDph: f.customer_ic_dph,
      odberatelNazov: f.customer_name,
      prenosDane: Boolean(f.reverse_charge),
      prenosTyp: f.reverse_charge_type,
      euPlnenie: f.eu_plnenie,
      oss: Boolean(f.oss),
      ossStat: f.oss_country,
      opravujeCislo: f.opravuje_fakturu_id ? (cisla.get(f.opravuje_fakturu_id) ?? null) : null,
      oprava25a: Boolean(f.oprava_25a),
      riadky,
    });
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
    const cudziaP = Boolean(p.currency && p.currency !== "EUR");
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
      const zakladna = sadzbyKrajiny("SK", String(den))[0] ?? 23;
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
    const rezimP = (p.dph_rezim as PrijataFaktura["rezim"]) ?? odvodRezimPrijatej(p.supplier_ic_dph, dan);
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
              const sz = sadzbyKrajiny("SK", String(den))[0] ?? 23;
              return [{ sadzba: sz, zaklad, dan: Math.round(zaklad * sz) / 100 }];
            })()
          : riadkyPrijatej(p, zaklad, dan, den, cudziaP),
      kv: p.kv_clenenie,
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
    if (d.currency && String(d.currency).toUpperCase() !== "EUR") {
      vytky.push({
        doklad: d.document_number || d.supplier_name || "doklad",
        text: `Doklad je v mene ${d.currency} — do výkazu patria eurá. Odpočet z neho doplňte ručne prepočítaný kurzom.`,
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
      kv: d.kv_clenenie,
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
      const cudziaP = Boolean(p.currency && p.currency !== "EUR");
      const maPrepocet = p.vat_amount_eur != null || p.amount_without_vat_eur != null;
      const dan = cudziaP && maPrepocet ? Number(p.vat_amount_eur ?? 0) : Number(p.vat_amount ?? 0);
      const zaklad =
        cudziaP && maPrepocet ? Number(p.amount_without_vat_eur ?? 0) : Number(p.amount_without_vat ?? 0);
      return {
        cislo: String(p.invoice_number ?? ""),
        dodavatelIcDph: p.supplier_ic_dph,
        rezim: ((p.dph_rezim as PrijataFaktura["rezim"]) ?? odvodRezimPrijatej(p.supplier_ic_dph, dan)) as PrijataFaktura["rezim"],
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
