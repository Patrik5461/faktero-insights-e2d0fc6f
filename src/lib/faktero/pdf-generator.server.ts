import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { paymeOdkaz, textQrPlatby } from "./qr-platba";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";
import { paymentMethodLabel } from "./payment-method";
import { maZuctovanuZalohu, zostavaUhradit } from "./zaloha";
import { rezimFirmy, type FirmaDph } from "./dph-rezim";
import { textPrepoctu, trebaPrepocet } from "./kurzy";
import { vetyNaDoklad } from "./faktura-nalezitosti";
import { VETA_25A } from "./dph-nezaplatene";
import {
  jazykDokladu,
  localeDokladu,
  popisky,
  type JazykDokladu,
} from "./faktura-jazyk";
import { krajinaDane } from "./vat-rates";
import { sUctomFaktury } from "./platobny-ucet";

function b64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const ROBOTO_REGULAR_BYTES = b64ToBytes(RobotoRegularBase64);
const ROBOTO_BOLD_BYTES = b64ToBytes(RobotoBoldBase64);

/** "#0F7A4D" | "0F7A4D" -> pdf-lib rgb(); null on invalid input. */
function hexToRgb(hex?: string | null) {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function darken(c: ReturnType<typeof rgb>, amount = 0.25) {
  const k = 1 - amount;
  return rgb(c.red * k, c.green * k, c.blue * k);
}

export type InvoicePdfInput = {
  company: any;
  invoice: any;
  items: any[];
  logoBytes?: Uint8Array | null;
  logoMime?: string | null;
  /** Pečiatka (a podpis) firmy — kreslí sa vpravo dole nad pätičkou. */
  stampBytes?: Uint8Array | null;
  stampMime?: string | null;
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
  /**
   * Verejný odkaz na faktúru pre QR na doklade. Odberateľ ho naskenuje a
   * doklad sa mu otvorí — nemusí hľadať prílohu v e-maile ani nič prepisovať.
   */
  verejnyOdkaz?: string | null;
};

/**
 * Suma na doklade v jazyku dokladu.
 *
 * Nemec číta „1.234,56", Angličan „1,234.56" — s jedným formátom by si jeden
 * z nich prečítal sumu o tri rády vedľa. Oddeľovač tisícov je pevná medzera,
 * aby sa číslo nikdy nezlomilo na dva riadky.
 */
function sumaVJazyku(n: number, currency = "EUR", jazyk: JazykDokladu = "sk") {
  const v = Number.isFinite(n) ? n : 0;
  const cislo = new Intl.NumberFormat(localeDokladu(jazyk), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Math.abs(v))
    .replace(/\u202F|\s/g, "\u00A0");
  return `${v < 0 ? "-" : ""}${cislo}\u00A0${currency}`;
}

/**
 * Jednotková cena na doklade.
 *
 * Suma sa zaokrúhľuje na centy, jednotková cena nie — kto predáva po kusoch za
 * zlomky centa, má v cenníku päť desatinných miest a na faktúre by potom
 * „0,13 × 1 000 = 125,00" vyzeralo ako chyba v počítaní. Zobrazia sa len
 * miesta, ktoré cena naozaj má.
 */
function cenaVJazyku(n: number, currency = "EUR", jazyk: JazykDokladu = "sk") {
  const v = Number.isFinite(n) ? n : 0;
  // Koľko desatinných miest cena naozaj má — dve sú základ, päť je strop.
  const orezana = Math.abs(v).toFixed(5).replace(/(\.\d{2}\d*?)0+$/, "$1");
  const miest = (orezana.split(".")[1] ?? "").length;
  const cislo = new Intl.NumberFormat(localeDokladu(jazyk), {
    minimumFractionDigits: Math.max(2, miest),
    maximumFractionDigits: Math.max(2, miest),
  })
    .format(Math.abs(v))
    .replace(/\u202F|\s/g, "\u00A0");
  return `${v < 0 ? "-" : ""}${cislo}\u00A0${currency}`;
}

// Unicode-safe — Roboto TTF embedded via fontkit supports full Slovak/Czech diacritics.
function san(s: any): string {
  if (s == null) return "";
  return String(s);
}

export async function generateInvoicePdfBytes(input: InvoicePdfInput): Promise<Uint8Array> {
  const { invoice, items } = input;
  // Účet, na ktorý majú prísť peniaze, je ten z faktúry (ak ho má).
  const company = sUctomFaktury(input.company, invoice);
  /*
    Nadpis podľa typu dokladu. Zálohová faktúra a doklad k prijatej platbe sa
    doteraz tlačili ako „FAKTÚRA" — na zálohovej je to mätúce (nie je daňový
    doklad) a na doklade k platbe priam nesprávne, lebo z názvu musí byť
    jasné, čoho sa daň týka.
  */
  /*
    Jazyk dokladu. Berie sa z faktúry, inak z odberateľa — prekladajú sa len
    popisky, nie údaje; názvy položiek a poznámky ostávajú tak, ako ich firma
    napísala.
  */
  const jazyk = jazykDokladu((invoice as any).language ?? (input as any).language);
  const t = popisky(jazyk);
  const fmt = (n: number, currency = "EUR") => sumaVJazyku(n, currency, jazyk);
  const fmtCenaJ = (n: number, currency = "EUR") => cenaVJazyku(n, currency, jazyk);
  /* Spôsob úhrady číta odberateľ, nie účtovník — preto v jeho jazyku. */
  const sposobUhrady = (kod?: string | null) => {
    const k = String(kod ?? "").toLowerCase();
    if (!k) return "—";
    if (["bank_transfer", "transfer", "prevod"].includes(k)) return t.uhradaPrevod;
    if (["card", "karta", "credit_card"].includes(k)) return t.uhradaKarta;
    if (["cash", "hotovost"].includes(k)) return t.uhradaHotovost;
    return paymentMethodLabel(kod);
  };

  const podlaTypu: Record<string, string> = {
    proforma: t.zalohovaFaktura,
    advance_payment: t.dokladKPlatbe,
    credit_note: t.dobropis,
  };
  // Doklad podľa § 25a nie je opravná faktúra (§ 71 ods. 2) — vlastný nadpis.
  const docLabel =
    input.documentLabel ??
    ((invoice as any).oprava_25a ? "OPRAVNÝ DOKLAD" : undefined) ??
    podlaTypu[String((invoice as any).type ?? "")] ??
    t.faktura;
  const numberLabel =
    input.numberLabel ?? `${t.cislo} ${invoice.invoice_number ?? invoice.quote_number ?? ""}`;
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
  if (input.logoBytes && input.logoMime && (company as any).invoice_show_logo !== false) {
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

  /*
    Pod číslom ide veta o vyhotovení odberateľom (samofaktúra) a číslo
    opravovanej faktúry (dobropis, § 71 ods. 2). Dole pod súčtami by pri dlhšej
    faktúre odpadli na druhú stranu. Jeden riadok sa zmestí do medzery nad
    rámikmi; každý ďalší hlavičku zvýši — vyššia hlavička by platobné údaje
    dvojpoložkovej faktúry odsunula na druhú stranu, preto čo najmenej.
  */
  const podCislom: string[] = [];
  if (invoice.samofakturacia) podCislom.push(t.vyhotovenieOdberatelom);
  if (invoice.opravuje_cislo) podCislom.push(`${t.opravujeFakturu} ${invoice.opravuje_cislo}`);
  // § 25a ods. 9 — presné znenie, po slovensky bez ohľadu na jazyk dokladu.
  if (invoice.oprava_25a) podCislom.push(VETA_25A);
  podCislom.forEach((riadok, i) => {
    const w = bold.widthOfTextAtSize(san(riadok), 9);
    page.drawText(san(riadok), {
      x: width - margin - w,
      y: y - 44 - i * 11,
      size: 9,
      font: bold,
      color: sub,
    });
  });
  const navyse = Math.max(0, podCislom.length - 1) * 11;

  y = Math.min(headerLogoBottom, y - 50 - navyse) - 18;

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
    t.dodavatel,
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
    { ico: t.ico, dic: t.dic, icDph: t.icDph },
  );
  const partyH2 = drawPartyCard(
    page,
    font,
    bold,
    margin + colW + gap,
    y,
    colW,
    t.odberatel,
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
    { ico: t.ico, dic: t.dic, icDph: t.icDph },
  );
  // Medzery medzi blokmi sú úsporné — o pár bodov viac posielalo platobné
  // údaje bežnej faktúry s textom nad položkami na druhú stranu.
  y -= Math.max(partyH, partyH2) + 16;

  // ── Meta strip (compact, divided) ──
  // A paid invoice must not look like a payment request (double-payment risk):
  // due date / variable symbol are replaced by the settlement details.
  const isPaid = invoice.status === "paid";
  const paidDate = invoice.paid_at ? String(invoice.paid_at).slice(0, 10) : null;
  const meta: [string, string][] =
    input.metaOverride ??
    (isPaid
      ? [
          [t.datumVystavenia, invoice.issue_date ?? "—"],
          [t.datumDodania, invoice.delivery_date ?? "—"],
          [t.datumUhrady, paidDate ?? "—"],
          [t.formaUhrady, sposobUhrady(invoice.payment_method)],
        ]
      : [
          [t.datumVystavenia, invoice.issue_date ?? "—"],
          [t.datumDodania, invoice.delivery_date ?? "—"],
          [t.datumSplatnosti, invoice.due_date ?? "—"],
          [t.variabilnySymbol, invoice.variable_symbol ?? "—"],
          [t.formaUhrady, sposobUhrady(invoice.payment_method)],
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
  y -= metaBoxH + 16;

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
    p.drawText(t.polozka, { x: cols.name.x + PAD, y: baseY, size: 8.5, font: bold, color: sub });
    drawAligned(p, bold, t.mnozstvo, cols.qty.x + cols.qty.w - PAD, baseY, 8.5, sub, "right");
    p.drawText(t.mj, { x: cols.unit.x + PAD, y: baseY, size: 8.5, font: bold, color: sub });
    drawAligned(p, bold, t.cena, cols.price.x + cols.price.w - PAD, baseY, 8.5, sub, "right");
    drawAligned(p, bold, t.dph, cols.vat.x + cols.vat.w - PAD, baseY, 8.5, sub, "right");
    drawAligned(p, bold, t.celkom, cols.tot.x + cols.tot.w - PAD, baseY, 8.5, sub, "right");
    return top - headerH;
  };

  /*
    Text nad položkami. Kreslí sa tesne pred hlavičkou tabuľky, takže sa naň
    vzťahuje to isté zalamovanie strán — dlhý text posunie tabuľku, nie ju
    prekryje. `notes` ostáva pod položkami, tieto dva texty sa nemiešajú.
  */
  if (invoice.intro_note) {
    const introLines = wrapLines(String(invoice.intro_note), font, 9.5, innerW);
    // Zalomenie rieši rovnako ako riadky položiek — `ensureSpace` je definované
    // až nižšie a hlavička tabuľky sa musí kresliť až po tomto texte.
    if (y - (introLines.length * 12 + 10) - 40 < BOTTOM_LIMIT) {
      cur = newDocPage();
      y = height - margin;
    }
    introLines.forEach((ln) => {
      cur.drawText(ln, { x: margin, y, size: 9.5, font, color: sub });
      y -= 12;
    });
    y -= 10;
  }

  /*
    Doklad bez položiek (napríklad nájomné popísané textom) nemá čo dať do
    tabuľky. Prázdna hlavička s čiarami vyzerá ako chyba tlače, tak sa
    nekreslí vôbec.
  */
  if (items.length) y = drawTableHeader(cur, y);

  // Pre-wrap name + description per item to compute row height
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const nameLines = wrapLines(String(it.name ?? ""), bold, NAME_SIZE, cols.name.w - PAD * 2);
    const descLines = it.description
      ? wrapLines(String(it.description), font, DESC_SIZE, cols.name.w - PAD * 2)
      : [];
    /*
      Zľava riadku ide pod názov, nie do vlastného stĺpca — tabuľka má šírky
      vyladené na sumy a ďalší stĺpec by ich stlačil. Jednotková cena ostáva
      pôvodná, takže bez tohto riadku by odberateľ nevedel, prečo je súčet nižší.
    */
    const zlavaRiadku = Number((it as any).discount_percent ?? 0);
    if (zlavaRiadku > 0) {
      descLines.push(
        `${t.zlava} ${new Intl.NumberFormat(localeDokladu(jazyk), { maximumFractionDigits: 2 }).format(zlavaRiadku)} %`,
      );
    }
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
      fmtCenaJ(Number(it.unit_price), invoice.currency),
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

  y -= 16;

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
  const totalsRows = 2 + (discount > 0 ? 2 : 0);
  const totalsH = totalsRows * 18 + 8 + 60;
  ensureSpace(totalsH);

  const totalsTop = y;
  let ty = y;
  /*
    So zľavou na doklad sa najprv ukáže, z čoho sa zľavovalo, potom zľava a až
    potom základ dane. Sumy v `invoice` už zľavu obsahujú, preto sa medzisúčet
    dopočítava naspäť.
  */
  drawTotalRow(
    cur,
    font,
    t.medzisucet,
    fmt(Number(invoice.subtotal) + discount, invoice.currency),
    totalsX,
    ty,
    totalsBlockW,
    ink,
    sub,
  );
  ty -= 18;
  if (discount > 0) {
    drawTotalRow(
      cur,
      font,
      t.zlava,
      `− ${fmt(discount, invoice.currency)}`,
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
    drawTotalRow(
      cur,
      font,
      t.zakladDane,
      fmt(Number(invoice.subtotal), invoice.currency),
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
  }
  if (!invoice.reverse_charge) {
    drawTotalRow(
      cur,
      font,
      t.dph,
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
      `${t.dph} (PDP)`,
      "0,00\u00A0" + invoice.currency,
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
  }
  // Zúčtovaná záloha znižuje sumu na úhradu — odberateľ ju už zaplatil.
  const zaloha = maZuctovanuZalohu((invoice as any).advance_amount)
    ? Number((invoice as any).advance_amount)
    : 0;
  if (zaloha > 0) {
    drawTotalRow(
      cur,
      font,
      t.spolu,
      fmt(Number(invoice.total), invoice.currency),
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
    drawTotalRow(
      cur,
      font,
      t.zuctovanaZaloha,
      `− ${fmt(zaloha, invoice.currency)}`,
      totalsX,
      ty,
      totalsBlockW,
      ink,
      sub,
    );
    ty -= 18;
  }
  const naUhradu = zostavaUhradit(invoice.total, zaloha);
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
  /*
    Doklad podľa § 25a je len daňová oprava — nič sa podľa neho neplatí
    (zníženie) alebo sa už zaplatilo (vrátenie). Bez „k úhrade“ a bez
    platobných údajov, inak by odberateľa naviedol zaplatiť ešte raz.
  */
  const lenOprava = Boolean((invoice as any).oprava_25a);
  cur.drawText(isPaid ? t.uhradene : lenOprava ? t.celkom : t.spoluKUhrade, {
    x: totalsX + 16,
    y: ty - 22,
    size: 9,
    font: bold,
    color: rgb(0.85, 0.95, 0.9),
  });
  drawAligned(
    cur,
    bold,
    fmt(naUhradu, invoice.currency),
    totalsX + totalsBlockW - 16,
    ty - 42,
    16,
    white,
    "right",
  );
  if (isPaid) {
    const paidNote = `Uhradené ${paidDate ?? "—"} · ${sposobUhrady(invoice.payment_method)}`;
    cur.drawText(san(paidNote), {
      x: totalsX,
      y: ty - heroH - 14,
      size: 9,
      font: bold,
      color: primaryDark,
    });
  }

  /*
    Pečiatka firmy do voľného miesta vľavo od súčtov — tam sa na papierovej
    faktúre pečiatkuje a podpisuje, a nikdy kvôli nej nevznikne ďalšia strana.
    Zmestí sa do výšky bloku súčtov a najviac 150 bodov šírky, pomer strán
    obrázka ostane zachovaný.
  */
  const kresliPeciatku = Boolean(
    input.stampBytes && input.stampMime && (company as any).invoice_show_stamp !== false,
  );
  if (input.stampBytes && input.stampMime && (company as any).invoice_show_stamp !== false) {
    try {
      const img = input.stampMime.includes("png")
        ? await doc.embedPng(input.stampBytes)
        : await doc.embedJpg(input.stampBytes);
      const spodok = ty - heroH;
      const maxH = totalsTop - spodok - 16;
      const maxW = Math.min(150, totalsX - margin - 24);
      const mierka = Math.min(maxW / img.width, maxH / img.height, 1);
      const sw = img.width * mierka;
      const sh = img.height * mierka;
      const popis = t.peciatkaPodpis;
      const pw = font.widthOfTextAtSize(popis, 7.5);
      const sirka = Math.max(sw, pw);
      const stredX = margin + 12 + sirka / 2;
      cur.drawImage(img, { x: stredX - sw / 2, y: spodok + 16, width: sw, height: sh });
      cur.drawLine({
        start: { x: stredX - sirka / 2, y: spodok + 12 },
        end: { x: stredX + sirka / 2, y: spodok + 12 },
        color: hairline,
        thickness: 0.5,
      });
      cur.drawText(popis, { x: stredX - pw / 2, y: spodok + 2, size: 7.5, font, color: muted });
    } catch {
      /* poškodený obrázok pečiatky nesmie zabrániť vystaveniu dokladu */
    }
  }

  /*
    Prenesenie daňovej povinnosti vľavo vedľa súčtov, kde je inak prázdno
    (ak tam nesedí pečiatka). Pod platobnými údajmi rámik pridával vlastný
    riadok výšky a faktúra s textom nad položkami kvôli nemu mala dve strany.
  */
  // Vystavovateľ mimo Slovenska (samofaktúra za dodávateľa z EÚ): odkaz na smernicu.
  const cudziVystavovatel =
    Boolean(invoice.samofakturacia) && String(company.country ?? "SK").toUpperCase() !== "SK";
  const textPrenesenia = invoice.reverse_charge
    ? invoice.reverse_charge_type === "eu_b2b"
      ? cudziVystavovatel
        ? invoice.eu_plnenie === "sluzba"
          ? t.prenosEuSluzbaSmernica
          : t.prenosEuTovarSmernica
        : t.prenosEu
      : invoice.reverse_charge_type === "export"
        ? t.prenosVyvoz
        : t.prenosTuzemsko
    : null;
  /*
    Rámik „Faktúra online“ s QR na otvorenie dokladu. Široký (pod platobnými
    údajmi) nesie aj odkaz textom; úzky (vľavo vedľa súčtov) len výzvu a QR —
    odkaz by sa doň nezmestil a orezaný odkaz vyzerá ako chyba.
  */
  const kresliOnline = async (strana: PDFPage, x: number, hore: number, w: number, h: number) => {
    const vQR = 68;
    strana.drawRectangle({
      x,
      y: hore - h,
      width: w,
      height: h,
      color: white,
      borderColor: hairline,
      borderWidth: 0.7,
    });
    strana.drawText(t.fakturaOnline, { x: x + 16, y: hore - 22, size: 8, font: bold, color: muted });
    const textW = w - vQR - 48;
    const siroky = textW > 260;
    const vyzva = wrapLines(t.naskenujteKod, font, 9, textW);
    vyzva.forEach((ln, i) =>
      strana.drawText(ln, { x: x + 16, y: hore - 42 - i * 11, size: 9, font, color: ink }),
    );
    if (siroky) {
      strana.drawText(ellipsize(String(input.verejnyOdkaz), font, 8.5, textW), {
        x: x + 16,
        y: hore - 42 - vyzva.length * 11 - 5,
        size: 8.5,
        font: bold,
        color: primaryDark,
      });
    }
    try {
      const dataUrl = await QRCode.toDataURL(String(input.verejnyOdkaz), { margin: 0, width: 200 });
      const png = await doc.embedPng(dataUrl);
      strana.drawImage(png, {
        x: x + w - vQR - 16,
        y: hore - h + (h - vQR) / 2,
        width: vQR,
        height: vQR,
      });
    } catch {
      /* bez QR ostane aspoň odkaz napísaný textom */
    }
  };

  let prenesenieHotove = false;
  if (textPrenesenia && !kresliPeciatku) {
    const sirka = totalsX - margin - 20;
    const riadky = wrapLines(textPrenesenia, bold, 9, sirka - 16);
    const vyska = riadky.length * 11.5 + 14;
    const dostupne = totalsTop - (ty - heroH);
    if (sirka >= 160 && vyska <= dostupne) {
      const hore = totalsTop + 4;
      cur.drawRectangle({
        x: margin,
        y: hore - vyska,
        width: sirka,
        height: vyska,
        color: rgb(0.98, 0.94, 0.84),
        borderColor: rgb(0.85, 0.7, 0.3),
        borderWidth: 0.7,
      });
      let ry = hore - 13;
      for (const ln of riadky) {
        cur.drawText(ln, { x: margin + 8, y: ry, size: 9, font: bold, color: rgb(0.4, 0.28, 0.05) });
        ry -= 11.5;
      }
      prenesenieHotove = true;
    }
  }

  /*
    Rámik „Faktúra online“ tiež do voľného miesta vedľa súčtov — pod
    platobnými údajmi sám posúval bežnú faktúru s textom nad položkami na
    druhú stranu.
  */
  let onlineHotove = false;
  if (input.verejnyOdkaz && !kresliPeciatku && !prenesenieHotove) {
    const sirka = totalsX - margin - 20;
    const vyska = 92;
    if (sirka >= 200 && vyska <= totalsTop - (ty - heroH) + 4) {
      await kresliOnline(cur, margin, totalsTop + 4, sirka, vyska);
      onlineHotove = true;
    }
  }

  y = ty - heroH - (isPaid ? 38 : 18);

  /*
    Faktúra v cudzej mene musí mať daň vyčíslenú aj v eurách, prepočítanú
    kurzom ECB zo dňa predchádzajúceho dňu dodania (§ 26 ods. 1 zákona o DPH).
    Bez tejto vety je doklad neúplný, hoci sumy v nej sedia. Stojí hneď pod
    súčtami (ku ktorým patrí) — za platobnými údajmi sama odpadávala na
    druhú stranu.
  */
  if (
    trebaPrepocet(invoice.currency) &&
    invoice.exchange_rate &&
    invoice.vat_total_eur != null &&
    Number(invoice.vat_total ?? 0) !== 0
  ) {
    const text = textPrepoctu(
      String(invoice.currency),
      Number(invoice.exchange_rate),
      String(invoice.exchange_rate_date ?? invoice.delivery_date ?? invoice.issue_date),
      Number(invoice.vat_total_eur),
      krajinaDane(company.country) === "CZ" ? "cz" : "sk",
    );
    const lines = wrapLines(text, font, 9, innerW);
    ensureSpace(14 + lines.length * 11 + 8);
    lines.forEach((ln) => {
      cur.drawText(ln, { x: margin, y, size: 9, font, color: sub });
      y -= 11;
    });
    y -= 8;
  }

  // ── Payment card (full width, two columns: data | QR) ──
  if (!input.hidePayment && !isPaid && !lenOprava) {
    /*
      Výška karty je tesne na štyri riadky údajov a QR s popiskom. Pôvodných
      140 bodov s QR v strede nechávalo prázdny pás, pre ktorý sa faktúra s
      textom nad položkami a prenesením nezmestila na jednu stranu.
    */
    const kresliQr = Boolean(company.iban) && naUhradu > 0;
    const payH = kresliQr ? 126 : 116;
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
    cur.drawText(t.platobneUdaje, {
      x: payX + 16,
      y: payY - 20,
      size: 8,
      font: bold,
      color: muted,
    });

    const rows: [string, string][] = [
      [t.iban, company.iban ?? "—"],
      [t.swift, company.swift ?? "—"],
      [t.variabilnySymbol, invoice.variable_symbol ?? "—"],
      [t.datumSplatnosti, invoice.due_date ?? "—"],
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

    /*
      QR na platbu len keď je čo platiť: dobropis vracia peniaze opačným smerom
      a QR na IBAN vystavovateľa by odberateľa naviedol poslať ich ešte raz.
    */
    if (kresliQr) {
      try {
        /*
          Formát podľa krajiny firmy: slovenská banka číta PAY by square,
          česká SPD. Dovtedy sa aj slovenským firmám kreslil český SPD, takže
          QR vyzeral funkčne a banka ho prečítať nemusela.
        */
        const qr = await textQrPlatby(
          {
            iban: company.iban,
            suma: naUhradu,
            mena: invoice.currency,
            vs: invoice.variable_symbol,
            sprava: `Faktura ${invoice.invoice_number}`,
            splatnost: invoice.due_date,
            prijemca: company.name,
          },
          company.country,
        );
        if (!qr) throw new Error("bez QR");
        const dataUrl = await QRCode.toDataURL(qr.text, { margin: 0, width: 240 });
        const png = await doc.embedPng(dataUrl);
        const qrX = payX + payW - qrSize - 16;
        const qrY = payY - payH + 10;
        cur.drawImage(png, { x: qrX, y: qrY, width: qrSize, height: qrSize });
        cur.drawText(t.qrPlatba, {
          x: qrX,
          y: qrY + qrSize + 6,
          size: 7,
          font: bold,
          color: muted,
        });
        /*
          Tlačidlo PAYME — v mobile otvorí bankovú aplikáciu s vyplneným
          príkazom (Tatra banka, Slovenská sporiteľňa). Len slovenské firmy
          a eurá; je to klikateľný odkaz v PDF.
        */
        const payme =
          krajinaDane(company.country) === "SK"
            ? paymeOdkaz({
                iban: company.iban,
                suma: naUhradu,
                mena: invoice.currency,
                vs: invoice.variable_symbol,
                sprava: `Faktura ${invoice.invoice_number}`,
                splatnost: invoice.due_date,
                prijemca: company.name,
              })
            : null;
        if (payme) {
          // V riadku splatnosti, hneď za dátumom — karta sa nezväčší.
          const datum = String(invoice.due_date ?? "—");
          const bx = payX + 16 + 110 + bold.widthOfTextAtSize(datum, 10) + 12;
          const by = payY - 42 - 3 * 20 - 3.5;
          const popis = "PAYME · zaplatiť v mobile";
          const bw = bold.widthOfTextAtSize(popis, 7.5) + 14;
          cur.drawRectangle({ x: bx, y: by, width: bw, height: 13, color: primary });
          cur.drawText(popis, { x: bx + 7, y: by + 3.8, size: 7.5, font: bold, color: white });
          const odkaz = doc.context.register(
            doc.context.obj({
              Type: "Annot",
              Subtype: "Link",
              Rect: [bx, by, bx + bw, by + 13],
              Border: [0, 0, 0],
              A: { Type: "Action", S: "URI", URI: PDFString.of(payme) },
            }),
          );
          cur.node.addAnnot(odkaz);
        }
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

  // ── Reverse charge legal text (keď sa nezmestil vedľa súčtov) ──
  if (textPrenesenia && !prenesenieHotove) {
    const rcText = textPrenesenia;
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

  /*
    Vety osobitných úprav (§ 68d, § 65, § 66). Bez nich je doklad neúplný, aj
    keď sumy na ňom sedia — na rozdiel od prenesenia daňovej povinnosti nemajú
    vlastný rámik, sú to riadky pod súčtami.
  */
  for (const veta of vetyNaDoklad({
    danZPrijatejPlatby: (company as any).dan_z_prijatej_platby,
    osobitnaUprava: invoice.osobitna_uprava,
  })) {
    const lines = wrapLines(veta, bold, 9.5, innerW);
    ensureSpace(14 + lines.length * 12 + 6);
    lines.forEach((ln) => {
      cur.drawText(ln, { x: margin, y, size: 9.5, font: bold, color: sub });
      y -= 12;
    });
    y -= 6;
  }

  /*
    Neplatiteľ musí na doklade povedať, prečo na ňom nie je daň — a osoba
    registrovaná podľa § 7 alebo § 7a aj to, že IČ DPH na doklade z nej
    platiteľa nerobí.

    Doklad, na ktorom daň vyčíslená je, vetu nedostane ani vtedy, keď je firma
    dnes vedená ako neplatiteľ: faktúra má niesť stav spred zmeny, nie dnešný.
  */
  const textDph =
    Number(invoice.vat_total ?? 0) > 0 ? null : rezimFirmy(company as FirmaDph).textNaDoklad;
  if (textDph) {
    const lines = wrapLines(textDph, bold, 9.5, innerW);
    ensureSpace(18 + lines.length * 12 + 8);
    lines.forEach((ln) => {
      cur.drawText(ln, { x: margin, y, size: 9.5, font: bold, color: sub });
      y -= 12;
    });
    y -= 10;
  }

  if (invoice.notes) {
    const noteLines = wrapLines(String(invoice.notes), font, 9.5, innerW);
    const needed = 18 + noteLines.length * 12 + 12;
    ensureSpace(needed);
    cur.drawText(t.poznamky, { x: margin, y, size: 8, font: bold, color: muted });
    y -= 14;
    noteLines.forEach((ln) => {
      cur.drawText(ln, { x: margin, y, size: 9.5, font, color: sub });
      y -= 12;
    });
    y -= 12;
  }

  // ── Footer on every page ──
  /*
    QR na otvorenie faktúry.

    Zámerne **mimo** platobného bloku: ten sa na uhradenej faktúre nekreslí
    vôbec, a otvorenie dokladu s platením nesúvisí — odberateľ si ho chce
    pozrieť aj potom, čo zaplatil. Je to iná vec než platobný QR: ten
    predvyplní platbu v banke, tento otvorí samotný doklad. Preto sú oba
    popísané, nech si ich nikto nepomýli.
  */
  if (input.verejnyOdkaz && !onlineHotove) {
    const vH = 92;
    ensureSpace(vH + 12);
    await kresliOnline(cur, margin, y, innerW, vH);
    y -= vH + 12;
  }

  const footerText = company.invoice_footer ?? t.vystaveneCez;
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
  /* Popisky identifikátorov v jazyku dokladu — „IČO" Nemcovi nič nepovie. */
  popis: { ico: string; dic: string; icDph: string },
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
  if (p.ico) ids.push([popis.ico, String(p.ico)]);
  if (p.dic) ids.push([popis.dic, String(p.dic)]);
  if (p.ic_dph) ids.push([popis.icDph, String(p.ic_dph)]);
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
      /*
        Hodnota začína až za popiskom, nie na pevnej pozícii — nemecké
        „Firmenbuchnummer" je dlhšie než „IČO" a číslo sa naň lepilo bez
        medzery.
      */
      const sirkaPopisku = font.widthOfTextAtSize(san(k), 8.5);
      page.drawText(san(v), {
        x: x + padX + Math.max(48, sirkaPopisku + 8),
        y: cy - 10,
        size: 9.5,
        font: bold,
        color: c.ink,
      });
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
