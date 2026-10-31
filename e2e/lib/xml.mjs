/*
  Overenie XML proti XSD (libxml2-wasm z node_modules repa).

  Schémy: Pohoda celý balík Stormware v e2e/schemy/pohoda (data.xsd importuje
  všetky agendy), ostatné tie isté, proti ktorým idú unit testy
  (src/lib/faktero/schemy).
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cestaModulu, E2E_DIR, REPO_DIR, HLAVNE_REPO } from "./prostredie.mjs";
import { existsSync } from "node:fs";

let lib = null;
async function libxml() {
  if (lib) return lib;
  const hlavny = cestaModulu("libxml2-wasm");
  lib = await import(pathToFileURL(hlavny).href);
  const node = await import(pathToFileURL(hlavny.replace(/index\.mjs$/, "nodejs.mjs")).href);
  // Schémy importujú ďalšie súbory (type.xsd…) — libxml ich musí vedieť načítať z disku.
  node.xmlRegisterFsInputProviders();
  return lib;
}

function schemyRepa() {
  for (const k of [REPO_DIR, HLAVNE_REPO]) {
    const c = path.join(k, "src/lib/faktero/schemy");
    if (existsSync(c)) return c;
  }
  throw new Error("Nenašiel sa priečinok src/lib/faktero/schemy");
}

export const SCHEMY = {
  pohoda: () => path.join(E2E_DIR, "schemy/pohoda/data.xsd"),
  pain001: () => path.join(schemyRepa(), "pain.001.001.03.xsd"),
  pain001Sepa: () => path.join(schemyRepa(), "pain.001.001.03-sepa.xsd"),
  kvDph: () => path.join(schemyRepa(), "kv_dph_2025.xsd"),
  dph: () => path.join(schemyRepa(), "dph2025.xsd"),
  camt053: () => path.join(schemyRepa(), "camt.053.001.02.xsd"),
  // České výkazy (EPO, MOJE daně) a české účtovné formáty.
  czDp3: () => path.join(schemyRepa(), "dphdp3_epo2.xsd"),
  czKh1: () => path.join(schemyRepa(), "dphkh1_epo2.xsd"),
  czShv: () => path.join(schemyRepa(), "dphshv_epo2.xsd"),
  isdoc: () => path.join(schemyRepa(), "isdoc-invoice-6.0.2.xsd"),
  moneyS3: () =>
    path.join(schemyRepa(), "..", "__fixtures__", "money-s3-uct-schemas", "_Document.xsd"),
};

const validatory = new Map();

/** Vráti null, keď je XML platné, inak text chyby. */
export async function overXsd(xml, schema) {
  const { XmlDocument, XsdValidator } = await libxml();
  const cesta = typeof schema === "function" ? schema() : schema;
  let v = validatory.get(cesta);
  if (!v) {
    const xsd = XmlDocument.fromBuffer(readFileSync(cesta), { url: pathToFileURL(cesta).href });
    v = XsdValidator.fromDoc(xsd);
    validatory.set(cesta, v);
  }
  const text = Buffer.isBuffer(xml) ? xml : Buffer.from(String(xml), "utf8");
  let doc;
  try {
    doc = XmlDocument.fromBuffer(text);
  } catch (e) {
    return `XML sa nedá prečítať: ${String(e?.message ?? e).slice(0, 400)}`;
  }
  try {
    v.validate(doc);
    return null;
  } catch (e) {
    const detail = Array.isArray(e?.details)
      ? e.details
          .map((d) => `${d.line ?? "?"}: ${d.message}`.trim())
          .slice(0, 5)
          .join(" | ")
      : "";
    return `${String(e?.message ?? e).slice(0, 300)} ${detail}`.trim();
  } finally {
    doc.dispose();
  }
}

/** XML zo súboru — Pohoda a výkazy chodia vo Windows-1250, libxml si kódovanie prečíta z hlavičky. */
export function citajXml(cesta) {
  return readFileSync(cesta);
}

/** Text XML dekódovaný podľa hlavičky (na hľadanie čísel dokladov). */
export function textXml(buf) {
  const hlavicka = buf.subarray(0, 200).toString("latin1");
  const kod = /encoding="([^"]+)"/i.exec(hlavicka)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(kod).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}
