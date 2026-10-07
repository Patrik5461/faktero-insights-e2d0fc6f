/*
  Nespracované doklady — serverová časť: uloženie súboru, vyťaženie AI
  a vytvorenie skutočného dokladu, keď ho človek zaradí.
*/

import {
  blocekZUdajov,
  nacitajUdaje,
  navrhDruhu,
  ostatnyZUdajov,
  prijataZUdajov,
  udajeZAi,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
} from "./nespracovane";

type Klient = any;
export const KOS_NESPRACOVANYCH = "nespracovane";

export function priponaSuboru(nazov: string | null | undefined, mime: string | null | undefined): string {
  const z = String(nazov ?? "").toLowerCase().split(".").pop() ?? "";
  if (/^[a-z0-9]{2,5}$/.test(z) && z !== String(nazov ?? "").toLowerCase()) return z;
  const m = String(mime ?? "");
  return m.includes("pdf") ? "pdf" : m.includes("png") ? "png" : m.includes("webp") ? "webp" : m.includes("heic") ? "heic" : "jpg";
}

/**
 * Založí nespracovaný doklad so súborom. `ai` (už prečítané, napr. z mailu)
 * ho rovno vyťaží; bez neho ostane v stave „číta sa" a vyťaží ho `vytazNespracovany`.
 */
export async function zalozNespracovany(
  supabase: Klient,
  args: {
    companyId: string;
    userId: string | null;
    zdroj: "mail" | "nahratie" | "skener" | "apka";
    bajty: Buffer;
    nazov: string | null;
    mime: string;
    ai?: Record<string, unknown> | null;
    druh?: DruhNespracovaneho | null;
    poznamka?: string | null;
    inboxMessageId?: string | null;
  },
): Promise<{ id: string; udaje: UdajeNespracovaneho | null }> {
  const id = crypto.randomUUID();
  const cesta = `${args.companyId}/${id}.${priponaSuboru(args.nazov, args.mime)}`;
  const up = await supabase.storage
    .from(KOS_NESPRACOVANYCH)
    .upload(cesta, args.bajty, { contentType: args.mime, upsert: false });
  if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
  const dnes = new Date().toISOString().slice(0, 10);
  const vytazene = args.ai !== undefined;
  const udaje = vytazene ? udajeZAi(args.ai, dnes) : null;
  if (udaje && args.poznamka) udaje.poznamka = [udaje.poznamka, args.poznamka].filter(Boolean).join("\n");
  const { error } = await supabase.from("nespracovane_doklady").insert({
    id,
    company_id: args.companyId,
    created_by: args.userId,
    zdroj: args.zdroj,
    stav: vytazene ? (args.ai ? "vytazene" : "chyba") : "cita",
    chyba: vytazene && !args.ai ? "Z dokladu sa nič nedalo prečítať — doplňte údaje ručne." : null,
    druh: args.druh ?? (vytazene ? navrhDruhu(args.ai, args.nazov) : null),
    file_path: cesta,
    file_name: args.nazov,
    file_mime: args.mime,
    file_size: args.bajty.length,
    ai: args.ai ?? null,
    udaje: udaje ?? {},
    inbox_message_id: args.inboxMessageId ?? null,
  });
  if (error) {
    await supabase.storage.from(KOS_NESPRACOVANYCH).remove([cesta]);
    throw new Error(error.message);
  }
  return { id, udaje };
}

/** Vyťaží nespracovaný doklad cez AI (beží na pozadí, po odpovedi klientovi). */
export async function vytazNespracovany(id: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: r } = await supabaseAdmin
    .from("nespracovane_doklady")
    .select("id, file_path, file_mime, file_name, druh, udaje")
    .eq("id", id)
    .maybeSingle();
  if (!r?.file_path) return;
  try {
    const { data: subor, error } = await supabaseAdmin.storage.from(KOS_NESPRACOVANYCH).download(r.file_path);
    if (error || !subor) throw new Error("Súbor sa nepodarilo načítať.");
    const bajty = Buffer.from(await subor.arrayBuffer());
    const { precitajDoklad } = await import("./mail-prijem.server");
    const ai = await precitajDoklad(bajty.toString("base64"), r.file_mime ?? "application/pdf");
    const dnes = new Date().toISOString().slice(0, 10);
    const povodne = nacitajUdaje(r.udaje);
    // Čo už človek vyplnil (napr. druh z appky), sa neprepisuje.
    await supabaseAdmin
      .from("nespracovane_doklady")
      .update({
        ai: ai as any,
        stav: ai ? "vytazene" : "chyba",
        chyba: ai ? null : "Z dokladu sa nič nedalo prečítať — doplňte údaje ručne.",
        druh: r.druh ?? navrhDruhu(ai, r.file_name),
        udaje: (povodne.dodavatel.nazov || povodne.cislo ? povodne : udajeZAi(ai, dnes)) as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (e: any) {
    await supabaseAdmin
      .from("nespracovane_doklady")
      .update({ stav: "chyba", chyba: String(e?.message ?? e).slice(0, 300) })
      .eq("id", id);
  }
}

const ZDROJ_PRIJATEJ: Record<string, string> = {
  mail: "mail",
  nahratie: "nahrate",
  skener: "nahrate",
  apka: "nahrate",
};
const ZDROJ_BLOCKU: Record<string, string> = {
  mail: "upload",
  nahratie: "upload",
  skener: "upload",
  apka: "photo",
};

/**
 * Z nespracovaného dokladu vytvorí skutočný doklad podľa druhu, presunie
 * súbor do kbelíka cieľovej agendy a nespracovaný záznam zmaže. Píše sa cez
 * klienta prihláseného — RLS a obmedzenia rolí platia ako pri ručnom zápise.
 */
export async function vytvorDoklad(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
  druh: DruhNespracovaneho,
  u: UdajeNespracovaneho,
): Promise<{ agenda: "prijata" | "doklad" | "ostatny"; id: string }> {
  const dnes = new Date().toISOString().slice(0, 10);
  const teraz = new Date().toISOString();
  let bajty: Uint8Array | null = null;
  if (r.file_path) {
    const { data: subor } = await supabase.storage.from(KOS_NESPRACOVANYCH).download(r.file_path);
    if (subor) bajty = new Uint8Array(await subor.arrayBuffer());
  }
  const mime = r.file_mime ?? "application/pdf";
  const pripona = priponaSuboru(r.file_name, mime);

  let vysledok: { agenda: "prijata" | "doklad" | "ostatny"; id: string };
  if (druh === "faktura" || druh === "zalohova" || druh === "dobropis") {
    const cesta = bajty ? `${r.company_id}/${crypto.randomUUID()}.${pripona}` : null;
    if (cesta && bajty) {
      const up = await supabase.storage.from("purchase-invoices").upload(cesta, bajty, { contentType: mime });
      if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
    }
    const zakl = prijataZUdajov(druh, u, dnes);
    const zauctovat = Boolean(zakl.pohoda_predkontacia || zakl.pohoda_clenenie_dph);
    const { data, error } = await supabase
      .from("purchase_invoices")
      .insert({
        ...zakl,
        company_id: r.company_id,
        created_by: userId,
        status: "received",
        source: ZDROJ_PRIJATEJ[r.zdroj] ?? "nahrate",
        file_path: cesta,
        file_mime: cesta ? mime : null,
        file_size: bajty?.length ?? null,
        // Kto vyplnil predkontáciu či členenie, doklad tým zaúčtoval.
        zauctovane_at: zauctovat ? teraz : null,
        zauctoval: zauctovat ? userId : null,
      })
      .select("id")
      .single();
    if (error) {
      if (cesta) await supabase.storage.from("purchase-invoices").remove([cesta]);
      throw new Error(error.message);
    }
    /* Doklad v cudzej mene potrebuje kurz ECB; bez neho by chýbal vo výkaze k DPH. */
    if (zakl.currency !== "EUR") {
      try {
        const { prepocitajDoklad } = await import("./kurzy.server");
        const p = await prepocitajDoklad(zakl.currency, zakl.delivery_date ?? zakl.issue_date, {
          zaklad: zakl.amount_without_vat,
          dan: zakl.vat_amount,
          celkom: zakl.amount_total,
        });
        if (p)
          await supabase
            .from("purchase_invoices")
            .update({ exchange_rate: p.kurz, amount_without_vat_eur: p.zaklad, vat_amount_eur: p.dan })
            .eq("id", data.id);
      } catch {
        /* Kurz je doplnok — doklad je uložený. */
      }
    }
    vysledok = { agenda: "prijata", id: data.id };
  } else if (druh === "blocek") {
    const cesta = bajty ? `${r.company_id}/${crypto.randomUUID()}.${pripona}` : null;
    if (cesta && bajty) {
      const up = await supabase.storage.from("expense-receipts").upload(cesta, bajty, { contentType: mime });
      if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
    }
    const { data, error } = await supabase
      .from("expense_documents")
      .insert({
        ...blocekZUdajov(u),
        company_id: r.company_id,
        created_by: userId,
        // Človek ho práve skontroloval — je spracovaný.
        status: "processed",
        processed_at: teraz,
        processed_by: userId,
        source: ZDROJ_BLOCKU[r.zdroj] ?? "upload",
        file_path: cesta,
        file_mime: cesta ? mime : null,
        file_size: bajty?.length ?? null,
        ai_raw: r.ai ?? null,
      })
      .select("id")
      .single();
    if (error) {
      if (cesta) await supabase.storage.from("expense-receipts").remove([cesta]);
      throw new Error(error.message);
    }
    vysledok = { agenda: "doklad", id: data.id };
  } else {
    const idDokladu = crypto.randomUUID();
    const { error } = await supabase.from("other_documents").insert({
      id: idDokladu,
      ...ostatnyZUdajov(u, dnes),
      company_id: r.company_id,
      created_by: userId,
      status: "new",
    });
    if (error) throw new Error(error.message);
    if (bajty) {
      const meno = r.file_name || `doklad.${pripona}`;
      const cesta = `${r.company_id}/${idDokladu}/${Date.now()}-${String(meno).replace(/[^\w.-]+/g, "_")}`;
      const up = await supabase.storage.from("other-docs").upload(cesta, bajty, { contentType: mime });
      if (!up.error)
        await supabase.from("other_document_files").insert({
          document_id: idDokladu,
          company_id: r.company_id,
          path: cesta,
          name: meno,
          mime,
          size: bajty.length,
          position: 0,
        });
    }
    vysledok = { agenda: "ostatny", id: idDokladu };
  }

  await supabase.from("nespracovane_doklady").delete().eq("id", r.id);
  if (r.file_path) await supabase.storage.from(KOS_NESPRACOVANYCH).remove([r.file_path]);
  return vysledok;
}
