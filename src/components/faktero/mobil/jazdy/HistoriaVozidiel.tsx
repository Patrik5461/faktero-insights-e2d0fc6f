import { useEffect, useState } from "react";
import { Car } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { mojeVozidlo } from "@/lib/mobile/moje-vozidlo";
import { ListCard, ListRow, PrazdnyStav, ScreenHeader, SectionHeader } from "../ui";
import { Pracujem } from "../MobilChrome";
import { HistoriaJazd } from "../HistoriaJazd";
import { useVozidla, type Vozidlo } from "./useVozidla";

/**
 * Záložka História.
 *
 * Kniha jázd sa vedie po vozidlách, takže obrazovka najprv potrebuje vedieť,
 * o ktoré auto ide. Keď je jediné, alebo keď si vodič nastavil „moje vozidlo",
 * preskočí sa výber rovno na jazdy — pýtať sa na to isté pri každom otvorení
 * je otrava.
 */
export function HistoriaVozidiel({
  firma,
  onSpat,
  vybrane,
  onVyber,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  /**
   * Vybrané vozidlo drží obal appky, nie táto obrazovka.
   *
   * Zoznam jázd si nesie vlastnú hlavičku so šípkou späť a obal nad ňou
   * kreslí svoju s menom firmy. Dve hlavičky nad sebou si každá rezervujú
   * miesto pre výrez — a to je tá medzera hore. Obal preto musí vedieť už
   * pri vykresľovaní, že si obrazovka hlavičku rieši sama.
   */
  vybrane: Vozidlo | null;
  onVyber: (v: Vozidlo | null) => void;
}) {
  const { t } = usePreklad();
  const { vozidla } = useVozidla(firma.id);
  /* Predvýber sa robí raz. Bez toho by sa vozidlo nasadilo znova hneď po tom,
     ako sa človek vráti na výber. */
  const [predvybrane, setPredvybrane] = useState(false);

  useEffect(() => {
    if (!vozidla || predvybrane) return;
    setPredvybrane(true);
    if (vozidla.length === 1) return onVyber(vozidla[0]);
    const moje = mojeVozidlo(firma.id);
    const n = moje ? vozidla.find((v) => v.id === moje) : null;
    if (n) onVyber(n);
  }, [vozidla, predvybrane, firma.id, onVyber]);

  if (vozidla === null) return <Pracujem text={t("jz.nacitavamVozidla")} />;

  if (vybrane)
    return (
      <HistoriaJazd
        firma={firma}
        vozidlo={vybrane}
        /* Pri jedinom aute niet kam sa vracať na výber — ide sa na prehľad. */
        onSpat={() => (vozidla.length > 1 ? onVyber(null) : onSpat())}
      />
    );

  return (
    <div className="flex flex-1 flex-col bg-app-pozadie">
      <div className="px-4">
        <ScreenHeader title={t("jazdy.historia")} subtitle={firma.name} />
      </div>
      <main className="flex-1 px-4 pb-6">
        {vozidla.length === 0 ? (
          <PrazdnyStav icon={Car} title={t("jz.bezVozidla")} popis={t("jz.pridajteHo")} />
        ) : (
          <section>
            <SectionHeader title={t("kj.vyberVozidla")} />
            <ListCard>
              {vozidla.map((v) => (
                <ListRow
                  key={v.id}
                  icon={Car}
                  title={v.name}
                  subtitle={v.license_plate ?? undefined}
                  chevron
                  onClick={() => onVyber(v)}
                />
              ))}
            </ListCard>
            <p className="mt-3 text-[13px] text-app-text-2">{t("kj.vyberVozidlaPopis")}</p>
          </section>
        )}
      </main>
    </div>
  );
}
