import { toast } from "sonner";

/** Kľúč podľa počtu: 1 / 2–4 / 5 a viac. */
export const tvarNeodovzdanych = (n: number) =>
  n === 1
    ? "Neodovzdaný: {n} doklad"
    : n >= 2 && n <= 4
      ? "Neodovzdané: {n} doklady"
      : "Neodovzdané: {n} dokladov";

/**
 * Doklady, ktoré kontrola pred odovzdaním do Pohody zastavila („číslo —
 * dôvod“). Musia sa povedať nahlas — inak by účtovníčke ticho chýbali.
 */
export function toastNeodovzdane(
  t: (k: string, p?: Record<string, string | number>) => string,
  preskocene: string[] | null | undefined,
) {
  const zoznam = (preskocene ?? []).filter(Boolean);
  if (!zoznam.length) return;
  toast.warning(t(tvarNeodovzdanych(zoznam.length), { n: zoznam.length }), {
    description: (
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {zoznam.slice(0, 12).map((d) => (
          <li key={d}>{d}</li>
        ))}
        {zoznam.length > 12 ? <li>{t("… a ďalšie ({n})", { n: zoznam.length - 12 })}</li> : null}
      </ul>
    ),
    duration: 15000,
  });
}
