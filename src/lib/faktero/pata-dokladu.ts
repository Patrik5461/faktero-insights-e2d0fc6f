/*
  Pätička vystavených dokladov (faktúra, zálohová, doklad k platbe, dobropis,
  ťarchopis, cenová ponuka): štyri stĺpce vedľa seba — Vystavil, Telefón,
  E-mail, Web. Prázdne sa vynechajú, zvyšné sa rozdelia rovnomerne.

  Čisté funkcie, aby ich mohol použiť PDF generátor aj HTML stránky
  (verejný odkaz, náhľad vo Vzhľade faktúry).
*/

export type PolozkaPaty = {
  /** Malý sivý popis nad hodnotou. */
  popis: string;
  hodnota: string;
  /** Klikateľný cieľ (mailto:, https://). */
  odkaz?: string;
};

const POPISY: Record<string, { vystavil: string; telefon: string; email: string; web: string }> = {
  sk: { vystavil: "Vystavil", telefon: "Telefón", email: "E-mail", web: "Web" },
  cs: { vystavil: "Vystavil", telefon: "Telefon", email: "E-mail", web: "Web" },
  en: { vystavil: "Issued by", telefon: "Phone", email: "E-mail", web: "Web" },
  de: { vystavil: "Ausgestellt von", telefon: "Telefon", email: "E-Mail", web: "Web" },
  hu: { vystavil: "Kiállította", telefon: "Telefon", email: "E-mail", web: "Web" },
};

export function popisyPaty(jazyk?: string | null) {
  return POPISY[String(jazyk ?? "sk")] ?? POPISY.sk;
}

const cisty = (s: unknown) => String(s ?? "").trim();

/** „https://www.firma.sk/“ → „www.firma.sk“ (na doklade bez protokolu a koncovej lomky). */
export function webBezProtokolu(web: unknown): string {
  return cisty(web)
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/\/+$/, "");
}

/** Cieľ odkazu na web — bez protokolu by ho prehliadač bral ako relatívnu cestu. */
export function odkazNaWeb(web: unknown): string | undefined {
  const s = cisty(web);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${webBezProtokolu(s)}`;
}

/**
 * Kto doklad vystavil: meno z profilu autora; bez autora (API, opakovaná
 * faktúra bez šablóny s autorom, import) alebo bez mena v profile meno firmy.
 */
export function menoVystavitela(
  profil: { full_name?: string | null } | null | undefined,
  firma: { name?: string | null } | null | undefined,
): string {
  return cisty(profil?.full_name) || cisty(firma?.name);
}

export function polozkyPaty(
  udaje: {
    vystavil?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  },
  jazyk?: string | null,
): PolozkaPaty[] {
  const p = popisyPaty(jazyk);
  const out: PolozkaPaty[] = [];
  const vystavil = cisty(udaje.vystavil);
  if (vystavil) out.push({ popis: p.vystavil, hodnota: vystavil });
  const telefon = cisty(udaje.phone);
  if (telefon) out.push({ popis: p.telefon, hodnota: telefon });
  const email = cisty(udaje.email);
  if (email) out.push({ popis: p.email, hodnota: email, odkaz: `mailto:${email}` });
  const web = webBezProtokolu(udaje.website);
  if (web) out.push({ popis: p.web, hodnota: web, odkaz: odkazNaWeb(udaje.website) });
  return out;
}

const normal = (s: string) => s.toLowerCase().replace(/[\s.,:;–—-]+/g, "");

/**
 * Text pätičky z nastavení (Vzhľad faktúry), ak nie je len zopakovaným
 * zápisom v registri — ten je od 2026-11 v rámiku dodávateľa a dvakrát na
 * doklade byť nemusí.
 */
export function vlastnyTextPaty(
  pataZNastaveni: string | null | undefined,
  zapisVRegistri: string | null | undefined,
): string | null {
  const text = cisty(pataZNastaveni);
  if (!text) return null;
  const zapis = cisty(zapisVRegistri);
  if (!zapis) return text;
  if (normal(text) === normal(zapis)) return null;
  if (text.includes(zapis)) {
    const zvysok = text
      .replace(zapis, "")
      .trim()
      .replace(/^[·,;–-]\s*|\s*[·,;–-]$/g, "")
      .trim();
    return zvysok || null;
  }
  return text;
}
