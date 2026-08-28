import { useEffect, useMemo, useState } from "react";
import { Car, Route } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  Card,
  ListCard,
  ListRow,
  PrazdnyStav,
  PrimaryCta,
  ScreenHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "../ui";
import { PrebiehaJazda } from "../PrebiehaJazda";

/**
 * Úvodná obrazovka appky Kniha jázd.
 *
 * Vodiča zaujímajú tri veci: či mu práve beží jazda, koľko má za mesiac
 * najazdené služobne a čo naposledy zapísal. Nič viac sa sem nepatrí —
 * mesačný súčet je to, čo sa prepisuje do vyúčtovania.
 *
 * Keď sa jazdy nenačítajú, ostanú sumy prázdne. Nula najazdených kilometrov
 * a „nedá sa načítať" vyzerajú rovnako a to prvé by bola nepravda.
 */

type Jazdenka = {
  id: string;
  trip_date: string;
  distance_km: number | null;
  classification: string | null;
  purpose: string | null;
  start_location: string | null;
  end_location: string | null;
};

/** Prvý deň aktuálneho mesiaca v tvare, v akom je `trip_date` v databáze. */
function odZaciatkuMesiaca(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function PrehladJazd({
  firma,
  onJazda,
  onHistoria,
}: {
  firma: { id: string; name: string };
  onJazda: () => void;
  onHistoria: () => void;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
  const [jazdy, setJazdy] = useState<Jazdenka[] | null>(null);

  useEffect(() => {
    let zrusene = false;
    void (async () => {
      // Bez siete dotaz nevráti chybu, ale vyhodí výnimku — a nezachytená by
      // nechala obrazovku navždy na pomlčkách.
      const { data, error } = await supabase
        .from("trips")
        .select("id, trip_date, distance_km, classification, purpose, start_location, end_location")
        .eq("company_id", firma.id)
        .gte("trip_date", odZaciatkuMesiaca())
        .order("trip_date", { ascending: false })
        .limit(200)
        .then(
          (r) => r,
          (e) => ({ data: null, error: e as unknown }),
        );
      if (zrusene) return;
      setJazdy(error || !data ? [] : (data as Jazdenka[]));
    })();
    return () => {
      zrusene = true;
    };
  }, [firma.id]);

  const suhrn = useMemo(() => {
    const z = jazdy ?? [];
    const km = (v: Jazdenka[]) => v.reduce((s, j) => s + Number(j.distance_km || 0), 0);
    const sluzobne = z.filter((j) => j.classification !== "personal");
    const sukromne = z.filter((j) => j.classification === "personal");
    return {
      pocet: z.length,
      kmSluzobne: km(sluzobne),
      kmSukromne: km(sukromne),
    };
  }, [jazdy]);

  const nacitava = jazdy === null;
  const km = (v: number) =>
    `${v.toLocaleString(loc, { maximumFractionDigits: 1 })} ${t("spolocne.km")}`;
  const pocetJazd = (pocet: number) =>
    `${pocet} ${mnozne(pocet, {
      one: t("kj.jazd1"),
      few: t("kj.jazd2"),
      other: t("kj.jazd5"),
    })}`;

  return (
    <div className="flex flex-1 flex-col bg-app-pozadie">
      <div className="px-4">
        <ScreenHeader title={t("kj.nazov")} subtitle={dnesSlovom(loc)} />
      </div>

      <main className="flex-1 space-y-6 px-4 pb-6">
        <PrebiehaJazda onOtvor={onJazda} />

        {/* Jediné, kvôli čomu sa táto appka otvára v aute. Patrí navrch. */}
        <PrimaryCta onClick={onJazda}>{t("jz.zacatJazdu")}</PrimaryCta>

        <section>
          <SectionHeader title={t("kj.tentoMesiac")} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t("kj.sluzobne")}
              value={nacitava ? "—" : km(suhrn.kmSluzobne)}
              hint={nacitava ? undefined : pocetJazd(suhrn.pocet)}
              ton="zelena"
              onClick={onHistoria}
            />
            <StatCard
              label={t("kj.sukromne")}
              value={nacitava ? "—" : km(suhrn.kmSukromne)}
              onClick={onHistoria}
            />
          </div>
        </section>

        <section>
          <SectionHeader title={t("kj.posledneJazdy")} />
          {nacitava ? (
            <Card className="px-4 py-5">
              <p className="text-[15px] text-app-text-2">{t("jazdy.nacitavam")}</p>
            </Card>
          ) : jazdy.length > 0 ? (
            <ListCard>
              {jazdy.slice(0, 6).map((j) => (
                <ListRow
                  key={j.id}
                  icon={Route}
                  title={
                    j.start_location && j.end_location
                      ? `${j.start_location} → ${j.end_location}`
                      : (j.purpose ?? t("jazdy.jazda"))
                  }
                  subtitle={new Date(j.trip_date).toLocaleDateString(loc, {
                    day: "numeric",
                    month: "numeric",
                  })}
                  right={km(Number(j.distance_km || 0))}
                  rightSub={
                    <StatusBadge
                      text={
                        j.classification === "personal" ? t("jazdy.sukromna") : t("jazdy.sluzobna")
                      }
                      ton={j.classification === "personal" ? "neutral" : "zelena"}
                    />
                  }
                  onClick={onHistoria}
                />
              ))}
            </ListCard>
          ) : (
            <PrazdnyStav icon={Car} title={t("kj.bezJazd")} popis={t("kj.bezJazdPopis")} />
          )}
        </section>
      </main>
    </div>
  );
}

/** „Streda, 27. augusta" — dátum do podnadpisu, meno firmy je v lište. */
function dnesSlovom(loc: string): string {
  const veta = new Date().toLocaleDateString(loc, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return veta.charAt(0).toUpperCase() + veta.slice(1);
}
