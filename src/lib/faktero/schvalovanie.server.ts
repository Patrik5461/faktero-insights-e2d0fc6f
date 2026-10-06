import {
  nacitajUrovne,
  rozvinUrovne,
  vyberCestu,
  type AgendaSchvalovania,
  type Cesta,
} from "./schvalovanie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

const TABULKY: Record<AgendaSchvalovania, { tabulka: string; ico: string; suma: string; cislo: string; partner: string }> = {
  doklad: { tabulka: "expense_documents", ico: "supplier_ico", suma: "total_amount", cislo: "document_number", partner: "supplier_name" },
  prijata: { tabulka: "purchase_invoices", ico: "supplier_ico", suma: "amount_total", cislo: "invoice_number", partner: "supplier_name" },
  vystavena: { tabulka: "invoices", ico: "customer_ico", suma: "total", cislo: "invoice_number", partner: "customer_name" },
};

export function tabulkaAgendy(a: AgendaSchvalovania) {
  return TABULKY[a];
}

export async function nastavenieFirmy(supabase: Klient, companyId: string) {
  const { data } = await supabase
    .from("companies")
    .select("schvalovanie_zapnute, schvalovanie_od, schvalovanie_agendy, schvalovanie_auto_pod, schvalovanie_odoslanie")
    .eq("id", companyId)
    .maybeSingle();
  return {
    zapnute: Boolean(data?.schvalovanie_zapnute),
    od: (data?.schvalovanie_od ?? null) as string | null,
    agendy: (data?.schvalovanie_agendy ?? []) as string[],
    autoPod: data?.schvalovanie_auto_pod != null ? Number(data.schvalovanie_auto_pod) : null,
    odoslanie: Boolean(data?.schvalovanie_odoslanie),
  };
}

/**
 * Doklad bez záznamu o schvaľovaní dostane cestu podľa pravidiel (alebo
 * jednoduché schvaľovanie). Doklady spred zapnutia sa neschvaľujú — tak to
 * robí aj Doklado. Pod hranicou sumy sa schváli sám.
 *
 * Zapisuje servisný klient — volá sa až po overení, že firma patrí
 * prihlásenému.
 */
export async function zabezpecSchvalovanie(
  admin: Klient,
  companyId: string,
  agenda: AgendaSchvalovania,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  const n = await nastavenieFirmy(admin, companyId);
  if (!n.zapnute || !n.agendy.includes(agenda)) return;
  const t = TABULKY[agenda];
  const [{ data: doklady }, { data: existujuce }, { data: cesty }] = await Promise.all([
    admin
      .from(t.tabulka)
      .select(`id, created_at, job_id, ${t.ico}, ${t.suma}, pohoda_predkontacia${agenda === "vystavena" ? ", status" : ""}`)
      .eq("company_id", companyId)
      .in("id", ids),
    admin.from("schvalovanie").select("doklad_id").eq("agenda", agenda).in("doklad_id", ids),
    admin.from("schvalovacie_cesty").select("*").eq("company_id", companyId),
  ]);
  const uz = new Set((existujuce ?? []).map((r: any) => r.doklad_id));
  // Manažéri zákaziek pre „manažér zákazky" v ceste.
  const jobIds = [...new Set((doklady ?? []).map((d: any) => d.job_id).filter(Boolean))];
  const { data: zakazky } = jobIds.length
    ? await admin.from("jobs").select("id, manazer_id").in("id", jobIds)
    : { data: [] };
  const manazer = new Map((zakazky ?? []).map((j: any) => [j.id, j.manazer_id]));
  const vsetkyCesty: Cesta[] = (cesty ?? []).map((c: any) => ({ ...c, urovne: nacitajUrovne(c.urovne) }));
  const nove = (doklady ?? []).filter(
    (d: any) =>
      !uz.has(d.id) &&
      (!n.od || String(d.created_at) >= n.od) &&
      !(agenda === "vystavena" && d.status === "draft"),
  );
  for (const d of nove) {
    const suma = Number(d[t.suma] ?? 0);
    const cesta = vyberCestu(vsetkyCesty, {
      agenda,
      ico: d[t.ico],
      suma,
      predkontacia: d.pohoda_predkontacia,
    });
    const auto = n.autoPod != null && Math.abs(suma) < n.autoPod;
    const { data: zaznam } = await admin
      .from("schvalovanie")
      .insert({
        company_id: companyId,
        agenda,
        doklad_id: d.id,
        cesta_id: cesta?.id ?? null,
        urovne: rozvinUrovne(cesta?.urovne ?? [], manazer.get(d.job_id) as string | undefined),
        schvalena_uroven: auto ? Math.max(1, cesta?.urovne.length ?? 1) : 0,
        stav: auto ? "schvaleny" : "caka",
      })
      .select("id")
      .maybeSingle();
    if (zaznam?.id && auto) {
      await admin.from("schvalovanie_historia").insert({
        schvalovanie_id: zaznam.id,
        company_id: companyId,
        akcia: "automaticky",
        poznamka: `Suma pod ${n.autoPod} — schválené automaticky`,
      });
    }
  }
}

/**
 * Ktoré z dokladov smú ísť ďalej (export, úhrada, odoslanie). Keď
 * schvaľovanie nie je zapnuté, všetky; doklady spred zapnutia tiež.
 */
export async function schvaleneIds(
  supabase: Klient,
  companyId: string,
  agenda: AgendaSchvalovania,
  doklady: { id: string; created_at?: string | null }[],
): Promise<Set<string>> {
  const vsetky = new Set(doklady.map((d) => String(d.id)));
  if (!doklady.length) return vsetky;
  const n = await nastavenieFirmy(supabase, companyId);
  if (!n.zapnute || !n.agendy.includes(agenda)) return vsetky;
  const ids = doklady.map((d) => String(d.id));
  const { data } = await supabase
    .from("schvalovanie")
    .select("doklad_id, stav")
    .eq("agenda", agenda)
    .in("doklad_id", ids);
  const stav = new Map((data ?? []).map((r: any) => [String(r.doklad_id), String(r.stav)]));
  return new Set(
    doklady
      .filter((d) => {
        const s = stav.get(String(d.id));
        if (s) return s === "schvaleny";
        // Bez záznamu: spred zapnutia áno, novší ešte nikto nepriradil — nie.
        return Boolean(n.od && d.created_at && String(d.created_at) < n.od);
      })
      .map((d) => String(d.id)),
  );
}

/**
 * Z riadkov nechá len tie, ktoré smú ísť ďalej; predtým doplní chýbajúce
 * záznamy (automatické schválenie pod sumou, cesta podľa pravidiel).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lenSchvalene<T = any>(
  supabase: Klient,
  companyId: string,
  agenda: AgendaSchvalovania,
  riadky: T[],
): Promise<{ ok: T[]; cakaju: number }> {
  if (!riadky.length) return { ok: riadky, cakaju: 0 };
  const n = await nastavenieFirmy(supabase, companyId);
  if (!n.zapnute || !n.agendy.includes(agenda)) return { ok: riadky, cakaju: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rr = riadky as unknown as { id: string; created_at?: string | null }[];
  await zabezpecSchvalovanie(supabaseAdmin, companyId, agenda, rr.map((r) => r.id));
  const povolene = await schvaleneIds(supabase, companyId, agenda, rr);
  const ok = riadky.filter((_, i) => povolene.has(String(rr[i].id)));
  return { ok, cakaju: riadky.length - ok.length };
}

/**
 * Vystavená faktúra sa smie odoslať (mailom, eFaktúrou) až po schválení,
 * ak si to firma zapla. Vyhodí zrozumiteľnú chybu, inak nič.
 */
export async function overOdoslanie(companyId: string, invoiceId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const n = await nastavenieFirmy(supabaseAdmin, companyId);
  if (!n.zapnute || !n.odoslanie || !n.agendy.includes("vystavena")) return;
  const { data: f } = await supabaseAdmin
    .from("invoices")
    .select("id, created_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!f) return;
  await zabezpecSchvalovanie(supabaseAdmin, companyId, "vystavena", [invoiceId]);
  const ok = await schvaleneIds(supabaseAdmin, companyId, "vystavena", [f as any]);
  if (!ok.has(invoiceId)) throw new Error("Faktúra čaká na schválenie — odoslať ju možno až po schválení.");
}
