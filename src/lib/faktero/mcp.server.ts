/**
 * MCP server Faktera — napojenie AI asistentov (Claude, ChatGPT, Cursor…)
 * na údaje firmy. Protokol Model Context Protocol, JSON-RPC 2.0 cez HTTP
 * (Streamable HTTP bez relácie: každá požiadavka je samostatná).
 *
 * Prihlásenie je ten istý API kľúč ako pri /api/v1 (`Authorization: Bearer`).
 * Každý nástroj volá existujúce REST API s tým istým kľúčom — overenie dát,
 * predplatné, záznam v API logu aj práva firmy ostávajú jedny. Nástroje nič
 * neposielajú von (e-mail, eFaktúra) a mažú len ručne pridanú úhradu prijatej
 * faktúry (`delete_purchase_invoice_payment`, označený ako deštruktívny);
 * zapisujúce sú označené, aby si ich klient dal potvrdiť.
 */
import { overApiKluc } from "./api-auth.server";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
export const MCP_VERZIA_PROTOKOLU = "2025-06-18";
const PODPOROVANE = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Volaj = (
  metoda: "GET" | "POST" | "PUT" | "DELETE",
  cesta: string,
  telo?: unknown,
  /** Firma pri kľúči účtu (hlavička X-Company) — id alebo IČO. */
  firma?: string,
) => Promise<{ status: number; json: any }>;

/** Kľúč účtu: firmy, ku ktorým smie. Kľúč firmy: `ucet: false`. */
export type KontextKluca = {
  ucet: boolean;
  firmy: { id: string; name: string; ico: string | null }[];
};

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

/** Položka vystavenej faktúry — navyše zľava riadku a prenesenie pri položke. */
const POLOZKA_FAKTURY = {
  ...POLOZKA,
  properties: {
    ...POLOZKA.properties,
    discount_percent: { type: "number", description: "Zľava riadku v % (cena ostáva pôvodná)" },
    prenesenie: {
      type: "boolean",
      description: "Prenesenie daňovej povinnosti len pri tejto položke (DPH riadku 0)",
    },
  },
};

/** Pracovné značky dokladu — stav, štítky, komentár (do účtovníctva nejdú). */
const ZNACKY = {
  stav: {
    type: "string",
    description: "Vlastný stav dokladu podľa názvu (z list_document_labels); prázdny text ho zruší",
  },
  stitky: {
    type: "array",
    items: { type: "string" },
    maxItems: 5,
    description: "Štítky — nahradia celý zoznam (najviac 5)",
  },
  komentar: { type: "string", description: "Komentár pre ľudí vo firme, do účtovníctva nejde" },
};

const ZAUCTOVANIE = {
  type: "object",
  description: "Účtovné kódy (z list_accounting_codes)",
  properties: {
    predkontacia: { type: "string" },
    clenenie_dph: { type: "string" },
    kv_clenenie: { type: "string" },
    stredisko: { type: "string" },
    cinnost: { type: "string" },
  },
};

const CESTA_DOKLADU: Record<string, string> = {
  invoice: "/api/v1/invoices",
  purchase_invoice: "/api/v1/purchase-invoices",
  receipt: "/api/v1/receipts",
};

const cestaDokladu = (typ: unknown, id: unknown) => {
  const zaklad = CESTA_DOKLADU[String(typ)];
  if (!zaklad) throw new Error("document_type musí byť invoice, purchase_invoice alebo receipt.");
  return `${zaklad}/${encodeURIComponent(String(id ?? ""))}`;
};

/** Z odpovede len to, čo sa značkami a zaúčtovaním zmenilo. */
const znackyStrucne = (r: any) => ({
  id: r.id,
  stav_id: r.stav_id ?? null,
  stitky: r.stitky ?? [],
  komentar: r.komentar ?? null,
  int_poznamka: r.int_poznamka ?? null,
  predkontacia: r.pohoda_predkontacia ?? undefined,
  clenenie_dph: r.pohoda_clenenie_dph ?? undefined,
  kv_clenenie: r.kv_clenenie ?? undefined,
});

/** Zoznam firiem kľúča — pri kľúči účtu prvý krok, pri kľúči firmy jedna firma. */
const LIST_COMPANIES: Nastroj = {
  name: "list_companies",
  title: "Firmy",
  description:
    "Firmy, s ktorými môžeš pracovať (id, názov, IČO). Pri kľúči pre viac firiem pošli v ostatných nástrojoch parameter company (id alebo IČO).",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true, openWorldHint: false },
  async vykonaj(_a, volaj) {
    return nutne(await volaj("GET", "/api/v1/companies"));
  },
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
      const dnes = dnesBratislava();
      // Všetky stránky (po 200), nie len prvých 200 v stave.
      const vsetky = async (stav: string) => {
        const out: any[] = [];
        for (let offset = 0; offset < 5000; offset += 200) {
          const r = await nutne(
            await volaj("GET", `/api/v1/invoices?status=${stav}&limit=200&offset=${offset}`),
          );
          const d = (r.data ?? []) as any[];
          out.push(...d);
          if (d.length < 200) break;
        }
        return out;
      };
      const [vyst, odosl] = await Promise.all([vsetky("issued"), vsetky("sent")]);
      const { jePoSplatnosti } = await import("./faktury-sumy");
      // Dobropis a daňový doklad k platbe nie sú dlh — rovnaké pravidlo ako prehľad.
      const po = [...vyst, ...odosl]
        .filter((f: any) => jePoSplatnosti(f, dnes))
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
        currency: {
          type: "string",
          description:
            "Mena (EUR, CZK, USD…); bez nej mena firmy. Cudzia mena dostane kurz ECB/ČNB.",
        },
        notes: { type: "string" },
        reverse_charge: {
          type: "boolean",
          description: "Prenesenie daňovej povinnosti na celej faktúre (DPH 0)",
        },
        reverse_charge_type: {
          type: "string",
          enum: ["domestic_69", "eu_b2b", "export"],
          description:
            "Druh prenesenia: tuzemské § 69, dodanie do EÚ, vývoz; predvolene domestic_69",
        },
        discount_type: {
          type: "string",
          enum: ["percent", "amount"],
          description: "Zľava na celý doklad: percento alebo suma bez DPH",
        },
        discount_value: { type: "number" },
        items: { type: "array", minItems: 1, items: POLOZKA_FAKTURY },
        dodaci_list: {
          type: "boolean",
          description: "Faktúra slúži zároveň ako dodací list (podpisy odovzdania a prevzatia)",
        },
        zobrazit_peciatku: {
          type: "boolean",
          description: "Pečiatka a podpis v PDF; bez parametra podľa nastavenia firmy",
        },
        accounting: ZAUCTOVANIE,
        int_poznamka: { type: "string", description: "Účtovná poznámka" },
        ...ZNACKY,
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
      "Pohyby na bankových účtoch (príchodzie kladné, odchodzie záporné), so spárovanou faktúrou a stavom (stav: sparovany, bez_dokladu, transakcna_dan, nesparovany). Dátumy RRRR-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        date_from: { type: "string" },
        date_to: { type: "string" },
        bank_account_id: { type: "string", format: "uuid" },
        state: {
          type: "string",
          enum: ["sparovany", "bez_dokladu", "transakcna_dan", "nesparovany"],
          description: "Len pohyby v tomto stave",
        },
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
            state: a?.state,
            page: a?.page,
            per_page: Math.min(Number(a?.per_page ?? 100) || 100, 200),
          })}`,
        ),
      );
    },
  },
  {
    name: "create_purchase_invoice",
    title: "Založiť prijatú faktúru",
    description:
      "Zapíše prijatú (dodávateľskú) faktúru. Sumy buď z položiek (items, ceny bez DPH), alebo amount_total (+ amount_without_vat, vat_amount). Dodávateľ sa založí v adresári, ak tam nie je. Tá istá faktúra (IČO + číslo + suma) sa druhýkrát nezaloží.",
    inputSchema: {
      type: "object",
      properties: {
        invoice_number: { type: "string", description: "Číslo faktúry dodávateľa" },
        supplier: {
          type: "object",
          properties: {
            name: { type: "string" },
            ico: { type: "string" },
            dic: { type: "string" },
            ic_dph: { type: "string" },
            iban: { type: "string" },
            street: { type: "string" },
            city: { type: "string" },
            zip: { type: "string" },
            country: { type: "string", description: "Kód krajiny, napr. SK" },
          },
          required: ["name"],
        },
        issue_date: { type: "string", description: "RRRR-MM-DD" },
        delivery_date: { type: "string" },
        due_date: { type: "string" },
        currency: { type: "string" },
        variable_symbol: { type: "string" },
        payment_method: { type: "string", enum: ["prevod", "hotovost", "karta"] },
        items: { type: "array", items: POLOZKA },
        amount_without_vat: { type: "number" },
        vat_amount: { type: "number" },
        amount_total: { type: "number" },
        payment_date: { type: "string", description: "Dátum úhrady, ak je už zaplatená" },
        note: { type: "string" },
        external_id: { type: "string", description: "Vlastné id — opakované volanie nič nezdvojí" },
        accounting: ZAUCTOVANIE,
        int_poznamka: { type: "string", description: "Účtovná poznámka" },
        buyer: {
          type: "object",
          description:
            "Odberateľ z dokladu (voliteľné). Keď nesedí na firmu, faktúra dostane príznak odberatel_nesedi a nedá sa zaúčtovať.",
          properties: {
            name: { type: "string" },
            ico: { type: "string" },
            dic: { type: "string" },
            ic_dph: { type: "string" },
          },
        },
        ...ZNACKY,
      },
      required: ["invoice_number", "supplier", "issue_date"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(await volaj("POST", "/api/v1/purchase-invoices", a));
    },
  },
  {
    name: "mark_purchase_invoice_paid",
    title: "Uhradiť prijatú faktúru",
    description: "Označí prijatú faktúru ako zaplatenú k dátumu (predvolene dnes).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id prijatej faktúry" },
        payment_date: { type: "string", description: "RRRR-MM-DD" },
      },
      required: ["id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      const datum = a.payment_date || dnesBratislava();
      return nutne(
        await volaj("PUT", `/api/v1/purchase-invoices/${encodeURIComponent(a.id)}`, {
          payment_date: datum,
        }),
      );
    },
  },
  {
    name: "create_receipt",
    title: "Zapísať bloček",
    description:
      "Zapíše bloček (výdavkový doklad): dodávateľ, dátum, suma s DPH, prípadne rozpis DPH po sadzbách a spôsob úhrady.",
    inputSchema: {
      type: "object",
      properties: {
        supplier: {
          type: "object",
          properties: {
            name: { type: "string" },
            ico: { type: "string" },
            ic_dph: { type: "string" },
          },
        },
        document_number: { type: "string" },
        issue_date: { type: "string", description: "RRRR-MM-DD" },
        total_amount: { type: "number", description: "Suma s DPH" },
        vat_breakdown: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rate: { type: "number" },
              base: { type: "number" },
              vat: { type: "number" },
            },
            required: ["rate", "base", "vat"],
          },
        },
        payment_method: { type: "string", enum: ["hotovost", "karta", "prevod"] },
        note: { type: "string" },
        external_id: { type: "string" },
        accounting: ZAUCTOVANIE,
        int_poznamka: { type: "string", description: "Účtovná poznámka" },
        ...ZNACKY,
      },
      required: ["issue_date", "total_amount"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(await volaj("POST", "/api/v1/receipts", { supplier: {}, ...a }));
    },
  },
  {
    name: "import_contacts",
    title: "Preniesť kontakty",
    description:
      "Hromadne prenesie odberateľov/dodávateľov (do 1000). Páruje podľa external_id, IČO, bez IČO podľa mena; existujúce len doplní (update_existing: true ich prepíše).",
    inputSchema: {
      type: "object",
      properties: {
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              ico: { type: "string" },
              dic: { type: "string" },
              ic_dph: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              street: { type: "string" },
              city: { type: "string" },
              zip: { type: "string" },
              country: { type: "string" },
              iban: { type: "string" },
              customer: { type: "boolean", description: "Odberateľ (predvolene áno)" },
              supplier: { type: "boolean", description: "Dodávateľ" },
              external_id: { type: "string" },
            },
            required: ["name"],
          },
        },
        update_existing: { type: "boolean" },
      },
      required: ["contacts"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      return nutne(await volaj("POST", "/api/v1/customers/import", a));
    },
  },
  {
    name: "list_products",
    title: "Cenník",
    description: "Produkty a služby z cenníka firmy (q = hľadanie v názve a kóde).",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" }, limit: { type: "number" } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj(
          "GET",
          `/api/v1/products${qs({ q: a.q, limit: a.limit ?? 50, active: "true" })}`,
        ),
      );
    },
  },
  {
    name: "create_product",
    title: "Pridať do cenníka",
    description: "Pridá produkt alebo službu do cenníka (cena bez DPH).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        code: { type: "string" },
        unit: { type: "string" },
        unit_price: { type: "number", description: "Cena bez DPH" },
        vat_rate: { type: "number" },
        description: { type: "string" },
        external_id: { type: "string" },
      },
      required: ["name"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(await volaj("POST", "/api/v1/products", a));
    },
  },
  {
    name: "create_bank_account",
    title: "Pridať bankový účet",
    description:
      "Pridá bankový účet bez napojenia na banku (prenos z iného programu). Pohyby naň posiela import_bank_transactions.",
    inputSchema: {
      type: "object",
      properties: {
        iban: { type: "string" },
        name: { type: "string" },
        currency: { type: "string" },
        balance: { type: "number", description: "Aktuálny zostatok" },
      },
      required: ["iban"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(await volaj("POST", "/api/v1/bank-accounts", a));
    },
  },
  {
    name: "import_bank_transactions",
    title: "Preniesť bankové pohyby",
    description:
      "Zapíše pohyby na účet založený cez create_bank_account (nie na účet napojený na banku). Duplicity sa preskočia.",
    inputSchema: {
      type: "object",
      properties: {
        bank_account_id: { type: "string" },
        transactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              booking_date: { type: "string", description: "RRRR-MM-DD" },
              amount: { type: "number", description: "Kladná príjem, záporná výdaj" },
              variable_symbol: { type: "string" },
              counterparty: { type: "string" },
              counterparty_iban: { type: "string" },
              description: { type: "string" },
              reference: { type: "string", description: "Jedinečné id pohybu" },
            },
            required: ["booking_date", "amount"],
          },
        },
        balance: { type: "number" },
      },
      required: ["bank_account_id", "transactions"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      const { bank_account_id, ...telo } = a;
      return nutne(
        await volaj(
          "POST",
          `/api/v1/bank-accounts/${encodeURIComponent(bank_account_id)}/transactions`,
          telo,
        ),
      );
    },
  },
  {
    name: "create_company",
    title: "Založiť firmu",
    description:
      "Založí novú firmu pod tvojím účtom (len s kľúčom pre viac firiem). Budeš jej vlastník.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        ico: { type: "string" },
        dic: { type: "string" },
        ic_dph: { type: "string" },
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
        country: { type: "string", enum: ["SK", "CZ", "DE"] },
        email: { type: "string" },
        iban: { type: "string" },
        vat_payer: { type: "boolean" },
      },
      required: ["name"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(await volaj("POST", "/api/v1/companies", a));
    },
  },
  {
    name: "list_company_members",
    title: "Používatelia firmy",
    description: "Používatelia firmy (e-mail, rola) a čakajúce pozvánky.",
    inputSchema: {
      type: "object",
      properties: { company_id: { type: "string", description: "id firmy z list_companies" } },
      required: ["company_id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj("GET", `/api/v1/companies/${encodeURIComponent(a.company_id)}/members`),
      );
    },
  },
  {
    name: "invite_user",
    title: "Pozvať používateľa",
    description:
      "Pošle pozvánku do firmy e-mailom (rola admin, accountant = účtovník, employee). Len s kľúčom pre viac firiem a ak si vo firme vlastník alebo admin.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "id firmy z list_companies" },
        email: { type: "string" },
        role: { type: "string", enum: ["admin", "accountant", "employee"] },
      },
      required: ["company_id", "email", "role"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async vykonaj(a, volaj) {
      const { company_id, ...telo } = a;
      return nutne(
        await volaj(
          "POST",
          `/api/v1/companies/${encodeURIComponent(company_id)}/invitations`,
          telo,
        ),
      );
    },
  },
  {
    name: "list_purchase_invoice_payments",
    title: "Úhrady prijatej faktúry",
    description:
      "Úhrady prijatej faktúry (aj čiastočné) so súhrnom: koľko treba uhradiť, koľko je uhradené, koľko zostáva a stav (paid, partially_paid, unpaid).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id prijatej faktúry" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj("GET", `/api/v1/purchase-invoices/${encodeURIComponent(a.id)}/payments`),
      );
    },
  },
  {
    name: "add_purchase_invoice_payment",
    title: "Pridať úhradu prijatej faktúry",
    description:
      "Zapíše úhradu prijatej faktúry — aj čiastočnú. Keď súčet úhrad dosiahne sumu faktúry, faktúra je uhradená.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id prijatej faktúry" },
        amount: { type: "number", description: "Uhradená suma (kladná, v mene faktúry)" },
        paid_at: { type: "string", description: "Dátum úhrady RRRR-MM-DD, predvolene dnes" },
        method: { type: "string", enum: ["prevod", "hotovost", "karta"] },
        note: { type: "string" },
        external_id: { type: "string", description: "Vlastné id — opakované volanie nič nezdvojí" },
      },
      required: ["id", "amount"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async vykonaj(a, volaj) {
      const { id, ...telo } = a;
      return nutne(
        await volaj("POST", `/api/v1/purchase-invoices/${encodeURIComponent(id)}/payments`, telo),
      );
    },
  },
  {
    name: "delete_purchase_invoice_payment",
    title: "Zmazať úhradu prijatej faktúry",
    description:
      "Zmaže ručne pridanú úhradu prijatej faktúry (id úhrady z list_purchase_invoice_payments). Úhradu zo spárovaného bankového pohybu zmazať nejde.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id prijatej faktúry" },
        payment_id: { type: "string", description: "id úhrady" },
      },
      required: ["id", "payment_id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj(
          "DELETE",
          `/api/v1/purchase-invoices/${encodeURIComponent(a.id)}/payments/${encodeURIComponent(a.payment_id)}`,
        ),
      );
    },
  },
  {
    name: "list_document_labels",
    title: "Stavy dokladov a štítky",
    description:
      "Vlastné stavy dokladov firmy (napr. „Skontrolovať“) a číselník štítkov — na výber v update_document_labels.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(_a, volaj) {
      const [stavy, stitky] = await Promise.all([
        volaj("GET", "/api/v1/document-states").then(nutne),
        volaj("GET", "/api/v1/tags").then(nutne),
      ]);
      return { stavy: stavy.data ?? [], stitky: stitky.data ?? [] };
    },
  },
  {
    name: "update_document_labels",
    title: "Stav, štítky a komentár dokladu",
    description:
      "Nastaví vlastný stav, štítky alebo komentár vystavenej faktúry, prijatej faktúry či bločku. Mení sa aj na doklade odovzdanom do účtovníctva — do účtovníctva nejdú.",
    inputSchema: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: ["invoice", "purchase_invoice", "receipt"] },
        id: { type: "string" },
        ...ZNACKY,
        stitky_pridat: { type: "string", description: "Pridá jeden štítok" },
        stitky_odobrat: { type: "string", description: "Odoberie jeden štítok" },
      },
      required: ["document_type", "id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      const { document_type, id, ...telo } = a;
      return znackyStrucne(await nutne(await volaj("PUT", cestaDokladu(document_type, id), telo)));
    },
  },
  {
    name: "set_document_accounting",
    title: "Zaúčtovať doklad",
    description:
      "Nastaví účtovné kódy (predkontácia, členenie DPH, KV, stredisko, činnosť) a účtovnú poznámku na vystavenej faktúre, prijatej faktúre alebo bločku. Odovzdaný doklad treba najprv vrátiť z účtovníctva.",
    inputSchema: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: ["invoice", "purchase_invoice", "receipt"] },
        id: { type: "string" },
        accounting: {
          ...ZAUCTOVANIE,
          properties: {
            ...ZAUCTOVANIE.properties,
            booked: { type: "boolean", description: "true = doklad je zaúčtovaný" },
          },
        },
        int_poznamka: { type: "string", description: "Účtovná poznámka" },
      },
      required: ["document_type", "id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      const { document_type, id, accounting, int_poznamka } = a;
      return znackyStrucne(
        await nutne(
          await volaj("PUT", cestaDokladu(document_type, id), {
            ...(accounting ? { accounting } : {}),
            ...(int_poznamka !== undefined ? { int_poznamka } : {}),
          }),
        ),
      );
    },
  },
  {
    name: "list_accounting_codes",
    title: "Predkontácie a členenia",
    description:
      "Číselník firmy: predkontácie, členenia DPH, strediská, činnosti a číselné rady (kind). document_type (faktura/blocek) a payment_type (hotovost/karta/prevod) vrátia kódy pre ten typ a tie, ktoré typ neurčujú.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["predkontacia", "clenenie_dph", "stredisko", "cinnost", "ciselny_rad"],
        },
        document_type: { type: "string", enum: ["faktura", "blocek"] },
        payment_type: { type: "string", enum: ["hotovost", "karta", "prevod"] },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 500 },
        offset: { type: "integer", minimum: 0 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj(
          "GET",
          `/api/v1/accounting-codes${qs({
            kind: a?.kind,
            document_type: a?.document_type,
            payment_type: a?.payment_type,
            limit: a?.limit,
            offset: a?.offset,
          })}`,
        ),
      );
    },
  },
  {
    name: "list_accounting_templates",
    title: "Predlohy zaúčtovania",
    description:
      "Pomenované predlohy zaúčtovania firmy (predkontácia, členenie DPH, KV, pokladňa, rad, poznámka). document_kind: blocek, prijata, vystavena.",
    inputSchema: {
      type: "object",
      properties: {
        document_kind: { type: "string", enum: ["blocek", "prijata", "vystavena"] },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj(
          "GET",
          `/api/v1/accounting-templates${qs({ document_kind: a?.document_kind })}`,
        ),
      );
    },
  },
  {
    name: "resolve_bank_transaction",
    title: "Vybaviť pohyb bez dokladu",
    description:
      "Označí nespárovaný bankový pohyb ako vybavený bez dokladu: bez_dokladu (poplatok, mzda, odvod…) alebo transakcna_dan. resolution null označenie zruší. Spárovaný pohyb sa označiť nedá.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id pohybu z list_bank_transactions" },
        resolution: { type: ["string", "null"], enum: ["bez_dokladu", "transakcna_dan", null] },
        note: { type: "string", description: "Poznámka (do 200 znakov)" },
      },
      required: ["id", "resolution"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async vykonaj(a, volaj) {
      return nutne(
        await volaj("POST", `/api/v1/bank-transactions/${encodeURIComponent(a.id)}/resolution`, {
          resolution: a.resolution ?? null,
          ...(a.note ? { note: a.note } : {}),
        }),
      );
    },
  },
];

/** Nástroje, kde firma ide v adrese (company_id), nie v hlavičke X-Company. */
const BEZ_FIRMY = new Set([
  "list_companies",
  "create_company",
  "list_company_members",
  "invite_user",
]);

type Sprava = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const odpoved = (id: Sprava["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const chyba = (id: Sprava["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/** Parameter `company` pri kľúči účtu — povinný, keď má kľúč viac firiem. */
function schemaSFirmou(schema: Record<string, any>, kontext: KontextKluca) {
  const viac = kontext.firmy.length > 1;
  return {
    ...schema,
    properties: {
      company: {
        type: "string",
        description: `Firma — id alebo IČO z list_companies.${viac ? "" : " Nepovinné, kľúč má jednu firmu."}`,
      },
      ...(schema.properties ?? {}),
    },
    ...(viac
      ? { required: [...new Set(["company", ...((schema.required as string[]) ?? [])])] }
      : {}),
  };
}

/** Spracuje jednu správu JSON-RPC; notifikácia (bez id) nevracia nič. */
export async function spracujSpravu(
  s: Sprava,
  volaj: Volaj,
  kontext: KontextKluca = { ucet: false, firmy: [] },
): Promise<object | null> {
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
        instructions: kontext.ucet
          ? "Faktero je fakturačný a účtovný systém. Kľúč platí pre viac firiem: najprv zavolaj list_companies a v každom ďalšom nástroji pošli company (id alebo IČO). Keď nie je jasné, o ktorú firmu ide, opýtaj sa. Sumy sú v mene dokladu; faktúru vystavíš cez create_invoice, nikam sa neodošle. Odpovedaj v jazyku používateľa."
          : "Faktero je fakturačný a účtovný systém. Nástroje pracujú s údajmi jednej firmy, ku ktorej patrí API kľúč. Sumy sú v mene dokladu; faktúru vystavíš cez create_invoice, nikam sa neodošle. Odpovedaj v jazyku používateľa.",
      });
    }
    case "ping":
      return odpoved(s.id, {});
    case "tools/list":
      return odpoved(s.id, {
        tools: [LIST_COMPANIES, ...NASTROJE].map(
          ({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema:
              kontext.ucet && !BEZ_FIRMY.has(name)
                ? schemaSFirmou(inputSchema, kontext)
                : inputSchema,
            annotations,
          }),
        ),
      });
    case "tools/call": {
      const n = [LIST_COMPANIES, ...NASTROJE].find((x) => x.name === s.params?.name);
      if (!n) return chyba(s.id, -32602, `Neznámy nástroj: ${String(s.params?.name ?? "")}`);
      try {
        // `company` nie je súčasť vstupu nástroja — ide do hlavičky X-Company.
        const { company, ...argumenty } = (s.params?.arguments ?? {}) as Record<string, unknown>;
        const firma = typeof company === "string" && company.trim() ? company.trim() : undefined;
        const volajFirmu: Volaj = (m, c, d) => volaj(m, c, d, firma);
        const vysledok = await n.vykonaj(argumenty, volajFirmu);
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
    // Človek v prehliadači dostane návod, nie holú chybu 405.
    if (request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html")) {
      return new Response(null, { status: 302, headers: { location: "/docs/api#mcp" } });
    }
    // Stream zo servera (GET/SSE) nepodporujeme — klient má posielať POST.
    return new Response(null, { status: 405, headers: { ...HLAVICKY, allow: "POST, OPTIONS" } });
  }
  // Firmu MCP nevyberá — nástroje ju posielajú pri každom volaní (kľúč účtu).
  const kluc = await overApiKluc(request, { bezFirmy: true });
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
  const volaj: Volaj = async (metoda, cesta, data, firma) => {
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
        ...(firma ? { "x-company": firma } : {}),
        ...(data !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };

  const davka = Array.isArray(telo);
  const spravy = (davka ? telo : [telo]) as Sprava[];
  const kontext: KontextKluca = { ucet: kluc.ucet, firmy: kluc.firmy };
  const vysledky = (await Promise.all(spravy.map((s) => spracujSpravu(s, volaj, kontext)))).filter(
    Boolean,
  );
  if (!vysledky.length) return new Response(null, { status: 202, headers: HLAVICKY });
  return new Response(JSON.stringify(davka ? vysledky : vysledky[0]), {
    status: 200,
    headers: HLAVICKY,
  });
}
