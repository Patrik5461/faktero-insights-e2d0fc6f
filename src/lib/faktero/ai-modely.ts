/**
 * Názvy modelov na jednom mieste.
 *
 * Meranie využitia musí zapísať ten istý názov, aký sa naozaj volal — a keďže
 * sa dá prehodiť premennou prostredia, nesmie sa nikde písať natvrdo druhýkrát.
 */

export function modelGemini(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
}

/**
 * Model len na vyťažovanie dokladov (faktúry, Nespracované, doklad z pošty,
 * bločky, výber z dokladu) — nie predkontácia ani asistent. Vyšší model číta
 * rozpis DPH spoľahlivejšie; keď nestihne časový limit alebo zlyhá, volanie
 * prepne na `modelGemini()` (pozri `aiVision`).
 */
export function modelGeminiVytazenie(): string {
  return process.env.GEMINI_MODEL_VYTAZENIE?.trim() || "gemini-3.1-pro-preview";
}

/** Obrázok a PDF potrebujú model, ktorý vidí; na text stačí ten rýchlejší. */
export function modelOpenAi(vidiaci: boolean): string {
  return vidiaci
    ? process.env.OPENAI_VISION_MODEL || "gpt-4o"
    : process.env.OPENAI_MODEL || "gpt-4o-mini";
}
