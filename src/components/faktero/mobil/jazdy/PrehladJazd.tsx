import { useEffect, useMemo, useState } from "react";
import { Car, Route, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { jeSukromnaJazda } from "@/lib/faktero/trip-format";
import { nacitajRozpoznaneJazdy } from "@/lib/mobile/auto-jazdy-sync";
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
  /*
    Ktorý charakter jázd je práve vybraný.

    Karty nad zoznamom nikam nevedú — ťuknutie na ne zúži zoznam pod nimi na
    tie jazdy, ktoré to číslo tvoria. Je to najkratšia cesta k otázke „a ktoré
    to boli?", ktorá príde hneď po tom, čo človek uvidí súčet. Druhé ťuknutie
    na tú istú kartu výber zruší.
  */
  const [filter, setFilter] = useState<"sluzobne" | "sukromne" | null>(null);
  /*
    Jazdy, ktoré appka rozpoznala, ale do knihy ešte nešli. Vodič ich musí
    vidieť hneď na úvodnej obrazovke: kým ich nezapíše, v knihe nie sú a
    mesačný súčet nad tým klame o ich kilometre.
  */
  const [nezapisane, setNezapisane] = useState(0);

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

  useEffect(() => {
    let zrusene = false;
    void (async () => {
      // Mimo appky plugin nie je — zoznam vtedy príde prázdny, nie s chybou.
      const cakajuce = await nacitajRozpoznaneJazdy().catch(() => []);
      if (!zrusene) setNezapisane(cakajuce.length);
    })();
    return () => {
      zrusene = true;
    };
  }, []);

  const suhrn = useMemo(() => {
    const z = jazdy ?? [];
    const km = (v: Jazdenka[]) => v.reduce((s, j) => s + Number(j.distance_km || 0), 0);
    /*
      Charakter jazdy rozhoduje jedna funkcia pre celú appku. Táto obrazovka
      si ho kedysi porovnávala sama — a proti hodnote „personal", ktorú do
      `classification` nikto nikdy nezapísal. Súkromné jazdy tak padali do
      služobných a súčet nad kartou „Súkromné" ostal navždy na nule.
    */
    const sukromne = z.filter(jeSukromnaJazda);
    const sluzobne = z.filter((j) => !jeSukromnaJazda(j));
    return {
      sluzobne,
      sukromne,
      pocetSluzobne: sluzobne.length,
      pocetSukromne: sukromne.length,
      kmSluzobne: km(sluzobne),
      kmSukromne: km(sukromne),
    };
  }, [jazdy]);

  const nacitava = jazdy === null;
  /*
    Bez filtra je to výber posledných šiestich — zvyšok je v Histórii. S ním
    sa vypisujú všetky, ktoré doň patria: keď si človek vypýta súkromné jazdy,
    chce ich vidieť všetky, nie šesť z nich.
  */
  const zobrazene =
    filter === "sukromne"
      ? suhrn.sukromne
      : filter === "sluzobne"
        ? suhrn.sluzobne
        : (jazdy ?? []).slice(0, 6);

  /** Prázdna skupina sa nedá otvoriť — nebolo by v nej čo ukázať. */
  const prepni = (ktory: "sluzobne" | "sukromne", pocet: number) =>
    pocet > 0 ? () => setFilter((s) => (s === ktory ? null : ktory)) : undefined;
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

        {/* Kým rozpoznaná jazda nie je zapísaná, v knihe nie je — a mesačný
            súčet pod tým o jej kilometre klame. Preto navrch, nie do zoznamu. */}
        {nezapisane > 0 && (
          <ListCard>
            <ListRow
              icon={TriangleAlert}
              ikonaTon="cervena"
              title={
                nezapisane === 1
                  ? t("kj.nezapisanaJedna")
                  : t("kj.nezapisaneJazdy", { pocet: nezapisane })
              }
              subtitle={t("kj.nezapisanePopis")}
              chevron
              onClick={onJazda}
            />
          </ListCard>
        )}

        {/* Jediné, kvôli čomu sa táto appka otvára v aute. Patrí navrch. */}
        <PrimaryCta onClick={onJazda}>{t("jz.zacatJazdu")}</PrimaryCta>

        <section>
          <SectionHeader title={t("kj.tentoMesiac")} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t("kj.sluzobne")}
              value={nacitava ? "—" : km(suhrn.kmSluzobne)}
              hint={nacitava ? undefined : pocetJazd(suhrn.pocetSluzobne)}
              ton="zelena"
              aktivna={filter === "sluzobne"}
              onClick={prepni("sluzobne", suhrn.pocetSluzobne)}
            />
            <StatCard
              label={t("kj.sukromne")}
              value={nacitava ? "—" : km(suhrn.kmSukromne)}
              hint={nacitava ? undefined : pocetJazd(suhrn.pocetSukromne)}
              aktivna={filter === "sukromne"}
              onClick={prepni("sukromne", suhrn.pocetSukromne)}
            />
          </div>
        </section>

        <section>
          <SectionHeader
            title={
              filter === null
                ? t("kj.posledneJazdy")
                : t(filter === "sukromne" ? "kj.sukromne" : "kj.sluzobne")
            }
          />
          {nacitava ? (
            <Card className="px-4 py-5">
              <p className="text-[15px] text-app-text-2">{t("jazdy.nacitavam")}</p>
            </Card>
          ) : zobrazene.length > 0 ? (
            <ListCard>
              {zobrazene.map((j) => (
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
                      text={jeSukromnaJazda(j) ? t("jazdy.sukromna") : t("jazdy.sluzobna")}
                      ton={jeSukromnaJazda(j) ? "neutral" : "zelena"}
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
