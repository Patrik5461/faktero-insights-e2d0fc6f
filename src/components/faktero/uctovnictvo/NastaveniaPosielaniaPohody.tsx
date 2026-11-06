/*
  „Čo sa do Pohody posiela“ — adresár, skladové karty, skladové pohyby a
  zákazky. Presunuté z Prepojenia s Pohodou do Nastavení exportu na stránke
  Predkontácie; stĺpce ostávajú na `companies` a ukladajú sa len tu.
*/
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";

const POLIA = [
  "pohoda_posielat_adresar",
  "pohoda_posielat_sklad",
  "pohoda_posielat_pohyby",
  "pohoda_posielat_zakazky",
] as const;
type Kluc = (typeof POLIA)[number];
type Hodnoty = Record<Kluc, boolean>;

export function NastaveniaPosielaniaPohody({ companyId }: { companyId: string }) {
  const { t } = useT();
  const [c, setC] = useState<Hodnoty | null>(null);
  const [uklada, setUklada] = useState(false);

  useEffect(() => {
    let zrusene = false;
    supabase
      .from("companies")
      .select(POLIA.join(","))
      .eq("id", companyId)
      .single()
      .then(({ data }) => {
        if (zrusene) return;
        const d = (data ?? {}) as Partial<Record<Kluc, boolean | null>>;
        setC(Object.fromEntries(POLIA.map((k) => [k, !!d[k]])) as Hodnoty);
      });
    return () => {
      zrusene = true;
    };
  }, [companyId]);

  if (!c) return null;

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (!c) return;
    setUklada(true);
    const { error } = await supabase
      .from("companies")
      .update(c as never)
      .eq("id", companyId);
    setUklada(false);
    if (error) return toast.error(error.message);
    toast.success(t("Uložené"));
  }

  const prepinac = (k: Kluc, nadpis: string, popis: React.ReactNode, siroky = false) => (
    <label
      className={
        "flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 hover:bg-muted/40" +
        (siroky ? " sm:col-span-2" : "")
      }
    >
      <input
        type="checkbox"
        checked={c[k]}
        onChange={(e) => setC({ ...c, [k]: e.target.checked })}
        className="mt-0.5 h-4 w-4"
      />
      <span className="min-w-0 text-sm font-medium">
        {nadpis}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{popis}</span>
      </span>
    </label>
  );

  return (
    <form
      onSubmit={uloz}
      aria-label={t("Čo sa do Pohody posiela")}
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5"
    >
      <div className="sm:col-span-2">
        <h3 className="mb-1 text-base font-semibold text-foreground">
          {t("Čo sa do Pohody posiela")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Faktúry, prijaté doklady a pokladňa idú vždy. Ostatné si zapnite podľa toho, čo má účtovníčka viesť.",
          )}
        </p>
      </div>
      {prepinac(
        "pohoda_posielat_adresar",
        t("Posielať adresár"),
        <>
          {t(
            "Odberatelia idú do Pohody aj vtedy, keď im tento mesiac nič nefakturujeme. Zmenený kontakt sa prepíše, nezaloží sa druhý.",
          )}{" "}
          {t(
            "Len partnerov z dokladov a ich párovanie s dokladom nastavíte vyššie v Exporte do účtovného programu.",
          )}
        </>,
      )}
      {prepinac(
        "pohoda_posielat_sklad",
        t("Posielať skladové karty"),
        <>
          {t("Posiela sa")} <strong>{t("číselník zásob")}</strong>
          {t(
            ", nie stav skladu — ten v Pohode vzniká príjemkami a výdajkami. Potrebuje vyplnené členenie skladu.",
          )}
        </>,
      )}
      {prepinac(
        "pohoda_posielat_pohyby",
        t("Posielať skladové pohyby"),
        <>
          {t("Príjemky a výdajky, aby v Pohode sedeli")} <strong>{t("stavy")}</strong>{" "}
          {t(
            "skladu, nielen karty. Príjemka ide s príznakom „neúčtovať“, aby sa náklad nezdvojil s prijatým dokladom. Potrebuje zapnuté skladové karty.",
          )}
        </>,
        true,
      )}
      {prepinac(
        "pohoda_posielat_zakazky",
        t("Posielať zákazky"),
        <>
          {t(
            "Faktúra potom v Pohode nesie zákazku, takže je z nej vidieť výnos po zákazkách. Zákazka odchádza",
          )}{" "}
          <strong>{t("raz")}</strong>{" "}
          {t(
            "— Pohoda ju vie založiť, ale nie prepísať, tak si neskoršiu zmenu názvu prepíšte aj tam.",
          )}
        </>,
        true,
      )}
      <div className="flex justify-end sm:col-span-2">
        <button
          type="submit"
          disabled={uklada}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {uklada ? t("Ukladám…") : t("Uložiť")}
        </button>
      </div>
    </form>
  );
}
