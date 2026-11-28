/**
 * Daňový kalendár firmy — zber faktov z dát a výpočet termínov (FAK-667).
 * Volá ho stránka (klient prihláseného, RLS) aj zvonček (servisný kľúč po
 * overení členstva).
 */
import { z } from "zod";
import { terminyFirmy, type FaktyFirmy, type NastaveniaKalendara } from "./danovy-kalendar";

const Nastavenia = z
  .object({
    dph_obdobie: z.enum(["mesacne", "stvrtrocne"]),
    sv_stvrtrocne: z.boolean(),
    preddavky_dzp: z.enum(["ziadne", "stvrtrocne", "mesacne"]),
    odklad_dp: z.union([z.literal(0), z.literal(3), z.literal(6)]),
    nehnutelnost_priznanie: z.boolean(),
    dmv_preddavky: z.enum(["ziadne", "stvrtrocne", "mesacne"]),
    vyplatny_den: z.number().int().min(1).max(31).nullable(),
    cz_poradca: z.boolean(),
    cz_zalohy: z.enum(["ziadne", "pololetne", "stvrtrocne"]),
  })
  .partial();

const mesiac = (d: string | null | undefined) => (d ? String(d).slice(0, 7) : null);

export async function kalendarFirmy(sb: any, companyId: string, od: string, doo: string) {
  const { data: f, error } = await sb
    .from("companies")
    .select("id, name, country, vat_payer, vat_scheme, module_employees, danovy_kalendar")
    .eq("id", companyId)
    .single();
  if (error || !f) throw new Error(error?.message ?? "Firma sa nenašla.");
  const krajina = String(f.country ?? "SK").toUpperCase() === "CZ" ? "CZ" : "SK";
  // Fakty za rok pred začiatkom kalendára (súhrnný výkaz, § 7, OSS).
  const odF = `${Number(od.slice(0, 4)) - 1}${od.slice(4)}`;
  const [eu, oss, s7, voz, zam] = await Promise.all([
    sb.from("invoices").select("delivery_date").eq("company_id", f.id).not("eu_plnenie", "is", null)
      .not("status", "in", "(draft,cancelled)").is("deleted_at", null).gte("delivery_date", odF).limit(1000),
    sb.from("invoices").select("id", { count: "exact", head: true }).eq("company_id", f.id).eq("oss", true)
      .is("deleted_at", null).gte("delivery_date", odF),
    sb.from("purchase_invoices").select("delivery_date").eq("company_id", f.id)
      .or("reverse_charge.eq.true,dph_rezim.in.(samozdanenie,nadobudnutie)")
      .not("status", "in", "(draft,cancelled)").is("deleted_at", null).gte("delivery_date", odF).limit(1000),
    sb.from("vehicles").select("id", { count: "exact", head: true }).eq("company_id", f.id).neq("active", false),
    sb.from("employees").select("id", { count: "exact", head: true }).eq("company_id", f.id)
      .or(`end_date.is.null,end_date.gte.${od}`),
  ]);
  const fakty: FaktyFirmy = {
    krajina,
    platitelDph: Boolean(f.vat_payer),
    schemaDph: f.vat_scheme ?? null,
    maZamestnancov: f.module_employees !== false && (zam.count ?? 0) > 0,
    maVozidla: (voz.count ?? 0) > 0,
    maOss: (oss.count ?? 0) > 0,
    mesiaceEu: [...new Set((eu.data ?? []).map((r: any) => mesiac(r.delivery_date)).filter(Boolean))] as string[],
    mesiace7: [...new Set((s7.data ?? []).map((r: any) => mesiac(r.delivery_date)).filter(Boolean))] as string[],
  };
  const p = Nastavenia.safeParse(f.danovy_kalendar ?? {});
  const nastavenia = (p.success ? p.data : {}) as NastaveniaKalendara;
  return { firma: f.name as string, fakty, nastavenia, terminy: terminyFirmy(fakty, nastavenia, od, doo) };
}
