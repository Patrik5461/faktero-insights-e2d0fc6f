/*
  Trans.eu pre dopravcov — čistá logika bez siete a databázy.

  Dokumentácia: https://www.trans.eu/api/ (stav k 2026-10). Dôležité veci z nej:
  - Prihlásenie je OAuth 2.0 authorization code: GET auth.platform.trans.eu/oauth2/auth,
    token cez POST api.platform.trans.eu/ext/auth-api/accounts/token (form, hlavička
    Api-key). Access token platí ~6 h, refresh token sa pri každej obnove mení —
    vždy treba uložiť ten najnovší.
  - Každé volanie API nesie `Authorization: Bearer …` aj `Api-key: …` aplikácie.
  - Prijaté objednávky: GET /ext/orders-api/v1/orders-received (najviac 30 na
    stranu, `page`, filter ako JSON v `filter`), detail …/orders-received/{id}.
  - Zákazník dopravcu je `freight.shipper` (zadávateľ prepravy). API o ňom dá len
    názov a `vat_id`; adresu vie zoznam partnerov (/ext/partners-api/v1/partners).
  - Cena: `payment.price` s typom `route` (za trasu) alebo `km` (za kilometer);
    `distance` v detaile je v metroch, `total_estimated_price` je odhad celku.
  - Faktúra späť: najprv súbor PUT /ext/media-storage-api/v1/assets (form-data),
    potom POST /ext/orders-api/v1/orders/{id}/invoice s `invoice_data` a `media_id`.
    `tax_value` pozná len 0, 5, 8, 23 (poľské sadzby) a je nepovinné.
  - Stav úhrady API neprijíma — nie je naň endpoint ani pole.
*/

export const TRANSEU_API = "https://api.platform.trans.eu";
export const TRANSEU_AUTH = "https://auth.platform.trans.eu";

export type TranseuAdresa = {
  country?: string | null;
  locality?: string | null;
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
};

export type TranseuSpot = {
  name?: string | null;
  spot_order?: number;
  operations?: {
    type?: "loading" | "unloading" | string;
    timespans?: { begin?: string | null; end?: string | null } | null;
  }[];
  place?: { address?: TranseuAdresa | null } | null;
};

export type TranseuCena = {
  currency?: string | null;
  type?: string | null;
  value?: number | null;
};

export type TranseuObjednavka = {
  id: string;
  number?: string | null;
  created_at?: string | null;
  status?: { value?: string | null; comment?: string | null } | null;
  invoice?: unknown;
  freight?: {
    reference_number?: string | null;
    shipment_external_id?: string | null;
    distance?: number | null;
    shipper?: { legal_name?: string | null; vat_id?: string | null } | null;
    carrier?: { legal_name?: string | null; vat_id?: string | null } | null;
    spots?: TranseuSpot[] | null;
  } | null;
  payment?: {
    days?: number | null;
    price?: TranseuCena | null;
    total_estimated_price?: TranseuCena | null;
  } | null;
};

/**
 * Stavy, v ktorých dopravca objednávku prijal a dá sa fakturovať. Návrh
 * (`proposal-waiting`), odmietnutá, zrušená ani rozpracovaná zadávateľom sa
 * nefakturujú — záväzok ešte (alebo už) neexistuje.
 */
const PRIJATE = new Set([
  "waiting-for-vehicle-and-driver",
  "ready",
  "in-progress",
  "waiting-for-arrival-confirmation",
  "waiting-for-unloading-confirmation",
  "waiting-for-proof-of-delivery",
  "waiting-for-confirmation",
  "delivery-confirmed",
  "completed",
  "archived",
]);

export function daSaFakturovat(stav: string | null | undefined): boolean {
  return PRIJATE.has(String(stav ?? ""));
}

/** Slovenský popis stavu objednávky v Trans.eu (prekladá sa až v UI cez t()). */
export const STAV_TRANSEU: Record<string, string> = {
  "in-preparation": "V príprave",
  "proposal-waiting": "Návrh čaká na prijatie",
  "proposal-rejected": "Návrh odmietnutý",
  "waiting-for-vehicle-and-driver": "Čaká na vozidlo a vodiča",
  ready: "Pripravená",
  "in-progress": "Prebieha",
  "waiting-for-arrival-confirmation": "Čaká na potvrdenie príchodu",
  "waiting-for-unloading-confirmation": "Čaká na potvrdenie vykládky",
  "waiting-for-proof-of-delivery": "Čaká na doklad o doručení",
  "waiting-for-confirmation": "Čaká na potvrdenie",
  "delivery-confirmed": "Doručenie potvrdené",
  completed: "Dokončená",
  archived: "Archivovaná",
  cancelled: "Zrušená",
};

function cislo(x: unknown): number | null {
  const n = Number(x);
  return x === null || x === undefined || x === "" || !Number.isFinite(n) ? null : n;
}

function centy(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** „PL 31-001 Kraków“ — krátky zápis miesta pre zoznam a názov položky. */
export function miesto(a: TranseuAdresa | null | undefined): string {
  if (!a) return "";
  const krajina = String(a.country ?? "")
    .trim()
    .toUpperCase();
  return [krajina, a.postal_code, a.locality]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Spoty zoradené podľa poradia na trase. */
function spoty(o: TranseuObjednavka): TranseuSpot[] {
  return [...(o.freight?.spots ?? [])].sort((a, b) => (a.spot_order ?? 0) - (b.spot_order ?? 0));
}

function maOperaciu(s: TranseuSpot, typ: "loading" | "unloading"): boolean {
  return (s.operations ?? []).some((op) => op.type === typ);
}

function cas(s: TranseuSpot | undefined, typ: "loading" | "unloading", kraj: "begin" | "end") {
  const op = (s?.operations ?? []).find((x) => x.type === typ);
  return op?.timespans?.[kraj] ?? op?.timespans?.begin ?? null;
}

/**
 * Cena prepravy. Pri cene za trasu je to priamo `value`. Pri cene za kilometer
 * berieme odhad celku z Trans.eu, inak sadzbu × vzdialenosť (metre → km); bez
 * vzdialenosti sumu nepoznáme a vrátime sadzbu s príznakom `iste: false`.
 */
export function cenaObjednavky(o: TranseuObjednavka): {
  suma: number;
  mena: string;
  typ: string;
  iste: boolean;
} {
  const p = o.payment?.price ?? {};
  const typ = String(p.type ?? "route");
  const mena = String(p.currency ?? "eur").toUpperCase();
  const hodnota = cislo(p.value) ?? 0;
  if (typ !== "km") return { suma: centy(hodnota), mena, typ, iste: true };
  const odhad = o.payment?.total_estimated_price;
  if (odhad && cislo(odhad.value) !== null && String(odhad.currency ?? "").toUpperCase() === mena)
    return { suma: centy(cislo(odhad.value)!), mena, typ, iste: true };
  const m = cislo(o.freight?.distance);
  if (m && m > 0) return { suma: centy(hodnota * (m / 1000)), mena, typ, iste: true };
  return { suma: centy(hodnota), mena, typ, iste: false };
}

/** Riadok do `transeu_objednavky` z objednávky Trans.eu. */
export function riadokObjednavky(o: TranseuObjednavka) {
  const s = spoty(o);
  const prva = s.find((x) => maOperaciu(x, "loading")) ?? s[0];
  const posledna = [...s].reverse().find((x) => maOperaciu(x, "unloading")) ?? s[s.length - 1];
  const cena = cenaObjednavky(o);
  const m = cislo(o.freight?.distance);
  const dni = cislo(o.payment?.days);
  return {
    transeu_id: String(o.id),
    cislo: o.number ?? null,
    referencia: o.freight?.reference_number ?? o.freight?.shipment_external_id ?? null,
    stav: o.status?.value ?? null,
    zakaznik_nazov: o.freight?.shipper?.legal_name ?? null,
    zakaznik_vat_id: o.freight?.shipper?.vat_id ?? null,
    nakladka: miesto(prva?.place?.address) || null,
    nakladka_krajina: String(prva?.place?.address?.country ?? "").toUpperCase() || null,
    nakladka_od: cas(prva, "loading", "begin"),
    vykladka: miesto(posledna?.place?.address) || null,
    vykladka_krajina: String(posledna?.place?.address?.country ?? "").toUpperCase() || null,
    vykladka_do: cas(posledna, "unloading", "end"),
    vzdialenost_km: m && m > 0 ? Math.round(m / 1000) : null,
    cena: cena.suma,
    mena: cena.mena,
    typ_ceny: cena.typ,
    splatnost_dni: dni === null ? null : Math.max(0, Math.min(365, Math.round(dni))),
    ma_fakturu_v_transeu: Boolean(o.invoice),
  };
}

export type RiadokTranseu = ReturnType<typeof riadokObjednavky>;

/**
 * IČ DPH zákazníka. Trans.eu posiela `vat_id` raz s predponou štátu (PL…),
 * raz bez nej. Bez predpony ju doplní krajina z adresy partnera — inak by
 * návrh režimu DPH nevedel, že ide o firmu z iného štátu.
 */
export function icDphZakaznika(
  vatId: string | null | undefined,
  krajina?: string | null,
): { ic_dph: string | null; krajina: string | null } {
  const s = String(vatId ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const k = String(krajina ?? "")
    .trim()
    .toUpperCase();
  if (!s) return { ic_dph: null, krajina: /^[A-Z]{2}$/.test(k) ? k : null };
  const m = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(s);
  if (m) {
    const kod = m[1] === "EL" ? "GR" : m[1];
    return { ic_dph: s, krajina: /^[A-Z]{2}$/.test(k) ? k : kod };
  }
  if (/^[A-Z]{2}$/.test(k)) return { ic_dph: `${k === "GR" ? "EL" : k}${s}`, krajina: k };
  return { ic_dph: null, krajina: null };
}

/** Text položky prijatej objednávky / faktúry. */
export function nazovPolozky(r: Pick<RiadokTranseu, "nakladka" | "vykladka">): string {
  const trasa = [r.nakladka, r.vykladka].filter(Boolean).join(" → ");
  return trasa ? `Preprava ${trasa}` : "Preprava";
}

export function popisPolozky(
  r: Pick<RiadokTranseu, "cislo" | "referencia" | "nakladka_od" | "vykladka_do" | "vzdialenost_km">,
): string {
  const casti: string[] = [];
  if (r.cislo) casti.push(`Trans.eu ${r.cislo}`);
  if (r.referencia) casti.push(`ref. ${r.referencia}`);
  const od = r.nakladka_od?.slice(0, 10);
  const do_ = r.vykladka_do?.slice(0, 10);
  if (od || do_) casti.push([od, do_].filter(Boolean).join(" – "));
  if (r.vzdialenost_km) casti.push(`${r.vzdialenost_km} km`);
  return casti.join(", ");
}

/** Dátum v tvare RRRR-MM-DD z ISO času (alebo null). */
export function den(iso: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso ?? ""));
  return m ? m[1] : null;
}

/** Adresa autorizácie OAuth (authorization code). */
export function autorizacnaUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    state,
    redirect_uri: redirectUri,
  });
  return `${TRANSEU_AUTH}/oauth2/auth?${q.toString()}`;
}

/** Telo požiadavky na token — výmena kódu alebo obnova. */
export function teloTokenu(
  v: { druh: "kod"; code: string; redirectUri: string } | { druh: "obnova"; refreshToken: string },
  clientId: string,
  clientSecret: string,
): string {
  const q = new URLSearchParams(
    v.druh === "kod"
      ? { grant_type: "authorization_code", code: v.code, redirect_uri: v.redirectUri }
      : { grant_type: "refresh_token", refresh_token: v.refreshToken },
  );
  q.set("client_id", clientId);
  q.set("client_secret", clientSecret);
  return q.toString();
}

/** Cesta zoznamu prijatých objednávok s filtrom dátumu vytvorenia. */
export function cestaZoznamu(od: string | null, strana: number): string {
  const q = new URLSearchParams();
  if (od) q.set("filter", JSON.stringify({ created_at: { $gt: od } }));
  q.set("sortBy", "created_at");
  q.set("order", "desc");
  q.set("page", String(strana));
  return `/ext/orders-api/v1/orders-received?${q.toString()}`;
}

/** Sadzby DPH, ktoré Trans.eu pri faktúre prijme (pole `tax_value`). */
const SADZBY_TRANSEU = new Set([0, 5, 8, 23]);

/**
 * Telo `POST /orders/{id}/invoice`. Sadzbu pošleme len keď je na celej
 * faktúre jedna a Trans.eu ju pozná — inak ju vynecháme (pole je nepovinné)
 * a sumy hovoria samy za seba.
 */
export function teloFaktury(
  f: {
    invoice_number: string;
    issue_date: string;
    delivery_date?: string | null;
    due_date: string;
    currency?: string | null;
    subtotal: number | string;
    total: number | string;
    reverse_charge?: boolean | null;
  },
  sadzby: (number | string)[],
  mediaId: string,
  nazovSuboru: string,
) {
  const rozne = [...new Set(sadzby.map((s) => Number(s)).filter((s) => Number.isFinite(s)))];
  const sadzba = f.reverse_charge ? 0 : rozne.length === 1 ? rozne[0] : null;
  const splatnost = Math.max(
    0,
    Math.round((Date.parse(f.due_date) - Date.parse(f.issue_date)) / 86_400_000) || 0,
  );
  const invoice_data: Record<string, unknown> = {
    invoice_number: f.invoice_number,
    invoice_issuance_date: f.issue_date,
    sales_date: f.delivery_date || f.issue_date,
    net_value: Number(f.subtotal),
    currency: String(f.currency ?? "EUR").toLowerCase(),
    payment_due_date: f.due_date,
    payment_offset_days: splatnost,
    gross_value: Number(f.total),
  };
  if (sadzba !== null && SADZBY_TRANSEU.has(sadzba)) invoice_data.tax_value = sadzba;
  return {
    invoice_data,
    media_name: nazovSuboru,
    media_id: mediaId,
    visible_to_contractor: true,
    description: `Faktúra ${f.invoice_number}`,
  };
}

/** Text chyby z odpovede Trans.eu (OAuth aj API vracajú rôzne tvary). */
export function chybaTranseu(status: number, telo: unknown): string {
  const j = (telo ?? {}) as Record<string, any>;
  const sprava =
    j.error_description ??
    j.message ??
    j.detail ??
    j.title ??
    (Array.isArray(j.errors) ? (j.errors[0]?.message ?? j.errors[0]) : null) ??
    j.error ??
    null;
  if (status === 401 || j.error === "invalid_grant")
    return "Prihlásenie do Trans.eu vypršalo alebo bolo zrušené — pripojte účet znova.";
  if (status === 403) return "Trans.eu prístup odmietol — účet nemá právo na prijaté objednávky.";
  return `Trans.eu: ${typeof sprava === "string" && sprava ? sprava : `HTTP ${status}`}`;
}
