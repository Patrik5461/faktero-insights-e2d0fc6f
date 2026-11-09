import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { navrhniParovanie, potvrdParovanie, zrusParovanie } from "@/lib/faktero/parovanie.functions";
import {
  navrhniParovaniePrijatych,
  potvrdParovaniePrijatej,
  uhradyPrijatych,
  zrusParovaniePrijatej,
} from "@/lib/faktero/prijata-parovanie.functions";
import {
  navrhPodlaDokladu,
  navrhyZPrijatych,
  navrhyZVydanych,
  type DruhZalohy,
  type NavrhPlatbyZalohy,
} from "@/lib/faktero/zalohove-platby";

/** Pohyb z účtu, ktorý zálohovú uhradil. */
export type UhradaZalohy = {
  datum: string;
  transactionId: string;
  suma: number;
  protistrana: string | null;
};

const PO = 300;

/**
 * Väzby a návrhy platieb pre zálohové faktúry.
 *
 * Návrhy sa počítajú existujúcim párovaním (vydané `navrhniParovanie`,
 * prijaté `navrhniParovaniePrijatych` len pre zálohové) a potvrdzujú sa
 * rovnako ako tam — nič sa nepáruje bez kliku človeka.
 */
export function usePlatbyZaloh(
  druh: DruhZalohy,
  companyId: string | null,
  ids: string[],
  onZmena?: () => void | Promise<void>,
) {
  const { t } = useT();
  const [navrhy, setNavrhy] = useState<NavrhPlatbyZalohy[]>([]);
  const [navrhyNacitane, setNavrhyNacitane] = useState(false);
  const [uhrady, setUhrady] = useState<Record<string, UhradaZalohy>>({});
  const [parujem, setParujem] = useState<string | null>(null);

  const navrhyVydanychFn = useServerFn(navrhniParovanie);
  const sparujVydanuFn = useServerFn(potvrdParovanie);
  const zrusVydanuFn = useServerFn(zrusParovanie);
  const navrhyPrijatychFn = useServerFn(navrhniParovaniePrijatych);
  const sparujPrijatuFn = useServerFn(potvrdParovaniePrijatej);
  const zrusPrijatuFn = useServerFn(zrusParovaniePrijatej);
  const uhradyPrijatychFn = useServerFn(uhradyPrijatych);

  const nacitajNavrhy = useCallback(async () => {
    if (!companyId) return;
    try {
      if (druh === "vydana") {
        const r: any = await navrhyVydanychFn({ data: { companyId } });
        setNavrhy(navrhyZVydanych(r));
      } else {
        const r: any = await navrhyPrijatychFn({ data: { company_id: companyId, typ: "proforma" } });
        setNavrhy(navrhyZPrijatych(r?.zhody));
      }
    } catch {
      // Návrhy sú pomoc navyše (napr. bez prístupu k Banke) — zoznam funguje ďalej.
      setNavrhy([]);
    } finally {
      setNavrhyNacitane(true);
    }
  }, [companyId, druh, navrhyVydanychFn, navrhyPrijatychFn]);

  const kluc = ids.join(",");
  const nacitajUhrady = useCallback(async () => {
    if (!companyId || !ids.length) {
      setUhrady({});
      return;
    }
    const vysledok: Record<string, UhradaZalohy> = {};
    try {
      for (let i = 0; i < ids.length; i += PO) {
        const kus = ids.slice(i, i + PO);
        if (druh === "prijata") {
          const r: any = await uhradyPrijatychFn({ data: { company_id: companyId, ids: kus } });
          Object.assign(vysledok, r?.uhrady ?? {});
        } else {
          const { data } = await supabase
            .from("bank_transactions")
            .select("id, matched_invoice_id, booking_date, amount, counterparty")
            .eq("company_id", companyId)
            .in("matched_invoice_id", kus);
          for (const r of (data as any[]) ?? []) {
            vysledok[r.matched_invoice_id] = {
              datum: r.booking_date,
              transactionId: r.id,
              suma: Number(r.amount),
              protistrana: r.counterparty ?? null,
            };
          }
        }
      }
    } catch {
      // Bez väzieb ostane len stav dokladu.
    }
    setUhrady(vysledok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, druh, kluc, uhradyPrijatychFn]);

  useEffect(() => {
    void nacitajNavrhy();
  }, [nacitajNavrhy]);
  useEffect(() => {
    void nacitajUhrady();
  }, [nacitajUhrady]);

  const podlaDokladu = useMemo(() => navrhPodlaDokladu(navrhy), [navrhy]);

  async function sparuj(z: NavrhPlatbyZalohy) {
    if (!companyId) return;
    setParujem(z.transactionId);
    try {
      if (druh === "vydana") {
        const r: any = await sparujVydanuFn({
          data: {
            companyId,
            pary: [{ transactionId: z.transactionId, invoiceId: z.dokladId, suma: z.suma }],
          },
        });
        if (!r?.zapisanych) throw new Error(r?.preskocene?.[0] ?? t("Spárovať sa to nepodarilo."));
      } else {
        await sparujPrijatuFn({
          data: { transaction_id: z.transactionId, purchase_invoice_id: z.dokladId },
        });
      }
      toast.success(t("Spárované, zálohová faktúra je uhradená."));
      setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId));
      await onZmena?.();
      await nacitajUhrady();
    } catch (e: any) {
      toast.error(e?.message ?? t("Spárovať sa to nepodarilo."));
    } finally {
      setParujem(null);
    }
  }

  async function rozparuj(transactionId: string) {
    if (!companyId) return;
    try {
      if (druh === "vydana") await zrusVydanuFn({ data: { companyId, transactionId } });
      else await zrusPrijatuFn({ data: { transaction_id: transactionId } });
      toast.success(t("Väzba zrušená."));
      await onZmena?.();
      await nacitajUhrady();
      await nacitajNavrhy();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zrušiť sa to nepodarilo."));
    }
  }

  /** „Nie“ — návrh sa do ďalšieho načítania skryje. */
  function odmietni(transactionId: string) {
    setNavrhy((n) => n.filter((i) => i.transactionId !== transactionId));
  }

  return {
    navrhy,
    navrhyNacitane,
    podlaDokladu,
    uhrady,
    parujem,
    sparuj,
    rozparuj,
    odmietni,
    nacitajNavrhy,
    nacitajUhrady,
  };
}

export type PlatbyZaloh = ReturnType<typeof usePlatbyZaloh>;
