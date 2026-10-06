import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Oprava základu dane pri nevymožiteľnej pohľadávke (§ 25a zákona o DPH).

  Nárok počíta `narok25a` (150 dní, upomienka do 1 000 €, žaloba/exekúcia nad
  1 000 €, 3 roky, čiastočné úhrady). Opravný doklad je dobropis s príznakom
  `oprava_25a`, väzbou na pôvodnú faktúru a povinnou vetou — výkazy ho dajú do
  r. 26/27 a C.1 s ONP. Keď odberateľ neskôr zaplatí, vystaví sa doklad podľa
  § 25a ods. 10 s kladnými sumami (vrátenie opravy).

  Všetko ide cez klienta prihláseného — RLS, role aj uzamknuté obdobia platia.
*/

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dnes = () => new Date().toISOString().slice(0, 10);

async function podklady(supabase: any, invoiceId: string) {
  const { data: f } = await supabase
    .from("invoices")
    .select("*, invoice_items(vat_rate, subtotal, quantity, unit_price)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!f) throw new Error("Faktúra sa nenašla.");
  const [{ data: platby }, { data: upomienky }, { data: opravy }, { data: firma }] = await Promise.all([
    supabase.from("payments").select("amount, paid_at").eq("invoice_id", f.id),
    supabase.from("invoice_reminders").select("id").eq("invoice_id", f.id).eq("status", "sent"),
    supabase
      .from("invoices")
      .select("id, invoice_number, issue_date, total, subtotal, vat_total, status, deleted_at")
      .eq("opravuje_fakturu_id", f.id)
      .eq("oprava_25a", true)
      .is("deleted_at", null)
      .order("issue_date"),
    supabase.from("companies").select("vat_payer, ic_dph, dan_z_prijatej_platby").eq("id", f.company_id).maybeSingle(),
  ]);
  const zaplateneSpolu = r2(
    (platby ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0) ||
      (f.status === "paid" ? Number(f.total ?? 0) : 0),
  );
  const znizenie = (opravy ?? []).filter((o: any) => Number(o.total) < 0);
  const vratenia = (opravy ?? []).filter((o: any) => Number(o.total) > 0);
  return { f, platby: platby ?? [], upomienok: (upomienky ?? []).length, znizenie, vratenia, firma, zaplateneSpolu };
}

function riadkyFaktury(f: any) {
  const mapa = new Map<number, { sadzba: number; zaklad: number; dan: number }>();
  for (const p of f.invoice_items ?? []) {
    const sadzba = Number(p.vat_rate ?? 0);
    const zaklad = p.subtotal != null ? Number(p.subtotal) : Number(p.quantity ?? 0) * Number(p.unit_price ?? 0);
    const x = mapa.get(sadzba) ?? { sadzba, zaklad: 0, dan: 0 };
    x.zaklad += zaklad;
    x.dan += (zaklad * sadzba) / 100;
    mapa.set(sadzba, x);
  }
  // Zľava na doklad je v hlavičke — rozpočíta sa pomerne, nech sedí so sumou faktúry.
  const zlava = Number(f.discount_total ?? 0);
  const zakladSpolu = [...mapa.values()].reduce((s, x) => s + x.zaklad, 0);
  const k = zlava > 0 && zakladSpolu > 0 ? (zakladSpolu - zlava) / zakladSpolu : 1;
  return [...mapa.values()].map((x) => ({ sadzba: x.sadzba, zaklad: r2(x.zaklad * k), dan: r2(x.dan * k) }));
}

export type Stav25a = {
  narok: boolean;
  dovod: string | null;
  od: string | null;
  trebaPotvrditZalobu: boolean;
  nezaplatene: number;
  znizenie: { id: string; cislo: string; datum: string; suma: number }[];
  /** Úhrada po oprave → treba vystaviť doklad o vrátení opravy (§ 25a ods. 10). */
  naVratenie: number;
};

export const stav25aFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Stav25a> => {
    const { narok25a } = await import("./dph-nezaplatene");
    const p = await podklady(context.supabase, data.invoice_id);
    const n = narok25a(
      {
        typ: p.f.type,
        stav: p.f.status,
        splatnost: p.f.due_date,
        datumDodania: String(p.f.delivery_date || p.f.issue_date),
        spoluSDph: Number(p.f.total ?? 0),
        zaplatene: p.zaplateneSpolu,
        prenosDane: Boolean(p.f.reverse_charge),
        oss: Boolean(p.f.oss),
        dph: Number(p.f.vat_total ?? 0),
        uzOpravena: p.znizenie.length > 0,
        upomienok: p.upomienok,
      },
      dnes(),
      {
        platitel: p.firma?.vat_payer ?? Boolean(p.firma?.ic_dph),
        dph68d: Boolean(p.firma?.dan_z_prijatej_platby),
      },
    );
    /*
      Vrátenie opravy: úhrady prijaté po dni prvej opravy, najviac do výšky
      opravenej sumy, mínus to, čo už vrátenia pokryli.
    */
    let naVratenie = 0;
    if (p.znizenie.length) {
      const prva = p.znizenie[0].issue_date;
      const opravene = -p.znizenie.reduce((s: number, o: any) => s + Number(o.total), 0);
      const poOprave = p.platby
        .filter((x: any) => String(x.paid_at ?? "").slice(0, 10) >= prva)
        .reduce((s: number, x: any) => s + Number(x.amount ?? 0), 0);
      const uzVratene = p.vratenia.reduce((s: number, o: any) => s + Number(o.total), 0);
      naVratenie = r2(Math.max(0, Math.min(poOprave, opravene) - uzVratene));
    }
    return {
      narok: n.narok,
      dovod: n.narok ? null : n.dovod,
      od: n.od ?? null,
      trebaPotvrditZalobu: n.narok ? n.trebaPotvrditZalobu : false,
      nezaplatene: n.narok ? n.nezaplatene : r2(Number(p.f.total ?? 0) - p.zaplateneSpolu),
      znizenie: p.znizenie.map((o: any) => ({
        id: o.id,
        cislo: o.invoice_number,
        datum: o.issue_date,
        suma: Number(o.total),
      })),
      naVratenie,
    };
  });

export const vystavOpravu25aFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        druh: z.enum(["znizenie", "vratenie"]),
        potvrdenieZaloby: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { narok25a, cast, VETA_25A } = await import("./dph-nezaplatene");
    const p = await podklady(supabase, data.invoice_id);
    const f = p.f;
    const celkom = Number(f.total ?? 0);
    if (celkom <= 0) throw new Error("Faktúra nemá kladnú sumu.");

    let podiel: number;
    let suma: number;
    let uvod: string;
    if (data.druh === "znizenie") {
      const n = narok25a(
        {
          typ: f.type,
          stav: f.status,
          splatnost: f.due_date,
          datumDodania: String(f.delivery_date || f.issue_date),
          spoluSDph: celkom,
          zaplatene: p.zaplateneSpolu,
          prenosDane: Boolean(f.reverse_charge),
          oss: Boolean(f.oss),
          dph: Number(f.vat_total ?? 0),
          uzOpravena: p.znizenie.length > 0,
          upomienok: p.upomienok,
        },
        dnes(),
        { platitel: p.firma?.vat_payer ?? Boolean(p.firma?.ic_dph), dph68d: Boolean(p.firma?.dan_z_prijatej_platby) },
      );
      if (!n.narok) throw new Error(n.dovod);
      if (n.trebaPotvrditZalobu && !data.potvrdenieZaloby) {
        throw new Error(
          "Pohľadávka nad 1 000 € je nevymožiteľná, len ak je podaná žaloba alebo vedená exekúcia — potvrďte to.",
        );
      }
      podiel = n.podiel;
      suma = n.nezaplatene;
      uvod = `${VETA_25A[0].toUpperCase()}${VETA_25A.slice(1)} zákona č. 222/2004 Z. z. o DPH k faktúre ${f.invoice_number} zo dňa ${f.issue_date}. Pohľadávka vo výške ${suma.toFixed(2)} ${f.currency ?? "EUR"} vrátane DPH je nevymožiteľná — od splatnosti ${f.due_date} uplynulo viac ako 150 dní.`;
    } else {
      if (!p.znizenie.length) throw new Error("K faktúre nie je opravný doklad podľa § 25a.");
      const prva = p.znizenie[0];
      const opravene = -p.znizenie.reduce((s: number, o: any) => s + Number(o.total), 0);
      const platbyPo = p.platby.filter((x: any) => String(x.paid_at ?? "").slice(0, 10) >= prva.issue_date);
      const poOprave = platbyPo.reduce((s: number, x: any) => s + Number(x.amount ?? 0), 0);
      const uzVratene = p.vratenia.reduce((s: number, o: any) => s + Number(o.total), 0);
      suma = r2(Math.max(0, Math.min(poOprave, opravene) - uzVratene));
      if (suma <= 0) throw new Error("Po oprave neprišla žiadna úhrada, ktorú by bolo treba vrátiť.");
      podiel = suma / celkom;
      const posledna = platbyPo.map((x: any) => String(x.paid_at).slice(0, 10)).sort().pop();
      uvod = `${VETA_25A[0].toUpperCase()}${VETA_25A.slice(1)} ods. 10 zákona č. 222/2004 Z. z. o DPH — vrátenie opravy z dokladu ${prva.invoice_number} zo dňa ${prva.issue_date}. Odberateľ zaplatil ${suma.toFixed(2)} ${f.currency ?? "EUR"} vrátane DPH dňa ${posledna}.`;
    }

    const znamienko = data.druh === "znizenie" ? -1 : 1;
    const riadky = cast(riadkyFaktury(f), podiel);
    if (!riadky.length) throw new Error("Z faktúry sa nedali zistiť sumy po sadzbách.");

    const den = dnes();
    const { data: cislo, error: chybaCisla } = await supabase.rpc("faktero_next_invoice_number", {
      _company_id: f.company_id,
      _issue_date: den,
      _type: "credit_note",
      _series_id: null,
    });
    if (chybaCisla) throw new Error(chybaCisla.message);
    const c = cislo as { invoice_number: string; sequence_number: number; series_id?: string | null };

    const zaklad = r2(riadky.reduce((s, r) => s + r.zaklad, 0)) * znamienko;
    const dan = r2(riadky.reduce((s, r) => s + r.dan, 0)) * znamienko;
    const kurz = f.currency && f.currency !== "EUR" ? Number(f.exchange_rate ?? 0) || null : null;
    const pridajDni = (d: string, n: number) => {
      const x = new Date(`${d}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + n);
      return x.toISOString().slice(0, 10);
    };

    const { data: doklad, error } = await supabase
      .from("invoices")
      .insert({
        company_id: f.company_id,
        customer_id: f.customer_id,
        created_by: context.userId,
        invoice_number: c.invoice_number,
        sequence_number: c.sequence_number,
        number_series_id: c.series_id ?? null,
        type: "credit_note",
        status: "issued",
        oprava_25a: true,
        opravuje_fakturu_id: f.id,
        issue_date: den,
        delivery_date: den,
        due_date: pridajDni(den, 14),
        currency: f.currency ?? "EUR",
        language: f.language ?? null,
        payment_method: f.payment_method ?? "bank_transfer",
        payment_account_id: f.payment_account_id ?? null,
        variable_symbol: String(c.invoice_number).replace(/\D/g, "").slice(-10) || null,
        customer_name: f.customer_name,
        customer_ico: f.customer_ico,
        customer_dic: f.customer_dic,
        customer_ic_dph: f.customer_ic_dph,
        customer_street: f.customer_street,
        customer_city: f.customer_city,
        customer_zip: f.customer_zip,
        customer_country: f.customer_country,
        customer_email: f.customer_email,
        intro_note: uvod,
        subtotal: r2(zaklad),
        vat_total: r2(dan),
        total: r2(zaklad + dan),
        // Sadzba aj kurz sú z pôvodného dodania (§ 25a ods. 3).
        ...(kurz
          ? {
              exchange_rate: kurz,
              exchange_rate_date: f.exchange_rate_date ?? null,
              subtotal_eur: r2(zaklad / kurz),
              vat_total_eur: r2(dan / kurz),
              total_eur: r2((zaklad + dan) / kurz),
            }
          : {}),
      })
      .select("id, invoice_number")
      .single();
    if (error) throw new Error(error.message);

    const { error: chybaPoloziek } = await supabase.from("invoice_items").insert(
      riadky.map((r, i) => ({
        invoice_id: doklad.id,
        position: i,
        name:
          data.druh === "znizenie"
            ? `Oprava základu dane podľa § 25a — nezaplatená časť faktúry ${f.invoice_number}`
            : `Vrátenie opravy podľa § 25a — úhrada faktúry ${f.invoice_number}`,
        quantity: znamienko,
        unit: "ks",
        unit_price: r.zaklad,
        vat_rate: r.sadzba,
        subtotal: r2(r.zaklad * znamienko),
        vat_amount: r2(r.dan * znamienko),
        total: r2((r.zaklad + r.dan) * znamienko),
      })),
    );
    if (chybaPoloziek) {
      await supabase.from("invoices").delete().eq("id", doklad.id);
      throw new Error(chybaPoloziek.message);
    }
    return { id: doklad.id as string, cislo: doklad.invoice_number as string };
  });
