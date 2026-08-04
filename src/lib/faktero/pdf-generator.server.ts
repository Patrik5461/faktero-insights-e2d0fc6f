import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";
import { paymentMethodLabel } from "./payment-method";

function b64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const ROBOTO_REGULAR_BYTES = b64ToBytes(RobotoRegularBase64);
const ROBOTO_BOLD_BYTES = b64ToBytes(RobotoBoldBase64);

export type InvoicePdfInput = {
  company: any;
  invoice: any;
  items: any[];
  logoBytes?: Uint8Array | null;
  logoMime?: string | null;
  /** Document title shown top-right, e.g. "FAKTÚRA" or "CENOVÁ PONUKA". Defaults to FAKTÚRA. */
  documentLabel?: string;
  /** Override the meta-strip rows (label/value pairs). */
  metaOverride?: [string, string][] | null;
  /** When true, omits the payment block and QR code (useful for quotes). */
  hidePayment?: boolean;
  /** Override number-prefix shown under the title (default: "č. {invoice_number}"). */
  numberLabel?: string;
  /** Optional public URL where the customer can pay this invoice online (e.g. GoPay). */
  paymentLinkUrl?: string | null;
};

function fmt(n: number, currency = "EUR") {
  // Slovak money format: 20 000,00 EUR (NBSP thousands, comma decimal, NBSP before currency)
  const v = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = Math.abs(v).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  const sign = v < 0 ? "-" : "";
  return `${sign}${grouped},${decPart}\u00A0${currency}`;
}

function spaydString(opts: {
  iban: string;
  amount: number;
  currency: string;
  vs?: string | null;
  msg?: string | null;
}) {
  const parts = [
    "SPD*1.0",
    `ACC:${opts.iban.replace(/\s+/g, "")}`,
    `AM:${opts.amount.toFixed(2)}`,
    `CC:${opts.currency}`,
  ];
  if (opts.vs) parts.push(`X-VS:${opts.vs}`);
  if (opts.msg) parts.push(`MSG:${opts.msg.slice(0, 60)}`);
  return parts.join("*");
}

// Unicode-safe — Roboto TTF embedded via fontkit supports full Slovak/Czech diacritics.
function san(s: any): string {
  if (s == null) return "";
  return String(s);
}

export async function generateInvoicePdfBytes(input: InvoicePdfInput): Promise<Uint8Array> {
  const { company, invoice, items } = input;
  const docLabel = input.documentLabel ?? "FAKTÚRA";
  const numberLabel =
    input.numberLabel ?? `č. ${invoice.invoice_number ?? invoice.quote_number ?? ""}`;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(ROBOTO_REGULAR_BYTES, { subset: true });
  const bold = await doc.embedFont(ROBOTO_BOLD_BYTES, { subset: true });
  const { width, height } = page.getSize();
  const margin = 44;
  const innerW = width - margin * 2;

  // Palette — accent color is configurable per company (Vzhľad faktúry)
  const accent = hexToRgb((company as any).invoice_accent_color) ?? rgb(0.071, 0.451, 0.318);
  const primary = accent;
  const primaryDark = darken(accent, 0.25);

  const ink = rgb(0.067, 0.094, 0.118);
  const sub = rgb(0.31, 0.36, 0.42);
  const muted = rgb(0.49, 0.54, 0.6);
  const hairline = rgb(0.88, 0.9, 0.92);
  const surface = rgb(0.972, 0.98, 0.976);
  const surfaceAlt = rgb(0.985, 0.989, 0.987);
  const white = rgb(1, 1, 1);

  let y = height - margin;

  // ── Header: thin emerald accent bar + logo (L) / title block (R) ──
  page.drawRectangle({ x: margin, y: y - 2, width: 56, height: 3, color: primary });
  y -= 14;

  // Logo
  let headerLogoBottom = y;
  if (input.logoBytes && input.logoMime) {
    try {
      const img = input.logoMime.includes("png")
        ? await doc.embedPng(input.logoBytes)
        : await doc.embedJpg(input.logoBytes);
      const w = 96;
      const h = (img.height / img.width) * w;
      page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
      headerLogoBottom = y - h;
    } catch {
      /* ignore */
    }
  } else if (company.name) {
    page.drawText(san(company.name), { x: margin, y: y - 14, size: 14, font: bold, color: ink });
    headerLogoBottom = y - 18;
  }

  // Title block, right aligned
  const titleSize = 26;
  const titleW = bold.widthOfTextAtSize(san(docLabel), titleSize);
  page.drawText(san(docLabel), {
    x: width - margin - titleW,
    y: y - 8,
    size: titleSize,
    font: bold,
    color: ink,
  });
  const numW = font.widthOfTextAtSize(san(numberLabel), 12);
  page.drawText(san(numberLabel), {
    x: width - margin - numW,
    y: y - 30,
    size: 12,
    font,
    color: sub,
  });

  y = Math.min(headerLogoBottom, y - 50) - 24;

  // ── Parties: side-by-side cards ──
  const gap = 16;
  const colW = (innerW - gap) / 2;
  const partyH = drawPartyCard(
    page,
    font,
    bold,
    margin,
    y,
    colW,
    "DODÁVATEĽ",
    {
      name: company.name,
      lines: addressLines(company.street, company.zip, company.city, company.country),
      ico: company.ico,
      dic: company.dic,
      ic_dph: company.ic_dph,
      email: company.email,
      phone: company.phone,
    },
    { ink, sub, muted, hairline, primary, surface },
  );
  const partyH2 = drawPartyCard(
    page,
    font,
    bold,
    margin + colW + gap,
    y,
    colW,
    "ODBERATEĽ",
    {
      name: invoice.customer_name,
      lines: addressLines(
        invoice.customer_street,
        invoice.customer_zip,
        invoice.customer_city,
        invoice.customer_country,
      ),
      ico: invoice.customer_ico,
      dic: invoice.customer_dic,
      ic_dph: invoice.customer_ic_dph,
      email: invoice.customer_email,
    },
    { ink, sub, muted, hairline, primary, surface },
  );
  y -= Math.max(partyH, partyH2) + 22;

  // ── Meta strip (compact, divided) ──
  // A paid invoice must not look like a payment request (double-payment risk):
  // due date / variable symbol are replaced by the settlement details.
  const isPaid = invoice.status === "paid";
  const paidDate = invoice.paid_at ? String(invoice.paid_at).slice(0, 10) : null;
  const meta: [string, string][] =
    input.metaOverride ??
    (isPaid
      ? [
          ["Dátum vystavenia", invoice.issue_date ?? "—"],
          ["Dátum dodania", invoice.delivery_date ?? "—"],
          ["Dátum úhrady", paidDate ?? "—"],
          ["Forma úhrady", paymentMethodLabel(invoice.payment_method)],
        ]
      : [
          ["Dátum vystavenia", invoice.issue_date ?? "—"],
          ["Dátum dodania", invoice.delivery_date ?? "—"],
          ["Dátum splatnosti", invoice.due_date ?? "—"],
          ["Variabilný symbol", invoice.variable_symbol ?? "—"],
          ["Forma úhrady", paymentMethodLabel(invoice.payment_method)],
        ]);
  const metaBoxH = 46;
  page.drawRectangle({
    x: margin,
    y: y - metaBoxH,
    width: innerW,
    height: metaBoxH,
    color: surfaceAlt,
    borderColor: hairline,
    borderWidth: 0.5,
  });
  const metaW = innerW / meta.length;
  meta.forEach(([k, v], i) => {
    const x = margin + i * metaW + 12;
    page.drawText(san(k.toUpperCase()), { x, y: y - 14, size: 7, font: bold, color: muted });
    page.drawText(san(String(v)), { x, y: y - 30, size: 10.5, font: bold, color: ink });
    if (i > 0) {
      page.drawLine({
        start: { x: margin + i * metaW, y: y - 8 },
        end: { x: margin + i * metaW, y: y - metaBoxH + 8 },
        color: hairline,
        thickness: 0.5,
      });
    }
  });
  y -= metaBoxH + 22;

  // ── Items table ──
  // Fixed column widths (sum = innerW = 507.28pt). Right-aligned numeric.
  const cols = computeCols(innerW);
  const PAD = 8;
  const FOOTER_RESERVE = 72; // space reserved for footer + breathing room
  const BOTTOM_LIMIT = FOOTER_RESERVE;
  const NAME_SIZE = 10,
    DESC_SIZE = 8.5,
    ROW_LINE_H = 12;
  const ROW_PAD_Y = 8;

  const pages: PDFPage[] = [page];
  let cur = page;

  const newDocPage = (): PDFPage => {
    const p = doc.addPage([595.28, 841.89]);
    pages.push(p);
    return p;
  };

  const drawTableHeader = (p: PDFPage, top: number): number => {
    const headerH = 26;
    p.drawRectangle({
      x: margin,
      y: top - headerH,
      width: innerW,
      height: headerH,
      color: rgb(0.96, 0.97, 0.965),
    });
    const baseY = top - 17;
    p.drawText("POLOŽKA", { x: cols.name.x + PAD, y: baseY, size: 8.5, font: bold, color: sub });
    drawAligned(p, bold, "MNOŽSTVO", cols.qty.x + cols.qty.w - PAD, baseY, 8.5, sub, "right");
    p.drawText("MJ", { x: cols.unit.x + PAD, y: baseY, size: 8.5, font: bold, color: sub });
    drawAligned(p, bold, "CENA", cols.price.x + cols.price.w - PAD, baseY, 8.5, sub, "right");
    drawAligned(p, bold, "DPH", cols.vat.x + cols.vat.w - PAD, baseY, 8.5, sub, "right");
    drawAligned(p, bold, "CELKOM", cols.tot.x + cols.tot.w - PAD, baseY, 8.5, sub, "right");
    return top - headerH;
  };

  y = drawTableHeader(cur, y);

  // Pre-wrap name + description per item to compute row height
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const nameLines = wrapLines(String(it.name ?? ""), bold, NAME_SIZE, cols.name.w - PAD * 2);
    const descLines = it.description
      ? wrapLines(String(it.description), font, DESC_SIZE, cols.name.w - PAD * 2)
      : [];
    const textH =
      nameLines.length * (NAME_SIZE + 2) +
      (descLines.length ? 2 + descLines.length * (DESC_SIZE + 2) : 0);
    const rowH = Math.max(28, textH + ROW_PAD_Y * 2);

    // Page break if row would overflow the safe area
    if (y - rowH < BOTTOM_LIMIT) {
      cur = newDocPage();
      y = height - margin;
      y = drawTableHeader(cur, y);
    }

    if (idx % 2 === 1) {
      cur.drawRectangle({ x: margin, y: y - rowH, width: innerW, height: rowH, color: surface });
    }

    // Name + description (top-aligned inside cell)
    let ty2 = y - ROW_PAD_Y - NAME_SIZE;
    nameLines.forEach((ln) => {
      cur.drawText(ln, { x: cols.name.x + PAD, y: ty2, size: NAME_SIZE, font: bold, color: ink });
      ty2 -= NAME_SIZE + 2;
    });
    if (descLines.length) {
      ty2 -= 2;
      descLines.forEach((ln) => {
        cur.drawText(ln, { x: cols.name.x + PAD, y: ty2, size: DESC_SIZE, font, color: muted });
        ty2 -= DESC_SIZE + 2;
      });
    }

    // Numeric columns — vertically centered on first text line
    const numBaseline = y - ROW_PAD_Y - NAME_SIZE;
    drawAligned(
      cur,
      font,
      fmtQty(it.quantity),
      cols.qty.x + cols.qty.w - PAD,
      numBaseline,
      10,
      ink,
      "right",
    );
    cur.drawText(String(it.unit ?? ""), {
      x: cols.unit.x + PAD,
      y: numBaseline,
      size: 10,
      font,
      color: ink,
    });
    drawAligned(
      cur,
      font,
      fmt(Number(it.unit_price), invoice.currency),
      cols.price.x + cols.price.w - PAD,
      numBaseline,
      10,
      ink,
      "right",
    );
    drawAligned(
      cur,
      font,
      invoice.reverse_charge ? "PDP" : `${Number(it.vat_rate)}%`,
      cols.vat.x + cols.vat.w - PAD,
      numBaseline,
      10,
      ink,
      "right",
    );
    drawAligned(
      cur,
      bold,
      fmt(Number(it.total), invoice.currency),
      cols.tot.x + cols.tot.w - PAD,
      numBaseline,
      10,
      ink,
      "right",
    );

    y -= rowH;
    cur.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      color: hairline,
      thickness: 0.5,
    });
  }

  y -= 22;

  // ── Totals (right-aligned block, full width below table) ──
  const totalsBlockW = 260;
  const totalsX = width - margin - totalsBlockW;
  const discount = Number(invoice.discount_total ?? invoice.discount ?? 0);

  const ensureSpace = (need: number) => {
    if (y - need < BOTTOM_LIMIT) {
      cur = newDocPage();
      y = height - margin;
    }
  };

  // Estimate totals block height
  const totalsRows = 2 + (discount > 0 ? 1 : 0);
  const totalsH = totalsRows * 18 + 8 + 60;
  ensureSpace(totalsH);

  let ty = y;
  drawTotalRow(
    cur,
    font,
    "Medzisúčet",
    fmt(Number(invoice.subtotal), invoice.currency),
    totalsX,
    ty,
    totalsBlockW,
    ink,
    sub,
  );
  ty -= 18;
  if (!invoice.reverse_charge) {
    drawTotalRow(
      cur,
      font,
      "DPH",
      fmt(Number(invoice.vat_total), invoice.currency),
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
  } else {
    drawTotalRow(
      cur,
      font,
      "DPH (PDP)",
      "0,00\u00A0" + invoice.currency,
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
  }
  if (discount > 0) {
    drawTotalRow(
      cur,
      font,
      "Zľava",
      `− ${fmt(discount, invoice.currency)}`,
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
  }
  cur.drawLine({
    start: { x: totalsX, y: ty + 6 },
    end: { x: totalsX + totalsBlockW, y: ty + 6 },
    color: hairline,
    thickness: 0.5,
  });
  ty -= 4;

  const heroH = 56;
  cur.drawRectangle({
    x: totalsX,
    y: ty - heroH,
    width: totalsBlockW,
    height: heroH,
    color: primary,
  });
  cur.drawRectangle({ x: totalsX, y: ty - heroH, width: 4, height: heroH, color: primaryDark });
  cur.drawText(isPaid ? "UHRADENÉ" : "SPOLU K ÚHRADE", {
    x: totalsX + 16,
    y: ty - 22,
    size: 9,
    font: bold,
    color: rgb(0.85, 0.95, 0.9),
  });
  drawAligned(
    cur,
    bold,
    fmt(Number(invoice.total), invoice.currency),
    totalsX + totalsBlockW - 16,
    ty - 42,
    16,
    white,
    "right",
  );
  if (isPaid) {
    const paidNote = `Uhradené ${paidDate ?? "—"} · ${paymentMethodLabel(invoice.payment_method)}`;
    cur.drawText(san(paidNote), {
      x: totalsX,
      y: ty - heroH - 14,
      size: 9,
      font: bold,
      color: primaryDark,
    });
  }

  y = ty - heroH - (isPaid ? 38 : 24);

  // ── Payment card (full width, two columns: data | QR) ──
  if (!input.hidePayment && !isPaid) {
    const payH = 140;
    ensureSpace(payH + 12);
    const payX = margin;
    const payY = y;
    const payW = innerW;
    const qrSize = 100;
    const qrGap = 24; // gap between data column and QR
    const qrCol = qrSize + 32; // right column width with padding
    const dataColW = payW - qrCol - qrGap;

    cur.drawRectangle({
      x: payX,
      y: payY - payH,
      width: payW,
      height: payH,
      color: white,
      borderColor: hairline,
      borderWidth: 0.7,
    });
    cur.drawRectangle({ x: payX, y: payY - payH, width: 3, height: payH, color: primary });
    cur.drawText("PLATOBNÉ ÚDAJE", {
      x: payX + 16,
      y: payY - 20,
      size: 8,
      font: bold,
      color: muted,
    });

    const rows: [string, string][] = [
      ["IBAN", company.iban ?? "—"],
      ["SWIFT/BIC", company.swift ?? "—"],
      ["Variabilný symbol", invoice.variable_symbol ?? "—"],
      ["Dátum splatnosti", invoice.due_date ?? "—"],
    ];
    const labelColW = 110;
    const valueColW = Math.max(80, dataColW - labelColW - 16);
    rows.forEach(([k, v], i) => {
      const ry = payY - 42 - i * 20;
      cur.drawText(String(k), { x: payX + 16, y: ry, size: 8.5, font, color: muted });
      // Truncate value to fit value column
      const valStr = ellipsize(String(v), bold, 10, valueColW);
      cur.drawText(valStr, { x: payX + 16 + labelColW, y: ry, size: 10, font: bold, color: ink });
    });

    // QR on the right with a clear gap from data column
    if (company.iban) {
      try {
        const qrText = spaydString({
          iban: company.iban,
          amount: Number(invoice.total),
          currency: invoice.currency,
          vs: invoice.variable_symbol,
          msg: `Faktura ${invoice.invoice_number}`,
        });
        const dataUrl = await QRCode.toDataURL(qrText, { margin: 0, width: 240 });
        const png = await doc.embedPng(dataUrl);
        const qrX = payX + payW - qrSize - 16;
        const qrY = payY - payH + (payH - qrSize) / 2;
        cur.drawImage(png, { x: qrX, y: qrY, width: qrSize, height: qrSize });
        cur.drawText("QR PLATBA PREVODOM", {
          x: qrX,
          y: qrY + qrSize + 6,
          size: 7,
          font: bold,
          color: muted,
        });
      } catch {
        /* ignore */
      }
    }
    y = payY - payH - 24;

    // ── GoPay online payment card (only when a payment link is available) ──
    if (input.paymentLinkUrl) {
      const gpH = 130;
      ensureSpace(gpH + 12);
      const gpX = margin;
      const gpY = y;
      const gpW = innerW;
      const gpQR = 96;

      cur.drawRectangle({
        x: gpX,
        y: gpY - gpH,
        width: gpW,
        height: gpH,
        color: white,
        borderColor: hairline,
        borderWidth: 0.7,
      });
      cur.drawRectangle({ x: gpX, y: gpY - gpH, width: 3, height: gpH, color: primary });
      cur.drawText("ONLINE PLATBA GOPAY", {
        x: gpX + 16,
        y: gpY - 20,
        size: 8,
        font: bold,
        color: muted,
      });

      // Pseudo "button" — emerald rounded-ish rect with white label
      const btnLabel = "Zaplatiť online";
      const btnPadX = 14;
      const btnH = 26;
      const btnW = bold.widthOfTextAtSize(btnLabel, 11) + btnPadX * 2;
      const btnX = gpX + 16;
      const btnY = gpY - 50;
      cur.drawRectangle({ x: btnX, y: btnY - btnH, width: btnW, height: btnH, color: primary });
      cur.drawText(btnLabel, {
        x: btnX + btnPadX,
        y: btnY - btnH + 8,
        size: 11,
        font: bold,
        color: white,
      });

      cur.drawText("Naskenujte QR kód alebo otvorte odkaz:", {
        x: gpX + 16,
        y: btnY - btnH - 16,
        size: 8.5,
        font,
        color: muted,
      });
      const linkStr = ellipsize(String(input.paymentLinkUrl), font, 9, gpW - gpQR - 64);
      cur.drawText(linkStr, {
        x: gpX + 16,
        y: btnY - btnH - 30,
        size: 9,
        font: bold,
        color: primaryDark,
      });

      try {
        const dataUrl = await QRCode.toDataURL(String(input.paymentLinkUrl), {
          margin: 0,
          width: 240,
        });
        const png = await doc.embedPng(dataUrl);
        const qrX = gpX + gpW - gpQR - 16;
        const qrY = gpY - gpH + (gpH - gpQR) / 2;
        cur.drawImage(png, { x: qrX, y: qrY, width: gpQR, height: gpQR });
        cur.drawText("ONLINE PLATBA GOPAY", {
          x: qrX - 8,
          y: qrY + gpQR + 6,
          size: 7,
          font: bold,
          color: muted,
        });
      } catch {
        /* ignore */
      }

      y = gpY - gpH - 24;
    }
  }

  // ── Reverse charge legal text ──
  if (invoice.reverse_charge) {
    const rcText =
      invoice.reverse_charge_type === "eu_b2b"
        ? "Intrakomunitárne dodanie tovaru/služby oslobodené od DPH podľa §43 zákona č. 222/2004 Z. z. Daň je povinný priznať odberateľ."
        : invoice.reverse_charge_type === "export"
          ? "Vývoz tovaru mimo územia EÚ oslobodený od DPH podľa §47 zákona č. 222/2004 Z. z."
          : "Prenesenie daňovej povinnosti podľa §69 ods. 12 zákona č. 222/2004 Z. z. o DPH. Daň je povinný priznať a odviesť odberateľ.";
    const rcLines = wrapLines(rcText, bold, 9.5, innerW - 16);
    const needed = 18 + rcLines.length * 12 + 16;
    ensureSpace(needed);
    cur.drawRectangle({
      x: margin,
      y: y - (rcLines.length * 12 + 14),
      width: innerW,
      height: rcLines.length * 12 + 14,
      color: rgb(0.98, 0.94, 0.84),
      borderColor: rgb(0.85, 0.7, 0.3),
      borderWidth: 0.7,
    });
    let ry = y - 12;
    rcLines.forEach((ln) => {
      cur.drawText(ln, {
        x: margin + 8,
        y: ry,
        size: 9.5,
        font: bold,
        color: rgb(0.4, 0.28, 0.05),
      });
      ry -= 12;
    });
    y -= rcLines.length * 12 + 22;
  }

  if (invoice.notes) {
    const noteLines = wrapLines(String(invoice.notes), font, 9.5, innerW);
    const needed = 18 + noteLines.length * 12 + 12;
    ensureSpace(needed);
    cur.drawText("POZNÁMKY", { x: margin, y, size: 8, font: bold, color: muted });
    y -= 14;
    noteLines.forEach((ln) => {
      cur.drawText(ln, { x: margin, y, size: 9.5, font, color: sub });
      y -= 12;
    });
    y -= 12;
  }

  // ── Footer on every page ──
  const footerText = company.invoice_footer ?? "Vystavené cez Faktero — faktero.app";
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: margin, y: 52 },
      end: { x: width - margin, y: 52 },
      color: hairline,
      thickness: 0.5,
    });
    p.drawText(footerText, { x: margin, y: 38, size: 7.5, font, color: muted });
    const pageLabel = `Strana ${i + 1} / ${pages.length}`;
    const plw = font.widthOfTextAtSize(pageLabel, 7.5);
    p.drawText(pageLabel, { x: width - margin - plw, y: 38, size: 7.5, font, color: muted });
  });

  return await doc.save();
}

// Column layout — fixed widths inside innerW (sum = innerW).
function computeCols(innerW: number) {
  // Tuned so numeric columns fit "16 666,67 EUR" / "20 000,00 EUR" at 10pt
  // (Roboto) without colliding. innerW ≈ 507pt on A4 with 44pt margins.
  const name = 178;
  const qty = 48;
  const unit = 28;
  const price = 100;
  const vat = 42;
  const tot = innerW - (name + qty + unit + price + vat);
  const x0 = 44; // margin
  return {
    name: { x: x0, w: name },
    qty: { x: x0 + name, w: qty },
    unit: { x: x0 + name + qty, w: unit },
    price: { x: x0 + name + qty + unit, w: price },
    vat: { x: x0 + name + qty + unit + price, w: vat },
    tot: { x: x0 + name + qty + unit + price + vat, w: tot },
  };
}

// Word-wrap with hard break for tokens longer than the column.
function wrapLines(text: string, f: PDFFont, size: number, maxW: number): string[] {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  const widthOf = (s: string) => f.widthOfTextAtSize(s, size);
  const hardSplit = (w: string): string[] => {
    const parts: string[] = [];
    let cur = "";
    for (const ch of w) {
      if (widthOf(cur + ch) > maxW && cur) {
        parts.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) parts.push(cur);
    return parts;
  };
  for (const w of words) {
    if (widthOf(w) > maxW) {
      if (line) {
        out.push(line);
        line = "";
      }
      const chunks = hardSplit(w);
      for (let i = 0; i < chunks.length - 1; i++) out.push(chunks[i]);
      line = chunks[chunks.length - 1];
      continue;
    }
    const trial = line ? `${line} ${w}` : w;
    if (widthOf(trial) > maxW) {
      out.push(line);
      line = w;
    } else line = trial;
  }
  if (line) out.push(line);
  return out;
}

function ellipsize(text: string, f: PDFFont, size: number, maxW: number): string {
  if (f.widthOfTextAtSize(text, size) <= maxW) return text;
  const ell = "…";
  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f.widthOfTextAtSize(text.slice(0, mid) + ell, size) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}

function drawAligned(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: any,
  align: "left" | "right",
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: align === "right" ? x - w : x, y, size, font, color });
}

function drawTotalRow(
  page: PDFPage,
  font: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  ink: any,
  muted: any,
) {
  page.drawText(san(label), { x, y, size: 10, font, color: muted });
  drawAligned(page, font, san(value), x + w, y, 10.5, ink, "right");
}

function addressLines(street?: string, zip?: string, city?: string, country?: string): string[] {
  const lines: string[] = [];
  if (street) lines.push(String(street));
  const cityLine = [zip, city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (country) lines.push(String(country));
  return lines;
}

function fmtQty(q: any): string {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function drawPartyCard(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  w: number,
  label: string,
  p: {
    name?: string;
    lines: string[];
    ico?: string;
    dic?: string;
    ic_dph?: string;
    email?: string;
    phone?: string;
  },
  c: { ink: any; sub: any; muted: any; hairline: any; primary: any; surface: any },
): number {
  const padX = 16;
  const padTop = 16;
  let cy = y - padTop;

  // Label
  page.drawText(san(label), { x: x + padX, y: cy - 4, size: 8, font: bold, color: c.primary });
  cy -= 18;

  // Name
  if (p.name) {
    page.drawText(san(p.name), { x: x + padX, y: cy - 12, size: 13, font: bold, color: c.ink });
    cy -= 20;
  }

  // Address lines
  p.lines.forEach((l) => {
    page.drawText(san(l), { x: x + padX, y: cy - 10, size: 9.5, font, color: c.sub });
    cy -= 13;
  });

  // Tax IDs (compact)
  const ids: [string, string][] = [];
  if (p.ico) ids.push(["IČO", String(p.ico)]);
  if (p.dic) ids.push(["DIČ", String(p.dic)]);
  if (p.ic_dph) ids.push(["IČ DPH", String(p.ic_dph)]);
  if (ids.length) {
    cy -= 6;
    page.drawLine({
      start: { x: x + padX, y: cy },
      end: { x: x + w - padX, y: cy },
      color: c.hairline,
      thickness: 0.5,
    });
    cy -= 4;
    ids.forEach(([k, v]) => {
      page.drawText(san(k), { x: x + padX, y: cy - 10, size: 8.5, font, color: c.muted });
      page.drawText(san(v), { x: x + padX + 48, y: cy - 10, size: 9.5, font: bold, color: c.ink });
      cy -= 13;
    });
  }

  if (p.email) {
    cy -= 2;
    page.drawText(san(p.email), { x: x + padX, y: cy - 10, size: 9, font, color: c.muted });
    cy -= 12;
  }

  const cardH = y - cy + 12;
  // Background card (draw behind by overlay-rect with low cover? pdf-lib draws in z-order; we draw rect now ON TOP — workaround: draw lighter alt fill by using border only)
  page.drawRectangle({
    x,
    y: y - cardH,
    width: w,
    height: cardH,
    borderColor: c.hairline,
    borderWidth: 0.7,
  });
  return cardH;
}
