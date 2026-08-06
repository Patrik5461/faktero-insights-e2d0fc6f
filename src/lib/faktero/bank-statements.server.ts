/**
 * Mesačné bankové výpisy z Tatra banky (Premium API, statements v1).
 *
 * Priebeh, overený proti produkcii 2026-08-06:
 *   1. POST /v1/accounts/<účet>/statements/tasks
 *      telo { dateFromStatements, dateToStatements, exportType: "PDF" | "XML" } → { taskId }
 *      Pozor na názvy polí — dateFrom/dateTo (bez prípony) endpoint odmietne.
 *   2. GET  /v1/accounts/<účet>/statements/tasks/<taskId>
 *      → { state: "PROCESSING" | "SUCCEEDED" | ..., statements: [{ statementId, dateFrom, dateTo }] }
 *      TB odporúča dopytovať sa najviac raz za 2 sekundy.
 *   3. GET  /v1/accounts/<účet>/statements/<statementId>
 *      PDF príde ako application/pdf, XML ako application/zip s XML súborom vnútri.
 */

const BUCKET = "bank-statements";
/** TB odporúča max. 1 dopyt za 2 s. */
const POLL_DELAY_MS = 2500;
const POLL_ATTEMPTS = 8;

export type ExportType = "PDF" | "XML";

function tbBase(): string {
  const env = (process.env.TB_ENV ?? "sandbox").toLowerCase();
  return env === "production" || env === "prod"
    ? "https://api.tatrabanka.sk/premium/production"
    : "https://api.tatrabanka.sk/premium/sandbox";
}

function headers(accessToken: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Request-ID": crypto.randomUUID(),
    ...(json ? { "Content-Type": "application/json", Accept: "application/json" } : {}),
  };
}

/** Predchádzajúci celý kalendárny mesiac vzhľadom na `now`. */
export function previousMonth(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11, aktuálny mesiac
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // deň 0 = posledný deň predchádzajúceho mesiaca
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Založí úlohu na vygenerovanie výpisu a vráti jej id. */
export async function createStatementTask(
  accessToken: string,
  externalAccountId: string,
  periodStart: string,
  periodEnd: string,
  exportType: ExportType,
): Promise<string> {
  const url = `${tbBase()}/v1/accounts/${encodeURIComponent(externalAccountId)}/statements/tasks`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(accessToken, true),
    body: JSON.stringify({
      dateFromStatements: periodStart,
      dateToStatements: periodEnd,
      exportType,
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`tb_statement_task_failed: ${res.status} ${txt.slice(0, 200)}`);
  const taskId = JSON.parse(txt).taskId;
  if (!taskId) throw new Error(`tb_statement_task_no_id: ${txt.slice(0, 200)}`);
  return taskId as string;
}

type TaskState = { state: string; statements: Array<{ statementId: string }> };

/** Dopytuje stav úlohy, kým sa nedostane do finálneho stavu (alebo nevyprší pokus). */
export async function waitForTask(
  accessToken: string,
  externalAccountId: string,
  taskId: string,
): Promise<TaskState> {
  const url = `${tbBase()}/v1/accounts/${encodeURIComponent(externalAccountId)}/statements/tasks/${encodeURIComponent(taskId)}`;
  let last: TaskState = { state: "UNKNOWN", statements: [] };
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
    const res = await fetch(url, { headers: headers(accessToken, true) });
    const txt = await res.text();
    if (!res.ok) throw new Error(`tb_statement_task_status_failed: ${res.status} ${txt.slice(0, 200)}`);
    last = JSON.parse(txt);
    if (last.state && last.state !== "PROCESSING") return last;
  }
  return last;
}

/**
 * Stiahne vygenerovaný výpis. Vráti obsah aj príponu — TB posiela PDF priamo,
 * XML zabalené v zipe, takže XML z archívu vytiahneme.
 */
export async function downloadStatement(
  accessToken: string,
  externalAccountId: string,
  statementId: string,
): Promise<{ bytes: Uint8Array; ext: string; contentType: string }> {
  const url = `${tbBase()}/v1/accounts/${encodeURIComponent(externalAccountId)}/statements/${encodeURIComponent(statementId)}`;
  const res = await fetch(url, { headers: headers(accessToken) });
  if (!res.ok)
    throw new Error(`tb_statement_download_failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await res.arrayBuffer());

  if (contentType.includes("pdf")) return { bytes, ext: "pdf", contentType: "application/pdf" };

  if (contentType.includes("zip")) {
    const { unzipSync } = await import("fflate");
    const files = unzipSync(bytes);
    const xmlName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".xml"));
    if (xmlName) {
      return { bytes: files[xmlName], ext: "xml", contentType: "application/xml" };
    }
    // Viac súborov alebo iný obsah — uložíme archív tak, ako prišiel.
    return { bytes, ext: "zip", contentType: "application/zip" };
  }

  return { bytes, ext: "bin", contentType };
}

/** Vybaví jeden riadok výpisu: úloha → čakanie → stiahnutie → úložisko. */
async function processRow(supabaseAdmin: any, accessToken: string, row: any, account: any) {
  const externalId = account.external_account_id ?? account.iban;
  const taskId = row.task_id ?? (await createStatementTask(
    accessToken,
    externalId,
    row.period_start,
    row.period_end,
    row.export_type,
  ));
  if (!row.task_id) {
    await supabaseAdmin.from("bank_statements").update({ task_id: taskId }).eq("id", row.id);
  }

  const state = await waitForTask(accessToken, externalId, taskId);
  if (state.state !== "SUCCEEDED") {
    // PROCESSING nie je chyba — dobehne to pri ďalšom behu, riadok necháme pending.
    if (state.state === "PROCESSING" || state.state === "UNKNOWN") return { done: false };
    throw new Error(`stav úlohy: ${state.state}`);
  }

  const first = state.statements?.[0];
  if (!first?.statementId) throw new Error("úloha uspela, ale nevrátila statementId");

  const file = await downloadStatement(accessToken, externalId, first.statementId);
  const path = `${row.company_id}/${row.bank_account_id}/${row.period_start.slice(0, 7)}.${file.ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file.bytes, { contentType: file.contentType, upsert: true });
  if (upErr) throw new Error(`upload zlyhal: ${upErr.message}`);

  await supabaseAdmin
    .from("bank_statements")
    .update({
      status: "ready",
      statement_id: first.statementId,
      storage_path: path,
      file_size: file.bytes.length,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  return { done: true };
}

/**
 * Zabezpečí mesačné výpisy (PDF aj XML) pre každý pripojený účet každej firmy.
 * Spúšťa sa denne: prvýkrát v mesiaci riadky založí, ďalšie behy dotiahnu to,
 * čo ešte nebolo hotové. Keď je všetko `ready`, beh je prakticky bez práce.
 */
export async function runMonthlyStatements(period?: { start: string; end: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { start, end } = period ?? previousMonth();

  const { data: connections } = await supabaseAdmin
    .from("bank_connections")
    .select("id, company_id, access_token, status")
    .eq("provider", "tatrabanka")
    .eq("status", "connected");

  let created = 0;
  let ready = 0;
  let pending = 0;
  let unsupported = 0;
  const errors: Array<{ account_id: string; export_type: string; error: string }> = [];

  for (const conn of connections ?? []) {
    if (!conn.access_token) continue;
    const { data: accounts } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, external_account_id, iban")
      .eq("bank_connection_id", conn.id);

    for (const acc of accounts ?? []) {
      for (const exportType of ["PDF", "XML"] as ExportType[]) {
        // Riadok je zároveň zámkom aj evidenciou — unikátny index bráni duplicite.
        const { data: existing } = await supabaseAdmin
          .from("bank_statements")
          .select("*")
          .eq("bank_account_id", acc.id)
          .eq("period_start", start)
          .eq("period_end", end)
          .eq("export_type", exportType)
          .maybeSingle();

        if (existing?.status === "ready") {
          ready++;
          continue;
        }
        // Účet z inej banky — výpis preň nikdy nevznikne, neskúšaj to znova.
        if (existing?.status === "unsupported") {
          unsupported++;
          continue;
        }

        let row = existing;
        if (!row) {
          const { data: inserted, error } = await supabaseAdmin
            .from("bank_statements")
            .insert({
              company_id: conn.company_id,
              bank_account_id: acc.id,
              period_start: start,
              period_end: end,
              export_type: exportType,
            })
            .select("*")
            .single();
          if (error || !inserted) {
            errors.push({
              account_id: acc.id,
              export_type: exportType,
              error: error?.message ?? "insert_failed",
            });
            continue;
          }
          row = inserted;
          created++;
        }

        try {
          const r = await processRow(supabaseAdmin, conn.access_token, row, acc);
          if (r.done) ready++;
          else pending++;
        } catch (e: any) {
          const msg = e?.message ?? "statement_failed";
          // PRODUCT_UNKNOWN = účet nie je vedený v TB (Premium API ho len agreguje).
          // Trvalý stav, nie zlyhanie behu — nezaraďuj medzi chyby.
          const isForeignBank = msg.includes("PRODUCT_UNKNOWN");
          await supabaseAdmin
            .from("bank_statements")
            .update({
              status: isForeignBank ? "unsupported" : "failed",
              error: msg,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (isForeignBank) {
            unsupported++;
          } else {
            console.error(`[bank-statements] ${acc.id} ${exportType}: ${msg}`);
            errors.push({ account_id: acc.id, export_type: exportType, error: msg });
          }
        }
      }
    }
  }

  console.log(
    `[bank-statements] obdobie ${start}..${end}: ${created} nových, ${ready} hotových, ${pending} čaká, ${unsupported} mimo TB, ${errors.length} chýb`,
  );
  return { period: { start, end }, created, ready, pending, unsupported, errors };
}
