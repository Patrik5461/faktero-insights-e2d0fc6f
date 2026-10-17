import { createContext, useContext, useMemo, type ReactNode } from "react";
import { preloz, type Jazyk } from "./jazyk";
import { pomenovanieDobropisu } from "./dobropis-de";
import type { KrajinaDane } from "@/lib/faktero/vat-rates";

const KontextJazyka = createContext<Jazyk>("sk");

/**
 * Daňová krajina aktívnej firmy — `null` mimo aplikácie (verejný web,
 * manuály, prihlásenie). Nemecké názvoslovie dobropisu („Rechnungskorrektur“)
 * platí len pre firmu z Nemecka, ostatné vidia „Gutschrift“ (pozri
 * `dobropis-de.ts`).
 */
const KontextKrajiny = createContext<KrajinaDane | null>(null);

export function JazykProvider({ jazyk, children }: { jazyk: Jazyk; children: ReactNode }) {
  return <KontextJazyka.Provider value={jazyk}>{children}</KontextJazyka.Provider>;
}

/** Nastaví ho rozloženie prihlásenej časti podľa aktívnej firmy. */
export function KrajinaFirmyProvider({
  krajina,
  children,
}: {
  krajina: KrajinaDane | null;
  children: ReactNode;
}) {
  return <KontextKrajiny.Provider value={krajina}>{children}</KontextKrajiny.Provider>;
}

/** Daňová krajina aktívnej firmy z kontextu (`null` = bez firmy). */
export function useKrajinaFirmyKontext(): KrajinaDane | null {
  return useContext(KontextKrajiny);
}

/**
 * `const { t } = useT()` a potom `t("Slovenský text")` alebo
 * `t("Spolu {n} faktúr", { n })`. Kľúč je slovenský text, preklad je
 * v `src/lib/i18n/de/*.ts`.
 */
export function useT() {
  const jazyk = useContext(KontextJazyka);
  const krajina = useContext(KontextKrajiny);
  return useMemo(
    () => ({
      jazyk,
      t: (text: string, p?: Record<string, string | number>) => {
        const s = preloz(jazyk, text, p);
        return jazyk === "de" ? pomenovanieDobropisu(s, krajina) : s;
      },
    }),
    [jazyk, krajina],
  );
}
