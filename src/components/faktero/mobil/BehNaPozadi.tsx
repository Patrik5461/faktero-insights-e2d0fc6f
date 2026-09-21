import { useEffect, useState } from "react";
import { BatteryCharging, Lock, Power } from "lucide-react";
import { toast } from "sonner";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  behNaPozadi,
  behNaPozadiVybaveny,
  otvorNastavenieBehu,
  zapamatajBehNaPozadi,
  type BehNaPozadi as Stav,
} from "@/lib/mobile/povolenia-jazd";

/**
 * Návod, ako udržať detekciu jázd nažive po zatvorení appky.
 *
 * Xiaomi, Redmi a POCO appku zatvorenú potiahnutím zastavia úplne — aj so
 * službou detekcie a so záložným prebudením cez Google Play. Pomôže len
 * automatické spúšťanie, batéria bez obmedzení a zámok v spustených
 * aplikáciách. Prvé dve sú schované v aplikácii Zabezpečenie, tak ich
 * tlačidlá otvoria priamo. Na ostatných telefónoch sa karta ukáže, len keď
 * systém appke obmedzuje beh na pozadí.
 */
export function BehNaPozadi({ zapnuta, okno = false }: { zapnuta: boolean; okno?: boolean }) {
  const { t } = usePreklad();
  const [stav, setStav] = useState<Stav | null>(null);
  const [skryta, setSkryta] = useState(true);

  useEffect(() => {
    if (!zapnuta) return;
    let zive = true;
    void (async () => {
      const [s, vybavene] = await Promise.all([behNaPozadi(), behNaPozadiVybaveny()]);
      if (!zive || !s) return;
      setStav(s);
      setSkryta(vybavene || (!s.xiaomi && !s.obmedzeny));
    })();
    return () => {
      zive = false;
    };
  }, [zapnuta]);

  if (!zapnuta || !stav || skryta) return null;

  async function otvor(druh: "autostart" | "battery") {
    const kam = await otvorNastavenieBehu(druh);
    if (kam === null) toast.error(t("bp.nejde"));
    else if (kam === "fallback") toast.info(t("bp.vseobecne"), { duration: 8000 });
  }

  const Riadok = ({
    ikona: Ikona,
    text,
    tlacidlo,
  }: {
    ikona: typeof Power;
    text: string;
    tlacidlo?: () => void;
  }) => (
    <li className="flex items-start gap-3">
      <Ikona className="mt-0.5 h-4 w-4 shrink-0 text-app-text-2" />
      <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-app-text">{text}</span>
      {tlacidlo && (
        <button
          onClick={tlacidlo}
          className="shrink-0 rounded-full border border-app-ramik px-3 py-1 text-[13px] font-medium text-app-zelena"
        >
          {t("bp.otvorit")}
        </button>
      )}
    </li>
  );

  const obsah = (
    <div
      role={okno ? "dialog" : "region"}
      aria-label={t(stav.xiaomi ? "bp.nadpisXiaomi" : "bp.nadpisIny")}
      className={
        okno
          ? "w-full rounded-t-app bg-app-karta p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-app"
          : "rounded-app border border-amber-500/40 bg-amber-500/5 p-4"
      }
    >
      <div className="text-sm font-medium">{t(stav.xiaomi ? "bp.nadpisXiaomi" : "bp.nadpisIny")}</div>
      <p className="mt-1 text-xs leading-relaxed text-app-text-2">
        {t(stav.xiaomi ? "bp.uvodXiaomi" : "bp.uvodIny")}
      </p>
      <ul className="mt-3 space-y-3">
        {stav.xiaomi && <Riadok ikona={Power} text={t("bp.autostart")} tlacidlo={() => otvor("autostart")} />}
        {(stav.xiaomi || stav.obmedzeny) && (
          <Riadok ikona={BatteryCharging} text={t("bp.bateria")} tlacidlo={() => otvor("battery")} />
        )}
        {stav.xiaomi && <Riadok ikona={Lock} text={t("bp.zamok")} />}
      </ul>
      <button
        onClick={() => {
          void zapamatajBehNaPozadi();
          setSkryta(true);
        }}
        className="mt-4 text-[13px] font-medium text-app-text-2 underline"
      >
        {t("bp.hotovo")}
      </button>
    </div>
  );
  if (!okno) return obsah;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center">
      {obsah}
    </div>
  );
}

/**
 * To isté ako okno hneď po štarte appky. Na obrazovke Jazda ho ľudia
 * nevideli — kto ju neotvorí, o návode sa nedozvie a Xiaomi mu zatvorenú
 * appku ticho zastavuje. Ukáže sa len pri zapnutej detekcii a keď už
 * nechýba žiadne povolenie (inak sa pýta okno povolení).
 */
export function BehNaPozadiOkno() {
  const [zapnuta, setZapnuta] = useState(false);
  useEffect(() => {
    let zive = true;
    void (async () => {
      const [{ stavDetekcie }, { stavPovoleniJazd }] = await Promise.all([
        import("@/lib/mobile/auto-jazdy-sync"),
        import("@/lib/mobile/povolenia-jazd"),
      ]);
      const [d, chyba] = await Promise.all([stavDetekcie(), stavPovoleniJazd()]);
      if (zive && d.dostupna && d.zapnuta && !chyba?.length) setZapnuta(true);
    })();
    return () => {
      zive = false;
    };
  }, []);
  return <BehNaPozadi zapnuta={zapnuta} okno />;
}
