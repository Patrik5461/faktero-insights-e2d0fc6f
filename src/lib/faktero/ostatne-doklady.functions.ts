import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DRUHY_KLUCE, bezpecneMeno, jeCestaDokladu, jeRozpoznaniePouzitelne } from "./ostatne-doklady";

/*
  Ostatné doklady. Všetko ide cez používateľského klienta, takže o tom, kto čo
  smie, rozhodujú politiky v databáze — mazať smie len správca firmy.
*/

const KBELIK = "other-docs";

const Udaje = z.object({
  kind: z.enum(DRUHY_KLUCE),
  sender: z.string().trim().max(255).nullable().optional(),
  subject: z.string().trim().max(500).nullable().optional(),
  received_date: z.string().date(),
  amount: z.number().finite().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  due_date: z.string().date().nullable().optional(),
  note: z.string().trim().max(5000).nullable().optional(),
});

const Priloha = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(255),
  mime: z.string().max(120).nullable().optional(),
  size: z.number().int().nonnegative().nullable().optional(),
});

function vMesiaci(month: string): { od: string; do_: string } {
  const [y, m] = month.split("-").map(Number);
  const od = `${y}-${String(m).padStart(2, "0")}-01`;
  const do_ = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return { od, do_ };
}

export const zoznamOstatnychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        stav: z.enum(["new", "processed", "exported", "all"]),
        month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
        kind: z.enum(DRUHY_KLUCE).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("other_documents")
      .select("*, other_document_files(id, name, mime, size, position)")
      .eq("company_id", data.company_id)
      .order("received_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.stav !== "all") q = q.eq("status", data.stav);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.month) {
      const { od, do_ } = vMesiaci(data.month);
      q = q.gte("received_date", od).lt("received_date", do_);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const detailOstatnehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doklad, error } = await context.supabase
      .from("other_documents")
      .select("*, other_document_files(id, name, mime, size, position, path)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doklad) throw new Error("Doklad neexistuje alebo naň nemáte právo.");
    return doklad;
  });

/**
 * Uloží nový doklad alebo zmeny. Nový doklad je vždy nespracovaný; stav sa
 * úpravou nemení (na to je `nastavStavOstatnychFn`). Prílohy nahráva prehliadač
 * rovno do úložiska — sem prídu len ich cesty a overí sa, že ležia v priečinku
 * tohto dokladu.
 */
export const ulozOstatnyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid(),
        novy: z.boolean(),
        udaje: Udaje,
        prilohy: z.array(Priloha).max(30).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    for (const p of data.prilohy) {
      if (!jeCestaDokladu(p.path, data.company_id, data.id)) {
        throw new Error("Príloha nepatrí k tomuto dokladu.");
      }
    }
    const udaje = {
      ...data.udaje,
      sender: data.udaje.sender || null,
      subject: data.udaje.subject || null,
      note: data.udaje.note || null,
      due_date: data.udaje.due_date || null,
      amount: data.udaje.amount ?? null,
      currency: data.udaje.currency ?? "EUR",
    };
    if (data.novy) {
      const { error } = await supabase.from("other_documents").insert({
        id: data.id,
        company_id: data.company_id,
        ...udaje,
        status: "new",
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: zmenene, error } = await supabase
        .from("other_documents")
        .update(udaje)
        .eq("id", data.id)
        .eq("company_id", data.company_id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!zmenene?.length) throw new Error("Doklad neexistuje alebo naň nemáte právo.");
    }
    if (data.prilohy.length) {
      const { count } = await supabase
        .from("other_document_files")
        .select("id", { count: "exact", head: true })
        .eq("document_id", data.id);
      const { error } = await supabase.from("other_document_files").insert(
        data.prilohy.map((p, i) => ({
          document_id: data.id,
          company_id: data.company_id,
          path: p.path,
          name: p.name,
          mime: p.mime ?? null,
          size: p.size ?? null,
          position: (count ?? 0) + i,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { id: data.id };
  });

export const odoberPrilohuOstatnehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: zmazane, error } = await context.supabase
      .from("other_document_files")
      .delete()
      .eq("id", data.id)
      .select("path");
    if (error) throw new Error(error.message);
    if (!zmazane?.length) throw new Error("Príloha sa nezmazala — už neexistuje alebo naň nemáte právo.");
    await context.supabase.storage.from(KBELIK).remove(zmazane.map((z) => z.path));
    return { ok: true };
  });

/** Odkaz na prílohu na 10 minút — kbelík je súkromný. */
export const odkazPrilohyOstatnehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), stiahnut: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p, error } = await context.supabase
      .from("other_document_files")
      .select("path, name")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Príloha neexistuje alebo naň nemáte právo.");
    const { data: s, error: e2 } = await context.supabase.storage
      .from(KBELIK)
      .createSignedUrl(p.path, 600, data.stiahnut ? { download: p.name } : undefined);
    if (e2 || !s) throw new Error(e2?.message ?? "Odkaz sa nepodarilo vytvoriť.");
    return { url: s.signedUrl };
  });

export const nastavStavOstatnychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        stav: z.enum(["new", "processed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const zdrojovy = data.stav === "processed" ? "new" : "processed";
    const { data: zmenene, error } = await supabase
      .from("other_documents")
      .update(
        data.stav === "processed"
          ? { status: "processed", processed_at: new Date().toISOString(), processed_by: userId }
          : { status: "new", processed_at: null, processed_by: null },
      )
      .eq("company_id", data.company_id)
      .eq("status", zdrojovy)
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    return { zmenene: zmenene?.length ?? 0 };
  });

export const zmazOstatnyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: prilohy } = await supabase
      .from("other_document_files")
      .select("path")
      .eq("document_id", data.id);
    // `delete()` bez práva nevráti chybu, len nula riadkov — preto `select`.
    const { data: zmazane, error } = await supabase
      .from("other_documents")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmazane?.length) {
      throw new Error("Doklad sa nezmazal — mazať smie len správca firmy.");
    }
    if (prilohy?.length) await supabase.storage.from(KBELIK).remove(prilohy.map((p) => p.path));
    return { ok: true };
  });

/** 15 MB — väčší list či predpis nebýva a telo požiadavky by bolo neúnosné. */
const MAX_NA_CITANIE = 15 * 1024 * 1024;

/**
 * Spustí prečítanie prílohy cez AI. Model číta aj 20 sekúnd a nginx po 30 s
 * spojenie zruší — čítanie preto beží ďalej samo a stránka sa na výsledok
 * dopytuje cez `stavRozpoznaniaOstatnehoFn`. Výsledok leží v priečinku
 * dokladu ako `.ai-<kluc>.json`; do príloh sa nedostane, tie sú v tabuľke.
 */
export const spustiRozpoznanieOstatnehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        document_id: z.string().uuid(),
        /** Súbor ako data URL — rovnako ako pri čítaní zmlúv. */
        subor: z.string().min(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: clen } = await supabase
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.company_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!clen) throw new Error("Do tejto firmy nemáte prístup.");

    const zhoda = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(data.subor);
    if (!zhoda || !zhoda[2]) throw new Error("Súbor sa nepodarilo prečítať.");
    const mime = (zhoda[1] || "application/pdf").trim();
    if (!/^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i.test(mime)) {
      throw new Error("Prečítať sa dá PDF alebo fotka.");
    }
    const base64 = zhoda[3] ?? "";
    const velkost = Math.floor((base64.length * 3) / 4);
    if (!velkost) throw new Error("Súbor je prázdny.");
    if (velkost > MAX_NA_CITANIE) throw new Error("Na prečítanie je súbor väčší než 15 MB.");

    const kluc = crypto.randomUUID();
    const cesta = `${data.company_id}/${data.document_id}/.ai-${kluc}.json`;
    void (async () => {
      let vysledok: Record<string, unknown>;
      try {
        const { precitajOstatny } = await import("./ostatne-doklady-citanie.server");
        vysledok = { ok: true, rozpoznanie: await precitajOstatny(base64, mime) };
      } catch (e: any) {
        vysledok = { ok: false, chyba: e?.message ?? "Dokument sa nepodarilo prečítať." };
      }
      const { error } = await supabase.storage
        .from(KBELIK)
        .upload(cesta, Buffer.from(JSON.stringify(vysledok)), {
          contentType: "application/json",
          upsert: true,
        });
      if (error) console.error("[ostatne] výsledok čítania sa neuložil:", error.message);
    })();
    return { kluc };
  });

/** Výsledok čítania. Kým nie je, vracia `hotovo: false`; po prečítaní sa zmaže. */
export const stavRozpoznaniaOstatnehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        document_id: z.string().uuid(),
        kluc: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const cesta = `${data.company_id}/${data.document_id}/.ai-${data.kluc}.json`;
    const { data: subor } = await context.supabase.storage.from(KBELIK).download(cesta);
    if (!subor) return { hotovo: false as const };
    const obsah = JSON.parse(await subor.text());
    await context.supabase.storage.from(KBELIK).remove([cesta]);
    return { hotovo: true as const, ...obsah };
  });

/**
 * Ostatný doklad z mobilnej appky: nafotené strany (spojené do PDF) alebo
 * vybraný súbor. Doklad vznikne hneď — appka nemusí čakať na AI — a údaje
 * doplní čítanie na pozadí. Nič, čo už je vyplnené, sa neprepíše.
 */
export const ulozOstatnyZAppkyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        subor: z.string().min(100),
        nazov: z.string().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const zhoda = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(data.subor);
    if (!zhoda || !zhoda[2]) throw new Error("Súbor sa nepodarilo prečítať.");
    const mime = (zhoda[1] || "application/pdf").trim();
    if (!/^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i.test(mime)) {
      throw new Error("Uložiť sa dá PDF alebo fotka.");
    }
    const base64 = zhoda[3] ?? "";
    const bajty = Buffer.from(base64, "base64");
    if (!bajty.length) throw new Error("Súbor je prázdny.");
    if (bajty.length > MAX_NA_CITANIE) throw new Error("Súbor je väčší než 15 MB.");

    const id = crypto.randomUUID();
    const dnes = new Date().toISOString().slice(0, 10);
    const pripona = mime === "application/pdf" ? "pdf" : mime.split("/")[1]!.replace("jpeg", "jpg");
    const meno = data.nazov?.trim() || `doklad-${dnes}.${pripona}`;
    const cesta = `${data.company_id}/${id}/${Date.now()}-${bezpecneMeno(meno)}`;

    const { error: chybaDokladu } = await supabase.from("other_documents").insert({
      id,
      company_id: data.company_id,
      kind: "ine",
      subject: "Doklad z mobilnej appky",
      received_date: dnes,
      status: "new",
      created_by: userId,
    });
    if (chybaDokladu) throw new Error(chybaDokladu.message);

    const { error: chybaNahratia } = await supabase.storage
      .from(KBELIK)
      .upload(cesta, bajty, { contentType: mime, upsert: false });
    if (chybaNahratia) {
      await supabase.from("other_documents").delete().eq("id", id);
      throw new Error(`Súbor sa nepodarilo uložiť: ${chybaNahratia.message}`);
    }
    await supabase.from("other_document_files").insert({
      document_id: id,
      company_id: data.company_id,
      path: cesta,
      name: meno,
      mime,
      size: bajty.length,
      position: 0,
    });

    void (async () => {
      try {
        const { precitajOstatny } = await import("./ostatne-doklady-citanie.server");
        const r = await precitajOstatny(base64, mime);
        if (!jeRozpoznaniePouzitelne(r)) return;
        const { data: teraz } = await supabase
          .from("other_documents")
          .select("kind, sender, subject, amount, currency, due_date, note")
          .eq("id", id)
          .maybeSingle();
        if (!teraz) return;
        const zmeny: Partial<{ kind: string; sender: string; subject: string; amount: number; currency: string; due_date: string; note: string }> = {};
        if (teraz.kind === "ine" && r.kind !== "ine") zmeny.kind = r.kind;
        if (!teraz.sender && r.sender) zmeny.sender = r.sender;
        if (teraz.subject === "Doklad z mobilnej appky" && r.subject) zmeny.subject = r.subject;
        if (teraz.amount == null && r.amount != null) {
          zmeny.amount = r.amount;
          if (r.currency) zmeny.currency = r.currency;
        }
        if (!teraz.due_date && r.due_date) zmeny.due_date = r.due_date;
        if (!teraz.note && r.summary) zmeny.note = r.summary;
        if (Object.keys(zmeny).length) {
          await supabase.from("other_documents").update(zmeny).eq("id", id);
        }
      } catch (e: any) {
        console.warn("[ostatne] čítanie dokladu z appky zlyhalo:", String(e?.message ?? e).slice(0, 200));
      }
    })();

    return { id };
  });

export const pocetNespracovanychOstatnychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { count, error } = await context.supabase
      .from("other_documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", data.company_id)
      .eq("status", "new");
    if (error) throw new Error(error.message);
    return { pocet: count ?? 0 };
  });

/**
 * ZIP pre účtovníka: súpis v CSV a všetky prílohy v priečinku podľa dokladu.
 * S `oznacit` sa doklady zapíšu ako odovzdané.
 */
export const exportOstatnychZipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        oznacit: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doklady, error } = await supabase
      .from("other_documents")
      .select("*, other_document_files(path, name, position)")
      .eq("company_id", data.company_id)
      .in("id", data.ids)
      .order("received_date");
    if (error) throw new Error(error.message);
    if (!doklady?.length) throw new Error("Žiadne doklady na export");

    const { balikOstatnych } = await import("./ostatne-doklady-balik.server");
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    await balikOstatnych(zip, doklady as any, supabase);
    const base64 = await zip.generateAsync({ type: "base64" });

    if (data.oznacit) {
      await supabase
        .from("other_documents")
        .update({ status: "exported", exported_at: new Date().toISOString() })
        .eq("company_id", data.company_id)
        .in(
          "id",
          doklady.map((d) => d.id),
        );
    }
    return {
      base64,
      filename: `ostatne-doklady-${new Date().toISOString().slice(0, 10)}.zip`,
      count: doklady.length,
    };
  });

