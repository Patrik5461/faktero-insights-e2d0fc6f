import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { textMoznosti, type MoznostKodu } from "@/lib/faktero/predkontacie";
import { useT } from "@/lib/i18n/useT";
import { VyberKodu } from "./VyberKodu";
import { moznostiKodov } from "./VyberVRiadku";

/**
 * Políčko na kód Pohody — predkontáciu alebo členenie DPH.
 *
 * Píše sa voľne (kód nemusí byť v číselníku), ale ponúka sa zoznam s popisom. Pod políčkom je popis vybraného kódu, nech je vidieť, čo
 * skratka znamená.
 */
export function KodPohody({
  value,
  onChange,
  moznosti,
  placeholder,
  className,
  bezPopisu,
  ariaLabel,
  vyber,
  odkazNaCiselnik,
}: {
  value: string;
  onChange: (v: string) => void;
  moznosti: MoznostKodu[];
  placeholder?: string;
  className?: string;
  bezPopisu?: boolean;
  ariaLabel?: string;
  /**
   * Výber s hľadaním namiesto písania — kódy z číselníka, napísaný kód mimo
   * neho sa dá použiť voľbou „Použiť kód…“. Bez číselníka ostane políčko na písanie.
   */
  vyber?: boolean;
  /** Pri prázdnom číselníku ukáže odkaz na jeho načítanie (len pri hlavnej predkontácii). */
  odkazNaCiselnik?: boolean;
}) {
  const { t } = useT();
  const id = useId();
  const vybrany = moznosti.find((m) => m.kod === value.trim());
  const neznamy = value.trim() && moznosti.length > 0 && !vybrany;
  /*
    Kód, ktorý v ponuke nie je (zadaný ručne alebo z pravidla), sa ukáže ako
    ďalšia voľba — inak by sa menu prepínalo na písanie a po kliknutí by sa
    nič neponúklo.
  */
  if (vyber && moznosti.length > 0) {
    const prazdne =
      placeholder && /^[\w.\-]{1,20}$/.test(placeholder) && placeholder !== "nemeniť"
        ? t("predvolené: {kod}", { kod: placeholder })
        : placeholder === "nemeniť" || placeholder?.startsWith("ako ")
          ? t(placeholder)
          : "—";
    return (
      <>
        {/* Výber s hľadaním podľa kódu, názvu aj účtov; napísaný kód mimo číselníka sa dá použiť tiež. */}
        <VyberKodu
          ariaLabel={(ariaLabel ? t(ariaLabel) : ariaLabel) ?? t("Kód")}
          hodnota={value.trim()}
          moznosti={moznostiKodov(moznosti)}
          textHodnoty={
            vybrany
              ? // Názov ako hlavný text (ako účtovné položky): „Nákup PHM – karta · 1Fk · 501/325".
                textMoznosti(vybrany)
              : value.trim()
                ? `${value.trim()} — ${t("nie je v číselníku")}`
                : undefined
          }
          prazdne={prazdne}
          nazovPrazdnej={prazdne}
          vlastny
          onVyber={(v) => onChange(v)}
          className={
            className ??
            "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          }
        />
        {!bezPopisu && neznamy ? (
          <span className="mt-0.5 block truncate text-xs text-amber-700">
            {t("Kód nie je v číselníku — skontrolujte, či ho Pohoda pozná")}
          </span>
        ) : null}
      </>
    );
  }
  return (
    <>
      <input
        list={id}
        value={value}
        placeholder={placeholder ? t(placeholder) : placeholder}
        aria-label={ariaLabel ? t(ariaLabel) : ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ?? "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        }
      />
      <datalist id={id}>
        {moznosti.map((m) => (
          <option key={m.kod} value={m.kod}>
            {[m.popis, m.ucty].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      {!bezPopisu && (vybrany?.popis || neznamy) ? (
        <span
          className={`mt-0.5 block truncate text-xs ${neznamy ? "text-amber-700" : "text-muted-foreground"}`}
        >
          {neznamy
            ? t("Kód nie je v číselníku predkontácií")
            : [vybrany?.popis, vybrany?.ucty].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {vyber && odkazNaCiselnik && !moznosti.length && !bezPopisu ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          <Link to="/uctovnictvo/predkontacie" className="text-primary hover:underline">
            {t("Načítať číselník z Pohody")}
          </Link>
        </span>
      ) : null}
    </>
  );
}
