import { useEffect, useState } from "react";
import { Files, FileText, Image as ImageIcon, Receipt, SlidersHorizontal } from "lucide-react";
import { useKameraQr } from "./KameraQr";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  KATEGORIE_VYDAVKOV,
  poslednaKategoria,
  zapamatajKategoriu,
} from "@/lib/mobile/kategorie-vydavkov";

export type NastavenieDokladu = { uhrada: "hotovost" | "karta"; kategoria: string };

/**
 * Skener dokladu.
 *
 * Celá obrazovka je tmavá a jediné svetlé miesto je to, kam sa má mieriť —
 * na kameru sa pozerá inak než na zoznam a svetlé pozadie okolo obrazu z
 * kamery oslepuje. Preto tu tokeny appky neplatia: čierna je súčasť
 * funkcie, nie štýlu.
 *
 * Čítanie kódu ani ukladanie dokladu tu nie je — kód sa odovzdá ďalej do
 * existujúceho toku (`Zachyt`), ktorý ho prečíta cez `blocek-precitaj` a uloží
 * cez `vydavok-uloz`. Táto obrazovka len rozhoduje, **čím** sa doklad zachytí a
 * **s akým nastavením** (úhrada, kategória) pôjde ďalej.
 */
export function Skener({
  onQr,
  onOdfotit,
  onZGalerie,
  onViacstranovy,
  onPrijateDoklady,
  nastavenie,
  onNastavenie,
}: {
  onQr: (raw: string) => void;
  onOdfotit: () => void;
  onZGalerie: () => void;
  onViacstranovy: () => void;
  onPrijateDoklady: () => void;
  nastavenie: NastavenieDokladu;
  onNastavenie: (n: NastavenieDokladu) => void;
}) {
  const { t } = usePreklad();
  /*
    Dva režimy jednej kamery. Kód sa číta v oboch — nájsť ho na fotke bločku
    je výhoda, nie prekážka. Líšia sa tým, čo obrazovka ponúka: pri doklade
    spúšť a nastavenie, pri kóde len zameriavač, aby nič neodvádzalo od toho,
    že stačí namieriť.

    Otvára sa na QR kóde. Ten je tu častejší a nepotrebuje nič ďalšie — stačí
    namieriť. Doklad je o ťuknutie vedľa a aj tak si vyžiada spúšť.
  */
  const [rezim, setRezim] = useState<"doklad" | "qr">("qr");
  const [nastaveniaOtvorene, setNastaveniaOtvorene] = useState(false);

  /*
    Kamera beží len vtedy, keď je appka vpredu. Bez toho by po prepnutí do inej
    aplikácie ostal prúd otvorený — na iPhone svieti kontrolka kamery a batéria
    mizne, hoci appku nikto nevidí.
  */
  const [vpredu, setVpredu] = useState(true);
  useEffect(() => {
    let odstran: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("appStateChange", ({ isActive }) => setVpredu(isActive));
        odstran = () => h.remove();
      } catch {
        /* mimo appky plugin neexistuje */
      }
    })();
    const naViditelnost = () => setVpredu(!document.hidden);
    document.addEventListener("visibilitychange", naViditelnost);
    return () => {
      odstran?.();
      document.removeEventListener("visibilitychange", naViditelnost);
    };
  }, []);

  const { videoRef, chyba } = useKameraQr({ onNajdene: onQr, aktivne: vpredu });

  function nastav(zmena: Partial<NastavenieDokladu>) {
    const nove = { ...nastavenie, ...zmena };
    if (zmena.kategoria !== undefined) zapamatajKategoriu(zmena.kategoria);
    onNastavenie(nove);
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
      />

      {/* Prepínač režimu. Hore, aby nezavadzal palcu pri spúšti. */}
      <div
        className="absolute inset-x-0 top-0 flex justify-center px-4 pb-2 pt-3"
        style={{ paddingTop: "calc(var(--safe-top) + 0.5rem)" }}
      >
        <div
          role="group"
          aria-label={t("sken.nastavenie")}
          className="flex gap-1 rounded-full bg-black/45 p-1 backdrop-blur"
        >
          {(
            [
              // QR kód je vľavo. Bloček sa skenuje raz za čas, kód aj
              // niekoľkokrát denne — a v dvojici sa prstom mieri na prvé.
              ["qr", t("sken.qrKod")],
              ["doklad", t("sken.doklad")],
            ] as const
          ).map(([kod, popis]) => (
            <button
              key={kod}
              onClick={() => setRezim(kod)}
              aria-pressed={rezim === kod}
              className={`min-h-[36px] rounded-full px-4 text-[14px] font-medium transition ${
                rezim === kod ? "bg-app-zelena text-white" : "text-white/85"
              }`}
            >
              {popis}
            </button>
          ))}
        </div>
      </div>

      {/*
        Zameriavač. Štyri rohy, nie celý rámik: rohy hovoria „sem to zmestite"
        a pritom nezakrývajú doklad, ktorý sa pod nimi rovná.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 grid place-items-center pt-[15vh]">
        <div
          className={`relative ${
            rezim === "qr" ? "h-56 w-56" : "h-[42vh] w-[68%] max-w-[19rem]"
          }`}
        >
          {(
            [
              "left-0 top-0 border-l-2 border-t-2 rounded-tl-lg",
              "right-0 top-0 border-r-2 border-t-2 rounded-tr-lg",
              "left-0 bottom-0 border-b-2 border-l-2 rounded-bl-lg",
              "right-0 bottom-0 border-b-2 border-r-2 rounded-br-lg",
            ] as const
          ).map((roh) => (
            <span key={roh} className={`absolute h-8 w-8 border-white/90 ${roh}`} />
          ))}
        </div>
      </div>

      {chyba && (
        <div className="absolute inset-x-4 top-[14vh] rounded-app bg-app-karta p-4 text-[13px] text-app-text shadow-lg">
          <p>{chyba}</p>
          <p className="mt-1 text-app-text-2">{t("sken.kameraNejde")}</p>
        </div>
      )}

      {/*
        Spodok. Priehľadný prechod, nie panel: obraz z kamery má ísť až po
        okraj, inak vyzerá skener ako okno v aplikácii, nie ako hľadáčik.
      */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-4 pt-10"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
      >
        {nastaveniaOtvorene && rezim === "doklad" && (
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-app bg-black/55 p-3 backdrop-blur">
            <div>
              <span className="mb-1 block text-[12px] font-medium text-white/70">
                {t("sken.uhrada")}
              </span>
              <div className="flex overflow-hidden rounded-app-sm border border-white/25">
                {(
                  [
                    ["hotovost", t("pd.hotovost")],
                    ["karta", t("sken.karta")],
                  ] as const
                ).map(([kod, label]) => (
                  <button
                    key={kod}
                    onClick={() => nastav({ uhrada: kod })}
                    aria-pressed={nastavenie.uhrada === kod}
                    className={`min-h-[40px] flex-1 text-[14px] ${
                      nastavenie.uhrada === kod
                        ? "bg-app-zelena font-semibold text-white"
                        : "text-white/75"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-white/70">
                {t("sken.kategoria")}
              </span>
              <select
                value={nastavenie.kategoria}
                onChange={(e) => nastav({ kategoria: e.target.value })}
                className="min-h-[40px] w-full rounded-app-sm border border-white/25 bg-transparent px-2 text-[15px] text-white"
              >
                <option value="">{t("sken.nezaradene")}</option>
                {KATEGORIE_VYDAVKOV.map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {k.nazov}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <p className="text-center text-[15px] font-medium text-white">
          {rezim === "qr" ? t("sken.namierteQr") : t("sken.naskenujteDoklad")}
        </p>
        <p className="mt-0.5 text-center text-[13px] text-white/70">
          {rezim === "qr" ? t("sken.qrSaPrecita") : t("sken.automaticky")}
        </p>

        {rezim === "doklad" && (
          <div className="mt-4 grid grid-cols-3 items-center">
            <div className="flex justify-start">
              <MalyKruh icon={ImageIcon} label={t("sken.zGalerie")} onClick={onZGalerie} />
            </div>
            <div className="flex justify-center">
              <button
                onClick={onOdfotit}
                aria-label={t("sken.odfotit")}
                /* Biely prstenec okolo zelenej spúšte — na tmavom obraze je to
                   jediné, čo je vidieť za každých svetelných podmienok. */
                className="grid h-[72px] w-[72px] place-items-center rounded-full border-[3px] border-white bg-app-zelena transition active:scale-95"
              />
            </div>
            <div className="flex justify-end">
              <MalyKruh
                icon={Files}
                label={t("sken.viacstranovy")}
                onClick={onViacstranovy}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/15 pt-3">
          <MalyOdkaz icon={FileText} label={t("sken.pdfSubor")} onClick={onZGalerie} />
          {rezim === "doklad" && (
            <MalyOdkaz
              icon={SlidersHorizontal}
              label={t("sken.nastavenie")}
              onClick={() => setNastaveniaOtvorene((v) => !v)}
            />
          )}
          <MalyOdkaz icon={Receipt} label={t("pd.nazov")} onClick={onPrijateDoklady} />
        </div>
      </div>
    </div>
  );
}

function MalyKruh({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white transition active:scale-95"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function MalyOdkaz({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-app-sm text-[12px] text-white/80 active:bg-white/10"
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Prvé nastavenie panela: karta je predvolená, kategória z poslednej voľby. */
export function vychodzieNastavenie(): NastavenieDokladu {
  return { uhrada: "karta", kategoria: poslednaKategoria() };
}
