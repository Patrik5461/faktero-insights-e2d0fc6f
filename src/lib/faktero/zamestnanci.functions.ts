import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  csvDochadzky,
  hodnotyTokenov,
  mesacnySuhrn,
  NAZOV_SABLONY,
  PREDVOLENE_SABLONY,
  pripomienkyZamestnancov,
  vyplnSablonu,
  celeMeno,
  type KlucSablony,
} from "./zamestnanci";

/**
 * Modul Zamestnanci. Ako pri zákazkách ide všetko cez klienta viazaného na
 * prihláseného používateľa — členstvo vo firme vynúti RLS, `supabaseAdmin`
 * sa tu nepoužíva.
 *
 * Rodné číslo a číslo OP sú v databáze šifrované a klient k stĺpcom nemá
 * právo vôbec. Zapisujú a čítajú sa len cez `employee_set_pii` a
 * `employee_get_pii`, ktoré každý prístup zapíšu do auditu. Do zoznamu ani do
 * karty sa neposielajú; odšifrujú sa až na výslovné „Zobraziť“ v detaile.
 */

/** Stĺpce zamestnanca, ktoré klient smie čítať — šifrované medzi nimi nie sú. */
const STLPCE =
  "id, company_id, first_name, last_name, title_before, title_after, birth_date, birth_place, nationality, email, phone, street, city, zip, country, iban, health_insurer, position, department, start_date, end_date, status, sp_registered_at, zp_registered_at, medical_check_due, bozp_training_due, note, created_at, updated_at";

const Firma = z.object({ company_id: z.string().uuid() });
const Id = z.object({ company_id: z.string().uuid(), id: z.string().uuid() });

/** Prázdny reťazec do dátumového stĺpca databáza odmietne — ukladá sa null. */
const text = z
  .string()
  .max(2000)
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));
const datum = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
  .refine((v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Neplatný dátum");
const cas = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
  .refine((v) => v == null || /^\d{2}:\d{2}(:\d{2})?$/.test(v), "Neplatný čas");
const cislo = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v == null || v === "" ? null : Number(String(v).replace(",", "."))))
  .refine((v) => v == null || Number.isFinite(v), "Neplatné číslo");

/** Modul musí byť pre firmu zapnutý — menu ho inde neukáže, server ho inde nepustí. */
async function overModul(supabase: any, companyId: string) {
  const { data } = await supabase
    .from("companies")
    .select("module_employees")
    .eq("id", companyId)
    .maybeSingle();
  if (!data?.module_employees) throw new Error("Modul Zamestnanci nie je pre túto firmu zapnutý.");
}

async function zamestnanecFirmy(supabase: any, companyId: string, id: string) {
  const { data } = await supabase
    .from("employees")
    .select(STLPCE)
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) throw new Error("Zamestnanec nenájdený.");
  return data;
}

function dnesnyDatum(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
}

/* ── Zamestnanci ────────────────────────────────────────────────────────── */

export const listZamestnancov = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ stav: z.enum(["active", "ended", "vsetci"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    let q = supabase.from("employees").select(STLPCE).eq("company_id", data.company_id);
    if (data.stav && data.stav !== "vsetci") q = q.eq("status", data.stav);
    const { data: zamestnanci, error } = await q.order("last_name").order("first_name");
    if (error) throw new Error(error.message);
    const { data: zmluvy } = await supabase
      .from("employee_contracts")
      .select("id, employee_id, kind, start_date, end_date, probation_end, status")
      .eq("company_id", data.company_id)
      .eq("status", "active");
    return {
      zamestnanci: zamestnanci ?? [],
      zmluvy: zmluvy ?? [],
      pripomienky: pripomienkyZamestnancov(dnesnyDatum(), (zamestnanci ?? []) as any, (zmluvy ?? []) as any),
    };
  });

export const getZamestnanec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const zamestnanec = await zamestnanecFirmy(supabase, data.company_id, data.id);
    const [zmluvy, dokumenty, nepritomnosti, pii] = await Promise.all([
      supabase.from("employee_contracts").select("*").eq("employee_id", data.id).eq("company_id", data.company_id).order("start_date", { ascending: false }),
      supabase.from("employee_documents").select("*").eq("employee_id", data.id).eq("company_id", data.company_id).order("created_at", { ascending: false }),
      supabase.from("employee_absences").select("*").eq("employee_id", data.id).eq("company_id", data.company_id).order("date_from", { ascending: false }),
      supabase.rpc("employee_pii_present", { _employee_id: data.id }),
    ]);
    // Každé otvorenie karty ide do auditu prístupov.
    await supabase.rpc("employee_log_access", { _employee_id: data.id, _action: "view_detail" });
    const pritomne = (pii.data as any[] | null)?.[0];
    return {
      zamestnanec,
      zmluvy: zmluvy.data ?? [],
      dokumenty: dokumenty.data ?? [],
      nepritomnosti: nepritomnosti.data ?? [],
      maRodneCislo: Boolean(pritomne?.ma_rodne_cislo),
      maOp: Boolean(pritomne?.ma_op),
      pripomienky: pripomienkyZamestnancov(dnesnyDatum(), [zamestnanec as any], (zmluvy.data ?? []) as any),
    };
  });

const ZamestnanecVstup = Firma.extend({
  id: z.string().uuid().optional(),
  first_name: z.string().trim().min(1, "Meno je povinné").max(100),
  last_name: z.string().trim().min(1, "Priezvisko je povinné").max(100),
  title_before: text,
  title_after: text,
  birth_date: datum,
  birth_place: text,
  nationality: text,
  email: text,
  phone: text,
  street: text,
  city: text,
  zip: text,
  country: text,
  iban: text,
  health_insurer: text,
  position: text,
  department: text,
  start_date: datum,
  end_date: datum,
  status: z.enum(["active", "ended"]).default("active"),
  sp_registered_at: datum,
  zp_registered_at: datum,
  medical_check_due: datum,
  bozp_training_due: datum,
  note: text,
});

export const ulozZamestnanca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ZamestnanecVstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const { id, company_id, ...polia } = data;
    if (id) {
      await zamestnanecFirmy(supabase, company_id, id);
      const { error } = await supabase.from("employees").update(polia).eq("id", id).eq("company_id", company_id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: novy, error } = await supabase
      .from("employees")
      .insert({ company_id, ...polia })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: novy.id as string };
  });

export const zmazZamestnanca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    await zamestnanecFirmy(supabase, data.company_id, data.id);
    const { data: subory } = await supabase
      .from("employee_documents")
      .select("file_path")
      .eq("employee_id", data.id)
      .eq("company_id", data.company_id);
    const cesty = (subory ?? []).map((s: any) => s.file_path).filter(Boolean);
    if (cesty.length) await supabase.storage.from("employee-docs").remove(cesty);
    const { data: zmazane, error } = await supabase
      .from("employees")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmazane?.length) throw new Error("Zamestnanca sa nepodarilo zmazať.");
    return { ok: true };
  });

/* ── Citlivé údaje ──────────────────────────────────────────────────────── */

export const nastavCitliveUdaje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Id.extend({
      // `undefined` = nemeniť, prázdny reťazec = vymazať.
      rodne_cislo: z.string().max(20).optional(),
      op_cislo: z.string().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    await zamestnanecFirmy(supabase, data.company_id, data.id);
    // `null` znamená „nemeniť“ — vygenerované typy to nevedia, SQL áno.
    const { error } = await supabase.rpc("employee_set_pii", {
      _employee_id: data.id,
      _rodne_cislo: data.rodne_cislo ?? null,
      _op_cislo: data.op_cislo ?? null,
    } as any);
    if (error) throw new Error("Citlivé údaje sa nepodarilo uložiť.");
    return { ok: true };
  });

export const zobrazCitliveUdaje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    await zamestnanecFirmy(supabase, data.company_id, data.id);
    const { data: riadky, error } = await supabase.rpc("employee_get_pii", { _employee_id: data.id });
    if (error) throw new Error("Citlivé údaje sa nepodarilo načítať.");
    const r = (riadky as any[] | null)?.[0];
    return { rodne_cislo: (r?.rodne_cislo as string | null) ?? null, op_cislo: (r?.op_cislo as string | null) ?? null };
  });

/* ── Zmluvy ─────────────────────────────────────────────────────────────── */

const ZmluvaVstup = Firma.extend({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  kind: z.enum(["pracovna_zmluva", "dovp", "dopc", "brigadnicka", "ina"]),
  number: text,
  signed_at: datum,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Začiatok zmluvy je povinný"),
  end_date: datum,
  probation_end: datum,
  position: text,
  workplace: text,
  weekly_hours: cislo,
  salary: cislo,
  salary_period: z.enum(["mesacne", "hodinovo", "odmena"]).nullish(),
  status: z.enum(["draft", "active", "ended"]).default("active"),
  ended_at: datum,
  termination_reason: text,
  note: text,
});

export const ulozZmluvu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ZmluvaVstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    await zamestnanecFirmy(supabase, data.company_id, data.employee_id);
    if (data.end_date && data.end_date < data.start_date) throw new Error("Koniec zmluvy je pred jej začiatkom.");
    const { id, ...polia } = data;
    const q = id
      ? supabase.from("employee_contracts").update(polia).eq("id", id).eq("company_id", data.company_id).select("id").single()
      : supabase.from("employee_contracts").insert(polia).select("id").single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return { id: r.id as string };
  });

const Zmazanie = Firma.extend({
  id: z.string().uuid(),
  tabulka: z.enum(["employee_contracts", "employee_absences", "employee_attendance"]),
});

export const zmazZaznam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Zmazanie.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const { data: zmazane, error } = await supabase
      .from(data.tabulka)
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmazane?.length) throw new Error("Záznam sa nepodarilo zmazať.");
    return { ok: true };
  });

/* ── Neprítomnosti a dochádzka ──────────────────────────────────────────── */

const NepritomnostVstup = Firma.extend({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  kind: z.enum(["dovolenka", "pn", "ocr", "nahradne_volno", "neplatene_volno", "sviatok", "ine"]),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: cislo,
  hours: cislo,
  note: text,
});

export const ulozNepritomnost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => NepritomnostVstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    await zamestnanecFirmy(supabase, data.company_id, data.employee_id);
    if (data.date_to < data.date_from) throw new Error("Koniec neprítomnosti je pred jej začiatkom.");
    const { id, ...polia } = data;
    const q = id
      ? supabase.from("employee_absences").update(polia).eq("id", id).eq("company_id", data.company_id).select("id").single()
      : supabase.from("employee_absences").insert(polia).select("id").single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return { id: r.id as string };
  });

export const listDochadzky = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Firma.extend({ employee_id: z.string().uuid(), mesiac: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const [r, m] = data.mesiac.split("-").map(Number);
    const posledny = new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);
    const { data: zaznamy, error } = await supabase
      .from("employee_attendance")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("employee_id", data.employee_id)
      .gte("work_date", `${data.mesiac}-01`)
      .lte("work_date", posledny)
      .order("work_date")
      .order("time_from");
    if (error) throw new Error(error.message);
    return zaznamy ?? [];
  });

const DochadzkaVstup = Firma.extend({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_from: cas,
  time_to: cas,
  break_minutes: z.coerce.number().int().min(0).max(24 * 60).default(0),
  hours: cislo,
  kind: z.enum(["praca", "home_office", "sluzobna_cesta"]).default("praca"),
  note: text,
});

export const ulozDochadzku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => DochadzkaVstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    await zamestnanecFirmy(supabase, data.company_id, data.employee_id);
    if (data.hours == null && !(data.time_from && data.time_to)) {
      throw new Error("Zadajte príchod a odchod, alebo počet hodín.");
    }
    const { id, ...polia } = data;
    const q = id
      ? supabase.from("employee_attendance").update(polia).eq("id", id).eq("company_id", data.company_id).select("id").single()
      : supabase.from("employee_attendance").insert(polia).select("id").single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return { id: r.id as string };
  });

/* ── Dokumenty ──────────────────────────────────────────────────────────── */

/** Súbor nahrá prehliadač priamo do úložiska (stráži ho RLS kbelíka); tu sa len zapíše. */
export const pridajDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Firma.extend({
      employee_id: z.string().uuid(),
      contract_id: z.string().uuid().nullish(),
      title: z.string().trim().min(1).max(200),
      file_path: z.string().min(1).max(500),
      file_mime: z.string().max(100).nullish(),
      file_size: z.number().int().nonnegative().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    await zamestnanecFirmy(supabase, data.company_id, data.employee_id);
    if (!data.file_path.startsWith(`${data.company_id}/${data.employee_id}/`)) {
      throw new Error("Súbor nepatrí tomuto zamestnancovi.");
    }
    const { data: r, error } = await supabase
      .from("employee_documents")
      .insert({ ...data, kind: "ine" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return r;
  });

export const odkazNaDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const { data: dok } = await supabase
      .from("employee_documents")
      .select("employee_id, file_path, title")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!dok) throw new Error("Dokument nenájdený.");
    const { data: podpis, error } = await supabase.storage.from("employee-docs").createSignedUrl(dok.file_path, 120);
    if (error || !podpis) throw new Error("Dokument sa nepodarilo otvoriť.");
    await supabase.rpc("employee_log_access", { _employee_id: dok.employee_id, _action: "document" });
    return { url: podpis.signedUrl };
  });

export const zmazDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const { data: dok } = await supabase
      .from("employee_documents")
      .select("file_path")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!dok) throw new Error("Dokument nenájdený.");
    await supabase.storage.from("employee-docs").remove([dok.file_path]);
    const { error } = await supabase.from("employee_documents").delete().eq("id", data.id).eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ── Šablóny ────────────────────────────────────────────────────────────── */

const KLUCE = ["pracovna_zmluva", "dovp", "dopc", "brigadnicka", "vypoved", "potvrdenie_prijmu"] as const;

async function sablonyFirmy(supabase: any, companyId: string) {
  const { data } = await supabase.from("employee_doc_templates").select("key, title, body, updated_at").eq("company_id", companyId);
  const upravy = new Map<string, any>((data ?? []).map((r: any) => [r.key, r]));
  return KLUCE.map((key) => {
    const u = upravy.get(key);
    return {
      key,
      title: (u?.title as string) ?? NAZOV_SABLONY[key],
      body: (u?.body as string) ?? PREDVOLENE_SABLONY[key],
      upravena: Boolean(u),
      updated_at: (u?.updated_at as string) ?? null,
    };
  });
}

export const listSablon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    await overModul(context.supabase, data.company_id);
    return sablonyFirmy(context.supabase, data.company_id);
  });

export const ulozSablonu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Firma.extend({
      key: z.enum(KLUCE),
      title: z.string().trim().min(1).max(200),
      body: z.string().min(1).max(50_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const { error } = await supabase
      .from("employee_doc_templates")
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "company_id,key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const obnovSablonu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ key: z.enum(KLUCE) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const { error } = await supabase.from("employee_doc_templates").delete().eq("company_id", data.company_id).eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Dokument zo šablóny: vyplní tokeny, vyrobí PDF, uloží ho do kbelíka
 * `employee-docs` a zapíše ku karte. Rodné číslo sa odšifruje len vtedy,
 * keď ho šablóna naozaj obsahuje — a prístup sa zapíše do auditu.
 */
export const vyrobDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Firma.extend({
      employee_id: z.string().uuid(),
      key: z.enum(KLUCE),
      contract_id: z.string().uuid().nullish(),
      doplnky: z.record(z.string(), z.string().max(500)).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const zamestnanec = await zamestnanecFirmy(supabase, data.company_id, data.employee_id);
    const { data: firma } = await supabase
      .from("companies")
      .select("name, ico, dic, street, city, zip")
      .eq("id", data.company_id)
      .single();
    if (!firma) throw new Error("Firma nenájdená.");
    let zmluva: any = null;
    if (data.contract_id) {
      const { data: k } = await supabase
        .from("employee_contracts")
        .select("*")
        .eq("id", data.contract_id)
        .eq("employee_id", data.employee_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!k) throw new Error("Zmluva nenájdená.");
      zmluva = k;
    }
    const sablona = (await sablonyFirmy(supabase, data.company_id)).find((s) => s.key === data.key)!;

    let rodneCislo: string | null = null;
    if (/\{\{\s*zamestnanec\.rodne_cislo\s*\}\}/.test(sablona.body)) {
      const { data: riadky } = await supabase.rpc("employee_get_pii", { _employee_id: data.employee_id });
      rodneCislo = ((riadky as any[] | null)?.[0]?.rodne_cislo as string | null) ?? null;
    }
    // Doplnky smú prepísať len vlastné tokeny (výpoveď, príjem), nie údaje z karty.
    const doplnky = Object.fromEntries(
      Object.entries(data.doplnky ?? {}).filter(([k]) => k.startsWith("vypoved.") || k.startsWith("prijem.")),
    );
    const text = vyplnSablonu(
      sablona.body,
      hodnotyTokenov({ firma, zamestnanec: zamestnanec as any, zmluva, rodneCislo, dnes: dnesnyDatum(), doplnky }),
    );

    const { dokumentZoSablonyPdf } = await import("./zamestnanci-pdf.server");
    const meno = celeMeno(zamestnanec as any);
    const bajty = await dokumentZoSablonyPdf(text, `${firma.name} · ${sablona.title} · ${meno}`);
    const cesta = `${data.company_id}/${data.employee_id}/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("employee-docs")
      .upload(cesta, bajty, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`PDF sa nepodarilo uložiť: ${upErr.message}`);

    const { data: dok, error } = await supabase
      .from("employee_documents")
      .insert({
        company_id: data.company_id,
        employee_id: data.employee_id,
        contract_id: data.contract_id ?? null,
        kind: data.key,
        template_key: data.key,
        title: `${sablona.title} — ${meno}`,
        file_path: cesta,
        file_mime: "application/pdf",
        file_size: bajty.length,
      })
      .select("*")
      .single();
    if (error) {
      await supabase.storage.from("employee-docs").remove([cesta]);
      throw new Error(error.message);
    }
    await supabase.rpc("employee_log_access", { _employee_id: data.employee_id, _action: "document" });
    return dok;
  });

/* ── Mesačný export ─────────────────────────────────────────────────────── */

export const exportDochadzky = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ mesiac: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overModul(supabase, data.company_id);
    const [r, m] = data.mesiac.split("-").map(Number);
    const prvy = `${data.mesiac}-01`;
    const posledny = new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);

    const [zam, doch, nep, firma] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name, title_before, title_after, status").eq("company_id", data.company_id),
      supabase.from("employee_attendance").select("employee_id, work_date, time_from, time_to, break_minutes, hours, kind").eq("company_id", data.company_id).gte("work_date", prvy).lte("work_date", posledny),
      supabase.from("employee_absences").select("employee_id, kind, date_from, date_to, days").eq("company_id", data.company_id).lte("date_from", posledny).gte("date_to", prvy),
      supabase.from("companies").select("name").eq("id", data.company_id).single(),
    ]);
    for (const x of [zam, doch, nep]) if (x.error) throw new Error(x.error.message);

    // Do výkazu idú aktívni a každý, kto má v mesiaci nejaký záznam.
    const sZaznamom = new Set([...(doch.data ?? []), ...(nep.data ?? [])].map((x: any) => x.employee_id));
    const koho = (zam.data ?? []).filter((z: any) => z.status === "active" || sZaznamom.has(z.id));
    const suhrn = mesacnySuhrn(data.mesiac, koho as any, (doch.data ?? []) as any, (nep.data ?? []) as any);

    const { vykazDochadzkyPdf } = await import("./zamestnanci-pdf.server");
    const pdf = await vykazDochadzkyPdf({ firma: firma.data?.name ?? "", mesiac: data.mesiac, suhrn });
    await supabase.rpc("employee_log_export", { _company_id: data.company_id });
    return {
      csv: csvDochadzky(data.mesiac, suhrn),
      pdfBase64: Buffer.from(pdf).toString("base64"),
      suhrn,
    };
  });

export type { KlucSablony };
