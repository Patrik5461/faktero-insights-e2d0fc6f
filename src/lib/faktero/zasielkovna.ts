/*
  Zásielkovňa (Packeta) — REST rozhranie s XML telom (https://www.zasilkovna.cz/api/rest).
  Názvy polí podľa oficiálneho WSDL (api/soap.wsdl): createPacket s packetAttributes,
  packetLabelPdf, packetStatus. Odpoveď: <response><status>ok|fault</status>…
*/

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const el = (n: string, v: unknown) =>
  v === null || v === undefined || v === "" ? "" : `<${n}>${esc(v)}</${n}>`;

export type ZasielkaZFaktury = {
  cislo: string;
  meno: string;
  priezvisko: string;
  firma?: string | null;
  email?: string | null;
  telefon?: string | null;
  /** Id výdajného miesta (alebo dopravcu pri doručení na adresu). */
  miestoId: number;
  dobierka?: number | null;
  mena: string;
  hodnota: number;
  hmotnost: number;
  odosielatel: string;
  ulica?: string | null;
  cisloDomu?: string | null;
  mesto?: string | null;
  psc?: string | null;
};

/** Meno a priezvisko z jedného poľa — Zásielkovňa chce obe. */
export function rozdelMeno(cele: string): { meno: string; priezvisko: string } {
  const casti = String(cele ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (casti.length <= 1) return { meno: casti[0] ?? "", priezvisko: casti[0] ?? "" };
  return { meno: casti.slice(0, -1).join(" "), priezvisko: casti[casti.length - 1]! };
}

export function xmlVytvorZasielku(heslo: string, z: ZasielkaZFaktury): string {
  return (
    `<createPacket>${el("apiPassword", heslo)}<packetAttributes>` +
    el("number", z.cislo.slice(0, 24)) +
    el("name", z.meno.slice(0, 32)) +
    el("surname", z.priezvisko.slice(0, 32)) +
    el("company", z.firma?.slice(0, 32)) +
    el("email", z.email) +
    el("phone", z.telefon) +
    el("addressId", z.miestoId) +
    (z.dobierka && z.dobierka > 0 ? el("cod", z.dobierka.toFixed(2)) : "") +
    el("currency", z.mena) +
    el("value", z.hodnota.toFixed(2)) +
    el("weight", z.hmotnost.toFixed(3)) +
    el("eshop", z.odosielatel.slice(0, 64)) +
    el("street", z.ulica) +
    el("houseNumber", z.cisloDomu) +
    el("city", z.mesto) +
    el("zip", z.psc) +
    `</packetAttributes></createPacket>`
  );
}

export const xmlStitok = (heslo: string, id: string) =>
  `<packetLabelPdf>${el("apiPassword", heslo)}${el("packetId", id)}${el("format", "A6 on A6")}${el("offset", 0)}</packetLabelPdf>`;

export const xmlStav = (heslo: string, id: string) =>
  `<packetStatus>${el("apiPassword", heslo)}${el("packetId", id)}</packetStatus>`;

const tag = (xml: string, n: string) =>
  xml.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1] ?? null;
const odEsc = (v: string | null) =>
  (v ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export type OdpovedZasielkovne =
  { ok: true; vysledok: string } | { ok: false; chyba: string; kod: string | null };

/** Rozoberie <response>; pri chybe zostaví zrozumiteľnú hlášku aj s chybnými poliami. */
export function odpoved(xml: string): OdpovedZasielkovne {
  const stav = tag(xml, "status");
  if (stav === "ok") return { ok: true, vysledok: tag(xml, "result") ?? "" };
  const kod = tag(xml, "fault");
  const text = odEsc(tag(xml, "string"));
  const polia = [
    ...(tag(xml, "detail") ?? "").matchAll(/<name>([^<]+)<\/name>\s*<fault>([^<]+)<\/fault>/g),
  ].map((m) => `${m[1]}: ${odEsc(m[2]!)}`);
  const prekladKodu: Record<string, string> = {
    IncorrectApiPasswordFault: "Nesprávne API heslo Zásielkovne.",
    PacketAttributesFault: "Zásielkovňa odmietla údaje zásielky",
    PacketIdFault: "Zásielka s týmto číslom v Zásielkovni nie je.",
  };
  const zaklad = (kod && prekladKodu[kod]) || text || "Zásielkovňa vrátila chybu.";
  return { ok: false, kod, chyba: polia.length ? `${zaklad}: ${polia.join("; ")}` : zaklad };
}

export const vysledokPola = (vysledok: string, n: string) => odEsc(tag(vysledok, n));
