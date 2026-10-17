import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listEmailTemplatesFn,
  saveEmailTemplateFn,
  resetEmailTemplateFn,
  sendTestEmailTemplateFn,
} from "@/lib/faktero/email-templates.functions";
import { RotateCcw, Save, Send, Loader2 } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/nastavenia/email-sablony")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "E-mailové šablóny — Faktero") }],
  }),
  component: EmailTemplatesPage,
});

const VARS = [
  "{{invoice_number}}",
  "{{total}}",
  "{{due_date}}",
  "{{company_name}}",
  "{{customer_name}}",
  "{{iban}}",
  "{{variable_symbol}}",
];

type Row = {
  template_type: string;
  label: string;
  subject: string;
  body: string;
  default_subject: string;
  default_body: string;
  customized: boolean;
  updated_at: string | null;
};

function EmailTemplatesPage() {
  const { t } = useT();
  const [companyId] = useState<string | null>(() => getActiveCompanyId());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const list = useServerFn(listEmailTemplatesFn);
  const save = useServerFn(saveEmailTemplateFn);
  const reset = useServerFn(resetEmailTemplateFn);
  const sendTest = useServerFn(sendTestEmailTemplateFn);

  useEffect(() => {
    if (!companyId) return;
    list({ data: { companyId } })
      .then((r) => setRows(r as Row[]))
      .catch((e) => toast.error(e?.message ?? t("Chyba")));
  }, [companyId, list]);

  if (!companyId) return <PageBody>{t("Chýba aktívna firma.")}</PageBody>;
  if (!rows) return <PageBody>{t("Načítavam…")}</PageBody>;

  function update(type: string, patch: Partial<Row>) {
    setRows((prev) => prev!.map((r) => (r.template_type === type ? { ...r, ...patch } : r)));
  }

  async function onSave(r: Row) {
    setBusy(r.template_type);
    try {
      await save({
        data: {
          companyId: companyId!,
          template_type: r.template_type as any,
          subject: r.subject,
          body: r.body,
        },
      });
      update(r.template_type, { customized: true });
      toast.success(t("Šablóna uložená"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Uloženie zlyhalo"));
    } finally {
      setBusy(null);
    }
  }

  async function onReset(r: Row) {
    if (!(await potvrd(t("Obnoviť predvolený text pre „{nazov}\"?", { nazov: t(r.label) })))) return;
    setBusy(r.template_type);
    try {
      await reset({ data: { companyId: companyId!, template_type: r.template_type as any } });
      update(r.template_type, {
        subject: r.default_subject,
        body: r.default_body,
        customized: false,
      });
      toast.success(t("Obnovené na predvolené"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Reset zlyhal"));
    } finally {
      setBusy(null);
    }
  }

  async function onTest(r: Row) {
    if (!testEmail) {
      toast.error(t("Zadajte e-mail pre test"));
      return;
    }
    setBusy(`${r.template_type}:test`);
    try {
      await sendTest({
        data: {
          companyId: companyId!,
          template_type: r.template_type as any,
          subject: r.subject,
          body: r.body,
          recipient_email: testEmail,
        },
      });
      toast.success(t("Testovací email odoslaný na {email}", { email: testEmail }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Odoslanie zlyhalo"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("E-mailové šablóny")}
        description={t("Predmet a text e-mailov, ktoré Faktero posiela odberateľom.")}
        action={
          <Link
            to="/firma"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            {t("Späť na Firmu")}
          </Link>
        }
      />
      <PageBody>
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-0 flex-1 basis-60">
              <span className="text-sm font-medium">{t("E-mail pre testovacie odoslanie")}</span>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder={t("vas@email.sk")}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="min-w-0 break-words text-xs text-muted-foreground">
              {t("Dostupné premenné:")} <code className="rounded bg-muted px-1">{VARS.join(" ")}</code>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {rows.map((r) => (
            <div
              key={r.template_type}
              className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">{t(r.label)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t(r.customized ? "Vlastná šablóna" : "Používa sa predvolený text")}
                  </p>
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-medium">{t("Predmet")}</span>
                <input
                  title={r.subject}
                  value={r.subject}
                  onChange={(e) => update(r.template_type, { subject: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-sm font-medium">{t("Telo e-mailu")}</span>
                <textarea
                  rows={8}
                  value={r.body}
                  onChange={(e) => update(r.template_type, { body: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onSave(r)}
                  disabled={busy === r.template_type}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy === r.template_type ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t("Uložiť")}
                </button>
                <button
                  aria-label={t("Obnoviť")}
                  title={t("Obnoviť")}
                  onClick={() => onReset(r)}
                  disabled={busy === r.template_type || !r.customized}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" /> {t("Obnoviť predvolené")}
                </button>
                <button
                  onClick={() => onTest(r)}
                  disabled={busy === `${r.template_type}:test` || !testEmail}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
                >
                  {busy === `${r.template_type}:test` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t("Odoslať testovací email")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </PageBody>
    </>
  );
}
