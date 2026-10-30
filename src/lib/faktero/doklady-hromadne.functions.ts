import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
/*
  Hromadná akcia v zoznamoch dokladov (bločky, prijaté, vystavené, iné doklady).

  Jedno volanie = jedna zmena na všetkých označených. Všetko ide cez klienta
  prihláseného (RLS a role rozhodujú, čo smie). Účtovné údaje sa na
  odovzdanom, zamknutom doklade a v uzavretom období nemenia — také doklady sa
  preskočia a povie sa, koľko a prečo. Vlastný stav, štítky a komentár sa
  menia vždy: do účtovníctva nejdú.
*/

const kod = z.string().trim().max(30).nullable();

const akcia = z.discriminatedUnion("typ", [
  z.object({ typ: z.literal("predkontacia"), kod }),
  z.object({ typ: z.literal("clenenie"), kod }),
  z.object({ typ: z.literal("kv"), kod: z.string().trim().max(5).nullable() }),
  z.object({ typ: z.literal("platba"), kod: z.string().trim().max(30).nullable() }),
  z.object({ typ: z.literal("uctovnaPoznamka"), text: z.string().max(240).nullable() }),
  z.object({ typ: z.literal("komentar"), text: z.string().max(1000).nullable() }),
  z.object({ typ: z.literal("stav"), stavId: z.string().uuid().nullable() }),
  z.object({
    typ: z.literal("stitok"),
    pridat: z.string().trim().max(40).optional(),
    odobrat: z.string().trim().max(40).optional(),
  }),
  z.object({
    typ: z.literal("uhrada"),
    uhradene: z.boolean(),
    datum: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
]);

const TABULKA = {
  prijata: "purchase_invoices",
  doklad: "expense_documents",
  vystavena: "invoices",
  ostatny: "other_documents",
} as const;

const UCTOVNE = new Set(["predkontacia", "clenenie", "kv", "platba", "uctovnaPoznamka"]);

export const hromadneDokladyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        agenda: z.enum(["prijata", "doklad", "vystavena", "ostatny"]),
        ids: z.array(z.string().uuid()).min(1).max(500),
        akcia,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { dovodZamku, upravStitky, stavPoUhrade, NAZOV_ZAMKU } =
      await import("./doklady-hromadne");
    const a = data.akcia;
    const ag = data.agenda;
    const tabulka = TABULKA[ag];

    // Čo ktorá agenda vôbec pozná.
    if (ag === "ostatny" && a.typ !== "stitok")
      throw new Error("Iné doklady majú z hromadných úprav len štítky.");
    if (a.typ === "uhrada" && ag !== "prijata" && ag !== "vystavena")
      throw new Error("Úhradu sa dá označiť len na faktúrach.");
    if (a.typ === "komentar" && ag === "ostatny") throw new Error("Iné doklady komentár nemajú.");

    const stlpce = {
      prijata:
        "id, invoice_number, status, exported_at, locked_at, issue_date, deleted_at, stitky, zauctovane_at",
      doklad:
        "id, document_number, supplier_name, status, exported_at, locked_at, issue_date, stitky, zauctovane_at",
      vystavena: "id, invoice_number, status, exported_at, issue_date, deleted_at, stitky, sent_at",
      ostatny: "id, subject, stitky",
    }[ag];
    const [{ data: riadky, error }, { data: firma }, { data: logy }] = await Promise.all([
      supabase.from(tabulka).select(stlpce).eq("company_id", data.company_id).in("id", data.ids),
      supabase.from("companies").select("locked_until").eq("id", data.company_id).maybeSingle(),
      ag === "vystavena" && UCTOVNE.has(a.typ)
        ? supabase
            .from("export_logs")
            .select("invoice_id")
            .eq("company_id", data.company_id)
            .eq("status", "ok")
            .in("invoice_id", data.ids)
        : Promise.resolve({ data: [] }),
    ]);
    if (error) throw new Error(error.message);
    const vPohode = new Set(((logy ?? []) as any[]).map((l) => l.invoice_id));

    if (a.typ === "stav" && a.stavId) {
      const { data: s } = await supabase
        .from("stavy_dokladov")
        .select("id")
        .eq("company_id", data.company_id)
        .eq("id", a.stavId)
        .maybeSingle();
      if (!s) throw new Error("Stav dokladu sa nenašiel.");
    }

    const preskocene: string[] = [];
    const ok: any[] = [];
    const meno = (r: any) =>
      r.invoice_number || r.document_number || r.supplier_name || r.subject || "doklad";
    for (const r of (riadky ?? []) as any[]) {
      if (r.deleted_at) continue;
      if (UCTOVNE.has(a.typ)) {
        const z = dovodZamku(r, firma?.locked_until ?? null, vPohode.has(r.id));
        if (z) {
          preskocene.push(`${meno(r)}: ${NAZOV_ZAMKU[z]}`);
          continue;
        }
      }
      ok.push(r);
    }

    let zmenenych = 0;
    const uprav = async (ids: string[], zmena: Record<string, unknown>) => {
      if (!ids.length) return;
      const { data: hotove, error: e2 } = await supabase
        .from(tabulka)
        .update(zmena)
        .eq("company_id", data.company_id)
        .in("id", ids)
        .select("id");
      if (e2) throw new Error(e2.message);
      zmenenych += (hotove ?? []).length;
    };
    const ids = ok.map((r) => r.id);

    switch (a.typ) {
      case "predkontacia":
        await uprav(ids, { pohoda_predkontacia: a.kod || null });
        // Bloček s určenou predkontáciou je zaúčtovaný (ako pri „Predkontácia" v Dokladoch).
        if (ag === "doklad" && a.kod)
          await supabase
            .from("expense_documents")
            .update({ zauctovane_at: new Date().toISOString(), zauctoval: context.userId })
            .eq("company_id", data.company_id)
            .in("id", ids)
            .is("zauctovane_at", null);
        break;
      case "clenenie":
        await uprav(ids, { pohoda_clenenie_dph: a.kod || null });
        break;
      case "kv":
        await uprav(ids, { kv_clenenie: a.kod && a.kod !== "auto" ? a.kod : null });
        break;
      case "platba":
        await uprav(ids, { payment_method: a.kod || null });
        break;
      case "uctovnaPoznamka":
        await uprav(ids, { int_poznamka: a.text?.trim() || null });
        break;
      case "komentar":
        await uprav(ids, { komentar: a.text?.trim() || null });
        break;
      case "stav":
        await uprav(ids, { stav_id: a.stavId });
        break;
      case "stitok": {
        // Riadky s rovnakým výsledkom idú jedným zápisom.
        const skupiny = new Map<string, { stitky: string[]; ids: string[] }>();
        for (const r of ok) {
          const v = upravStitky(r.stitky, a.pridat, a.odobrat);
          if (v.plne) {
            preskocene.push(`${meno(r)}: má už päť štítkov`);
            continue;
          }
          if (JSON.stringify(v.stitky) === JSON.stringify(r.stitky ?? [])) continue;
          const k = JSON.stringify(v.stitky);
          const g = skupiny.get(k) ?? { stitky: v.stitky, ids: [] };
          g.ids.push(r.id);
          skupiny.set(k, g);
        }
        for (const g of skupiny.values()) await uprav(g.ids, { stitky: g.stitky });
        // Nový štítok sa zapíše aj do číselníka firmy, nech sa ponúka nabudúce.
        if (a.pridat?.trim())
          await supabase.from("stitky_firmy").upsert(
            {
              company_id: data.company_id,
              nazov: a.pridat.trim().slice(0, 40),
              created_by: context.userId,
            },
            { onConflict: "company_id,nazov", ignoreDuplicates: true },
          );
        break;
      }
      case "uhrada": {
        const agenda = ag as "prijata" | "vystavena";
        const skupiny = new Map<string, string[]>();
        for (const r of ok) {
          const novy = stavPoUhrade(agenda, r, a.uhradene);
          if (!novy) {
            if (r.status === "cancelled" || r.status === "draft")
              preskocene.push(`${meno(r)}: ${r.status === "draft" ? "koncept" : "stornovaná"}`);
            continue;
          }
          skupiny.set(novy, [...(skupiny.get(novy) ?? []), r.id]);
        }
        const datum = a.datum ?? dnesBratislava();
        for (const [status, g] of skupiny) {
          if (agenda === "prijata")
            await uprav(g, { status, payment_date: a.uhradene ? datum : null });
          else
            await uprav(g, {
              status,
              paid_at: a.uhradene ? new Date(`${datum}T12:00:00Z`).toISOString() : null,
            });
        }
        break;
      }
    }
    return { zmenenych, preskocene };
  });
