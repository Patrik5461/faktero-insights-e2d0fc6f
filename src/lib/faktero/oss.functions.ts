import { vsetkoAkoData } from "./strankovanie";
import { znamienkoDokladu } from "./faktury-sumy";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Podklady pre priznanie k jednému kontaktnému miestu (OSS).
 *
 * Do prehľadu idú len faktúry označené ako predaj spotrebiteľovi v EÚ. Popri
 * štvrťroku sa počíta aj ročný objem — hranica 10 000 eur rozhoduje o tom, či
 * sa vôbec má zdaňovať v štáte zákazníka.
 */
export const ossPrehladFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        rok: z.number().int().min(2020).max(2100),
        stvrtrok: z.number().int().min(1).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      ossPrehlad,
      stavPrahu,
      eurZaJednotkuOss,
      potrebneKurzyOss,
      klucKurzuOss,
      denDokladuOss,
      VYTKA_BEZ_KURZU_OSS,
    } = await import("./oss");
    const { kurzEcbOss } = await import("./kurzy.server");
    const { data: firma } = await context.supabase
      .from("companies")
      .select("country")
      .eq("id", data.company_id)
      .maybeSingle();
    const country = (firma as { country?: string | null } | null)?.country ?? null;

    const prvyMesiac = (data.stvrtrok - 1) * 3 + 1;
    const od = `${data.rok}-${String(prvyMesiac).padStart(2, "0")}-01`;
    const doDna = new Date(Date.UTC(data.rok, prvyMesiac + 2, 0)).toISOString().slice(0, 10);

    const { data: rows } = await vsetkoAkoData((zac, kon) =>
      context.supabase
        .from("invoices")
        .select(
          "id, invoice_number, type, status, issue_date, delivery_date, oss_country, subtotal, total, currency, exchange_rate, invoice_items(vat_rate, subtotal, quantity, unit_price)",
        )
        .eq("company_id", data.company_id)
        .eq("oss", true)
        .is("deleted_at", null)
        .order("id")
        .range(zac, kon),
    );

    // Zálohová faktúra nie je plnenie — do OSS ani do ročnej hranice nepatrí.
    const vsetky = (rows ?? []).filter(
      (f: any) =>
        !["draft", "cancelled"].includes(String(f.status)) && String(f.type) !== "proforma",
    );
    const vObdobi = vsetky.filter((f: any) => {
      const d = denDokladuOss(f);
      return d >= od && d <= doDna;
    });

    /*
      OSS aj hranica sú v eurách — doklad v cudzej mene sa prepočíta kurzom ECB
      k poslednému dňu štvrťroka, do ktorého patrí (čl. 366 smernice
      2006/112/ES), nie kurzom z dokladu. Do hranice idú len doklady roka.
    */
    const zaRokDoklady = vsetky.filter((f: any) => denDokladuOss(f).startsWith(String(data.rok)));
    const kurzy = new Map<string, { kurz: number; den: string; predbezne: boolean }>();
    for (const { mena, den } of potrebneKurzyOss(zaRokDoklady, country)) {
      const k = await kurzEcbOss(mena, den);
      if (k) kurzy.set(klucKurzuOss(mena, den), k);
    }
    const kurzEur = (f: any) => eurZaJednotkuOss(f, country, kurzy);
    const bezKurzu = zaRokDoklady.filter((f: any) => kurzEur(f) === null);
    const sKurzom = (fs: any[]) => fs.filter((f: any) => kurzEur(f) !== null);
    const prepocitane = zaRokDoklady.some((f: any) => {
      const k = kurzEur(f);
      return k !== null && k !== 1;
    });

    const naDoklad = (f: any) => {
      const kurz = kurzEur(f) ?? 1;
      const mapa = new Map<number, { sadzba: number; zaklad: number; dan: number }>();
      for (const p of f.invoice_items ?? []) {
        const sadzba = Number(p.vat_rate ?? 0);
        const zaklad =
          (p.subtotal != null
            ? Number(p.subtotal)
            : Number(p.quantity ?? 0) * Number(p.unit_price ?? 0)) * kurz;
        const s = mapa.get(sadzba) ?? { sadzba, zaklad: 0, dan: 0 };
        s.zaklad += zaklad;
        s.dan += (zaklad * sadzba) / 100;
        mapa.set(sadzba, s);
      }
      return {
        cislo: String(f.invoice_number),
        datum: denDokladuOss(f),
        stat: String(f.oss_country ?? ""),
        opravny: f.type === "credit_note",
        riadky: [...mapa.values()].map((r) => ({
          sadzba: r.sadzba,
          zaklad: Math.round(r.zaklad * 100) / 100,
          dan: Math.round(r.dan * 100) / 100,
        })),
      };
    };

    const prehlad = ossPrehlad(sKurzom(vObdobi).map(naDoklad));
    for (const f of bezKurzu.filter((x: any) => vObdobi.includes(x)))
      prehlad.vytky.push({ doklad: String(f.invoice_number), text: VYTKA_BEZ_KURZU_OSS });

    // Ročný objem kvôli hranici 10 000 € — počíta sa za všetky štáty spolu.
    const zaRok = sKurzom(zaRokDoklady)
      // Dobropis znižuje — otáča sa len kladne uložený (`znamienkoDokladu`).
      .reduce(
        (a: number, f: any) =>
          a + znamienkoDokladu(f.type, f.total) * Number(f.subtotal ?? 0) * (kurzEur(f) ?? 0),
        0,
      );

    return {
      obdobie: { rok: data.rok, stvrtrok: data.stvrtrok, od, do: doDna },
      prehlad,
      pocet: vObdobi.length,
      prepocitane,
      // Kurzy ECB použité na prepočet (mena, deň kurzu) a či je niektorý predbežný.
      kurzy: [...kurzy.entries()].map(([kluc, k]) => ({
        mena: kluc.split("|")[0],
        koniecStvrtroka: kluc.split("|")[1],
        ...k,
      })),
      predbezne: [...kurzy.values()].some((k) => k.predbezne),
      prah: stavPrahu(zaRok),
      zaRok: Math.round(zaRok * 100) / 100,
    };
  });
