import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Palivové karty — pripojenie, synchronizácia, priradenie kariet k vozidlám.

  Všetko píše server servisným kľúčom, preto každá funkcia najprv overí
  prístup (`overPristup`, oblasť „jazdy“ ako Vozový park). Pripojenie a
  odpojenie smie len majiteľ alebo admin — sú v ňom prístupové údaje firmy.
  Tajné polia sa do prehliadača nevracajú nikdy; prázdne pole pri úprave
  znamená „nechať uložené“.

  Do tohto súboru nepatria obyčajné exporty so serverovým kódom — balí sa aj
  pre prehliadač (pamäť faktero-functions-export-do-prehliadaca).
*/

const Id = z.string().uuid();

export const ulozPripojenieKartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: Id,
        id: Id.nullish(),
        poskytovatel: z.string().regex(/^[a-z0-9_-]{2,40}$/),
        nazov: z.string().trim().max(120).default(""),
        rezim: z.enum(["faktura", "len_tankovania"]).default("faktura"),
        auto_sync: z.boolean().default(true),
        polia: z.record(z.string().max(2000)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, {
      oblast: "jazdy",
      zapis: true,
      spravca: true,
    });
    const { poskytovatel } = await import("./palivove-karty/register");
    const meta = poskytovatel(data.poskytovatel);
    if (!meta?.dostupne) throw new Error("Tento poskytovateľ sa zatiaľ pripojiť nedá.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { encryptSecret } = await import("./payment-crypto.server");

    let stare: Record<string, string> = {};
    if (data.id) {
      const { data: r } = await admin
        .from("palivove_karty_pripojenia")
        .select("*")
        .eq("id", data.id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!r) throw new Error("Pripojenie sa nenašlo.");
      const { prihlaseniePripojenia } = await import("./palivove-karty/sync.server");
      try {
        stare = prihlaseniePripojenia(r);
      } catch {
        stare = {};
      }
    }

    const hodnoty: Record<string, string> = {};
    for (const pole of meta.polia) {
      const nove = String(data.polia[pole.kluc] ?? "").trim();
      const v = nove || (pole.tajne ? (stare[pole.kluc] ?? "") : "") || pole.predvolene || "";
      if (pole.povinne && !v) throw new Error(`Vyplňte pole ${pole.nazov}.`);
      if (pole.moznosti && v && !pole.moznosti.some((m) => m.hodnota === v))
        throw new Error(`Neplatná hodnota v poli ${pole.nazov}.`);
      if (v) hodnoty[pole.kluc] = v;
    }

    // Pred uložením over, že Shell údaje prijme — chyba ide človeku hneď.
    // Pripojenie bez API (nahratie výpisu, napr. Up) nemá čo overovať.
    if (!meta.nahratie) {
      const { nacitajAdapter } = await import("./palivove-karty/adaptery.server");
      const adapter = await nacitajAdapter(data.poskytovatel);
      try {
        await adapter.test(hodnoty);
      } catch (e: any) {
        throw new Error(e?.message ?? "Pripojenie sa nepodarilo overiť.");
      }
    }

    const tajne: Record<string, string> = {};
    const verejne: Record<string, string> = {};
    for (const pole of meta.polia) {
      const v = hodnoty[pole.kluc];
      if (!v) continue;
      if (pole.tajne) {
        tajne[pole.kluc] = v;
        verejne[`${pole.kluc}_koniec`] = v.length > 4 ? `••••${v.slice(-4)}` : "••••";
      } else verejne[pole.kluc] = v;
    }

    const riadok = {
      company_id: data.company_id,
      poskytovatel: data.poskytovatel,
      nazov: data.nazov || meta.nazov,
      rezim: meta.faktury ? data.rezim : "len_tankovania",
      // Bez API niet čo synchronizovať v noci.
      auto_sync: meta.nahratie ? false : data.auto_sync,
      aktivne: true,
      prihlasenie_sifrovane: encryptSecret(JSON.stringify(tajne)),
      prihlasenie_verejne: verejne,
      stav: "ok",
      posledna_chyba: null,
    };
    if (data.id) {
      const { error } = await admin
        .from("palivove_karty_pripojenia")
        .update(riadok)
        .eq("id", data.id)
        .eq("company_id", data.company_id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: r, error } = await admin
      .from("palivove_karty_pripojenia")
      .insert({ ...riadok, created_by: (context as any).userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: r.id as string };
  });

export const synchronizujKartuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: Id, id: Id }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "jazdy", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await (supabaseAdmin as any)
      .from("palivove_karty_pripojenia")
      .select("id")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!r) throw new Error("Pripojenie sa nenašlo.");
    const { synchronizujPripojenie } = await import("./palivove-karty/sync.server");
    // Do 25 s — dlhšie volanie nginx preruší; zvyšok dobehne pri ďalšom behu.
    return synchronizujPripojenie(data.id, { casDo: Date.now() + 22_000 });
  });

export const odpojKartuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: Id, id: Id }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, {
      oblast: "jazdy",
      zapis: true,
      spravca: true,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Tankovania a prijaté faktúry ostávajú — zmaže sa len pripojenie a jeho evidencia.
    const { error } = await (supabaseAdmin as any)
      .from("palivove_karty_pripojenia")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const nastavPripojenieKartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: Id,
        id: Id,
        aktivne: z.boolean().optional(),
        auto_sync: z.boolean().optional(),
        rezim: z.enum(["faktura", "len_tankovania"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, {
      oblast: "jazdy",
      zapis: true,
      spravca: true,
    });
    const zmena: Record<string, unknown> = {};
    if (data.aktivne !== undefined) zmena.aktivne = data.aktivne;
    if (data.auto_sync !== undefined) zmena.auto_sync = data.auto_sync;
    if (data.rezim !== undefined) zmena.rezim = data.rezim;
    if (!Object.keys(zmena).length) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("palivove_karty_pripojenia")
      .update(zmena)
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const priradKartuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: Id, vazba_id: Id, vehicle_id: Id.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "jazdy", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: vazba } = await admin
      .from("palivove_karty_vazby")
      .select("id, karta, pripojenie_id")
      .eq("id", data.vazba_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!vazba) throw new Error("Karta sa nenašla.");
    if (data.vehicle_id) {
      const { data: v } = await admin
        .from("vehicles")
        .select("id")
        .eq("id", data.vehicle_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!v) throw new Error("Vozidlo nepatrí firme.");
    }
    await admin
      .from("palivove_karty_vazby")
      .update({ vehicle_id: data.vehicle_id, rucne: true })
      .eq("id", vazba.id);
    const { data: pripojenie } = await admin
      .from("palivove_karty_pripojenia")
      .select("*")
      .eq("id", vazba.pripojenie_id)
      .maybeSingle();
    const { prepocitajKartu } = await import("./palivove-karty/sync.server");
    const zmenene = await prepocitajKartu(pripojenie, vazba.karta);
    return { zmenene };
  });

/* ------------------------------------------------- nahratie výpisu (Up) */

const PoleVypisu = z.enum([
  "datum",
  "cas",
  "karta",
  "spz",
  "vodic",
  "stanica",
  "krajina",
  "produkt",
  "mnozstvo",
  "jednotka",
  "jednCena",
  "zaklad",
  "dph",
  "sadzba",
  "spolu",
  "mena",
  "tachometer",
  "faktura",
  "transakcia",
]);
const Datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Suma = z.number().finite().gte(-10_000_000).lte(10_000_000);
const Text = (n: number) => z.string().max(n).nullable();

/** Strop base64 — 10 MB súbor je po zakódovaní ~13,4 MB. */
const STROP_BASE64 = 14_000_000;

export const nahladVypisuKartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: Id,
        id: Id,
        nazov: z.string().trim().min(1).max(200),
        base64: z.string().min(1).max(STROP_BASE64),
        mapovanie: z.record(PoleVypisu, z.number().int().min(0).max(200)).nullish(),
        hlavicka_index: z.number().int().min(0).max(1000).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "jazdy", zapis: true });
    const { pripojenieFirmy, nahladVypisu } = await import("./palivove-karty/nahratie.server");
    const pripojenie = await pripojenieFirmy(data.company_id, data.id);
    return nahladVypisu({
      pripojenie,
      nazov: data.nazov,
      bajty: new Uint8Array(Buffer.from(data.base64, "base64")),
      mapovanie: (data.mapovanie ?? null) as any,
      hlavickaIndex: data.hlavicka_index ?? null,
    });
  });

const RiadokVypisu = z.object({
  cas: z.string().max(40),
  datum: Datum,
  karta: Text(40),
  spz: Text(20),
  vodic: Text(80),
  produkt: Text(120),
  produktKod: Text(40),
  jePalivo: z.boolean(),
  mnozstvo: z.number().finite().gte(0).lte(1_000_000).nullable(),
  jednotka: Text(12),
  zaklad: Suma,
  dph: Suma,
  sadzbaDph: z.number().finite().gte(0).lte(100).nullable(),
  spolu: Suma,
  mena: z.string().regex(/^[A-Z]{3}$/),
  krajina: Text(2),
  krajinaDph: Text(2),
  miesto: Text(160),
  tachometerKm: z.number().int().gte(0).lte(10_000_000).nullable(),
  fakturaCislo: Text(40),
  fakturaDatum: Datum.nullable(),
  dobropis: z.boolean(),
  transakciaId: Text(60),
  odhadDph: z.boolean(),
});

export const ulozVypisKartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: Id,
        id: Id,
        nazov_suboru: z.string().trim().max(200).default(""),
        riadky: z.array(RiadokVypisu).max(3000),
        faktura: z.object({
          cislo: z.string().trim().max(40).nullable(),
          datum: Datum.nullable(),
          splatnost: Datum.nullable(),
          spolu: Suma.nullable(),
          dph: Suma.nullable(),
          mena: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .nullable(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "jazdy", zapis: true });
    if (!data.riadky.length && !data.faktura.cislo) throw new Error("Vo výpise nie je čo uložiť.");
    const { pripojenieFirmy, ulozVypis } = await import("./palivove-karty/nahratie.server");
    const pripojenie = await pripojenieFirmy(data.company_id, data.id);
    // Režim „faktura“ založí aj prijatú faktúru — na to treba právo na doklady.
    const { pristupUlozeniaVypisu } = await import("./palivove-karty/spracovanie");
    for (const p of pristupUlozeniaVypisu(pripojenie.rezim))
      await overPristup(context as any, data.company_id, p);
    return ulozVypis({
      pripojenie,
      riadky: data.riadky,
      faktura: data.faktura,
      nazovSuboru: data.nazov_suboru,
    });
  });
