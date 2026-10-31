/**
 * Obsluha `/__demo/*` v preview serveri — náhrada celého Supabase:
 *   /__demo/rest/v1/*      PostgREST nad demo databázou (postgrest.ts)
 *   /__demo/auth/v1/*      prihlásenie demo účtami (ucty.ts)
 *   /__demo/storage/v1/*   súbory v pamäti + vymyslené prílohy z preview/assets
 *   /__demo/functions/v1/* edge funkcie — len simulované
 *   /__demo/realtime/*     nepodporované (404)
 * a ovládanie preview:
 *   GET  /__demo/stav        účty, aktuálne roly, počty riadkov
 *   POST /__demo/nastav      {ucet?, rola?, opravnenia?, dizajn?} — zmena roly/dizajnu
 *   POST /__demo/reset       demo dáta do pôvodného stavu
 *   GET  /__demo/blokovane   zoznam zablokovaných pokusov o sieť zo servera
 *   GET  /__demo/relacia?ucet=… nová relácia pre prehliadač (automatické prihlásenie)
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoDb, type KontextPoziadavky } from "./db";
import { obsluzRest, type Odpoved } from "./postgrest";
import { RPC } from "./rpc";
import { DEMO_UCTY, dekodujToken, pouzivatelJson, ucetPodlaId, vyrobRelaciu } from "./ucty";
import { zablokovanePokusy, kontextSiete } from "./siet";
import { naplnDemoData } from "../data";

const ADRESAR = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(ADRESAR, "../assets");

export const db = new DemoDb();
let naplnene = false;
export function zabezpecData() {
  if (naplnene) return;
  naplnene = true;
  const t0 = Date.now();
  naplnDemoData(db);
  console.info(`[demo] Demo dáta pripravené za ${Date.now() - t0} ms`);
}

async function citajTelo(req: IncomingMessage): Promise<Buffer> {
  const kusy: Buffer[] = [];
  for await (const k of req) kusy.push(k as Buffer);
  return Buffer.concat(kusy);
}

function posli(res: ServerResponse, o: Odpoved) {
  res.statusCode = o.status;
  for (const [k, v] of Object.entries(o.hlavicky)) res.setHeader(k, v);
  res.end(o.telo ?? undefined);
}

function posliJson(res: ServerResponse, status: number, telo: unknown) {
  posli(res, {
    status,
    hlavicky: { "content-type": "application/json; charset=utf-8" },
    telo: telo === undefined ? "" : JSON.stringify(telo),
  });
}

function kontextZ(req: IncomingMessage): KontextPoziadavky {
  const auth = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const claims = dekodujToken(auth);
  if (claims?.sub && ucetPodlaId(claims.sub)) return { pouzivatel: claims.sub, servis: false };
  return { pouzivatel: null, servis: true };
}

/* ------------------------------------------------------------- úložisko */

const TYPY: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/png",
  ".heic": "image/png",
  ".xml": "application/xml",
  ".isdoc": "application/xml",
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

/** Súbor, ktorý v pamäti nie je — vymyslená príloha podľa prípony. */
function nahradnySubor(cesta: string): { obsah: Buffer; typ: string } {
  const ext = extname(cesta.split("?")[0]).toLowerCase();
  const kandidati: Record<string, string> = {
    ".pdf": "demo-doklad.pdf",
    ".png": "demo-blocek.png",
    ".jpg": "demo-blocek.png",
    ".jpeg": "demo-blocek.png",
    ".webp": "demo-blocek.png",
    ".heic": "demo-blocek.png",
    ".xml": "demo-doklad.xml",
    ".isdoc": "demo-doklad.xml",
    ".svg": "demo-logo.svg",
  };
  let subor = kandidati[ext];
  if (/logo/i.test(cesta) && ext !== ".pdf") subor = "demo-logo.svg";
  if (subor && existsSync(resolve(ASSETS, subor))) {
    return { obsah: readFileSync(resolve(ASSETS, subor)), typ: TYPY[extname(subor)] ?? "application/octet-stream" };
  }
  return { obsah: Buffer.from("Demo súbor – vymyslený obsah preview.\n"), typ: "text/plain; charset=utf-8" };
}

async function obsluzUlozisko(req: IncomingMessage, res: ServerResponse, cesta: string, url: URL) {
  const metoda = req.method ?? "GET";
  const telo = metoda === "GET" || metoda === "HEAD" ? Buffer.alloc(0) : await citajTelo(req);
  const json = () => {
    try {
      return JSON.parse(telo.toString("utf8") || "{}");
    } catch {
      return {};
    }
  };
  const dekoduj = (s: string) => decodeURIComponent(s);

  if (cesta === "bucket" || cesta.startsWith("bucket/")) return posliJson(res, 200, []);

  // Podpísané adresy
  let m = /^object\/sign\/([^/]+)\/(.+)$/.exec(cesta);
  if (m && metoda === "POST") {
    const kluc = `${m[1]}/${dekoduj(m[2])}`;
    return posliJson(res, 200, { signedURL: `/object/sign/${kluc}?token=demo` });
  }
  m = /^object\/sign\/([^/]+)$/.exec(cesta);
  if (m && metoda === "POST") {
    const { paths = [] } = json();
    return posliJson(
      res,
      200,
      (paths as string[]).map((p) => ({ path: p, signedURL: `/object/sign/${m![1]}/${p}?token=demo`, error: null })),
    );
  }
  m = /^object\/upload\/sign\/([^/]+)\/(.+)$/.exec(cesta);
  if (m && metoda === "POST") {
    return posliJson(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=demo`, token: "demo" });
  }
  if (m && metoda === "PUT") {
    db.subory.set(`${m[1]}/${dekoduj(m[2])}`, { obsah: telo, typ: String(req.headers["content-type"] ?? "application/octet-stream") });
    return posliJson(res, 200, { Key: `${m[1]}/${m[2]}` });
  }
  m = /^object\/list(?:-v2)?\/([^/]+)$/.exec(cesta);
  if (m) {
    const { prefix = "" } = json();
    const pred = `${m[1]}/${prefix ? String(prefix).replace(/\/$/, "") + "/" : ""}`;
    const polozky = [...db.subory.keys()]
      .filter((k) => k.startsWith(pred))
      .map((k) => ({ name: k.slice(pred.length), id: k, metadata: { size: db.subory.get(k)!.obsah.length } }));
    return posliJson(res, 200, polozky);
  }
  if ((cesta === "object/move" || cesta === "object/copy") && metoda === "POST") {
    const { bucketId, sourceKey, destinationKey } = json();
    const zdroj = db.subory.get(`${bucketId}/${sourceKey}`);
    if (zdroj) {
      db.subory.set(`${bucketId}/${destinationKey}`, zdroj);
      if (cesta === "object/move") db.subory.delete(`${bucketId}/${sourceKey}`);
    }
    return posliJson(res, 200, { message: "Demo – len v pamäti", Key: destinationKey });
  }
  m = /^object\/info\/(?:public\/|authenticated\/)?([^/]+)\/(.+)$/.exec(cesta);
  if (m) {
    const s = db.subory.get(`${m[1]}/${dekoduj(m[2])}`) ?? nahradnySubor(m[2]);
    return posliJson(res, 200, { name: m[2], size: s.obsah.length, content_type: s.typ });
  }
  m = /^object\/([^/]+)$/.exec(cesta);
  if (m && metoda === "DELETE") {
    const { prefixes = [] } = json();
    for (const p of prefixes as string[]) db.subory.delete(`${m[1]}/${p}`);
    console.info(`[demo] úložisko: zmazané ${prefixes.length} súborov (len v pamäti)`);
    return posliJson(res, 200, (prefixes as string[]).map((p) => ({ name: p })));
  }
  // Čítanie: object/<bucket>/<cesta>, object/public|authenticated|sign/…, render/image/…
  m = /^(?:object|render\/image)\/(?:public\/|authenticated\/|sign\/)?([^/]+)\/(.+)$/.exec(cesta);
  if (m && (metoda === "GET" || metoda === "HEAD")) {
    const kluc = `${m[1]}/${dekoduj(m[2])}`;
    const s = db.subory.get(kluc) ?? nahradnySubor(kluc);
    res.statusCode = 200;
    res.setHeader("content-type", s.typ);
    res.setHeader("content-length", String(s.obsah.length));
    res.setHeader("cache-control", "no-store");
    return res.end(metoda === "HEAD" ? undefined : s.obsah);
  }
  if (m && (metoda === "POST" || metoda === "PUT")) {
    const kluc = `${m[1]}/${dekoduj(m[2])}`;
    // Nahranie cez FormData — obsah sa nerozoberá, stačí ho podržať.
    db.subory.set(kluc, { obsah: telo, typ: String(req.headers["content-type"] ?? "application/octet-stream") });
    console.info(`[demo] úložisko: nahraté ${kluc} (len v pamäti)`);
    return posliJson(res, 200, { Key: kluc, Id: kluc, path: m[2] });
  }
  void url;
  return posliJson(res, 404, { statusCode: "404", error: "not_found", message: "Demo – súbor neexistuje" });
}

/* ------------------------------------------------------------- auth */

let aktivnyDizajn: Record<string, string> = {};

async function obsluzAuth(req: IncomingMessage, res: ServerResponse, cesta: string, url: URL) {
  const metoda = req.method ?? "GET";
  const telo = metoda === "GET" ? {} : (() => {
    return citajTelo(req).then((b) => {
      try {
        return JSON.parse(b.toString("utf8") || "{}");
      } catch {
        return {};
      }
    });
  })();
  const vstup: any = await telo;
  const k = kontextZ(req);

  if (cesta === "settings") {
    return posliJson(res, 200, { external: { email: true, google: false }, disable_signup: true, mailer_autoconfirm: true });
  }
  if (cesta === "token") {
    const typ = url.searchParams.get("grant_type");
    let ucet = null;
    if (typ === "password") ucet = DEMO_UCTY.find((u) => u.email === String(vstup.email ?? "").toLowerCase()) ?? null;
    if (typ === "refresh_token") ucet = ucetPodlaId(String(vstup.refresh_token ?? "").replace("demo-refresh-", ""));
    if (!ucet) {
      return posliJson(res, 400, {
        code: 400,
        error_code: "invalid_credentials",
        msg: `Demo: prihláste sa niektorým demo účtom (${DEMO_UCTY.map((u) => u.email).join(", ")}), heslo je ľubovoľné.`,
      });
    }
    return posliJson(res, 200, vyrobRelaciu(ucet));
  }
  if (cesta === "logout") {
    res.statusCode = 204;
    return res.end();
  }
  if (cesta === "user") {
    const ucet = ucetPodlaId(k.pouzivatel);
    if (!ucet) return posliJson(res, 401, { code: 401, error_code: "bad_jwt", msg: "Demo: neplatný token" });
    if (metoda === "PUT") {
      // updateUser({ data }) — napr. prepnutie dizajnu v nastaveniach
      if (vstup.data && typeof vstup.data === "object") Object.assign(ucet.metadata, vstup.data);
      if (vstup.data?.dizajn) aktivnyDizajn[ucet.id] = vstup.data.dizajn;
      console.info(`[demo] auth: zmena účtu ${ucet.email} (len v pamäti)`);
    }
    return posliJson(res, 200, pouzivatelJson(ucet));
  }
  if (cesta.startsWith("factors")) {
    if (metoda === "GET") return posliJson(res, 200, []);
    return posliJson(res, 400, { code: 400, msg: "Demo – dvojfaktorové overenie sa v preview nenastavuje" });
  }
  if (cesta === "signup") {
    return posliJson(res, 400, { code: 400, error_code: "signup_disabled", msg: "Demo – registrácia je v preview vypnutá" });
  }
  if (["recover", "otp", "resend", "magiclink", "verify", "reauthenticate"].includes(cesta)) {
    return posliJson(res, 200, {});
  }
  // admin API (servisný kľúč zo serverových funkcií)
  if (cesta.startsWith("admin/users")) {
    const id = cesta.split("/")[2];
    if (id) {
      const u = ucetPodlaId(id);
      return u ? posliJson(res, 200, pouzivatelJson(u)) : posliJson(res, 404, { code: 404, msg: "User not found" });
    }
    return posliJson(res, 200, { users: DEMO_UCTY.map(pouzivatelJson), aud: "authenticated" });
  }
  if (cesta.startsWith("admin/")) return posliJson(res, 200, {});
  return posliJson(res, 404, { code: 404, msg: `Demo: ${cesta} nie je v náhrade Auth` });
}

/* ------------------------------------------------------------- ovládanie */

async function obsluzOvladanie(req: IncomingMessage, res: ServerResponse, cesta: string, url: URL) {
  if (cesta === "stav") {
    const clenstva = db.tabulka("company_users");
    return posliJson(res, 200, {
      ucty: DEMO_UCTY.map((u) => ({
        id: u.id,
        email: u.email,
        meno: u.meno,
        rola: clenstva.find((c) => c.user_id === u.id)?.role ?? u.rola,
        opravnenia: clenstva.find((c) => c.user_id === u.id)?.permissions ?? {},
        dizajn: u.metadata.dizajn ?? "faktero",
      })),
      firmy: db.tabulka("companies").map((c) => ({ id: c.id, name: c.name })),
      blokovane: zablokovanePokusy.length,
    });
  }
  if (cesta === "relacia") {
    const ucet = DEMO_UCTY.find((u) => u.email === url.searchParams.get("ucet") || u.id === url.searchParams.get("ucet")) ?? DEMO_UCTY[0];
    return posliJson(res, 200, vyrobRelaciu(ucet));
  }
  if (cesta === "blokovane") return posliJson(res, 200, zablokovanePokusy);
  if (cesta === "reset" && req.method === "POST") {
    db.vycisti();
    naplnene = false;
    zabezpecData();
    return posliJson(res, 200, { ok: true });
  }
  if (cesta === "nastav" && req.method === "POST") {
    const b = JSON.parse((await citajTelo(req)).toString("utf8") || "{}");
    const ucet = ucetPodlaId(b.ucet) ?? DEMO_UCTY[0];
    if (b.rola) {
      for (const c of db.tabulka("company_users")) {
        if (c.user_id !== ucet.id) continue;
        c.role = b.rola;
        c.permissions = b.rola === "custom" ? (b.opravnenia ?? ucet.opravnenia) : {};
      }
      ucet.rola = b.rola;
    }
    if (b.dizajn) ucet.metadata.dizajn = b.dizajn;
    return posliJson(res, 200, { ok: true });
  }
  return posliJson(res, 404, { chyba: "neznáme" });
}

/* ------------------------------------------------------------- vstup */

export async function obsluzDemo(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/__demo/")) return false;
  zabezpecData();
  const zvysok = url.pathname.slice("/__demo/".length);
  res.setHeader("access-control-allow-origin", String(req.headers.origin ?? "*"));
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range, x-demo-simulovane");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  try {
    if (zvysok.startsWith("rest/v1/")) {
      const surove = req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : await citajTelo(req);
      let telo: unknown = null;
      if (surove.length) {
        try {
          telo = JSON.parse(surove.toString("utf8"));
        } catch {
          telo = null;
        }
      }
      const hlavicky: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) hlavicky[k.toLowerCase()] = Array.isArray(v) ? v.join(",") : v;
      posli(
        res,
        obsluzRest(
          db,
          {
            metoda: req.method ?? "GET",
            cesta: decodeURIComponent(zvysok.slice("rest/v1/".length)),
            parametre: url.searchParams,
            hlavicky,
            telo,
            kontext: kontextZ(req),
          },
          RPC,
        ),
      );
      return true;
    }
    if (zvysok.startsWith("auth/v1/")) {
      await obsluzAuth(req, res, zvysok.slice("auth/v1/".length).replace(/\/$/, ""), url);
      return true;
    }
    if (zvysok.startsWith("storage/v1/")) {
      await obsluzUlozisko(req, res, zvysok.slice("storage/v1/".length), url);
      return true;
    }
    if (zvysok.startsWith("functions/v1/")) {
      const meno = zvysok.slice("functions/v1/".length);
      console.warn(`[demo] edge funkcia „${meno}" — len simulovaná`);
      kontextSiete.getStore()?.blokovane.push(`edge:${meno}`);
      res.setHeader("x-demo-simulovane", encodeURIComponent(`edge:${meno}`));
      posliJson(res, 200, { ok: true, demo: true, sprava: "Demo – nič sa neodoslalo" });
      return true;
    }
    if (zvysok.startsWith("realtime/")) {
      posliJson(res, 404, { chyba: "Demo – realtime v preview nebeží" });
      return true;
    }
    await obsluzOvladanie(req, res, zvysok.replace(/\/$/, ""), url);
    return true;
  } catch (e) {
    console.error("[demo] chyba obsluhy", e);
    posliJson(res, 500, { message: String((e as Error)?.message ?? e) });
    return true;
  }
}

export const _vnutorne = { aktivnyDizajn };
