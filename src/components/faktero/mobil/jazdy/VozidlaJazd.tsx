import { useEffect, useState } from "react";
import { Car, Plus, Satellite } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { mojeVozidlo, zapamatajVozidlo } from "@/lib/mobile/moje-vozidlo";
import { nastavVozidloVNotifikacii, vozidlaSCommanderom } from "@/lib/mobile/auto-jazdy-sync";
import { ListCard, ListRow, PrazdnyStav, ScreenHeader, StatusBadge } from "../ui";
import { HlavneTlacidlo, Pracujem } from "../MobilChrome";
import { NoveVozidlo } from "../Jazda";
import { useVozidla } from "./useVozidla";

/**
 * Vozidlá firmy.
 *
 * Ťuknutím sa auto stane „mojím" — voľbou, ktorú si telefón pamätá a ponúka
 * pri každej jazde aj v notifikácii z rozpoznávania. Bez nej sa vodič pri
 * každej jazde prehrabáva zoznamom.
 *
 * Kniha jázd sa odtiaľto neotvára zámerne: riadok by musel niesť dve akcie,
 * teda tlačidlo v tlačidle. Na jazdy je vlastná záložka a v nej ten istý
 * výber vozidla.
 */
export function VozidlaJazd({
  firma,
  pridavam,
  onPridavam,
}: {
  firma: { id: string; name: string };
  /**
   * Pridávanie vozidla drží obal appky — obrazovka „Nové vozidlo" si nesie
   * vlastnú hlavičku a obal nad ňou nesmie kresliť svoju. Dve hlavičky nad
   * sebou si každá rezervujú miesto pre výrez a vznikne medzera.
   */
  pridavam: boolean;
  onPridavam: (v: boolean) => void;
}) {
  const { t } = usePreklad();
  const { vozidla, nezistene, nacitaj } = useVozidla(firma.id);
  const [commander, setCommander] = useState<Set<string>>(new Set());
  const [moje, setMoje] = useState<string | null>(null);

  useEffect(() => setMoje(mojeVozidlo(firma.id)), [firma.id]);

  useEffect(() => {
    let zrusene = false;
    vozidlaSCommanderom(firma.id)
      .then((s) => !zrusene && setCommander(s))
      .catch(() => {});
    return () => {
      zrusene = true;
    };
  }, [firma.id]);

  function vyberMoje(v: { id: string; name: string }) {
    zapamatajVozidlo(firma.id, v.id);
    setMoje(v.id);
    /* Notifikácia z rozpoznávania ponúka práve toto auto — nech sedí hneď. */
    void nastavVozidloVNotifikacii(v.name);
  }

  if (pridavam)
    return (
      <NoveVozidlo
        firma={firma}
        onSpat={() => onPridavam(false)}
        onPridane={async () => {
          onPridavam(false);
          await nacitaj();
        }}
      />
    );

  if (vozidla === null) return <Pracujem text={t("jz.nacitavamVozidla")} />;

  return (
    <div className="flex flex-1 flex-col bg-app-pozadie">
      <div className="px-4">
        <ScreenHeader title={t("kj.tabVozidla")} subtitle={t("kj.mojeVozidloPopis")} />
      </div>

      <main className="flex-1 space-y-4 px-4 pb-6">
        {vozidla.length === 0 ? (
          <PrazdnyStav
            icon={Car}
            title={nezistene ? t("jz.bezPripojenia") : t("jz.bezVozidla")}
            popis={nezistene ? t("jz.bezZoznamu") : t("jz.pridajteHo")}
            akcia={
              nezistene ? undefined : (
                <HlavneTlacidlo onClick={() => onPridavam(true)}>
                  {t("jz.pridatVozidlo")}
                </HlavneTlacidlo>
              )
            }
          />
        ) : (
          <>
            <section>
              <ListCard>
                {vozidla.map((v) => (
                  <ListRow
                    key={v.id}
                    icon={commander.has(v.id) ? Satellite : Car}
                    title={v.name}
                    subtitle={
                      commander.has(v.id)
                        ? [v.license_plate, t("jz.commander")].filter(Boolean).join(" · ")
                        : (v.license_plate ?? undefined)
                    }
                    right={v.id === moje ? <StatusBadge text={t("kj.mojeVozidlo")} /> : undefined}
                    onClick={() => vyberMoje(v)}
                  />
                ))}
              </ListCard>
            </section>

            <button
              type="button"
              onClick={() => onPridavam(true)}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-app border border-dashed border-app-ramik px-4 py-3.5 text-[14px] text-app-text-2"
            >
              <Plus className="h-4 w-4" /> {t("jz.pridatVozidlo")}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
