/*
  Prijatá faktúra, ktorá nepatrí firme — serverová časť: zistenie príznaku
  pri vzniku faktúry, ponuka firiem na presun a samotný presun.

  Bezpečnosť presunu:
  - Firmy na presun sa hľadajú len medzi tými, kde smie prihlásený
    zapisovať doklady (`firmy_s_pravom('doklady', true)`), a čítajú sa cez
    jeho RLS. Iné firmy sa vôbec nehľadajú — nedá sa tak ani nepriamo zistiť,
    či firma s daným IČO vo Faktere je (nahratím vymyslenej faktúry by sa
    inak dal Faktero „opýtať“ na ľubovoľné IČO).
  - Presun overí prístup k obom firmám cez `overPristup` a cieľ musí sedieť
    na odberateľa z dokladu — inam sa faktúra presunúť nedá.
  - Samotný riadok sa presúva klientom prihláseného (RLS stráži obe firmy);
    servisný kľúč len upratuje väzby v zdrojovej firme (banka, úhrady), na
    ktoré custom rola nemusí mať právo.
*/
import {
  cieleNaPresun,
  dodavatelZAi,
  firmaZRiadku,
  nacitajNesedi,
  odberatelZAi,
  overOdberatela,
  prekazkaPresunu,
  VYPRAZDNIT_PRI_PRESUNE,
  type OdberatelNesedi,
  type Strana,
} from "./cudzia-faktura";

type Klient = any;
type Kontext = { supabase: any; userId: string };

/** Firma (názov a čísla) na porovnanie s odberateľom. */
export async function firmaNaPorovnanie(klient: Klient, companyId: string): Promise<Strana | null> {
  const { data } = await klient
    .from("companies")
    .select("name, ico, dic, ic_dph")
    .eq("id", companyId)
    .maybeSingle();
  return data ? firmaZRiadku(data) : null;
}

/**
 * Príznak pre vkladaný riadok prijatej faktúry — `{ odberatel_nesedi }`
 * alebo prázdny objekt. Chyba pri čítaní firmy vznik faktúry nezastaví.
 */
export async function priznakPrijatej(
  klient: Klient,
  companyId: string,
  odberatel: Strana | null | undefined,
  dodavatel?: Strana | null,
): Promise<{ odberatel_nesedi?: OdberatelNesedi }> {
  if (!odberatel) return {};
  try {
    const firma = await firmaNaPorovnanie(klient, companyId);
    if (!firma) return {};
    const n = overOdberatela({ odberatel, dodavatel, firma });
    return n ? { odberatel_nesedi: { ...n, zistene_at: new Date().toISOString() } } : {};
  } catch (e) {
    console.warn(
      "[cudzia-faktura] kontrola odberateľa zlyhala:",
      String((e as Error)?.message ?? e),
    );
    return {};
  }
}

/** Príznak nespracovaného dokladu z výsledku AI (len pre faktúry, nie bločky). */
export function nesediNespracovany(
  r: { druh?: string | null; ai?: unknown },
  firma: Strana | null,
): OdberatelNesedi | null {
  if (!firma) return null;
  if (r.druh && !["faktura", "zalohova", "dobropis"].includes(r.druh)) return null;
  const ai = (r.ai ?? null) as Record<string, unknown> | null;
  return overOdberatela({ odberatel: odberatelZAi(ai), dodavatel: dodavatelZAi(ai), firma });
}

/** Firmy, kam smie prihlásený faktúru presunúť (sedia na odberateľa, má právo zapisovať doklady). */
export async function cieleNaPresunPreUzivatela(
  ctx: Kontext,
  n: OdberatelNesedi,
  zdrojovaId: string,
): Promise<{ id: string; nazov: string }[]> {
  const { data: sPravom } = await ctx.supabase.rpc("firmy_s_pravom", {
    _oblast: "doklady",
    _zapis: true,
  });
  const ids = ((sPravom ?? []) as string[]).filter((id) => id !== zdrojovaId);
  if (!ids.length) return [];
  const { data: firmy } = await ctx.supabase
    .from("companies")
    .select("id, name, ico, dic, ic_dph")
    .in("id", ids.slice(0, 500));
  return cieleNaPresun(n, (firmy ?? []) as any[], ids, zdrojovaId);
}

async function overObe(ctx: Kontext, zdroj: string, ciel: string) {
  const { overPristup } = await import("./over-pristup");
  await overPristup(ctx, zdroj, { oblast: "doklady", zapis: true });
  await overPristup(ctx, ciel, { oblast: "doklady", zapis: true });
}

/** Prenesie súbor v kbelíku do priečinka cieľovej firmy; vráti novú cestu. */
async function prenesSubor(
  ctx: Kontext,
  kbelik: string,
  cesta: string | null,
  cielId: string,
): Promise<string | null> {
  if (!cesta) return null;
  const { data: subor, error } = await ctx.supabase.storage.from(kbelik).download(cesta);
  if (error || !subor) throw new Error(`Súbor sa nepodarilo prečítať: ${error?.message ?? "?"}`);
  const pripona = (cesta.split("/").pop() ?? "").split(".").pop() || "pdf";
  const nova = `${cielId}/${crypto.randomUUID()}.${pripona.slice(0, 8)}`;
  const { error: e2 } = await ctx.supabase.storage
    .from(kbelik)
    .upload(nova, subor, { contentType: (subor as Blob).type || undefined, upsert: false });
  if (e2) throw new Error(`Súbor sa nepodarilo preniesť: ${e2.message}`);
  return nova;
}

/**
 * Presun prijatej faktúry k firme, ktorej patrí. Súbory idú do priečinka
 * cieľovej firmy, väzby na zdrojovú (párovanie s bankou, úhrady, zaúčtovanie,
 * pravidlo, predkontácie, zákazka, štítky, schvaľovanie) sa zrušia.
 */
export async function presunPrijatu(
  ctx: Kontext,
  args: { id: string; cielovaFirmaId: string },
): Promise<{ id: string; companyId: string }> {
  const { data: r } = await ctx.supabase
    .from("purchase_invoices")
    .select("*")
    .eq("id", args.id)
    .maybeSingle();
  if (!r) throw new Error("Faktúra sa nenašla.");
  const zdroj = String(r.company_id);
  if (zdroj === args.cielovaFirmaId) throw new Error("Faktúra už v tejto firme je.");
  await overObe(ctx, zdroj, args.cielovaFirmaId);
  const prekazka = prekazkaPresunu(r);
  if (prekazka) throw new Error(prekazka);
  const n = nacitajNesedi(r.odberatel_nesedi);
  if (!n) throw new Error("Faktúra nemá upozornenie, že patrí inej firme — presunúť sa nedá.");
  const ciele = await cieleNaPresunPreUzivatela(ctx, n, zdroj);
  if (!ciele.some((c) => c.id === args.cielovaFirmaId))
    throw new Error("Do tejto firmy faktúru presunúť nemôžete — odberateľ na doklade je iný.");

  const novaCesta = await prenesSubor(ctx, "purchase-invoices", r.file_path, args.cielovaFirmaId);
  const { data: prilohy } = await ctx.supabase
    .from("prilohy_dokladov")
    .select("id, path")
    .eq("purchase_invoice_id", r.id);
  const noveCesty = new Map<string, string>();
  for (const p of (prilohy ?? []) as { id: string; path: string }[]) {
    const c = await prenesSubor(ctx, "invoice-attachments", p.path, args.cielovaFirmaId);
    if (c) noveCesty.set(p.id, c);
  }

  // Samotný presun klientom prihláseného — RLS pustí len firmu, kam smie zapisovať.
  const { error } = await ctx.supabase
    .from("purchase_invoices")
    .update({
      ...VYPRAZDNIT_PRI_PRESUNE,
      company_id: args.cielovaFirmaId,
      file_path: novaCesta,
      status: "received",
      odberatel_nesedi: null,
      odberatel_potvrdene_at: null,
      odberatel_potvrdil: null,
      note: [r.note, `Presunuté z inej firmy (odberateľ na doklade).`].filter(Boolean).join(" "),
    })
    .eq("id", r.id)
    .eq("company_id", zdroj);
  if (error) {
    // Prenesené kópie súborov nenecháme visieť.
    if (novaCesta) await ctx.supabase.storage.from("purchase-invoices").remove([novaCesta]);
    if (noveCesty.size)
      await ctx.supabase.storage.from("invoice-attachments").remove([...noveCesty.values()]);
    throw new Error(error.message);
  }
  /*
    Väzby v zdrojovej firme — servisným kľúčom (overené vyššie), banka nemusí
    byť v práve custom roly. Až po úspešnom presune: keby presun zlyhal,
    faktúra by v zdrojovej firme ostala bez párovania a úhrad.
  */
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adm = supabaseAdmin as any;
  await adm
    .from("bank_transactions")
    .update({ matched_purchase_invoice_id: null })
    .eq("company_id", zdroj)
    .eq("matched_purchase_invoice_id", r.id);
  await adm
    .from("bank_payments")
    .update({ purchase_invoice_id: null })
    .eq("purchase_invoice_id", r.id);
  await adm.from("purchase_invoice_payments").delete().eq("purchase_invoice_id", r.id);
  await adm
    .from("efaktura_received_documents")
    .update({ matched_supplier_invoice_id: null })
    .eq("company_id", zdroj)
    .eq("matched_supplier_invoice_id", r.id);
  await adm
    .from("efaktura_documents")
    .update({ purchase_invoice_id: null })
    .eq("purchase_invoice_id", r.id);
  await adm
    .from("purchase_invoices")
    .update({ advance_invoice_id: null })
    .eq("advance_invoice_id", r.id);
  await adm.from("purchase_invoices").update({ opravuje_id: null }).eq("opravuje_id", r.id);
  await adm.from("ai_navrhy_zauctovania").delete().eq("company_id", zdroj).eq("doklad_id", r.id);
  await adm.from("schvalovanie").delete().eq("company_id", zdroj).eq("doklad_id", r.id);
  await adm.from("komentare_dokladov").delete().eq("company_id", zdroj).eq("doklad_id", r.id);

  for (const [pid, cesta] of noveCesty)
    await ctx.supabase
      .from("prilohy_dokladov")
      .update({ company_id: args.cielovaFirmaId, path: cesta })
      .eq("id", pid);
  // Pôvodné súbory zo zdrojovej firmy preč.
  if (r.file_path) await ctx.supabase.storage.from("purchase-invoices").remove([r.file_path]);
  const stare = ((prilohy ?? []) as { id: string; path: string }[])
    .filter((p) => noveCesty.has(p.id))
    .map((p) => p.path);
  if (stare.length) await ctx.supabase.storage.from("invoice-attachments").remove(stare);
  return { id: r.id as string, companyId: args.cielovaFirmaId };
}

/** Polia zaúčtovania v údajoch nespracovaného dokladu — cieľová firma má vlastné číselníky. */
function udajeBezZauctovania(udaje: Record<string, any> | null | undefined) {
  const u = { ...(udaje ?? {}) } as Record<string, any>;
  u.kody = {
    predkontacia: "",
    clenenie: "",
    kv: "",
    stredisko: "",
    cinnost: "",
    rad: "",
    intPoznamka: "",
  };
  u.kategoria = "";
  u.jobId = "";
  u.vehicleId = "";
  delete u.pravidloId;
  delete u.navrhy;
  if (Array.isArray(u.polozky))
    u.polozky = u.polozky.map((p: any) => ({ ...p, predkontacia: null, clenenie: null, kv: null }));
  return u;
}

/** Presun nespracovaného dokladu do Nespracovaných firmy, ktorej patrí. */
export async function presunNespracovany(
  ctx: Kontext,
  args: { id: string; cielovaFirmaId: string },
): Promise<{ id: string; companyId: string }> {
  const { data: r } = await ctx.supabase
    .from("nespracovane_doklady")
    .select("*")
    .eq("id", args.id)
    .maybeSingle();
  if (!r) throw new Error("Doklad sa nenašiel — možno ho už niekto spracoval.");
  const zdroj = String(r.company_id);
  if (zdroj === args.cielovaFirmaId) throw new Error("Doklad už v tejto firme je.");
  await overObe(ctx, zdroj, args.cielovaFirmaId);
  const n = nesediNespracovany(r, await firmaNaPorovnanie(ctx.supabase, zdroj));
  if (!n) throw new Error("Odberateľ na doklade sedí na túto firmu — presunúť sa nedá.");
  const ciele = await cieleNaPresunPreUzivatela(ctx, n, zdroj);
  if (!ciele.some((c) => c.id === args.cielovaFirmaId))
    throw new Error("Do tejto firmy doklad presunúť nemôžete — odberateľ na doklade je iný.");
  const novaCesta = await prenesSubor(ctx, "nespracovane", r.file_path, args.cielovaFirmaId);
  const { error } = await ctx.supabase
    .from("nespracovane_doklady")
    .update({
      company_id: args.cielovaFirmaId,
      file_path: novaCesta,
      inbox_message_id: null,
      udaje: udajeBezZauctovania(r.udaje),
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id)
    .eq("company_id", zdroj);
  if (error) {
    if (novaCesta) await ctx.supabase.storage.from("nespracovane").remove([novaCesta]);
    throw new Error(error.message);
  }
  if (r.file_path) await ctx.supabase.storage.from("nespracovane").remove([r.file_path]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any)
    .from("schvalovanie")
    .delete()
    .eq("company_id", zdroj)
    .eq("doklad_id", r.id);
  return { id: r.id as string, companyId: args.cielovaFirmaId };
}
