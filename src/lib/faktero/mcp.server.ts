/**
 * MCP server Faktera — napojenie AI asistentov (Claude, ChatGPT, Cursor…)
 * na údaje firmy. Protokol Model Context Protocol, JSON-RPC 2.0 cez HTTP
 * (Streamable HTTP bez relácie: každá požiadavka je samostatná).
 *
 * Prihlásenie je ten istý API kľúč ako pri /api/v1 (`Authorization: Bearer`).
 * Každý nástroj volá existujúce REST API s tým istým kľúčom — overenie dát,
 * predplatné, záznam v API logu aj práva firmy ostávajú jedny. Nástroje nič
 * nemažú a nič neposielajú von (e-mail, eFaktúra); zapisujúce sú označené,
 * aby si ich klient dal potvrdiť.
 */
import { overApiKluc } from "./api-auth.server";

export const MCP_VERZIA_PROTOKOLU = "2025-06-18";
const PODPOROVANE = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Volaj = (
  metoda: "GET" | "POST",
  cesta: string,
  telo?: unknown,
) => Promise<{ status: number; json: any }>;

type Nastroj = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  vykonaj: (args: any, volaj: Volaj) => Promise<unknown>;
};

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o))
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Z faktúry len to, čo asistent potrebuje — celé riadky by zbytočne plnili kontext. */
const fakturaStrucne = (f: any) => ({
  id: f.id,
  cislo: f.invoice_number,
  typ: f.type,
  stav: f.status,
  odberatel: f.customer_name,
  ico: f.customer_ico,
  vystavena: f.issue_date,
  dodanie: f.delivery_date,
  splatnost: f.due_date,
  uhradena: f.paid_at,
  zaklad: Number(f.subtotal),
  dph: Number(f.vat_total),
  spolu: Number(f.total),
  mena: f.currency,
  vs: f.variable_symbol,
});

async function nutne(r: { status: number; json: any }) {
  if (r.status >= 400) {
    const e = r.json?.error;
    throw new Error(
      e?.message ? `${e.message}${e.code ? ` (${e.code})` : ""}` : `Chyba API ${r.status}`,
    );
  }
  return r.json;
}

const POLOZKA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Názov položky" },
    quantity: { type: "number", description: "Množstvo" },
    unit: { type: "string", description: "Merná jednotka, napr. ks, hod" },
    unit_price: { type: "number", description: "Jednotková cena bez DPH" },
    vat_rate: { type: "number", description: "Sadzba DPH v % (bez nej podľa firmy)" },
    description: { type: "string" },
  },
  required: ["name", "quantity", "unit_price"],
};

export const NASTROJE: Nastroj[] = [
  {
    name: "list_invoices",
    title: "Vystavené faktúry",
    description:
      "Zoznam vystavených faktúr firmy od najnovšej. Stav: draft (koncept), issued (vystavená), sent (odoslaná), paid (uhradená), cancelled (stornovaná).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "issued", "sent", "paid", "cancelled"] },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      const r = await nutne(
        await volaj("GET", `/api/v1/invoices${qs({ status: a?.status, limit: a?.limit })}`),
      );
      return { faktury: (r.data ?? []).map(fakturaStrucne) };
    },
  },
  {
    name: "get_invoice",
    title: "Detail faktúry",
    description: "Celá faktúra vrátane položiek podľa jej id (z list_invoices).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj("GET", `/api/v1/invoices/${encodeURIComponent(String(a?.id ?? ""))}`),
      );
    },
  },
  {
    name: "list_overdue_invoices",
    title: "Faktúry po splatnosti",
    description:
      "Neuhradené vystavené a odoslané faktúry po splatnosti — kto a koľko firme dlhuje.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(_a, volaj) {
      const dnes = new Date().toISOString().slice(0, 10);
      const [vyst, odosl] = await Promise.all([
        nutne(await volaj("GET", "/api/v1/invoices?status=issued&limit=200")),
        nutne(await volaj("GET", "/api/v1/invoices?status=sent&limit=200")),
      ]);
      const po = [...(vyst.data ?? []), ...(odosl.data ?? [])]
        .filter((f: any) => f.type !== "proforma" && f.due_date && f.due_date < dnes && !f.paid_at)
        .map(fakturaStrucne)
        .sort((x: any, y: any) => String(x.splatnost).localeCompare(String(y.splatnost)));
      const spolu: Record<string, number> = {};
      for (const f of po) spolu[f.mena] = Math.round(((spolu[f.mena] ?? 0) + f.spolu) * 100) / 100;
      return { pocet: po.length, spolu_podla_meny: spolu, faktury: po };
    },
  },
  {
    name: "create_invoice",
    title: "Vystaviť faktúru",
    description:
      "Vystaví novú ostrú faktúru s číslom z číselného radu firmy. Odberateľ buď cez customer_id (z list_customers), alebo ako objekt customer. Faktúru nikam neposiela — odoslanie je na človeku vo Fakteri.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", format: "uuid" },
        customer: {
          type: "object",
          properties: {
            name: { type: "string" },
            ico: { type: "string" },
            dic: { type: "string" },
            ic_dph: { type: "string" },
            street: { type: "string" },
            city: { type: "string" },
            zip: { type: "string" },
            country: { type: "string", description: "Kód krajiny, napr. SK" },
            email: { type: "string" },
          },
          required: ["name"],
        },
        issue_date: { type: "string", description: "RRRR-MM-DD, predvolene dnes" },
        delivery_date: { type: "string", description: "RRRR-MM-DD" },
        due_date: { type: "string", description: "RRRR-MM-DD" },
        currency: { type: "string", default: "EUR" },
        notes: { type: "string" },
        items: { type: "array", minItems: 1, items: POLOZKA },
      },
      required: ["items"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      const r = await nutne(await volaj("POST", "/api/v1/invoices", a));
      return {
        vystavena: fakturaStrucne(r.data ?? r),
        poznamka: "Faktúra je vystavená, nie odoslaná.",
      };
    },
  },
  {
    name: "mark_invoice_paid",
    title: "Označiť faktúru ako uhradenú",
    description: "Označí faktúru ako uhradenú dnešným dátumom (napríklad po platbe v hotovosti).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      const r = await nutne(
        await volaj(
          "POST",
          `/api/v1/invoices/${encodeURIComponent(String(a?.id ?? ""))}/mark-paid`,
          {},
        ),
      );
      return { uhradena: fakturaStrucne(r.data ?? r) };
    },
  },
  {
    name: "list_customers",
    title: "Odberatelia",
    description: "Kontakty firmy (odberatelia a dodávatelia) s IČO, DIČ a adresou.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      const r = await nutne(
        await volaj("GET", `/api/v1/customers${qs({ limit: a?.limit ?? 100 })}`),
      );
      return {
        odberatelia: (r.data ?? []).map((c: any) => ({
          id: c.id,
          nazov: c.name,
          ico: c.ico,
          dic: c.dic,
          ic_dph: c.ic_dph,
          email: c.email,
          adresa: [c.street, c.zip, c.city, c.country].filter(Boolean).join(", "),
        })),
      };
    },
  },
  {
    name: "create_customer",
    title: "Založiť odberateľa",
    description: "Založí nový kontakt (odberateľa).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        ico: { type: "string" },
        dic: { type: "string" },
        ic_dph: { type: "string" },
        email: { type: "string" },
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
        country: { type: "string" },
      },
      required: ["name"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      return nutne(await volaj("POST", "/api/v1/customers", a));
    },
  },
  {
    name: "list_quotes",
    title: "Cenové ponuky",
    description: "Cenové ponuky firmy od najnovšej.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      const r = await nutne(
        await volaj("GET", `/api/v1/quotes${qs({ status: a?.status, limit: a?.limit })}`),
      );
      return {
        ponuky: (r.data ?? []).map((q: any) => ({
          id: q.id,
          cislo: q.quote_number,
          stav: q.status,
          odberatel: q.customer_name,
          vystavena: q.issue_date,
          platnost_do: q.valid_until,
          spolu: Number(q.total),
          mena: q.currency,
        })),
      };
    },
  },
  {
    name: "list_purchase_invoices",
    title: "Prijaté faktúry",
    description: "Prijaté faktúry od dodávateľov. Dátumy vystavenia vo formáte RRRR-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        issued_from: { type: "string" },
        issued_to: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      const r = await nutne(
        await volaj(
          "GET",
          `/api/v1/purchase-invoices${qs({ issued_from: a?.issued_from, issued_to: a?.issued_to, limit: a?.limit })}`,
        ),
      );
      return { prijate: r.data ?? [], ma_dalsie: !!r.has_more };
    },
  },
  {
    name: "list_bank_accounts",
    title: "Bankové účty",
    description: "Bankové účty firmy so zostatkom zo synchronizácie s bankou.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(_a, volaj) {
      return nutne(await volaj("GET", "/api/v1/bank-accounts"));
    },
  },
  {
    name: "list_bank_transactions",
    title: "Pohyby na účtoch",
    description:
      "Pohyby na bankových účtoch (príchodzie kladné, odchodzie záporné), so spárovanou faktúrou. Dátumy RRRR-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        date_from: { type: "string" },
        date_to: { type: "string" },
        bank_account_id: { type: "string", format: "uuid" },
        page: { type: "integer", minimum: 1, default: 1 },
        per_page: { type: "integer", minimum: 1, maximum: 200, default: 100 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj(
          "GET",
          `/api/v1/bank-transactions${qs({
            date_from: a?.date_from,
            date_to: a?.date_to,
            bank_account_id: a?.bank_account_id,
            page: a?.page,
            per_page: Math.min(Number(a?.per_page ?? 100) || 100, 200),
          })}`,
        ),
      );
    },
  },
];

type Sprava = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const odpoved = (id: Sprava["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const chyba = (id: Sprava["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/** Spracuje jednu správu JSON-RPC; notifikácia (bez id) nevracia nič. */
export async function spracujSpravu(s: Sprava, volaj: Volaj): Promise<object | null> {
  const jeNotifikacia = s.id === undefined || s.id === null;
  if (s?.jsonrpc !== "2.0" || typeof s.method !== "string") {
    return jeNotifikacia ? null : chyba(s?.id, -32600, "Neplatná požiadavka JSON-RPC.");
  }
  if (s.method.startsWith("notifications/")) return null;
  switch (s.method) {
    case "initialize": {
      const ziadana = String(s.params?.protocolVersion ?? "");
      return odpoved(s.id, {
        protocolVersion: PODPOROVANE.includes(ziadana) ? ziadana : MCP_VERZIA_PROTOKOLU,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "faktero", title: "Faktero", version: "1.0.0" },
        instructions:
          "Faktero je fakturačný a účtovný systém. Nástroje pracujú s údajmi jednej firmy, ku ktorej patrí API kľúč. Sumy sú v mene dokladu; faktúru vystavíš cez create_invoice, nikam sa neodošle. Odpovedaj v jazyku používateľa.",
      });
    }
    case "ping":
      return odpoved(s.id, {});
    case "tools/list":
      return odpoved(s.id, {
        tools: NASTROJE.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      });
    case "tools/call": {
      const n = NASTROJE.find((x) => x.name === s.params?.name);
      if (!n) return chyba(s.id, -32602, `Neznámy nástroj: ${String(s.params?.name ?? "")}`);
      try {
        const vysledok = await n.vykonaj(s.params?.arguments ?? {}, volaj);
        return odpoved(s.id, {
          content: [{ type: "text", text: JSON.stringify(vysledok) }],
          structuredContent: vysledok,
          isError: false,
        });
      } catch (e: any) {
        // Chyba nástroja patrí do výsledku — model ju uvidí a môže opraviť vstup.
        return odpoved(s.id, {
          content: [{ type: "text", text: String(e?.message ?? e) }],
          isError: true,
        });
      }
    }
    default:
      return jeNotifikacia ? null : chyba(s.id, -32601, `Metóda ${s.method} nie je podporovaná.`);
  }
}

const HLAVICKY = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-allow-methods": "POST, OPTIONS",
};

export async function obsluzMcp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HLAVICKY });
  if (request.method !== "POST") {
    // Stream zo servera (GET/SSE) nepodporujeme — klient má posielať POST.
    return new Response(null, { status: 405, headers: { ...HLAVICKY, allow: "POST, OPTIONS" } });
  }
  const kluc = await overApiKluc(request);
  if (!kluc) {
    return new Response(
      JSON.stringify(
        chyba(null, -32001, "Chýba alebo je neplatný API kľúč (Authorization: Bearer fk_…)."),
      ),
      {
        status: 401,
        headers: {
          ...HLAVICKY,
          // Odkaz na metadáta — claude.ai a ChatGPT podľa neho spustia prihlásenie cez OAuth.
          "www-authenticate": `Bearer realm="faktero", resource_metadata="${(process.env.FAKTERO_PUBLIC_URL || "https://www.faktero.sk").replace(/\/$/, "")}/.well-known/oauth-protected-resource/api/mcp"`,
          "access-control-expose-headers": "www-authenticate",
        },
      },
    );
  }
  let telo: unknown;
  try {
    telo = await request.json();
  } catch {
    return new Response(JSON.stringify(chyba(null, -32700, "Telo nie je platný JSON.")), {
      status: 400,
      headers: HLAVICKY,
    });
  }

  const auth = request.headers.get("authorization") ?? "";
  const volaj: Volaj = async (metoda, cesta, data) => {
    /*
      Priamo na tento server, nie cez verejnú adresu: za nginxom príde
      request.url ako http://… a presmerovanie na https by hlavičku
      Authorization zahodilo (iný pôvod).
    */
    const zaklad = `http://127.0.0.1:${process.env.PORT || process.env.NITRO_PORT || 3000}`;
    const r = await fetch(new URL(cesta, zaklad), {
      method: metoda,
      headers: {
        authorization: auth,
        accept: "application/json",
        "user-agent": "Faktero-MCP/1.0",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        ...(data !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };

  const davka = Array.isArray(telo);
  const spravy = (davka ? telo : [telo]) as Sprava[];
  const vysledky = (await Promise.all(spravy.map((s) => spracujSpravu(s, volaj)))).filter(Boolean);
  if (!vysledky.length) return new Response(null, { status: 202, headers: HLAVICKY });
  return new Response(JSON.stringify(davka ? vysledky : vysledky[0]), {
    status: 200,
    headers: HLAVICKY,
  });
}
