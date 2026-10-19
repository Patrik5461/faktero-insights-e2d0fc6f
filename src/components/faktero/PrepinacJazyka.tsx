import { JAZYKY, jeJazyk, nastavJazyk } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";

/**
 * SK | CZ | DE vpravo hore — voľba sa uloží do cookie a stránka sa načíta znova.
 *
 * Tri tlačidlá zaberú ~100 px. V hlavičke aplikácie na telefóne (ikona menu,
 * logo s menom firmy, zvonček, Vytvoriť, avatar) by sa nezmestili, preto tam
 * ide `kompaktnyClassName`: pod `sm` sa namiesto tlačidiel ukáže natívny výber
 * so skratkou (~45 px). Verejný web prepínač na telefóne dáva do menu, kde
 * miesto je, a kompaktnú verziu nepotrebuje.
 */
export function PrepinacJazyka({
  className = "",
  kompaktnyClassName,
}: {
  className?: string;
  /** Ak je zadané, pod `sm` sa ukáže výber s týmito triedami namiesto tlačidiel. */
  kompaktnyClassName?: string;
}) {
  const { jazyk, t } = useT();
  const kompaktny = kompaktnyClassName !== undefined;
  return (
    <>
      {kompaktny && (
        <select
          aria-label={t("Jazyk")}
          value={jazyk}
          onChange={(e) => jeJazyk(e.target.value) && nastavJazyk(e.target.value)}
          className={`h-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent px-1 text-xs font-semibold sm:hidden ${kompaktnyClassName}`}
        >
          {JAZYKY.map((j) => (
            <option
              key={j.kod}
              value={j.kod}
              lang={j.kod}
              title={j.nazov}
              className="text-foreground"
            >
              {j.skratka}
            </option>
          ))}
        </select>
      )}
      <div
        role="group"
        aria-label={t("Jazyk")}
        className={`${kompaktny ? "hidden sm:inline-flex" : "inline-flex"} shrink-0 rounded-md border border-border p-0.5 text-xs ${className}`}
      >
        {JAZYKY.map((j) => (
          <button
            key={j.kod}
            type="button"
            lang={j.kod}
            title={j.nazov}
            aria-pressed={jazyk === j.kod}
            onClick={() => jazyk !== j.kod && nastavJazyk(j.kod)}
            className={`min-w-[2rem] rounded px-1.5 py-1 font-semibold ${
              jazyk === j.kod
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {j.skratka}
          </button>
        ))}
      </div>
    </>
  );
}
