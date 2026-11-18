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

/**
 * Claude ako náhrada pri vyťažovaní dokladov — ide hneď po `modelGeminiVytazenie()`,
 * keď náhľadový Gemini Pro odpovie „high demand“ (503) alebo nestihne.
 */
export function modelClaudeVytazenie(): string {
  return process.env.CLAUDE_MODEL_VYTAZENIE?.trim() || "claude-opus-5-5";
}

/** Claude ako náhrada za rýchly `modelGemini()` (predkontácia, krátke texty). */
export function modelClaude(): string {
  return process.env.CLAUDE_MODEL?.trim() || "claude-haiku-5-5";
}
