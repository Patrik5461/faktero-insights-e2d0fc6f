/**
 * Zápis dodávateľa v obchodnom (prípadne živnostenskom) registri.
 *
 * Obchodný zákonník (§ 3a ods. 1) vyžaduje, aby obchodné listiny a objednávky
 * podnikateľa zapísaného v obchodnom registri obsahovali aj údaj o zápise
 * „vrátane čísla zápisu“ — v praxi „Obchodný register Mestského súdu
 * Bratislava III, oddiel: Sro, vložka č. 123456/B“. V Česku obdobne § 435
 * občanského zákoníku („spisová značka C 12345 vedená u Městského soudu v Praze“).
 *
 * Tlačí sa `companies.registracia_text`; ak je prázdny, text sa poskladá zo
 * štruktúrovaných polí `register_sud` / `register_oddiel` / `register_vlozka`.
 * Nemecké `registergericht` / `handelsregister_nr` rieši `firma-de.ts`.
 */

export type FirmaZapis = {
  registracia_text?: string | null;
  register_sud?: string | null;
  register_oddiel?: string | null;
  register_vlozka?: string | null;
  country?: string | null;
  name?: string | null;
};

const orez = (v: string | null | undefined) => String(v ?? "").replace(/\s+/g, " ").trim();

function jeCesko(country: string | null | undefined): boolean {
  const k = orez(country).toUpperCase();
  return k === "CZ" || k === "CZE" || k === "ČESKO" || k === "ČESKÁ REPUBLIKA" || k === "CZECHIA";
}

/**
 * Súd v 2. páde: „Mestský súd Bratislava III“ → „Mestského súdu Bratislava III“,
 * „Okresný súd Žilina“ → „Okresného súdu Žilina“, „Městský soud v Praze“ →
 * „Městského soudu v Praze“. Tvar, ktorý už je v 2. páde, ostane.
 */
export function sudVGenitive(sud: string | null | undefined): string {
  const s = orez(sud);
  return s
    .replace(/^(Mestsk|Okresn|Krajsk)ý súd\b/i, (_m, z: string) => `${z}ého súdu`)
    .replace(/^(Městsk|Krajsk|Okresn)ý soud\b/i, (_m, z: string) => `${z}ého soudu`);
}

/** Text zápisu, ktorý sa tlačí na doklad; nič vyplnené → `null`. */
export function textZapisuVRegistri(firma: FirmaZapis | null | undefined): string | null {
  if (!firma) return null;
  const hotovy = orez(firma.registracia_text);
  if (hotovy) return hotovy;

  const sud = orez(firma.register_sud);
  const oddiel = orez(firma.register_oddiel);
  const vlozka = orez(firma.register_vlozka);
  if (!sud && !oddiel && !vlozka) return null;

  if (jeCesko(firma.country)) {
    // „Spisová značka C 12345 vedená u Městského soudu v Praze“
    const znacka = [oddiel, vlozka].filter(Boolean).join(" ");
    const casti = [znacka ? `Spisová značka ${znacka}` : "Zapsáno v obchodním rejstříku"];
    if (sud) casti.push(`vedená u ${sudVGenitive(sud)}`);
    return casti.join(" ");
  }

  const casti: string[] = [sud ? `Obchodný register ${sudVGenitive(sud)}` : "Obchodný register"];
  if (oddiel) casti.push(`oddiel: ${oddiel}`);
  if (vlozka) casti.push(`vložka č. ${vlozka}`);
  return casti.join(", ");
}

/**
 * Či ide o obchodnú spoločnosť zapisovanú do obchodného registra (s.r.o., a.s.,
 * k.s., v.o.s., jednoduchá spoločnosť na akcie) — podľa názvu, lebo právnu
 * formu v `companies` nemáme. Živnostník a nezistená forma → `false`.
 */
export function jeObchodnaSpolocnost(nazov: string | null | undefined): boolean {
  const n = ` ${orez(nazov).toLowerCase()} `;
  if (!n.trim()) return false;
  // „s. r. o.“ → „s.r.o.“; skratka musí stáť samostatne (nie „mass“, „kras“).
  const sk = n.replace(/\.\s+/g, ".").replace(/,/g, " ");
  return (
    /(^|[\s(])(s\.r\.o|spol\.\s?s\s?r\.o)\.?($|[\s)])/.test(sk) ||
    /(^|[\s(])(a|k|j\.s\.a|v\.o)\.s\.?($|[\s)])/.test(sk) ||
    /akciová spoločnosť|akciová společnost|spoločnosť s ručením obmedzeným|společnost s ručením omezeným|komanditná spoločnosť|komanditní společnost|verejná obchodná spoločnosť|veřejná obchodní společnost|jednoduchá spoločnosť na akcie/.test(
      n,
    )
  );
}

/** Upozorniť, že chýba zápis — obchodná spoločnosť bez vyplneného textu ani polí. */
export function chybaZapisVRegistri(firma: FirmaZapis | null | undefined): boolean {
  if (!firma) return false;
  const k = orez(firma.country).toUpperCase();
  if (k === "DE" || k === "DEU") return false; // DE má vlastné polia (Handelsregister)
  return jeObchodnaSpolocnost(firma.name) && !textZapisuVRegistri(firma);
}

// ───────────────────────── Prevod odpovedí registrov ─────────────────────────

/** Zápis vyčítaný z registra — hotový text a (ak sa dajú) štruktúrované polia. */
export type ZapisZRegistra = {
  text: string;
  sud: string | null;
  oddiel: string | null;
  vlozka: string | null;
  /** obchodny = OR SR/ČR, zivnostensky = ŽR, iny = iná evidencia (združenia, nadácie…) */
  druh: "obchodny" | "zivnostensky" | "iny";
};

/** Text pre živnostníka: „Zapísaný v Živnostenskom registri Okresného úradu Žilina, č. ŽR 580-53442“. */
export function textZivnostenskehoRegistra(urad: string | null, cislo: string | null): string {
  const u = orez(urad).replace(/^Okresný úrad\b/i, "Okresného úradu");
  const c = orez(cislo);
  return ["Zapísaný v Živnostenskom registri" + (u ? ` ${u}` : ""), c ? `č. ŽR ${c}` : ""]
    .filter(Boolean)
    .join(", ");
}

/**
 * FinStat `RegisterNumberText`: pri s.r.o. už hotový zápis („Obchodný register
 * Okresného súdu Trnava, oddiel: Sro, vložka č. 51630/T“), pri živnostníkovi
 * „Okresný úrad Žilina, Číslo živnostenského registra: 580-53442“.
 */
export function zapisZFinstatTextu(text: string | null | undefined): ZapisZRegistra | null {
  const t = orez(text);
  if (!t) return null;
  const or = /^Obchodný register\s+(.+?),\s*oddiel:\s*([^,]+),\s*vložka\s*č\.\s*(.+)$/i.exec(t);
  if (or) {
    return {
      text: t,
      sud: or[1].replace(/^(Mestsk|Okresn|Krajsk)ého súdu\b/i, (_m, z: string) => `${z}ý súd`),
      oddiel: or[2].trim(),
      vlozka: or[3].trim(),
      druh: "obchodny",
    };
  }
  const zr = /^(.+?),\s*Číslo živnostenského registra:\s*(.+)$/i.exec(t);
  if (zr) {
    return {
      text: textZivnostenskehoRegistra(zr[1], zr[2]),
      sud: null,
      oddiel: null,
      vlozka: null,
      druh: "zivnostensky",
    };
  }
  return { text: t, sud: null, oddiel: null, vlozka: null, druh: /obchodn/i.test(t) ? "obchodny" : "iny" };
}

type RpoPlatne = { value?: unknown; validFrom?: string; validTo?: string };
function aktualna(zoznam: unknown): string | null {
  if (!Array.isArray(zoznam)) return null;
  const platne = (zoznam as RpoPlatne[])
    .filter((x) => x && typeof x.value === "string" && !x.validTo)
    .sort((a, b) => String(b.validFrom ?? "").localeCompare(String(a.validFrom ?? "")));
  const v = platne[0]?.value ?? (zoznam as RpoPlatne[]).at(-1)?.value;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Jeden záznam z RPO (`api.statistics.sk/rpo/v1/search?identifier=…` → `results[i]`):
 * `sourceRegister.value.value` je „Obchodný register“ / „Živnostenský register“,
 * `registrationOffices` súd alebo okresný úrad, `registrationNumbers` „Sro/51630/T“.
 */
export function zapisZRpo(zaznam: any): ZapisZRegistra | null {
  const zr = zaznam?.sourceRegister;
  if (!zr || typeof zr !== "object") return null;
  const register = orez(zr?.value?.value);
  const urad = aktualna(zr.registrationOffices);
  const cislo = aktualna(zr.registrationNumbers);
  if (!urad && !cislo) return null;

  if (/^Obchodný register/i.test(register)) {
    // „Sro/51630/T“ → oddiel Sro, vložka 51630/T
    const m = /^([A-Za-zÀ-ž]+)\/(.+)$/.exec(cislo ?? "");
    const oddiel = m ? m[1] : null;
    const vlozka = m ? m[2] : cislo;
    const text =
      textZapisuVRegistri({ register_sud: urad, register_oddiel: oddiel, register_vlozka: vlozka }) ??
      "";
    return { text, sud: urad, oddiel, vlozka, druh: "obchodny" };
  }
  if (/^Živnostensk/i.test(register)) {
    return {
      text: textZivnostenskehoRegistra(urad, cislo),
      sud: null,
      oddiel: null,
      vlozka: null,
      druh: "zivnostensky",
    };
  }
  const text = [register, urad, cislo ? `č. ${cislo}` : null].filter(Boolean).join(", ");
  return { text, sud: null, oddiel: null, vlozka: null, druh: "iny" };
}

/** Kódy krajských súdov v ARES → súd v 1. páde. */
const SUDY_CZ: Record<string, string> = {
  MSPH: "Městský soud v Praze",
  KSPH: "Krajský soud v Praze",
  KSCB: "Krajský soud v Českých Budějovicích",
  KSPL: "Krajský soud v Plzni",
  KSUL: "Krajský soud v Ústí nad Labem",
  KSHK: "Krajský soud v Hradci Králové",
  KSBR: "Krajský soud v Brně",
  KSOS: "Krajský soud v Ostravě",
};

/**
 * ARES veřejný rejstřík (`ekonomicke-subjekty-vr/{ico}`): `zaznamy[].spisovaZnacka`
 * `[{ soud: "MSPH", oddil: "B", vlozka: 8573 }]` → „Spisová značka B 8573 vedená
 * u Městského soudu v Praze“.
 */
export function zapisZAresVr(odpoved: any): ZapisZRegistra | null {
  const zaznamy: any[] = Array.isArray(odpoved?.zaznamy) ? odpoved.zaznamy : [];
  const z = zaznamy.find((x) => x?.primarniZaznam) ?? zaznamy[0];
  const znacky: any[] = Array.isArray(z?.spisovaZnacka) ? z.spisovaZnacka : [];
  const platne = znacky.filter((s) => !s?.datumVymazu);
  const s = (platne.length ? platne : znacky).at(-1);
  if (!s || (!s.oddil && s.vlozka == null)) return null;
  const sud = SUDY_CZ[String(s.soud ?? "").toUpperCase()] ?? (s.soud ? String(s.soud) : null);
  const oddiel = s.oddil ? String(s.oddil) : null;
  const vlozka = s.vlozka != null ? String(s.vlozka) : null;
  const text =
    textZapisuVRegistri({ country: "CZ", register_sud: sud, register_oddiel: oddiel, register_vlozka: vlozka }) ??
    "";
  return { text, sud, oddiel, vlozka, druh: "obchodny" };
}

/**
 * Či názov firmy v Fakterе zodpovedá názvu v registri — ochrana backfillu pred
 * vymysleným IČO (demo „55555555“) alebo podvrhnutým účtom s cudzím IČO.
 * Porovnáva sa bez diakritiky, právnej formy a interpunkcie; stačí, keď jeden
 * názov obsahuje druhý alebo sa zhoduje prvé výrazné slovo.
 */
export function nazvySedia(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) =>
    orez(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(spol|s\s*r\s*o|a\s*s|k\s*s|v\s*o\s*s|se|shr|s\.r\.o)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const prve = (v: string) => v.split(" ").find((w) => w.length >= 3) ?? v;
  return prve(x) === prve(y);
}
