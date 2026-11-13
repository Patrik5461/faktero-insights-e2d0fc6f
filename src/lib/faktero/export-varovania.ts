/*
  Upozornenia pred exportom prijatej faktúry do Pohody — doklad sa nezastaví,
  človek ich vidí a export potvrdí (Patrik 12. 11. 2026: „nech upozorní, ale
  potvrdím export aj tak“).

  Vznikli po troch dokladoch BÝVAJLEPŠIE, ktoré odišli do Pohody zle:
  - Tempus-Car 40260037: základ bez odčítanej zálohy a DPH zo základu so
    zálohou → DPH 14 005,69 € pri základe 45 914,31 € = 30,5 %, sadzba, ktorá
    neexistuje (kontrola rozpisu ju nechytila, lebo rozpis sa rátal z položiek);
  - 2622100045: členenie PDsluz, ale doklad nemá príznak prenesenia → Pohoda
    dostala „bez DPH“ a nesamozdanila;
  - FV52606029: nezaúčtovaná bez predkontácie → Pohoda vezme predkontáciu
    z nastavenia používateľa, pod ktorým beží import.
*/
import { jeZnamaSadzba, krajinaDane } from "./vat-rates";

type Riadok = Record<string, any>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const kod = (v: unknown) => String(v ?? "").trim();
const suma = (n: number) =>
  r2(n).toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** Kód členenia DPH, ktorý znamená prenesenie daňovej povinnosti (samozdanenie). */
export function jeClenenieSPrenesenim(clenenie: unknown, pdpZNastaveni?: unknown): boolean {
  const c = kod(clenenie).toUpperCase();
  if (!c) return false;
  if (kod(pdpZNastaveni) && c === kod(pdpZNastaveni).toUpperCase()) return true;
  // PDsluz, PDtovar, PDpdp, DDpdp (CZ) — prenesenie; PD, PN, PDnadEU nie.
  return /^(PD|DD)(SLUZ|TOVAR|PDP)/.test(c);
}

/** Uložený rozpis DPH sedí so základom aj daňou hlavičky (na 2 centy). */
function rozpisSediSHlavickou(p: Riadok): boolean {
  const r = Array.isArray(p?.vat_breakdown) ? p.vat_breakdown : null;
  if (!r?.length) return false;
  const z = r.reduce((a: number, x: Riadok) => a + Number(x?.zaklad ?? 0), 0);
  const d = r.reduce((a: number, x: Riadok) => a + Number(x?.dph ?? 0), 0);
  return (
    Math.abs(z - Number(p?.amount_without_vat ?? 0)) <= 0.02 &&
    Math.abs(d - Number(p?.vat_amount ?? 0)) <= 0.02 &&
    r.every((x: Riadok) => x?.pdp || jeZnamaSadzba(Number(x?.sadzba ?? 0)))
  );
}

/**
 * Upozornenia k jednej prijatej faktúre (riadok `purchase_invoices`).
 * Zálohová a koncept sa neposudzujú.
 */
export function varovaniaPrijatejPredExportom(
  p: Riadok,
  company: Riadok | null | undefined,
  nastavenia?: Riadok | null,
): string[] {
  if (!p || p.type === "proforma") return [];
  const cislo = kod(p.invoice_number) || "?";
  const out: string[] = [];
  const krajina = krajinaDane(company?.country);
  const zaklad = Number(p.amount_without_vat ?? 0);
  const dph = Number(p.vat_amount ?? 0);

  // 1) DPH, ktorá nezodpovedá žiadnej sadzbe.
  if (Math.abs(zaklad) > 0.009 && Math.abs(dph) > 0.009 && !rozpisSediSHlavickou(p)) {
    const sadzba = (dph / zaklad) * 100;
    const znama = [0, 5, 10, 12, 15, 19, 20, 21, 23].some(
      (s) => jeZnamaSadzba(s, krajina) && Math.abs(Math.abs(sadzba) - s) <= 0.3,
    );
    if (!znama)
      out.push(
        `${cislo} — DPH ${suma(dph)} pri základe ${suma(zaklad)} vychádza ${r2(sadzba).toLocaleString("sk-SK")} % — taká sadzba DPH neexistuje. Skontrolujte základ a DPH (napr. odpočet zálohy) alebo rozpíšte DPH podľa sadzieb`,
      );
  }

  /*
    2) Členenie s prenesením, ale doklad prenesenie nemá. Doklad bez režimu
    DPH a bez dane s takým členením export berie ako prenesenie
    (`jePrenesenieCele` v prijate-do-pohody.ts) — varuje sa len pri režime
    zvolenom inak (tuzemsko, bez dane…) alebo pri faktúre s daňou.
  */
  const rezim = kod(p.dph_rezim);
  if (
    jeClenenieSPrenesenim(p.pohoda_clenenie_dph, nastavenia?.clenenieDphPdpPrijata) &&
    !p.reverse_charge &&
    rezim !== "samozdanenie" &&
    rezim !== "nadobudnutie" &&
    (rezim || Number(p.vat_amount ?? 0) || !jeClenenieSPrenesenim(p.pohoda_clenenie_dph))
  )
    out.push(
      `${cislo} — členenie DPH ${kod(p.pohoda_clenenie_dph)} je pre prenesenie daňovej povinnosti, ale doklad nemá zaškrtnuté prenesenie — Pohoda daň nesamozdaní`,
    );

  // 3) Bez predkontácie — Pohoda vezme predkontáciu z nastavenia používateľa.
  const rozuct = Array.isArray(p.rozuctovanie) ? p.rozuctovanie : [];
  const maPredkontaciu =
    kod(p.pohoda_predkontacia) ||
    kod(nastavenia?.predkontaciaPrijata) ||
    (rozuct.length > 0 && rozuct.every((r: Riadok) => kod(r?.predkontacia)));
  if (!maPredkontaciu)
    out.push(
      `${cislo} — bez predkontácie${p.zauctovane_at ? "" : " (nie je zaúčtovaná)"} — Pohoda použije predkontáciu z nastavenia používateľa, pod ktorým import spustíte`,
    );
  else if (!p.zauctovane_at && kod(p.pohoda_predkontacia) === "")
    out.push(`${cislo} — nie je zaúčtovaná — ide s predvolenou predkontáciou firmy`);

  return out;
}
