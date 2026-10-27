/*
  Klient Doklado Public API len na čítanie.

  Cesty sú v zozname natvrdo — `setExported` ani nič, čo do Doklada zapisuje,
  sa zavolať nedá ani omylom. Kľúč ide len do hlavičky `api_key` a nikam sa
  nevypisuje; protokol vidí cestu, stav a čas.
*/
import type { components } from "./doklado-api";

export type DokladV2 = components["schemas"]["DocumentV2"];
export type FakturaV2 = components["schemas"]["InvoiceV2"];
export type DokladAleboFaktura = DokladV2 | FakturaV2;
export type Organizacia = components["schemas"]["PublicOrganization"];
export type Nespracovany = components["schemas"]["UnprocessedDocumentPublicApi"];
export type Zmena = {
  createdAt?: string;
  createdBy?: { email?: string | null } | null;
  changedFields?: { field?: string; before?: string; after?: string }[];
};
export type Priloha = {
  documentId?: string;
  downloadUrl?: string;
  fileName?: string;
  fileType?: "primary" | "secondary";
};

export const ZAKLADNA_ADRESA = "https://api-gateway-prod-europe-west-1-7epuecvu.ew.gateway.dev";

/** Jediné cesty, ktoré skript smie volať. Všetky len čítajú. */
export const POVOLENE_CESTY = [
  "/v3/organization/manage/list",
  "/v2/documents",
  "/v2/documents/get",
  "/v2/documents/attachments/get",
  "/v1/documents/get-invoice-pdf",
  "/v1/unprocessed-documents",
  "/v2/documents/changes",
] as const;
export type Cesta = (typeof POVOLENE_CESTY)[number];

export class ChybaDoklada extends Error {
  constructor(
    message: string,
    readonly kod: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

type Odpoved = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: any;
  continuationToken?: string;
};

export class DokladoKlient {
  private posledne = 0;
  private readonly odstup: number;
  volani = 0;

  constructor(
    private readonly kluc: string,
    private readonly o: {
      adresa?: string;
      /** Najviac požiadaviek za sekundu. */
      zaSekundu?: number;
      log: (riadok: string) => void;
    },
  ) {
    if (!kluc) throw new Error("Chýba DOKLADO_API_KEY.");
    this.odstup = 1000 / (o.zaSekundu ?? 4);
  }

  async post(cesta: Cesta, data: Record<string, unknown>): Promise<Odpoved> {
    if (!(POVOLENE_CESTY as readonly string[]).includes(cesta)) {
      throw new Error(`Cesta ${cesta} nie je povolená — skript z Doklada len číta.`);
    }
    const url = `${this.o.adresa ?? ZAKLADNA_ADRESA}${cesta}`;
    for (let pokus = 1; ; pokus++) {
      const cakaj = this.posledne + this.odstup - Date.now();
      if (cakaj > 0) await spi(cakaj);
      this.posledne = Date.now();
      this.volani++;
      const zaciatok = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", api_key: this.kluc },
          body: JSON.stringify({ data }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (e) {
        if (pokus >= 6) throw e;
        this.o.log(`  ${cesta} sieť: ${(e as Error).message} — pokus ${pokus}, opakujem`);
        await spi(1000 * 2 ** pokus);
        continue;
      }
      const ms = Date.now() - zaciatok;
      if (res.status === 429 && /limit/i.test(await res.clone().text())) {
        // Vyčerpaný denný/mesačný limit API prepojenia — opakovanie nepomôže.
        throw new ChybaDoklada(
          `${cesta}: 429 — vyčerpaný limit API prepojenia v Doklade`,
          "LIMIT",
          429,
        );
      }
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        const pauza = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** pokus;
        this.o.log(
          `  ${cesta} ${res.status} (${ms} ms) — pokus ${pokus}, čakám ${Math.round(pauza / 1000)} s`,
        );
        if (pokus >= 8)
          throw new ChybaDoklada(
            `${cesta}: ${res.status} ani po ${pokus} pokusoch`,
            null,
            res.status,
          );
        await spi(pauza);
        continue;
      }
      const text = await res.text();
      let telo: Odpoved;
      try {
        telo = JSON.parse(text);
      } catch {
        throw new ChybaDoklada(
          `${cesta}: ${res.status}, odpoveď nie je JSON (${text.slice(0, 120)})`,
          null,
          res.status,
        );
      }
      this.o.log(`  ${cesta} ${res.status} ${telo.code ?? ""} (${ms} ms)`);
      if (!res.ok || telo.success === false) {
        throw new ChybaDoklada(
          `${cesta}: ${res.status} ${telo.code ?? ""} ${telo.message ?? ""}`.trim(),
          telo.code ?? null,
          res.status,
        );
      }
      return telo;
    }
  }

  async organizacie(): Promise<Organizacia[]> {
    const r = await this.post("/v3/organization/manage/list", {});
    const d = r.data;
    return (Array.isArray(d) ? d : (d?.documents ?? d?.organizations ?? [])) as Organizacia[];
  }

  /**
   * Všetky doklady firmy v období. Keď Doklado povie, že je ich na jeden
   * výber priveľa (APP_MAX_EXPORT_LIMIT_EXCEEDED), obdobie sa rozpolí.
   */
  async doklady(o: {
    ico: string;
    od: Date;
    do: Date;
    exportovane?: boolean;
  }): Promise<DokladAleboFaktura[]> {
    try {
      return await this.dokladyNaraz(o);
    } catch (e) {
      if (!(e instanceof ChybaDoklada) || e.kod !== "APP_MAX_EXPORT_LIMIT_EXCEEDED") throw e;
      const stred = new Date((o.od.getTime() + o.do.getTime()) / 2);
      if (o.do.getTime() - o.od.getTime() < 86400_000) throw e;
      this.o.log(`  priveľa dokladov ${iso(o.od)}–${iso(o.do)}, delím obdobie`);
      return [
        ...(await this.doklady({ ...o, do: stred })),
        ...(await this.doklady({ ...o, od: new Date(stred.getTime() + 1) })),
      ];
    }
  }

  /*
    Stránkuje sa cez `searchAfter` (continuationToken je podľa Doklada
    zastaraný): celé pole z odpovede ide bez úprav do ďalšej požiadavky.
  */
  private async dokladyNaraz(o: { ico: string; od: Date; do: Date; exportovane?: boolean }) {
    const vsetky: DokladAleboFaktura[] = [];
    let dalej: unknown[] | undefined;
    let predosle = "";
    for (let strana = 0; strana < 10_000; strana++) {
      let r: Odpoved & { searchAfter?: unknown[] };
      try {
        r = await this.post("/v2/documents", {
          organizationId: o.ico,
          dateFrom: o.od.toISOString(),
          dateTo: o.do.toISOString(),
          dateType: "issue",
          orderBy: "issue_date",
          resourceTypes: ["receipt", "invoice"],
          ...(o.exportovane === undefined ? {} : { isExported: o.exportovane }),
          ...(dalej ? { searchAfter: dalej } : {}),
        });
      } catch (e) {
        if (e instanceof ChybaDoklada && e.kod === "APP_NO_MORE_DATA") break;
        throw e;
      }
      const data = (r.data ?? []) as DokladAleboFaktura[];
      vsetky.push(...data);
      const token = JSON.stringify(r.searchAfter ?? null);
      if (
        r.code === "APP_NO_MORE_DATA" ||
        !data.length ||
        !r.searchAfter?.length ||
        token === predosle
      )
        break;
      predosle = token;
      dalej = r.searchAfter;
    }
    return vsetky;
  }

  /** Nespracované doklady (ešte nevyťažené v Doklade), stránkované cez searchAfter. */
  async nespracovane(o: { ico: string; od: Date; do: Date }): Promise<Nespracovany[]> {
    const vsetky: Nespracovany[] = [];
    let dalej: unknown[] | undefined;
    let predosle = "";
    for (let strana = 0; strana < 10_000; strana++) {
      let r: Odpoved & { searchAfter?: unknown[] };
      try {
        r = await this.post("/v1/unprocessed-documents", {
          organizationId: o.ico,
          dateType: "create",
          orderBy: "creation_date",
          dateFrom: o.od.toISOString(),
          dateTo: o.do.toISOString(),
          ...(dalej ? { searchAfter: dalej } : {}),
        });
      } catch (e) {
        if (e instanceof ChybaDoklada && e.kod === "APP_NO_MORE_DATA") break;
        throw e;
      }
      const d = r.data ?? {};
      const data = (Array.isArray(d) ? d : (d.documents ?? [])) as Nespracovany[];
      vsetky.push(...data);
      const sa = (r.searchAfter ?? d.searchAfter) as unknown[] | undefined;
      const token = JSON.stringify(sa ?? null);
      if (r.code === "APP_NO_MORE_DATA" || !data.length || !sa?.length || token === predosle) break;
      predosle = token;
      dalej = sa;
    }
    return vsetky;
  }

  /** História zmien — najviac 10 dokladov na volanie (1 jednotka za doklad). */
  async zmeny(documentIds: string[]): Promise<Map<string, Zmena[]>> {
    const von = new Map<string, Zmena[]>();
    for (let i = 0; i < documentIds.length; i += 10) {
      const r = await this.post("/v2/documents/changes", {
        documents: documentIds.slice(i, i + 10).map((documentId) => ({ documentId })),
      });
      const d = r.data;
      const zoznam = (Array.isArray(d) ? d : (d?.documents ?? d?.history ?? [])) as {
        documentId?: string;
        changes?: Zmena[];
      }[];
      for (const h of zoznam) if (h.documentId) von.set(h.documentId, h.changes ?? []);
    }
    return von;
  }

  async prilohyNespracovaneho(documentId: string): Promise<Priloha[]> {
    const r = await this.post("/v2/documents/attachments/get", {
      requestDocumentsAttachments: [{ documentType: "unprocessed_document", documentId }],
    });
    return (Array.isArray(r.data) ? r.data : []) as Priloha[];
  }

  async detail(documentId: string): Promise<DokladAleboFaktura | null> {
    const r = await this.post("/v2/documents/get", { documentId });
    return (r.data ?? null) as DokladAleboFaktura | null;
  }

  async prilohy(documentId: string): Promise<Priloha[]> {
    const r = await this.post("/v2/documents/attachments/get", {
      requestDocumentsAttachments: [{ documentType: "expense", documentId }],
    });
    return (Array.isArray(r.data) ? r.data : []) as Priloha[];
  }

  async pdfFaktury(
    ico: string,
    documentId: string,
  ): Promise<{ bajty: Uint8Array; mime: string } | null> {
    const r = await this.post("/v1/documents/get-invoice-pdf", { organizationId: ico, documentId });
    const d = r.data;
    if (!d?.data) return null;
    return {
      bajty: Uint8Array.from(Buffer.from(String(d.data), "base64")),
      mime: d["Content-Type"] || "application/pdf",
    };
  }
}

export function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function spi(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
