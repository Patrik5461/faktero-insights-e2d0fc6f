/**
 * Názvy modelov na jednom mieste.
 *
 * Meranie využitia musí zapísať ten istý názov, aký sa naozaj volal — a keďže
 * sa dá prehodiť premennou prostredia, nesmie sa nikde písať natvrdo druhýkrát.
 */

export function modelGemini(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
}

/** Obrázok a PDF potrebujú model, ktorý vidí; na text stačí ten rýchlejší. */
export function modelOpenAi(vidiaci: boolean): string {
  return vidiaci
    ? process.env.OPENAI_VISION_MODEL || "gpt-4o"
    : process.env.OPENAI_MODEL || "gpt-4o-mini";
}
