import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { overPristup } from "./over-pristup";
import type { OdoslanyMail, StavMailu, TypDokladu } from "./odoslane-maily";

/*
  Nastavenia → Odoslané e-maily. Evidenciu (`odosielanie_mailov`,
  `odosielanie_zablokovane`) číta len server — klient k nej práva nemá —
  a vydá ju správcovi firmy (majiteľ, admin, účtovník), lebo obsahuje adresy
  všetkých odberateľov, pozvaných ľudí aj účtovníka. Pred 17. 10. 2026 sa
  doplní z denníkov faktúr, ponúk a upomienok.
*/
const Vstup = z.object({
  company_id: z.string().uuid(),
  od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const posunDen = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString();
};

export const odoslaneMailyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vsetkyRiadky } = await import("./strankovanie");
    const m = await import("./odoslane-maily");
    const { stropyFirmy } = await import("./ochrana-odosielania.server");
    const db = supabaseAdmin as any;
    const firma = data.company_id;

    // Deň navyše na oboch koncoch — presne podľa bratislavského dňa filtruje `vObdobi`.
    const od = posunDen(data.od < data.do ? data.od : data.do, -1);
    const po = posunDen(data.od < data.do ? data.do : data.od, 2);
    const rozsah = { od: data.od < data.do ? data.od : data.do, do: data.od < data.do ? data.do : data.od };
    const zaciatok = m.ZACIATOK_EVIDENCIE;

    type Surovy = Omit<OdoslanyMail, "doklad" | "odberatel" | "kto"> & {
      dokladId: string | null;
      userId: string | null;
    };
    const riadky: Surovy[] = [];

    // 1. Evidencia strážcu. Stĺpce chyba/cez pribudli migráciou 20261103150000 —
    //    kým nie je aplikovaná, číta sa bez nich.
    const evidencia = async (stlpce: string) =>
      vsetkyRiadky<any>((a, b) =>
        db
          .from("odosielanie_mailov")
          .select(stlpce)
          .eq("company_id", firma)
          .gte("created_at", od > zaciatok ? od : zaciatok)
          .lt("created_at", po)
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      );
    const zakladStlpce = "id, created_at, druh, doklad_id, adresati, pocet, predmet, stav, user_id";
    let nove: any[];
    try {
      nove = await evidencia(`${zakladStlpce}, chyba, cez`);
    } catch {
      nove = await evidencia(zakladStlpce);
    }
    for (const r of nove) {
      riadky.push({
        id: r.id,
        cas: r.created_at,
        druh: r.druh,
        adresati: (r.adresati ?? []).map((x: string) => String(x).toLowerCase()),
        pocet: r.pocet ?? 0,
        stav: r.stav as StavMailu,
        predmet: r.predmet ?? null,
        chyba: r.chyba ?? null,
        cez: r.cez ?? null,
        dokladId: r.doklad_id ?? null,
        userId: r.user_id ?? null,
        zdroj: "evidencia",
      });
    }

    // 2. Zastavené pokusy (adresy strážca neukladá, len ich počet).
    const zastavene = await vsetkyRiadky<any>((a, b) =>
      db
        .from("odosielanie_zablokovane")
        .select("id, created_at, druh, dovod, detail, predmet, adresati_pocet, user_id")
        .eq("company_id", firma)
        .eq("len_vystraha", false)
        .gte("created_at", od)
        .lt("created_at", po)
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b),
    );
    for (const r of zastavene) {
      riadky.push({
        id: r.id,
        cas: r.created_at,
        druh: r.druh ?? "",
        adresati: [],
        pocet: r.adresati_pocet ?? 0,
        stav: "zastavene",
        predmet: r.predmet ?? null,
        chyba: r.detail || r.dovod || null,
        cez: null,
        dokladId: null,
        userId: r.user_id ?? null,
        zdroj: "evidencia",
      });
    }

    // 3. Pred spustením evidencie: denníky faktúr, ponúk a upomienok.
    if (od < zaciatok) {
      const stary = (stav: string | null): StavMailu =>
        stav === "failed" ? "zlyhalo" : "odoslane";
      const doZac = po < zaciatok ? po : zaciatok;
      const [fakt, pon, upom] = await Promise.all([
        vsetkyRiadky<any>((a, b) =>
          db
            .from("invoice_email_logs")
            .select("id, created_at, invoice_id, recipient_email, subject, status, error_message")
            .eq("company_id", firma)
            .gte("created_at", od)
            .lt("created_at", doZac)
            .order("created_at", { ascending: false })
            .order("id")
            .range(a, b),
        ),
        vsetkyRiadky<any>((a, b) =>
          db
            .from("quote_email_logs")
            .select("id, created_at, quote_id, recipient_email, subject, status, error_message")
            .eq("company_id", firma)
            .gte("created_at", od)
            .lt("created_at", doZac)
            .order("created_at", { ascending: false })
            .order("id")
            .range(a, b),
        ),
        vsetkyRiadky<any>((a, b) =>
          db
            .from("invoice_reminders")
            .select("id, created_at, invoice_id, email_to, subject, status, error_message, sent_by")
            .eq("company_id", firma)
            .gte("created_at", od)
            .lt("created_at", doZac)
            .order("created_at", { ascending: false })
            .order("id")
            .range(a, b),
        ),
      ]);
      const pridaj = (r: any, druh: string, adresa: string | null, doklad: string | null) => {
        const adresati = String(adresa ?? "")
          .split(/[,;]/)
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean);
        riadky.push({
          id: r.id,
          cas: r.created_at,
          druh,
          adresati,
          pocet: adresati.length,
          stav: stary(r.status),
          predmet: r.subject ?? null,
          chyba: r.error_message ?? null,
          cez: null,
          dokladId: doklad,
          userId: r.sent_by ?? null,
          zdroj: "historia",
        });
      };
      for (const r of fakt) pridaj(r, "faktura", r.recipient_email, r.invoice_id);
      for (const r of pon) pridaj(r, "ponuka", r.recipient_email, r.quote_id);
      for (const r of upom) pridaj(r, "upomienka", r.email_to, r.invoice_id);
    }

    const vObdobi = riadky.filter((r) => m.vObdobi(r.cas, rozsah));

    // 4. Doklady (číslo, odberateľ) a mená odosielateľov.
    const idPodlaTypu: Record<TypDokladu, Set<string>> = {
      faktura: new Set(),
      ponuka: new Set(),
      prijata: new Set(),
    };
    for (const r of vObdobi) {
      const typ = m.typDokladuDruhu(r.druh);
      if (typ && r.dokladId) idPodlaTypu[typ].add(r.dokladId);
    }
    const doklady = new Map<string, { cislo: string | null; odberatel: string | null }>();
    const nacitajDoklady = async (
      tabulka: string,
      stlpce: string,
      ids: Set<string>,
      map: (x: any) => { cislo: string | null; odberatel: string | null },
    ) => {
      const zoznam = [...ids];
      for (let i = 0; i < zoznam.length; i += 200) {
        const { data: d } = await db
          .from(tabulka)
          .select(stlpce)
          .eq("company_id", firma)
          .in("id", zoznam.slice(i, i + 200));
        for (const x of d ?? []) doklady.set(`${tabulka}:${x.id}`, map(x));
      }
    };
    await Promise.all([
      nacitajDoklady("invoices", "id, invoice_number, customer_name", idPodlaTypu.faktura, (x) => ({
        cislo: x.invoice_number ?? null,
        odberatel: x.customer_name ?? null,
      })),
      nacitajDoklady("quotes", "id, quote_number, customer_name", idPodlaTypu.ponuka, (x) => ({
        cislo: x.quote_number ?? null,
        odberatel: x.customer_name ?? null,
      })),
      nacitajDoklady(
        "purchase_invoices",
        "id, invoice_number, supplier_name",
        idPodlaTypu.prijata,
        (x) => ({ cislo: x.invoice_number ?? null, odberatel: x.supplier_name ?? null }),
      ),
    ]);
    const tabulkaTypu: Record<TypDokladu, string> = {
      faktura: "invoices",
      ponuka: "quotes",
      prijata: "purchase_invoices",
    };

    const ludia = [...new Set(vObdobi.map((r) => r.userId).filter(Boolean))] as string[];
    const mena = new Map<string, string>();
    for (let i = 0; i < ludia.length; i += 200) {
      const { data: p } = await db
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ludia.slice(i, i + 200));
      for (const x of p ?? []) mena.set(x.id, x.full_name || x.email || "");
    }

    const maily: OdoslanyMail[] = vObdobi
      .map(({ dokladId, userId, ...r }) => {
        const typ = m.typDokladuDruhu(r.druh);
        // Zmazaný doklad: odkaz by viedol na 404 — ostane len bez čísla.
        const d = typ && dokladId ? doklady.get(`${tabulkaTypu[typ]}:${dokladId}`) : undefined;
        return {
          ...r,
          doklad: typ && dokladId && d ? { typ, id: dokladId, cislo: d.cislo } : null,
          odberatel: d?.odberatel ?? null,
          kto: userId ? mena.get(userId) || null : null,
        };
      })
      .sort((a, b) => b.cas.localeCompare(a.cas));

    // 5. Strážca: koľko z denného a hodinového stropu je minuté práve teraz.
    const teraz = Date.now();
    const { data: f } = await db
      .from("companies")
      .select("created_at, odosielanie_overene, odosielanie_pozastavene")
      .eq("id", firma)
      .maybeSingle();
    const { data: posledne } = await db
      .from("odosielanie_mailov")
      .select("created_at, adresati, pocet, stav")
      .eq("company_id", firma)
      .gte("created_at", new Date(teraz - 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);
    const vytazenie = m.vytazenieStrazcu(
      (posledne ?? []).map((r: any) => ({
        cas: r.created_at,
        adresati: r.adresati ?? [],
        pocet: r.pocet ?? 0,
        stav: r.stav,
      })),
      teraz,
    );
    const vek = f?.created_at ? Math.max(0, (teraz - Date.parse(f.created_at)) / 86_400_000) : 0;
    const s = stropyFirmy({ vekDni: vek, overena: !!f?.odosielanie_overene });

    return {
      maily,
      rozsah,
      strazca: {
        zaDen: vytazenie.zaDen,
        stropDen: s.zaDen,
        zaHodinu: vytazenie.zaHodinu,
        stropHodina: s.zaHodinu,
        naMail: s.naMail,
        nova: s.nova,
        pozastavene: !!f?.odosielanie_pozastavene,
      },
      zaciatokEvidencie: m.ZACIATOK_EVIDENCIE,
      zaciatokHistorie: m.ZACIATOK_HISTORIE,
    };
  });
