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

function maGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
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

async function cezOpenAi(
  pokyn: string,
  obsah: unknown[],
  nastavenie?: AiNastavenie,
  /** Obrázok a PDF potrebujú model, ktorý vidí; na text stačí ten rýchlejší. */
  vidiaci = true,
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
    if (!maOpenAi() || !opravitelna(e)) throw e;
    console.warn(
      "[ai] Gemini zlyhal, skúšam OpenAI:",
      String((e as Error)?.message ?? e).slice(0, 200),
    );
    return naOpenAi();
  }
}
