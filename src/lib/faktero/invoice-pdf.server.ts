import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function safePdfFileName(s: string): string {
  return `${String(s || "faktura").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}

export function invoicePdfPath(companyId: string, invoiceId: string) {
  return `${companyId}/${invoiceId}.pdf`;
}

async function computeHash(invoiceId: string): Promise<string | null> {
  const { data, error } = await (supabaseAdmin as any).rpc("faktero_invoice_pdf_hash", {
    _invoice_id: invoiceId,
  });
  if (error) {
    console.warn("[pdf] hash rpc failed", invoiceId, error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/*
  Dobropis sa od 2026-10 kreslí s kladnými sumami. Obsah faktúry sa nezmenil,
  takže hash z databázy je rovnaký a uložené PDF so mínusmi by sa ukazovalo
  ďalej. Značka v hashi ho pri dobropise raz pregeneruje; ostatné doklady
  ostávajú v pamäti, ako boli.
*/
function hashSVerziou(hash: string | null, invoice: { type?: string | null }): string | null {
  return hash && invoice?.type === "credit_note" ? `${hash}:dobropis-kladne` : hash;
}

async function objectExists(companyId: string, invoiceId: string) {
  const { data } = await supabaseAdmin.storage
    .from("invoice-pdfs")
    .list(companyId, { search: `${invoiceId}.pdf`, limit: 1 });
  return Boolean(data && data.length > 0);
}

/**
 * Returns a storage path to a PDF that matches the invoice's current content.
 * Regenerates (and replaces the cached object) whenever the cache is stale,
 * missing, or `force` is set.
 */
export async function ensureInvoicePdf(
  invoiceId: string,
  opts: { force?: boolean } = {},
): Promise<{ path: string; fileName: string; regenerated: boolean }> {
  const { data: invoice, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !invoice) {
    console.error("[pdf] invoice not found", invoiceId, error);
    throw new Error("Faktúra nenájdená");
  }

  const fileName = safePdfFileName((invoice as any).invoice_number ?? "faktura");
  const path = invoicePdfPath(invoice.company_id, invoice.id);
  const hash = hashSVerziou(await computeHash(invoice.id), invoice);
  const cachedHash = (invoice as any).pdf_source_hash as string | null;

  const cacheValid =
    !opts.force &&
    Boolean(invoice.pdf_url) &&
    Boolean(hash) &&
    cachedHash === hash &&
    (await objectExists(invoice.company_id, invoice.id));

  // Cesta sa vždy počíta — `pdf_url` z riadka mohol člen firmy prepísať na cudzí súbor.
  if (cacheValid) return { path, fileName, regenerated: false };

  const [{ data: items }, { data: company }] = await Promise.all([
    supabaseAdmin.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("position"),
    supabaseAdmin.from("companies").select("*").eq("id", invoice.company_id).maybeSingle(),
  ]);
  if (!company) {
    console.error("[pdf] company not found", invoice.company_id);
    throw new Error("Firma nenájdená");
  }

  let logoBytes: Uint8Array | null = null;
  let logoMime: string | null = null;
  if ((company as any).logo_url) {
    try {
      const { data: blob } = await supabaseAdmin.storage
        .from("company-logos")
        .download((company as any).logo_url);
      if (blob) {
        logoBytes = new Uint8Array(await blob.arrayBuffer());
        logoMime = blob.type;
      }
    } catch {
      /* ignore */
    }
  }

  const { stiahniObrazokFirmy } = await import("./firma-obrazky.server");
  const stamp = await stiahniObrazokFirmy((company as any).stamp_url);

  let paymentLinkUrl: string | null = null;
  try {
    const { data: link } = await supabaseAdmin
      .from("invoice_payment_links")
      .select("token, status, expires_at")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      link &&
      link.status !== "cancelled" &&
      (!link.expires_at || new Date(link.expires_at) > new Date())
    ) {
      const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
      paymentLinkUrl = `${base}/pay/${link.token}`;
    }
  } catch {
    /* ignore */
  }

  /*
    Faktúra v cudzej mene musí niesť daň aj v domácej mene firmy (SK eurá,
    CZ koruny). Keď prepočet chýba (napr.
    doklad z importu alebo z času, keď sa kurz neukladal), dotiahne sa teraz —
    inak by na tlači chýbal údaj, ktorý zákon vyžaduje.
  */
  const { domacaMena, krajinaKurzu, nastavenieKurzuDe } = await import("./kurzy");
  const krajinaKurzuFirmy = krajinaKurzu(company.country);
  const { krajinaDane: krajinaDanePdf } = await import("./vat-rates");
  // Nemecká firma: mesačný kurz BMF alebo denný ECB (§ 16 Abs. 6 UStG).
  const nastavenieDe =
    krajinaDanePdf(company.country) === "DE"
      ? nastavenieKurzuDe((company as any).kurz_de_zdroj)
      : null;
  if (
    invoice.currency &&
    invoice.currency !== domacaMena(company.country) &&
    invoice.vat_total_eur == null
  ) {
    try {
      const { prepocitajDoklad } = await import("./kurzy.server");
      const p = await prepocitajDoklad(
        invoice.currency,
        String(invoice.delivery_date || invoice.issue_date),
        {
          zaklad: Number(invoice.subtotal ?? 0),
          dan: Number(invoice.vat_total ?? 0),
          celkom: Number(invoice.total ?? 0),
        },
        krajinaKurzuFirmy,
        nastavenieDe,
      );
      if (p) {
        Object.assign(invoice, {
          exchange_rate: p.kurz,
          exchange_rate_date: p.den,
          exchange_rate_source: p.zdroj,
          subtotal_eur: p.zaklad,
          vat_total_eur: p.dan,
          total_eur: p.celkom,
        });
        await supabaseAdmin
          .from("invoices")
          .update({
            exchange_rate: p.kurz,
            exchange_rate_date: p.den,
            exchange_rate_source: p.zdroj,
            subtotal_eur: p.zaklad,
            vat_total_eur: p.dan,
            total_eur: p.celkom,
          })
          .eq("id", invoice.id);
      }
    } catch (e) {
      console.warn("[pdf] kurz sa nepodarilo doplniť:", String((e as Error)?.message ?? e));
    }
  }

  /*
    Dobropis musí uviesť číslo faktúry, ktorú opravuje (§ 71 ods. 2) — v
    databáze je len odkaz, číslo sa dočíta tu.
  */
  if ((invoice as any).opravuje_fakturu_id) {
    const { data: povodna } = await supabaseAdmin
      .from("invoices")
      .select("invoice_number")
      .eq("id", (invoice as any).opravuje_fakturu_id)
      .maybeSingle();
    if (povodna?.invoice_number) (invoice as any).opravuje_cislo = povodna.invoice_number;
  }

  // Odpočty záloh (zdanená záloha ide do rozpisu DPH so zápornými riadkami).
  let zalohy: import("./zalohy-odpocty").OdpocetZalohy[] | null = null;
  if (invoice.type === "regular" && Number((invoice as any).advance_amount ?? 0) > 0) {
    try {
      const { nacitajOdpocty } = await import("./zalohy-odpocty.server");
      zalohy =
        (await nacitajOdpocty(supabaseAdmin, invoice.company_id, [invoice.id]))[invoice.id] ?? null;
    } catch (e) {
      console.warn("[pdf] odpočty záloh sa nenačítali:", String((e as Error)?.message ?? e));
    }
  }

  const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
  const bytes = await generateInvoicePdfBytes({
    zalohy,
    company,
    invoice,
    items: items ?? [],
    logoBytes,
    logoMime,
    stampBytes: stamp?.bytes ?? null,
    stampMime: stamp?.mime ?? null,
    paymentLinkUrl,
  });

  /*
    Nemecká firma: do PDF sa vloží ZUGFeRD / Factur-X (CII XML, profil
    EN 16931) — PDF je tak zároveň e-faktúrou podľa § 14 UStG. Vloží sa len
    XML bez chýb; keď niečo chýba alebo zlyhá, ostane obyčajné PDF a faktúra
    sa vystaví tak či tak.
  */
  let pdfBajty: Uint8Array = bytes;
  const { krajinaDane } = await import("./vat-rates");
  const { maMatZugferd } = await import("./zugferd.server");
  if (krajinaDane(company.country) === "DE" && maMatZugferd(invoice)) {
    try {
      const { nacitajPodkladyFaktury } = await import("./efaktura-de-podklady.server");
      const { zugferdXml, vlozFacturX } = await import("./zugferd.server");
      const podklady = await nacitajPodkladyFaktury(supabaseAdmin, invoice.company_id, invoice.id, {
        invoice,
        items: items ?? [],
        company,
      });
      const { xml, chyby } = zugferdXml(podklady);
      if (chyby.length) {
        console.warn(
          "[pdf] ZUGFeRD sa nevložil, faktúre chýbajú údaje:",
          invoice.id,
          chyby.map((c) => c.code).join(", "),
        );
      } else {
        pdfBajty = await vlozFacturX(bytes, xml, {
          cislo: String((invoice as any).invoice_number ?? ""),
          firma: String(company.name ?? ""),
        });
      }
    } catch (e) {
      console.warn("[pdf] ZUGFeRD zlyhal:", invoice.id, String((e as Error)?.message ?? e));
    }
  }

  /*
    Starý súbor sa NEMAŽE pred nahratím — `upsert` ho nahradí naraz. Mazanie otváralo
    okno, v ktorom súbor neexistoval: detail faktúry na širokej obrazovke si pýta PDF
    pre bočný náhľad a súčasne používateľ klikne „Stiahnuť PDF“ (force) — jedno volanie
    zmazalo súbor, druhé ho práve podpisovalo a hlásilo „PDF sa nepodarilo podpísať“.
  */
  const { error: upErr } = await supabaseAdmin.storage.from("invoice-pdfs").upload(path, pdfBajty, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    console.error("[pdf] upload failed", path, upErr);
    throw new Error(`PDF sa nepodarilo nahrať: ${upErr.message}`);
  }

  // Re-read the hash: content may have changed while the PDF was rendering.
  const finalHash = hashSVerziou(await computeHash(invoice.id), invoice);
  await supabaseAdmin
    .from("invoices")
    .update({ pdf_url: path, pdf_source_hash: finalHash } as any)
    .eq("id", invoice.id);

  return { path, fileName, regenerated: true };
}

export async function signInvoicePdf(path: string, fileName: string) {
  const podpis = () =>
    supabaseAdmin.storage
      .from("invoice-pdfs")
      .createSignedUrl(path, 60 * 60, { download: fileName });
  let { data: signed, error } = await podpis();
  // Súbežné generovanie toho istého PDF ho môže práve nahrávať — raz počkať a skúsiť znova.
  if (error && /not found/i.test(String(error.message ?? ""))) {
    await new Promise((r) => setTimeout(r, 1500));
    ({ data: signed, error } = await podpis());
  }
  if (error || !signed) {
    console.error("[pdf] sign failed", path, error);
    throw new Error("PDF sa nepodarilo podpísať na stiahnutie.");
  }
  return signed.signedUrl;
}
