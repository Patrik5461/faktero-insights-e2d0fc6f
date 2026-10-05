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
  quantity: z.coerce.number().finite(),
  unit: z.string().max(20).nullish(),
  unit_price: z.coerce.number().finite(),
  vat_rate: z.coerce.number().min(0).max(100),
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
  payment_method: z.string().max(20).default("prevod"),
  note: z.string().max(2000).nullish(),
  job_id: z.string().uuid().nullish(),
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
    const { chybaDohody, dodavatelPlatitel, prepocitajPolozku, sumySamofaktury } = await import(
      "./samofakturacia"
    );

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
    const polozky = data.items.map((p) => prepocitajPolozku(p, platitel));
    const sumy = sumySamofaktury(polozky);

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
      items: polozky,
      amount_without_vat: sumy.zaklad,
      vat_amount: sumy.dan,
      amount_total: sumy.spolu,
      // Daň nesie režim dodávateľa: neplatiteľ fakturuje bez dane.
      dph_rezim: platitel ? null : "bez_dane",
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
