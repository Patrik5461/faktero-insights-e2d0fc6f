/**
 * Ktorá z dvoch appiek sa práve zostavuje.
 *
 * Kód je spoločný, balíčky sú dva: Faktero (`vite.config.mobile.ts`) a Kniha
 * jázd (`vite.config.jazdy.ts`). Rozhodnúť sa to musí **pri zostavení**, nie
 * za behu — podľa toho sa do balíčka dostane aj správna značka. Na webe a vo
 * Fakteri je hodnota prázdna, teda „faktero".
 */
export const APKA: "faktero" | "jazdy" =
  (import.meta.env?.VITE_APKA as "faktero" | "jazdy" | undefined) ?? "faktero";

/** Samostatná appka Kniha jázd — vlastná značka, bez fakturácie. */
export const JE_KNIHA_JAZD = APKA === "jazdy";
