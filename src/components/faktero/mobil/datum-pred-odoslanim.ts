import { toast } from "sonner";
import { useOperacia } from "@/lib/mobile/server-most";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { potvrd } from "@/lib/potvrdenie";
import type { KontrolaDatumu } from "@/lib/faktero/datum-vystavenia";
import { datum } from "./PrijateDoklady";

/**
 * Dátum vystavenia pred prvým odoslaním faktúry z appky — to isté pravidlo
 * ako okno na webe (server ho kontroluje znova a bez zmeny dátumu mail
 * neodošle). Vráti `null`, keď človek odoslanie zrušil.
 */
export function useDatumPredOdoslanim() {
  const { t, locale: loc } = usePreklad();
  const kontrolaFn = useOperacia<Record<string, KontrolaDatumu>>("faktura-datum-kontrola");
  const zmenFn = useOperacia("faktura-datum-na-dnes");

  return async function over(
    invoiceId: string,
  ): Promise<{ potvrdenyStaryDatum: boolean; zmenene: boolean } | null> {
    let k: KontrolaDatumu | undefined;
    try {
      k = (await kontrolaFn({ data: { invoiceIds: [invoiceId] } }))[invoiceId];
    } catch {
      // Bez spojenia rozhodne server pri odoslaní.
      return { potvrdenyStaryDatum: false, zmenene: false };
    }
    if (!k?.treba) return { potvrdenyStaryDatum: false, zmenene: false };

    const povodny = datum(k.datum, loc);
    if (!k.mozno) {
      const ano = await potvrd(
        [t("datum.nadpis", { datum: povodny }), t("datum.nedaSa")].join("\n"),
        {
          potvrdit: t("datum.odoslatSDatumom", { datum: povodny }),
          nebezpecne: false,
        },
      );
      return ano ? { potvrdenyStaryDatum: true, zmenene: false } : null;
    }

    const riadky = [
      t("datum.nadpis", { datum: povodny }),
      t("datum.zmena", { dnes: datum(k.dnes, loc) }),
      k.novaSplatnost ? t("datum.splatnost", { datum: datum(k.novaSplatnost, loc) }) : "",
      k.dodanie ? t("datum.dodanie", { datum: datum(k.dodanie, loc) }) : "",
      k.ineObdobie && k.cislo ? t("datum.cislo", { cislo: k.cislo }) : "",
    ].filter(Boolean);
    const ano = await potvrd(riadky.join("\n"), {
      potvrdit: t("datum.zmenitAOdoslat"),
      nebezpecne: false,
    });
    if (!ano) return null;
    try {
      await zmenFn({ data: { invoiceId } });
    } catch (e: any) {
      toast.error(e?.message ?? t("datum.chybaZmeny"));
      return null;
    }
    toast.success(t("datum.zmeneny"));
    return { potvrdenyStaryDatum: false, zmenene: true };
  };
}
