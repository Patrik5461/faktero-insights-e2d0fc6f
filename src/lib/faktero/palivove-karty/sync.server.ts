/*
  Synchronizácia palivových kariet: transakcie → evidencia, tankovania,
  prijaté faktúry. Spúšťa ju človek („Synchronizovať teraz“) aj nočný hook.

  Beh má časový strop (`casDo`) — nginx dlhé volania po 30 s preruší a pg_net
  hook po 5 s nečaká. Transakcie sa preto berú po mesačných oknách a
  `transakcie_do` sa posúva po každom okne; ďalší beh pokračuje tam, kde
  predošlý skončil.

  Server-only. Píše servisným kľúčom — volajúci musí mať prístup overený
  (`overPristup`) alebo ísť z cronu s tokenom.
*/
import { decryptSecret } from "../payment-crypto.server";
import { dnesBratislava } from "../datum-vystavenia";
import { nacitajAdapter } from "./adaptery.server";
import {
  duplicitneBlocky,
  existujuceTankovanie,
  prijataZFaktury,
  tankovanieZTransakcie,
  vozidloPodlaSpz,
  vozidloTransakcie,
  type TransakciaNaFakturu,
  type VazbaKarty,
  type Vozidlo,
} from "./spracovanie";
import { KartaChyba, type KartaAdapter, type KartaFaktura, type KartaTransakcia } from "./typy";

type Admin = any;

const DEN = 86_400_000;
const OKNO_DNI = 31;
const PRVE_STIAHNUTIE_DNI = 90;
const PREKRYTIE_DNI = 3;
const DAVKA = 200;

export type VysledokSync = {
  stav: "ok" | "chyba" | "limit" | "ciastocne" | "preskocene";
  sprava: string;
  transakcie: number;
  tankovania: number;
  faktury: number;
  blocky: number;
};

type Kontext = {
  admin: Admin;
  pripojenie: any;
  companyId: string;
  poskytovatel: string;
  zdroj: string;
  vozidla: Vozidlo[];
  vazby: Map<string, VazbaKarty & { id?: string }>;
  pocty: { transakcie: number; tankovania: number; faktury: number; blocky: number };
};

async function getAdmin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function log(
  admin: Admin,
  p: any,
  druh: string,
  stav: string,
  sprava: string,
  detail?: unknown,
) {
  await admin.from("palivove_karty_logy").insert({
    company_id: p.company_id,
    pripojenie_id: p.id,
    druh,
    stav,
    sprava: sprava.slice(0, 1000),
    detail: detail ?? null,
  });
}

/** Prihlasovacie údaje pripojenia (rozšifrované) — len pre adaptér, nikdy von. */
export function prihlaseniePripojenia(p: any): Record<string, string> {
  const verejne = (p.prihlasenie_verejne ?? {}) as Record<string, unknown>;
  const tajne = JSON.parse(decryptSecret(p.prihlasenie_sifrovane)) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(verejne)) if (typeof v === "string") out[k] = v;
  return { ...out, ...tajne };
}

/* ---------------------------------------------------------- transakcie */

async function zabezpecVazby(k: Kontext, tx: KartaTransakcia[]) {
  const nove = new Map<string, KartaTransakcia>();
  for (const t of tx)
    if (t.karta && !k.vazby.has(t.karta) && !nove.has(t.karta)) nove.set(t.karta, t);
  // Existujúca automatická väzba bez vozidla: ŠPZ mohla medzičasom pribudnúť vo vozidlách.
  for (const v of k.vazby.values()) {
    if (v.vehicle_id || v.rucne || !v.id) continue;
    const t = tx.find((x) => x.karta === v.karta && x.spz);
    const vid = t ? vozidloPodlaSpz(t.spz, k.vozidla) : null;
    if (vid) {
      await k.admin
        .from("palivove_karty_vazby")
        .update({ vehicle_id: vid, spz: t!.spz })
        .eq("id", v.id);
      v.vehicle_id = vid;
    }
  }
  if (!nove.size) return;
  const riadky = [...nove.values()].map((t) => ({
    company_id: k.companyId,
    pripojenie_id: k.pripojenie.id,
    karta: t.karta,
    spz: t.spz,
    vodic: t.vodic,
    vehicle_id: vozidloPodlaSpz(t.spz, k.vozidla),
  }));
  const { data, error } = await k.admin
    .from("palivove_karty_vazby")
    .upsert(riadky, { onConflict: "pripojenie_id,karta", ignoreDuplicates: true })
    .select("id, karta, vehicle_id, rucne");
  if (error) throw new Error(`Karty sa nepodarilo uložiť: ${error.message}`);
  for (const v of data ?? []) k.vazby.set(v.karta, v);
  for (const r of riadky)
    if (!k.vazby.has(r.karta!))
      k.vazby.set(r.karta!, { karta: r.karta!, vehicle_id: r.vehicle_id });
}

function riadokTransakcie(k: Kontext, t: KartaTransakcia) {
  return {
    company_id: k.companyId,
    pripojenie_id: k.pripojenie.id,
    poskytovatel: k.poskytovatel,
    externe_id: t.externeId,
    cas: t.cas,
    datum: t.datum,
    karta: t.karta,
    spz: t.spz,
    vodic: t.vodic,
    vehicle_id: vozidloTransakcie(t, k.vazby, k.vozidla),
    produkt: t.produkt,
    produkt_kod: t.produktKod,
    je_palivo: t.jePalivo,
    mnozstvo: t.mnozstvo,
    jednotka: t.jednotka,
    zaklad: t.zaklad,
    dph: t.dph,
    sadzba_dph: t.sadzbaDph,
    spolu: t.spolu,
    mena: t.mena,
    krajina: t.krajina,
    krajina_dph: t.krajinaDph,
    miesto: t.miesto,
    tachometer_km: t.tachometerKm,
    faktura_cislo: t.fakturaCislo,
    faktura_datum: t.fakturaDatum,
    dobropis: t.dobropis,
    surove: t.surove ?? null,
  };
}

/** Uloží transakcie (idempotentne) a založí k nim tankovania. */
async function ulozTransakcie(k: Kontext, tx: KartaTransakcia[]) {
  if (!tx.length) return;
  await zabezpecVazby(k, tx);
  const podlaId = new Map(tx.map((t) => [t.externeId, t]));
  for (let i = 0; i < tx.length; i += DAVKA) {
    const davka = tx.slice(i, i + DAVKA).map((t) => riadokTransakcie(k, t));
    const { data, error } = await k.admin
      .from("palivove_karty_transakcie")
      .upsert(davka, { onConflict: "pripojenie_id,externe_id" })
      .select("id, externe_id, vehicle_id, fuel_record_id, datum");
    if (error) throw new Error(`Transakcie sa nepodarilo uložiť: ${error.message}`);
    k.pocty.transakcie += davka.length;
    await zalozTankovania(
      k,
      (data ?? [])
        .map((r: any) => ({ ...r, t: podlaId.get(r.externe_id)! }))
        .filter((r: any) => r.t),
    );
  }
}

async function zalozTankovania(
  k: Kontext,
  riadky: {
    id: string;
    vehicle_id: string | null;
    fuel_record_id: string | null;
    datum: string;
    t: KartaTransakcia;
  }[],
) {
  const kandidati = riadky
    .filter((r) => !r.fuel_record_id && r.vehicle_id)
    .map((r) => ({
      r,
      f: tankovanieZTransakcie(r.t, {
        companyId: k.companyId,
        vehicleId: r.vehicle_id,
        zdroj: k.zdroj,
      }),
    }))
    .filter((x) => x.f);
  if (!kandidati.length) return;
  const dni = kandidati.map((x) => String(x.f!.fuel_date)).sort();
  const { data: existujuce } = await k.admin
    .from("fuel_records")
    .select("id, vehicle_id, fuel_date, liters, external_source, external_id")
    .eq("company_id", k.companyId)
    .gte("fuel_date", dni[0])
    .lte("fuel_date", dni[dni.length - 1])
    .limit(1000);
  const zoznam = (existujuce ?? []) as any[];
  for (const { r, f } of kandidati) {
    let id: string | null =
      zoznam.find((x) => x.external_source === k.zdroj && x.external_id === r.t.externeId)?.id ??
      existujuceTankovanie(f!, zoznam);
    if (!id) {
      const { data, error } = await k.admin.from("fuel_records").insert(f).select("id").single();
      if (error) {
        console.warn("[palivove-karty] tankovanie:", error.message);
        continue;
      }
      id = data.id as string;
      zoznam.push({ ...f, id });
      k.pocty.tankovania++;
    }
    await k.admin.from("palivove_karty_transakcie").update({ fuel_record_id: id }).eq("id", r.id);
  }
}

/** Bločky z pumpy, ktoré už vo Fakteri sú — označia sa pri transakcii. */
async function oznacBlocky(k: Kontext, tx: KartaTransakcia[]) {
  if (!tx.length) return;
  const dni = tx.map((t) => t.datum).sort();
  const { data: blocky } = await k.admin
    .from("expense_documents")
    .select("id, issue_date, total_amount")
    .eq("company_id", k.companyId)
    .gte("issue_date", dni[0])
    .lte("issue_date", dni[dni.length - 1])
    .limit(1000);
  if (!blocky?.length) return;
  const zhody = duplicitneBlocky(tx, blocky);
  for (const [externeId, blocekId] of zhody) {
    await k.admin
      .from("palivove_karty_transakcie")
      .update({ blocek_id: blocekId })
      .eq("pripojenie_id", k.pripojenie.id)
      .eq("externe_id", externeId)
      .is("blocek_id", null);
  }
  k.pocty.blocky += new Set(zhody.values()).size;
}

/* ------------------------------------------------------------- faktúry */

function zDb(r: any): TransakciaNaFakturu {
  return {
    externeId: r.externe_id,
    nakupId: null,
    cas: r.cas,
    datum: r.datum,
    karta: r.karta,
    spz: r.spz,
    vodic: r.vodic,
    produkt: r.produkt,
    produktKod: r.produkt_kod,
    jePalivo: r.je_palivo,
    mnozstvo: r.mnozstvo == null ? null : Number(r.mnozstvo),
    jednotka: r.jednotka,
    zaklad: Number(r.zaklad),
    dph: Number(r.dph),
    sadzbaDph: r.sadzba_dph == null ? null : Number(r.sadzba_dph),
    spolu: Number(r.spolu),
    mena: r.mena,
    krajina: r.krajina,
    krajinaDph: r.krajina_dph,
    miesto: r.miesto,
    tachometerKm: r.tachometer_km == null ? null : Number(r.tachometer_km),
    fakturaCislo: r.faktura_cislo,
    fakturaDatum: r.faktura_datum,
    dobropis: r.dobropis,
    vehicle_id: r.vehicle_id,
  };
}

async function transakcieFaktury(k: Kontext, cislo: string): Promise<any[]> {
  const { data } = await k.admin
    .from("palivove_karty_transakcie")
    .select("*")
    .eq("pripojenie_id", k.pripojenie.id)
    .eq("faktura_cislo", cislo)
    .limit(1000);
  return data ?? [];
}

async function prepojFakturu(k: Kontext, cislo: string, prijataId: string) {
  await k.admin
    .from("palivove_karty_transakcie")
    .update({ purchase_invoice_id: prijataId })
    .eq("pripojenie_id", k.pripojenie.id)
    .eq("faktura_cislo", cislo);
}

/**
 * Faktúra vydavateľa karty → jedna prijatá faktúra. Ak ju vo Fakteri už
 * niekto má (prišla e-mailom, nahratá ručne), nová sa nezakladá — nákupy sa
 * len prepoja na existujúcu, inak by bol náklad aj DPH dvakrát.
 */
async function zalozFakturu(
  k: Kontext,
  adapter: KartaAdapter,
  p: Record<string, string>,
  f: KartaFaktura,
  krajinaFirmy: string,
): Promise<void> {
  const externeId = `${k.poskytovatel}:faktura:${f.externeId}`;
  const { data: uz } = await k.admin
    // aj-zmazane: idempotencia podľa external_id, zmazanú faktúru synchronizácia znova nezaloží
    .from("purchase_invoices")
    .select("id")
    .eq("company_id", k.companyId)
    .eq("external_id", externeId)
    .maybeSingle();
  if (uz) {
    await prepojFakturu(k, f.cislo, uz.id);
    return;
  }
  const ico = String(p.dodavatel_ico ?? "").replace(/\D/g, "");
  const { data: rovnake } = await k.admin
    .from("purchase_invoices")
    .select("id, supplier_name, supplier_ico")
    .eq("company_id", k.companyId)
    .eq("invoice_number", f.cislo)
    .is("deleted_at", null)
    .limit(5);
  const duplicitna = (rovnake ?? []).find(
    (x: any) =>
      (ico && String(x.supplier_ico ?? "").replace(/\D/g, "") === ico) ||
      /shell/i.test(String(x.supplier_name ?? "")) ||
      String(x.supplier_name ?? "")
        .trim()
        .toLowerCase() === f.dodavatel.nazov.trim().toLowerCase(),
  );
  if (duplicitna) {
    await prepojFakturu(k, f.cislo, duplicitna.id);
    await log(
      k.admin,
      k.pripojenie,
      "faktura",
      "ok",
      `Faktúra ${f.cislo} už vo Fakteri je — nákupy sú prepojené na ňu, nová sa nezaložila.`,
      {
        purchase_invoice_id: duplicitna.id,
      },
    );
    return;
  }

  let riadky = await transakcieFaktury(k, f.cislo);
  if (!riadky.length && adapter.transakcieFaktury) {
    await ulozTransakcie(k, await adapter.transakcieFaktury(p, f));
    riadky = await transakcieFaktury(k, f.cislo);
  }
  const navrh = prijataZFaktury(f, riadky.map(zDb), {
    companyId: k.companyId,
    krajinaFirmy,
    poskytovatel: k.poskytovatel,
    dodavatelIco: ico || null,
    vozidla: k.vozidla,
    dnes: dnesBratislava(),
  });
  const { doplnovacKurzov } = await import("../kurz-dokladu.server");
  const kurz = await doplnovacKurzov(k.companyId)("purchase_invoices", navrh.riadok);
  const { data, error } = await k.admin
    .from("purchase_invoices")
    .insert({ ...navrh.riadok, ...kurz })
    .select("id")
    .single();
  if (error) {
    if (/duplicate key|external_id/i.test(error.message)) return; // súbežný beh ju už založil
    throw new Error(`Faktúru ${f.cislo} sa nepodarilo uložiť: ${error.message}`);
  }
  await prepojFakturu(k, f.cislo, data.id);
  k.pocty.faktury++;
}

/* ------------------------------------------------------------- beh */

/** Kontext pre synchronizáciu aj pre prepočet vozidiel po ručnom priradení. */
async function kontext(admin: Admin, pripojenie: any): Promise<Kontext> {
  const [{ data: vozidla }, { data: vazby }] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, name, license_plate, odpocet_dph, active")
      .eq("company_id", pripojenie.company_id)
      .limit(1000),
    admin
      .from("palivove_karty_vazby")
      .select("id, karta, vehicle_id, rucne")
      .eq("pripojenie_id", pripojenie.id)
      .limit(1000),
  ]);
  return {
    admin,
    pripojenie,
    companyId: pripojenie.company_id,
    poskytovatel: pripojenie.poskytovatel,
    zdroj: `karta-${pripojenie.poskytovatel}`,
    vozidla: (vozidla ?? []) as Vozidlo[],
    vazby: new Map(((vazby ?? []) as any[]).map((v) => [v.karta, v])),
    pocty: { transakcie: 0, tankovania: 0, faktury: 0, blocky: 0 },
  };
}

export async function synchronizujPripojenie(
  pripojenieId: string,
  o: { casDo: number; teraz?: Date } = { casDo: Date.now() + 22_000 },
): Promise<VysledokSync> {
  const admin = await getAdmin();
  const { data: pripojenie } = await admin
    .from("palivove_karty_pripojenia")
    .select("*")
    .eq("id", pripojenieId)
    .maybeSingle();
  const prazdny = { transakcie: 0, tankovania: 0, faktury: 0, blocky: 0 };
  if (!pripojenie || !pripojenie.aktivne) {
    return { stav: "preskocene", sprava: "Pripojenie nie je aktívne.", ...prazdny };
  }
  if (
    pripojenie.stav === "prebieha" &&
    Date.now() - new Date(pripojenie.updated_at).getTime() < 10 * 60_000
  ) {
    return { stav: "preskocene", sprava: "Synchronizácia už beží.", ...prazdny };
  }
  await admin
    .from("palivove_karty_pripojenia")
    .update({ stav: "prebieha" })
    .eq("id", pripojenie.id);

  const k = await kontext(admin, pripojenie);
  const teraz = o.teraz ?? new Date();
  let ciastocne = false;
  try {
    const p = prihlaseniePripojenia(pripojenie);
    const adapter = await nacitajAdapter(pripojenie.poskytovatel);

    // 1. Transakcie po mesačných oknách od posledného miesta (s malým prekrytím).
    let od = pripojenie.transakcie_do
      ? new Date(new Date(pripojenie.transakcie_do).getTime() - PREKRYTIE_DNI * DEN)
      : new Date(teraz.getTime() - PRVE_STIAHNUTIE_DNI * DEN);
    const vsetky: KartaTransakcia[] = [];
    while (od < teraz) {
      if (Date.now() > o.casDo) {
        ciastocne = true;
        break;
      }
      const do_ = new Date(Math.min(teraz.getTime(), od.getTime() + OKNO_DNI * DEN));
      const tx = await adapter.transakcie(p, od, do_);
      await ulozTransakcie(k, tx);
      vsetky.push(...tx);
      await admin
        .from("palivove_karty_pripojenia")
        .update({ transakcie_do: do_.toISOString() })
        .eq("id", pripojenie.id);
      od = do_;
    }
    await oznacBlocky(k, vsetky);

    // 2. Faktúry — len v režime „faktúra“ a keď poskytovateľ faktúry cez API dáva.
    if (!ciastocne && pripojenie.rezim === "faktura" && adapter.faktury) {
      const { data: firma } = await admin
        .from("companies")
        .select("country")
        .eq("id", k.companyId)
        .maybeSingle();
      const krajina = String(firma?.country ?? "SK").toUpperCase() || "SK";
      const fOd = pripojenie.faktury_do
        ? new Date(new Date(`${pripojenie.faktury_do}T00:00:00Z`).getTime() - 7 * DEN)
        : new Date(teraz.getTime() - PRVE_STIAHNUTIE_DNI * DEN);
      const faktury = (await adapter.faktury(p, fOd, teraz)).sort((a, b) =>
        a.datum.localeCompare(b.datum),
      );
      let vsetkyFaktury = true;
      for (const f of faktury) {
        if (Date.now() > o.casDo) {
          vsetkyFaktury = false;
          ciastocne = true;
          break;
        }
        await zalozFakturu(k, adapter, p, f, krajina);
      }
      if (vsetkyFaktury) {
        await admin
          .from("palivove_karty_pripojenia")
          .update({ faktury_do: dnesBratislava(teraz) })
          .eq("id", pripojenie.id);
      }
    }

    const sprava =
      `Transakcií: ${k.pocty.transakcie}, nových tankovaní: ${k.pocty.tankovania}, faktúr: ${k.pocty.faktury}` +
      (k.pocty.blocky ? `, bločkov na kontrolu: ${k.pocty.blocky}` : "") +
      (ciastocne ? ". Pokračuje pri ďalšej synchronizácii." : ".");
    await admin
      .from("palivove_karty_pripojenia")
      .update({ stav: "ok", posledna_sync_at: new Date().toISOString(), posledna_chyba: null })
      .eq("id", pripojenie.id);
    await log(admin, pripojenie, "sync", ciastocne ? "ciastocne" : "ok", sprava, k.pocty);
    return { stav: ciastocne ? "ciastocne" : "ok", sprava, ...k.pocty };
  } catch (e) {
    const druh = e instanceof KartaChyba ? e.druh : "api";
    const sprava =
      e instanceof KartaChyba
        ? e.message
        : /decrypt|dešifrovať/i.test(String((e as Error)?.message))
          ? "Uložené prihlasovacie údaje sa nedajú prečítať. Zadajte ich znova."
          : `Synchronizácia zlyhala: ${String((e as Error)?.message ?? e).slice(0, 300)}`;
    const stav = druh === "limit" ? "limit" : "chyba";
    await admin
      .from("palivove_karty_pripojenia")
      .update({ stav, posledna_chyba: sprava, posledna_sync_at: new Date().toISOString() })
      .eq("id", pripojenie.id);
    await log(admin, pripojenie, "sync", stav, sprava, k.pocty);
    return { stav, sprava, ...k.pocty };
  }
}

/**
 * Po ručnom priradení karty k vozidlu: transakcie tej karty dostanú vozidlo
 * a palivo z nich tankovania. Tankovanie, ktoré sme založili k inému autu,
 * sa presunie.
 */
export async function prepocitajKartu(pripojenie: any, karta: string): Promise<number> {
  const admin = await getAdmin();
  const k = await kontext(admin, pripojenie);
  const vazba = k.vazby.get(karta);
  const vehicleId = vazba?.vehicle_id ?? null;
  const { data: riadky } = await admin
    .from("palivove_karty_transakcie")
    .select("*")
    .eq("pripojenie_id", pripojenie.id)
    .eq("karta", karta)
    .limit(1000);
  let zmenene = 0;
  for (const r of (riadky ?? []) as any[]) {
    if (r.vehicle_id === vehicleId) continue;
    zmenene++;
    await admin.from("palivove_karty_transakcie").update({ vehicle_id: vehicleId }).eq("id", r.id);
    if (r.fuel_record_id) {
      if (vehicleId) {
        await admin
          .from("fuel_records")
          .update({ vehicle_id: vehicleId })
          .eq("id", r.fuel_record_id)
          .eq("external_source", k.zdroj);
      } else {
        await admin
          .from("fuel_records")
          .delete()
          .eq("id", r.fuel_record_id)
          .eq("external_source", k.zdroj);
        await admin
          .from("palivove_karty_transakcie")
          .update({ fuel_record_id: null })
          .eq("id", r.id);
      }
    }
  }
  if (vehicleId) {
    const tx = ((riadky ?? []) as any[]).map((r) => ({ ...zDb(r), surove: r.surove }));
    await zalozTankovania(
      k,
      ((riadky ?? []) as any[]).map((r, i) => ({
        id: r.id,
        vehicle_id: vehicleId,
        fuel_record_id: r.fuel_record_id,
        datum: r.datum,
        t: tx[i],
      })),
    );
  }
  return zmenene;
}

/**
 * Nočný beh: pripojenia, ktoré sa najdlhšie nesynchronizovali, kým je čas.
 * Pripojenie synchronizované za posledných 20 hodín sa preskočí, takže hook
 * sa dá volať aj každú hodinu a prejde všetky firmy po dávkach.
 */
export async function nocnaSynchronizacia(o: { casDo?: number } = {}) {
  const admin = await getAdmin();
  const casDo = o.casDo ?? Date.now() + 22_000;
  const hranica = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data } = await admin
    .from("palivove_karty_pripojenia")
    .select("id")
    .eq("aktivne", true)
    .eq("auto_sync", true)
    .or(`posledna_sync_at.is.null,posledna_sync_at.lt.${hranica}`)
    .order("posledna_sync_at", { ascending: true, nullsFirst: true })
    .limit(25);
  const vysledky: { id: string; stav: string }[] = [];
  for (const r of (data ?? []) as { id: string }[]) {
    if (Date.now() > casDo - 3_000) break;
    const v = await synchronizujPripojenie(r.id, { casDo });
    vysledky.push({ id: r.id, stav: v.stav });
  }
  return { spracovane: vysledky.length, vysledky };
}
