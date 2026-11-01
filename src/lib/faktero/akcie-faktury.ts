/**
 * Čo sa s vystavenou faktúrou dá robiť v jej stave.
 *
 * Detail kedysi rozhodoval podmienkami „nie je X“ (`status !== "paid"`), takže
 * koncept sa dal rovno označiť ako uhradený bez vystavenia a storno ako
 * „odoslané iným spôsobom“. Tu je zoznam povolených prechodov raz — pre
 * klasický aj kompaktný detail.
 */

export type FakturaPreAkcie = {
  status?: string | null;
  type?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  deleted_at?: string | null;
};

/**
 * Po splatnosti — rovnaká definícia ako zoznam, súčet za filter
 * (`suhrn_vystavenych_faktur`) aj Prehľad: vystavená alebo odoslaná,
 * neuhradená a splatnosť skôr než dnes (v Bratislave).
 */
export function jeFakturaPoSplatnosti(f: FakturaPreAkcie, dnes: string): boolean {
  return (
    (f.status === "issued" || f.status === "sent") &&
    !!f.due_date &&
    f.due_date < dnes &&
    !f.paid_at
  );
}

export type PovoleneAkcie = {
  /** Stav do `StatusBadge` — „po splatnosti“ nie je stav v databáze, počíta sa. */
  odznak: string;
  poSplatnosti: boolean;
  vymazana: boolean;
  upravit: boolean;
  zauctovat: boolean;
  /** „Odoslané iným spôsobom“ — len vystavená, ešte neodoslaná. */
  odoslaneInak: boolean;
  /** „Označiť ako uhradenú“ — koncept treba najprv vystaviť, storno sa neuhrádza. */
  uhradena: boolean;
  neuhradena: boolean;
  /** Odoslanie eFaktúrou; `dovodBezEfaktury` povie prečo nie. */
  efaktura: boolean;
  dovodBezEfaktury: string | null;
  email: boolean;
  upomienka: boolean;
  dobropis: boolean;
  storno: boolean;
  vymazat: boolean;
  obnovit: boolean;
  /** Daňový doklad k prijatej platbe — len uhradená záloha platiteľa DPH. */
  dokladKPlatbe: boolean;
  exportPohoda: boolean;
};

export function povoleneAkcie(
  f: FakturaPreAkcie,
  o: { dnes: string; platitelDph?: boolean | null; krajina?: string | null },
): PovoleneAkcie {
  const s = f.status ?? "";
  const vymazana = !!f.deleted_at;
  const zivy = !vymazana;
  const poSplatnosti = zivy && jeFakturaPoSplatnosti(f, o.dnes);
  const zalohova = f.type === "proforma";
  const otvorena = s === "issued" || s === "sent";
  let dovodBezEfaktury: string | null = null;
  if (zalohova) dovodBezEfaktury = "Zálohová faktúra nie je daňový doklad — pošlite ju e-mailom.";
  else if (s === "draft") dovodBezEfaktury = "Koncept treba najprv vystaviť.";
  else if (s === "cancelled") dovodBezEfaktury = "Stornovaná faktúra sa neodosiela.";
  return {
    odznak: poSplatnosti ? "overdue" : s,
    poSplatnosti,
    vymazana,
    upravit: zivy && s !== "cancelled",
    zauctovat: zivy && s !== "cancelled",
    odoslaneInak: zivy && s === "issued",
    uhradena: zivy && otvorena,
    neuhradena: zivy && s === "paid",
    efaktura: zivy && !dovodBezEfaktury,
    dovodBezEfaktury,
    email: zivy && s !== "cancelled",
    upomienka: poSplatnosti,
    dobropis: zivy && f.type === "regular" && s !== "draft" && s !== "cancelled",
    storno: zivy && s !== "cancelled",
    vymazat: zivy,
    obnovit: vymazana,
    dokladKPlatbe: zivy && zalohova && s === "paid" && o.platitelDph !== false,
    exportPohoda: zivy && o.krajina !== "DE",
  };
}

/** Prechody stavu, ktoré detail smie zapísať cez `setStatus`. */
export function smieZmenitStav(z: string | null | undefined, na: string): boolean {
  const s = z ?? "";
  if (na === "sent") return s === "issued";
  if (na === "paid") return s === "issued" || s === "sent";
  if (na === "cancelled") return s !== "cancelled";
  if (na === "issued") return s === "draft";
  return true;
}

/**
 * Číslo ďalšej upomienky. Po tretej už ďalšia nie je — `null`, a okno to
 * musí povedať, inak by sa potichu poslala znova tretia.
 */
export function dalsiaUpomienka(odoslane: Iterable<number>): 1 | 2 | 3 | null {
  const m = new Set(odoslane);
  if (m.has(3)) return null;
  if (m.has(2)) return 3;
  if (m.has(1)) return 2;
  return 1;
}

/**
 * Filtre zoznamu vystavených faktúr, ktoré nie sú stĺpcom v databáze
 * (neuhradené, po splatnosti, bez upomienky). Patria do dotazu, nie na
 * načítanú stránku — inak stránkovanie, počet a súčet za filter ukazujú
 * niečo iné než zoznam. Podmienky sú tie isté ako v `suhrn_vystavenych_faktur`.
 *
 * „Bez upomienky“ je anti-join cez vložený zdroj: dotaz musí mať v `select`
 * aj `invoice_reminders(id)` (`STLPEC_UPOMIENOK`).
 */
export const STLPEC_UPOMIENOK = "invoice_reminders(id)";

export function filtrujNeuhradenePoSplatnosti(
  dotaz: any,
  f: { neuhradene?: boolean; poSplatnosti?: boolean; bezUpomienky?: boolean; dnes: string },
): any {
  let d = dotaz;
  if (f.neuhradene) {
    d = d
      .not("status", "in", "(draft,cancelled,paid)")
      .not("type", "in", "(proforma,advance_payment,credit_note)")
      .is("paid_at", null);
  }
  if (f.poSplatnosti || f.bezUpomienky) {
    d = d.in("status", ["issued", "sent"]).lt("due_date", f.dnes).is("paid_at", null);
  }
  if (f.bezUpomienky) {
    d = d.eq("invoice_reminders.status", "sent").is("invoice_reminders", null);
  }
  return d;
}

/**
 * Súčet odpočítaných záloh — len keď sú všetky v mene faktúry. Inak `null`
 * a každá záloha ostane so svojou sumou v riadku (meny sa nesčítavajú).
 */
export function sucetOdpocitanychZaloh(
  odpocty: { amount: unknown; zaloha?: { currency?: string | null } | null }[],
  menaFaktury: string | null | undefined,
): number | null {
  const mena = (menaFaktury || "EUR").toUpperCase();
  if (odpocty.some((o) => (o.zaloha?.currency || mena).toUpperCase() !== mena)) return null;
  const s = odpocty.reduce((a, o) => a + (Number(o.amount) || 0), 0);
  return Math.round(s * 100) / 100;
}

/**
 * Párovanie platieb: koľko z vybraných párov je len návrh („na rozhodnutie“),
 * nie istá zhoda. Pri aspoň jednom sa zápis najprv potvrdzuje.
 */
export function navrhyVoVybere(
  vybrane: Iterable<string>,
  navrhy: { transactionId: string }[],
): number {
  const n = new Set(navrhy.map((z) => z.transactionId));
  let m = 0;
  for (const id of vybrane) if (n.has(id)) m++;
  return m;
}
