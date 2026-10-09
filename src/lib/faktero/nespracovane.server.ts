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
  doplnUdaje,
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
    .select("id, file_path, file_mime, file_name, druh, udaje, ai")
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
        ai: (ai ?? r.ai ?? null) as any,
        stav: ai || r.ai || povodne.cislo || povodne.dodavatel.nazov ? "vytazene" : "chyba",
        chyba: ai || r.ai || povodne.cislo || povodne.dodavatel.nazov ? null : "Z dokladu sa nič nedalo prečítať — doplňte údaje ručne.",
        druh: r.druh ?? navrhDruhu(ai, r.file_name),
        udaje: (povodne.dodavatel.nazov || povodne.cislo
          ? doplnUdaje(povodne, udajeZAi(ai, dnes))
          : udajeZAi(ai, dnes)) as any,
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
  // Predmet mailu a kto doklad nahral — podľa nich vedia zaúčtovať pravidlá.
  let predmetMailu: string | null = null;
  if (r.inbox_message_id) {
    const { data: m } = await supabase.from("inbox_messages").select("subject").eq("id", r.inbox_message_id).maybeSingle();
    predmetMailu = m?.subject ?? null;
  }
  const autor = r.created_by ?? userId;

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
        created_by: autor,
        predmet_mailu: predmetMailu,
        inbox_message_id: r.inbox_message_id ?? null,
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
        predmet_mailu: predmetMailu,
        inbox_message_id: r.inbox_message_id ?? null,
        company_id: r.company_id,
        created_by: autor,
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
      inbox_message_id: r.inbox_message_id ?? null,
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

/**
 * Upozornenia pri spracovaní: doklad, ktorý už vo firme je (rovnaké číslo od
 * toho istého dodávateľa), a faktúra vystavená na inú firmu — odberateľ
 * prečítaný z dokladu nemá IČO ani IČ DPH tejto firmy.
 */
export async function varovaniaNespracovaneho(
  supabase: Klient,
  r: { id: string; company_id: string; ai?: unknown },
  u: UdajeNespracovaneho,
  firma: { ico?: string | null; ic_dph?: string | null; dic?: string | null } | null,
): Promise<string[]> {
  const out: string[] = [];
  const cislo = u.cislo.trim();
  const ico = u.dodavatel.ico.replace(/\s/g, "");
  const tenIstyDodavatel = (x: { supplier_ico?: string | null; supplier_name?: string | null }) =>
    ico
      ? String(x.supplier_ico ?? "").replace(/\s/g, "") === ico
      : String(x.supplier_name ?? "").trim().toLowerCase() === u.dodavatel.nazov.trim().toLowerCase();
  if (cislo) {
    const [{ data: prijate }, { data: blocky }, { data: ine }] = await Promise.all([
      supabase
        .from("purchase_invoices")
        .select("invoice_number, supplier_ico, supplier_name")
        .eq("company_id", r.company_id)
        .eq("invoice_number", cislo)
        .is("deleted_at", null)
        .limit(5),
      supabase
        .from("expense_documents")
        .select("document_number, supplier_ico, supplier_name")
        .eq("company_id", r.company_id)
        .eq("document_number", cislo)
        .limit(5),
      supabase
        .from("nespracovane_doklady")
        .select("id, udaje")
        .eq("company_id", r.company_id)
        .neq("id", r.id)
        .eq("udaje->>cislo", cislo)
        .limit(5),
    ]);
    // Prijaté porovná aj číslo zapísané inak (nuly, pomlčky) a dodávateľa podľa IBAN-u či sumy.
    const { najdiDuplicituPrijatej } = await import("./prijate-duplicity.server");
    const dup = await najdiDuplicituPrijatej(
      supabase,
      r.company_id,
      {
        invoice_number: cislo,
        supplier_ico: u.dodavatel.ico,
        supplier_name: u.dodavatel.nazov,
        supplier_iban: u.dodavatel.iban,
        amount_total: u.celkom,
      },
      { nespracovanyId: r.id },
    );
    if (dup?.kde === "prijate" || (prijate ?? []).some(tenIstyDodavatel))
      out.push(`Prijatá faktúra ${cislo} od tohto dodávateľa už v evidencii je — možno ide o duplicitu.`);
    else if ((blocky ?? []).some(tenIstyDodavatel))
      out.push(`Doklad ${cislo} od tohto dodávateľa už je medzi bločkami — možno ide o duplicitu.`);
    if (
      (ine ?? []).some((x: any) =>
        tenIstyDodavatel({ supplier_ico: x.udaje?.dodavatel?.ico, supplier_name: x.udaje?.dodavatel?.nazov }),
      )
    )
      out.push(`Ten istý doklad ${cislo} čaká v Nespracovaných ešte raz.`);
  }
  // Odberateľ z dokladu — bloček ho nemá, vtedy sa nekontroluje.
  const ai = (r.ai ?? {}) as Record<string, unknown>;
  const norm = (v: unknown) => String(v ?? "").replace(/\s/g, "").toUpperCase();
  const odbIco = norm(ai.buyer_ico);
  const odbDph = norm(ai.buyer_ic_dph);
  if (firma && (odbIco || odbDph)) {
    const nase = [norm(firma.ico), norm(firma.ic_dph), norm(firma.dic)].filter(Boolean);
    const sedi = [odbIco, odbDph].filter(Boolean).some((x) => nase.some((n) => x.includes(n) || n.includes(x)));
    if (nase.length && !sedi)
      out.push(
        `Doklad nepatrí do firmy — odberateľ na ňom je ${String(ai.buyer_name ?? "") || "iná firma"} (IČO ${odbIco || "—"}${odbDph ? `, IČ DPH ${odbDph}` : ""}).`,
      );
  }
  return out;
}

/**
 * Nespracovaný bloček do Nespracovaných dokladov (presun aj so skenom).
 * Odovzdaný či spárovaný ostáva bločkom — vráti `{ id: null }`.
 */
export async function presunBlocekDoNespracovanych(supabase: Klient, id_: string, userId: string | null) {
  const { data: e } = await supabase.from("expense_documents").select("*").eq("id", id_).maybeSingle();
  if (!e) throw new Error("Doklad sa nenašiel.");
  if (e.status !== "new" || e.exported_at) return { id: null as string | null };
  const { data: parovany } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("matched_expense_id", e.id)
    .limit(1);
  // Spárovaný s platbou ostáva bločkom — párovanie by sa presunom stratilo.
  if (parovany?.length) return { id: null as string | null };

  const { prazdneUdaje } = await import("./nespracovane");
  const u = prazdneUdaje();
  u.dodavatel.nazov = e.supplier_name ?? "";
  u.dodavatel.ico = e.supplier_ico ?? "";
  u.dodavatel.icDph = e.supplier_ic_dph ?? "";
  u.cislo = e.document_number ?? "";
  u.datumVystavenia = e.issue_date ?? "";
  u.datumDodania = e.issue_date ?? "";
  u.mena = e.currency ?? "EUR";
  const rozpis = Array.isArray(e.vat_breakdown) ? e.vat_breakdown : null;
  u.rozpis = rozpis?.length
    ? rozpis.map((r: any) => ({ sadzba: Number(r.sadzba) || 0, zaklad: Number(r.zaklad) || 0, dph: Number(r.dph) || 0 }))
    : e.net_amount != null || e.vat_amount != null
      ? [{ sadzba: Number(e.vat_rate) || 0, zaklad: Number(e.net_amount) || 0, dph: Number(e.vat_amount) || 0 }]
      : [];
  u.celkom = e.total_amount != null ? Number(e.total_amount) : null;
  u.platba = e.payment_method ?? "";
  u.kategoria = e.category ?? "";
  u.poznamka = e.note ?? "";
  u.polozky = Array.isArray(e.items) ? e.items : [];
  u.kody = {
    predkontacia: e.pohoda_predkontacia ?? "",
    clenenie: e.pohoda_clenenie_dph ?? "",
    kv: e.kv_clenenie ?? "",
    stredisko: e.stredisko ?? "",
    cinnost: e.cinnost ?? "",
    rad: e.pohoda_rad ?? "",
    intPoznamka: e.int_poznamka ?? "",
  };

  const id = crypto.randomUUID();
  let cesta: string | null = null;
  if (e.file_path) {
    const { data: subor } = await supabase.storage.from("expense-receipts").download(e.file_path);
    if (subor) {
      const pripona = String(e.file_path).split(".").pop()?.toLowerCase().slice(0, 5) || "jpg";
      cesta = `${e.company_id}/${id}.${pripona}`;
      const up = await supabase.storage
        .from("nespracovane")
        .upload(cesta, new Uint8Array(await subor.arrayBuffer()), { contentType: e.file_mime ?? subor.type });
      if (up.error) throw new Error(`Súbor sa nepodarilo presunúť: ${up.error.message}`);
    }
  }
  const pdf = String(e.file_mime ?? "").includes("pdf");
  const { error } = await supabase.from("nespracovane_doklady").insert({
    id,
    company_id: e.company_id,
    created_by: e.created_by ?? userId,
    zdroj: e.source === "photo" || e.source === "qr" ? "apka" : "nahratie",
    stav: "vytazene",
    druh: pdf ? "faktura" : "blocek",
    file_path: cesta,
    file_name: e.file_path ? String(e.file_path).split("/").pop() : null,
    file_mime: e.file_mime,
    file_size: e.file_size,
    ai: e.ai_raw ?? null,
    udaje: u,
  });
  if (error) {
    if (cesta) await supabase.storage.from("nespracovane").remove([cesta]);
    throw new Error(error.message);
  }
  await supabase.from("expense_documents").delete().eq("id", e.id);
  if (e.file_path) await supabase.storage.from("expense-receipts").remove([e.file_path]);
  /*
    Bločkové čítanie nepozná VS, IBAN, splatnosť ani adresu — faktúra zo
    skenera ich preto nemala. Dočíta ich faktúrové čítanie na pozadí;
    doplní len prázdne polia.
  */
  if (cesta) {
    void vytazNespracovany(id);
  }
  return { id };
}
