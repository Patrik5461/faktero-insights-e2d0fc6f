/*
  Zaevidovanie prijatej eFaktúry — spoločné pre tlačidlo „Zaevidovať“ v
  zozname a pre automatické zaevidovanie po stiahnutí.

  Idempotentné: doklad s väzbou (`matched_supplier_invoice_id` alebo
  `nespracovany_id`) vráti to, čo už vzniklo, a súbežné zaevidovanie toho
  istého riadku (klik počas automatiky) zastaví zámok `zaevidovanie_at`.
  Tá istá faktúra, ktorá prišla inou cestou (mailom, nahratá), sa len
  pripojí — v nákladoch, odpočte DPH ani v príkaze na úhradu nebude dvakrát.

  `supabase` je klient prihláseného (RLS platí) alebo servisný klient pri
  automatike — vtedy volajúci firmu overil tým, že doklad stiahol pre ňu.
*/

import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import {
  prijataZUbl,
  rozoberPrijatuUbl,
  udajeNespracovanehoZUbl,
  type PrijataZUbl,
} from "./prijata-z-ubl";
import {
  daSaZaevidovat,
  druhZRozobratia,
  kamZaradit,
  nastaveniePrijmu,
  type NastaveniePrijmu,
  type VysledokZaevidovania,
} from "./zaevidovanie-efaktury";

type Klient = any;

const SAMOFAKTURA =
  "Toto je samofaktúra, ktorú za vás vyhotovil váš odberateľ — je to vaša vydaná faktúra, nie prijatá. Zaevidujte ju vo Faktúrach.";

export async function nastaveniePrijmuFirmy(
  supabase: Klient,
  companyId: string,
): Promise<NastaveniePrijmu> {
  const { data } = await supabase
    .from("efaktura_profiles")
    .select("prijem_ciel, prijem_stav_id, prijem_automaticky, prijem_otvorit")
    .eq("company_id", companyId)
    .maybeSingle();
  return nastaveniePrijmu(data);
}

/** Rozobratá eFaktúra z uloženého XML; staršie riadky bez XML len z hlavičky. */
function rozober(doklad: Record<string, any>): PrijataZUbl {
  const xml = doklad.xml_payload ? String(doklad.xml_payload) : "";
  const r = xml ? rozoberPrijatuUbl(xml) : null;
  if (r) return r;
  const p = (doklad.parsed_data ?? {}) as Record<string, any>;
  const celkom = Math.abs(Number(doklad.total ?? 0));
  const dph = Math.abs(Number(doklad.vat_total ?? 0));
  const zaloha = Number(p.prepaid ?? 0) > 0 ? Number(p.prepaid) : 0;
  return {
    druh: druhZRozobratia(p),
    typKod: p.typeCode ?? null,
    cislo: doklad.document_number ?? null,
    vystavenie: doklad.issue_date ?? null,
    dodanie: null,
    splatnost: doklad.due_date ?? null,
    mena: String(doklad.currency ?? "EUR").toUpperCase(),
    dodavatel: {
      nazov: doklad.sender_name ?? null,
      ico: null,
      dic: null,
      icDph: doklad.sender_vat_id ?? null,
      ulica: null,
      mesto: null,
      psc: null,
      krajina: null,
      email: null,
    },
    iban: null,
    vs: null,
    objednavka: null,
    platba: null,
    zaklad: Math.round((celkom - dph) * 100) / 100,
    dph,
    celkom,
    zaloha,
    naUhradu: Number(p.payable ?? celkom - zaloha),
    zaokruhlenie: 0,
    rozpis: [],
    polozky: [],
    prenesenie: false,
    opravuje: p.precedingInvoiceNumber ?? null,
    odkazy: [],
  };
}

/** Prijatá zálohová faktúra toho istého dodávateľa, na ktorú eFaktúra odkazuje. */
async function najdiZalohovu(
  supabase: Klient,
  companyId: string,
  r: PrijataZUbl,
): Promise<string | null> {
  const cisla = r.odkazy.filter((x) => x && x !== r.cislo).slice(0, 10);
  if (!cisla.length) return null;
  const { data } = await supabase
    .from("purchase_invoices")
    .select("id, invoice_number, supplier_ico, supplier_ic_dph, supplier_name")
    .eq("company_id", companyId)
    .eq("type", "proforma")
    .is("deleted_at", null)
    .in("invoice_number", cisla)
    .limit(20);
  const norm = (s: unknown) =>
    String(s ?? "")
      .replace(/\s/g, "")
      .toUpperCase();
  const kandidat = ((data ?? []) as any[]).find(
    (z) =>
      (r.dodavatel.ico && norm(z.supplier_ico) === norm(r.dodavatel.ico)) ||
      (r.dodavatel.icDph && norm(z.supplier_ic_dph) === norm(r.dodavatel.icDph)) ||
      (r.dodavatel.nazov && norm(z.supplier_name) === norm(r.dodavatel.nazov)),
  );
  if (!kandidat) return null;
  // Zálohu zúčtuje najviac jedna faktúra.
  const { data: pouzita } = await supabase
    .from("purchase_invoices")
    .select("id")
    .eq("company_id", companyId)
    .eq("advance_invoice_id", kandidat.id)
    .is("deleted_at", null)
    .limit(1);
  return pouzita?.length ? null : kandidat.id;
}

/**
 * Zaeviduje prijatú eFaktúru podľa nastavenia firmy. Samofaktúru odmietne
 * chybou (patrí medzi vydané). `userId` je null pri automatike.
 */
export async function zaevidujPrijatuEfakturu(
  supabase: Klient,
  args: {
    companyId: string;
    receivedId: string;
    userId: string | null;
    nastavenie?: NastaveniePrijmu;
  },
): Promise<VysledokZaevidovania> {
  const { companyId, receivedId } = args;
  const { data: doklad, error } = await supabase
    .from("efaktura_received_documents")
    .select("*")
    .eq("id", receivedId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doklad) throw new Error("Prijatá eFaktúra sa nenašla.");
  const uz = (d: Record<string, any>): VysledokZaevidovania | null =>
    d.matched_supplier_invoice_id
      ? { kam: "prijate", id: d.matched_supplier_invoice_id, uzExistoval: true }
      : d.nespracovany_id
        ? { kam: "nespracovane", id: d.nespracovany_id, uzExistoval: true }
        : null;
  const hotovy = uz(doklad);
  if (hotovy) return hotovy;

  const r = rozober(doklad);
  const nast = args.nastavenie ?? (await nastaveniePrijmuFirmy(supabase, companyId));
  const zaradenie = kamZaradit(nast, r.druh);
  if (zaradenie.kam === "samofaktura") throw new Error(SAMOFAKTURA);

  /* Zámok: len jeden beh smie doklad zakladať. Kto ho nedostane, dočká sa
     výsledku toho druhého (alebo vráti, čo už vzniklo). */
  const teraz = new Date();
  if (!daSaZaevidovat(doklad, teraz)) {
    throw new Error("Táto eFaktúra sa práve eviduje — o chvíľu obnovte zoznam.");
  }
  let zamok = supabase
    .from("efaktura_received_documents")
    .update({ zaevidovanie_at: teraz.toISOString() } as TablesUpdate<"efaktura_received_documents">)
    .eq("id", receivedId)
    .is("matched_supplier_invoice_id", null)
    .is("nespracovany_id", null);
  zamok = doklad.zaevidovanie_at
    ? zamok.eq("zaevidovanie_at", doklad.zaevidovanie_at)
    : zamok.is("zaevidovanie_at", null);
  const { data: zamknute } = await zamok.select("id");
  if (!zamknute?.length) {
    const { data: znova } = await supabase
      .from("efaktura_received_documents")
      .select("matched_supplier_invoice_id, nespracovany_id")
      .eq("id", receivedId)
      .maybeSingle();
    const vysledok = znova ? uz(znova) : null;
    if (vysledok) return vysledok;
    throw new Error("Táto eFaktúra sa práve eviduje — o chvíľu obnovte zoznam.");
  }
  const uvolni = () =>
    supabase
      .from("efaktura_received_documents")
      .update({ zaevidovanie_at: null } as TablesUpdate<"efaktura_received_documents">)
      .eq("id", receivedId);
  const oznac = (zmena: Record<string, unknown>) =>
    supabase
      .from("efaktura_received_documents")
      .update({
        ...zmena,
        zaevidovanie_at: null,
        processed_at: new Date().toISOString(),
      } as TablesUpdate<"efaktura_received_documents">)
      .eq("id", receivedId);

  try {
    const xml = doklad.xml_payload ? String(doklad.xml_payload) : null;
    const dnes = new Date().toISOString().slice(0, 10);
    const riadok = prijataZUbl(r, {
      dnes,
      // Za dátum prijatia berieme, kedy eFaktúra naozaj dorazila.
      prijate: String(doklad.received_at ?? dnes).slice(0, 10),
      nahradneCislo: `EF-${receivedId.slice(0, 8)}`,
    });

    /* Tá istá faktúra už prišla inou cestou — eFaktúra sa len pripojí. */
    if (r.cislo) {
      const { najdiDuplicituPrijatej } = await import("../prijate-duplicity.server");
      const dup = await najdiDuplicituPrijatej(supabase, companyId, {
        invoice_number: r.cislo,
        supplier_name: r.dodavatel.nazov,
        supplier_ico: r.dodavatel.ico,
        supplier_iban: r.iban,
        amount_total: riadok.amount_total,
      } as any);
      if (dup?.kde === "prijate") {
        await oznac({ matched_supplier_invoice_id: dup.id, status: "matched" });
        // Pripojená faktúra bez prílohy dostane PDF z eFaktúry.
        if (xml) {
          const { prilozPdfKPrijatej } = await import("./nahlad.server");
          await prilozPdfKPrijatej(supabase, companyId, dup.id, xml);
        }
        return { kam: "prijate", id: dup.id, uzExistoval: true, pripojena: true };
      }
      if (dup?.kde === "nespracovane") {
        await oznac({ nespracovany_id: dup.id });
        return { kam: "nespracovane", id: dup.id, uzExistoval: true, pripojena: true };
      }
    }

    if (zaradenie.kam === "nespracovane") {
      const id = await doNespracovanych(supabase, {
        companyId,
        userId: args.userId,
        r,
        druh: zaradenie.druh,
        xml,
        receivedId,
      });
      await oznac({ nespracovany_id: id });
      return { kam: "nespracovane", id, uzExistoval: false };
    }

    const advanceInvoiceId = riadok.advance_amount
      ? await najdiZalohovu(supabase, companyId, r)
      : null;
    // Odberateľ na eFaktúre je iná firma — faktúra sa zaeviduje s príznakom a nezaúčtuje.
    const { priznakPrijatej } = await import("../cudzia-faktura.server");
    const cudzia = await priznakPrijatej(supabase, companyId, r.odberatel, r.dodavatel);
    const { data: faktura, error: chybaZapisu } = await supabase
      .from("purchase_invoices")
      .insert({
        ...riadok,
        ...cudzia,
        company_id: companyId,
        created_by: args.userId,
        status: "received",
        source: "efaktura",
        ...(zaradenie.stavId ? { stav_id: zaradenie.stavId } : {}),
        ...(advanceInvoiceId ? { advance_invoice_id: advanceInvoiceId } : {}),
      } as TablesInsert<"purchase_invoices">)
      .select("id")
      .single();
    if (chybaZapisu) throw new Error(chybaZapisu.message);

    await oznac({
      matched_supplier_invoice_id: faktura.id,
      // `matched` je stav pre doklad, ktorý už má svoju prijatú faktúru.
      status: "matched",
    });

    // Náhľad: PDF z eFaktúry (priložené alebo vykreslené z XML) ako príloha prijatej faktúry.
    if (xml) {
      const { prilozPdfKPrijatej } = await import("./nahlad.server");
      await prilozPdfKPrijatej(supabase, companyId, faktura.id, xml);
    }
    // Firma so schvaľovaním prijatých faktúr: doklad ide rovno na schválenie.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { zabezpecSchvalovanie } = await import("../schvalovanie.server");
      await zabezpecSchvalovanie(supabaseAdmin, companyId, "prijata", [faktura.id]);
    } catch (e) {
      console.warn("[efaktura] schvaľovanie sa nezaložilo:", String((e as Error)?.message ?? e));
    }
    return { kam: "prijate", id: faktura.id, typ: zaradenie.typ, uzExistoval: false };
  } catch (e) {
    await uvolni();
    throw e;
  }
}

/** Nespracovaný doklad s PDF eFaktúry a údajmi z XML (nič sa nečíta cez AI). */
async function doNespracovanych(
  supabase: Klient,
  a: {
    companyId: string;
    userId: string | null;
    r: PrijataZUbl;
    druh: "faktura" | "dobropis";
    xml: string | null;
    receivedId: string;
  },
): Promise<string> {
  const { KOS_NESPRACOVANYCH } = await import("../nespracovane.server");
  const { prazdneUdaje } = await import("../nespracovane");
  const id = crypto.randomUUID();
  let cesta: string | null = null;
  let velkost: number | null = null;
  if (a.xml) {
    try {
      const { pdfPrijatejEfaktury } = await import("./nahlad.server");
      const { bajty } = await pdfPrijatejEfaktury(a.xml);
      cesta = `${a.companyId}/${id}.pdf`;
      const up = await supabase.storage
        .from(KOS_NESPRACOVANYCH)
        .upload(cesta, bajty, { contentType: "application/pdf", upsert: false });
      if (up.error) cesta = null;
      else velkost = bajty.length;
    } catch (e) {
      // Bez náhľadu sa doklad založí aj tak — údaje sú v XML.
      console.warn(
        "[efaktura] PDF do Nespracovaných sa nepripravilo:",
        String((e as Error)?.message ?? e),
      );
      cesta = null;
    }
  }
  let udaje = udajeNespracovanehoZUbl(a.r, prazdneUdaje());
  // Čo človek pri tomto dodávateľovi volil naposledy — len do prázdnych polí.
  try {
    const { doplnUcenim } = await import("../ucenie-z-oprav.server");
    udaje = await doplnUcenim(supabase, {
      companyId: a.companyId,
      druh: a.druh,
      udaje,
      createdBy: a.userId,
    });
  } catch {
    /* Učenie je doplnok. */
  }
  const nazov = `efaktura-${String(a.r.cislo ?? a.receivedId).replace(/[^\w.-]+/g, "_")}.pdf`;
  const { error } = await supabase.from("nespracovane_doklady").insert({
    id,
    company_id: a.companyId,
    created_by: a.userId,
    zdroj: "efaktura",
    stav: "vytazene",
    druh: a.druh,
    file_path: cesta,
    file_name: cesta ? nazov : null,
    file_mime: cesta ? "application/pdf" : null,
    file_size: velkost,
    // Odberateľ a dodávateľ z UBL — podľa nich Nespracované spoznajú faktúru inej firmy.
    ai: a.r.odberatel
      ? ({
          zdroj_udajov: "ubl",
          buyer_name: a.r.odberatel.nazov,
          buyer_ico: a.r.odberatel.ico,
          buyer_dic: a.r.odberatel.dic,
          buyer_ic_dph: a.r.odberatel.icDph,
          supplier_name: a.r.dodavatel.nazov,
          supplier_ico: a.r.dodavatel.ico,
          supplier_dic: a.r.dodavatel.dic,
          supplier_ic_dph: a.r.dodavatel.icDph,
        } as any)
      : null,
    udaje,
  });
  if (error) {
    if (cesta) await supabase.storage.from(KOS_NESPRACOVANYCH).remove([cesta]);
    throw new Error(error.message);
  }
  return id;
}

/**
 * Automatické zaevidovanie po stiahnutí. Nikdy nehodí chybu — príjem
 * eFaktúry nesmie zlyhať pre to, že sa ju nepodarilo hneď zaradiť; ostane
 * v zozname na ručné zaevidovanie.
 */
export async function zaevidujAutomaticky(
  supabase: Klient,
  companyId: string,
  receivedIds: string[],
): Promise<{ zaevidovanych: number; problemy: string[] }> {
  const out = { zaevidovanych: 0, problemy: [] as string[] };
  if (!receivedIds.length) return out;
  let nast: NastaveniePrijmu;
  try {
    nast = await nastaveniePrijmuFirmy(supabase, companyId);
  } catch {
    return out;
  }
  if (!nast.automaticky) return out;
  for (const id of receivedIds) {
    try {
      const v = await zaevidujPrijatuEfakturu(supabase, {
        companyId,
        receivedId: id,
        userId: null,
        nastavenie: nast,
      });
      if (!v.uzExistoval || v.pripojena) out.zaevidovanych += 1;
    } catch (e) {
      const sprava = String((e as Error)?.message ?? e);
      // Samofaktúra sa sama nezaraďuje nikam — to nie je chyba príjmu.
      if (sprava !== SAMOFAKTURA) out.problemy.push(sprava);
    }
  }
  return out;
}
