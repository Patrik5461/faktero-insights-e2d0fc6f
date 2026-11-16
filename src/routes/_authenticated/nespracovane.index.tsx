import { CudziaFakturaZnak } from "@/components/faktero/CudziaFaktura";
import { DuplicitaZnak } from "@/components/faktero/DuplicitaDokladu";
import { obnovPoctyMenu } from "@/lib/faktero/pocty-menu";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ZdrojovyMailTlacidlo } from "@/components/faktero/ZdrojovyMail";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, AlertTriangle, FileText, Landmark, SearchX, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/faktero/ListControls";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { TabulkaZoznamu } from "@/components/faktero/TabulkaZoznamu";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  blocekDoNespracovanychFn,
  detailNespracovanehoFn,
  hromadneNespracovaneFn,
  nahrajNespracovaneFn,
  nespracovaneFn,
  nespracovaneNaUhraduFn,
  vytvorZNespracovanehoFn,
  zmazNespracovaneFn,
} from "@/lib/faktero/nespracovane.functions";
import { deleteExpenseFn, nastavStavDokladovFn } from "@/lib/faktero/expenses.functions";
import { zauctujDokladyFn } from "@/lib/faktero/zauctovanie.functions";
import { toastPresunutyBlocek } from "@/components/faktero/AutoZauctovanieOdznak";
import {
  dovodNevytvorenia,
  dovodZChybyServera,
  jeVyberatelny,
  popisRiadku,
  rozdelVyber,
  textSpracovania,
  zmenaPreBlocky,
  type Preskoceny,
} from "@/lib/faktero/nespracovane-hromadne";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HromadnyPrikaz } from "@/components/faktero/HromadnyPrikaz";
import { SuctovaListaVyberu } from "@/components/faktero/SuctovaListaVyberu";
import { polozkaNespracovaneho } from "@/lib/faktero/suhrn-vyberu";
import type { FakturaNaUhradu, Preskocena } from "@/lib/faktero/hromadny-prikaz";
import { JobPicker } from "@/components/faktero/JobPicker";
import { potvrd } from "@/lib/potvrdenie";
import { DRUHY_NESPRACOVANYCH, upravCelkomDokladu } from "@/lib/faktero/nespracovane";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { usePoslednyOtvoreny } from "@/hooks/usePoslednyOtvoreny";
import { TRIEDA_KLIK_RIADKU, useKlikNaRiadok, type CielDetailu } from "@/hooks/useKlikNaRiadok";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { nahralDokladu } from "@/lib/faktero/spracoval";
import { casUdalosti } from "@/lib/faktero/kto-kedy";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import { StavOdznak } from "@/components/faktero/web/Stav";

export const Route = createFileRoute("/_authenticated/nespracovane/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Nespracované doklady — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: Stranka,
});

const ZDROJ: Record<string, string> = {
  mail: "e-mail",
  nahratie: "nahraté",
  skener: "skener",
  apka: "appka",
  api: "API",
  efaktura: "eFaktúra",
  photo: "fotka",
  qr: "eKasa QR",
  upload: "nahraté",
  web: "ručne zapísaný",
};

function naBase64(f: File): Promise<string> {
  return new Promise((ok, zle) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => zle(r.error);
    r.readAsDataURL(f);
  });
}

/**
 * Nespracované doklady (ako v Doklado): všetko, čo príde e-mailom alebo sa
 * nahrá, čaká tu. Kliknutím sa doklad otvorí — človek určí druh, skontroluje
 * údaje, zaúčtuje a vytvorí.
 */
function Stranka() {
  const { t, jazyk } = useT();
  const navigate = useNavigate();
  const nacitaj = useServerFn(nespracovaneFn);
  const nahraj = useServerFn(nahrajNespracovaneFn);
  const doNespracovanych = useServerFn(blocekDoNespracovanychFn);
  const [data, setData] = useState<Awaited<ReturnType<typeof nacitaj>> | null>(null);
  const [nahravam, setNahravam] = useState(0);
  const [nad, setNad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hromadne = useServerFn(hromadneNespracovaneFn);
  const zmaz = useServerFn(zmazNespracovaneFn);
  // Hromadné akcie — nespracované doklady aj bločky; výber drží kľúče riadkov (`n-…`, `b-…`).
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const detail = useServerFn(detailNespracovanehoFn);
  const vytvor = useServerFn(vytvorZNespracovanehoFn);
  const zauctujBlocky = useServerFn(zauctujDokladyFn);
  const stavBlocku = useServerFn(nastavStavDokladovFn);
  const zmazBlocek = useServerFn(deleteExpenseFn);
  // Priebeh hromadného spracovania a súhrn preskočených na konci.
  const [priebeh, setPriebeh] = useState<{ hotovo: number; spolu: number } | null>(null);
  const [vysledok, setVysledok] = useState<{ nadpis: string; preskocene: Preskoceny[] } | null>(null);
  const [zmena, setZmena] = useState({ druh: "", jobId: "", stredisko: "", cinnost: "", predkontacia: "", clenenie: "" });
  const [hromadneBusy, setHromadneBusy] = useState(false);
  // Hromadný príkaz na úhradu z označených — IBAN, symboly a suma z vyčítaných údajov.
  const naUhraduFn = useServerFn(nespracovaneNaUhraduFn);
  const [prikaz, setPrikaz] = useState<{ faktury: FakturaNaUhradu[]; vynechane: Preskocena[] } | null>(null);
  const [prikazBusy, setPrikazBusy] = useState(false);
  // Naposledy otvorený doklad — zvýraznený riadok po návrate z detailu.
  const posledny = usePoslednyOtvoreny("nespracovane");
  const klik = useKlikNaRiadok();
  // Mená kolegov pre stĺpec „Nahral“ (profily číta server po overení členstva).
  const nacitajMena = useServerFn(menaClenovFirmy);
  const [mena, setMena] = useState<Record<string, string>>({});
  const lf = useListFilters({ pageSizeKey: "nespracovane" });
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");

  async function obnov() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      setData(await nacitaj({ data: { company_id: cid } }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať"));
    }
  }
  useEffect(() => {
    void obnov();
    const cid = getActiveCompanyId();
    if (cid)
      nacitajMena({ data: { company_id: cid } })
        .then((m) => setMena(m as Record<string, string>))
        .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kým sa niečo číta, zoznam sa obnovuje sám.
  const cita = data?.doklady.some((d: any) => d.stav === "cita");
  useEffect(() => {
    if (!cita) return;
    const casovac = setInterval(() => void obnov(), 4000);
    return () => clearInterval(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cita]);

  async function pridaj(subory: FileList | File[]) {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error(t("Vyberte firmu."));
    const zoznam = Array.from(subory);
    for (const f of zoznam) {
      if (f.size > 15 * 1024 * 1024) {
        toast.error(t("{subor}: súbor je väčší než 15 MB", { subor: f.name }));
        continue;
      }
      setNahravam((n) => n + 1);
      try {
        await nahraj({
          data: { company_id: cid, nazov: f.name, mime: f.type || "application/octet-stream", subor: await naBase64(f) },
        });
      } catch (e: any) {
        toast.error(`${f.name}: ${e?.message ?? t("nepodarilo sa nahrať")}`);
      } finally {
        setNahravam((n) => n - 1);
      }
    }
    obnovPoctyMenu();
    void obnov();
  }

  const riadky = [
    ...(data?.doklady ?? []).map((d: any) => ({ ...d, kluc: `n-${d.id}` })),
    // Druh bločka zo skenu nie je istý (aj faktúra sa dá naskenovať) — určí sa po otvorení.
    ...(data?.blocky ?? []).map((b: any) => ({ ...b, kluc: `b-${b.id}`, stav: "vytazene", druh: null, chyba: null, subor: t("zo skenu") })),
  ].sort((a, b) => String(b.vytvorene).localeCompare(String(a.vytvorene)));

  // Hľadanie a obdobie len prechádzajú načítané doklady.
  const hladane = lf.q.trim().toLowerCase();
  const zobrazene = riadky.filter((r) => {
    const den = r.datum ? String(r.datum).slice(0, 10) : "";
    if (obdobieOd && (!den || den < obdobieOd)) return false;
    if (obdobieDo && (!den || den > obdobieDo)) return false;
    if (!hladane) return true;
    return [r.dodavatel, r.cislo, r.subor]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(hladane));
  });

  // Kreslí sa len jedna strana; výber všetkých a súčty berú všetky zobrazené.
  const strankovanie = useStrankovanie(zobrazene, lf, { potrebneId: posledny.id });

  // Zmena hľadania či obdobia zruší výber, aby hromadná akcia nezasiahla skrytý doklad.
  useEffect(() => setVybrane(new Set()), [hladane, obdobieOd, obdobieDo]);

  // „Vybrať všetky“ berie len zobrazené — skrytý doklad sa nesmie hromadne zmeniť ani zmazať.
  const vyberatelne = zobrazene.filter(jeVyberatelny);
  // Lišta výberu — len zobrazené a vybrané (nespracované doklady aj bločky).
  const { nespracovane: vybraneN, blocky: vybraneB } = rozdelVyber(zobrazene, vybrane);
  const pocetVybranych = vybraneN.length + vybraneB.length;
  const vybraneSuhrn = [
    ...vybraneN.map((r: any) => polozkaNespracovaneho(r)),
    // Bloček je zaplatený na mieste — do príkazu na úhradu nejde.
    ...vybraneB.map((r: any) => polozkaNespracovaneho({ ...r, druh: "blocek" })),
  ];
  const naUhraduPocet = vybraneN.map((r: any) => polozkaNespracovaneho(r)).filter((p) => p.naUhradu).length;
  const prepniVyber = (kluc: string) =>
    setVybrane((p) => {
      const n = new Set(p);
      if (n.has(kluc)) n.delete(kluc);
      else n.add(kluc);
      return n;
    });
  const pracujem = hromadneBusy || priebeh !== null;

  /** Koniec hromadnej akcie — toast, prípadne okno s preskočenými a dôvodmi. */
  async function dokonci(nadpis: string, preskocene: Preskoceny[]) {
    if (preskocene.length) setVysledok({ nadpis, preskocene });
    setVybrane(new Set());
    obnovPoctyMenu();
    await obnov();
  }

  async function pouziHromadne() {
    const cid = getActiveCompanyId();
    if (!cid || !pocetVybranych) return;
    const z = Object.fromEntries(Object.entries(zmena).filter(([, v]) => v.trim())) as Record<string, string>;
    if (!Object.keys(z).length) return toast.error(t("Vyplňte aspoň jedno pole, ktoré sa má zmeniť."));
    setHromadneBusy(true);
    const preskocene: Preskoceny[] = [];
    let zmenene = 0;
    let presunute = 0;
    try {
      if (vybraneN.length) {
        const r = await hromadne({ data: { company_id: cid, ids: vybraneN.map((r) => r.id), zmena: z as any } });
        zmenene += r.zmenene;
        if (r.preskocene)
          preskocene.push({
            popis: t("Nespracované doklady ({n})", { n: r.preskocene }),
            dovod: { text: "Doklad sa ešte číta" },
          });
      }
      if (vybraneB.length) {
        // Bloček preberie zaúčtovanie (predkontácia, členenie, stredisko, činnosť); druh ani zákazku nie.
        const pre = zmenaPreBlocky(z);
        if (pre.nemenia.length)
          preskocene.push({
            popis: t("Bločky ({n})", { n: vybraneB.length }),
            dovod: { text: "Druh dokladu ani zákazka sa pri bločku hromadne nemenia — otvorte bloček" },
          });
        if (Object.keys(pre.zmena).length) {
          const r = await zauctujBlocky({
            data: { company_id: cid, ids: vybraneB.map((r) => r.id), ...pre.zmena },
          });
          zmenene += r.zmenenych;
          presunute += r.spracovanych ?? 0;
          for (const p of r.preskocene) preskocene.push({ popis: p, dovod: { text: "" } });
          // Zaúčtovaný bloček bez sumy alebo dátumu ostáva tu — v súhrne s dôvodom.
          for (const p of r.ostavaVNespracovanych ?? []) preskocene.push({ popis: p.popis, dovod: { text: p.dovod } });
        }
      }
      toast.success(t("Zmenené doklady: {n}", { n: zmenene }));
      // Zaúčtované bločky sa spracovali a zo zoznamu zmiznú (obnov v `dokonci`).
      if (presunute) toastPresunutyBlocek(t, navigate, presunute);
      setZmena({ druh: "", jobId: "", stredisko: "", cinnost: "", predkontacia: "", clenenie: "" });
      await dokonci(t("Niektoré doklady sa nezmenili"), preskocene);
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setHromadneBusy(false);
    }
  }

  /*
    Hromadné „Vytvoriť“ — každý nespracovaný doklad ide tým istým serverom
    ako tlačidlo v detaile, s uloženými (vyťaženými) údajmi. Čo by detail
    potvrdzoval, sa preskočí s dôvodom. Bloček sa označí ako spracovaný ako
    „Spracovať“ v detaile bločku.
  */
  async function spracujHromadne() {
    const cid = getActiveCompanyId();
    if (!cid || !pocetVybranych) return;
    const nN = vybraneN.length;
    const nB = vybraneB.length;
    if (
      !(await potvrd(
        [
          nN ? t("Vytvoriť doklady z vybraných nespracovaných ({n}) s prečítanými údajmi?", { n: nN }) : null,
          nB ? t("Označiť vybrané bločky ({n}) ako spracované?", { n: nB }) : null,
          t("Doklad, pri ktorom treba niečo doplniť alebo rozhodnúť, sa preskočí a ostane tu."),
        ]
          .filter(Boolean)
          .join("\n"),
        { potvrdit: t("Spracovať") },
      ))
    )
      return;
    const preskocene: Preskoceny[] = [];
    let vytvorene = 0;
    let nezauctovane = 0;
    let hotovo = 0;
    const krok = () => setPriebeh({ hotovo: ++hotovo, spolu: nN + nB });
    setPriebeh({ hotovo: 0, spolu: nN + nB });
    try {
      for (const r of vybraneN) {
        const popis = popisRiadku(r);
        try {
          const d = await detail({ data: { id: r.id } });
          const dovod = dovodNevytvorenia({
            druh: d.druh,
            stav: d.stav,
            udaje: d.udaje,
            povinne: d.povinne,
            nastavenia: d.nastavenia,
            krajinaFirmy: d.krajinaFirmy,
            vlastneUcty: d.vlastneUcty,
            ibanOdberatela: d.ibanOdberatela,
          });
          if (dovod) preskocene.push({ popis, dovod });
          else {
            const v = await vytvor({
              data: { id: r.id, druh: d.druh as any, udaje: upravCelkomDokladu(null, d.udaje) as any },
            });
            vytvorene++;
            if (v.agenda === "prijata" && v.duplicita)
              preskocene.push({
                popis,
                dovod: { text: "Faktúra je vytvorená, ale nezaúčtovaná – duplicita. Rovnaká faktúra už v evidencii je, jednu z nich zmažte." },
              });
            else if (v.zauctovana === false || v.cudzia) nezauctovane++;
          }
        } catch (e: any) {
          preskocene.push({ popis, dovod: dovodZChybyServera(e?.message) });
        }
        krok();
      }
      for (const r of vybraneB as any[]) {
        const popis = popisRiadku(r);
        // Naskenovaný doklad bez znakov bločku môže byť faktúra — zaradí ho človek v detaile.
        if (!r.skutocnyBlocek) {
          preskocene.push({ popis, dovod: { text: "Nie je isté, že ide o bloček (môže to byť faktúra) — otvorte ho a určte druh" } });
          krok();
          continue;
        }
        try {
          const v = await stavBlocku({ data: { company_id: cid, ids: [r.id], stav: "processed" } });
          if (v.zmenene) vytvorene++;
          else preskocene.push({ popis, dovod: { text: "Bez sumy, dátumu a spôsobu úhrady sa doklad nedá označiť ako spracovaný." } });
        } catch (e: any) {
          preskocene.push({ popis, dovod: { text: String(e?.message ?? "") || "Nepodarilo sa" } });
        }
        krok();
      }
      if (vytvorene) toast.success(t("Spracované doklady: {n}", { n: vytvorene }));
      if (nezauctovane)
        toast.warning(t("Nezaúčtované (chýba predkontácia či členenie DPH alebo iný odberateľ): {n}", { n: nezauctovane }));
      if (!vytvorene && !preskocene.length) toast(t("Nebolo čo spracovať"));
      await dokonci(t("Spracované {ok} z {n} — preskočené", { ok: vytvorene, n: nN + nB }), preskocene);
    } finally {
      setPriebeh(null);
    }
  }

  async function uhradVybrane() {
    const cid = getActiveCompanyId();
    if (!cid || !vybraneN.length) return;
    setPrikazBusy(true);
    try {
      // Príkaz na úhradu len z nespracovaných dokladov — bloček je zaplatený na mieste.
      const doklady = await naUhraduFn({ data: { company_id: cid, ids: vybraneN.map((r) => r.id) } });
      const vynechane: Preskocena[] = [];
      const faktury: FakturaNaUhradu[] = [];
      for (const d of doklady) {
        const { dovod, ...f } = d;
        if (dovod) vynechane.push({ id: f.id, cisloFaktury: f.invoice_number || t("bez čísla"), dovod });
        else faktury.push(f);
      }
      setPrikaz({ faktury, vynechane });
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať"));
    } finally {
      setPrikazBusy(false);
    }
  }

  async function zmazHromadne() {
    if (!pocetVybranych) return;
    if (!(await potvrd(t("Presunúť vybrané doklady ({n}) do koša?", { n: pocetVybranych })))) return;
    setHromadneBusy(true);
    let ok = 0;
    const preskocene: Preskoceny[] = [];
    // Nespracovaný aj bloček idú do koša tou istou cestou ako z detailu.
    for (const r of [...vybraneN, ...vybraneB]) {
      try {
        if (r.typ === "blocek") await zmazBlocek({ data: { id: r.id } });
        else await zmaz({ data: { id: r.id } });
        ok++;
      } catch (e: any) {
        preskocene.push({ popis: popisRiadku(r), dovod: { text: String(e?.message ?? "") || "Nepodarilo sa" } });
      }
    }
    toast.success(t("V koši: {n}", { n: ok }));
    setHromadneBusy(false);
    await dokonci(t("Niektoré doklady sa nepresunuli do koša"), preskocene);
  }

  // Kam vedie nová karta (Ctrl+klik) — bloček sa otvorí rovno, bez presunu medzi nespracované.
  const cielRiadku = (r: any): CielDetailu =>
    r.typ === "blocek"
      ? { to: "/doklady/novy", search: { id: r.id } as any }
      : { to: "/nespracovane/$id", params: { id: r.id } };

  async function otvor(r: any) {
    posledny.zapamataj(r.id);
    if (r.typ !== "blocek") return navigate({ to: "/nespracovane/$id", params: { id: r.id } });
    // Bloček zo skenu sa presunie medzi nespracované, aby sa dal zaradiť ako faktúra.
    try {
      const v = await doNespracovanych({ data: { id: r.id } });
      if (v.id) navigate({ to: "/nespracovane/$id", params: { id: v.id } });
      else navigate({ to: "/doklady/novy", search: { id: r.id } as any });
    } catch (e: any) {
      toast.error(e?.message ?? t("Doklad sa nepodarilo otvoriť"));
    }
  }

  const druhText = (r: any) =>
    r.druh ? (
      t(DRUHY_NESPRACOVANYCH.find((d) => d.kluc === r.druh)?.nazov ?? r.druh)
    ) : (
      <span className="text-muted-foreground">{t("Neurčený")}</span>
    );
  const sumaText = (r: any) => (r.suma != null ? formatujMenu(r.suma, r.mena) : "—");
  const datumText = (r: any) => (r.datum ? datumNaDoklade(r.datum) : "—");
  const zdrojText = (r: any) => (
    <span className="inline-flex items-center gap-1">
      {t(ZDROJ[r.zdroj] ?? r.zdroj)}
      {nahralDokladu(r.zdroj, r.nahral, mena) ? (
        <span className="text-foreground/80">· {nahralDokladu(r.zdroj, r.nahral, mena)}</span>
      ) : null}
      {/* Kedy bol doklad nahratý — pri prenose do agendy sa prenesie s ním. */}
      {casUdalosti(r.vytvorene ?? null, lokalJazyka(jazyk)) ? (
        <span className="whitespace-nowrap">· {casUdalosti(r.vytvorene ?? null, lokalJazyka(jazyk))}</span>
      ) : null}
      {r.typ === "nespracovany" ? (
        <ZdrojovyMailTlacidlo druh="nespracovany" id={r.id} inboxMessageId={r.inboxMessageId} ikona />
      ) : null}
    </span>
  );
  const stavText = (r: any) =>
    r.stav === "cita" ? (
      <StavOdznak ton="priebeh" ikona={<Loader2 className="animate-spin" />}>
        {t("Číta sa…")}
      </StavOdznak>
    ) : r.stav === "chyba" ? (
      <StavOdznak ton="pozor" ikona={<AlertTriangle />} title={r.chyba ?? undefined}>
        {t("Doplniť ručne")}
      </StavOdznak>
    ) : (
      <StavOdznak ton="uspech">{t("Vyťažené")}</StavOdznak>
    );

  return (
    <>
      <PageHeader
        title={t("Nespracované doklady")}
        description={t("Všetko, čo príde e-mailom alebo nahráte, čaká tu. Otvorte doklad, určte druh, skontrolujte údaje, zaúčtujte a vytvorte.")}
        action={
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            {nahravam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("Nahrať doklady")}
          </button>
        }
      />
      <PageBody>
        <input
          ref={input}
          type="file"
          multiple
          // ISDOC / XML faktúry sa čítajú priamo, bez AI (pozri doklad-xml.ts).
          accept="application/pdf,image/*,.isdoc,.xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void pridaj(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setNad(true);
          }}
          onDragLeave={() => setNad(false)}
          onDrop={(e) => {
            e.preventDefault();
            setNad(false);
            void pridaj(e.dataTransfer.files);
          }}
          className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground ${nad ? "border-primary bg-primary/5" : "border-border"}`}
        >
          {t("Pretiahnite sem faktúry, zálohové faktúry, bločky či iné doklady (PDF alebo fotky) — aj viac naraz. Faktero ich prečíta a počkajú tu na zaradenie.")}
        </div>

        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať dodávateľa alebo číslo"
          filters={[{ key: "obdobie", label: "Obdobie", type: "dateRange" }]}
        />

        {pocetVybranych > 0 ? (
          <div
            role="region"
            aria-label={t("Hromadná úprava")}
            className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"
          >
            <span className="font-medium">
              {t("Vybrané: {n}", { n: pocetVybranych })}
              {vybraneB.length ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {t("nespracované {n} · bločky {b}", { n: vybraneN.length, b: vybraneB.length })}
                </span>
              ) : null}
            </span>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("Druh dokladu")}</span>
              <select
                value={zmena.druh}
                onChange={(e) => setZmena({ ...zmena, druh: e.target.value })}
                className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">{t("nemeniť")}</option>
                {DRUHY_NESPRACOVANYCH.map((x) => (
                  <option key={x.kluc} value={x.kluc}>
                    {t(x.nazov)}
                  </option>
                ))}
              </select>
            </label>
            <JobPicker value={zmena.jobId} onChange={(v) => setZmena({ ...zmena, jobId: v })} className="min-w-[12rem]" />
            {(
              [
                ["predkontacia", "Predkontácia"],
                ["clenenie", "Členenie DPH"],
                ["stredisko", "Stredisko"],
                ["cinnost", "Činnosť"],
              ] as const
            ).map(([k, n]) => (
              <label key={k} className="block">
                <span className="text-xs text-muted-foreground">{t(n)}</span>
                <input
                  value={zmena[k]}
                  maxLength={30}
                  placeholder={t("nemeniť")}
                  onChange={(e) => setZmena({ ...zmena, [k]: e.target.value })}
                  className="mt-1 block w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
            ))}
            <button
              type="button"
              disabled={pracujem}
              onClick={() => void pouziHromadne()}
              title={vybraneB.length ? t("Bločkom sa zmení len predkontácia, členenie DPH, stredisko a činnosť.") : undefined}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-background px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              {hromadneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("Zmeniť vybrané")}
            </button>
            <button
              type="button"
              disabled={pracujem}
              onClick={() => void spracujHromadne()}
              title={t("Vytvorí doklady z prečítaných údajov ako tlačidlo Vytvoriť v detaile; bločky označí ako spracované. Čo treba doplniť, sa preskočí.")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {priebeh ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />{" "}
                  {t("Spracované {x} / {n}", { x: priebeh.hotovo, n: priebeh.spolu })}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />{" "}
                  {t(textSpracovania({ nespracovane: vybraneN.length, blocky: vybraneB.length }), { n: pocetVybranych })}
                </>
              )}
            </button>
            <button
              type="button"
              disabled={pracujem}
              onClick={() => void zmazHromadne()}
              className="rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              {t("Do koša")}
            </button>
            <button
              type="button"
              disabled={pracujem}
              onClick={() => setVybrane(new Set())}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-60"
            >
              {t("Zrušiť výber")}
            </button>
          </div>
        ) : null}

        <TabulkaZoznamu className="hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground">
              <tr>
                <th className="w-8 p-3">
                  <input
                    type="checkbox"
                    aria-label={t("Vybrať všetky")}
                    checked={vyberatelne.length > 0 && vyberatelne.every((r) => vybrane.has(r.kluc))}
                    disabled={pracujem}
                    onChange={(e) => setVybrane(e.target.checked ? new Set(vyberatelne.map((r) => r.kluc)) : new Set())}
                  />
                  <span className="sr-only">{t("Výber")}</span>
                </th>
                <th className="p-3">{t("Druh")}</th>
                <th className="p-3">{t("Dodávateľ")}</th>
                <th className="p-3">{t("Číslo")}</th>
                <th className="p-3">{t("Dátum")}</th>
                <th className="p-3 text-right">{t("Suma")}</th>
                <th className="p-3">{t("Nahral")}</th>
                <th className="p-3">{t("Stav")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {t("Načítavam…")}
                  </td>
                </tr>
              )}
              {data && riadky.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="Všetko je spracované." icon={FileText} />
                  </td>
                </tr>
              )}
              {riadky.length > 0 && zobrazene.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="Nič nevyhovuje filtru." icon={SearchX} />
                  </td>
                </tr>
              )}
              {strankovanie.viditelne.map((r) => (
                <tr
                  key={r.kluc}
                  {...posledny.riadok(r.id)}
                  {...klik(cielRiadku(r), { naKlik: () => void otvor(r) })}
                  className={`${TRIEDA_KLIK_RIADKU} ${posledny.riadok(r.id).className}`}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    {jeVyberatelny(r) ? (
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať doklad")}
                        checked={vybrane.has(r.kluc)}
                        disabled={pracujem}
                        onChange={() => prepniVyber(r.kluc)}
                      />
                    ) : null}
                  </td>
                  <td className="p-3">
                    {druhText(r)}
                    {r.subor ? <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{r.subor}</div> : null}
                  </td>
                  <td className="min-w-[11rem] max-w-[20rem] whitespace-normal p-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <CudziaFakturaZnak nesedi={r.odberatelNesedi} />
                      {r.dodavatel ?? <span className="text-muted-foreground">—</span>}
                      <DuplicitaZnak duplicita={r.duplicita} />
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-3"><span className="cislo-dokladu">{r.cislo ?? "—"}</span></td>
                  <td className="p-3 whitespace-nowrap">{datumText(r)}</td>
                  <td className="suma p-3 text-right">{sumaText(r)}</td>
                  <td className="min-w-[9rem] whitespace-normal p-3 text-xs text-muted-foreground">{zdrojText(r)}</td>
                  <td className="min-w-[9rem] whitespace-normal p-3 text-xs">{stavText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabulkaZoznamu>

        {/* Na mobile karty — tabuľka by ukázala len prvé tri stĺpce. */}
        <div className="space-y-2 md:hidden">
          {!data && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">{t("Načítavam…")}</div>
          )}
          {data && riadky.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {t("Všetko je spracované.")}
            </div>
          )}
          {riadky.length > 0 && zobrazene.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
              {t("Nič nevyhovuje filtru.")}
            </div>
          )}
          {strankovanie.viditelne.map((r) => (
            <div
              key={r.kluc}
              {...posledny.karta(r.id)}
              /* Klik kamkoľvek na kartu otvorí doklad (myš, prst). Klávesnica a
                 čítačka idú cez tlačidlo s názvom — karta s role="button" by
                 obsahovala ďalší ovládací prvok (zaškrtávacie pole). */
              {...klik(cielRiadku(r), { naKlik: () => void otvor(r), klavesnica: false })}
              className={`block cursor-pointer rounded-xl border border-border p-3 hover:bg-muted/30 ${posledny.karta(r.id).className || "bg-card"}`}
            >
              <div className="flex items-start justify-between gap-2">
                {jeVyberatelny(r) ? (
                  <input
                    type="checkbox"
                    aria-label={t("Vybrať doklad")}
                    checked={vybrane.has(r.kluc)}
                    disabled={pracujem}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => prepniVyber(r.kluc)}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void otvor(r);
                    }}
                    className="block rounded text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {druhText(r)}
                  </button>
                  {r.subor ? <div className="truncate text-xs text-muted-foreground">{r.subor}</div> : null}
                </div>
                <div className="suma shrink-0">{sumaText(r)}</div>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <CudziaFakturaZnak nesedi={r.odberatelNesedi} />
                  <span className="min-w-0 truncate">{r.dodavatel ?? <span className="text-muted-foreground">—</span>}</span>
                  <DuplicitaZnak duplicita={r.duplicita} />
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {r.cislo ? `${r.cislo} · ` : ""}
                  {datumText(r)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {zdrojText(r)}
                {stavText(r)}
              </div>
            </div>
          ))}
        </div>
        {strankovanie.stranky()}

        {/* Súčet označených + úhrada z výberu (lišta drží spodok obrazovky). */}
        <SuctovaListaVyberu
          polozky={vybraneSuhrn}
          exportNazov={t("Nezaúčtované:")}
          onZrusit={() => setVybrane(new Set())}
          akcie={
            <button
              type="button"
              onClick={() => void uhradVybrane()}
              disabled={prikazBusy || !naUhraduPocet}
              title={t("Pripraví hromadný príkaz na úhradu (SEPA XML) z označených dokladov. Doklad bez IBAN-u sa vynechá.")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {prikazBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />}{" "}
              {t("Uhradiť ({n})", { n: naUhraduPocet })}
            </button>
          }
        />
        {/* Súhrn hromadnej akcie — čo sa preskočilo a prečo. */}
        <Dialog open={vysledok !== null} onOpenChange={(o) => !o && setVysledok(null)}>
          <DialogContent className="max-w-lg">
            <DialogTitle>{vysledok?.nadpis}</DialogTitle>
            <DialogDescription>
              {t("Preskočené doklady ostali v Nespracovaných — otvorte ich a doplňte či rozhodnite v detaile.")}
            </DialogDescription>
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm">
              {vysledok?.preskocene.map((p, i) => (
                <li key={i} className="rounded-md border border-border p-2">
                  <div className="font-medium">{p.popis}</div>
                  {p.dovod.text ? (
                    <div className="text-xs text-muted-foreground">{t(p.dovod.text, p.dovod.params)}</div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setVysledok(null)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                {t("Zavrieť")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
        {prikaz && getActiveCompanyId() ? (
          <HromadnyPrikaz
            companyId={getActiveCompanyId()!}
            faktury={prikaz.faktury}
            vynechane={prikaz.vynechane}
            onClose={() => setPrikaz(null)}
          />
        ) : null}
      </PageBody>
    </>
  );
}
