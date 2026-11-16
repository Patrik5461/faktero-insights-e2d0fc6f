/*
  Prijatý daňový doklad k prijatej platbe (od dodávateľa).

  Dodávateľ ho vystaví, keď dostane od nás zaplatenú zálohu (k prijatej
  zálohovej faktúre). Je to daňový doklad: DPH z neho si odpočítame v období
  dňa prijatia platby (DUZP = deň platby, § 19 ods. 4) — neskôr, ak doklad
  prišiel neskôr (`denOdpoctu`). Nie je to záväzok: záloha je už zaplatená,
  preto sa neplatí, nepáruje s bankou ani nejde do príkazu na úhradu.

  V databáze je to riadok `purchase_invoices` s `type = 'advance_payment'`
  (ten istý kód ako vystavený daňový doklad k platbe v `invoices.type`),
  `status = 'paid'`, `payment_date` = deň platby a voliteľne
  `advance_invoice_id` = prijatá zálohová faktúra, ku ktorej patrí.
  Vlastná agenda: Fakturácia → Prijaté daňové doklady
  (`/prijate-faktury?type=danove`).

  Vyúčtovacia (ostrá) faktúra potom odpočet zdanenej zálohy nesie ako
  záporný riadok rozpisu DPH (`odpocet-zalohy-vytazenie.ts`) — DPH zálohy sa
  tak vo výkaze neráta dvakrát. Keby ostrá faktúra zálohu odpočítala len
  zo sumy na úhradu (`advance_amount`, nezdanená záloha), DPH zálohy by
  bola vo výkaze dvakrát — na to upozorní `dvojitaDphZalohy`.
*/

/** `purchase_invoices.type` prijatého daňového dokladu k platbe. */
export const TYP_PRIJATEHO_DANOVEHO = "advance_payment" as const;

/** Názov dokladu v aplikácii (kľúč prekladu). */
export const NAZOV_PRIJATEHO_DANOVEHO = "Daňový doklad k prijatej platbe";

/** `_typPohody` prijatého daňového dokladu k platbe v exporte do Pohody (interný doklad). */
export const TYP_POHODY_PRIJATY_DANOVY = "prijatyDanovyDokladKPlatbe" as const;

/** Hodnota parametra `type` v adrese zoznamu prijatých faktúr. */
export const FILTER_PRIJATYCH_DANOVYCH = "danove" as const;

/** Je riadok `purchase_invoices` prijatý daňový doklad k platbe? */
export function jePrijatyDanovyDoklad(p: { type?: unknown } | null | undefined): boolean {
  return String(p?.type ?? "") === TYP_PRIJATEHO_DANOVEHO;
}

/**
 * Typ prijatých dokladov pre zoznam podľa parametra adresy: bez parametra
 * bežné prijaté faktúry (`regular`), s `type=danove` daňové doklady k platbe.
 */
export function typZoznamuPrijatych(filter: unknown): "regular" | typeof TYP_PRIJATEHO_DANOVEHO {
  return filter === FILTER_PRIJATYCH_DANOVYCH ? TYP_PRIJATEHO_DANOVEHO : "regular";
}

/** Typy prijatých dokladov, z ktorých sa odpočítava DPH (výkazy, KV, exporty). */
export const TYPY_PRIJATYCH_S_DPH = ["regular", TYP_PRIJATEHO_DANOVEHO] as const;

/**
 * Typy prijatých dokladov, ktoré idú do exportu do účtovníctva (Pohoda):
 * faktúra a dobropis, zálohová (bez DPH, kvôli úhrade) a daňový doklad k platbe.
 */
export const TYPY_PRIJATYCH_DO_EXPORTU = ["regular", "proforma", TYP_PRIJATEHO_DANOVEHO] as const;

/**
 * Prijatá faktúra, ktorá zúčtováva zálohu „vyzaúčtovanú“ daňovým dokladom,
 * ale zálohu odpočítala len zo sumy na úhradu (`advance_amount` — model
 * nezdanenej zálohy). DPH zálohy je potom vo výkaze dvakrát: raz z daňového
 * dokladu, raz v plnej DPH vyúčtovacej faktúry. Vráti zoznam takých faktúr.
 */
export function dvojitaDphZalohy(
  doklady: {
    id: string;
    type?: string | null;
    status?: string | null;
    advance_invoice_id?: string | null;
    advance_amount?: number | string | null;
    invoice_number?: string | null;
    deleted_at?: string | null;
  }[],
): { fakturaId: string; cislo: string; zalohaId: string }[] {
  const zive = doklady.filter((d) => !d.deleted_at && d.status !== "cancelled");
  const zdanene = new Set(
    zive.filter((d) => jePrijatyDanovyDoklad(d) && d.advance_invoice_id).map((d) => String(d.advance_invoice_id)),
  );
  return zive
    .filter(
      (d) =>
        String(d.type ?? "regular") === "regular" &&
        d.advance_invoice_id &&
        zdanene.has(String(d.advance_invoice_id)) &&
        Math.abs(Number(d.advance_amount ?? 0)) > 0.004,
    )
    .map((d) => ({ fakturaId: d.id, cislo: String(d.invoice_number ?? ""), zalohaId: String(d.advance_invoice_id) }));
}

/**
 * Nevyužitá prijatá zálohová faktúra pre výber pri daňovom doklade: ešte
 * k nej nie je iný daňový doklad. Väzba vyúčtovacej faktúry (`regular`) na
 * zálohu daňovému dokladu nevadí — sú to dva rôzne doklady k tej istej zálohe.
 */
export function zalohaVolnaPreDanovy(
  zalohaId: string,
  doklady: { id: string; type?: string | null; advance_invoice_id?: string | null; deleted_at?: string | null }[],
  vlastneId?: string | null,
): boolean {
  return !doklady.some(
    (d) =>
      !d.deleted_at &&
      d.id !== vlastneId &&
      jePrijatyDanovyDoklad(d) &&
      String(d.advance_invoice_id ?? "") === zalohaId,
  );
}

/**
 * Riadky, ktoré „obsadzujú“ zálohovú faktúru pre vyúčtovaciu faktúru —
 * daňový doklad k platbe zálohu nevyúčtováva, preto sa nepočíta.
 */
export function obsadzujeZalohu(d: { type?: string | null } | null | undefined): boolean {
  return !jePrijatyDanovyDoklad(d);
}

/**
 * Parameter `type` zoznamu prijatých z adresy — `"danove"` (aj s medzerami
 * či inou veľkosťou písmen), inak nič. Ručne napísaná adresa môže niesť
 * hodnotu v inom tvare ako odkaz z menu (`search-parametre.ts`).
 */
export function filterTypuPrijatych(v: unknown): typeof FILTER_PRIJATYCH_DANOVYCH | undefined {
  return String(v ?? "").trim().toLowerCase() === FILTER_PRIJATYCH_DANOVYCH ? FILTER_PRIJATYCH_DANOVYCH : undefined;
}

/** Nadpis detailu prijatého dokladu podľa typu (kľúč prekladu). */
export function nazovPrijatehoDokladu(p: { type?: unknown; amount_total?: unknown; opravuje_cislo?: unknown } | null | undefined): string {
  const typ = String(p?.type ?? "regular");
  if (typ === TYP_PRIJATEHO_DANOVEHO) return NAZOV_PRIJATEHO_DANOVEHO;
  if (typ === "proforma") return "Prijatá zálohová faktúra";
  if (Number(p?.amount_total ?? 0) < 0 || String(p?.opravuje_cislo ?? "").trim()) return "Prijatý dobropis";
  return "Prijatá faktúra";
}

/** Výtka výkazu k DPH — aj kľúč prekladu (`dph-vykazy.server.ts`). */
export const VYTKA_DVOJITA_DPH_ZALOHY =
  "Faktúra zúčtováva zálohu, ku ktorej je zaevidovaný daňový doklad k prijatej platbe, ale zálohu odpočítala len zo sumy na úhradu — DPH zálohy je vo výkaze dvakrát (z daňového dokladu aj z tejto faktúry). Odpočet zdanenej zálohy zadajte do rozpisu DPH ako záporný riadok so základom a DPH zálohy.";
