import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { krajinaDokladu, pravidloSedi, type Pravidlo } from "@/lib/faktero/pravidla-uctovania";
import type { Predloha } from "@/lib/faktero/predlohy-uctovania";
import { useT } from "@/lib/i18n/useT";
import { PouzitPredlohu } from "./PouzitPredlohu";
import { PravidloZDokladu } from "./PravidloZDokladu";

/** Hodnoty, z ktorých sa dá založiť nové pravidlo („Vytvoriť automatické účtovanie"). */
export type ZakladPravidla = {
  predkontacia?: string | null;
  clenenie?: string | null;
  kv?: string | null;
  kategoria?: string | null;
  pokladna?: string | null;
};

/**
 * Pravidlá účtovania pri doklade (ako „Aplikovať automatické účtovanie"
 * v Doklado). Spúšťač v databáze doplní prvé zhodné pravidlo sám; keď ich
 * dodávateľ má viac, tu si človek vyberie iné. Hviezdička ukazuje, že kódy
 * doplnilo pravidlo.
 */
export function VyberPravidla({
  companyId,
  doklad,
  druh = "blocek",
  typ,
  zaklad,
  onPouzi,
  onPredloha,
}: {
  companyId: string;
  doklad: {
    supplier_ico?: string | null;
    supplier_name?: string | null;
    payment_method?: string | null;
    pravidlo_id?: string | null;
    created_by?: string | null;
    predmet_mailu?: string | null;
    odosielatel_mailu?: string | null;
    supplier_country?: string | null;
    supplier_ic_dph?: string | null;
    variable_symbol?: string | null;
  };
  druh?: "blocek" | "prijata" | "vystavena";
  typ?: string | null;
  /** Súčasné kódy dokladu — predvyplnia nové pravidlo. */
  zaklad?: ZakladPravidla;
  onPouzi: (p: Pravidlo) => void;
  /** „Použiť predlohu" — pomenovaná šablóna kódov bez podmienky. */
  onPredloha?: (p: Predloha) => void;
}) {
  const { t } = useT();
  const [pravidla, setPravidla] = useState<(Pravidlo & { id: string })[]>([]);
  const [vybrane, setVybrane] = useState("");
  const [krajinaFirmy, setKrajinaFirmy] = useState<string | null>(null);

  useEffect(() => {
    // Tabuľka nie je v generovaných typoch — pravidlá číta aj stránka pravidiel takto.
    supabase
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .eq("aktivne", true)
      .order("poradie")
      .then(({ data }: { data: unknown[] | null }) => setPravidla((data ?? []) as any));
    supabase
      .from("companies")
      .select("country")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => setKrajinaFirmy((data?.country as string | null) ?? null));
  }, [companyId]);

  const zhodne = pravidla.filter((p) =>
    pravidloSedi(p, {
      supplier_ico: doklad.supplier_ico ?? null,
      supplier_name: doklad.supplier_name ?? null,
      payment_method: doklad.payment_method ?? null,
      created_by: doklad.created_by ?? null,
      predmet_mailu: doklad.predmet_mailu ?? null,
      odosielatel_mailu: doklad.odosielatel_mailu ?? null,
      krajina:
        druh === "vystavena"
          ? null
          : krajinaDokladu(doklad.supplier_country, doklad.supplier_ic_dph),
      krajina_firmy: krajinaFirmy,
      variabilny_symbol: druh === "prijata" ? (doklad.variable_symbol ?? null) : null,
      druh,
      typ: typ ?? null,
    }),
  );
  const pouzite = pravidla.find((p) => p.id === doklad.pravidlo_id);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {onPredloha ? (
        <PouzitPredlohu companyId={companyId} druh={druh} onPouzi={onPredloha} />
      ) : null}
      {pouzite ? (
        <span
          className="inline-flex items-center gap-1 text-amber-700"
          title={t("Kódy doplnilo pravidlo účtovania")}
        >
          <Star className="h-3.5 w-3.5 fill-current" />{" "}
          {t("Pravidlo „{nazov}“", { nazov: pouzite.nazov })}
        </span>
      ) : null}
      {zhodne.some((p) => p.id !== pouzite?.id) ? (
        <>
          <select
            aria-label={t("Pravidlo účtovania")}
            value={vybrane}
            onChange={(e) => setVybrane(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">{pouzite ? t("Iné pravidlo…") : t("Použiť pravidlo…")}</option>
            {zhodne
              .filter((p) => p.id !== pouzite?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nazov}
                  {p.predkontacia ? ` — ${p.predkontacia}` : ""}
                  {p.clenenie_dph ? ` / ${p.clenenie_dph}` : ""}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!vybrane}
            onClick={() => {
              const p = zhodne.find((x) => x.id === vybrane);
              if (p) onPouzi(p);
              setVybrane("");
            }}
            className="rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50"
          >
            {t("Použiť")}
          </button>
        </>
      ) : null}
      {pouzite ? (
        <Link
          to="/uctovnictvo/pravidla"
          search={{ upravit: pouzite.id } as any}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" /> {t("Upraviť pravidlo")}
        </Link>
      ) : !zhodne.length ? (
        /* Ako „Vytvoriť automatické účtovanie" v Doklado — ďalší doklad od
           tohto partnera dostane tie isté kódy sám; podobné pravidlo sa nezdvojí. */
        <PravidloZDokladu
          companyId={companyId}
          zaklad={{
            druh,
            nazov: doklad.supplier_name,
            ico: doklad.supplier_ico,
            odosielatel: doklad.odosielatel_mailu,
            vs: doklad.variable_symbol,
            platba: doklad.payment_method,
            predkontacia: zaklad?.predkontacia,
            clenenie: zaklad?.clenenie,
            kv: zaklad?.kv,
            kategoria: zaklad?.kategoria,
            pokladna: zaklad?.pokladna,
          }}
        />
      ) : null}
      {/* Samotné „pravidlá“ viselo osamote bez súvislosti — povedz, kam odkaz vedie. */}
      <Link to="/uctovnictvo/pravidla" className="text-primary hover:underline">
        {t("Pravidlá účtovania →")}
      </Link>
    </div>
  );
}
