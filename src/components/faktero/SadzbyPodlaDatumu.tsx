/*
  Pod rozpisom DPH v Nespracovaných: prečo sa ponúkajú práve tieto sadzby.

  16. 11. 2026 (RHJ, METRO): AI prečítala z fotky dátum 1. 10. 2023 namiesto
  13. 10. 2026, výber preto ponúkal len 20/10/0 % a 23 % z dokladu sa vybrať
  nedalo — „nedá sa to opraviť“. Sadzby sa ponúkajú podľa dátumu dodania,
  tak to tu povieme, aj s dôvodom, prečo je rozpis prázdny (brána zákonných
  sadzieb ho zahodila — `zakonne-sadzby-ai.ts`).
*/
import { useT } from "@/lib/i18n/useT";

const naDatum = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : d);

export function SadzbyPodlaDatumu({
  sadzby,
  datum,
  dovodPrazdneho,
  prazdny,
  className = "",
}: {
  sadzby: number[];
  datum: string | null | undefined;
  /** Prečo sa rozpis nedal prečítať (`udaje.kontrolaDph.dovod`). */
  dovodPrazdneho?: string | null;
  prazdny: boolean;
  className?: string;
}) {
  const { t } = useT();
  const zoznam = [...sadzby].sort((a, b) => a - b).join(", ");
  return (
    <div className={`space-y-1 text-xs ${className}`} data-testid="sadzby-podla-datumu">
      {prazdny && dovodPrazdneho ? <p className="text-destructive">{dovodPrazdneho}</p> : null}
      <p className="text-muted-foreground">
        {datum
          ? t("Ponúkajú sa sadzby platné k dátumu dodania {datum} ({sadzby} %). Ak doklad uvádza inú sadzbu, skontrolujte dátum dodania.", {
              datum: naDatum(datum),
              sadzby: zoznam,
            })
          : t("Ponúkajú sa sadzby platné dnes ({sadzby} %). Vyplňte dátum dodania.", { sadzby: zoznam })}
      </p>
    </div>
  );
}
