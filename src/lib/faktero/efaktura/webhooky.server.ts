/*
  Overovanie a čítanie webhookov eFaktúry.

  Dva zdroje:

  1) Finančná správa (PDS/PFS, „Poskytnutie údajov subjektu pre poskytovateľa
     doručovacej služby“). Hlavička `X-PDS-Secret` =
     hex(SHA-512(UTF-8(telo + tajomstvo))). Telo je pole firiem
     `{created, dic, legalName, company_email, company_phone, verification_token}`.
     Odpovedá sa synchrónne kódom 200 / 400 / 401 / 500.

  2) ePošták — udalosti o dokladoch. `X-Webhook-Signature: sha256=<hex>` je
     HMAC-SHA256 z `${X-Webhook-Timestamp}.${telo}`, časová pečiatka v sekundách,
     tolerancia 5 minút. Podpisuje sa telo presne tak, ako prišlo.

  Obe overenia porovnávajú v konštantnom čase a nikdy neparsujú telo pred
  overením podpisu.
*/

import { createHash, createHmac, timingSafeEqual } from "crypto";

function rovnakeHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), "utf8");
  const y = Buffer.from(b.toLowerCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Hodnota `X-PDS-Secret`, ktorú by FS poslala k tomuto telu. */
export function podpisPds(telo: string, tajomstvo: string): string {
  return createHash("sha512").update(Buffer.from(telo + tajomstvo, "utf8")).digest("hex");
}

export function overPdsPodpis(
  telo: string,
  hlavicka: string | null | undefined,
  tajomstvo: string | null | undefined,
): boolean {
  const h = String(hlavicka ?? "").trim();
  if (!tajomstvo || !/^[0-9a-fA-F]{128}$/.test(h)) return false;
  return rovnakeHex(h, podpisPds(telo, tajomstvo));
}

export type DovodOdmietnutia =
  | "chyba_hlavicka"
  | "zly_tvar"
  | "neznamy_algoritmus"
  | "nesedi_podpis"
  | "stara_pecatka";

/** Overenie podpisu ePoštáka (ako `WebhookSignature::verify` v ich SDK). */
export function overEpostakPodpis(args: {
  podpis: string | null | undefined;
  pecatka: string | null | undefined;
  telo: string;
  tajomstvo: string;
  terazSekundy?: number;
  toleranciaSekund?: number;
}): { platny: boolean; dovod?: DovodOdmietnutia } {
  const podpis = String(args.podpis ?? "");
  const pecatka = String(args.pecatka ?? "");
  if (!podpis || !pecatka) return { platny: false, dovod: "chyba_hlavicka" };
  if (!podpis.startsWith("sha256=")) return { platny: false, dovod: "neznamy_algoritmus" };
  const hex = podpis.slice(7);
  if (!/^[0-9a-fA-F]+$/.test(hex) || !/^[0-9]+$/.test(pecatka)) {
    return { platny: false, dovod: "zly_tvar" };
  }
  const tolerancia = args.toleranciaSekund ?? 300;
  const teraz = args.terazSekundy ?? Math.floor(Date.now() / 1000);
  if (tolerancia > 0 && Math.abs(teraz - Number(pecatka)) > tolerancia) {
    return { platny: false, dovod: "stara_pecatka" };
  }
  const ocakavany = createHmac("sha256", args.tajomstvo)
    .update(`${pecatka}.${args.telo}`, "utf8")
    .digest("hex");
  return rovnakeHex(hex, ocakavany) ? { platny: true } : { platny: false, dovod: "nesedi_podpis" };
}

export type ZiadostPds = {
  vytvorene: string | null;
  dic: string;
  nazov: string | null;
  email: string | null;
  telefon: string | null;
  token: string;
};

/**
 * Žiadosti z tela webhooku FS. Prijme pole (podľa špecifikácie) aj jeden
 * objekt. Neplatná položka zhodí celú požiadavku na 400 — FS ju potom
 * pošle znova opravenú, a nič sa nezapíše napoly.
 */
export function rozparsujPds(telo: string): { ziadosti: ZiadostPds[] } | { chyba: string } {
  let data: unknown;
  try {
    data = JSON.parse(telo);
  } catch {
    return { chyba: "Telo nie je platný JSON." };
  }
  const pole = Array.isArray(data) ? data : [data];
  if (!pole.length) return { chyba: "Prázdny zoznam." };
  if (pole.length > 500) return { chyba: "Príliš veľa záznamov naraz." };
  const ziadosti: ZiadostPds[] = [];
  for (const [i, x] of pole.entries()) {
    if (!x || typeof x !== "object") return { chyba: `Záznam ${i + 1} nie je objekt.` };
    const o = x as Record<string, unknown>;
    const dic = String(o.dic ?? "").replace(/\s+/g, "");
    const token = String(o.verification_token ?? "").trim();
    if (!/^[0-9]{10}$/.test(dic)) return { chyba: `Záznam ${i + 1}: DIČ musí mať 10 číslic.` };
    if (!token || token.length > 8192) {
      return { chyba: `Záznam ${i + 1}: chýba verification_token.` };
    }
    const text = (v: unknown, max: number) => {
      const t = String(v ?? "").trim();
      return t ? t.slice(0, max) : null;
    };
    const vytvorene = text(o.created, 64);
    ziadosti.push({
      vytvorene: vytvorene && !Number.isNaN(Date.parse(vytvorene)) ? vytvorene : null,
      dic,
      nazov: text(o.legalName, 300),
      email: text(o.company_email, 320),
      telefon: text(o.company_phone, 64),
      token,
    });
  }
  return { ziadosti };
}

/** Odtlačok tokenu — rovnaká žiadosť poslaná znova sa nezapíše dvakrát. */
export function odtlacokTokenu(token: string): string {
  return createHash("sha256").update(`faktero:pds-token:v1:${token}`, "utf8").digest("hex");
}

export type UdalostEpostaka = {
  typ: string | null;
  firmId: string | null;
  dokumentId: string | null;
  udalostId: string | null;
};

/**
 * Z udalosti ePoštáka sa berie len to, čo treba na rozhodnutie, ktorú firmu
 * dorovnať. Ich rozhrania majú rôzne tvary (camelCase, snake_case, `payload`
 * alebo `data`), takže sa hľadá na všetkých miestach.
 */
export function rozparsujUdalost(telo: string): UdalostEpostaka | null {
  let o: any;
  try {
    o = JSON.parse(telo);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const vnutro = (o.payload ?? o.data ?? {}) as Record<string, unknown>;
  const s = (...v: unknown[]) => {
    for (const x of v) if (typeof x === "string" && x.trim()) return x.trim();
    return null;
  };
  return {
    typ: s(o.event, o.type, o.eventType),
    firmId: s(o.firm_id, o.firmId, vnutro.firm_id, vnutro.firmId),
    dokumentId: s(o.documentId, o.document_id, vnutro.documentId, vnutro.document_id, vnutro.id),
    udalostId: s(o.event_id, o.eventId, o.id),
  };
}
