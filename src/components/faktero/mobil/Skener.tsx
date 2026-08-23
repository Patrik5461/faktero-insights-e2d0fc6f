import { useEffect, useState } from "react";
import { Camera, Files, FileText, Image as ImageIcon, Receipt } from "lucide-react";
import { useKameraQr } from "./KameraQr";
import {
  KATEGORIE_VYDAVKOV,
  poslednaKategoria,
  zapamatajKategoriu,
} from "@/lib/mobile/kategorie-vydavkov";

export type NastavenieDokladu = { uhrada: "hotovost" | "karta"; kategoria: string };

/**
 * Úvodná obrazovka appky — kamera, ktorá čaká na QR kód bločku.
 *
 * Appka sa otvára tam, kde sa najčastejšie používa: pri pokladni, s dokladom
 * v ruke. Predtým bola prvá obrazovka zoznam veľkých tlačidiel a skenovanie
 * bolo dve ťuknutia ďaleko.
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

      {/* Rámik, kam mieriť. Bez neho ľudia mieria na celý bloček. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 grid place-items-center pt-[12vh]">
        <div
          className="aspect-square w-[70%] rounded-[14px]"
          style={{ border: "2px solid rgba(255,255,255,0.85)" }}
        />
        <p className="mt-4 text-[15px] font-medium text-white drop-shadow">
          Naskenujte QR kód bločku
        </p>
        <p className="mt-1 text-[13px] text-white/80 drop-shadow">alebo odfoťte doklad</p>
      </div>

      {chyba && (
        <div className="absolute inset-x-4 top-[12vh] rounded-2xl bg-card/95 p-4 text-[13px] shadow-lg">
          <p>{chyba}</p>
          <p className="mt-1 text-muted-foreground">
            Doklad sa dá aj tak odfotiť alebo vybrať zo súborov — tlačidlá nižšie fungujú.
          </p>
        </div>
      )}

      {/*
        Spodný panel. Nesmie zasahovať do rámika, preto je rámik odsadený zhora
        a panel drží pri spodnej hrane; medzi nimi ostáva tmavý obraz z kamery.
      */}
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.25)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />

        <div className="flex gap-2">
          <button
            onClick={onOdfotit}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-semibold text-primary-foreground active:scale-[0.99]"
            style={{ backgroundImage: "var(--brand-gradient)" }}
          >
            <Camera className="h-[18px] w-[18px]" /> Odfotiť
          </button>
          <button
            onClick={onZGalerie}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border/70 px-4 py-3 text-[15px] font-medium active:bg-secondary"
          >
            <ImageIcon className="h-[18px] w-[18px]" /> Z galérie
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Úhrada</span>
            <div className="flex overflow-hidden rounded-xl border border-border/70">
              {(
                [
                  ["hotovost", "Hotovosť"],
                  ["karta", "Karta"],
                ] as const
              ).map(([kod, label]) => (
                <button
                  key={kod}
                  onClick={() => nastav({ uhrada: kod })}
                  aria-pressed={nastavenie.uhrada === kod}
                  className={`flex-1 py-2.5 text-[14px] ${
                    nastavenie.uhrada === kod
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Kategória nákladu
            </span>
            <select
              value={nastavenie.kategoria}
              onChange={(e) => nastav({ kategoria: e.target.value })}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[15px]"
            >
              <option value="">Nezaradené</option>
              {KATEGORIE_VYDAVKOV.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {k.nazov}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/*
          Zvyšok skenovania. Boli to samostatné položky na starej úvodnej
          obrazovke — sem patria preto, že sú to iné spôsoby toho istého:
          dostať doklad do Faktera.
        */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
          <MalyOdkaz icon={FileText} label="PDF súbor" onClick={onZGalerie} />
          <MalyOdkaz icon={Files} label="Viacstranový" onClick={onViacstranovy} />
          <MalyOdkaz icon={Receipt} label="Prijaté doklady" onClick={onPrijateDoklady} />
        </div>
      </div>
    </div>
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
      className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[12px] text-muted-foreground active:bg-secondary"
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </button>
  );
}

/** Prvé nastavenie panela: karta je predvolená, kategória z poslednej voľby. */
export function vychodzieNastavenie(): NastavenieDokladu {
  return { uhrada: "karta", kategoria: poslednaKategoria() };
}
