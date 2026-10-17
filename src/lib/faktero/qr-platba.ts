import { krajinaDane } from "./vat-rates";

/**
 * QR kód na zaplatenie faktúry.
 *
 * Slovensko a Česko majú **každé svoj štandard** a bankové aplikácie čítajú
 * ten svoj:
 *
 * - **PAY by square** — slovenský štandard od Slovenskej bankovej asociácie.
 *   Binárny, komprimovaný LZMA a zakódovaný do base32; skladá ho knižnica.
 * - **SPD** (Short Payment Descriptor) — český štandard, obyčajný text.
 * - **EPC QR** (GiroCode) — štandard Európskej platobnej rady EPC069-12,
 *   ktorý čítajú nemecké (a rakúske) banky. Obyčajný text po riadkoch.
 *
 * Doteraz sa na všetky faktúry kreslil SPD, aj slovenským firmám — hoci sme
 * na stránke sľubovali PAY by square. Slovenská banka taký kód prečítať
 * nemusí, takže QR na faktúre vyzeral funkčne a nerobil nič.
 */

export type UdajePlatby = {
  iban: string;
  suma: number;
  mena: string;
  vs?: string | null;
  sprava?: string | null;
  splatnost?: string | null;
  prijemca?: string | null;
  /** BIC banky príjemcu — v EPC QR verzie 002 nepovinný. */
  bic?: string | null;
};

/**
 * EPC QR (GiroCode) podľa EPC069-12, verzia 002.
 *
 * Riadky oddelené `\n`, v tomto poradí: `BCD`, verzia `002`, kódovanie `1`
 * (UTF-8), `SCT`, BIC (vo verzii 002 v rámci EHP nepovinný — prázdny riadok),
 * meno príjemcu (max 70), IBAN, suma `EUR` + suma s bodkou, účel (4 znaky,
 * nepoužíva sa), štruktúrovaná referencia (len RF podľa ISO 11649 — variabilný
 * symbol ňou nie je, preto prázdna) a voľný text (max 140). Prázdne riadky na
 * konci sa nepíšu.
 *
 * Štandard je len pre eurá a pre sumu 0,01 až 999 999 999,99 — inak `null`.
 */
export function epcQr(u: UdajePlatby): string | null {
  const iban = u.iban.replace(/\s+/g, "").toUpperCase();
  if (!iban || String(u.mena).toUpperCase() !== "EUR") return null;
  if (!(u.suma >= 0.01 && u.suma <= 999999999.99)) return null;
  const bic = String(u.bic ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const meno = String(u.prijemca || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 70);
  // Meno príjemcu je povinné; bez neho banka príkaz neprevezme.
  if (!meno) return null;
  const vs = String(u.vs ?? "").trim();
  const text = String(u.sprava || (vs ? `VS ${vs}` : ""))
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 140);
  const riadky = [
    "BCD",
    "002",
    "1",
    "SCT",
    /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic) ? bic : "",
    meno,
    iban,
    `EUR${u.suma.toFixed(2)}`,
    "",
    "",
    text,
  ];
  while (riadky.length && riadky[riadky.length - 1] === "") riadky.pop();
  return riadky.join("\n");
}

/** Český Short Payment Descriptor — čitateľný text, žiadna kompresia. */
export function spd(u: UdajePlatby): string {
  const casti = [
    "SPD*1.0",
    `ACC:${u.iban.replace(/\s+/g, "").toUpperCase()}`,
    `AM:${u.suma.toFixed(2)}`,
    `CC:${u.mena}`,
  ];
  if (u.vs) casti.push(`X-VS:${u.vs}`);
  if (u.splatnost) casti.push(`DT:${u.splatnost.replace(/-/g, "")}`);
  if (u.sprava) casti.push(`MSG:${u.sprava.slice(0, 60)}`);
  return casti.join("*");
}

/**
 * PAY by square.
 *
 * Knižnica overuje vstupy tvrdo: dátum musí byť `YYYYMMDD` a meno príjemcu je
 * povinné. Keď niečo nesedí, vyhodí výnimku — a tá by zhodila generovanie
 * celého PDF. Faktúra bez QR je stále platná faktúra, tak sa chyba prehltne a
 * vráti sa `null`.
 */
export async function payBySquare(u: UdajePlatby): Promise<string | null> {
  try {
    const { encode, PaymentOptions } = await import("bysquare/pay");
    return encode({
      invoiceId: (u.vs ?? "").slice(0, 10) || undefined,
      payments: [
        {
          type: PaymentOptions.PaymentOrder,
          amount: Number(u.suma.toFixed(2)),
          bankAccounts: [{ iban: u.iban.replace(/\s+/g, "").toUpperCase() }],
          currencyCode: u.mena as any,
          variableSymbol: u.vs ?? undefined,
          paymentNote: u.sprava ? u.sprava.slice(0, 140) : undefined,
          paymentDueDate: u.splatnost ? u.splatnost.replace(/-/g, "") : undefined,
          // Meno príjemcu je v štandarde povinné; bez neho knižnica neprejde.
          beneficiary: { name: (u.prijemca || "Prijemca").slice(0, 70) },
        },
      ],
    } as any);
  } catch {
    return null;
  }
}

/**
 * Odkaz PAYME (štandard platobného odkazu Slovenskej bankovej asociácie).
 * Ťuknutím v mobile sa otvorí banková aplikácia s vyplneným príkazom —
 * podporujú ho Tatra banka a Slovenská sporiteľňa. Len pre eurá.
 */
export function paymeOdkaz(u: UdajePlatby): string | null {
  const iban = u.iban.replace(/\s+/g, "").toUpperCase();
  if (!iban || u.mena !== "EUR" || !(u.suma > 0)) return null;
  const p = new URLSearchParams();
  p.set("V", "1");
  p.set("IBAN", iban);
  p.set("AM", u.suma.toFixed(2));
  p.set("CC", "EUR");
  if (u.splatnost && /^\d{4}-\d{2}-\d{2}$/.test(u.splatnost))
    p.set("DT", u.splatnost.replace(/-/g, ""));
  const vs = String(u.vs ?? "")
    .replace(/\D/g, "")
    .slice(0, 10);
  if (vs) p.set("PI", `/VS${vs}/SS/KS`);
  if (u.sprava) p.set("MSG", u.sprava.slice(0, 140));
  if (u.prijemca) p.set("CN", u.prijemca.slice(0, 70));
  return `https://payme.sk/?${p.toString()}`;
}

/** Text do QR podľa krajiny registrácie firmy. `null` = QR sa nekreslí. */
export async function textQrPlatby(
  u: UdajePlatby,
  krajinaFirmy?: string | null,
): Promise<{ text: string; format: "PAY by square" | "SPD" | "GiroCode" } | null> {
  if (!u.iban || !Number.isFinite(u.suma)) return null;
  const krajina = krajinaDane(krajinaFirmy);
  if (krajina === "CZ") return { text: spd(u), format: "SPD" };
  if (krajina === "DE") {
    // GiroCode je len v eurách; faktúra v inej mene ostane bez QR.
    const epc = epcQr(u);
    return epc ? { text: epc, format: "GiroCode" } : null;
  }
  const pbs = await payBySquare(u);
  // Keď PAY by square z akéhokoľvek dôvodu nevyjde, je SPD lepšie než nič —
  // slovenské banky ho síce nemusia poznať, ale české áno.
  return pbs ? { text: pbs, format: "PAY by square" } : { text: spd(u), format: "SPD" };
}
