import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Samofaktúry — zakladanie, PDF, odoslanie na odsúhlasenie a rozhodnutie
  dodávateľa. Zápis za prihláseného ide cez jeho klienta (RLS, role, uzamknuté
  obdobia); admin klient len tam, kde ide dodávateľ bez účtu cez token.
*/

const Datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Polozka = z.object({
  name: z.string().trim().min(1).max(500),
  description: z.string().max(2000).nullish(),
  quantity: z.coerce.number().finite(),
  unit: z.string().max(20).nullish(),
  unit_price: z.coerce.number().finite(),
  discount_percent: z.coerce.number().min(0).max(100).nullish(),
  vat_rate: z.coerce.number().min(0).max(100),
  /** Položka z cenníka / skladu — kvôli naskladneniu. */
  product_id: z.string().uuid().nullish(),
  stock_item_id: z.string().uuid().nullish(),
});

const Ulozenie = z.object({
  company_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  customer_id: z.string().uuid(),
  supplier_name: z.string().trim().min(1).max(300),
  supplier_ico: z.string().max(20).nullish(),
  supplier_dic: z.string().max(20).nullish(),
  supplier_ic_dph: z.string().max(20).nullish(),
  supplier_street: z.string().max(300).nullish(),
  supplier_city: z.string().max(200).nullish(),
  supplier_zip: z.string().max(20).nullish(),
  supplier_country: z.string().max(2).nullish(),
  supplier_email: z.string().max(300).nullish(),
  supplier_iban: z.string().max(40).nullish(),
  issue_date: Datum,
  delivery_date: Datum.nullish(),
  due_date: Datum,
  currency: z.string().length(3).default("EUR"),
  variable_symbol: z.string().max(20).nullish(),
  constant_symbol: z.string().max(10).nullish(),
  specific_symbol: z.string().max(20).nullish(),
  payment_method: z.string().max(20).default("prevod"),
  note: z.string().max(2000).nullish(),
  intro_note: z.string().max(2000).nullish(),
  language: z.string().max(5).nullish(),
  job_id: z.string().uuid().nullish(),
  reverse_charge: z.boolean().default(false),
  reverse_charge_type: z.enum(["domestic_69", "eu_b2b"]).nullish(),
  eu_plnenie: z.enum(["tovar", "sluzba"]).nullish(),
  osobitna_uprava: z.enum(["65", "66_tovar", "66_umenie", "66_starozitnosti"]).nullish(),
  /** Dobropis: samofaktúra, ktorú opravuje. */
  opravuje_id: z.string().uuid().nullish(),
  discount_type: z.enum(["percent", "amount"]).nullish(),
  discount_value: z.coerce.number().min(0).nullish(),
  /** Prijatá zálohová faktúra od toho istého dodávateľa, ktorú táto zúčtováva. */
  advance_invoice_id: z.string().uuid().nullish(),
  items: z.array(Polozka).min(1, "Pridajte aspoň jednu položku.").max(200),
});

const prazdne = (v: string | null | undefined) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};

export const ulozSamofakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Ulozenie.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; cislo: string }> => {
    const supabase = context.supabase as any;
    const {
      chybaDohody,
      dodavatelPlatitel,
      prepocitajPolozku,
      rezimDphSamofaktury,
      sumySamofaktury,
      sumyNaZapis,
      zlavaDokladuSuma,
    } = await import("./samofakturacia");

    const { data: kontakt } = await supabase
      .from("customers")
      .select("id, samofakturacia_od, samofakturacia_do")
      .eq("id", data.customer_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!kontakt) throw new Error("Dodávateľ sa v adresári nenašiel.");
    const chyba = chybaDohody(kontakt, data.issue_date);
    if (chyba) throw new Error(chyba);

    const platitel = dodavatelPlatitel(data.supplier_ic_dph);
    const prenesenie = platitel && data.reverse_charge;
    const typPrenesenia = prenesenie ? (data.reverse_charge_type ?? "domestic_69") : null;
    if (typPrenesenia === "eu_b2b" && !String(data.supplier_country ?? "").match(/^[A-Z]{2}$/i)) {
      throw new Error("Pri dodávateľovi z EÚ vyplňte jeho krajinu.");
    }
    const polozky = data.items.map((p) => ({
      ...prepocitajPolozku(p, platitel),
      product_id: p.product_id ?? null,
      stock_item_id: p.stock_item_id ?? null,
    }));
    const zlava = zlavaDokladuSuma(polozky, data.discount_type, data.discount_value);
    const sumy = sumySamofaktury(polozky, zlava);
    const naZapis = sumyNaZapis(sumy, prenesenie);

    /*
      Dobropis k samofaktúre: opravuje odsúhlasenú samofaktúru toho istého
      dodávateľa. Číslo pôvodnej ide na doklad aj do kontrolného výkazu (C.2).
    */
    let opravuje: { id: string; invoice_number: string } | null = null;
    if (data.opravuje_id) {
      const { data: povodna } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, samofakturacia, samofakturacia_stav, customer_id")
        .eq("id", data.opravuje_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!povodna?.samofakturacia) throw new Error("Opravovaná samofaktúra sa nenašla.");
      if (povodna.customer_id !== data.customer_id) {
        throw new Error("Dobropis musí ísť tomu istému dodávateľovi ako pôvodná faktúra.");
      }
      opravuje = { id: povodna.id, invoice_number: povodna.invoice_number };
    }

    /*
      Zúčtovaná záloha: prijatá zálohová faktúra toho istého dodávateľa, ktorú
      sme už zaplatili. Celková suma faktúry ostáva (kvôli DPH), na úhradu ide
      len zvyšok — rovnako ako pri vydanej faktúre so zálohou.
    */
    let zaloha: { id: string; suma: number } | null = null;
    if (data.advance_invoice_id) {
      const { data: z } = await supabase
        .from("purchase_invoices")
        .select("id, type, amount_total, currency, supplier_ico, supplier_name, deleted_at")
        .eq("id", data.advance_invoice_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      const ten = (a: unknown, b: unknown) =>
        String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
      if (!z || z.deleted_at || z.type !== "proforma") throw new Error("Záloha sa nenašla.");
      if (!(data.supplier_ico ? ten(z.supplier_ico, data.supplier_ico) : ten(z.supplier_name, data.supplier_name))) {
        throw new Error("Záloha je od iného dodávateľa.");
      }
      if ((z.currency ?? "EUR") !== data.currency) throw new Error("Záloha je v inej mene.");
      const { count } = await supabase
        .from("purchase_invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id)
        .eq("advance_invoice_id", z.id)
        .is("deleted_at", null)
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
      if ((count ?? 0) > 0) throw new Error("Túto zálohu už zúčtováva iná faktúra.");
      zaloha = { id: z.id, suma: Number(z.amount_total ?? 0) };
    }

    /*
      Cudzia mena: daň musí byť aj v eurách, kurzom ECB zo dňa pred dodaním
      (§ 26 ods. 1). Výkazy berú eurá, PDF si prepočet vypíše.
    */
    let eur: Record<string, number | null> = {
      exchange_rate: null,
      amount_without_vat_eur: null,
      vat_amount_eur: null,
    };
    if (data.currency !== "EUR") {
      const { prepocitajDoklad } = await import("./kurzy.server");
      const p = await prepocitajDoklad(data.currency, data.delivery_date || data.issue_date, {
        zaklad: naZapis.amount_without_vat,
        dan: naZapis.vat_amount,
        celkom: naZapis.amount_total,
      });
      if (!p) throw new Error(`Kurz ECB pre ${data.currency} sa nepodarilo zistiť — skúste o chvíľu.`);
      eur = { exchange_rate: p.kurz, amount_without_vat_eur: p.zaklad, vat_amount_eur: p.dan };
    }

    const spolocne = {
      customer_id: data.customer_id,
      supplier_name: data.supplier_name.trim(),
      supplier_ico: prazdne(data.supplier_ico),
      supplier_dic: prazdne(data.supplier_dic),
      supplier_ic_dph: prazdne(data.supplier_ic_dph),
      supplier_street: prazdne(data.supplier_street),
      supplier_city: prazdne(data.supplier_city),
      supplier_zip: prazdne(data.supplier_zip),
      supplier_country: (prazdne(data.supplier_country) ?? "SK").toUpperCase(),
      supplier_email: prazdne(data.supplier_email),
      supplier_iban: prazdne(data.supplier_iban)?.replace(/\s+/g, "").toUpperCase() ?? null,
      issue_date: data.issue_date,
      received_date: data.issue_date,
      delivery_date: data.delivery_date || data.issue_date,
      due_date: data.due_date,
      currency: data.currency,
      payment_method: data.payment_method,
      note: prazdne(data.note),
      job_id: data.job_id || null,
      constant_symbol: prazdne(data.constant_symbol),
      specific_symbol: prazdne(data.specific_symbol),
      intro_note: prazdne(data.intro_note),
      language: data.language && data.language !== "sk" ? data.language : null,
      items: polozky,
      ...naZapis,
      ...eur,
      reverse_charge: prenesenie,
      reverse_charge_type: typPrenesenia,
      eu_plnenie: typPrenesenia === "eu_b2b" ? (data.eu_plnenie ?? "tovar") : null,
      osobitna_uprava: platitel && !prenesenie ? (data.osobitna_uprava ?? null) : null,
      opravuje_id: opravuje?.id ?? null,
      discount_type: zlava > 0 ? (data.discount_type ?? null) : null,
      discount_value: zlava > 0 ? (data.discount_value ?? null) : null,
      discount_total: zlava > 0 ? zlava : null,
      advance_invoice_id: zaloha?.id ?? null,
      advance_amount: zaloha?.suma ?? null,
      opravuje_cislo: opravuje?.invoice_number ?? null,
      // Daň nesie režim dodávateľa: neplatiteľ fakturuje bez dane, pri
      // prenesení ju platíme my.
      dph_rezim: rezimDphSamofaktury(
        { reverse_charge: prenesenie, reverse_charge_type: typPrenesenia, eu_plnenie: data.eu_plnenie },
        platitel,
      ),
    };

    if (data.id) {
      const { data: povodna } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, samofakturacia, samofakturacia_stav, deleted_at")
        .eq("id", data.id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!povodna?.samofakturacia || povodna.deleted_at) throw new Error("Samofaktúra sa nenašla.");
      if (povodna.samofakturacia_stav === "odsuhlasena") {
        throw new Error(
          "Odsúhlasenú samofaktúru už meniť nemožno — opravuje sa dobropisom, ako každá faktúra.",
        );
      }
      const { error } = await supabase
        .from("purchase_invoices")
        .update({
          ...spolocne,
          variable_symbol:
            prazdne(data.variable_symbol) ?? povodna.invoice_number.replace(/\D/g, "").slice(-10),
          /*
            Zmena po odoslaní: dodávateľ odsúhlasoval inú faktúru, takže sa
            vracia do konceptu a treba ju poslať znova. Starý odkaz prestane
            platiť, aby neodsúhlasil niečo, čo už neplatí.
          */
          samofakturacia_stav: null,
          samofakturacia_token: null,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, cislo: povodna.invoice_number };
    }

    const { cisloZRadu } = await import("./cislo-z-radu.server");
    const { cislo, seriesId } = await cisloZRadu(supabase, data.company_id, "self_billing", {
      datum: data.issue_date,
    });
    const { data: nova, error } = await supabase
      .from("purchase_invoices")
      .insert({
        ...spolocne,
        company_id: data.company_id,
        created_by: context.userId,
        source: "rucne",
        type: "regular",
        status: "draft",
        odpocet: true,
        invoice_number: cislo,
        number_series_id: seriesId,
        variable_symbol: prazdne(data.variable_symbol) ?? cislo.replace(/\D/g, "").slice(-10),
        samofakturacia: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: nova.id, cislo };
  });

const PodlaId = z.object({ id: z.string().uuid() });

/** Riadok cez klienta prihláseného — RLS povie, či k nemu má prístup. */
async function nacitajVlastnu(supabase: any, id: string) {
  const { STLPCE_SAMOFAKTURY } = await import("./samofakturacia.server");
  const { data: sf } = await supabase
    .from("purchase_invoices")
    .select(STLPCE_SAMOFAKTURY)
    .eq("id", id)
    .maybeSingle();
  if (!sf?.samofakturacia || sf.deleted_at) throw new Error("Samofaktúra sa nenašla.");
  return sf;
}

export const pdfSamofakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PodlaId.parse(d))
  .handler(async ({ data, context }) => {
    const sf = await nacitajVlastnu(context.supabase, data.id);
    const { pdfSamofaktury } = await import("./samofakturacia.server");
    const { bytes, fileName } = await pdfSamofaktury(sf);
    return { base64: Buffer.from(bytes).toString("base64"), fileName };
  });

export const odoslatSamofakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    PodlaId.extend({
      email: z.string().trim().email("Zadajte platný e-mail dodávateľa."),
      sprava: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const sf = await nacitajVlastnu(supabase, data.id);
    if (sf.samofakturacia_stav === "odsuhlasena") throw new Error("Faktúra je už odsúhlasená.");

    const { randomBytes } = await import("crypto");
    const token: string = sf.samofakturacia_token || randomBytes(20).toString("hex");
    // Najprv token a stav, potom e-mail: odkaz v správe musí v tej chvíli platiť.
    const { error } = await supabase
      .from("purchase_invoices")
      .update({
        samofakturacia_token: token,
        samofakturacia_stav: "caka",
        samofakturacia_poznamka: null,
        samofakturacia_odoslana_at: new Date().toISOString(),
        supplier_email: data.email,
      })
      .eq("id", sf.id);
    if (error) throw new Error(error.message);

    const { posliDodavatelovi } = await import("./samofakturacia.server");
    try {
      await posliDodavatelovi({ sf, komu: data.email, token, sprava: data.sprava });
    } catch (e) {
      // Nič neodišlo — stav vrátiť, nech faktúra netvrdí, že na niekoho čaká.
      await supabase
        .from("purchase_invoices")
        .update({
          samofakturacia_stav: sf.samofakturacia_stav ?? null,
          samofakturacia_odoslana_at: sf.samofakturacia_odoslana_at ?? null,
        })
        .eq("id", sf.id);
      throw e;
    }
    return { ok: true };
  });

/**
 * Odsúhlasenie inou cestou — podpísaný papier, e-mail, alebo mlčky, ak to
 * dohoda pripúšťa („ak do 5 dní nenamietne"). Kto a kedy, sa zapíše.
 */
export const oznacitOdsuhlasenuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PodlaId.extend({ poznamka: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const sf = await nacitajVlastnu(supabase, data.id);
    if (sf.samofakturacia_stav === "odsuhlasena") return { ok: true };
    const { error } = await supabase
      .from("purchase_invoices")
      .update({
        samofakturacia_stav: "odsuhlasena",
        samofakturacia_rozhodnutie_at: new Date().toISOString(),
        samofakturacia_rozhodol: "odberatel",
        samofakturacia_poznamka: prazdne(data.poznamka),
        samofakturacia_token: null,
        status: sf.status === "draft" ? "received" : sf.status,
      })
      .eq("id", sf.id);
    if (error) throw new Error(error.message);
    const { ulozOdsuhlasenePdf } = await import("./samofakturacia.server");
    await ulozOdsuhlasenePdf(sf);
    return { ok: true };
  });

/* ── Verejné volania pre dodávateľa (bez prihlásenia) ─────────────────────
   Jedinou ochranou je náhodný token v odkaze. Von ide len to, čo dodávateľ
   aj tak dostal v PDF — nie id firmy, zákazka ani interné poznámky. */

const Token = z.object({ token: z.string().regex(/^[0-9a-f]{40}$/) });

async function podlaTokenu(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { STLPCE_SAMOFAKTURY } = await import("./samofakturacia.server");
  const { data: sf } = await (supabaseAdmin as any)
    .from("purchase_invoices")
    .select(STLPCE_SAMOFAKTURY)
    .eq("samofakturacia_token", token)
    .maybeSingle();
  if (!sf?.samofakturacia || sf.deleted_at) {
    throw new Error("Odkaz už neplatí — faktúru medzitým upravili alebo zrušili.");
  }
  return sf;
}

export const samofakturaPodlaTokenuFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => Token.parse(d))
  .handler(async ({ data }) => {
    const sf = await podlaTokenu(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: firma } = await supabaseAdmin
      .from("companies")
      .select("name, ico, dic, ic_dph, street, city, zip, country")
      .eq("id", sf.company_id)
      .maybeSingle();
    return {
      faktura: {
        cislo: sf.invoice_number as string,
        vystavena: sf.issue_date as string,
        dodanie: (sf.delivery_date ?? sf.issue_date) as string,
        splatnost: sf.due_date as string,
        mena: (sf.currency ?? "EUR") as string,
        zaklad: Number(sf.amount_without_vat ?? 0),
        dan: Number(sf.vat_amount ?? 0),
        spolu: Number(sf.amount_total ?? 0),
        iban: (sf.supplier_iban ?? null) as string | null,
        vs: (sf.variable_symbol ?? null) as string | null,
        stav: sf.samofakturacia_stav as string | null,
        poznamka: (sf.samofakturacia_poznamka ?? null) as string | null,
        rozhodnutie: (sf.samofakturacia_rozhodnutie_at ?? null) as string | null,
        opravuje: (sf.opravuje_cislo ?? null) as string | null,
        prenesenie: Boolean(sf.reverse_charge),
        uvod: (sf.intro_note ?? null) as string | null,
        jazyk: (sf.language ?? "sk") as string,
        zaloha: sf.advance_amount != null ? Number(sf.advance_amount) : null,
        zlava: sf.discount_total != null ? Number(sf.discount_total) : null,
      },
      dodavatel: {
        nazov: sf.supplier_name as string,
        ico: sf.supplier_ico as string | null,
        dic: sf.supplier_dic as string | null,
        icDph: sf.supplier_ic_dph as string | null,
      },
      odberatel: firma,
      polozky: (Array.isArray(sf.items) ? sf.items : []).map((p: any) => ({
        nazov: String(p.name ?? ""),
        mnozstvo: Number(p.quantity ?? 0),
        jednotka: (p.unit ?? null) as string | null,
        cena: Number(p.unit_price ?? 0),
        sadzba: Number(p.vat_rate ?? 0),
        spolu: Number(p.total ?? 0),
      })),
    };
  });

export const pdfSamofakturyPodlaTokenuFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => Token.parse(d))
  .handler(async ({ data }) => {
    const sf = await podlaTokenu(data.token);
    const { pdfSamofaktury } = await import("./samofakturacia.server");
    const { bytes, fileName } = await pdfSamofaktury(sf);
    return { base64: Buffer.from(bytes).toString("base64"), fileName };
  });

export const rozhodniSamofakturuFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    Token.extend({
      suhlas: z.boolean(),
      poznamka: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sf = await podlaTokenu(data.token);
    if (sf.samofakturacia_stav === "odsuhlasena") {
      throw new Error("Faktúru ste už odsúhlasili.");
    }
    if (sf.samofakturacia_stav !== "caka") {
      throw new Error("Faktúra na odsúhlasenie nečaká — odberateľ ju medzitým upravuje.");
    }
    const poznamka = prazdne(data.poznamka);
    if (!data.suhlas && !poznamka) {
      throw new Error("Napíšte, čo na faktúre nesedí — odberateľ podľa toho opraví.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const zmena: Record<string, unknown> = {
      samofakturacia_stav: data.suhlas ? "odsuhlasena" : "zamietnuta",
      samofakturacia_rozhodnutie_at: new Date().toISOString(),
      samofakturacia_rozhodol: "dodavatel",
      samofakturacia_poznamka: poznamka,
    };
    if (data.suhlas && sf.status === "draft") zmena.status = "received";
    const { error } = await (supabaseAdmin as any)
      .from("purchase_invoices")
      .update(zmena)
      .eq("id", sf.id)
      // Dvaja naraz: rozhodne len ten prvý.
      .eq("samofakturacia_stav", "caka");
    if (error) throw new Error(error.message);

    const { oznamRozhodnutie, ulozOdsuhlasenePdf } = await import("./samofakturacia.server");
    if (data.suhlas) await ulozOdsuhlasenePdf(sf);
    await oznamRozhodnutie({ sf, suhlas: data.suhlas, poznamka });
    return { suhlas: data.suhlas };
  });
