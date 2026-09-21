import { navrhniZamestnanca, navrhniZmluvu, type RozpoznanyOstatny } from "./ostatne-doklady";

/**
 * Návrh väzieb pre doklad, ktorý prečítala AI: exekúcia k zamestnancovi,
 * leasing či úver k zmluve. Hľadá sa v predmete, zhrnutí aj odosielateľovi.
 * Keď si nie je istý (žiadna alebo viac zhôd), nenavrhne nič.
 */
export async function navrhniVazby(
  klient: any,
  companyId: string,
  r: Pick<RozpoznanyOstatny, "kind" | "sender" | "subject" | "summary">,
): Promise<{ employee_id?: string; financing_contract_id?: string }> {
  const text = [r.subject, r.summary, r.sender].filter(Boolean).join(" ");
  const vysledok: { employee_id?: string; financing_contract_id?: string } = {};
  if (r.kind === "exekucia") {
    const { data: firma } = await klient
      .from("companies")
      .select("module_employees")
      .eq("id", companyId)
      .maybeSingle();
    if (firma?.module_employees) {
      const { data: ludia } = await klient
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId);
      const id = navrhniZamestnanca(text, ludia ?? []);
      if (id) vysledok.employee_id = id;
    }
  }
  if (r.kind === "leasing_uver" || r.kind === "poistovna") {
    const { data: zmluvy } = await klient
      .from("financing_contracts")
      .select("id, contract_number")
      .eq("company_id", companyId);
    const id = navrhniZmluvu(text, zmluvy ?? []);
    if (id) vysledok.financing_contract_id = id;
  }
  return vysledok;
}
