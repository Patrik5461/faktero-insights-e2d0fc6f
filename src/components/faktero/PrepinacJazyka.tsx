import { JAZYKY, nastavJazyk } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";

/** SK | DE vpravo hore — voľba sa uloží do cookie a stránka sa načíta znova. */
export function PrepinacJazyka({ className = "" }: { className?: string }) {
  const { jazyk, t } = useT();
  return (
    <div
      role="group"
      aria-label={t("Jazyk")}
      className={`inline-flex shrink-0 rounded-md border border-border p-0.5 text-xs ${className}`}
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
  );
}
