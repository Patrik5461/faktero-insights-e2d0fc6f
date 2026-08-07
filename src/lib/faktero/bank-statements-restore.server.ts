/**
 * Obnova evidencie výpisov zo súborov, ktoré prežili v Storage.
 *
 * Odpojenie banky kaskádovo zmaže `bank_accounts` a s nimi `bank_statements`,
 * ale súbory v Storage ostanú — mazanie riadkov sa ich nedotkne. Tento modul
 * ich vráti do evidencie.
 *
 * Cesta má tvar `{company}/{starý_account_id}/{YYYY-MM}[-faktero].{pdf,xml}`.
 * Staré ID účtu je po odpojení bezcenné, preto sa účet hľadá podľa IBAN-u
 * zapísaného priamo v camt.053.
 *
 * Prepočítať výpisy nanovo nestačí: vlastné výpisy sa rátajú z transakcií a tie
 * banka po opätovnom pripojení nemusí vydať tak hlboko do minulosti.
 */

export type ParsedObjectName = {
  period: string;
  periodStart: string;
  periodEnd: string;
  exportType: "PDF" | "XML";
  source: "faktero" | "bank";
};

/** Posledný deň mesiaca. Deň 0 nasledujúceho mesiaca je posledný deň tohto. */
function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

export function parseStatementObjectName(fileName: string): ParsedObjectName | null {
  const m = /^(\d{4})-(\d{2})(-faktero)?\.(pdf|xml)$/i.exec(fileName);
  if (!m) return null;
  const [, y, mo, faktero, ext] = m;
  const year = Number(y);
  const month = Number(mo);
  if (month < 1 || month > 12) return null;
  return {
    period: `${y}-${mo}`,
    periodStart: `${y}-${mo}-01`,
    periodEnd: lastDayOfMonth(year, month),
    exportType: ext.toLowerCase() === "pdf" ? "PDF" : "XML",
    source: faktero ? "faktero" : "bank",
  };
}

/**
 * IBAN účtu, ktorého sa výpis týka. Berie sa z bloku <Acct> priamo pod <Stmt> —
 * IBANy protistrán v jednotlivých pohyboch sa musia ignorovať, inak by sa výpis
 * priradil cudziemu účtu.
 */
export function extractAccountIban(xml: string): string | null {
  const acct = /<Acct>([\s\S]*?)<\/Acct>/.exec(xml);
  if (!acct) return null;
  const iban = /<IBAN>\s*([A-Z0-9]+)\s*<\/IBAN>/i.exec(acct[1]);
  return iban ? iban[1].toUpperCase() : null;
}

export type RestoreResult = {
  scanned: number;
  restored: number;
  skipped_existing: number;
  unmatched_accounts: string[];
  errors: Array<{ path: string; error: string }>;
};

const BUCKET = "bank-statements";

export async function restoreStatementsFromStorage(): Promise<RestoreResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result: RestoreResult = {
    scanned: 0,
    restored: 0,
    skipped_existing: 0,
    unmatched_accounts: [],
    errors: [],
  };

  const { data: accounts } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, company_id, iban");
  const byIban = new Map<string, { id: string; company_id: string }>();
  for (const a of accounts ?? []) {
    if (a.iban) byIban.set(a.iban.replace(/\s+/g, "").toUpperCase(), a);
  }
  if (byIban.size === 0) {
    throw new Error("no_bank_accounts: najprv pripojte banku a načítajte účty");
  }

  const { data: companies, error: listErr } = await supabaseAdmin.storage.from(BUCKET).list("", {
    limit: 1000,
  });
  if (listErr) throw new Error(`storage_list_failed: ${listErr.message}`);

  for (const company of companies ?? []) {
    const { data: accountFolders } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(company.name, { limit: 1000 });

    for (const folder of accountFolders ?? []) {
      const prefix = `${company.name}/${folder.name}`;
      const { data: files } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(prefix, { limit: 1000 });
      const usable = (files ?? []).filter((f) => parseStatementObjectName(f.name));
      if (usable.length === 0) continue;
      result.scanned += usable.length;

      // IBAN priečinka zistíme z ktoréhokoľvek XML — všetky patria tomu istému účtu.
      const xmlFile = usable.find((f) => f.name.toLowerCase().endsWith(".xml"));
      if (!xmlFile) {
        result.unmatched_accounts.push(`${prefix} (bez XML, IBAN sa nedá zistiť)`);
        continue;
      }
      let iban: string | null = null;
      try {
        const { data: blob, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(`${prefix}/${xmlFile.name}`);
        if (error || !blob) throw new Error(error?.message ?? "download_failed");
        iban = extractAccountIban(await blob.text());
      } catch (e: any) {
        result.errors.push({ path: `${prefix}/${xmlFile.name}`, error: String(e?.message ?? e) });
        continue;
      }
      const account = iban ? byIban.get(iban) : undefined;
      if (!account) {
        result.unmatched_accounts.push(`${prefix} (IBAN ${iban ?? "neznámy"})`);
        continue;
      }

      for (const file of usable) {
        const parsed = parseStatementObjectName(file.name)!;
        const path = `${prefix}/${file.name}`;
        try {
          const { data: existing } = await supabaseAdmin
            .from("bank_statements")
            .select("id")
            .eq("bank_account_id", account.id)
            .eq("period_start", parsed.periodStart)
            .eq("period_end", parsed.periodEnd)
            .eq("export_type", parsed.exportType)
            .maybeSingle();
          if (existing) {
            result.skipped_existing++;
            continue;
          }
          const { error } = await supabaseAdmin.from("bank_statements").insert({
            company_id: account.company_id,
            bank_account_id: account.id,
            period_start: parsed.periodStart,
            period_end: parsed.periodEnd,
            export_type: parsed.exportType,
            status: "ready",
            source: parsed.source,
            storage_path: path,
            file_size: (file.metadata as any)?.size ?? null,
          });
          if (error) throw new Error(error.message);
          result.restored++;
        } catch (e: any) {
          result.errors.push({ path, error: String(e?.message ?? e) });
        }
      }
    }
  }

  return result;
}
