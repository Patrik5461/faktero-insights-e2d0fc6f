import { useOperacia } from "@/lib/mobile/server-most";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Files, Image as ImageIcon, Layers, X } from "lucide-react";
import { useKameraQr } from "./KameraQr";
import { ObrysDokladu, useObrysDokladu, useSnimanie } from "./KameraDokladu";
import { UpravaDokladu } from "./UpravaDokladu";
import { POTREBNYCH_VZORIEK, ustalenych, type Vzorka } from "@/lib/mobile/auto-fotenie";
import { potvrd } from "@/lib/potvrdenie";
import { filtrujMoznosti } from "@/lib/faktero/vyber-kodu";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  KATEGORIE_VYDAVKOV,
  poslednaKategoria,
  zapamatajKategoriu,
} from "@/lib/mobile/kategorie-vydavkov";

export type NastavenieDokladu = {
  uhrada: "hotovost" | "karta";
  kategoria: string;
  /** Zákazka, predkontácia a komentár — dajú sa nastaviť pred skenovaním. */
  zakazka?: string;
  predkontacia?: string;
  poznamka?: string;
};

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
 * cez `vydavok-uloz`. Fotka, súbor aj viac strán idú do jedného skenera:
 * server sám rozpozná, či je to bloček, faktúra alebo iný doklad
 * (`RozpoznanyDoklad`). Samostatný vstup „Iný doklad" preto už nie je. Táto
 * obrazovka len rozhoduje, **čím** sa doklad zachytí a **s akým nastavením**
 * (úhrada, kategória) pôjde ďalej.
 *
 * Kamera je jedna, ako v Doklado: spúšť odfotí snímku priamo z videa, na
 * ktoré sa človek pozerá, a otvorí „Upraviť doklad" (rohy, filtre,
 * otočenie). Predtým spúšť otvorila ďalší, systémový skener so
 * samozameraním — druhú kameru po tom, ako sa už raz mierilo. Hotové strany
 * idú cez `onZachytene` do toho istého toku, kam predtým výsledok skenera.
 * Keď kamera v stránke nejde, spúšť ide po starom (`onOdfotit`).
 */
export function Skener({
  onQr,
  onOdfotit,
  onZGalerie,
  onViacstranovy,
  onViacDokladov,
  onZachytene,
  nastavenie,
  onNastavenie,
  companyId,
  onZavriet,
}: {
  onQr: (raw: string) => void;
  /** Náhradná cesta, keď kamera v stránke nejde (fotoaparát / výber súboru). */
  onOdfotit: () => void;
  /**
   * Strany odfotené a upravené priamo tu. Jedna strana je obrázok, viac strán
   * je jeden viacstranový doklad.
   */
  onZachytene?: (strany: string[]) => void;
  onZGalerie: () => void;
  onViacstranovy: () => void;
  /**
   * Viac rôznych dokladov za sebou (dávka). Iné než viacstranový — ten spája
   * strany JEDNÉHO dokladu do PDF.
   */
  onViacDokladov?: () => void;
  onPrijateDoklady: () => void;
  nastavenie: NastavenieDokladu;
  onNastavenie: (n: NastavenieDokladu) => void;
  companyId?: string;
  /** Krížik vľavo hore — skener je celá obrazovka bez spodnej lišty. */
  onZavriet?: () => void;
}) {
  const { t, mnozne } = usePreklad();
  const nacitajPredvolby = useOperacia<{
    zakazky: { id: string; nazov: string }[];
    predkontacie: { kod: string; popis: string }[];
  }>("sken-predvolby");
  const [predvolby, setPredvolby] = useState<{
    zakazky: { id: string; nazov: string }[];
    predkontacie: { kod: string; popis: string }[];
  } | null>(null);
  /*
    Jeden skener, nie dva režimy. Kamera stále hľadá QR kód bločku — keď ho
    nájde, bloček sa načíta sám. Spúšť je pritom vždy po ruke na čokoľvek
    iné (faktúra, bloček bez kódu, list). Predtým bol prepínač „QR kód /
    Doklad“ a ľudia ho museli pri každom doklade prepínať.
  */
  const [nastaveniaOtvorene, setNastaveniaOtvorene] = useState(false);
  // Hľadanie v predkontáciách — číselník firmy býva dlhý (bez diakritiky, aj podľa kódu).
  const [hladanePk, setHladanePk] = useState("");
  // Zákazky a predkontácie sa načítajú až pri rozbalení „Ďalších položiek" — bez signálu ostanú skryté.
  useEffect(() => {
    if (!nastaveniaOtvorene || predvolby || !companyId) return;
    nacitajPredvolby({ data: { company_id: companyId } })
      .then(setPredvolby)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nastaveniaOtvorene, companyId]);

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

  /*
    Odfotené strany a otvorená „Upraviť doklad". Kým je otvorená, alebo kým
    sú odfotené strany viacstranového dokladu, QR sa z videa nečíta — inak
    by bloček v zábere uprostred práce odviedol človeka preč a strany by
    sa stratili.
  */
  const sn = useSnimanie();
  const [viacstranovy, setViacstranovy] = useState(false);
  const { videoRef, chyba, bezi } = useKameraQr({
    onNajdene: onQr,
    aktivne: vpredu,
    citajQr: !sn.snimka && sn.strany.length === 0,
    naFotenie: true,
  });
  const fotimTu = bezi && !!onZachytene;
  const obrys = useObrysDokladu(videoRef, bezi && vpredu && !sn.snimka);

  function spust() {
    if (fotimTu && sn.odfot(videoRef.current, obrys)) return;
    if (viacstranovy) onViacstranovy();
    else onOdfotit();
  }

  /*
    Automatické odfotenie: keď je doklad v zábere a obrys sa ~1 s nehýbe,
    odfotí sa sám (ako pri skenovaní dokladov v bankových appkách). Dá sa
    vypnúť čipom „Auto“; voľba sa pamätá v zariadení.
  */
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem("faktero.sken.auto") !== "0";
    } catch {
      return true;
    }
  });
  function prepniAuto() {
    setAuto((v) => {
      try {
        localStorage.setItem("faktero.sken.auto", v ? "0" : "1");
      } catch {
        /* súkromné okno — voľba platí len teraz */
      }
      return !v;
    });
  }
  const vzorky = useRef<(Vzorka | null)[]>([]);
  const [ustalene, setUstalene] = useState(0);
  useEffect(() => {
    if (!auto || !fotimTu || sn.snimka) {
      vzorky.current = [];
      setUstalene(0);
      return;
    }
    vzorky.current = [...vzorky.current.slice(-POTREBNYCH_VZORIEK), obrys];
    const n = ustalenych(vzorky.current);
    setUstalene(n);
    if (n >= POTREBNYCH_VZORIEK) {
      vzorky.current = [];
      setUstalene(0);
      spust();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrys, auto, fotimTu, sn.snimka]);

  async function prepniViacstranovy() {
    if (!fotimTu) return onViacstranovy();
    if (viacstranovy && sn.strany.length) {
      const ano = await potvrd(t("kamera.zahoditStrany", { pocet: sn.strany.length }), {
        potvrdit: t("kamera.zahodit"),
        zrusit: t("spolocne.zrusit"),
        nebezpecne: true,
      });
      if (!ano) return;
    }
    sn.vynuluj();
    setViacstranovy((v) => !v);
  }

  function odovzdaj(strany: string[]) {
    sn.vynuluj();
    setViacstranovy(false);
    onZachytene?.(strany);
  }

  function nastav(zmena: Partial<NastavenieDokladu>) {
    const nove = { ...nastavenie, ...zmena };
    if (zmena.kategoria !== undefined) zapamatajKategoriu(zmena.kategoria);
    onNastavenie(nove);
  }

  /** Koľko z „Ďalších položiek" je vyplnených — vidieť to aj na zbalenom paneli. */
  const vyplneneDalsie = [nastavenie.zakazka, nastavenie.predkontacia, nastavenie.poznamka].filter(
    (v) => v && String(v).trim(),
  ).length;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
      />
      <ObrysDokladu obrys={obrys} />

      {/*
        Rozloženie je stĺpec, nie vrstvy nad sebou: hore prepínač, v strede
        zameriavač, dole panel a spúšť. Zameriavač dostane len to miesto, ktoré
        ostane — na malom telefóne (375×667) sa zmenší, ale panel nikdy
        nezakryje spúšť ani tlačidlá pod ňou. Obraz z kamery ide pod všetkým
        od okraja po okraj.
      */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="shrink-0" style={{ paddingTop: "calc(var(--safe-top) + 0.5rem)" }}>
          {/*
            Horný rad ako v návrhu „A": vľavo zavrieť, v strede jediná
            nápoveda (QR sa netreba fotiť / „Držte, fotím…"), vpravo Auto.
            Pri viacstranovom nápovedu nahradí počítadlo strán pod radom.
          */}
          <div className="flex min-h-[44px] items-center justify-between gap-2 px-4">
            {onZavriet ? (
              <button
                onClick={onZavriet}
                aria-label={t("panel.zavriet")}
                data-zavriet-skener
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/45 text-white backdrop-blur active:scale-95"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            ) : (
              <span className="w-11 shrink-0" />
            )}
            {!(viacstranovy && fotimTu) && !chyba ? (
              <p className="min-w-0 truncate rounded-full bg-black/50 px-3.5 py-2 text-center text-[13px] font-semibold text-white backdrop-blur">
                {auto && fotimTu && ustalene >= 2 ? t("sken.drzte") : t("sken.qrSam")}
              </p>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            {fotimTu ? (
              <button
                onClick={prepniAuto}
                aria-pressed={auto}
                aria-label={t("sken.autoPopis")}
                className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold backdrop-blur ${
                  auto ? "bg-app-zelena-plocha text-white" : "bg-black/45 text-white/75"
                }`}
              >
                {t("sken.auto")}
              </button>
            ) : (
              <span className="w-11 shrink-0" />
            )}
          </div>
          {/* Viacstranový doklad: koľko strán je odfotených a ako skončiť. */}
          {viacstranovy && fotimTu && (
            <div
              data-viacstranovy
              className="mx-auto mt-1 flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full bg-black/65 py-1 pl-3 pr-1 text-[13px] text-white backdrop-blur"
            >
              <span className="truncate font-medium" title={t("kamera.viacstranovy")}>
                {t("uprava.stranaCislo", { n: sn.strany.length + 1 })}
              </span>
              {sn.strany.length > 0 && (
                <button
                  onClick={() => odovzdaj(sn.strany)}
                  className="min-h-[36px] shrink-0 rounded-full bg-white px-3 text-[13px] font-semibold text-black"
                >
                  {t("uprava.hotovo", {
                    pocet: `${sn.strany.length} ${mnozne(sn.strany.length, {
                      one: t("uprava.strana1"),
                      few: t("uprava.strana2"),
                      other: t("uprava.strana5"),
                    })}`,
                  })}
                </button>
              )}
              <button
                onClick={() => void prepniViacstranovy()}
                aria-label={t("kamera.zrusit")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/85"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/*
          Zameriavač. Štyri rohy, nie celý rámik: rohy hovoria „sem to zmestite"
          a pritom nezakrývajú doklad, ktorý sa pod nimi rovná.
        */}
        <div
          data-zameriavac
          className="pointer-events-none flex min-h-0 flex-1 items-center justify-center px-8 py-3"
        >
          {/* Keď je doklad nájdený, kreslí sa jeho obrys — rohy zameriavača ustúpia. */}
          <div
            className={`relative h-full max-h-[42vh] w-[68%] max-w-[19rem] transition-opacity ${
              obrys ? "opacity-30" : ""
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
          Biely panel dole (smer „A"): úhrada dvomi tlačidlami a kategória,
          pod nimi galéria · spúšť · viac strán. Kategória otvára celé
          nastavenie dokladu (zákazka, predkontácia, komentár, viac dokladov).
          Predtým tu bol rozbalený panel, dva riadky textu, tri tlačidlá a
          riadok odkazov — na hľadáčik nebolo vidieť. „Prijaté doklady" sú
          v spodnej lište (Doklady), PDF ide cez to isté tlačidlo ako galéria.
        */}
        <div
          data-spodny-panel
          className="shrink-0 rounded-t-app-lg bg-app-karta px-5 pt-3.5 text-app-text"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
        >
          <div aria-hidden className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-app-linka" />
          <div className="flex gap-2">
            <div role="group" aria-label={t("sken.uhrada")} className="flex flex-[2] gap-2">
              {(
                [
                  ["hotovost", t("pd.hotovost")],
                  ["karta", t("sken.karta")],
                ] as const
              ).map(([kod, label]) => {
                const je = nastavenie.uhrada === kod;
                return (
                  <button
                    key={kod}
                    onClick={() => nastav({ uhrada: kod })}
                    aria-pressed={je}
                    className={`h-11 min-w-0 flex-1 truncate rounded-[12px] px-1 text-[15px] transition active:scale-[0.98] ${
                      je
                        ? "bg-app-zelena-jemna font-bold text-app-zelena"
                        : "border border-app-linka font-semibold"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setNastaveniaOtvorene(true)}
              data-cip-nastavenia
              aria-label={t("sken.nastavenie")}
              aria-haspopup="dialog"
              className="flex h-11 min-w-0 flex-[1.3] items-center justify-center gap-1 rounded-[12px] border border-app-linka px-2 text-[14px] font-semibold transition active:scale-[0.98]"
            >
              <span className="min-w-0 truncate">
                {KATEGORIE_VYDAVKOV.find((k) => k.kod === nastavenie.kategoria)?.nazov ??
                  t("sken.kategoriaTlacidlo")}
              </span>
              {vyplneneDalsie > 0 && (
                <span className="shrink-0 rounded-full bg-app-zelena-jemna px-1.5 text-[11px] font-bold text-app-zelena">
                  +{vyplneneDalsie}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 items-center">
            <div className="flex justify-start">
              <MalyStvorec icon={ImageIcon} label={t("sken.zoSuborov")} onClick={onZGalerie} />
            </div>
            <div className="flex justify-center">
              <button
                onClick={spust}
                aria-label={t("sken.odfotit")}
                data-spust
                /* Svetlozelený prstenec okolo zelenej spúšte — na bielom paneli
                   je to najväčšia a jediná plná vec, netreba ju hľadať. */
                className="h-[76px] w-[76px] rounded-full border-4 border-app-zelena-jemna bg-app-zelena-plocha transition active:scale-95"
              />
            </div>
            <div className="flex justify-end">
              <MalyStvorec
                icon={Files}
                label={t("sken.viacstranovy")}
                onClick={() => void prepniViacstranovy()}
                stlacene={fotimTu ? viacstranovy : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Nastavenie dokladu — vysúvací panel, nie stále otvorený nad kamerou. */}
      {nastaveniaOtvorene && (
        <div
          className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50"
          onClick={() => setNastaveniaOtvorene(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("sken.nastavenie")}
            data-panel-dokladu
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-app-lg bg-app-karta px-5 pt-3.5 text-app-text"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-app-linka" />
            <h2 className="mb-3 text-[17px] font-bold">{t("sken.nastavenie")}</h2>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              <div role="group" aria-label={t("sken.uhrada")} className="grid grid-cols-2 gap-2">
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
                    className={`min-h-[44px] rounded-app-sm border text-[15px] ${
                      nastavenie.uhrada === kod
                        ? "border-app-zelena bg-app-zelena-plocha font-semibold text-white"
                        : "border-app-ramik"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-app-text-2">
                  {t("sken.kategoria")}
                </span>
                <select
                  value={nastavenie.kategoria}
                  onChange={(e) => nastav({ kategoria: e.target.value })}
                  className="min-h-[44px] w-full rounded-app-sm border border-app-ramik bg-transparent px-3 text-[15px]"
                >
                  <option value="">{t("sken.bezKategorie")}</option>
                  {KATEGORIE_VYDAVKOV.map((k) => (
                    <option key={k.kod} value={k.kod}>
                      {k.nazov}
                    </option>
                  ))}
                </select>
              </label>
              {predvolby?.zakazky.length ? (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-app-text-2">
                    {t("sken.zakazka")}
                  </span>
                  <select
                    value={nastavenie.zakazka ?? ""}
                    onChange={(e) => nastav({ zakazka: e.target.value || undefined })}
                    className="min-h-[44px] w-full rounded-app-sm border border-app-ramik bg-transparent px-3 text-[15px]"
                  >
                    <option value="">{t("sken.ziadna")}</option>
                    {predvolby.zakazky.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nazov}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {predvolby?.predkontacie.length ? (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-app-text-2">
                    {t("sken.predkontacia")}
                  </span>
                  {predvolby.predkontacie.length > 8 ? (
                    <input
                      type="search"
                      value={hladanePk}
                      onChange={(e) => setHladanePk(e.target.value)}
                      placeholder={t("sken.hladatPredkontaciu")}
                      aria-label={t("sken.hladatPredkontaciu")}
                      className="mb-2 min-h-[44px] w-full rounded-app-sm border border-app-ramik bg-transparent px-3 text-[15px]"
                    />
                  ) : null}
                  <select
                    value={nastavenie.predkontacia ?? ""}
                    onChange={(e) => nastav({ predkontacia: e.target.value || undefined })}
                    className="min-h-[44px] w-full rounded-app-sm border border-app-ramik bg-transparent px-3 text-[15px]"
                  >
                    <option value="">{t("sken.ziadna")}</option>
                    {(() => {
                      const zhodne = new Set(
                        filtrujMoznosti(
                          predvolby.predkontacie.map((x) => ({ hodnota: x.kod, text: x.popis || x.kod })),
                          hladanePk,
                        ).map((m) => m.hodnota),
                      );
                      return predvolby.predkontacie
                        // Vybraná ostáva v ponuke, aj keď ju hľadanie nezachytí.
                        .filter((p) => p.kod === nastavenie.predkontacia || zhodne.has(p.kod))
                        .map((p) => (
                          <option key={p.kod} value={p.kod}>
                            {p.kod}
                            {p.popis ? ` — ${p.popis}` : ""}
                          </option>
                        ));
                    })()}
                  </select>
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-app-text-2">
                  {t("sken.komentar")}
                </span>
                <input
                  value={nastavenie.poznamka ?? ""}
                  maxLength={500}
                  placeholder={t("sken.komentarPopis")}
                  onChange={(e) => nastav({ poznamka: e.target.value || undefined })}
                  className="min-h-[44px] w-full rounded-app-sm border border-app-ramik bg-transparent px-3 text-[15px]"
                />
              </label>
              {onViacDokladov && (
                <button
                  onClick={() => {
                    setNastaveniaOtvorene(false);
                    onViacDokladov();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-app-sm border border-app-ramik px-3 text-[15px]"
                >
                  <Layers className="h-4 w-4" /> {t("sken.viacDokladov")}
                </button>
              )}
            </div>
            <button
              onClick={() => setNastaveniaOtvorene(false)}
              className="mt-4 min-h-[54px] w-full rounded-[16px] bg-app-zelena-plocha text-[16px] font-bold text-white"
            >
              {t("nf.hotovo")}
            </button>
          </section>
        </div>
      )}

      {sn.snimka && (
        <UpravaDokladu
          snimka={sn.snimka}
          strana={sn.strany.length + 1}
          odfotenych={sn.strany.length}
          viacStran={viacstranovy}
          onZnova={sn.zahodSnimku}
          onPridatStranu={sn.pridaj}
          onUlozit={(s) => odovzdaj([...sn.strany, s])}
        />
      )}
    </div>
  );
}

function MalyStvorec({
  icon: Icon,
  label,
  onClick,
  stlacene,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  /** Prepínač (viacstranový režim) — `undefined` pri obyčajnom tlačidle. */
  stlacene?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={stlacene}
      className={`grid h-12 w-12 place-items-center rounded-[14px] transition active:scale-95 ${
        stlacene ? "bg-app-zelena-plocha text-white" : "bg-app-pozadie text-app-text"
      }`}
    >
      <Icon className="h-[22px] w-[22px]" />
    </button>
  );
}

/** Prvé nastavenie panela: karta je predvolená, kategória z poslednej voľby. */
export function vychodzieNastavenie(): NastavenieDokladu {
  return { uhrada: "karta", kategoria: poslednaKategoria() };
}
