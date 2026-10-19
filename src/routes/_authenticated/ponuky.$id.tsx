import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageBody } from "@/components/faktero/AppShell";
import {
  DocumentDetailHeader,
  MenuAkcia,
  MenuSkupina,
  MetaRiadok,
  PoTermine,
  PrimarnaAkcia,
  SekundarnaAkcia,
  StavOdznak,
} from "@/components/faktero/DocumentDetailHeader";
import { PrilohyFaktury } from "@/components/faktero/PrilohyFaktury";
import { useServerFn } from "@tanstack/react-start";
import { generateQuotePdf, getQuotePdfSignedUrl } from "@/lib/faktero/quote-pdf.functions";
import { convertQuoteToInvoice, duplicateQuote } from "@/lib/faktero/quote.functions";
import { createSalesOrderFromQuote } from "@/lib/faktero/sales-orders.functions";
import { sendQuoteEmailFn } from "@/lib/faktero/quote-email.functions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  Download,
  FileText,
  RefreshCw,
  Mail,
  Copy,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardList,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujCislo, formatujJednotkovuCenu } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/ponuky/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Detail ponuky — Faktero") }] }),
  component: QuoteDetail,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  sent: "Odoslaná",
  accepted: "Akceptovaná",
  rejected: "Zamietnutá",
  expired: "Expirovaná",
  converted: "Konvertovaná",
};
const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-secondary text-secondary-foreground",
  accepted: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  expired: "bg-muted text-muted-foreground",
  converted: "bg-primary/15 text-primary",
};

function QuoteDetail() {
  const { t } = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  /* Koľko príloh ponuka má — podľa toho sa v maile ponúkne, či ich priložiť. */
  const [pocetPriloh, setPocetPriloh] = useState(0);
  const [posielatPrilohy, setPosielatPrilohy] = useState(true);
  useZatvorNaEscape(emailOpen ? () => setEmailOpen(false) : null);
  const [emailForm, setEmailForm] = useState({ recipient_email: "", subject: "", message: "" });

  const genPdf = useServerFn(generateQuotePdf);
  const getPdf = useServerFn(getQuotePdfSignedUrl);
  const convert = useServerFn(convertQuoteToInvoice);
  const naObjednavku = useServerFn(createSalesOrderFromQuote);
  const [nenajdena, setNenajdena] = useState(false);
  const dup = useServerFn(duplicateQuote);
  const send = useServerFn(sendQuoteEmailFn);

  async function load() {
    // Ponuka sa načítava v rámci aktívnej firmy. Bez toho sa dala otvoriť
    // ponuka inej firmy používateľa a stránka ukazovala jej hlavičku, kým
    // tlačidlá pracovali s aktívnou firmou — akcia potom spadla na
    // „Ponuka sa nenašla" bez toho, aby bolo vidieť prečo.
    const cid = getActiveCompanyId();
    let q = supabase.from("quotes").select("*").eq("id", id);
    if (cid) q = q.eq("company_id", cid);
    const { data: quote } = await q.maybeSingle();
    setQ(quote);
    setNenajdena(!quote);
    if (quote) {
      const [{ data: its }, { data: comp }] = await Promise.all([
        supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
        supabase.from("companies").select("*").eq("id", quote.company_id).single(),
      ]);
      setItems(its ?? []);
      setCompany(comp);
    }
  }
  useEffect(() => {
    load();
  }, [id]);

  async function setStatus(status: string) {
    setBusy(status);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ status: status as any })
        .eq("id", id);
      if (error) throw error;
      toast.success(t("Stav aktualizovaný"));
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate() {
    setPdfBusy(true);
    try {
      const r = await genPdf({ data: { quoteId: id } });
      toast.success(t("PDF vygenerované"));
      if (r.signedUrl) window.open(r.signedUrl, "_blank");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setPdfBusy(false);
    }
  }
  async function handleDownload() {
    try {
      const r = await getPdf({ data: { quoteId: id } });
      window.open(r.signedUrl, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }
  async function handleDuplicate() {
    setBusy("dup");
    try {
      const r = await dup({ data: { quoteId: id } });
      toast.success(t("Ponuka duplikovaná"));
      navigate({ to: "/ponuky/$id", params: { id: r.quote_id } });
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(null);
    }
  }
  async function handleConvert() {
    if (!(await potvrd(t("Konvertovať ponuku na faktúru?")))) return;
    setBusy("conv");
    try {
      const r = await convert({ data: { quoteId: id } });
      toast.success(r.already ? t("Ponuka už bola konvertovaná") : t("Faktúra vytvorená"));
      navigate({ to: "/faktury/$id", params: { id: r.invoice_id } });
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(null);
    }
  }
  function openEmail() {
    if (!q.customer_email)
      return toast.error(t("Odberateľ nemá e-mail. Doplňte ho v karte odberateľa."));
    setEmailForm({
      recipient_email: q.customer_email,
      subject: t("Cenová ponuka {cislo}", { cislo: q.quote_number }),
      message: t("Dobrý deň,\n\nv prílohe Vám posielame cenovú ponuku {cislo} platnú do {datum}.\n\nS pozdravom,\n{firma}", { cislo: q.quote_number, datum: datumNaDoklade(q.valid_until), firma: company?.name ?? "" }),
    });
    setEmailOpen(true);
  }
  async function submitEmail() {
    setBusy("mail");
    try {
      const r: any = await send({
        data: { quoteId: id, ...emailForm, s_prilohami: pocetPriloh > 0 && posielatPrilohy },
      });
      toast.success(t("E-mail odoslaný"));
      if (r?.vynechane?.length) {
        /* Mail odišiel, ale nie celý — to sa musí povedať nahlas. */
        toast.warning(t("Do mailu sa nezmestili: {subory}", { subory: r.vynechane.join(", ") }), { duration: 12000 });
      }
      setEmailOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ? t(e.message) : t("Chyba"));
    } finally {
      setBusy(null);
    }
  }

  if (!q && nenajdena)
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          {t("Táto ponuka v aktívnej firme neexistuje. Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.")}{" "}
          <Link to="/ponuky" className="text-primary underline">
            {t("Späť na ponuky")}
          </Link>
        </div>
      </PageBody>
    );
  if (!q) return <PageBody>{t("Načítavam…")}</PageBody>;

  const converted = q.status === "converted";
  const primarnaKonverzia = q.status === "accepted";
  const propadla =
    !!q.valid_until &&
    !["accepted", "converted", "rejected"].includes(q.status) &&
    new Date(q.valid_until) < new Date(new Date().toDateString());

  return (
    <>
      <DocumentDetailHeader
        title={t("Ponuka")}
        number={q.quote_number}
        status={
          <StavOdznak className={STATUS_CLS[q.status] ?? "bg-muted"}>
            {STATUS_LABEL[q.status] ? t(STATUS_LABEL[q.status]) : q.status}
          </StavOdznak>
        }
        meta={
          <MetaRiadok
            polozky={[
              t("Vystavená {datum}", { datum: datumNaDoklade(q.issue_date) }),
              <PoTermine aktivne={propadla}>
                {t("platná do {platnost}", { platnost: datumNaDoklade(q.valid_until) })}
              </PoTermine>,
            ]}
          />
        }
        primaryAction={
          /* Akceptovaná ponuka čaká na faktúru, inak sa ponuka posiela odberateľovi. */
          primarnaKonverzia ? (
            <PrimarnaAkcia onClick={handleConvert} disabled={converted || busy === "conv"}>
              <ArrowRightLeft /> {converted ? t("Konvertovaná") : t("Konvertovať na faktúru")}
            </PrimarnaAkcia>
          ) : (
            <PrimarnaAkcia onClick={openEmail} disabled={converted}>
              <Mail /> {t("Poslať e-mailom")}
            </PrimarnaAkcia>
          )
        }
        secondaryActions={
          !q.pdf_url ? (
            <SekundarnaAkcia
              ikona={FileText}
              label={pdfBusy ? t("Generujem…") : t("Vygenerovať PDF")}
              onClick={handleGenerate}
              disabled={pdfBusy}
            />
          ) : (
            <SekundarnaAkcia ikona={Download} label={t("Stiahnuť PDF")} onClick={handleDownload} />
          )
        }
        menuActions={
          <>
            <MenuSkupina label={t("Stav ponuky")}>
              {!converted && q.status !== "accepted" && (
                <MenuAkcia ikona={CheckCircle2} onClick={() => setStatus("accepted")}>
                  {t("Akceptovaná")}
                </MenuAkcia>
              )}
              {!converted && q.status !== "rejected" && (
                <MenuAkcia ikona={XCircle} onClick={() => setStatus("rejected")} nebezpecna>
                  {t("Zamietnutá")}
                </MenuAkcia>
              )}
            </MenuSkupina>
            <MenuSkupina label={t("Nadväzné doklady")}>
              {!primarnaKonverzia && (
                <MenuAkcia ikona={ArrowRightLeft} onClick={handleConvert} disabled={converted || busy === "conv"}>
                  {converted ? t("Konvertovaná") : t("Konvertovať na faktúru")}
                </MenuAkcia>
              )}
              <MenuAkcia
                ikona={ClipboardList}
                onClick={async () => {
                  const cid = getActiveCompanyId();
                  if (!cid) return;
                  if (!(await potvrd(t("Vytvoriť z ponuky prijatú objednávku?")))) return;
                  setBusy("obj");
                  try {
                    const r: any = await naObjednavku({ data: { company_id: cid, quote_id: id } });
                    navigate({ to: "/objednavky/$id", params: { id: r.id } });
                  } catch (e: any) {
                    toast.error(e?.message ?? t("Objednávku sa nepodarilo vytvoriť"));
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={busy === "obj"}
              >
                {t("Vytvoriť objednávku")}
              </MenuAkcia>
              <MenuAkcia ikona={Copy} onClick={handleDuplicate} disabled={busy === "dup"}>
                {t("Duplikovať")}
              </MenuAkcia>
            </MenuSkupina>
            <MenuSkupina label={t("Ostatné")}>
              {primarnaKonverzia && (
                <MenuAkcia ikona={Mail} onClick={openEmail} disabled={converted}>
                  {t("Poslať e-mailom")}
                </MenuAkcia>
              )}
              {q.pdf_url && (
                <MenuAkcia ikona={RefreshCw} onClick={handleGenerate} disabled={pdfBusy}>
                  {pdfBusy ? "…" : t("Pregenerovať PDF")}
                </MenuAkcia>
              )}
            </MenuSkupina>
          </>
        }
      />
      <PageBody>
        {converted && q.converted_invoice_id && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
            <span>{t("Táto ponuka bola konvertovaná na faktúru.")}</span>
            <Link
              to="/faktury/$id"
              params={{ id: q.converted_invoice_id }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              {t("Otvoriť faktúru →")}
            </Link>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("Dodávateľ")}
                </div>
                <div className="mt-1 font-medium">{company?.name}</div>
                <div className="text-sm text-muted-foreground">
                  {company?.street}
                  <br />
                  {company?.zip} {company?.city}, {company?.country}
                </div>
                <div className="mt-2 text-sm">
                  {t("IČO")}: {company?.ico ?? "—"} · {t("DIČ")}: {company?.dic ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("Odberateľ")}
                </div>
                <div className="mt-1 font-medium">{q.customer_name}</div>
                <div className="text-sm text-muted-foreground">
                  {q.customer_street}
                  <br />
                  {q.customer_zip} {q.customer_city}, {q.customer_country}
                </div>
                <div className="mt-2 text-sm">
                  {t("IČO")}: {q.customer_ico ?? "—"} · {t("DIČ")}: {q.customer_dic ?? "—"}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("Položka")}</th>
                    <th className="p-3 text-right">{t("Mn.")}</th>
                    <th className="p-3">{t("MJ")}</th>
                    <th className="p-3 text-right">{t("Cena")}</th>
                    <th className="p-3 text-right">{t("DPH")}</th>
                    <th className="p-3 text-right">{t("Spolu")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {t("Žiadne položky.")}
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-3">
                        <div className="font-medium">{it.name}</div>
                        {it.description && (
                          <div className="text-xs text-muted-foreground">{it.description}</div>
                        )}
                      </td>
                      <td className="p-3 text-right">{Number(it.quantity)}</td>
                      <td className="p-3">{it.unit}</td>
                      <td className="p-3 text-right">{formatujJednotkovuCenu(it.unit_price)}</td>
                      <td className="p-3 text-right">{it.vat_rate}%</td>
                      <td className="p-3 text-right font-medium">{formatujCislo(it.total, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {q.notes && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">
                {q.notes}
              </div>
            )}

            {/* Ako odberateľ odpovedal cez odkaz v e-maile. Dôvod zamietnutia sa
                inak stratí v pošte a pri ďalšej ponuke nikto nevie, čo mu vadilo. */}
            {q.responded_at && (q.status === "accepted" || q.status === "rejected") && (
              <div
                className={`rounded-xl border p-5 text-sm ${
                  q.status === "accepted"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-destructive/40 bg-destructive/10"
                }`}
              >
                <div className="font-medium">
                  {q.status === "accepted" ? t("Odberateľ ponuku prijal {kedy}", { kedy: new Date(q.responded_at).toLocaleString("sk-SK") }) : t("Odberateľ ponuku zamietol {kedy}", { kedy: new Date(q.responded_at).toLocaleString("sk-SK") })}
                </div>
                {q.response_note && (
                  <div className="mt-2 whitespace-pre-wrap text-muted-foreground">
                    {t("Dôvod:")} {q.response_note}
                  </div>
                )}
              </div>
            )}

            <PrilohyFaktury
              druh="quote"
              dokladId={q.id}
              mozeMenit={!converted}
              onZmena={setPocetPriloh}
            />
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("Sumár")}</div>
              <div className="mt-3 space-y-1 text-sm">
                {Number(q.discount_total ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("Medzisúčet")}</span>
                      <span>
                        {(Number(q.subtotal) + Number(q.discount_total)).toFixed(2)} {q.currency}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("Zľava")}</span>
                      <span>
                        −{Number(q.discount_total).toFixed(2)} {q.currency}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Bez DPH")}</span>
                  <span>
                    {Number(q.subtotal).toFixed(2)} {q.currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("DPH")}</span>
                  <span>
                    {Number(q.vat_total).toFixed(2)} {q.currency}
                  </span>
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-3 text-lg font-semibold">
                {Number(q.total).toFixed(2)} {q.currency}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("Údaje")}</div>
              <div className="mt-2">
                {t("Číslo:")} <span className="font-mono">{q.quote_number}</span>
              </div>
              <div>{t("Mena:")} {q.currency}</div>
              <div>{t("Platnosť do:")} {datumNaDoklade(q.valid_until)}</div>
            </div>
          </aside>
        </div>
      </PageBody>

      {emailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEmailOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Odoslať ponuku e-mailom")}
            className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">{t("Odoslať ponuku e-mailom")}</h3>
            <label className="block text-sm">
              <span className="font-medium">{t("Príjemca")}</span>
              <input
                value={emailForm.recipient_email}
                onChange={(e) => setEmailForm({ ...emailForm, recipient_email: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Predmet")}</span>
              <input
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Správa")}</span>
              <textarea
                rows={6}
                value={emailForm.message}
                onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {pocetPriloh > 0 && (
              <label className="flex items-start gap-2 rounded-md border border-border bg-secondary/30 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={posielatPrilohy}
                  onChange={(e) => setPosielatPrilohy(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{t("Odoslať aj prílohy ponuky")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {pocetPriloh === 1
                      ? t("K ponuke visí 1 príloha")
                      : t("K ponuke visia prílohy: {n}", { n: pocetPriloh })}
                    {t(". Pôjdu v tom istom maile.")}
                  </span>
                </span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">{t("PDF ponuky sa pripojí automaticky.")}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEmailOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                {t("Zrušiť")}
              </button>
              <button
                onClick={submitEmail}
                disabled={busy === "mail"}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy === "mail" ? t("Odosielam…") : t("Odoslať")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
