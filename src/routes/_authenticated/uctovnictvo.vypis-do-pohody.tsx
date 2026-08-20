import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import {
  spustiCitanieVypisuFn,
  stavCitaniaVypisuFn,
  vypisDoPohodyFn,
} from "@/lib/faktero/vypis-pdf.functions";
import type { Vypis, VypisPohyb } from "@/lib/faktero/vypis-pohyby";
import { OZNACENIA, type KodOznacenia } from "@/lib/faktero/vypis-oznacenie";
import { Download, FileUp, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/uctovnictvo/vypis-do-pohody")({
  head: () => ({ meta: [{ title: "Bankový výpis do Pohody — Faktero" }] }),
  component: VypisDoPohodyPage,
});

/**
 * Záloha nastavenia v prehliadači.
 *
 * Skratka účtu a predkontácie patria **firme** — vyplní ich jeden človek a majú
 * ich všetci. Do firmy ich ale smie zapísať len jej správca, tak si ich
 * prehliadač zároveň drží u seba: účtovník bez práv o ne neprde a keď firemné
 * nastavenie pribudne, prebije to miestne.
 */
const PAMAT = "faktero.vypis-pohoda";

type Nastavenia = {
  banka: string;
  predkontacia: string;
  /** Predkontácia pre jednotlivé označenia platby; kľúč je kód označenia. */
  predkontacie: Partial<Record<KodOznacenia, string>>;
};

const PRAZDNE: Nastavenia = { banka: "", predkontacia: "", predkontacie: {} };

function zPamate(): Nastavenia {
  try {
    const raw = localStorage.getItem(PAMAT);
    if (raw) return { ...PRAZDNE, ...JSON.parse(raw) };
  } catch {
    /* súkromný režim — políčka ostanú prázdne */
  }
  return PRAZDNE;
}

/**
 * Text z PDF ešte v prehliadači.
 *
 * Zmyslom je nemusieť posielať celý súbor: v požiadavke ide ako base64, čo ho
 * nafúkne o tretinu, a väčší výpis tak spadne ešte na sieti — v prehliadači to
 * vyzerá ako holé „Failed to fetch". Keď sa čítanie nepodarí (alebo je výpis
 * naskenovaný), pošle sa súbor a prečíta ho server.
 */
async function textZPdf(file: File): Promise<{ text: string; stran: number } | null> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const r = await extractText(doc, { mergePages: true });
    const text = String(r.text ?? "").trim();
    return text.length >= 200 ? { text, stran: doc.numPages } : null;
  } catch {
    return null;
  }
}

function suborNaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Súbor sa nepodarilo prečítať."));
    r.onload = () => {
      const v = String(r.result ?? "");
      resolve(v.slice(v.indexOf(",") + 1));
    };
    r.readAsDataURL(file);
  });
}

/**
 * Výpis v XML sa nikam neposiela — prečíta sa rovno v prehliadači.
 *
 * Je to jediný rozdiel oproti PDF a je zásadný: v XML je suma číslom a symboly
 * vlastnými poľami, takže netreba model, netreba čakať a nedá sa to prečítať
 * zle. Súbor pritom neopustí počítač.
 */
const jeXml = (f: File) => /\.xml$/i.test(f.name) || /xml/i.test(f.type);

/** Výpis za dvadsať megabajtov XML nie je — to je omylom nahratý iný súbor. */
const STROP_XML = 20 * 1024 * 1024;

function eur(n: number): string {
  return n.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Riadok = VypisPohyb & { vyviezt: boolean };

function VypisDoPohodyPage() {
  const spusti = useServerFn(spustiCitanieVypisuFn);
  const stav = useServerFn(stavCitaniaVypisuFn);
  const doXml = useServerFn(vypisDoPohodyFn);

  const cid = useMemo(() => getActiveCompanyId(), []);
  const [nacitavam, setNacitavam] = useState(false);
  const [vyvazam, setVyvazam] = useState<"pohoda" | "sepa" | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zdroj, setZdroj] = useState<string | null>(null);
  const [varovanie, setVarovanie] = useState<string | null>(null);

  const [cisloVypisu, setCisloVypisu] = useState("");
  const [datumVypisu, setDatumVypisu] = useState("");
  const [ucet, setUcet] = useState<string | null>(null);
  const [mena, setMena] = useState<string | null>(null);
  const [riadky, setRiadky] = useState<Riadok[]>([]);

  const [nastavenia, setNastavenia] = useState(zPamate);
  /** `null` = ešte sa neukladalo; `false` = na zápis do firmy nemá práva. */
  const [voFirme, setVoFirme] = useState<boolean | null>(null);
  const ulozenie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cid) return;
    void supabase
      .from("companies")
      .select("pohoda_banka, pohoda_predkontacia_banka, pohoda_predkontacie_oznaceni")
      .eq("id", cid)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        /*
          Prázdne firemné pole nechá to, čo si pamätá prehliadač — inak by
          presun nastavenia do firmy zmazal ľuďom to, čo mali vyplnené.
        */
        setNastavenia((teraz) => ({
          banka: data.pohoda_banka ?? teraz.banka,
          predkontacia: data.pohoda_predkontacia_banka ?? teraz.predkontacia,
          predkontacie:
            (data.pohoda_predkontacie_oznaceni as Nastavenia["predkontacie"] | null) ??
            teraz.predkontacie,
        }));
      });
  }, [cid]);

  /*
    Prevodník si nič neukladá — obnovenie stránky prejdené riadky zahodí. Kým
    je na obrazovke rozpracovaný výpis, prehliadač sa preto spýta; pri
    štyridsiatich ručne opravených riadkoch je to rozdiel medzi „ups" a hodinou
    práce. Vnútri aplikácie sa to nespúšťa, len pri obnovení či zatvorení okna.
  */
  useEffect(() => {
    if (!riadky.length) return;
    const opytajSa = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", opytajSa);
    return () => window.removeEventListener("beforeunload", opytajSa);
  }, [riadky.length]);

  /** Mapa bez prázdnych hodnôt; prázdna mapa je `null`. */
  function ocisti(m: Nastavenia["predkontacie"]): Record<string, string> | null {
    const z = Object.entries(m)
      .map(([k, v]) => [k, String(v ?? "").trim()] as const)
      .filter(([, v]) => v);
    return z.length ? Object.fromEntries(z) : null;
  }

  async function ulozDoFirmy(n: Nastavenia) {
    if (!cid) return;
    /*
      Bez `select` sa nedá zistiť, či sa naozaj zapísalo: keď človek nie je
      správcom firmy, RLS riadok nenájde a `update` skončí bez chyby — len
      neurobí nič.
    */
    const { data, error } = await supabase
      .from("companies")
      .update({
        pohoda_banka: n.banka.trim() || null,
        pohoda_predkontacia_banka: n.predkontacia.trim() || null,
        pohoda_predkontacie_oznaceni: ocisti(n.predkontacie),
      })
      .eq("id", cid)
      .select("id");
    setVoFirme(!error && (data?.length ?? 0) > 0);
  }

  function zapamataj(zmena: Partial<Nastavenia>) {
    const nove = { ...nastavenia, ...zmena };
    setNastavenia(nove);
    try {
      localStorage.setItem(PAMAT, JSON.stringify(nove));
    } catch {
      /* nevadí, len sa to nabudúce nepredvyplní */
    }
    // Do firmy až keď človek dopísal — nie po každom znaku.
    if (ulozenie.current) clearTimeout(ulozenie.current);
    ulozenie.current = setTimeout(() => void ulozDoFirmy(nove), 800);
  }

  function prevezmi(v: Vypis) {
    setCisloVypisu(v.cisloVypisu ?? "");
    setDatumVypisu(v.datumVypisu ?? "");
    setUcet(v.ucet);
    setMena(v.mena);
    setRiadky(v.pohyby.map((p) => ({ ...p, vyviezt: true })));
  }

  async function nahrajXml(file: File) {
    setNacitavam(true);
    try {
      if (file.size > STROP_XML) throw new Error("Súbor je väčší než 20 MB — je to naozaj výpis?");
      const { citajBankoveXml } = await import("@/lib/faktero/vypis-xml");
      const { vypis, varovanie: v, format } = citajBankoveXml(await file.text());
      if (!vypis.pohyby.length) throw new Error("Vo výpise nie je ani jeden zaúčtovaný pohyb.");
      prevezmi(vypis);
      setVarovanie(v);
      const n = vypis.pohyby.length;
      setZdroj(
        `Prečítané priamo z XML (${format}) — ${n} ${
          n === 1 ? "pohyb" : n < 5 ? "pohyby" : "pohybov"
        }. Sumy, symboly aj protistrany sú od banky, nič sa nerozpoznávalo.`,
      );
    } catch (e: any) {
      setChyba(e?.message ?? "Výpis sa nepodarilo prečítať.");
      setVarovanie(null);
      setRiadky([]);
    } finally {
      setNacitavam(false);
    }
  }

  async function nahraj(file: File | null) {
    if (!file) return;
    setChyba(null);
    if (jeXml(file)) return void (await nahrajXml(file));
    if (!cid) return setChyba("Najprv vyberte firmu.");
    setNacitavam(true);
    try {
      const zPrehliadaca = await textZPdf(file);
      const { id } = await spusti({
        data: { company_id: cid, ...(zPrehliadaca ?? { pdf: await suborNaBase64(file) }) },
      });

      /*
        Čítanie beží na serveri a stránka sa naň pýta. Jedna dlhá požiadavka to
        byť nemôže — čokoľvek nad asi tridsať sekúnd sa medzi prehliadačom a
        serverom pretrhne a ostane z toho holé „Failed to fetch".
      */
      let odpoved: any = null;
      for (let i = 0; i < 150 && !odpoved?.hotovo; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        odpoved = await stav({ data: { company_id: cid, id } }).catch(() => null);
      }
      if (!odpoved?.hotovo) throw new Error("Čítanie trvá príliš dlho. Skúste kratší výpis.");
      if (!odpoved.ok || !odpoved.vypis)
        throw new Error(odpoved.chyba ?? "Výpis sa nepodarilo prečítať.");
      const v = odpoved.vypis;
      prevezmi(v);
      setVarovanie(v.varovanie ?? null);
      setZdroj(
        v.zdroj === "sken"
          ? `PDF nemá textovú vrstvu, čítalo sa z obrazu (${v.stran} str.) — prejdite riadky pozornejšie.`
          : `Prečítané z textu PDF (${v.stran} str.).`,
      );
    } catch (e: any) {
      setChyba(e?.message ?? "Výpis sa nepodarilo prečítať.");
      setVarovanie(null);
      setRiadky([]);
    } finally {
      setNacitavam(false);
    }
  }

  function uprav(i: number, zmena: Partial<Riadok>) {
    setRiadky((r) => r.map((x, idx) => (idx === i ? { ...x, ...zmena } : x)));
  }

  /*
    Predkontácie sa pýtajú len na označenia, ktoré v tomto výpise naozaj sú —
    jedenásť prázdnych políčok by z obrazovky spravilo formulár, ktorý nikto
    nevyplní. Čo už raz vyplnené je, ostáva vidieť.
  */
  const pocetPodlaOznacenia = (kod: KodOznacenia) =>
    riadky.filter((r) => r.oznacenie === kod).length;
  const pouziteOznacenia = OZNACENIA.filter(
    (o) => pocetPodlaOznacenia(o.kod) > 0 || nastavenia.predkontacie[o.kod],
  );

  const vybrane = riadky.filter((r) => r.vyviezt);
  // Bez zostatkov sa camt.053 zostaviť dá, ale s nulovými zostatkami účtu.
  const maZostatky = vybrane.some((r) => r.zostatok != null);
  const prijmy = vybrane.filter((r) => r.smer === "prijem").reduce((s, r) => s + r.suma, 0);
  const vydaje = vybrane.filter((r) => r.smer === "vydaj").reduce((s, r) => s + r.suma, 0);

  async function stiahni(format: "pohoda" | "sepa") {
    if (!cid) return setChyba("Najprv vyberte firmu.");
    setChyba(null);
    setVyvazam(format);
    try {
      const r = await doXml({
        data: {
          company_id: cid,
          // Pomocný príznak do XML nepatrí.
          pohyby: vybrane.map(({ vyviezt: _vyviezt, ...p }) => p),
          cisloVypisu: cisloVypisu || null,
          datumVypisu: datumVypisu || null,
          banka: nastavenia.banka || null,
          predkontacia: nastavenia.predkontacia || null,
          predkontacie: nastavenia.predkontacie as Record<string, string>,
          ucet,
          mena,
          format,
        },
      });
      const blob = new Blob([r.content], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setChyba(e?.message ?? "XML sa nepodarilo vyrobiť.");
    } finally {
      setVyvazam(null);
    }
  }

  const vstup = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <>
      <PageHeader
        title="Bankový výpis do Pohody"
        description="Z výpisu z banky (XML aj PDF) vyrobí XML, ktoré POHODA načíta ako bankové doklady."
      />
      <PageBody>
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
              {nacitavam ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <FileUp className="h-6 w-6 text-primary" />
              )}
              <span className="text-sm font-medium">
                {nacitavam ? "Čítam výpis…" : "Vyberte výpis — XML alebo PDF"}
              </span>
              <span className="text-xs text-muted-foreground">
                <strong>XML z internetbankingu</strong> (banky mu hovoria SEPA XML alebo camt.053)
                je presné — sumy, symboly aj protistrany sú priamo od banky a prečíta sa hneď. PDF
                sa rozpoznáva, naskenované ešte aj z obrazu, takže riadky treba prejsť.
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf,application/xml,text/xml,.xml"
                className="hidden"
                disabled={nacitavam}
                onChange={(e) => void nahraj(e.target.files?.[0] ?? null)}
              />
            </label>
            {zdroj && <p className="mt-3 text-xs text-muted-foreground">{zdroj}</p>}
            {varovanie && (
              <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                {varovanie}
              </p>
            )}
            {chyba && <p className="mt-3 text-sm text-destructive">{chyba}</p>}
          </div>

          {riadky.length > 0 && (
            <>
              <div className="grid gap-4 rounded-2xl border border-border/70 bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Číslo výpisu</span>
                  <input
                    className={vstup}
                    value={cisloVypisu}
                    onChange={(e) => setCisloVypisu(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Dátum výpisu</span>
                  <input
                    type="date"
                    className={vstup}
                    value={datumVypisu}
                    onChange={(e) => setDatumVypisu(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    Skratka účtu v Pohode
                  </span>
                  <input
                    className={vstup}
                    placeholder="napr. TB"
                    value={nastavenia.banka}
                    onChange={(e) => zapamataj({ banka: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    Predkontácia (spoločná)
                  </span>
                  <input
                    className={vstup}
                    placeholder="napr. 2Bv"
                    value={nastavenia.predkontacia}
                    onChange={(e) => zapamataj({ predkontacia: e.target.value })}
                  />
                </label>
                <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                  Skratka účtu hovorí, do ktorého bankového účtu v Pohode doklady patria; bez nej
                  ich POHODA priradí sama a účtovník ich prepisuje ručne.
                  {ucet ? ` Výpis je k účtu ${ucet}.` : ""}
                  {mena && mena !== "EUR" ? ` Pozor, výpis je v mene ${mena}.` : ""}
                </p>
              </div>

              {pouziteOznacenia.length > 0 && (
                <div className="rounded-2xl border border-border/70 bg-card p-5">
                  <div className="text-sm font-medium">Predkontácie podľa označenia platby</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Poplatok, daň a úhrada faktúry sa účtujú každé inam. Keď sem napíšete
                    predkontácie z Pohody, doklad príde rovno zaúčtovaný; čo necháte prázdne,
                    dostane spoločnú predkontáciu vyššie.{" "}
                    {voFirme === false ? (
                      <>
                        Zapísať ich k firme môže len jej správca — zatiaľ si ich pamätá len tento
                        prehliadač. Natrvalo patria do <em>Účtovníctvo → Prepojenie s Pohodou</em>.
                      </>
                    ) : (
                      <>
                        Ukladajú sa k firme, takže ich má každý; nastaviť sa dajú aj v{" "}
                        <em>Účtovníctvo → Prepojenie s Pohodou</em>.
                      </>
                    )}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pouziteOznacenia.map((o) => (
                      <label key={o.kod} className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">
                          {o.nazov}
                          <span className="ml-1 opacity-70">({pocetPodlaOznacenia(o.kod)}×)</span>
                        </span>
                        <input
                          className={vstup}
                          placeholder={nastavenia.predkontacia || "napr. 2Bv"}
                          value={nastavenia.predkontacie[o.kod] ?? ""}
                          onChange={(e) =>
                            zapamataj({
                              predkontacie: {
                                ...nastavenia.predkontacie,
                                [o.kod]: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2"></th>
                      <th className="p-2">Dátum</th>
                      <th className="p-2">Smer</th>
                      <th className="p-2 text-right">Suma</th>
                      <th className="p-2">Popis</th>
                      <th className="p-2">Označenie platby</th>
                      <th className="p-2">Protistrana</th>
                      <th className="p-2">Protiúčet</th>
                      <th className="p-2">VS</th>
                      <th className="p-2">KS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riadky.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-b border-border/50 last:border-0 ${
                          r.vyviezt ? "" : "opacity-40"
                        }`}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={r.vyviezt}
                            onChange={(e) => uprav(i, { vyviezt: e.target.checked })}
                            aria-label="Vyviezť tento pohyb"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            className={vstup}
                            value={r.datum}
                            onChange={(e) => uprav(i, { datum: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            className={`${vstup} min-w-[100px]`}
                            value={r.smer}
                            onChange={(e) =>
                              uprav(i, { smer: e.target.value as VypisPohyb["smer"] })
                            }
                          >
                            <option value="prijem">príjem</option>
                            <option value="vydaj">výdaj</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            className={`${vstup} text-right`}
                            value={r.suma}
                            onChange={(e) => uprav(i, { suma: Number(e.target.value) })}
                          />
                        </td>
                        <td className="min-w-[320px] p-2">
                          {/* Popis z XML býva dlhý a práve ten sa najviac upravuje. */}
                          <input
                            className={vstup}
                            value={r.popis ?? ""}
                            title={r.popis ?? ""}
                            onChange={(e) => uprav(i, { popis: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          {/*
                            Výpis hovorí koľko a komu, nie čo to bolo — a práve
                            podľa toho sa účtuje. Predvyplní sa odhad, človek ho
                            prepíše.
                          */}
                          <select
                            className={`${vstup} min-w-[170px]`}
                            value={r.oznacenie ?? ""}
                            onChange={(e) =>
                              uprav(i, {
                                oznacenie: (e.target.value || null) as KodOznacenia | null,
                              })
                            }
                            aria-label="Označenie platby"
                          >
                            <option value="">—</option>
                            {OZNACENIA.map((o) => (
                              <option key={o.kod} value={o.kod}>
                                {o.nazov}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            className={vstup}
                            value={r.protistrana ?? ""}
                            onChange={(e) => uprav(i, { protistrana: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className={vstup}
                            value={r.protiucet ?? ""}
                            onChange={(e) => uprav(i, { protiucet: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className={`${vstup} w-24`}
                            value={r.vs ?? ""}
                            onChange={(e) => uprav(i, { vs: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className={`${vstup} w-16`}
                            value={r.ks ?? ""}
                            onChange={(e) => uprav(i, { ks: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-5">
                <div className="text-sm">
                  <span className="font-medium">{vybrane.length}</span> z {riadky.length} pohybov ·
                  príjmy <span className="font-medium">{eur(prijmy)}</span> · výdavky{" "}
                  <span className="font-medium">{eur(vydaje)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setRiadky([]);
                      setZdroj(null);
                      setVarovanie(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm"
                  >
                    <Trash2 className="h-4 w-4" /> Zahodiť
                  </button>
                  <button
                    onClick={() => void stiahni("sepa")}
                    disabled={!!vyvazam || !vybrane.length}
                    title="Banka → Načítanie výpisov (homebanking, formát SEPA XML)"
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {vyvazam === "sepa" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    SEPA XML (camt.053)
                  </button>
                  <button
                    onClick={() => void stiahni("pohoda")}
                    disabled={!!vyvazam || !vybrane.length}
                    title="Súbor → Dátová komunikácia → XML import"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {vyvazam === "pohoda" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    XML pre Pohodu
                  </button>
                </div>
                <p className="w-full text-xs text-muted-foreground">
                  <strong>SEPA XML (camt.053)</strong> patrí do <em>Banka → Načítanie výpisov</em> —
                  Pohoda ho vezme ako výpis od banky a platby si spáruje podľa variabilného symbolu.{" "}
                  <strong>XML pre Pohodu</strong> je dávka dokladov do{" "}
                  <em>Súbor → Dátová komunikácia → XML import</em>. Keď sa zamenia, Pohoda odpovie,
                  že súbor nezodpovedá stanovenej štruktúre formátu SEPA XML.{" "}
                  <strong>Označenie platby</strong> ide do Pohody ako poznámka dokladu a do SEPA XML
                  ako účel platby (<code>Purp</code>).
                  {vybrane.length < riadky.length && maZostatky && (
                    <>
                      {" "}
                      Vynechané pohyby menia zostatok: konečný zostatok v SEPA XML sa dopočíta z
                      vyvezených pohybov, takže nebude sedieť s výpisom od banky.
                    </>
                  )}
                  {!maZostatky && (
                    <>
                      {" "}
                      Pozor: tento výpis nemá pri pohyboch zostatky, takže v SEPA XML budú
                      počiatočný aj konečný zostatok nulové — dopíšte ich v Pohode.
                    </>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}
