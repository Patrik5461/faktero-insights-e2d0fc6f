import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/*
  Export zaúčtovaných dokladov do iných programov než Pohoda: KROS Omega
  (účtovné doklady EUD), Money S3, ABRA Flexi a zaúčtovaná súpiska CSV.
  Vystavené faktúry, prijaté faktúry aj bločky — s predkontáciou,
  členením, strediskom, zákazkou a činnosťou, ako ich nastavila firma.
*/

import {
  PROGRAMY_UCTOVANIA,
  type AgendaExportu,
  type ProgramUctovania,
} from "./uctovanie-programy";

const Vstup = z.object({
  company_id: z.string().uuid(),
  program: z.enum(["omega", "money_s3", "flexi", "csv"]),
  agenda: z.enum(["vystavena", "prijata", "doklad"]),
  ids: z.array(z.string().uuid()).min(1).max(1000),
  /** Zapísať doklady ako odovzdané (zamknú sa, konektor ich už nepošle). */
  oznacit: z.boolean().optional(),
});

const NAZOV_AGENDY: Record<AgendaExportu, string> = {
  vystavena: "vystavene",
  prijata: "prijate",
  doklad: "blocky",
};

export const exportUctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context as any;
    const { data: firma, error: fErr } = await supabase
      .from("companies")
      .select("*")
      .eq("id", data.company_id)
      .single();
    if (fErr || !firma) throw new Error("Firma nenájdená");

    const { nacitajNaUctovanie, kodyUctovania } = await import("./zauctovanie-export.server");
    const vsetky = await nacitajNaUctovanie(supabase, firma, data.agenda, data.ids);
    const preskocene: string[] = [];

    // Bloček ide do účtovníctva až po kontrole, samofaktúra až po odsúhlasení.
    let kandidati = vsetky;
    if (data.agenda === "doklad") {
      const { data: stavy } = await supabase
        .from("expense_documents")
        .select("id, status, document_number")
        .in(
          "id",
          vsetky.map((d) => d.id),
        );
      const nove = new Set(
        (stavy ?? []).filter((s: any) => s.status === "new").map((s: any) => s.id),
      );
      kandidati = vsetky.filter((d) =>
        nove.has(d.id) ? (preskocene.push(`${d.cislo || "bloček"} — nespracovaný`), false) : true,
      );
    } else if (data.agenda === "prijata") {
      const { zapocitatelna } = await import("./samofakturacia");
      const { data: riadky } = await supabase
        .from("purchase_invoices")
        .select("id, samofakturacia, samofakturacia_stav")
        .in(
          "id",
          vsetky.map((d) => d.id),
        );
      const zle = new Set(
        (riadky ?? []).filter((r: any) => !zapocitatelna(r)).map((r: any) => r.id),
      );
      kandidati = vsetky.filter((d) =>
        zle.has(d.id) ? (preskocene.push(`${d.cislo} — neodsúhlasená samofaktúra`), false) : true,
      );
    }
    const { ok, cakaju } = await (
      await import("./schvalovanie.server")
    ).lenSchvalene(supabase, data.company_id, data.agenda, kandidati);
    if (cakaju) preskocene.push(`${cakaju} čaká na schválenie`);
    if (!ok.length) throw new Error(preskocene.join(" · ") || "Nie je čo vyviezť.");

    const kody = await kodyUctovania(supabase, data.company_id);
    const nastavenia =
      ((firma.uctovanie_nastavenia ?? {}) as Record<string, any>)[data.program] ?? {};
    let obsah: string;
    let vynechane: string[] = [];
    if (data.program === "omega") {
      const { buildOmegaUctovanie } = await import("./export-omega-uctovanie");
      const r = buildOmegaUctovanie({ firma, doklady: ok, kody, nastavenia });
      obsah = r.obsah;
      vynechane = r.preskocene;
    } else if (data.program === "money_s3") {
      const { buildMoneyS3Uctovanie } = await import("./export-money-uctovanie");
      const r = buildMoneyS3Uctovanie({ firma, doklady: ok, kody, nastavenia });
      obsah = r.xml;
      vynechane = r.preskocene;
    } else if (data.program === "flexi") {
      const { buildFlexiUctovanie } = await import("./export-flexi-uctovanie");
      const r = buildFlexiUctovanie({ firma, doklady: ok, kody, nastavenia });
      obsah = r.xml;
      vynechane = r.preskocene;
    } else {
      const { buildCsvUctovanie } = await import("./export-csv-uctovanie");
      obsah = buildCsvUctovanie({ doklady: ok, kody });
    }

    // Doklad, ktorý do súboru neprešiel, sa nesmie tváriť ako odovzdaný.
    const vynechaneCisla = new Set(vynechane.map((v) => String(v).split(" — ")[0]));
    const vyvezene = ok.filter((d) => !vynechaneCisla.has(d.cislo));
    if (!vyvezene.length) throw new Error([...preskocene, ...vynechane].join(" · "));

    const def = PROGRAMY_UCTOVANIA.find((p) => p.program === data.program)!;
    const den = new Date().toISOString().slice(0, 10);
    const fileName = `${data.program}-${NAZOV_AGENDY[data.agenda]}-${den}.${def.pripona}`;
    const datumy = vyvezene
      .map((d) => d.datumVystavenia)
      .filter(Boolean)
      .sort() as string[];

    const { data: job } = await supabase
      .from("export_jobs")
      .insert({
        company_id: data.company_id,
        created_by: userId,
        format: def.format,
        target_system:
          data.program === "omega" ? "omega" : data.program === "money_s3" ? "money" : "other",
        status: "completed",
        invoice_count: vyvezene.length,
        date_from: datumy[0] ?? null,
        date_to: datumy[datumy.length - 1] ?? null,
        file_name: fileName,
        file_content: obsah,
      })
      .select("id")
      .single();

    if (data.oznacit) {
      const teraz = new Date().toISOString();
      const ids = vyvezene.map((d) => d.id);
      if (data.agenda === "vystavena") {
        if (job?.id)
          await supabase.from("export_logs").insert(
            vyvezene.map((d) => ({
              export_job_id: job.id,
              company_id: data.company_id,
              invoice_id: d.id,
              invoice_number: d.cislo,
              status: "ok",
            })),
          );
      } else {
        const tabulka = data.agenda === "prijata" ? "purchase_invoices" : "expense_documents";
        await supabase
          .from(tabulka)
          .update({ exported_at: teraz, ...(job?.id ? { export_job_id: job.id } : {}) })
          .in("id", ids);
      }
    }

    return {
      fileName,
      content: obsah,
      mime: def.mime,
      encoding: def.encoding,
      pocet: vyvezene.length,
      preskocene: [...preskocene, ...vynechane],
    };
  });

/** Účtovný program firmy a jeho nastavenia. */
export const programUctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        program: z.enum(["pohoda", "omega", "money_s3", "flexi", "csv"]).optional(),
        nastavenia: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: f, error } = await supabase
      .from("companies")
      .select("uctovny_program, uctovanie_nastavenia")
      .eq("id", data.company_id)
      .single();
    if (error) throw new Error(error.message);
    if (data.program || data.nastavenia) {
      const program = data.program ?? f.uctovny_program;
      const zmena: Record<string, unknown> = {};
      if (data.program) zmena.uctovny_program = data.program;
      if (data.nastavenia)
        zmena.uctovanie_nastavenia = {
          ...(f.uctovanie_nastavenia ?? {}),
          [program]: data.nastavenia,
        };
      // RLS pustí zápis len tomu, kto smie meniť firmu.
      const { error: e2 } = await supabase
        .from("companies")
        .update(zmena)
        .eq("id", data.company_id);
      if (e2) throw new Error(e2.message);
      return {
        program: (data.program ?? f.uctovny_program) as ProgramUctovania | "pohoda",
        nastavenia: {
          ...(f.uctovanie_nastavenia ?? {}),
          ...(data.nastavenia ? { [program]: data.nastavenia } : {}),
        },
      };
    }
    return {
      program: f.uctovny_program as ProgramUctovania | "pohoda",
      nastavenia: (f.uctovanie_nastavenia ?? {}) as Record<string, Record<string, unknown>>,
    };
  });
