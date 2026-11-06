import { useT } from "@/lib/i18n/useT";
import { moznostiDruhuPdp } from "@/lib/faktero/veta-prenesenia";

/**
 * Výber ustanovenia tuzemského prenesenia daňovej povinnosti
 * (SK § 69 ods. 12 písm. a–j, CZ § 92b–92f). Podľa neho doklad vytlačí
 * celé znenie, napr. „§ 69 ods. 12 písm. j) zákona č. 222/2004 Z. z. o DPH –
 * stavebné práce“. Prázdna hodnota = všeobecná veta.
 */
export function VyberDruhuPdp({
  krajina,
  value,
  onChange,
  className,
}: {
  krajina: string | null | undefined;
  value: string | null | undefined;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { t } = useT();
  const cz = krajina === "CZ";
  return (
    <label className={className ?? "block"}>
      <span className="text-[13px] font-semibold text-foreground">
        {cz ? t("Ustanovenie § 92 (prenesenie)") : t("Písmeno § 69 ods. 12")}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">
          {cz ? t("Bez upresnenia (§ 92a)") : t("Bez upresnenia (§ 69 ods. 12)")}
        </option>
        {moznostiDruhuPdp(krajina).map((m) => (
          <option key={m.kod} value={m.kod}>
            {t(m.popis)}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        {t("Na doklad sa vytlačí celé znenie ustanovenia, podľa ktorého odberateľ daň prizná.")}
      </span>
    </label>
  );
}
