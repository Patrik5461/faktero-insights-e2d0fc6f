import { createContext, useContext, useMemo, type ReactNode } from "react";
import { preloz, type Jazyk } from "./jazyk";

const KontextJazyka = createContext<Jazyk>("sk");

export function JazykProvider({ jazyk, children }: { jazyk: Jazyk; children: ReactNode }) {
  return <KontextJazyka.Provider value={jazyk}>{children}</KontextJazyka.Provider>;
}

/**
 * `const { t } = useT()` a potom `t("Slovenský text")` alebo
 * `t("Spolu {n} faktúr", { n })`. Kľúč je slovenský text, preklad je
 * v `src/lib/i18n/de/*.ts`.
 */
export function useT() {
  const jazyk = useContext(KontextJazyka);
  return useMemo(
    () => ({
      jazyk,
      t: (text: string, p?: Record<string, string | number>) => preloz(jazyk, text, p),
    }),
    [jazyk],
  );
}
