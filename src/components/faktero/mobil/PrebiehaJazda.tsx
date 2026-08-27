/**
 * Pruh „nahrávam jazdu", ktorý je v appke vidieť, kým jazda beží.
 *
 * Detekcia sa ozve notifikáciou **raz** — v okamihu, keď jazdu rozpozná.
 * Telefón býva vtedy vo vrecku alebo v držiaku so zapnutým sústredením na
 * šoférovanie, takže sa to ľahko prehliadne; človek potom celú cestu nevie,
 * či sa niečo nahráva, a istotu má až po príchode v knihe jázd. Preto to appka
 * hovorí aj sama od seba: kým jazda beží, pruh je na obrazovke a rastie mu
 * počet kilometrov.
 *
 * Číta sa priamo z pluginu, nie z databázy — jazda sa do knihy jázd zapisuje
 * až po zaradení a dovtedy o nej vie len telefón.
 */
import { useEffect, useState } from "react";
import { Car } from "lucide-react";
import { beziacaJazda, type BeziacaJazda } from "@/lib/mobile/auto-jazdy-sync";

import { usePreklad } from "@/lib/mobile/preklady/hook";
/** Ako často sa appka pýta pluginu. Kilometre pribúdajú pomaly, stačí to. */
const OBNOVA_MS = 10_000;

function cas(ms: number, loc: string): string {
  return new Date(ms).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
}

function trvanie(odKedy: number, teraz: number): string {
  const minut = Math.max(0, Math.floor((teraz - odKedy) / 60_000));
  if (minut < 60) return `${minut} min`;
  return `${Math.floor(minut / 60)} h ${minut % 60} min`;
}

/**
 * Samotný pruh, bez pýtania sa pluginu.
 *
 * Oddelené naschvál: takto sa dá vykresliť v teste a skontrolovať, čo v ňom
 * naozaj stojí, bez telefónu a bez prehliadača.
 */
export function PruhJazdy({
  jazda,
  teraz,
  onOtvor,
}: {
  jazda: BeziacaJazda;
  teraz: number;
  onOtvor?: () => void;
}) {
  const { t, locale: loc } = usePreklad();
  const obsah = (
    <>
      <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
        <Car className="relative h-4 w-4 text-primary" />
      </span>
      <span className="min-w-0 text-left text-[13px]">
        <span className="block font-medium text-primary">{t("jz.nahravamJazdu")}</span>
        <span className="block text-muted-foreground">
          {jazda.km.toFixed(1)} km · od {cas(jazda.zaciatok, loc)} ({trvanie(jazda.zaciatok, teraz)})
          {jazda.rucna ? ` · ${t("jz.spustenaRucne")}` : ""}
        </span>
      </span>
    </>
  );

  const styl =
    "flex w-full items-start gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3";

  return onOtvor ? (
    <button onClick={onOtvor} className={styl} aria-label={t("jz.otvoritPrebiehajucu")}>
      {obsah}
    </button>
  ) : (
    <div className={styl}>{obsah}</div>
  );
}

export function PrebiehaJazda({ onOtvor }: { onOtvor?: () => void }) {
  const [jazda, setJazda] = useState<BeziacaJazda | null>(null);
  const [teraz, setTeraz] = useState(() => Date.now());

  useEffect(() => {
    let zrusene = false;
    const pozri = () => {
      beziacaJazda()
        .then((j) => {
          if (zrusene) return;
          setJazda(j);
          setTeraz(Date.now());
        })
        .catch(() => {});
    };
    pozri();
    const t = setInterval(pozri, OBNOVA_MS);
    // Po návrate do appky sa nečaká na ďalší tik — človek pozerá práve teraz.
    const naNavrat = () => document.visibilityState === "visible" && pozri();
    document.addEventListener("visibilitychange", naNavrat);
    return () => {
      zrusene = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", naNavrat);
    };
  }, []);

  if (!jazda) return null;
  return <PruhJazdy jazda={jazda} teraz={teraz} onOtvor={onOtvor} />;
}
