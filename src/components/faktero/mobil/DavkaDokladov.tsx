import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  PencilLine,
} from "lucide-react";
import { useOperacia } from "@/lib/mobile/server-most";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { potvrd } from "@/lib/potvrdenie";
import { formatujMenu } from "@/lib/faktero/mena";
import { sucty, type DruhNespracovaneho } from "@/lib/faktero/nespracovane";
import { zachytStrany } from "@/lib/mobile/skener-dokumentov";
import { vyberSubory } from "@/lib/mobile/vyber-suborov";
import { INTERVAL_CITANIA_MS, polaNaDoplnenie } from "@/lib/mobile/sken-rozpoznanie";
import {
  MAX_V_DAVKE,
  dalsiNaOtvorenie,
  naCitanie,
  naHromadneUlozenie,
  naNahratie,
  novyDoklad,
  poChybeUlozenia,
  poStrope,
  poTuknuti,
  suhrn,
  vyhodnotDetail,
  zmen,
  type DetailSkenu,
  type DokladVDavke,
} from "@/lib/mobile/davka-dokladov";
import { HlavneTlacidlo, MobilObrazovka } from "./MobilChrome";
import { NAZOV_DRUHU, NAZOV_POLA, RozpoznanyDoklad } from "./RozpoznanyDoklad";
import type { NastavenieDokladu } from "./Skener";

/** Doklad, ktorým dávka začína — súbor, prípadne už nahratý (s `id`). */
export type VstupDavky = { subor: string; nazov?: string | null; id?: string | null };

/**
 * Bez signálu sa dávka nezačne ani nerozšíri.
 *
 * Rozpoznanie robí AI na serveri a fronta v telefóne vie držať len bločky —
 * desať naskenovaných faktúr by sa v nej uložilo ako desať bločkov, ktoré by
 * niekto na webe prehadzoval ručne. Jeden doklad bez signálu ide po starom
 * (ako bloček do fronty), tak to povieme a necháme na človeku.
 */
async function online(): Promise<boolean> {
  const { isOnline } = await import("@/lib/mobile/offline-queue");
  return isOnline();
}

/**
 * Viac dokladov naraz.
 *
 * Každá fotka a každý vybraný súbor je samostatný doklad. Hneď po pridaní sa
 * nahrá do Nespracovaných (najviac dva súčasne), server ho prečíta a dávka
 * ukáže, čo to je. Rozpoznané sa dajú uložiť jedným ťuknutím všetky naraz;
 * tie, kde niečo chýba alebo hrozí duplicita, otvorí človek a vyrieši na
 * obrazovke jedného dokladu (`RozpoznanyDoklad`). Čo sa neuloží, ostane v
 * Nespracovaných dokladoch — nič sa nestratí.
 */
export function DavkaDokladov({
  firma,
  pociatocne = [],
  nastavenie,
  onHotovo,
  onSpat,
}: {
  firma: { id: string; name: string };
  pociatocne?: VstupDavky[];
  nastavenie?: NastavenieDokladu;
  /** Dávka sa zavrela a niečo sa v nej nahralo. */
  onHotovo: () => void;
  /** Dávka sa zavrela prázdna. */
  onSpat: () => void;
}) {
  const { t, locale: loc } = usePreklad();
  const nahraj = useOperacia<{ id: string }>("sken-nahraj");
  const stavDokladu = useOperacia<DetailSkenu>("sken-stav");
  const vytvor = useOperacia<{ agenda: string; id: string }>("sken-vytvor");

  const pocitadlo = useRef(0);
  const novyKluc = () => `d${++pocitadlo.current}`;
  const [davka, setDavka] = useState<DokladVDavke[]>(() =>
    pociatocne.slice(0, MAX_V_DAVKE).map((v) => novyDoklad(v, novyKluc(), Date.now())),
  );
  /* Posledný stav pre slučky, ktoré bežia mimo renderu (doptávanie, ukladanie). */
  const davkaRef = useRef(davka);
  davkaRef.current = davka;
  const [otvoreny, setOtvoreny] = useState<string | null>(null);
  const [ukladamVsetky, setUkladamVsetky] = useState(false);

  /*
    Nahrávanie. Spúšťa sa po každej zmene dávky, ale najviac dva súčasne —
    ďalší čaká, kým sa miesto uvoľní. Zoznam rozbehnutých je v refe: efekt sa
    môže spustiť druhý raz skôr, než sa stav „nahrávam" prepíše (StrictMode),
    a ten istý doklad by sa v Nespracovaných založil dvakrát.
  */
  const rozbehnute = useRef(new Set<string>());
  useEffect(() => {
    for (const kluc of naNahratie(davka)) {
      if (rozbehnute.current.has(kluc)) continue;
      rozbehnute.current.add(kluc);
      const d = davka.find((x) => x.kluc === kluc)!;
      setDavka((p) => zmen(p, kluc, { stav: "nahravam", chyba: null }));
      void (async () => {
        try {
          const ciarka = d.subor.indexOf(",");
          const r = await nahraj({
            data: {
              company_id: firma.id,
              nazov: d.nazov,
              mime: d.mime,
              subor: d.subor.slice(ciarka + 1),
              zdroj: "apka",
              // Nastavenie zo skenera sa uloží k dokladu — platí, aj keď ho človek dokončí na webe.
              predvolby: nastavenie ?? null,
            },
          });
          setDavka((p) => zmen(p, kluc, { stav: "citam", id: r.id, zaciatokCitania: Date.now() }));
        } catch (e) {
          rozbehnute.current.delete(kluc);
          setDavka((p) =>
            zmen(p, kluc, {
              stav: "chyba",
              chyba: e instanceof Error ? e.message : t("rd.chybaNahratia"),
            }),
          );
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [davka]);

  /*
    Doptávanie sa na prečítanie — rovnaký interval ako pri jednom doklade.
    Pýta sa po jednom, nie naraz za všetky: detail dokladu na serveri robí
    viac dotazov a desať naraz každé dve sekundy by bolo zbytočne veľa.
    Výpadok jednej odpovede nevadí, skúsi sa v ďalšom kole.
  */
  useEffect(() => {
    let koniec = false;
    let casovac: ReturnType<typeof setTimeout> | undefined;
    const kolo = async () => {
      for (const d of naCitanie(davkaRef.current)) {
        if (koniec) return;
        if (poStrope(d, Date.now())) {
          setDavka((p) => zmen(p, d.kluc, { stav: "dlho" }, "citam"));
          continue;
        }
        try {
          const detail = await stavDokladu({ data: { id: d.id! } });
          const v = vyhodnotDetail(detail, nastavenie);
          if (v && !koniec) setDavka((p) => zmen(p, d.kluc, v, "citam"));
        } catch {
          /* skúsi sa znova v ďalšom kole */
        }
      }
      if (!koniec) casovac = setTimeout(kolo, INTERVAL_CITANIA_MS);
    };
    casovac = setTimeout(kolo, INTERVAL_CITANIA_MS);
    return () => {
      koniec = true;
      if (casovac) clearTimeout(casovac);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pridaj(vstupy: VstupDavky[]) {
    if (!vstupy.length) return;
    const volne = MAX_V_DAVKE - davkaRef.current.length;
    if (vstupy.length > volne) toast.error(t("davka.prilisVela", { max: MAX_V_DAVKE }));
    const nove = vstupy
      .slice(0, Math.max(0, volne))
      .map((v) => novyDoklad(v, novyKluc(), Date.now()));
    if (nove.length) setDavka((p) => [...p, ...nove]);
  }

  async function odfot() {
    if (!(await online())) return void toast.error(t("davka.bezSignalu"));
    /*
      Každá fotka je samostatný doklad. QR z eKasy sa tu zvlášť nehľadá — AI
      bloček spozná aj bez neho; presnejšie čítanie z Finančnej správy ostáva
      pri jednom doklade zo skenera.

      Kamera dokladu vie odfotiť viac strán za sebou. V dávke je každá
      odfotená strana **samostatný doklad** — presne na to dávka je: kôpka
      bločkov sa prejde jedným fotením bez vracania sa do appky. Kto má
      jeden doklad o viacerých stranách, naskenuje ho cez „Viacstranový" na
      skeneri; tam sa strany spoja do jedného PDF. Voľbu tu neponúkame: otázka
      po každom skenovaní by zdržala práve to, kvôli čomu je dávka rýchla.
    */
    const strany = await zachytStrany({ davka: true });
    if (strany?.length) pridaj(strany.map((subor) => ({ subor })));
  }

  async function zGalerie() {
    if (!(await online())) return void toast.error(t("davka.bezSignalu"));
    const subory = await vyberSubory("application/pdf,image/*", true);
    pridaj(subory.map((s) => ({ subor: s.dataUrl, nazov: s.nazov })));
  }

  /*
    Hromadné uloženie — postupne, jeden po druhom. Duplicitu appka nepotvrdí
    sama: doklad ostane v stave „Možná duplicita" a rozhodne o ňom človek
    ťuknutím, presne ako pri jednom doklade.
  */
  async function ulozVsetky() {
    const naUlozenie = naHromadneUlozenie(davkaRef.current);
    if (!naUlozenie.length) return;
    setUkladamVsetky(true);
    let ulozene = 0;
    for (const d of naUlozenie) {
      // Medzitým ho mohol človek otvoriť a uložiť sám.
      if (davkaRef.current.find((x) => x.kluc === d.kluc)?.stav !== "rozpoznane") continue;
      setDavka((p) => zmen(p, d.kluc, { stav: "ukladam", chyba: null }));
      try {
        await vytvor({ data: { id: d.id!, druh: d.druh!, udaje: d.udaje! } });
        ulozene++;
        setDavka((p) => zmen(p, d.kluc, { stav: "ulozene" }));
      } catch (e) {
        const sprava = e instanceof Error ? e.message : String(e ?? "");
        setDavka((p) => zmen(p, d.kluc, poChybeUlozenia(sprava || t("rd.chybaUlozenia"))));
      }
    }
    setUkladamVsetky(false);
    if (ulozene) toast.success(t("davka.ulozeneHromadne", { pocet: ulozene }));
  }

  async function hotovo() {
    const s = suhrn(davkaRef.current);
    if (s.spolu === 0) return onSpat();
    if (s.nenahrane > 0) {
      const ano = await potvrd(t("davka.nenahrane", { pocet: s.nenahrane }), {
        potvrdit: t("davka.zavrietAjTak"),
        zrusit: t("spolocne.zrusit"),
      });
      if (!ano) return;
    }
    if (s.vNespracovanych > 0) toast(t("davka.hotovoHlaska", { pocet: s.vNespracovanych }));
    else if (s.ulozene > 0) toast.success(t("davka.hotovoVsetko"));
    if (s.ulozene + s.vNespracovanych === 0) return onSpat();
    onHotovo();
  }

  function tukni(d: DokladVDavke) {
    const co = poTuknuti(d);
    if (co === "znova") setDavka((p) => zmen(p, d.kluc, { stav: "caka", chyba: null }));
    else if (co === "detail") setOtvoreny(d.kluc);
  }

  const otvorenyDoklad = otvoreny ? davka.find((d) => d.kluc === otvoreny) : undefined;
  if (otvorenyDoklad?.id) {
    const kluc = otvorenyDoklad.kluc;
    /* Po dlhom čítaní sa začne doptávať odznova — človek práve počkal. */
    const odlozit = () =>
      setDavka((p) => zmen(p, kluc, { stav: "citam", zaciatokCitania: Date.now() }, "dlho"));
    const spat = () => {
      setOtvoreny(null);
      odlozit();
    };
    /*
      „Uložiť a ďalší" a „Preskočiť" (návrh „C"): dávka sa prejde doklad po
      doklade bez vracania sa do zoznamu. Keď ďalší nie je, vráti sa do zoznamu.
    */
    const dalsi = dalsiNaOtvorenie(davka, kluc);
    const poradie = davka.findIndex((d) => d.kluc === kluc) + 1;
    return (
      <RozpoznanyDoklad
        key={kluc}
        firma={firma}
        subor={otvorenyDoklad.subor}
        id={otvorenyDoklad.id}
        nastavenie={nastavenie}
        davka={{
          poradie,
          spolu: davka.length,
          maDalsi: !!dalsi,
          onPreskocit: () => {
            odlozit();
            setOtvoreny(dalsiNaOtvorenie(davkaRef.current, kluc)?.kluc ?? null);
          },
        }}
        onUlozene={(druh: DruhNespracovaneho) => {
          setDavka((p) => zmen(p, kluc, { stav: "ulozene", druh, chyba: null }));
          setOtvoreny(dalsiNaOtvorenie(davkaRef.current, kluc)?.kluc ?? null);
        }}
        onNechat={spat}
        onSpat={spat}
      />
    );
  }

  const s = suhrn(davka);
  return (
    <MobilObrazovka
      title={t("davka.nadpis")}
      subtitle={firma.name}
      onBack={() => void hotovo()}
      footer={
        <div className="space-y-1">
          <HlavneTlacidlo
            onClick={() => void ulozVsetky()}
            disabled={s.naHromadne === 0 || ukladamVsetky}
          >
            {ukladamVsetky ? t("rd.ukladam") : t("davka.ulozitVsetky", { pocet: s.naHromadne })}
          </HlavneTlacidlo>
          <button
            onClick={() => void hotovo()}
            disabled={ukladamVsetky}
            className="w-full rounded-app-sm px-4 py-2.5 text-sm text-app-text-2"
          >
            {t("davka.hotovo")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-app-text-2">{t("davka.popis")}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void odfot()}
            disabled={davka.length >= MAX_V_DAVKE}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-app-sm bg-app-zelena-plocha px-3 py-2 text-[14px] font-medium text-white disabled:opacity-50"
          >
            <Camera className="h-4 w-4 shrink-0" />
            <span className="min-w-0 text-center leading-tight">
              {davka.length ? t("davka.odfotitDalsi") : t("davka.odfotit")}
            </span>
          </button>
          <button
            onClick={() => void zGalerie()}
            disabled={davka.length >= MAX_V_DAVKE}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-app-sm border border-app-ramik bg-app-karta px-3 py-2 text-[14px] disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 text-center leading-tight">{t("davka.zGalerie")}</span>
          </button>
        </div>

        {davka.length === 0 ? (
          <p className="rounded-app border border-dashed border-app-ramik p-6 text-center text-sm text-app-text-2">
            {t("davka.prazdna")}
          </p>
        ) : (
          <>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-app-text-2">
              {t("davka.pocet", { pocet: s.spolu })}
              {s.ulozene > 0 && ` · ${t("davka.stav.ulozene")}: ${s.ulozene}`}
            </div>
            <ul className="space-y-2" aria-label={t("davka.nadpis")}>
              {davka.map((d, i) => (
                <PolozkaDavky
                  key={d.kluc}
                  d={d}
                  poradie={i + 1}
                  loc={loc}
                  onClick={() => tukni(d)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </MobilObrazovka>
  );
}

/** Jeden riadok dávky — náhľad, čo to je, a v akom je stave. */
function PolozkaDavky({
  d,
  poradie,
  loc,
  onClick,
}: {
  d: DokladVDavke;
  poradie: number;
  loc: string;
  onClick: () => void;
}) {
  const { t } = usePreklad();
  const akcia = poTuknuti(d);
  const u = d.udaje;
  const celkom = u ? sucty(u).celkom : 0;
  const nazov = d.druh ? t(NAZOV_DRUHU[d.druh]) : t("davka.dokladN", { n: poradie });
  const dodavatel = u?.dodavatel.nazov || (d.druh ? "" : d.nazov);

  let stav: { text: string; ikona: React.ReactNode; farba: string };
  switch (d.stav) {
    case "caka":
      stav = {
        text: t("davka.stav.caka"),
        ikona: <Clock className="h-3.5 w-3.5" />,
        farba: "text-app-text-2",
      };
      break;
    case "nahravam":
    case "citam":
    case "ukladam":
      stav = {
        text:
          d.stav === "nahravam"
            ? t("davka.stav.nahravam")
            : d.stav === "citam"
              ? t("davka.stav.citam")
              : t("rd.ukladam"),
        ikona: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
        farba: "text-app-text-2",
      };
      break;
    case "rozpoznane":
      stav = {
        text: t("davka.stav.rozpoznane"),
        ikona: <CheckCircle2 className="h-3.5 w-3.5" />,
        farba: "text-app-zelena",
      };
      break;
    case "doplnit":
      stav = {
        text: t("davka.stav.doplnit", { polia: popisChybajucich(d, t).join(", ") }),
        ikona: <PencilLine className="h-3.5 w-3.5" />,
        farba: "text-app-pozor",
      };
      break;
    case "duplicita":
      stav = {
        text: t("davka.stav.duplicita"),
        ikona: <AlertTriangle className="h-3.5 w-3.5" />,
        farba: "text-app-pozor",
      };
      break;
    case "dlho":
      stav = {
        text: t("davka.stav.dlho"),
        ikona: <Clock className="h-3.5 w-3.5" />,
        farba: "text-app-pozor",
      };
      break;
    case "ulozene":
      stav = {
        text: t("davka.stav.ulozene"),
        ikona: <CheckCircle2 className="h-3.5 w-3.5" />,
        farba: "text-app-zelena",
      };
      break;
    default:
      stav = {
        text: d.prilisVelky ? t("davka.prilisVelky") : t("davka.stav.chyba"),
        ikona: <AlertTriangle className="h-3.5 w-3.5" />,
        farba: "text-app-pozor",
      };
  }

  return (
    <li>
      <button
        onClick={onClick}
        disabled={!akcia}
        data-stav={d.stav}
        className={`flex w-full items-center gap-3 rounded-app border bg-app-karta p-2.5 text-left transition ${
          akcia ? "border-app-ramik active:bg-app-pozadie" : "border-app-ramik/60"
        } ${d.stav === "ulozene" ? "opacity-70" : ""}`}
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-app-sm bg-app-pozadie">
          {d.mime.includes("pdf") ? (
            <FileText className="h-6 w-6 text-app-text-2" />
          ) : (
            <img src={d.subor} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[14px] font-medium">{nazov}</span>
            {celkom ? (
              <span className="shrink-0 text-[14px] font-semibold tabular-nums">
                {formatujMenu(celkom, u?.mena || "EUR", loc)}
              </span>
            ) : null}
          </span>
          {dodavatel && (
            <span className="block min-w-0 truncate text-[12px] text-app-text-2">{dodavatel}</span>
          )}
          <span className={`mt-0.5 flex min-w-0 items-center gap-1 text-[12px] ${stav.farba}`}>
            {stav.ikona}
            <span className="min-w-0 truncate">{stav.text}</span>
          </span>
          {d.chyba && d.stav !== "doplnit" && (
            <span className="block min-w-0 truncate text-[11px] text-app-text-2">{d.chyba}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Čo dokladu chýba, slovami appky — tie isté polia, aké ukáže jeho obrazovka. */
function popisChybajucich(d: DokladVDavke, t: ReturnType<typeof usePreklad>["t"]): string[] {
  if (!d.druh || !d.udaje) return [t("davka.pole.druh")];
  const p = polaNaDoplnenie(d.druh, d.udaje, d.povinne);
  const out = p.upravitelne.map((k) => t(NAZOV_POLA[k]));
  if (d.chybajuce.includes("platba")) out.push(t("davka.pole.platba"));
  if (p.vyrovnat) out.push(t("davka.pole.polozky"));
  return [...out, ...p.mimoAppky];
}
