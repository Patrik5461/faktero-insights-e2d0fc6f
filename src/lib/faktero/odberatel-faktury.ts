/*
  Odberateľ na faktúre.

  Faktúra si údaje odberateľa pamätá ako kópiu (`customer_*`) — zmena v adresári
  nesmie prepísať doklad, ktorý už odišiel. Pri oprave faktúry sa preto dá
  vybrať iný odberateľ z adresára (kópia sa prevezme celá) alebo opraviť
  údaje len na tejto faktúre (preklep v adrese), bez zásahu do adresára.
*/

export type OdberatelFaktury = {
  customer_id: string | null;
  customer_name: string;
  customer_ico: string;
  customer_dic: string;
  customer_ic_dph: string;
  customer_street: string;
  customer_city: string;
  customer_zip: string;
  customer_country: string;
  customer_email: string;
};

const t = (v: unknown) => String(v ?? "");

/** Kópia odberateľa z faktúry — do formulára. */
export function odberatelZFaktury(f: Record<string, any>): OdberatelFaktury {
  return {
    customer_id: f.customer_id ?? null,
    customer_name: t(f.customer_name),
    customer_ico: t(f.customer_ico),
    customer_dic: t(f.customer_dic),
    customer_ic_dph: t(f.customer_ic_dph),
    customer_street: t(f.customer_street),
    customer_city: t(f.customer_city),
    customer_zip: t(f.customer_zip),
    customer_country: t(f.customer_country) || "SK",
    customer_email: t(f.customer_email),
  };
}

/** Kópia odberateľa z adresára — tak, ako ju robí vystavenie faktúry. */
export function odberatelZAdresara(c: Record<string, any>): OdberatelFaktury {
  return {
    customer_id: c.id ?? null,
    customer_name: t(c.name),
    customer_ico: t(c.ico),
    customer_dic: t(c.dic),
    customer_ic_dph: t(c.ic_dph),
    customer_street: t(c.street),
    customer_city: t(c.city),
    customer_zip: t(c.zip),
    customer_country: t(c.country) || "SK",
    customer_email: t(c.email),
  };
}

/** Na zápis: prázdne políčka ako `null`, nie `""`. */
export function odberatelNaZapis(o: OdberatelFaktury): Record<string, string | null> {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  return {
    customer_id: o.customer_id,
    customer_name: o.customer_name.trim(),
    customer_ico: n(o.customer_ico),
    customer_dic: n(o.customer_dic),
    customer_ic_dph: n(o.customer_ic_dph),
    customer_street: n(o.customer_street),
    customer_city: n(o.customer_city),
    customer_zip: n(o.customer_zip),
    customer_country: n(o.customer_country.toUpperCase()) ?? "SK",
    customer_email: n(o.customer_email),
  };
}

export function zmenilSaOdberatel(a: OdberatelFaktury, b: OdberatelFaktury): boolean {
  const z1 = odberatelNaZapis(a);
  const z2 = odberatelNaZapis(b);
  return (Object.keys(z1) as (keyof typeof z1)[]).some((k) => (z1[k] ?? "") !== (z2[k] ?? ""));
}

/**
 * Čo treba človeku povedať, keď mení odberateľa na už vystavenej faktúre.
 * Zmena sama nič z toho neopraví — DPH režim ani poslaný doklad.
 */
export function upozorneniaZmeny(args: {
  povodny: OdberatelFaktury;
  novy: OdberatelFaktury;
  stav: string;
  reverseCharge: boolean;
  efakturaOdoslana: boolean;
}): string[] {
  const { povodny: p, novy: n } = args;
  const out: string[] = [];
  const iny = p.customer_id !== n.customer_id || p.customer_ico.trim() !== n.customer_ico.trim();
  if (!iny) return out;
  if (args.efakturaOdoslana) {
    out.push(
      "Faktúra už odišla cez eFaktúru pôvodnému odberateľovi — v jeho systéme ostane. Správne je vystaviť dobropis a novú faktúru.",
    );
  } else if (args.stav !== "draft") {
    out.push("Pôvodný odberateľ mohol faktúru dostať — novému pošlite nové PDF.");
  }
  const krajina = (v: string) => v.trim().toUpperCase() || "SK";
  if (krajina(p.customer_country) !== krajina(n.customer_country)) {
    out.push(
      `Mení sa krajina odberateľa (${krajina(p.customer_country)} → ${krajina(n.customer_country)}) — skontrolujte sadzby DPH a prenesenie daňovej povinnosti.`,
    );
  } else if (!!p.customer_ic_dph.trim() !== !!n.customer_ic_dph.trim() && args.reverseCharge) {
    out.push("Faktúra je v režime prenesenia daňovej povinnosti — nový odberateľ musí mať IČ DPH.");
  }
  return out;
}
