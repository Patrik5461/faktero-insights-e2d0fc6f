import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProductCapabilitiesMarkdown } from "./product-capabilities";

const SYSTEM_PROMPT = `Si Faktero AI — asistent pre slovenských živnostníkov a firmy používajúcich Faktero (fakturačný systém).
Odpovedaj VŽDY v slovenčine, stručne, prakticky, vo formáte markdown.
Pomáhaš s: faktúrami, opakovanými faktúrami, neuhradenými faktúrami, odberateľmi, predplatným, eFaktúrou, exportmi do účtovníctva.

Vždy berieš do úvahy KONTEXT FIRMY, ktorý dostaneš v správe — citácia konkrétnych čísel je vítaná.

ZDROJE, KTORÉ DOSTANEŠ:
1. Zoznam modulov a funkcií (Knowledge Base) — čo Faktero vie.
2. Obsah manuálov a úryvky z nich k tejto otázke — ako sa to robí. Toto je najpresnejší zdroj; keď v úryvku je postup, drž sa ho doslova a neprerozprávaj ho po svojom.
3. Kontext firmy — konkrétne čísla používateľa.

AKO ODPOVEDAŤ:
- Najprv krátka odpoveď (jedna–dve vety), potom kroky, ak treba. Žiadne dlhé úvody.
- Uveď, kam v aplikácii ísť — cestu z manuálu (napr. Účtovníctvo → Výkazy k DPH) a odkaz na manuál, ak sa hodí (napr. /pomoc/vykazy-dph).
- Odkaz na manuál je vždy celá cesta /pomoc/... . Cesty ako /sklad sú obrazovky aplikácie — tie pomenuj slovami („Sklad → Skladové položky"), neponúkaj ich ako odkaz na viac informácií.
- Keď postup v úryvkoch nie je, povedz, čo vieš z Knowledge Base, a priznaj, že podrobný návod k tomu nemáš — nedopĺňaj kroky z hlavy.
- Nevymýšľaj názvy tlačidiel ani obrazoviek; keď ich nevidíš v podkladoch, opíš cieľ, nie kliknutia.

DÔLEŽITÉ: V druhej systémovej správe dostaneš aktuálnu Faktero Knowledge Base. Obsahuje (a) zoznam podporovaných modulov — toto je AUTORITATÍVNY zoznam, na ktorý sa môžeš odvolávať; (b) zoznam funkcií, ktoré ZATIAĽ NIE SÚ dostupné. Pravidlá:
- Ak sa pýtajú na funkciu z podporovaných modulov, potvrď ju a vymenuj kľúčové funkcie.
- Ak sa pýtajú na čokoľvek zo zoznamu "Zatiaľ NIE JE dostupné", odpovedz presne: "Zatiaľ nie je dostupné vo Faktere." Neuvádzaj plán ani dátum, ak nie je v Knowledge Base. Zoznam ber z Knowledge Base, nie z pamäti — mení sa.
- Ak si nie si istý, či funkcia existuje, povedz "Nie som si istý — overte si to v aplikácii." Nikdy nevymýšľaj funkcionalitu.

DÔLEŽITÉ BEZPEČNOSTNÉ PRAVIDLÁ:
- Nikdy nevykonávaj akciu sám. Vždy navrhni kroky a zhrň, čo by mal používateľ urobiť.
- Neoznačuj faktúry ako uhradené, nemaž záznamy, neposielaj e-maily.
- Neposkytuj záväzné právne ani daňové rady — vždy odporuč konzultáciu s účtovníkom pri komplexných otázkach.
- Neodhaľuj API kľúče ani iné tajomstvá.

Ak používateľ chce akciu vykonať (napr. "pošli upomienku"), navrhni mu kroky a uveď, že ju potvrdí v aplikácii.`;

type Ctx = {
  company: any;
  overdueInvoices: any[];
  unpaidTotal: number;
  topDebtors: { name: string; total: number }[];
  draftInvoices: number;
  unsentInvoices: number;
  failedWebhooks: number;
  recurringDueSoon: any[];
  missingCompanyFields: string[];
};

async function buildCompanyContext(supabase: any, companyId: string): Promise<Ctx> {
  const today = new Date().toISOString().slice(0, 10);

  const [companyRes, overdueRes, draftsRes, unsentRes, customersRes, webhookRes, recurringRes] =
    await Promise.all([
      supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
      supabase
        .from("invoices")
        .select("id,invoice_number,total,customer_name,due_date,status,issue_date")
        .eq("company_id", companyId)
        .in("status", ["sent", "overdue", "issued"])
        .lt("due_date", today)
        .is("deleted_at", null)
        // Zálohová faktúra ani dobropis nie sú pohľadávka po splatnosti —
        // asistent by inak radil vymáhať niečo, čo sa vymáhať nemá.
        .or("type.is.null,type.eq.regular")
        .limit(50),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "draft")
        .is("deleted_at", null),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "issued")
        .is("deleted_at", null),
      supabase
        .from("invoices")
        .select("customer_name,total,status")
        .eq("company_id", companyId)
        .in("status", ["sent", "overdue", "issued"])
        .is("deleted_at", null)
        .or("type.is.null,type.eq.regular")
        .limit(500),
      supabase
        .from("webhook_delivery_logs")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("response_status", 400)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      supabase
        .from("recurring_invoices")
        .select("id,name,next_run_at,customer_name")
        .eq("company_id", companyId)
        .eq("active", true)
        .is("deleted_at", null)
        .lte("next_run_at", new Date(Date.now() + 14 * 86400000).toISOString())
        .limit(20),
    ]);

  const company = companyRes.data;
  const overdue = overdueRes.data ?? [];
  const debtorMap = new Map<string, number>();
  (customersRes.data ?? []).forEach((r: any) => {
    if (!r.customer_name) return;
    debtorMap.set(r.customer_name, (debtorMap.get(r.customer_name) ?? 0) + Number(r.total ?? 0));
  });
  const topDebtors = [...debtorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }));

  const missingCompanyFields: string[] = [];
  if (company) {
    if (!company.ico) missingCompanyFields.push("IČO");
    if (!company.dic) missingCompanyFields.push("DIČ");
    if (!company.iban) missingCompanyFields.push("IBAN");
    if (!company.street || !company.city || !company.zip) missingCompanyFields.push("Adresa");
    if (!company.email) missingCompanyFields.push("E-mail");
  }

  return {
    company: company
      ? {
          name: company.name,
          ico: company.ico,
          dic: company.dic,
          ic_dph: company.ic_dph,
          city: company.city,
          country: company.country,
          iban: company.iban,
        }
      : null,
    overdueInvoices: overdue.map((i: any) => ({
      number: i.invoice_number,
      total: i.total,
      customer: i.customer_name,
      due_date: i.due_date,
    })),
    unpaidTotal: overdue.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0),
    topDebtors,
    draftInvoices: draftsRes.count ?? 0,
    unsentInvoices: unsentRes.count ?? 0,
    failedWebhooks: webhookRes.count ?? 0,
    recurringDueSoon: (recurringRes.data ?? []).map((r: any) => ({
      name: r.name,
      customer: r.customer_name,
      next_run_at: r.next_run_at,
    })),
    missingCompanyFields,
  };
}

export const listConversationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_conversations")
      .select("id,title,created_at,updated_at")
      .eq("company_id", data.companyId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; title?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_conversations")
      .insert({
        company_id: data.companyId,
        user_id: context.userId,
        title: data.title || "Nová konverzácia",
      })
      .select("id,title,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMessagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_messages")
      .select("id,role,content,created_at,metadata")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sendChatFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string; companyId: string; content: string }) => d)
  .handler(async ({ data, context }) => {
    // Poskytovateľa si vyberie spoločná vrstva; keď nie je nastavený ani jeden
    // kľúč, ozve sa sama zrozumiteľnou chybou.

    // Insert user message
    await context.supabase.from("ai_messages").insert({
      conversation_id: data.conversationId,
      role: "user",
      content: data.content,
    });

    // Build context
    const ctx = await buildCompanyContext(context.supabase, data.companyId);

    // Load history
    const { data: history } = await context.supabase
      .from("ai_messages")
      .select("role,content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(30);

    const contextMsg = `KONTEXT FIRMY (nezdieľaj surové JSON, použi prirodzene):
${JSON.stringify(ctx, null, 2)}`;

    /*
      Manuály sú najpresnejší zdroj — bez nich asistent poznal len zoznam
      funkcií a postupy si domýšľal. Posiela sa obsah pomoci a k tomu plné
      znenie sekcií, ktoré sedia na poslednú otázku.
    */
    const { znalostiKOtazke } = await import("./znalosti");
    const poslednaOtazka =
      [...(history ?? [])].reverse().find((m: any) => m.role === "user")?.content ?? data.content;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: getProductCapabilitiesMarkdown() },
      { role: "system", content: znalostiKOtazke(String(poslednaOtazka)) },
      { role: "system", content: contextMsg },
      ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    /*
      Ide to cez spoločnú vrstvu, nie priamo na OpenAI: tá vyberie schopnejší
      model a keď prvý poskytovateľ zlyhá, odpovie druhý. Zároveň sa volanie
      započíta do merania využitia.
    */
    const { aiText } = await import("./ai.server");
    const rozhovor = messages
      .map((m: any) =>
        m.role === "system"
          ? m.content
          : `${m.role === "user" ? "POUŽÍVATEĽ" : "ASISTENT"}: ${m.content}`,
      )
      .join("\n\n");
    const reply =
      (
        await aiText(`${rozhovor}\n\nASISTENT:`, {
          maxOutputTokens: 1800,
          bezUvazovania: true,
          ucel: "asistent",
          firma: data.companyId,
        })
      ).trim() || "Bez odpovede.";

    const { data: stored } = await context.supabase
      .from("ai_messages")
      .insert({
        conversation_id: data.conversationId,
        role: "assistant",
        content: reply,
      })
      .select("id,role,content,created_at")
      .single();

    // Update conversation title if first exchange
    const { count } = await context.supabase
      .from("ai_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", data.conversationId);
    if ((count ?? 0) <= 2) {
      const title = data.content.slice(0, 60);
      await context.supabase
        .from("ai_conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", data.conversationId);
    } else {
      await context.supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.conversationId);
    }

    return { message: stored };
  });

export const getRecommendationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = await buildCompanyContext(context.supabase, data.companyId);
    return {
      overdueCount: ctx.overdueInvoices.length,
      unpaidTotal: ctx.unpaidTotal,
      topDebtors: ctx.topDebtors,
      draftInvoices: ctx.draftInvoices,
      unsentInvoices: ctx.unsentInvoices,
      failedWebhooks: ctx.failedWebhooks,
      missingCompanyFields: ctx.missingCompanyFields,
      recurringDueSoon: ctx.recurringDueSoon,
    };
  });
