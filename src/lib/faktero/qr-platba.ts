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
};

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

/** Text do QR podľa krajiny registrácie firmy. `null` = QR sa nekreslí. */
export async function textQrPlatby(
  u: UdajePlatby,
  krajinaFirmy?: string | null,
): Promise<{ text: string; format: "PAY by square" | "SPD" } | null> {
  if (!u.iban || !Number.isFinite(u.suma)) return null;
  if (krajinaDane(krajinaFirmy) === "CZ") return { text: spd(u), format: "SPD" };
  const pbs = await payBySquare(u);
  // Keď PAY by square z akéhokoľvek dôvodu nevyjde, je SPD lepšie než nič —
  // slovenské banky ho síce nemusia poznať, ale české áno.
  return pbs ? { text: pbs, format: "PAY by square" } : { text: spd(u), format: "SPD" };
}
