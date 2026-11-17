/*
  Nastavenia firmy (/firma) v testovacej firme: čo testovacia firma je,
  vymazanie jej údajov a vysvetlenie, prečo sa členovia spravujú inde.
*/
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { oznamZmenuFiriem } from "@/lib/faktero/active-company";
import { vymazTestovaciuFirmuFn } from "@/lib/faktero/testovacia-firma.functions";
import { PREDPONA_TESTOVACEJ } from "@/lib/faktero/testovacia-firma";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

/** Názov skutočnej firmy k testovacej (člen testovacej je vždy aj členom skutočnej). */
export function useNazovSkutocnejFirmy(
  firma: {
    name?: string | null;
    testovacia_pre?: string | null;
  } | null,
): string | null {
  const [nazov, setNazov] = useState<string | null>(null);
  const rodic = firma?.testovacia_pre ?? null;
  useEffect(() => {
    if (!rodic) return setNazov(null);
    // Kým príde odpoveď (alebo keby neprišla), názov z „Test – …“.
    const n = String(firma?.name ?? "");
    setNazov(n.startsWith(PREDPONA_TESTOVACEJ) ? n.slice(PREDPONA_TESTOVACEJ.length) : n);
    let zrusene = false;
    supabase
      .from("companies")
      .select("name")
      .eq("id", rodic)
      .maybeSingle()
      .then(({ data }) => {
        if (!zrusene && data?.name) setNazov(data.name);
      });
    return () => {
      zrusene = true;
    };
  }, [rodic, firma?.name]);
  return nazov;
}

export function TestovaciaFirmaSekcia({
  companyId,
  nazovSkutocnej,
  smieVymazat,
  onVymazane,
}: {
  companyId: string;
  nazovSkutocnej: string;
  smieVymazat: boolean;
  onVymazane?: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const vymaz = useServerFn(vymazTestovaciuFirmuFn);
  const [bezi, setBezi] = useState(false);

  async function vymazUdaje() {
    const ano = await potvrd(
      t(
        "Vymazať všetky údaje testovacej firmy? Zmažú sa doklady, kontakty, súbory aj nastavenia a firma sa založí znova podľa {nazov}. Skutočnej firmy sa to nedotkne.",
        { nazov: nazovSkutocnej },
      ),
      { potvrdit: t("Vymazať údaje"), nebezpecne: true },
    );
    if (!ano) return;
    setBezi(true);
    try {
      await vymaz({ data: { company_id: companyId } });
      await qc.invalidateQueries();
      oznamZmenuFiriem();
      toast.success(t("Údaje testovacej firmy sú vymazané."));
      onVymazane?.();
    } catch (e: any) {
      toast.error(e?.message ?? t("Údaje testovacej firmy sa nepodarilo vymazať."));
    } finally {
      setBezi(false);
    }
  }

  return (
    <section
      aria-labelledby="testovacia-firma-nadpis"
      className="mb-6 rounded-xl border border-warning/40 bg-warning/5 p-5 sm:p-6"
    >
      <h2
        id="testovacia-firma-nadpis"
        className="flex items-center gap-2 text-base font-semibold text-foreground"
      >
        <FlaskConical className="h-4 w-4 text-warning" aria-hidden />
        {t("Testovacia firma")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "Kópia firmy {nazov} na skúšanie. Faktúry, doklady aj nastavenia si tu môžete vyskúšať naostro — nič sa neodosiela (e-maily, eFaktúra, banka, Pohoda) a nič neovplyvní skutočnú firmu. Predplatné je zadarmo.",
          { nazov: nazovSkutocnej },
        )}
      </p>
      {smieVymazat && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={bezi}
            onClick={() => void vymazUdaje()}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {bezi ? t("Mažem…") : t("Vymazať údaje testovacej firmy")}
          </button>
          <span className="text-xs text-muted-foreground">
            {t("Firma sa založí znova s údajmi a členmi zo skutočnej firmy.")}
          </span>
        </div>
      )}
    </section>
  );
}

/** Namiesto „Používatelia a pozvánky“ v testovacej firme. */
export function TestovaciaFirmaClenovia({ nazovSkutocnej }: { nazovSkutocnej: string }) {
  const { t } = useT();
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t("Používatelia a pozvánky")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("Členov testovacej firmy spravujete v skutočnej firme {nazov}.", {
          nazov: nazovSkutocnej,
        })}{" "}
        {t("Testovaciu firmu nejde zmazať samostatne — zmaže sa spolu so skutočnou firmou.")}
      </p>
    </section>
  );
}
