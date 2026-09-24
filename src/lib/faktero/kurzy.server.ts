/**
 * Kurzy ECB — sťahovanie a pamäť.
 *
 * Kurzy sú verejné a nemenia sa spätne, takže sa raz stiahnu a uložia do
 * `exchange_rates`. Bez pamäte by každé generovanie PDF chodilo na ECB a pri
 * hromadnom vývoze faktúr by to bolo niekoľko desiatok volaní na jeden klik.
 */

import { XMLParser } from "fast-xml-parser";
import { denKurzu, kurzKDatumu, naEur, type Kurz } from "./kurzy";

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
): Promise<{ kurz: number; den: string } | null> {
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
  // Kurz starší než dva týždne znamená, že v pamäti chýbajú čerstvé dni.
  if (najdene && rozdielDni(najdene.den, hranica) <= 14) return najdene;

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

/** Prepočet dokladu na eurá — vráti kurz aj prepočítané sumy. */
export async function prepocitajDoklad(
  mena: string,
  datumDodania: string,
  sumy: { zaklad: number; dan: number; celkom: number },
): Promise<{ kurz: number; den: string; zaklad: number; dan: number; celkom: number } | null> {
  const k = await kurzPreDoklad(mena, datumDodania);
  if (!k) return null;
  return {
    kurz: k.kurz,
    den: k.den,
    zaklad: naEur(sumy.zaklad, k.kurz),
    dan: naEur(sumy.dan, k.kurz),
    celkom: naEur(sumy.celkom, k.kurz),
  };
}

/** Denné kurzy do pamäte — volá sa z nočného cronu. */
export async function stiahniDenneKurzy(): Promise<number> {
  const kurzy = await stiahni(DENNE);
  await uloz(kurzy);
  return kurzy.length;
}
