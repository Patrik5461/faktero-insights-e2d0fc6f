/*
  Prepis reči na serveri (OpenAI) pre hlasové ovládanie.

  Prehliadačové rozpoznávanie (Web Speech API) slovenčinu chápe zle — názvy
  firiem a odborné slová („predkontácia“, „nespracované“) komolí. Prehliadač
  preto nahrá krátky záznam (webm/opus, Safari mp4) a server ho pošle na
  POST https://api.openai.com/v1/audio/transcriptions (multipart):
    file, model, language (ISO-639-1), prompt (slovník), response_format=json.
  Najprv `gpt-4o-transcribe`, pri chybe `whisper-1`. Odpoveď `{ text, usage }`
  — gpt-4o-transcribe dáva `usage.type = "tokens"`, whisper `"duration"`.

  Cena: gpt-4o-transcribe ≈ 0,006 USD za minútu (audio 6 USD / 1 M tokenov,
  ~1 000 tokenov za minútu); príkaz s 3–5 s reči ≈ 0,0004 USD. Whisper sa
  meria ako minútový ekvivalent tokenov (`tokenyZaSekundy`), aby `ai-cennik`
  počítal rovnako.

  Čas: celé volanie v termíne ~22 s (nginx strihá po 30 s), prvý model
  dostane najviac ~14 s, záloha zvyšok.
*/

export const MODEL_PREPISU = process.env.HLAS_STT_MODEL?.trim() || "gpt-4o-transcribe";
export const MODEL_PREPISU_ZALOHA = "whisper-1";
const URL_PREPISU = "https://api.openai.com/v1/audio/transcriptions";
const TERMIN_MS = 22_000;
const TERMIN_PRVEHO_MS = 14_000;
/** Najviac znakov slovníka — whisper berie len koniec promptu (~224 tokenov). */
const MAX_SLOVNIK = 900;

export const SLOVNIK_FAKTERA = [
  "Faktero",
  "nespracované doklady",
  "prijaté faktúry",
  "vystavené faktúry",
  "bločky",
  "zaúčtovanie",
  "zaúčtuj",
  "predkontácia",
  "členenie DPH",
  "kontrolný výkaz",
  "DPH",
  "pohľadávky po splatnosti",
  "neuhradené",
  "Pohoda",
  "pokladňa",
  "cenové ponuky",
  "zákazky",
  "bankové transakcie",
  "dobropis",
  "zálohová faktúra",
  "potvrď",
  "zruš",
];

/** Prípona súboru podľa typu nahrávky — OpenAI formát spoznáva podľa mena. */
export function priponaPreTyp(mime: string): "webm" | "mp4" | "ogg" | "wav" | "mp3" | "m4a" {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("m4a") || m.includes("aac")) return "m4a";
  return "mp4";
}

/**
 * Prompt so slovníkom: odborné slová, firma a mená partnerov. Partneri idú
 * na koniec (whisper berie koniec), opakovania a prázdne sa vynechajú.
 */
export function slovnikPrepisu(args: {
  jazyk: string;
  firma?: string | null;
  partneri: string[];
}): string {
  const uvod =
    args.jazyk === "cs"
      ? "Hlasový příkaz pro účetní aplikaci Faktero."
      : args.jazyk === "de"
        ? "Sprachbefehl für die Buchhaltungs-App Faktero."
        : "Hlasový príkaz pre účtovnú aplikáciu Faktero.";
  const videne = new Set<string>();
  const mena: string[] = [];
  for (const p of [args.firma ?? "", ...args.partneri]) {
    const m = String(p ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    const k = m.toLowerCase();
    if (!m || videne.has(k)) continue;
    videne.add(k);
    mena.push(m);
  }
  let text = `${uvod} Slová: ${SLOVNIK_FAKTERA.join(", ")}.`;
  if (mena.length) {
    let firmy = "";
    for (const m of mena) {
      const dalsi = firmy ? `${firmy}, ${m}` : m;
      if (text.length + dalsi.length + 10 > MAX_SLOVNIK) break;
      firmy = dalsi;
    }
    if (firmy) text += ` Firmy: ${firmy}.`;
  }
  return text;
}

const HALUCINACIE = [
  "titulky vytvoril",
  "titulky pripravil",
  "dakujem za pozornost",
  "dekuji za pozornost",
  "subtitles by",
  "amara org",
  "untertitel",
];

/** Krátke slová, ktoré model k ozvene promptu pridáva („… faktúry od Orange“). */
const SPOJKY = new Set([
  "od",
  "pre",
  "na",
  "v",
  "vo",
  "a",
  "za",
  "do",
  "z",
  "zo",
  "s",
  "so",
  "mi",
  "je",
  "k",
  "ku",
  "o",
  "aj",
]);

const holy = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Prepis, ktorý v nahrávke nebol: pri tichu modely radi vrátia kus promptu
 * alebo „Ďakujem za pozornosť“. Taký text sa zahodí, nech sa nič nespustí.
 */
export function jeHalucinacia(text: string, prompt: string): boolean {
  const t = holy(text);
  if (!t) return true;
  if (HALUCINACIE.some((h) => t.includes(h))) return true;
  // Whisper si pri tichu vymýšľa adresy („www.slovakatele.com“).
  if (/www\.|\.(com|sk|cz|org)\b/i.test(text)) return true;
  const p = holy(prompt);
  if (t.length >= 25 && p.includes(t)) return true;
  // Dlhý zoznam slov zo slovníka nikto nediktuje — to je ozvena promptu.
  const slova = t.split(" ");
  const vPrompte = new Set(p.split(" "));
  if (slova.length >= 6 && slova.every((s) => vPrompte.has(s))) return true;
  // Ozvena začína názvom aplikácie z úvodu promptu („Faktero, zaúčtuj …“).
  return slova[0] === "faktero" && jeOzvenaPromptu(text, prompt);
}

/**
 * Prepis zložený len zo slov slovníka (2 a viac slov) — typická „ozvena“
 * promptu pri tichu alebo šume. Nezahadzuje sa (človek mohol naozaj povedať
 * „nespracované doklady“), rozhodne prehliadač podľa nameranej reči.
 */
export function jeOzvenaPromptu(text: string, prompt: string): boolean {
  const slova = holy(text)
    .split(" ")
    .filter((s) => s && !SPOJKY.has(s));
  if (slova.length < 2) return false;
  const vPrompte = new Set(holy(prompt).split(" "));
  return slova.every((s) => vPrompte.has(s));
}

export type VysledokPrepisu = {
  text: string;
  model: string;
  /** Prepis nič nezachytil (ticho, halucinácia). */
  prazdny: boolean;
  /** Len slová zo slovníka — možno ozvena promptu (`jeOzvenaPromptu`). */
  ozvena: boolean;
};

export type VolaniePrepisu = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: FormData; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type MeranieBezFirmy = (z: {
  model: string;
  ok: boolean;
  trvanieMs: number;
  vstup: number | null;
  vystup: number | null;
  chyba?: string | null;
}) => void;

/** Sekundy whisperu → tokeny v cene gpt-4o-transcribe (1 000 za minútu). */
export function tokenyZaSekundy(sekundy: number): number {
  return Math.round((Math.max(0, sekundy) * 1000) / 60);
}

export type UsagePrepisu = {
  type?: string;
  input_tokens?: number;
  output_tokens?: number;
  seconds?: number;
  input_token_details?: { audio_tokens?: number; text_tokens?: number };
};

/**
 * Vstupné tokeny v cene audio tokenu (6 USD / M), aby `ai-cennik` stačila
 * jedna sadzba: text promptu stojí 2,50 USD / M, prepočíta sa pomerom;
 * whisper (sekundy) cez minútový ekvivalent.
 */
export function vstupneTokenyPrepisu(u: UsagePrepisu): number | null {
  if (u.type === "duration") return tokenyZaSekundy(Number(u.seconds ?? 0));
  const d = u.input_token_details;
  if (d && (d.audio_tokens != null || d.text_tokens != null))
    return Math.round(Number(d.audio_tokens ?? 0) + (Number(d.text_tokens ?? 0) * 2.5) / 6);
  return u.input_tokens ?? null;
}

export function formularPrepisu(args: {
  audio: Uint8Array;
  mime: string;
  model: string;
  jazyk: string;
  prompt: string;
}): FormData {
  const f = new FormData();
  const typ = args.mime.split(";")[0] || "audio/webm";
  f.append(
    "file",
    new Blob([new Uint8Array(args.audio)], { type: typ }),
    `prikaz.${priponaPreTyp(args.mime)}`,
  );
  f.append("model", args.model);
  f.append("language", args.jazyk === "cs" ? "cs" : args.jazyk === "de" ? "de" : "sk");
  f.append("prompt", args.prompt);
  f.append("response_format", "json");
  f.append("temperature", "0");
  return f;
}

/**
 * Prepíše nahrávku: gpt-4o-transcribe, pri chybe whisper-1. Hodí chybu, len
 * keď zlyhajú oba (prehliadač potom použije svoje rozpoznávanie).
 */
export async function prepisReci(
  args: { audio: Uint8Array; mime: string; jazyk: string; prompt: string },
  env: {
    kluc: string;
    volaj?: VolaniePrepisu;
    zmeraj?: MeranieBezFirmy;
    terminMs?: number;
    modely?: string[];
  },
): Promise<VysledokPrepisu> {
  const volaj: VolaniePrepisu = env.volaj ?? ((u, i) => fetch(u, i));
  const modely = env.modely ?? [MODEL_PREPISU, MODEL_PREPISU_ZALOHA];
  const zaciatok = Date.now();
  const termin = env.terminMs ?? TERMIN_MS;
  let posledna: unknown = null;
  for (let i = 0; i < modely.length; i++) {
    const model = modely[i];
    const zostava = termin - (Date.now() - zaciatok);
    if (zostava < 1_500) break;
    const ctrl = new AbortController();
    const naModel = i === 0 && modely.length > 1 ? Math.min(TERMIN_PRVEHO_MS, zostava) : zostava;
    const casovac = setTimeout(() => ctrl.abort(), naModel);
    const t0 = Date.now();
    try {
      const res = await volaj(URL_PREPISU, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.kluc}` },
        body: formularPrepisu({ ...args, model }),
        signal: ctrl.signal,
      });
      const telo = await res.text();
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${telo.slice(0, 200)}`);
      const j = JSON.parse(telo) as {
        text?: string;
        usage?: UsagePrepisu;
      };
      const u = j.usage ?? {};
      env.zmeraj?.({
        model,
        ok: true,
        trvanieMs: Date.now() - t0,
        vstup: vstupneTokenyPrepisu(u),
        vystup: u.type === "duration" ? 0 : (u.output_tokens ?? null),
      });
      const text = String(j.text ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const prazdny = jeHalucinacia(text, args.prompt);
      return {
        text: prazdny ? "" : text,
        model,
        prazdny,
        ozvena: !prazdny && jeOzvenaPromptu(text, args.prompt),
      };
    } catch (e) {
      posledna = e;
      env.zmeraj?.({
        model,
        ok: false,
        trvanieMs: Date.now() - t0,
        vstup: null,
        vystup: null,
        chyba: ctrl.signal.aborted ? "časový limit" : String((e as Error)?.message ?? e),
      });
    } finally {
      clearTimeout(casovac);
    }
  }
  throw new Error(
    `Prepis reči zlyhal: ${String((posledna as Error)?.message ?? posledna ?? "čas vypršal").slice(0, 200)}`,
  );
}

/**
 * Mená partnerov, ktoré má prepis poznať: najčastejší dodávatelia
 * (prijaté faktúry) a odberatelia (vystavené) za posledný rok, doplnené
 * adresárom. Klient prihláseného — RLS.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function partneriPreSlovnik(sb: any, companyId: string, max = 40): Promise<string[]> {
  const odRoka = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const pocty = new Map<string, { meno: string; n: number }>();
  const pridaj = (meno: unknown, vaha: number) => {
    const m = String(meno ?? "").trim();
    if (!m) return;
    const k = m.toLowerCase();
    const z = pocty.get(k) ?? { meno: m, n: 0 };
    z.n += vaha;
    pocty.set(k, z);
  };
  const [prijate, vystavene, adresar] = await Promise.all([
    sb
      .from("purchase_invoices")
      .select("supplier_name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("issue_date", odRoka)
      .limit(1000),
    sb
      .from("invoices")
      .select("customer_name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("issue_date", odRoka)
      .limit(1000),
    sb
      .from("customers")
      .select("name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);
  for (const r of prijate.data ?? []) pridaj(r.supplier_name, 1);
  for (const r of vystavene.data ?? []) pridaj(r.customer_name, 1);
  for (const r of adresar.data ?? []) pridaj(r.name, 0.1);
  return [...pocty.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => x.meno);
}
