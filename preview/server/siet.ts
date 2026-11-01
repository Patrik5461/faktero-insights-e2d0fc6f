/**
 * Zámok siete v procese preview servera.
 *
 * Serverové funkcie a `/api` v preview bežia naozaj (proti demo databáze),
 * takže musí byť isté, že sa odtiaľto nedostane von **nič**: ani `fetch`,
 * ani `http(s).request`, ani priame TCP/TLS spojenie (SMTP), ani DNS dotaz.
 * Povolené sú len adresy tohto počítača (127.0.0.1, ::1, localhost).
 *
 * Každý pokus sa zapíše do konzoly aj do zoznamu (`/__demo/blokovane`)
 * a k odpovedi požiadavky, počas ktorej vznikol, sa pridá hlavička
 * `x-demo-simulovane` — prehliadač podľa nej ukáže „Demo – nič sa neodoslalo“.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";

export type KontextSiete = { blokovane: string[]; zapisy: number };
/*
 * Modul sa načíta dvakrát (raz v konfigurácii Vite, raz v SSR grafe cez
 * `obsluha.ts`), preto stav drží `globalThis` — inak by mali každý svoj.
 */
const g = globalThis as any;
export const kontextSiete: AsyncLocalStorage<KontextSiete> = (g.__demoKontextSiete ??=
  new AsyncLocalStorage<KontextSiete>());

export const zablokovanePokusy: { cas: string; kam: string; sposob: string }[] =
  (g.__demoZablokovane ??= []);

const LOKALNE = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", ""]);

export function jeLokalne(host: string | null | undefined): boolean {
  if (host == null) return true;
  const h = String(host)
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return LOKALNE.has(h) || h.startsWith("127.") || h === "::ffff:127.0.0.1";
}

export class DemoBlokovane extends Error {
  constructor(kam: string) {
    super(`Demo – nič sa neodoslalo (preview neposiela nič mimo tento počítač: ${kam})`);
    this.name = "DemoBlokovane";
  }
}

function zapis(kam: string, sposob: string) {
  zablokovanePokusy.push({ cas: new Date().toISOString(), kam, sposob });
  if (zablokovanePokusy.length > 500) zablokovanePokusy.shift();
  kontextSiete.getStore()?.blokovane.push(kam);
  console.warn(`[demo] ZABLOKOVANÉ ${sposob} → ${kam}`);
}

/** Odpovede, ktoré sa dajú bezpečne predstierať — pracovný postup tak dobehne. */
function predstieranaOdpoved(url: URL, metoda: string): Response | null {
  if (url.hostname === "api.resend.com" && metoda === "POST") {
    const id = `demo-${Math.random().toString(36).slice(2, 10)}`;
    const telo = url.pathname.includes("batch") ? { data: [{ id }] } : { id };
    return new Response(JSON.stringify(telo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

export function zamkniSiet() {
  if (g.__demoSietZamknuta) return;
  g.__demoSietZamknuta = true;

  const povodnyFetch = globalThis.fetch;
  globalThis.fetch = async function demoFetch(vstup: any, init?: any) {
    const adresa =
      typeof vstup === "string"
        ? vstup
        : vstup instanceof URL
          ? vstup.href
          : (vstup?.url as string);
    let url: URL;
    try {
      url = new URL(adresa);
    } catch {
      return povodnyFetch(vstup, init);
    }
    const metoda = String(init?.method ?? (vstup as Request)?.method ?? "GET").toUpperCase();
    if (url.protocol === "data:" || url.protocol === "blob:") return povodnyFetch(vstup, init);
    if (jeLokalne(url.hostname)) {
      if (url.pathname.startsWith("/__demo/rest/") && metoda !== "GET" && metoda !== "HEAD") {
        const k = kontextSiete.getStore();
        if (k && !url.pathname.includes("/rpc/")) k.zapisy++;
      }
      return povodnyFetch(vstup, init);
    }
    zapis(`${metoda} ${url.origin}${url.pathname}`, "fetch");
    const falosna = predstieranaOdpoved(url, metoda);
    if (falosna) return falosna;
    throw new DemoBlokovane(url.host);
  } as typeof fetch;

  // http(s).request / get
  for (const [modul, meno] of [
    [http, "http"],
    [https, "https"],
  ] as const) {
    const povodnyRequest = modul.request;
    const povodnyGet = modul.get;
    const strazca = (args: any[]) => {
      const a = args[0];
      let host: string | undefined;
      if (typeof a === "string" || a instanceof URL) host = new URL(String(a)).hostname;
      else host = a?.hostname ?? a?.host;
      if (!jeLokalne(host)) {
        zapis(`${meno}://${host}`, `${meno}.request`);
        throw new DemoBlokovane(String(host));
      }
    };
    (modul as any).request = function (...args: any[]) {
      strazca(args);
      return (povodnyRequest as any).apply(this, args);
    };
    (modul as any).get = function (...args: any[]) {
      strazca(args);
      return (povodnyGet as any).apply(this, args);
    };
  }

  // Priame TCP/TLS (SMTP, databázy, …)
  const povodnyConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: any[]) {
    const a = args[0];
    let host: string | undefined;
    if (Array.isArray(a)) host = a[0]?.host;
    else if (typeof a === "object" && a) host = a.path ? "localhost" : a.host;
    else if (typeof a === "number") host = typeof args[1] === "string" ? args[1] : "localhost";
    else if (typeof a === "string") host = "localhost"; // unix socket
    if (!jeLokalne(host ?? "localhost")) {
      zapis(`tcp://${host}`, "net.connect");
      process.nextTick(() => this.destroy(new DemoBlokovane(String(host))));
      return this;
    }
    return (povodnyConnect as any).apply(this, args);
  } as any;
  const povodnyTls = tls.connect;
  (tls as any).connect = function (...args: any[]) {
    const a = args[0];
    const host =
      typeof a === "object" && a
        ? (a.host ?? a.servername)
        : typeof args[1] === "string"
          ? args[1]
          : undefined;
    if (!jeLokalne(host ?? "localhost")) {
      zapis(`tls://${host}`, "tls.connect");
      throw new DemoBlokovane(String(host));
    }
    return (povodnyTls as any).apply(this, args);
  };

  // DNS — preklad mien mimo localhost sa vôbec nespustí.
  const povodnyLookup = dns.lookup;
  (dns as any).lookup = function (hostname: string, ...rest: any[]) {
    if (!jeLokalne(hostname)) {
      zapis(`dns:${hostname}`, "dns.lookup");
      const cb = rest[rest.length - 1];
      const chyba = Object.assign(new DemoBlokovane(hostname), { code: "ENOTFOUND" });
      if (typeof cb === "function") process.nextTick(() => cb(chyba));
      return;
    }
    return (povodnyLookup as any).call(this, hostname, ...rest);
  };
  const povodnyPromises = dns.promises.lookup;
  (dns.promises as any).lookup = async function (hostname: string, ...rest: any[]) {
    if (!jeLokalne(hostname)) {
      zapis(`dns:${hostname}`, "dns.promises.lookup");
      throw Object.assign(new DemoBlokovane(hostname), { code: "ENOTFOUND" });
    }
    return (povodnyPromises as any).call(this, hostname, ...rest);
  };
  for (const f of [
    "resolve",
    "resolve4",
    "resolve6",
    "resolveMx",
    "resolveTxt",
    "resolveAny",
  ] as const) {
    const p = (dns.promises as any)[f];
    if (typeof p !== "function") continue;
    (dns.promises as any)[f] = async function (hostname: string, ...rest: any[]) {
      if (!jeLokalne(hostname)) {
        zapis(`dns:${hostname}`, `dns.${f}`);
        throw Object.assign(new DemoBlokovane(hostname), { code: "ENOTFOUND" });
      }
      return p.call(this, hostname, ...rest);
    };
  }

  // Pomenované ESM importy (`import { lookup } from "node:dns"`) sa inak nezmenia.
  syncBuiltinESMExports();

  console.info("[demo] Sieť zamknutá — povolený je len tento počítač (127.0.0.1/localhost).");
}
