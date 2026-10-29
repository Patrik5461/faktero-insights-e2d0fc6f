/*
  Zoznam odoslaných upomienok (Fakturácia → Odoslané upomienky). Každý pokus
  o odoslanie — automatický z cronu aj ručný z faktúry či hromadne zo zoznamu —
  zapíše `sendReminder` do `invoice_reminders`, aj keď zlyhal. Tu je čistá
  logika nad tými riadkami: filtre, súhrn a zoskupenie podľa klienta.
*/

export type RiadokUpomienky = {
  id: string;
  sent_at: string;
  email_to: string;
  reminder_number: number;
  status: string;
  error_message: string | null;
  triggered_by: string;
  sent_by: string | null;
  invoice_id: string;
  invoices: {
    invoice_number: string | null;
    customer_name: string | null;
    customer_id: string | null;
  } | null;
};

export type FiltreUpomienok = {
  /** Deň od (vrátane), ISO `YYYY-MM-DD`. */
  od?: string;
  /** Deň do (vrátane), ISO `YYYY-MM-DD`. */
  do?: string;
  /** Kľúč klienta z `klucKlienta`. */
  klient?: string;
  stav?: "" | "sent" | "failed";
  sposob?: "" | "auto" | "manual";
  /** Hľadanie v klientovi, e-maile a čísle faktúry. */
  q?: string;
};

/**
 * Deň odoslania v slovenskom čase. `sent_at` je v UTC — upomienka z cronu
 * o 0:30 by inak padla do predošlého dňa a filter obdobia by ju vynechal.
 */
export function denOdoslania(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
}

/** Klient upomienky — odberateľ z adresára, inak meno na faktúre, inak e-mail. */
export function klucKlienta(r: RiadokUpomienky): string {
  const f = r.invoices;
  if (f?.customer_id) return `id:${f.customer_id}`;
  const meno = f?.customer_name?.trim().toLowerCase();
  if (meno) return `meno:${meno}`;
  return `email:${r.email_to.trim().toLowerCase()}`;
}

export function nazovKlienta(r: RiadokUpomienky): string {
  return r.invoices?.customer_name?.trim() || r.email_to || "—";
}

export const jeNeuspesna = (r: RiadokUpomienky) => r.status !== "sent";

export function filtrujUpomienky(riadky: RiadokUpomienky[], f: FiltreUpomienok) {
  const q = (f.q ?? "").trim().toLowerCase();
  return riadky.filter((r) => {
    const den = denOdoslania(r.sent_at);
    if (f.od && den < f.od) return false;
    if (f.do && den > f.do) return false;
    if (f.klient && klucKlienta(r) !== f.klient) return false;
    if (f.stav === "sent" && jeNeuspesna(r)) return false;
    if (f.stav === "failed" && !jeNeuspesna(r)) return false;
    if (f.sposob && (r.triggered_by === "auto" ? "auto" : "manual") !== f.sposob) return false;
    if (!q) return true;
    return [nazovKlienta(r), r.email_to, r.invoices?.invoice_number]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
}

export type SuhrnUpomienok = {
  /** Všetky pokusy o odoslanie e-mailu. */
  emailov: number;
  odoslanych: number;
  neuspesnych: number;
  /** Klienti, ktorým aspoň jedna upomienka naozaj odišla. */
  klientov: number;
  /** Faktúry, ku ktorým aspoň jedna upomienka naozaj odišla. */
  faktur: number;
};

export function suhrnUpomienok(riadky: RiadokUpomienky[]): SuhrnUpomienok {
  const klienti = new Set<string>();
  const faktury = new Set<string>();
  let neuspesnych = 0;
  for (const r of riadky) {
    if (jeNeuspesna(r)) {
      neuspesnych++;
      continue;
    }
    klienti.add(klucKlienta(r));
    faktury.add(r.invoice_id);
  }
  return {
    emailov: riadky.length,
    odoslanych: riadky.length - neuspesnych,
    neuspesnych,
    klientov: klienti.size,
    faktur: faktury.size,
  };
}

export type SkupinaKlienta = {
  kluc: string;
  nazov: string;
  emaily: string[];
  odoslanych: number;
  neuspesnych: number;
  faktur: number;
  /** Posledný pokus (ISO čas). */
  posledna: string;
  riadky: RiadokUpomienky[];
};

/** Upomienky podľa klienta — najviac upomínaní hore, pri zhode naposledy upomínaní. */
export function podlaKlienta(riadky: RiadokUpomienky[]): SkupinaKlienta[] {
  const mapa = new Map<string, SkupinaKlienta>();
  for (const r of riadky) {
    const k = klucKlienta(r);
    let s = mapa.get(k);
    if (!s) {
      s = {
        kluc: k,
        nazov: nazovKlienta(r),
        emaily: [],
        odoslanych: 0,
        neuspesnych: 0,
        faktur: 0,
        posledna: r.sent_at,
        riadky: [],
      };
      mapa.set(k, s);
    }
    s.riadky.push(r);
    if (jeNeuspesna(r)) s.neuspesnych++;
    else s.odoslanych++;
    if (r.email_to && !s.emaily.includes(r.email_to)) s.emaily.push(r.email_to);
    if (r.sent_at > s.posledna) s.posledna = r.sent_at;
  }
  const out = [...mapa.values()];
  for (const s of out) {
    s.faktur = new Set(s.riadky.map((r) => r.invoice_id)).size;
    s.riadky.sort((a, b) => (a.sent_at < b.sent_at ? 1 : a.sent_at > b.sent_at ? -1 : 0));
  }
  return out.sort(
    (a, b) =>
      b.odoslanych + b.neuspesnych - (a.odoslanych + a.neuspesnych) ||
      (a.posledna < b.posledna ? 1 : a.posledna > b.posledna ? -1 : 0),
  );
}

/** Klienti do výberu vo filtri, zoradení podľa mena. */
export function moznostiKlientov(riadky: RiadokUpomienky[]) {
  const mapa = new Map<string, string>();
  for (const r of riadky) {
    const k = klucKlienta(r);
    if (!mapa.has(k)) mapa.set(k, nazovKlienta(r));
  }
  return [...mapa.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "sk"));
}
