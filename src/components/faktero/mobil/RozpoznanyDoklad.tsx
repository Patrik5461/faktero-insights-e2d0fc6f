import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2, RotateCcw } from "lucide-react";
import { useOperacia } from "@/lib/mobile/server-most";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
import { potvrd } from "@/lib/potvrdenie";
import { formatujMenu } from "@/lib/faktero/mena";
import {
  chybajuce,
  nacitajUdaje,
  sucty,
  vyrovnajPolozky,
  DRUHY_NESPRACOVANYCH,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { PREDPONA_DUPLICITY } from "@/lib/faktero/prijate-duplicity";
import {
  doplnZNastavenia,
  hodnotaPola,
  polaNaDoplnenie,
  rozoberDataUrl as rozober,
  uplatniUpravy,
  INTERVAL_CITANIA_MS,
  STROP_CITANIA_MS,
  TYP_POLA,
  type PoleNaDoplnenie,
} from "@/lib/mobile/sken-rozpoznanie";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import { HlavneTlacidlo, MobilObrazovka, Pracujem } from "./MobilChrome";
import { datum } from "./PrijateDoklady";
import type { NastavenieDokladu } from "./Skener";

/** Odpoveď `sken-stav` — to z detailu nespracovaného dokladu, čo appka potrebuje. */
type Detail = {
  stav: "cita" | "vytazene" | "chyba" | string;
  druh: DruhNespracovaneho | null;
  udaje: UdajeNespracovaneho;
  chyba: string | null;
  povinne: string[];
  varovania: string[];
};

export const NAZOV_DRUHU: Record<DruhNespracovaneho, Kluc> = {
  faktura: "rd.druh.faktura",
  zalohova: "rd.druh.zalohova",
  dobropis: "rd.druh.dobropis",
  blocek: "rd.druh.blocek",
  ostatny: "rd.druh.ostatny",
};
/* Celé vety po druhoch — „Uložiť ako {druh}" by v slovenčine nemalo správny pád. */
const ULOZIT_AKO: Record<DruhNespracovaneho, Kluc> = {
  faktura: "rd.ulozit.faktura",
  zalohova: "rd.ulozit.zalohova",
  dobropis: "rd.ulozit.dobropis",
  blocek: "rd.ulozit.blocek",
  ostatny: "rd.ulozit.ostatny",
};
const ULOZENE_AKO: Record<DruhNespracovaneho, Kluc> = {
  faktura: "rd.ulozene.faktura",
  zalohova: "rd.ulozene.zalohova",
  dobropis: "rd.ulozene.dobropis",
  blocek: "rd.ulozene.blocek",
  ostatny: "rd.ulozene.ostatny",
};
export const NAZOV_POLA: Record<PoleNaDoplnenie, Kluc> = {
  dodavatel: "rd.dodavatel",
  cislo: "rd.cislo",
  datumVystavenia: "rd.vystavene",
  splatnost: "rd.splatnost",
  opravuje: "rd.opravuje",
  celkom: "rd.suma",
};

/**
 * Jeden skener na všetko — výsledok rozpoznania.
 *
 * Doklad sa hneď po nasnímaní nahrá do Nespracovaných dokladov a server ho
 * prečíta tou istou AI ako doklady z mailu. Appka sa doptáva, kým čítanie
 * neskončí, ukáže, čo rozpoznala, a doklad sa uloží jedným ťuknutím. Kto
 * nechce rozhodovať teraz, nechá ho tak — v Nespracovaných už je.
 *
 * Pýta sa len na to, bez čoho sa doklad uložiť nedá (`chybajuce`). Všetko
 * ostatné sa dá opraviť neskôr na webe; mobil nemá byť druhý formulár.
 */
export function RozpoznanyDoklad({
  firma,
  subor,
  id: uzNahrane,
  nastavenie,
  onUlozene,
  onNechat,
  onSpat,
  onDalsi,
}: {
  firma: { id: string; name: string };
  /** Fotka, obrázok z galérie alebo PDF (aj spojené strany) ako data URL. */
  subor: string;
  /**
   * Doklad je už nahratý (dávka viacerých dokladov) — nenahráva sa znova,
   * len sa dočíta. `subor` vtedy slúži len na náhľad.
   */
  id?: string;
  /** Nastavenie zo skenera — úhrada, kategória, zákazka, predkontácia, komentár. */
  nastavenie?: NastavenieDokladu;
  onUlozene: (druh: DruhNespracovaneho) => void;
  /** Doklad ostáva v Nespracovaných — len sa odíde. */
  onNechat: () => void;
  /** Späť, kým sa doklad ešte nenahral — nikde nie je, dá sa nasnímať znova. */
  onSpat: () => void;
  /**
   * „Odfotiť ďalší doklad" — tento doklad (už nahratý) sa presunie do dávky
   * a fotí sa ďalší. Bez neho sa tlačidlo neukáže (v dávke má vlastné).
   */
  onDalsi?: (id: string) => void;
}) {
  const { t, locale: loc } = usePreklad();
  const nahraj = useOperacia<{ id: string }>("sken-nahraj");
  const stavDokladu = useOperacia<Detail>("sken-stav");
  const vytvor = useOperacia<{ agenda: string; id: string }>("sken-vytvor");

  const [faza, setFaza] = useState<"nahravam" | "chybaNahratia" | "citam" | "dlho" | "hotovo">(
    uzNahrane ? "citam" : "nahravam",
  );
  const [chybaNahratia, setChybaNahratia] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(uzNahrane ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [druh, setDruh] = useState<DruhNespracovaneho | null>(null);
  const [platba, setPlatba] = useState("");
  const [kategoria, setKategoria] = useState("");
  const [upravy, setUpravy] = useState<Partial<Record<PoleNaDoplnenie, string>>>({});
  const [vyrovnane, setVyrovnane] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  /** Kolo doptávania — „Počkať ešte" spustí nové. */
  const [kolo, setKolo] = useState(0);

  const { mime } = useMemo(() => rozober(subor), [subor]);

  /*
    Nahráva sa raz. Bez poistky by druhé vykreslenie (návrat appky do popredia,
    StrictMode) založilo ten istý doklad v Nespracovaných dvakrát.
  */
  const nahrane = useRef(false);
  async function nahrajDoklad() {
    setFaza("nahravam");
    setChybaNahratia(null);
    try {
      const s = rozober(subor);
      const r = await nahraj({
        data: {
          company_id: firma.id,
          nazov: s.nazov,
          mime: s.mime,
          subor: s.base64,
          zdroj: "apka",
        },
      });
      setId(r.id);
      setFaza("citam");
    } catch (e) {
      setChybaNahratia(e instanceof Error ? e.message : t("rd.chybaNahratia"));
      setFaza("chybaNahratia");
    }
  }
  useEffect(() => {
    if (nahrane.current || uzNahrane) return;
    nahrane.current = true;
    void nahrajDoklad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    Doptávanie sa na prečítanie. AI číta doklad na pozadí servera (desiatky
    sekúnd pri viacstranovom PDF), takže sa pýtame každé dve sekundy. Výpadok
    jednej odpovede nevadí — skúsi sa znova, až kým nevyprší strop.
  */
  useEffect(() => {
    if (!id || faza !== "citam") return;
    let koniec = false;
    let casovac: ReturnType<typeof setTimeout> | undefined;
    const zaciatok = Date.now();
    const pytaj = async () => {
      try {
        const d = await stavDokladu({ data: { id } });
        if (koniec) return;
        if (d.stav !== "cita") {
          const u = nacitajUdaje(d.udaje);
          const navrh = (d.druh as DruhNespracovaneho | null) ?? null;
          setDetail({ ...d, udaje: u });
          setDruh(navrh);
          setPlatba(doplnZNastavenia(u, "blocek", nastavenie).platba);
          setKategoria(doplnZNastavenia(u, "faktura", nastavenie).kategoria);
          setFaza("hotovo");
          return;
        }
      } catch {
        /* bez odpovede sa skúsi znova pri ďalšom kole */
      }
      if (koniec) return;
      if (Date.now() - zaciatok > STROP_CITANIA_MS) {
        setFaza("dlho");
        return;
      }
      casovac = setTimeout(pytaj, INTERVAL_CITANIA_MS);
    };
    /* Z dávky prichádza doklad často už prečítaný — prvá otázka hneď. */
    casovac = setTimeout(pytaj, uzNahrane && kolo === 0 ? 0 : INTERVAL_CITANIA_MS);
    return () => {
      koniec = true;
      if (casovac) clearTimeout(casovac);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, faza, kolo]);

  /** Údaje so všetkým, čo si človek nastavil na skeneri a vybral tu, bez písaných úprav. */
  const zaklad = useMemo(() => {
    if (!detail || !druh) return null;
    const u = doplnZNastavenia(detail.udaje, druh, nastavenie);
    return {
      ...u,
      platba: druh === "blocek" ? platba : u.platba,
      kategoria: druh === "ostatny" ? u.kategoria : kategoria,
    };
  }, [detail, druh, nastavenie, platba, kategoria]);

  const polia = useMemo(
    () => (zaklad && druh ? polaNaDoplnenie(druh, zaklad, detail?.povinne) : null),
    [zaklad, druh, detail?.povinne],
  );

  const finalne = useMemo(() => {
    if (!zaklad) return null;
    const u = uplatniUpravy(zaklad, upravy);
    return vyrovnane ? vyrovnajPolozky(u) : u;
  }, [zaklad, upravy, vyrovnane]);

  const chyba = druh && finalne ? chybajuce(druh, finalne, detail?.povinne) : ["druh"];
  const daSaUlozit = !!druh && chyba.length === 0 && !ukladam;

  async function uloz(ajDuplicitu = false) {
    if (!druh || !finalne || !id) return;
    setUkladam(true);
    try {
      await vytvor({
        data: { id, druh, udaje: finalne, ...(ajDuplicitu ? { ajDuplicitu: true } : {}) },
      });
      toast.success(t(ULOZENE_AKO[druh]));
      onUlozene(druh);
    } catch (e) {
      const sprava = e instanceof Error ? e.message : String(e ?? "");
      /* Ten istý doklad už v evidencii je — rozhodne človek, nie appka. */
      if (sprava.startsWith(PREDPONA_DUPLICITY) && !ajDuplicitu) {
        setUkladam(false);
        const ano = await potvrd(sprava.slice(PREDPONA_DUPLICITY.length), {
          potvrdit: t("rd.ulozitAjTak"),
          zrusit: t("spolocne.zrusit"),
        });
        if (ano) await uloz(true);
        return;
      }
      toast.error(sprava || t("rd.chybaUlozenia"));
      setUkladam(false);
    }
  }

  function nechat() {
    toast(t("rd.nechatHlaska"));
    onNechat();
  }

  if (faza === "nahravam") return <Pracujem text={t("rd.nahravam")} />;

  if (faza === "chybaNahratia")
    return (
      <MobilObrazovka title={t("rd.nadpis")} subtitle={firma.name} onBack={onSpat}>
        <div
          role="alert"
          className="rounded-app border border-app-pozor/40 bg-app-pozor-jemna p-4 text-[14px]"
        >
          <div className="font-semibold text-app-pozor">{t("rd.chybaNahratia")}</div>
          {chybaNahratia && <div className="mt-1 text-app-text-2">{chybaNahratia}</div>}
        </div>
        <div className="mt-4 space-y-2">
          <HlavneTlacidlo onClick={() => void nahrajDoklad()}>{t("rd.skusitZnova")}</HlavneTlacidlo>
          <button
            onClick={onSpat}
            className="w-full rounded-app-sm border border-app-ramik px-4 py-3 text-sm"
          >
            {t("rd.spat")}
          </button>
        </div>
      </MobilObrazovka>
    );

  if (faza === "citam" || faza === "dlho")
    return (
      <MobilObrazovka
        title={t("rd.nadpis")}
        subtitle={firma.name}
        onBack={nechat}
        footer={
          <div className="space-y-1">
            {onDalsi && id && (
              <HlavneTlacidlo onClick={() => onDalsi(id)}>{t("rd.odfotitDalsi")}</HlavneTlacidlo>
            )}
            <button
              onClick={nechat}
              className="w-full rounded-app-sm px-4 py-3 text-sm text-app-text-2"
            >
              {t("rd.nechat")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          {faza === "citam" ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-app-zelena" />
              <div className="text-[16px] font-semibold">{t("app.citamDoklad")}</div>
              <p className="max-w-xs text-sm text-app-text-2">{t("rd.citamPopis")}</p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-8 w-8 text-app-pozor" />
              <div className="text-[16px] font-semibold">{t("rd.dlho")}</div>
              <p className="max-w-xs text-sm text-app-text-2">{t("rd.dlhoPopis")}</p>
              <button
                onClick={() => {
                  setKolo((k) => k + 1);
                  setFaza("citam");
                }}
                className="mt-2 inline-flex items-center gap-2 rounded-app-sm border border-app-ramik px-4 py-2.5 text-sm"
              >
                <RotateCcw className="h-4 w-4" /> {t("rd.cakatDalej")}
              </button>
            </>
          )}
        </div>
        <Nahlad subor={subor} mime={mime} />
      </MobilObrazovka>
    );

  if (!detail) return null;
  const u = finalne ?? detail.udaje;
  const s = sucty(u);
  const jeFaktura = druh === "faktura" || druh === "zalohova" || druh === "dobropis";
  const rozpoznany = (detail.druh as DruhNespracovaneho | null) ?? null;

  return (
    <MobilObrazovka
      title={t("rd.nadpis")}
      subtitle={firma.name}
      onBack={nechat}
      footer={
        <div className="space-y-1">
          <HlavneTlacidlo onClick={() => void uloz()} disabled={!daSaUlozit}>
            {ukladam ? t("rd.ukladam") : druh ? t(ULOZIT_AKO[druh]) : t("rd.vyberteDruh")}
          </HlavneTlacidlo>
          <div className="flex gap-2">
            <button
              onClick={nechat}
              disabled={ukladam}
              className="flex-1 rounded-app-sm px-4 py-2.5 text-sm text-app-text-2"
            >
              {t("rd.nechat")}
            </button>
            {/*
              Ďalší doklad bez ukladania tohto: tento ide do dávky aj s tým,
              čo sa z neho prečítalo, a uloží sa tam (aj hromadne).
            */}
            {onDalsi && id && (
              <button
                onClick={() => onDalsi(id)}
                disabled={ukladam}
                className="flex-1 rounded-app-sm border border-app-ramik px-4 py-2.5 text-sm"
              >
                {t("rd.odfotitDalsi")}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {detail.stav === "chyba" && (
          <div
            role="status"
            className="rounded-app border border-app-pozor/40 bg-app-pozor-jemna p-4 text-[14px]"
          >
            <div className="font-semibold text-app-pozor">{t("rd.chybaCitania")}</div>
            <div className="mt-1 text-app-text-2">{detail.chyba ?? t("rd.chybaCitaniaPopis")}</div>
          </div>
        )}
        {detail.varovania.map((v) => (
          <div
            key={v}
            role="status"
            className="rounded-app border border-app-pozor/40 bg-app-pozor-jemna p-3 text-[13px] text-app-text-2"
          >
            {v}
          </div>
        ))}

        <div>
          <div className="mb-2 text-sm font-medium">{t("rd.coToJe")}</div>
          <div role="radiogroup" aria-label={t("rd.coToJe")} className="flex flex-wrap gap-2">
            {DRUHY_NESPRACOVANYCH.map(({ kluc }) => (
              <button
                key={kluc}
                role="radio"
                aria-checked={druh === kluc}
                onClick={() => setDruh(kluc)}
                className={`min-h-[40px] rounded-full border px-3.5 text-[14px] transition ${
                  druh === kluc
                    ? "border-primary bg-primary/10 font-semibold text-app-zelena"
                    : "border-app-ramik bg-app-karta text-foreground"
                }`}
              >
                {t(NAZOV_DRUHU[kluc])}
                {rozpoznany === kluc && (
                  <span className="ml-1.5 text-[11px] font-normal text-app-text-2">
                    · {t("rd.rozpoznane")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Zhrnutie — to, podľa čoho človek doklad spozná. */}
        <div className="rounded-app border border-app-ramik bg-app-karta p-4 shadow-[var(--shadow-card)]">
          <div className="text-[30px] font-semibold leading-none tabular-nums">
            {s.celkom ? formatujMenu(s.celkom, u.mena || "EUR", loc) : "—"}
          </div>
          <div className="mt-2 text-[14px] text-app-text-2">
            {u.dodavatel.nazov || t("app.neznamyPredajca")}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
            {u.cislo && (
              <>
                <dt className="text-app-text-2">{t("rd.cislo")}</dt>
                <dd className="min-w-0 truncate text-right">{u.cislo}</dd>
              </>
            )}
            {u.datumVystavenia && (
              <>
                <dt className="text-app-text-2">{t("rd.vystavene")}</dt>
                <dd className="text-right">{datum(u.datumVystavenia, loc)}</dd>
              </>
            )}
            {jeFaktura && u.splatnost && (
              <>
                <dt className="text-app-text-2">{t("rd.splatnost")}</dt>
                <dd className="text-right">{datum(u.splatnost, loc)}</dd>
              </>
            )}
            {druh === "ostatny" && u.ostatny.predmet && (
              <>
                <dt className="text-app-text-2">{t("rd.predmet")}</dt>
                <dd className="min-w-0 text-right">{u.ostatny.predmet}</dd>
              </>
            )}
          </dl>
        </div>

        {druh === "blocek" && (
          <div>
            <div className="mb-2 text-sm font-medium">{t("rd.uhrada")}</div>
            <div role="radiogroup" aria-label={t("rd.uhrada")} className="grid grid-cols-3 gap-2">
              {(
                [
                  ["hotovost", t("pd.hotovost")],
                  ["karta", t("pd.kartou")],
                  ["prevod", t("pd.prevodom")],
                ] as const
              ).map(([kod, label]) => (
                <button
                  key={kod}
                  role="radio"
                  aria-checked={platba === kod}
                  onClick={() => setPlatba(kod)}
                  className={`rounded-app border py-3 text-[14px] transition active:scale-[0.98] ${
                    platba === kod
                      ? "border-primary bg-primary/10 font-semibold text-app-zelena"
                      : platba
                        ? "border-app-ramik bg-app-karta"
                        : "border-primary/40 bg-app-karta font-medium"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {druh && druh !== "ostatny" && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t("sken.kategoria")}</span>
            <select
              value={kategoria}
              onChange={(e) => setKategoria(e.target.value)}
              className="min-h-[44px] w-full rounded-app-sm border border-app-ramik bg-app-karta px-3 text-[15px]"
            >
              <option value="">{t("sken.nezaradene")}</option>
              {KATEGORIE_VYDAVKOV.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {k.nazov}
                </option>
              ))}
            </select>
          </label>
        )}

        {polia &&
          (polia.upravitelne.length > 0 || polia.vyrovnat || polia.mimoAppky.length > 0) && (
            <div className="space-y-3 rounded-app border border-primary/40 bg-primary/5 p-3">
              <div className="text-sm font-medium">{t("rd.doplnte")}</div>
              {polia.upravitelne.map((p) => (
                <label key={p} className="block">
                  <span className="mb-1 block text-[12px] font-medium text-app-text-2">
                    {t(NAZOV_POLA[p])}
                  </span>
                  <input
                    type={TYP_POLA[p] === "number" ? "text" : TYP_POLA[p]}
                    inputMode={TYP_POLA[p] === "number" ? "decimal" : undefined}
                    value={upravy[p] ?? (zaklad ? hodnotaPola(zaklad, p) : "")}
                    onChange={(e) => setUpravy((x) => ({ ...x, [p]: e.target.value }))}
                    className="min-h-[44px] w-full rounded-app-sm border border-app-ramik bg-app-karta px-3 text-[15px]"
                  />
                </label>
              ))}
              {polia.vyrovnat && (
                <div className="text-[13px]">
                  <p className="text-app-text-2">{t("rd.polozkyNesedia")}</p>
                  <button
                    onClick={() => setVyrovnane(true)}
                    disabled={vyrovnane}
                    aria-pressed={vyrovnane}
                    className="mt-2 w-full rounded-app-sm border border-app-ramik bg-app-karta px-4 py-2.5 text-sm disabled:opacity-60"
                  >
                    {vyrovnane ? t("rd.vyrovnane") : t("rd.vyrovnat")}
                  </button>
                </div>
              )}
              {polia.mimoAppky.length > 0 && (
                <p className="text-[13px] text-app-text-2">
                  {t("rd.mimoAppky", { polia: polia.mimoAppky.join(", ") })}
                </p>
              )}
            </div>
          )}

        <Nahlad subor={subor} mime={mime} />
      </div>
    </MobilObrazovka>
  );
}

/** Náhľad toho, čo sa nahralo — z telefónu, nie zo servera, aby nečakal na sieť. */
function Nahlad({ subor, mime }: { subor: string; mime: string }) {
  const { t } = usePreklad();
  return (
    <div className="overflow-hidden rounded-app-sm border border-app-ramik bg-app-karta">
      {mime.includes("pdf") ? (
        <div className="flex items-center gap-2 p-4 text-sm text-app-text-2">
          <FileText className="h-5 w-5" /> {t("app.prilozenePdf")}
        </div>
      ) : (
        <img src={subor} alt={t("rd.nahladAlt")} className="max-h-56 w-full object-contain" />
      )}
    </div>
  );
}
