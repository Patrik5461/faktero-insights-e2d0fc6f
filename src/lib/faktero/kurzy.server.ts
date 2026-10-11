/**
 * Kurzy ECB — sťahovanie a pamäť.
 *
 * Kurzy sú verejné a nemenia sa spätne, takže sa raz stiahnu a uložia do
 * `exchange_rates`. Bez pamäte by každé generovanie PDF chodilo na ECB a pri
 * hromadnom vývoze faktúr by to bolo niekoľko desiatok volaní na jeden klik.
 */

import { XMLParser } from "fast-xml-parser";
import { denKurzu, kurzKDatumu, naDomacu, type KrajinaKurzu, type Kurz } from "./kurzy";

const DENNE = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const POSLEDNYCH_90 = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const CELA_HISTORIA = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

/** Rozparsuje ktorýkoľvek z troch súborov ECB — líšia sa len počtom dní. */
export function kurzyZXml(xml: string): Kurz[] {
  const data: any = parser.parse(xml);
  const kocky = data?.["gesmes:Envelope"]?.Cube?.Cube;
  const dni = Array.isArray(kocky) ? kocky : kocky ? [kocky] : [];
  const von: Kurz[] = [];
  for (const den of dni) {
    const datum = String(den?.time ?? "");
    const riadky = Array.isArray(den?.Cube) ? den.Cube : den?.Cube ? [den.Cube] : [];
    for (const r of riadky) {
      const mena = String(r?.currency ?? "").toUpperCase();
      const kurz = Number(r?.rate);
      if (datum && mena && Number.isFinite(kurz) && kurz > 0) von.push({ den: datum, mena, kurz });
    }
  }
  return von;
}

async function stiahni(url: string): Promise<Kurz[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  return kurzyZXml(await res.text());
}

async function uloz(kurzy: Kurz[]): Promise<void> {
  if (!kurzy.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Po dávkach — celá história má vyše 1,5 milióna riadkov a naraz by neprešla.
  for (let i = 0; i < kurzy.length; i += 1000) {
    const { error } = await supabaseAdmin
      .from("exchange_rates")
      .upsert(kurzy.slice(i, i + 1000), { onConflict: "den,mena" });
    if (error) {
      console.warn("[kurzy] zápis zlyhal:", error.message);
      return;
    }
  }
}

/**
 * Kurz pre menu ku dňu dodania (teda kurz zo dňa predtým).
 *
 * Najprv sa hľadá v databáze, potom sa dopĺňa z ECB — najskôr posledných
 * 90 dní, a až keď ide o starší doklad, celá história.
 */
export async function kurzPreDoklad(
  mena: string,
  datumDodania: string,
  krajina: KrajinaKurzu = "SK",
): Promise<{ kurz: number; den: string } | null> {
  if (krajina === "CZ") return kurzCnb(mena, datumDodania);
  const m = String(mena).toUpperCase();
  if (!m || m === "EUR") return null;
  const hranica = denKurzu(datumDodania);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const zDb = async () => {
    const { data } = await supabaseAdmin
      .from("exchange_rates")
      .select("den, mena, kurz")
      .eq("mena", m)
      .lte("den", hranica)
      .order("den", { ascending: false })
      .limit(1);
    const r = (data ?? [])[0];
    return r ? { kurz: Number(r.kurz), den: String(r.den) } : null;
  };

  const najdene = await zDb();
  /*
    ECB nevydáva kurz cez víkend a sviatky — najdlhšia medzera je Veľká noc
    (štvrtok → utorok). Starší kurz v pamäti znamená, že chýbajú čerstvé dni,
    nie že kurz neexistuje. Pri tolerancii 14 dní sa na faktúru z 5. 10.
    dostal kurz z 23. 9., lebo pamäť sa dopĺňa len pri doklade.
  */
  if (najdene && rozdielDni(najdene.den, hranica) <= 5) return najdene;

  for (const url of [POSLEDNYCH_90, CELA_HISTORIA]) {
    try {
      const stiahnute = await stiahni(url);
      await uloz(stiahnute);
      const zo = kurzKDatumu(stiahnute, m, hranica);
      if (zo) return { kurz: zo.kurz, den: zo.den };
    } catch (e) {
      console.warn("[kurzy] ECB nedostupná:", String((e as Error)?.message ?? e));
    }
  }
  return najdene;
}

function rozdielDni(a: string, b: string): number {
  return Math.abs(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/**
 * Prepočet dokladu na domácu menu firmy — vráti kurz aj prepočítané sumy.
 * Slovenská firma → eurá (ECB), česká → koruny (ČNB).
 */
export async function prepocitajDoklad(
  mena: string,
  datumDodania: string,
  sumy: { zaklad: number; dan: number; celkom: number },
  krajina: KrajinaKurzu = "SK",
): Promise<{ kurz: number; den: string; zaklad: number; dan: number; celkom: number } | null> {
  const k = await kurzPreDoklad(mena, datumDodania, krajina);
  if (!k) return null;
  return {
    kurz: k.kurz,
    den: k.den,
    zaklad: naDomacu(sumy.zaklad, k.kurz, krajina),
    dan: naDomacu(sumy.dan, k.kurz, krajina),
    celkom: naDomacu(sumy.celkom, k.kurz, krajina),
  };
}

/** Krajina firmy kvôli prepočtu — podľa nej domáca mena a banka kurzu. */
export async function krajinaFirmy(companyId: string): Promise<KrajinaKurzu> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  const { krajinaKurzu } = await import("./kurzy");
  return krajinaKurzu(data?.country);
}

/* ─── ČNB ─────────────────────────────────────────────────────────────── */

const CNB_ROK =
  "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt";

/**
 * Ročný súbor ČNB: hlavička `Datum|1 AUD|…|100 HUF|…`, riadky `02.01.2026|13,797|…`.
 * Kurz sa ukladá prepočítaný na 1 jednotku meny.
 */
export function kurzyZCnbRoka(text: string): Kurz[] {
  const riadky = text.split(/\r?\n/).filter((r) => r.trim());
  const von: Kurz[] = [];
  let hlavicka: { mena: string; mnozstvo: number }[] = [];
  for (const r of riadky) {
    const bunky = r.split("|");
    if (/^Datum/i.test(bunky[0])) {
      // Rok môže mať viac hlavičiek (zmena zoznamu mien uprostred roka).
      hlavicka = bunky.slice(1).map((b) => {
        const [mnoz, mena] = b.trim().split(/\s+/);
        return { mena: String(mena ?? "").toUpperCase(), mnozstvo: Number(mnoz) || 1 };
      });
      continue;
    }
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(bunky[0].trim());
    if (!m) continue;
    const den = `${m[3]}-${m[2]}-${m[1]}`;
    bunky.slice(1).forEach((b, i) => {
      const h = hlavicka[i];
      const hodnota = Number(String(b).trim().replace(",", "."));
      if (h?.mena && Number.isFinite(hodnota) && hodnota > 0) {
        von.push({ den, mena: h.mena, kurz: Math.round((hodnota / h.mnozstvo) * 1e6) / 1e6 });
      }
    });
  }
  return von;
}

async function stiahniCnbRok(rok: number): Promise<Kurz[]> {
  const res = await fetch(`${CNB_ROK}?rok=${rok}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ČNB ${res.status}`);
  return kurzyZCnbRoka(await res.text());
}

async function ulozCnb(kurzy: Kurz[]): Promise<void> {
  if (!kurzy.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < kurzy.length; i += 1000) {
    const { error } = await supabaseAdmin
      .from("kurzy_cnb" as any)
      .upsert(kurzy.slice(i, i + 1000) as any, { onConflict: "den,mena" });
    if (error) {
      console.warn("[kurzy-cnb] zápis zlyhal:", error.message);
      return;
    }
  }
}

/**
 * Kurz ČNB („CZK za 1 jednotku“) platný v deň plnenia — posledný vyhlásený
 * najneskôr v ten deň (cez víkend a sviatky piatkový).
 */
export async function kurzCnb(
  mena: string,
  datumPlnenia: string,
): Promise<{ kurz: number; den: string } | null> {
  const m = String(mena).toUpperCase();
  if (!m || m === "CZK") return null;
  const hranica = denKurzu(datumPlnenia, "CZ");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const zDb = async () => {
    const { data } = await supabaseAdmin
      .from("kurzy_cnb" as any)
      .select("den, mena, kurz")
      .eq("mena", m)
      .lte("den", hranica)
      .order("den", { ascending: false })
      .limit(1);
    const r = ((data ?? []) as any[])[0];
    return r ? { kurz: Number(r.kurz), den: String(r.den) } : null;
  };
  const najdene = await zDb();
  if (najdene && rozdielDni(najdene.den, hranica) <= 5) return najdene;

  const rok = Number(hranica.slice(0, 4));
  // Začiatkom januára môže platiť ešte decembrový kurz — preto aj predošlý rok.
  for (const r of [rok, rok - 1]) {
    try {
      const stiahnute = await stiahniCnbRok(r);
      await ulozCnb(stiahnute);
      const zo = kurzKDatumu(stiahnute, m, hranica);
      if (zo) return { kurz: zo.kurz, den: zo.den };
    } catch (e) {
      console.warn("[kurzy-cnb] ČNB nedostupná:", String((e as Error)?.message ?? e));
    }
  }
  return najdene;
}

/** Denné kurzy ČNB do pamäte — z cronu spolu s ECB. */
export async function stiahniDenneKurzyCnb(): Promise<number> {
  const kurzy = await stiahniCnbRok(new Date().getUTCFullYear());
  // Stačí posledný týždeň, zvyšok roka už v pamäti je.
  const hranica = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  const nove = kurzy.filter((k) => k.den >= hranica);
  await ulozCnb(nove);
  return nove.length;
}

/** Denné kurzy do pamäte — volá ich cron `faktero-kurzy-ecb` (hook `kurzy-ecb`). */
export async function stiahniDenneKurzy(): Promise<number> {
  const kurzy = await stiahni(DENNE);
  await uloz(kurzy);
  return kurzy.length;
}
