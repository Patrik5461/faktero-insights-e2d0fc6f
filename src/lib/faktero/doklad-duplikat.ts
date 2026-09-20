/**
 * Kedy je doklad ten istý.
 *
 * Bloček sa dá naskenovať dvakrát ľahko: raz v obchode a raz doma z tej istej
 * fotky, alebo keď sa skener po uložení vráti späť a človek si nie je istý, či
 * to prešlo. Bez tohto pravidla z toho vznikli dva výdavky a účtovníctvo
 * sedelo o jeden nákup viac.
 *
 * Pravidlá sú dve a schválne v tomto poradí:
 *
 * 1. **QR kód.** Doklad z eKasy v ňom nesie svoj jednoznačný identifikátor, tak
 *    sa dva rovnaké kódy nedajú vysvetliť inak než dvojitým naskenovaním.
 * 2. **Hlavička.** Keď QR nie je (fotka faktúry, PDF), musí sedieť dodávateľ,
 *    číslo dokladu, dátum aj suma naraz. Ktorýkoľvek z tých údajov sám o sebe
 *    nestačí — dve tankovania v ten istý deň za rovnakú sumu sú bežné.
 */

export type OdtlacokDokladu = {
  qr_raw?: string | null;
  supplier_ico?: string | null;
  supplier_name?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  total_amount?: number | null;
};

function text(h?: string | null): string {
  return (h ?? "").trim().toLowerCase();
}

/**
 * Dá sa doklad vôbec porovnávať?
 *
 * Doklad bez QR aj bez čísla je len fotka so sumou. Hlásiť pri ňom duplicitu
 * by znamenalo blokovať druhý nákup v tom istom obchode v ten istý deň.
 */
export function daSaPorovnat(d: OdtlacokDokladu): boolean {
  if (text(d.qr_raw)) return true;
  return Boolean(
    text(d.document_number) &&
      d.total_amount != null &&
      text(d.issue_date) &&
      (text(d.supplier_ico) || text(d.supplier_name)),
  );
}

/** Ide o ten istý doklad? */
export function jeTenIstyDoklad(a: OdtlacokDokladu, b: OdtlacokDokladu): boolean {
  const qrA = text(a.qr_raw);
  const qrB = text(b.qr_raw);
  if (qrA && qrB) return qrA === qrB;

  if (!daSaPorovnat(a) || !daSaPorovnat(b)) return false;
  if (text(a.document_number) !== text(b.document_number)) return false;
  if (text(a.issue_date) !== text(b.issue_date)) return false;
  if (a.total_amount == null || b.total_amount == null) return false;
  // Na cent. Rovnaká suma zapísaná raz ako 12.3 a raz ako 12.30 je tá istá.
  if (Math.round(a.total_amount * 100) !== Math.round(b.total_amount * 100)) return false;

  const icoA = text(a.supplier_ico);
  const icoB = text(b.supplier_ico);
  if (icoA && icoB) return icoA === icoB;
  return text(a.supplier_name) === text(b.supplier_name);
}
