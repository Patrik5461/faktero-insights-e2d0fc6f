import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { overPristup } from "./over-pristup";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Nastavenie párovania cez e-mailové notifikácie banky a fronta mailov na kontrolu.
 *
 * Zapnúť/vypnúť a vymeniť adresu smie majiteľ alebo admin (komu patrí adresa,
 * tomu chodia pohyby do účtovníctva) — rovnako ako pri pripojení Fio. Zaradiť
 * alebo zahodiť mail stačí so zápisom v oblasti Banka. Všetko ide cez
 * `supabaseAdmin` až po `overPristup`, a každý záznam sa ešte overuje proti
 * `company_id` z požiadavky — inak by sa dal cudzí `id` spárovať s vlastnou firmou.
 */

const FirmaVstup = z.object({ company_id: z.string().uuid() });

async function domena(): Promise<string> {
  const { podomenaDokladov } = await import("./mail-prijem");
  return podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA);
}

/** Adresy, účty, ktoré si ich môžu zapnúť, potvrdenia z Gmailu a súhrny. */
export const stavNotifikacii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overPristup(context, data.company_id, { oblast: "banka" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { adresaNotifikacii } = await import("./banka-notifikacie");
    const dom = await domena();

    const [{ data: adresy }, { data: ucty }, { data: maily }] = await Promise.all([
      supabaseAdmin
        .from("banka_notifikacie_adresy")
        .select("id, bank_account_id, token, banka, active, created_at, last_received_at")
        .eq("company_id", data.company_id)
        .order("created_at"),
      supabaseAdmin
        .from("bank_accounts")
        .select("id, iban, account_name, currency, bank_connections(provider)")
        .eq("company_id", data.company_id),
      supabaseAdmin
        .from("banka_notifikacie_maily")
        .select("adresa_id, stav, received_at, udaje")
        .eq("company_id", data.company_id)
        .gte("received_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
        .order("received_at", { ascending: false })
        .limit(1000),
    ]);

    const zoznamUctov = (ucty ?? []).map((u: any) => ({
      id: u.id as string,
      iban: (u.iban as string) ?? null,
      nazov: (u.account_name as string) ?? null,
      mena: u.currency as string,
      provider: (u.bank_connections?.provider as string) ?? null,
    }));
    const sAdresou = new Set((adresy ?? []).map((a: any) => a.bank_account_id));

    return {
      domena: dom,
      adresy: (adresy ?? []).map((a: any) => {
        const vlastne = (maily ?? []).filter((m: any) => m.adresa_id === a.id);
        const ucet = zoznamUctov.find((u) => u.id === a.bank_account_id) ?? null;
        return {
          id: a.id as string,
          adresa: adresaNotifikacii(a.token, dom),
          banka: a.banka as string,
          active: a.active as boolean,
          last_received_at: (a.last_received_at as string) ?? null,
          ucet,
          pohybov: vlastne.filter((m: any) => m.stav === "spracovane").length,
          naKontrolu: vlastne.filter((m: any) => m.stav === "na_kontrolu").length,
          chyb: vlastne.filter((m: any) => m.stav === "chyba").length,
          // Overovací kód Gmailu — len posledný, starší už neplatí.
          potvrdenie: (vlastne.find((m: any) => m.stav === "potvrdenie") as any)?.udaje ?? null,
          potvrdenieOd:
            (vlastne.find((m: any) => m.stav === "potvrdenie") as any)?.received_at ?? null,
        };
      }),
      /*
        Notifikácie dávajú zmysel pri účte bez napojenia na banku — pri účte z API
        by každý pohyb prišiel dvakrát (z banky aj z mailu).
      */
      uctyNaZapnutie: zoznamUctov.filter(
        (u) => !sAdresou.has(u.id) && (u.provider === "import" || u.provider === "email"),
      ),
    };
  });

const ZapnutieVstup = FirmaVstup.extend({
  /** Existujúci účet (nahratý výpis), alebo `null` a založí sa nový. */
  bank_account_id: z.string().uuid().nullable(),
  iban: z.string().trim().max(40).optional(),
  nazov: z.string().trim().max(80).optional(),
  mena: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
  banka: z.string().trim().max(30),
});

export const zapniNotifikacie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => ZapnutieVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overPristup(context, data.company_id, { oblast: "banka", zapis: true, spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      ibanPlatny,
      normIban,
      novyTokenNotifikacii,
      bankaPodlaKodu,
      INA_BANKA,
      adresaNotifikacii,
    } = await import("./banka-notifikacie");
    const banka = bankaPodlaKodu(data.banka) ? data.banka : INA_BANKA;

    let uctuId: string;
    if (data.bank_account_id) {
      const { data: u } = await supabaseAdmin
        .from("bank_accounts")
        .select("id, company_id, bank_connections(provider)")
        .eq("id", data.bank_account_id)
        .maybeSingle();
      if (!u || u.company_id !== data.company_id) throw new Error("Účet sa nenašiel.");
      const provider = (u as any).bank_connections?.provider;
      if (provider !== "import" && provider !== "email")
        throw new Error(
          "Účet je napojený na banku — pohyby už chodia priamo, notifikácie by ich zdvojili.",
        );
      uctuId = u.id;
    } else {
      const iban = normIban(data.iban);
      if (!ibanPlatny(iban)) throw new Error("IBAN nie je platný — skontrolujte ho.");
      const { data: rovnaky } = await supabaseAdmin
        .from("bank_accounts")
        .select("id")
        .eq("company_id", data.company_id)
        .eq("iban", iban)
        .maybeSingle();
      if (rovnaky) throw new Error("Účet s týmto IBAN už vo Fakteri máte — vyberte ho zo zoznamu.");
      const { data: spojenie, error: e1 } = await supabaseAdmin
        .from("bank_connections")
        .insert({
          company_id: data.company_id,
          provider: "email",
          status: "connected",
          metadata: { zdroj: "notifikacie", banka },
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);
      const { data: novy, error: e2 } = await supabaseAdmin
        .from("bank_accounts")
        .insert({
          company_id: data.company_id,
          bank_connection_id: spojenie.id,
          iban,
          account_name: data.nazov || iban,
          currency: (data.mena ?? "EUR").toUpperCase(),
          balance: 0,
        })
        .select("id")
        .single();
      if (e2) throw new Error(e2.message);
      uctuId = novy.id;
    }

    const token = novyTokenNotifikacii();
    const { error } = await supabaseAdmin.from("banka_notifikacie_adresy").insert({
      company_id: data.company_id,
      bank_account_id: uctuId,
      token,
      banka,
      created_by: context.userId,
    });
    if (error)
      throw new Error(/duplicate|23505/.test(error.message) ? "Účet už adresu má." : error.message);
    return { adresa: adresaNotifikacii(token, await domena()) };
  });

const AdresaVstup = FirmaVstup.extend({ adresa_id: z.string().uuid() });

async function adresaFirmy(supabaseAdmin: any, companyId: string, adresaId: string) {
  const { data } = await supabaseAdmin
    .from("banka_notifikacie_adresy")
    .select("id, company_id")
    .eq("id", adresaId)
    .maybeSingle();
  if (!data || data.company_id !== companyId) throw new Error("Adresa sa nenašla.");
  return data;
}

/** Zapne alebo vypne príjem; vypnutá adresa maily zahadzuje. */
export const nastavNotifikacie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    AdresaVstup.extend({
      active: z.boolean().optional(),
      banka: z.string().trim().max(30).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await overPristup(context, data.company_id, { oblast: "banka", zapis: true, spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await adresaFirmy(supabaseAdmin, data.company_id, data.adresa_id);
    const { bankaPodlaKodu, INA_BANKA } = await import("./banka-notifikacie");
    const zmena: { active?: boolean; banka?: string } = {};
    if (data.active != null) zmena.active = data.active;
    if (data.banka != null) zmena.banka = bankaPodlaKodu(data.banka) ? data.banka : INA_BANKA;
    const { error } = await supabaseAdmin
      .from("banka_notifikacie_adresy")
      .update(zmena)
      .eq("id", data.adresa_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Nová tajná adresa — keď stará unikla. Stará prestane fungovať hneď. */
export const novaAdresaNotifikacii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => AdresaVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overPristup(context, data.company_id, { oblast: "banka", zapis: true, spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await adresaFirmy(supabaseAdmin, data.company_id, data.adresa_id);
    const { novyTokenNotifikacii, adresaNotifikacii } = await import("./banka-notifikacie");
    const token = novyTokenNotifikacii();
    const { error } = await supabaseAdmin
      .from("banka_notifikacie_adresy")
      .update({ token })
      .eq("id", data.adresa_id);
    if (error) throw new Error(error.message);
    return { adresa: adresaNotifikacii(token, await domena()) };
  });

/** Prijaté maily — predvolene tie, ktoré čakajú na človeka. */
export const mailyNotifikacii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    FirmaVstup.extend({
      adresa_id: z.string().uuid().optional(),
      len: z.enum(["na_kontrolu", "vsetky"]).default("na_kontrolu"),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await overPristup(context, data.company_id, { oblast: "banka" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("banka_notifikacie_maily")
      .select(
        "id, adresa_id, bank_account_id, from_email, subject, received_at, stav, sposob, banka, overenie, dovod, udaje, text_mailu, bank_transaction_id",
      )
      .eq("company_id", data.company_id)
      .order("received_at", { ascending: false })
      .limit(100);
    if (data.adresa_id) q = q.eq("adresa_id", data.adresa_id);
    if (data.len === "na_kontrolu") q = q.in("stav", ["na_kontrolu", "chyba"]);
    else q = q.neq("stav", "potvrdenie");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { maily: rows ?? [] };
  });

const ZaradenieVstup = FirmaVstup.extend({
  mail_id: z.string().uuid(),
  smer: z.enum(["kredit", "debet"]),
  suma: z.number().positive().max(100_000_000),
  mena: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vs: z.string().trim().max(20).optional().nullable(),
  ks: z.string().trim().max(10).optional().nullable(),
  ss: z.string().trim().max(20).optional().nullable(),
  protistrana: z.string().trim().max(120).optional().nullable(),
  protistrana_iban: z.string().trim().max(40).optional().nullable(),
  sprava: z.string().trim().max(300).optional().nullable(),
  /** Založiť aj vtedy, keď rovnaký pohyb na účte už je. */
  aj_duplicitu: z.boolean().optional(),
});

async function mailFirmy(supabaseAdmin: any, companyId: string, mailId: string) {
  const { data } = await supabaseAdmin
    .from("banka_notifikacie_maily")
    .select("id, company_id, bank_account_id, stav, udaje")
    .eq("id", mailId)
    .maybeSingle();
  if (!data || data.company_id !== companyId) throw new Error("E-mail sa nenašiel.");
  return data;
}

/**
 * Ručné zaradenie mailu z kontroly: človek skontroloval (a prípadne opravil)
 * údaje a pohyb sa založí. Spáruje sa rovnako ako každý iný — automaticky len
 * pri zhode VS a sumy.
 */
export const zaradNotifikaciu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => ZaradenieVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overPristup(context, data.company_id, { oblast: "banka", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mail = await mailFirmy(supabaseAdmin, data.company_id, data.mail_id);
    if (mail.stav === "spracovane") throw new Error("Z tohto e-mailu už pohyb vznikol.");
    if (!mail.bank_account_id) throw new Error("E-mail nepatrí k žiadnemu účtu.");

    const { PRAZDNA_NOTIFIKACIA, normMena, symbol, textPola, normIban, referenciaNotifikacie } =
      await import("./banka-notifikacie");
    const mena = normMena(data.mena);
    if (!mena) throw new Error("Neznáma mena.");
    const n = {
      ...PRAZDNA_NOTIFIKACIA,
      jePohyb: true,
      smer: data.smer,
      suma: Math.round(data.suma * 100) / 100,
      mena,
      datum: data.datum,
      vs: symbol(data.vs),
      ks: symbol(data.ks),
      ss: symbol(data.ss),
      protistrana: textPola(data.protistrana, 120),
      protistranaIban: data.protistrana_iban ? normIban(data.protistrana_iban) : null,
      sprava: textPola(data.sprava, 300),
      // Vynútená duplicita dostane vlastnú referenciu, inak by ju index zastavil.
      referencia: data.aj_duplicitu ? `rucne:${data.mail_id}` : null,
    };

    const { data: u } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, iban, currency, company_id, bank_connections(provider)")
      .eq("id", mail.bank_account_id)
      .maybeSingle();
    if (!u || u.company_id !== data.company_id) throw new Error("Účet sa nenašiel.");
    if (mena !== String(u.currency).toUpperCase())
      throw new Error(`Účet je v ${u.currency}, pohyb v ${mena} sa naň zapísať nedá.`);

    const { zalozPohyb } = await import("./banka-notifikacie.server");
    const r = await zalozPohyb(
      supabaseAdmin,
      {
        id: u.id,
        iban: u.iban,
        currency: u.currency,
        company_id: u.company_id,
        provider: (u as any).bank_connections?.provider ?? null,
      },
      n,
    );
    if (r.stav === "duplicita") {
      return { stav: "duplicita" as const, referencia: referenciaNotifikacie(n) };
    }
    await supabaseAdmin
      .from("banka_notifikacie_maily")
      .update({
        stav: "spracovane",
        sposob: "rucne",
        bank_transaction_id: r.id,
        udaje: { ...n, problemy: [] },
        vyriesene_at: new Date().toISOString(),
        vyriesil: context.userId,
      })
      .eq("id", data.mail_id);
    return { stav: "spracovane" as const, id: r.id };
  });

/** Zahodí mail z kontroly (reklama, podvrh, nepotrebné). */
export const zahodNotifikaciu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.extend({ mail_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await overPristup(context, data.company_id, { oblast: "banka", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mail = await mailFirmy(supabaseAdmin, data.company_id, data.mail_id);
    if (mail.stav === "spracovane")
      throw new Error("Z tohto e-mailu už vznikol pohyb — zmažte ho v transakciách.");
    await supabaseAdmin
      .from("banka_notifikacie_maily")
      .update({
        stav: "zahodene",
        vyriesene_at: new Date().toISOString(),
        vyriesil: context.userId,
      })
      .eq("id", data.mail_id);
    return { ok: true };
  });
