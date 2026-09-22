import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  buildNotifications,
  applyReadState,
  type AppNotification,
  type NotificationInput,
} from "./notifications";
import { pripomienkyZamestnancov } from "./zamestnanci";

const CompanyInput = z.object({ company_id: z.string().uuid() });

const MarkInput = z.object({
  company_id: z.string().uuid(),
  /** Prázdny zoznam znamená „označ všetko, čo teraz visí". */
  keys: z.array(z.string().min(1).max(200)).max(500).optional(),
});

async function assertMember(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Koľko riadkov si od každého zdroja pýtame. Zvonček nie je zoznam faktúr. */
const LIMIT = 50;

async function zozbierajSignaly(companyId: string): Promise<NotificationInput> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);

  const [faktury, prijate, transakcie, platby] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, customer_name, total, currency, due_date")
      .eq("company_id", companyId)
      .in("status", ["sent", "issued", "overdue"])
      .lt("due_date", today)
      .is("deleted_at", null)
      // Zvonček hlási pohľadávky po splatnosti. Zálohová faktúra ani dobropis
      // medzi ne nepatria — rovnaké pravidlo ako `jeOtvorena`.
      .or("type.is.null,type.eq.regular")
      .order("due_date", { ascending: true })
      .limit(LIMIT),
    supabaseAdmin
      .from("purchase_invoices")
      .select("id, invoice_number, supplier_name, amount_total, currency, due_date")
      .eq("company_id", companyId)
      .in("status", ["received", "booked"])
      .lt("due_date", today)
      .is("deleted_at", null)
      .order("due_date", { ascending: true })
      .limit(LIMIT),
    // Len príchodzie platby — odchodzie sa k faktúram nepárujú.
    supabaseAdmin
      .from("bank_transactions")
      .select("id, booking_date, amount, currency, counterparty, variable_symbol")
      .eq("company_id", companyId)
      .is("matched_invoice_id", null)
      .gt("amount", 0)
      .order("booking_date", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("bank_payments")
      .select(
        "id, purchase_invoice_id, creditor_name, amount, currency, status, error_message, updated_at",
      )
      .eq("company_id", companyId)
      .in("status", ["rejected", "failed"])
      .order("updated_at", { ascending: false })
      .limit(LIMIT),
  ]);

  return {
    today,
    overdueInvoices: (faktury.data as any[]) ?? [],
    overduePurchases: (prijate.data as any[]) ?? [],
    unmatchedIncoming: (transakcie.data as any[]) ?? [],
    failedPayments: (platby.data as any[]) ?? [],
  };
}

/**
 * Pripomienky k zamestnancom — len pri firme so zapnutým modulom. Počítajú sa
 * z tých istých dát a tou istou funkciou ako denný e-mail, takže zvonček a
 * e-mail sa nikdy nerozídu.
 */
async function notifikacieZamestnancov(companyId: string): Promise<AppNotification[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("module_employees")
    .eq("id", companyId)
    .maybeSingle();
  if (!firma?.module_employees) return [];
  const dnes = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
  const [zam, zml] = await Promise.all([
    supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name, title_before, title_after, start_date, end_date, status, sp_registered_at, zp_registered_at, medical_check_due, bozp_training_due")
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabaseAdmin
      .from("employee_contracts")
      .select("id, employee_id, kind, start_date, end_date, probation_end, status")
      .eq("company_id", companyId)
      .eq("status", "active"),
  ]);
  return pripomienkyZamestnancov(dnes, (zam.data ?? []) as any, (zml.data ?? []) as any).map((p) => ({
    key: p.kluc,
    severity: p.zavaznost,
    title: p.nadpis,
    detail: p.text,
    to: `/zamestnanci/${p.employee_id}`,
    date: p.termin,
  }));
}

/**
 * Lehoty z ostatných dokladov: splatnosť predpisu, začiatok zrážok pri
 * exekúcii, termín z listu úradu. Kľúč nesie aj dátum — keď sa lehota
 * posunie, zvonček sa ozve znova.
 */
async function lehotyOstatnych(companyId: string): Promise<AppNotification[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { lehotyNaUpozornenie, nazovDruhu } = await import("./ostatne-doklady");
  const dnes = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
  const o7 = new Date(`${dnes}T00:00:00Z`);
  o7.setUTCDate(o7.getUTCDate() + 7);
  const { data } = await supabaseAdmin
    .from("other_documents")
    .select("id, due_date, status, sender, subject, kind")
    .eq("company_id", companyId)
    .neq("status", "exported")
    .not("due_date", "is", null)
    .lte("due_date", o7.toISOString().slice(0, 10))
    .order("due_date")
    .limit(LIMIT);
  return lehotyNaUpozornenie((data ?? []) as any, dnes).map((d) => ({
    key: `ostatne-lehota:${d.id}:${d.due_date}`,
    severity: d.po ? ("danger" as const) : ("warning" as const),
    title: `${d.po ? "Zmeškaná lehota" : "Blíži sa lehota"}: ${nazovDruhu(d.kind)}`,
    detail: [d.sender, d.subject, `lehota ${d.due_date}`].filter(Boolean).join(" · "),
    to: "/ostatne-doklady",
    date: String(d.due_date),
  }));
}

/** Ostatné doklady (listy, predpisy, exekúcie) čakajúce na spracovanie. */
async function notifikaciaOstatnych(companyId: string): Promise<AppNotification[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, count } = await supabaseAdmin
    .from("other_documents")
    .select("id, created_at", { count: "exact" })
    .eq("company_id", companyId)
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(1);
  const najnovsi = data?.[0];
  const lehoty = await lehotyOstatnych(companyId);
  if (!count || !najnovsi) return lehoty;
  return [
    ...lehoty,
    {
      key: `ostatne-nespracovane:${najnovsi.id}`,
      severity: "info",
      title: count === 1 ? "1 nespracovaný ostatný doklad" : `${count} nespracovaných ostatných dokladov`,
      detail: "List, predpis alebo zmluva čaká na účtovníka.",
      to: "/ostatne-doklady",
      date: String(najnovsi.created_at).slice(0, 10),
    },
  ];
}

/**
 * Doklady čakajúce na spracovanie ako jedna položka. Kľúč nesie najnovší
 * doklad, takže po prečítaní sa zvonček ozve znova až pri ďalšom doklade.
 */
async function notifikaciaNespracovanychDokladov(companyId: string): Promise<AppNotification[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, count } = await supabaseAdmin
    .from("expense_documents")
    .select("id, created_at", { count: "exact" })
    .eq("company_id", companyId)
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(1);
  const najnovsi = data?.[0];
  const ostatne = await notifikaciaOstatnych(companyId);
  if (!count || !najnovsi) return ostatne;
  return [
    ...ostatne,
    {
      key: `doklady-nespracovane:${najnovsi.id}`,
      severity: "info",
      title: count === 1 ? "1 nespracovaný doklad" : `${count} nespracovaných dokladov`,
      detail: "Čaká na kontrolu a označenie ako spracovaný.",
      // Bez parametra: `/doklady` sa otvára na nespracovaných a Link parameter v `to` nečíta.
      to: "/doklady",
      date: String(najnovsi.created_at).slice(0, 10),
    },
  ];
}

const PORADIE_ZAVAZNOSTI = { danger: 0, warning: 1, info: 2 } as const;

/** Faktúry, banka aj zamestnanci v jednom zozname, zoradené rovnako. */
async function vsetkyNotifikacie(companyId: string, userId: string): Promise<AppNotification[]> {
  const zoznam = await (async () => {
    const [signaly, zamestnanci, doklady] = await Promise.all([
      zozbierajSignaly(companyId),
      notifikacieZamestnancov(companyId).catch(() => [] as AppNotification[]),
      notifikaciaNespracovanychDokladov(companyId).catch(() => [] as AppNotification[]),
    ]);
    // Rovnaké pravidlo ako `buildNotifications`: pri oznamoch najčerstvejšie hore,
    // inak najstaršie (najdlhšie po termíne).
    return [...buildNotifications(signaly), ...zamestnanci, ...doklady].sort((a, b) => {
      const podlaZavaznosti = PORADIE_ZAVAZNOSTI[a.severity] - PORADIE_ZAVAZNOSTI[b.severity];
      if (podlaZavaznosti !== 0) return podlaZavaznosti;
      return a.severity === "info" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    });
  })();
  /*
    Signály sa zbierajú servisným kľúčom, ktorý obchádza oprávnenia v databáze.
    Človek s vlastným prístupom preto dostane len upozornenia z oblastí, ku
    ktorým prístup má — rovnaké pravidlo ako menu (podľa stránky, kam vedú).
  */
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: clen } = await supabaseAdmin
    .from("company_users")
    .select("role, permissions")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (clen?.role !== "custom") return zoznam;
  const { oblastPodlaCesty, vidiOblast } = await import("./opravnenia");
  return zoznam.filter((n) => {
    const o = oblastPodlaCesty(String(n.to ?? "").split("?")[0]!);
    return !o || vidiOblast(clen.role, clen.permissions, o);
  });
}

/** Čo má firma práve teraz na stole, aj s tým, čo si už používateľ prečítal. */
export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [vsetky, precitane] = await Promise.all([
      vsetkyNotifikacie(data.company_id, context.userId),
      supabaseAdmin
        .from("notification_reads")
        .select("notification_key")
        .eq("company_id", data.company_id)
        .eq("user_id", context.userId),
    ]);

    const kluce = ((precitane.data as any[]) ?? []).map((r) => r.notification_key as string);
    return applyReadState(vsetky, kluce);
  });

/** Označí notifikácie za prečítané. Bez zoznamu kľúčov označí všetky súčasné. */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => MarkInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const keys =
      data.keys && data.keys.length > 0
        ? data.keys
        : (await vsetkyNotifikacie(data.company_id, context.userId)).map((n) => n.key);
    if (keys.length === 0) return { ok: true, marked: 0 };

    // Kľúč sa môže označiť opakovane — unikátny index to pretečie na no-op.
    const { error } = await supabaseAdmin.from("notification_reads").upsert(
      keys.map((notification_key) => ({
        company_id: data.company_id,
        user_id: context.userId,
        notification_key,
      })),
      { onConflict: "company_id,user_id,notification_key", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true, marked: keys.length };
  });
