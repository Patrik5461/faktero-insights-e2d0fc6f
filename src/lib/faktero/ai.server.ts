/**
 * Jedna cesta k modelu — s náhradou, keď prvý poskytovateľ zlyhá.
 *
 * Dovtedy si každé rozpoznávanie vyberalo poskytovateľa podľa toho, či je
 * nastavený `GEMINI_API_KEY`. Keď kľúč nastavený je, ale Gemini odpovie
 * chybou — a to sa stane pri vyčerpaných kredite (`429 RESOURCE_EXHAUSTED`),
 * pri výpadku aj pri preťažení — spadlo celé čítanie, hoci kľúč k OpenAI ležal
 * v tom istom prostredí nevyužitý. Rozpoznávanie bločkov, dokladov z pošty,
 * dodacích listov, zmlúv o financovaní aj bankových výpisov tak vypadlo naraz.
 *
 * Preto sa volá cez tieto dve funkcie: skúsi sa Gemini, a keď neuspeje, ide sa
 * na OpenAI. Do logu sa zapíše, prečo — inak by sa tichý prechod na drahší
 * model nikdy nezistil.
 */

export type AiNastavenie = {
  /** Strop odpovede. Dlhý splátkový kalendár sa do predvoleného nezmestí. */
  maxOutputTokens?: number;
  /** Vypýta si čistý JSON. */
  json?: boolean;
};

/**
 * Ako dlho sa Gemini po vyčerpaní kreditu preskakuje.
 *
 * Kľúč ostáva nastavený aj vtedy, keď kredit dôjde, takže sa naň chodilo pri
 * každom volaní znova — a pri výpise rozdelenom na desať kusov to bolo desať
 * zaručene neúspešných kôl navyše, každé so svojím čakaním. Prvé odmietnutie
 * preto Gemini na chvíľu umlčí a ide sa rovno na OpenAI.
 */
const TICHO_MS = 10 * 60_000;
let geminiTichoDo = 0;

/** Odmietnutie pre vyčerpaný kredit alebo kvótu — nie výpadok, opakovať netreba. */
function jeVycerpanyKredit(e: unknown): boolean {
  return /429|RESOURCE_EXHAUSTED|quota|credits/i.test(String((e as Error)?.message ?? e));
}

function maGemini(): boolean {
  if (!process.env.GEMINI_API_KEY?.trim()) return false;
  if (Date.now() < geminiTichoDo) return false;
  return true;
}

function umlcGemini(e: unknown): void {
  if (!jeVycerpanyKredit(e)) return;
  geminiTichoDo = Date.now() + TICHO_MS;
  console.warn(`[ai] Gemini nemá kredit, ${TICHO_MS / 60_000} minút sa naň nechodí.`);
}

function maOpenAi(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function bezPoskytovatela(): never {
  throw new Error("Rozpoznávanie dokumentov nie je nastavené — chýba kľúč ku Gemini aj k OpenAI.");
}

/**
 * Chyba, po ktorej má zmysel skúsiť druhého poskytovateľa.
 *
 * Odrezaná odpoveď medzi ne nepatrí: dokument je jednoducho dlhý a druhý model
 * ho neprečíta o nič lepšie, len sa zaplatí dvakrát.
 */
function opravitelna(e: unknown): boolean {
  const s = String((e as Error)?.message ?? e);
  return !/nezmestila/i.test(s);
}

const POKUSOV = 3;

/**
 * Odmietnutie, ktoré prejde samo.
 *
 * Dlhý výpis sa číta po kusoch a súbežne, takže na strop požiadaviek za minútu
 * sa naráža ľahko. Bez opakovania stačilo jedno `429` a zhodilo celé čítanie —
 * aj keď ostatných deväť kusov prešlo.
 */
function preskocDoChvile(status: number): boolean {
  return status === 429 || status >= 500;
}

async function cezOpenAi(
  pokyn: string,
  obsah: unknown[],
  nastavenie?: AiNastavenie,
  /** Obrázok a PDF potrebujú model, ktorý vidí; na text stačí ten rýchlejší. */
  vidiaci = true,
  pokus = 1,
): Promise<string> {
  const kluc = process.env.OPENAI_API_KEY?.trim();
  if (!kluc) bezPoskytovatela();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${kluc}` },
    body: JSON.stringify({
      model: vidiaci
        ? process.env.OPENAI_VISION_MODEL || "gpt-4o"
        : process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: pokyn },
        { role: "user", content: obsah },
      ],
      ...(nastavenie?.json ? { response_format: { type: "json_object" } } : {}),
      /*
        Strop odpovede sa musí orezať na to, čo model unesie: `gpt-4o` berie
        najviac 16 384 tokenov a väčšie číslo odmietne celé volanie
        (`400 max_tokens is too large`). Gemini pritom znesie oveľa viac, takže
        hodnota, ktorá je pre neho v poriadku, tu zhodí náhradnú cestu — a to
        práve vtedy, keď na ňu dôjde.
      */
      max_tokens: Math.min(nastavenie?.maxOutputTokens ?? 8000, 16000),
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const telo = await res.text();
    if (preskocDoChvile(res.status) && pokus < POKUSOV) {
      // `retry-after` chodí v sekundách; keď nechodí, čaká sa dvakrát dlhšie
      // s každým pokusom.
      const povedane = Number(res.headers?.get?.("retry-after") ?? "");
      const cakaj = Number.isFinite(povedane) && povedane > 0 ? povedane * 1000 : 2000 * pokus;
      console.warn(`[ai] OpenAI ${res.status}, ${pokus}. pokus, čakám ${cakaj} ms`);
      await new Promise((r) => setTimeout(r, Math.min(cakaj, 20_000)));
      return cezOpenAi(pokyn, obsah, nastavenie, vidiaci, pokus + 1);
    }
    throw new Error(`OpenAI ${res.status}: ${telo.slice(0, 300)}`);
  }
  const j: any = await res.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

/** Prečítanie dokumentu (obrázok alebo PDF) z jeho obsahu. */
export async function aiVision(
  base64: string,
  mimeType: string,
  pokyn: string,
  nastavenie?: AiNastavenie,
): Promise<string> {
  const naOpenAi = () =>
    cezOpenAi(
      pokyn,
      mimeType === "application/pdf"
        ? [
            { type: "text", text: "Prečítaj tento dokument." },
            {
              type: "file",
              file: { filename: "dokument.pdf", file_data: `data:${mimeType};base64,${base64}` },
            },
          ]
        : [
            { type: "text", text: "Prečítaj tento dokument." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
      nastavenie,
    );

  if (!maGemini()) {
    if (!maOpenAi()) bezPoskytovatela();
    return naOpenAi();
  }

  try {
    const { geminiVision } = await import("./gemini.server");
    return await geminiVision(base64, mimeType, pokyn, nastavenie);
  } catch (e) {
    umlcGemini(e);
    if (!maOpenAi() || !opravitelna(e)) throw e;
    console.warn(
      "[ai] Gemini zlyhal, skúšam OpenAI:",
      String((e as Error)?.message ?? e).slice(0, 200),
    );
    return naOpenAi();
  }
}

/** To isté nad obyčajným textom — keď dokument textovú vrstvu má. */
export async function aiText(pokyn: string, nastavenie?: AiNastavenie): Promise<string> {
  const naOpenAi = () => cezOpenAi(pokyn, [{ type: "text", text: "Pokračuj." }], nastavenie, false);

  if (!maGemini()) {
    if (!maOpenAi()) bezPoskytovatela();
    return naOpenAi();
  }

  try {
    const { geminiText } = await import("./gemini.server");
    return await geminiText(pokyn, nastavenie);
  } catch (e) {
    umlcGemini(e);
    if (!maOpenAi() || !opravitelna(e)) throw e;
    console.warn(
      "[ai] Gemini zlyhal, skúšam OpenAI:",
      String((e as Error)?.message ?? e).slice(0, 200),
    );
    return naOpenAi();
  }
}
