import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { formatujMenu, formatujMnozstvo } from "@/lib/faktero/mena";
import {
  BunkaPolozky,
  PodriadokPolozky,
  PolozkyHlavicka,
  PolozkyKontajner,
  RiadokPolozky,
} from "./PolozkyResponzivne";

export type PolozkaNaCitanie = {
  id?: string;
  name?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  vat_rate?: number | null;
  total?: number | null;
  discount_percent?: number | null;
  prenesenie?: boolean | null;
};

/**
 * Položky prijatého dokladu (prijatá faktúra, bloček) len na čítanie.
 *
 * Rovnaké v detaile na celej stránke, v kompaktnom detaile aj v úzkom paneli —
 * podľa šírky KONTAJNERA (`PolozkyResponzivne`): pod 560 px karta (názov + suma,
 * pod nimi množstvo, cena za kus a DPH s popismi), nad 560 px tabuľkový riadok.
 * Žiadna pevná minimálna šírka ani vodorovné posúvanie.
 */
export function PolozkyNaCitanie({
  polozky,
  mena,
  prenesenie,
  vypnute,
  className,
}: {
  polozky: PolozkaNaCitanie[];
  mena: string;
  /** Celý doklad je s prenesením daňovej povinnosti — namiesto sadzby „PDP“. */
  prenesenie?: boolean;
  /** Položky sú vypnuté (účtuje sa podľa súčtov) — preškrtnuté. */
  vypnute?: boolean;
  /** Napr. vodorovný odsadok, keď je zoznam priamo v karte. */
  className?: string;
}) {
  const { t, jazyk } = useT();
  if (!polozky.length)
    return <p className="text-xs text-muted-foreground">{t("Doklad nemá položky.")}</p>;
  const suma = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? formatujMenu(n, mena) : "—";
  // Suma sa nesmie orezať ani vytlačiť bunku — radšej sa zalomí.
  const cislo = "tabular-nums [overflow-wrap:anywhere]";
  return (
    <PolozkyKontajner
      stlpce="minmax(0,1fr) minmax(4.5rem,auto) minmax(5.5rem,auto) minmax(3rem,auto) minmax(6rem,auto)"
      className={cn("text-sm", vypnute && "opacity-50", className)}
    >
      <PolozkyHlavicka
        stlpce={[
          { text: t("Položka") },
          { text: t("Množstvo"), vpravo: true },
          { text: t("Cena za kus"), vpravo: true },
          { text: t("DPH"), vpravo: true },
          { text: t("Spolu"), vpravo: true },
        ]}
      />
      <div data-zoznam-poloziek="" className={vypnute ? "line-through" : undefined}>
        {polozky.map((p, i) => {
          const zlava = Number(p.discount_percent ?? 0);
          return (
            <RiadokPolozky key={p.id ?? i} className="items-start">
              <BunkaPolozky popis={t("Položka")} uzky={7} poradie={1} skrytyPopis>
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                  {p.name || "—"}
                </span>
              </BunkaPolozky>
              <BunkaPolozky
                popis={t("Množstvo")}
                uzky={4}
                poradie={3}
                className="@min-[560px]:items-end"
              >
                <span className={cn(cislo, "@min-[560px]:text-right")}>
                  {p.quantity != null ? formatujMnozstvo(p.quantity, lokalJazyka(jazyk)) : "—"}
                  {p.unit ? ` ${p.unit}` : ""}
                </span>
              </BunkaPolozky>
              <BunkaPolozky
                popis={t("Cena za kus")}
                uzky={5}
                poradie={4}
                className="@min-[560px]:items-end"
              >
                <span className={cn(cislo, "@min-[560px]:text-right")}>{suma(p.unit_price)}</span>
              </BunkaPolozky>
              <BunkaPolozky popis={t("DPH")} uzky={3} poradie={5} vpravo>
                <span className={cislo}>
                  {prenesenie || p.prenesenie
                    ? t("PDP")
                    : p.vat_rate != null
                      ? `${p.vat_rate} %`
                      : "—"}
                </span>
              </BunkaPolozky>
              <BunkaPolozky popis={t("Spolu")} uzky={5} poradie={2} vpravo skrytyPopis>
                <span className={cn(cislo, "font-semibold")}>{suma(p.total)}</span>
              </BunkaPolozky>
              {zlava > 0 || p.description ? (
                <PodriadokPolozky poradie={6}>
                  <div className="col-span-12 min-w-0 text-xs text-muted-foreground">
                    {zlava > 0 ? <div>{t("Zľava {n} %", { n: zlava })}</div> : null}
                    {p.description ? (
                      <div className="whitespace-pre-line [overflow-wrap:anywhere]">
                        {p.description}
                      </div>
                    ) : null}
                  </div>
                </PodriadokPolozky>
              ) : null}
            </RiadokPolozky>
          );
        })}
      </div>
    </PolozkyKontajner>
  );
}
