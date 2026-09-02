/**
 * Čítanie QR kódu na českom bločku („QR EET“).
 *
 * Rozdiel proti Slovensku je zásadný a treba ho mať na pamäti pri čítaní tohto
 * súboru: slovenský eKasa QR nesie len identifikátor a celý doklad aj s
 * položkami k nemu vydá Finančná správa. Český QR nesie údaje sám v sebe a
 * databáza, ktorá by k nemu vydala zvyšok, neexistuje — evidencia tržieb
 * skončila 1. 1. 2023, systém odvtedy nebeží a overovacia služba Finanční
 * správy odpovedá „Služba již není dostupná“. Z českého QR sa teda dá prečítať
 * hlavička dokladu — DIČ, suma, dátum — a nikdy nie položky.
 *
 * Formát je prevzatý zo SPAYD (formát českej QR platby), líši sa len hlavičkou:
 *
 *   EET*1.0*BKP:DE7AB57EF9F1B523*DIC:45316872*KC:117*DT:201710101844*R:B*
 *
 * Kľúče podľa špecifikácie: FIK a BKP (prvých 16 znakov kódu), DIC (8–10 číslic
 * bez predpony CZ), KC (suma v korunách), DT (YYYYMMDDhhmm), R (B/Z, keď chýba
 * ide o bežný režim). Čítanie je zámerne zhovievavé — tlačiarne sa v drobnostiach
 * líšia a doklad radšej prečítame aj s predponou „CZ“ či s čiarkou v sume, než
 * aby sme ho zahodili.
 */

export type EetDecoded = {
  /** Fiškálny identifikačný kód — prvých 16 znakov, tak ako je v QR. */
  fik?: string;
  /** Bezpečnostný kód poplatníka — prvých 16 znakov. */
  bkp?: string;
  /** DIČ tak, ako sa píše na doklade, teda s predponou CZ. */
  dic?: string;
  /** IČO — dá sa odvodiť len z osemmiestneho DIČ právnickej osoby. */
  ico?: string;
  /** Suma v korunách. */
  suma?: number;
  /** YYYY-MM-DD */
  datum?: string;
  /** HH:MM */
  cas?: string;
  rezim?: "bezny" | "zjednoduseny";
};

/** Nesie tento QR kód český bloček? */
export function jeEetQr(qr: string): boolean {
  return /^\s*EET\*/i.test(qr);
}

function odkoduj(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    // Hodnota nemusí byť URL-kódovaná vôbec; percento v texte nie je dôvod
    // zahodiť celý doklad.
    return v;
  }
}

/** Dvojice kľúč→hodnota z tela reťazca. Hodnota smie obsahovať dvojbodku. */
function polia(t: string): Map<string, string> {
  const out = new Map<string, string>();
  // Prvý úsek je hlavička `EET`, druhý verzia (`1.0`) — ani jeden nemá dvojbodku.
  for (const usek of t.split("*")) {
    const i = usek.indexOf(":");
    if (i <= 0) continue;
    const kluc = usek.slice(0, i).trim().toUpperCase();
    const hodnota = odkoduj(usek.slice(i + 1).trim());
    if (kluc && hodnota && !out.has(kluc)) out.set(kluc, hodnota);
  }
  return out;
}

function kod(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const c = v.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-F0-9]{8,}$/.test(c) ? c.slice(0, 16) : undefined;
}

function sumaZKc(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

/** DT je YYYYMMDDhhmm; niektoré pokladnice pošlú len dátum alebo aj sekundy. */
function datumZDt(v: string | undefined): { datum?: string; cas?: string } {
  if (!v) return {};
  const c = v.replace(/\D/g, "");
  if (c.length < 8) return {};
  const rok = Number(c.slice(0, 4));
  const mesiac = Number(c.slice(4, 6));
  const den = Number(c.slice(6, 8));
  if (rok < 2000 || rok > 2100 || mesiac < 1 || mesiac > 12 || den < 1 || den > 31) return {};
  const datum = `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`;
  if (c.length < 12) return { datum };
  const hod = Number(c.slice(8, 10));
  const min = Number(c.slice(10, 12));
  if (hod > 23 || min > 59) return { datum };
  return { datum, cas: `${c.slice(8, 10)}:${c.slice(10, 12)}` };
}

/**
 * Prečíta český QR. Vráti `null`, keď to QR EET nie je alebo keď v ňom nie je
 * nič, čo by sa dalo prepísať do dokladu.
 */
export function parseEetQr(qr: string): EetDecoded | null {
  const t = qr.trim();
  if (!jeEetQr(t)) return null;

  const p = polia(t);
  const out: EetDecoded = {};

  out.fik = kod(p.get("FIK"));
  out.bkp = kod(p.get("BKP"));

  const dicCislice = (p.get("DIC") ?? "").replace(/^CZ/i, "").replace(/\D/g, "");
  if (dicCislice.length >= 8 && dicCislice.length <= 10) {
    out.dic = `CZ${dicCislice}`;
    // Len osemmiestne DIČ je IČO právnickej osoby. Deväť- a desaťmiestne nesie
    // rodné číslo fyzickej osoby — to do IČO nepatrí a v ARES sa nenájde.
    if (dicCislice.length === 8) out.ico = dicCislice;
  }

  out.suma = sumaZKc(p.get("KC"));
  const { datum, cas } = datumZDt(p.get("DT"));
  out.datum = datum;
  out.cas = cas;

  const r = (p.get("R") ?? "").toUpperCase();
  if (r === "Z") out.rezim = "zjednoduseny";
  else if (r === "B") out.rezim = "bezny";

  const maCoPrepisat = out.dic || out.suma != null || out.datum;
  return maCoPrepisat ? out : null;
}
