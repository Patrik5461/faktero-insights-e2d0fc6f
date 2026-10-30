import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ZdrojovyMailTlacidlo } from "@/components/faktero/ZdrojovyMail";
import { NespracovanyKompaktny } from "@/components/faktero/NespracovanyKompaktny";
import { PolozkyNespracovaneho } from "@/components/faktero/PolozkyNespracovaneho";
import { NauceneZDodavatela } from "@/components/faktero/NauceneZDodavatela";
import { NavrhAiNespracovaneho, useNavrhZauctovania } from "@/components/faktero/NavrhAi";
import { doplnNavrhDoUdajov, oznaceniaZUdajov } from "@/lib/faktero/ai-predkontacia";
import { PreddefinovanaPoznamka } from "@/components/faktero/PreddefinovanaPoznamka";
import { UpozornenieObjednavky } from "@/components/faktero/PovinnaObjednavka";
import { PravidloNespracovaneho } from "@/components/faktero/PravidloNespracovaneho";
import { PravidloZDokladu } from "@/components/faktero/PravidloZDokladu";
import type { ZakladPravidlaZDokladu } from "@/lib/faktero/pravidla-uctovania";
import { JobPicker } from "@/components/faktero/JobPicker";
import { VozidloPicker } from "@/components/faktero/VozidloPicker";
import { useVzhladNespracovanych } from "@/hooks/useVzhladNespracovanych";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ExternalLink, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { SchvalovaniePanel } from "@/components/faktero/SchvalovaniePanel";
import { NahladSVyberom, poleZPrvku, zablikajPole } from "@/components/faktero/NahladSVyberom";
import { poliaPreDruh, zapisDoUdajov, type KlucPola } from "@/lib/faktero/vyber-z-dokladu";
import { PoliaZauctovania, type Navrhy } from "@/components/faktero/ZauctovaniePanel";
import {
  detailNespracovanehoFn,
  docitajNespracovanyFn,
  ulozNespracovaneFn,
  vytvorZNespracovanehoFn,
  zmazNespracovaneFn,
} from "@/lib/faktero/nespracovane.functions";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import {
  DRUHY_NESPRACOVANYCH,
  NAZVY_POLI,
  chybajuce,
  rozdielPoloziek,
  sucty,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { DRUHY_OSTATNYCH } from "@/lib/faktero/ostatne-doklady";
import { sadzbyKrajiny } from "@/lib/faktero/vat-rates";
import { potvrd } from "@/lib/potvrdenie";
import { PREDPONA_DUPLICITY } from "@/lib/faktero/prijate-duplicity";
import { nesediZChyby } from "@/lib/faktero/cudzia-faktura";
import { CudziaFakturaUpozornenie, textCudzejFaktury } from "@/components/faktero/CudziaFaktura";
import { zapamatajOtvoreny } from "@/lib/faktero/posledny-otvoreny";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { smerPodlaIban } from "@/lib/faktero/nespracovane-iban";
import {
  PrijataPodlaIbanPoznamka,
  VlastnaFakturaUpozornenie,
} from "@/components/faktero/VlastnaFakturaUpozornenie";
import { useHoverPola, useZobrazitZvyraznenie } from "@/components/faktero/ZvyraznenieVytazenych";
import { POLIA_ZVYRAZNENIA } from "@/lib/faktero/zvyraznenie-vytazenych";

export const Route = createFileRoute("/_authenticated/nespracovane/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Nespracovaný doklad — Faktero") }] }),
  component: Detail,
});

const vstup = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Nespracovaný doklad (ako v Doklado): vľavo doklad, vpravo vyťažené údaje.
 * Človek určí druh, opraví čo treba, zaúčtuje a „Vytvorí" — doklad sa
 * presunie do svojej sekcie. „Uložiť zmeny" ho nechá rozpracovaný.
 */
function Detail() {
  const { t } = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const nacitaj = useServerFn(detailNespracovanehoFn);
  const uloz = useServerFn(ulozNespracovaneFn);
  const vytvor = useServerFn(vytvorZNespracovanehoFn);
  const zmaz = useServerFn(zmazNespracovaneFn);
  const docitaj = useServerFn(docitajNespracovanyFn);
  const nacitajNavrhy = useServerFn(navrhyKodovFn);

  const [d, setD] = useState<Awaited<ReturnType<typeof nacitaj>> | null>(null);
  const [druh, setDruh] = useState<DruhNespracovaneho | "">("");
  const [u, setU] = useState<UdajeNespracovaneho | null>(null);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [busy, setBusy] = useState(false);
  const [nenajdene, setNenajdene] = useState<string | null>(null);
  // Oprava poľa kliknutím do náhľadu — pole, pre ktoré sa práve vyberá.
  const [vyberPole, setVyberPole] = useState<KlucPola | null>(null);
  const udajeRef = useRef<HTMLDivElement>(null);
  const { vzhlad, zmen: zmenVzhlad } = useVzhladNespracovanych();
  // Zvýraznenie vyťažených údajov v náhľade (prepínač si pamätá prehliadač).
  const [zobrazitZvyraznenie, prepniZvyraznenie] = useZobrazitZvyraznenie();
  // Pole pod myšou — jeho miesto sa v náhľade zvýrazní aj bez kliknutia.
  const hoverPola = useHoverPola(poleZPrvku);

  async function obnov() {
    try {
      const r = await nacitaj({ data: { id } });
      setD(r);
      setDruh((r.druh as DruhNespracovaneho) ?? "");
      setU(r.udaje);
    } catch (e: any) {
      setNenajdene(e?.message ?? t("Doklad sa nenašiel."));
    }
  }
  useEffect(() => {
    setD(null);
    setU(null);
    // Naposledy otvorený — zoznam ho po návrate zvýrazní (aj po „Vytvoriť“ a prechode na ďalší).
    zapamatajOtvoreny("nespracovane", getActiveCompanyId(), id);
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Kým AI číta, doptávame sa.
  useEffect(() => {
    if (d?.stav !== "cita") return;
    const casovac = setInterval(() => void obnov(), 3000);
    return () => clearInterval(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.stav]);

  const blocek = druh === "blocek";
  const faktura = druh === "faktura" || druh === "zalohova" || druh === "dobropis";
  useEffect(() => {
    if (!d || !druh || druh === "ostatny") return;
    nacitajNavrhy({ data: { company_id: d.companyId, pre: blocek ? "doklad" : "prijata" } })
      .then((r) => setNavrhy(r as Navrhy))
      .catch(() => setNavrhy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.companyId, druh]);

  /*
    Návrh zaúčtovania (pravidlo > návyk > AI) — lenivo pri otvorení, server
    si ho pamätá. Doplní sa len do prázdnych polí; AI hodnoty sú označené
    a do dokladu idú, až keď ich človek potvrdí.
  */
  const druhNavrhu = druh === "faktura" || druh === "zalohova" || druh === "dobropis" || druh === "blocek" ? druh : null;
  const navrhAi = useNavrhZauctovania("nespracovany", d?.id, Boolean(d && d.stav !== "cita" && druhNavrhu), druhNavrhu);
  useEffect(() => {
    if (navrhAi?.stav !== "navrh") return;
    setU((p) => (p ? doplnNavrhDoUdajov(p, navrhAi.polia, navrhAi.dovod) : p));
  }, [navrhAi]);

  const chyby = useMemo(
    () => (u ? chybajuce(druh || null, u, d?.povinne ?? [], d?.nastavenia) : []),
    [u, druh, d?.povinne, d?.nastavenia],
  );
  // Malý rozdiel položiek v tolerancii firmy — doklad sa vytvorí s vyrovnávacou položkou.
  const rozdielVyrovna = (() => {
    const r = u && !chyby.includes("polozky") ? rozdielPoloziek(u) : null;
    // Hotovostné zaokrúhlenie na 5 centov rieši export samo, vyrovnávacia položka nevznikne.
    return r && !(u?.platba === "hotovost" && Math.abs(r.rozdiel) <= 0.02) ? r : null;
  })();
  const zle = (k: string) => chyby.includes(k);
  const ram = (k: string) => (zle(k) ? "border-red-500 ring-1 ring-red-300" : "border-input");
  const s = u ? sucty(u) : { zaklad: 0, dph: 0, celkom: 0 };
  const sadzby = useMemo(() => sadzbyKrajiny("SK", u?.datumVystavenia || null), [u?.datumVystavenia]);

  if (nenajdene)
    return (
      <>
        <PageHeader title={t("Nespracovaný doklad")} />
        <PageBody>
          <p className="text-sm text-muted-foreground">{nenajdene}</p>
          <Link to="/nespracovane" className="mt-3 inline-block text-sm text-primary hover:underline">
            {t("Späť na nespracované doklady")}
          </Link>
        </PageBody>
      </>
    );
  if (!d || !u)
    return (
      <>
        <PageHeader title={t("Nespracovaný doklad")} />
        <PageBody>
          <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
        </PageBody>
      </>
    );

  const set = (z: Partial<UdajeNespracovaneho>) => setU({ ...u, ...z });
  const setDod = (z: Partial<UdajeNespracovaneho["dodavatel"]>) => setU({ ...u, dodavatel: { ...u.dodavatel, ...z } });
  const setRozpis = (i: number, z: Partial<UdajeNespracovaneho["rozpis"][number]>) =>
    set({ rozpis: u.rozpis.map((r, j) => (j === i ? { ...r, ...z } : r)), celkom: null });

  /*
    Smer faktúry podľa IBAN-u — nastavenie „Automaticky určiť typ faktúry
    podľa firemných IBAN-ov". Vlastná vystavená faktúra (IBAN príjemcu platby
    je firemný): Nespracované vystavené faktúry nezakladajú, takže upozornia
    a medzi prijaté ju pustia len po potvrdení. Cudzí IBAN potvrdí prijatú.
  */
  const smer = smerPodlaIban({
    zapnute: Boolean(d.nastavenia.typPodlaIban),
    druh,
    ibanDokladu: u.dodavatel.iban,
    ibanOdberatela: d.ibanOdberatela,
    ucty: d.vlastneUcty ?? [],
  });
  const vlastnyUcet = smer?.smer === "vystavena" ? smer.ucet : null;
  /*
    Odberateľ na doklade je iná firma — upozornenie s voľbami Zmazať, Uložiť
    aj tak (faktúra vznikne s červeným výkričníkom a nezaúčtuje sa) a Presunúť
    k firme, ku ktorej patrí. Len pri prijatých druhoch.
  */
  const jePrijata = druh === "faktura" || druh === "zalohova" || druh === "dobropis" || druh === "";
  const upozornenieCudzej =
    d.odberatelNesedi && jePrijata ? (
      <CudziaFakturaUpozornenie
        nesedi={d.odberatelNesedi}
        druh="nespracovany"
        id={d.id}
        busy={busy}
        onZmaz={() => void zmazDoklad()}
        onUlozit={() => void vytvorDoklad(false, true)}
        onPresunute={() =>
          navigate({ to: d.dalsiId ? "/nespracovane/$id" : "/nespracovane", params: { id: d.dalsiId ?? "" } } as any)
        }
      />
    ) : null;
  const upozornenieIban = vlastnyUcet ? (
    <VlastnaFakturaUpozornenie
      ucet={vlastnyUcet}
      onInyDoklad={() => setDruh("ostatny")}
      onZmaz={() => void zmazDoklad()}
    />
  ) : smer?.smer === "prijata" ? (
    <PrijataPodlaIbanPoznamka smer={smer} />
  ) : null;
  const upozornenieVlastnej =
    upozornenieCudzej || upozornenieIban ? (
      <div className="space-y-2">
        {upozornenieCudzej}
        {upozornenieIban}
      </div>
    ) : null;
  const zvyraznenie = {
    udaje: u,
    polia: druh ? poliaPreDruh(druh) : POLIA_ZVYRAZNENIA,
    zobrazit: zobrazitZvyraznenie,
    polohy: d.polohyAi,
  };

  async function ulozZmeny() {
    setBusy(true);
    try {
      await uloz({ data: { id, druh: druh || null, udaje: u as any } });
      toast.success(t("Zmeny sú uložené — doklad ostáva v nespracovaných"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function vytvorDoklad(ajDuplicitu = false, ajCudziu = false) {
    if (chyby.length) {
      toast.error(
        t("Doplňte: {polia}", { polia: chyby.map((k) => t(NAZVY_POLI[k] ?? k)).join(", ") }),
      );
      return;
    }
    // Pri opakovaní kvôli duplicite už človek vlastnú faktúru potvrdil.
    if (vlastnyUcet && !ajDuplicitu) {
      const ano = await potvrd(
        t(
          "IBAN {iban} na doklade je váš — je to vaša vystavená faktúra, nie prijatá. Naozaj ju založiť medzi prijaté faktúry?",
          { iban: vlastnyUcet.iban },
        ),
        { potvrdit: t("Založiť ako prijatú"), zrusit: t("Nezaložiť"), nebezpecne: true },
      );
      if (!ano) return;
    }
    setBusy(true);
    try {
      const r = await vytvor({
        data: { id, druh: druh as DruhNespracovaneho, udaje: u as any, ajDuplicitu, ajCudziu },
      });
      const kam =
        r.agenda === "prijata" && r.cudzia
          ? t("Faktúra je uložená medzi prijatými faktúrami s červeným výkričníkom — nepatrí tejto firme a nedá sa zaúčtovať, kým to nepotvrdíte")
          : r.agenda === "prijata" && r.zauctovana === false
          ? t("Faktúra je vytvorená medzi prijatými faktúrami — čaká na zaúčtovanie (chýba predkontácia alebo členenie DPH)")
          : r.agenda === "prijata"
          ? t("Doklad je vytvorený a presunutý medzi prijaté faktúry")
          : r.agenda === "doklad"
            ? t("Doklad je vytvorený a presunutý medzi doklady")
            : t("Doklad je vytvorený a presunutý medzi iné doklady");
      toast.success(kam, {
        action: {
          label: t("Otvoriť"),
          onClick: () =>
            r.agenda === "prijata"
              ? navigate({ to: "/prijate-faktury/$id", params: { id: r.id } })
              : r.agenda === "doklad"
                ? navigate({ to: "/doklady/novy", search: { id: r.id } as any })
                : navigate({ to: "/ostatne-doklady/novy", search: { id: r.id } as any }),
        },
      });
      // Ako v Doklado: rovno ďalší nespracovaný doklad.
      if (d!.dalsiId) navigate({ to: "/nespracovane/$id", params: { id: d!.dalsiId } });
      else navigate({ to: "/nespracovane" });
    } catch (e: any) {
      const sprava = String(e?.message ?? "");
      // Server našiel tú istú faktúru — rozhodne človek, či ju chce dvakrát.
      if (sprava.startsWith(PREDPONA_DUPLICITY)) {
        setBusy(false);
        if (
          await potvrd(sprava.slice(PREDPONA_DUPLICITY.length), {
            potvrdit: t("Vytvoriť aj tak"),
            zrusit: t("Nevytvárať"),
            nebezpecne: true,
          })
        )
          await vytvorDoklad(true, ajCudziu);
        return;
      }
      // Odberateľ na doklade je iná firma — bez výslovného „Uložiť aj tak“ sa faktúra nezaloží.
      const cudzia = nesediZChyby(sprava);
      if (cudzia) {
        setBusy(false);
        if (
          await potvrd(
            textCudzejFaktury(cudzia, t) +
              "\n" +
              t(
                "Uložiť ju aj tak? Ostane označená červeným výkričníkom a nedá sa zaúčtovať, kým nepotvrdíte, že patrí tejto firme. Zmazať alebo presunúť ju môžete v upozornení nad údajmi.",
              ),
            { potvrdit: t("Uložiť aj tak"), zrusit: t("Späť"), nebezpecne: true },
          )
        )
          await vytvorDoklad(ajDuplicitu, true);
        return;
      }
      toast.error(sprava || t("Doklad sa nepodarilo vytvoriť"));
    } finally {
      setBusy(false);
    }
  }

  async function zmazDoklad() {
    if (!(await potvrd(t("Presunúť doklad do koša?")))) return;
    try {
      await zmaz({ data: { id } });
      toast.success(t("Doklad je v koši"));
      navigate({ to: d!.dalsiId ? "/nespracovane/$id" : "/nespracovane", params: { id: d!.dalsiId ?? "" } } as any);
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    }
  }

  // Uloží rozpracované a nechá doklad prečítať znova — doplnia sa len prázdne polia.
  async function docitajDoklad() {
    if (!u) return;
    setBusy(true);
    try {
      await uloz({ data: { id, druh: druh || null, udaje: u as any } });
      await docitaj({ data: { id } });
      await obnov();
      toast.success(t("Čítam doklad znova — chýbajúce údaje sa doplnia"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  // Prepínač rozloženia — voľba sa pamätá v účte používateľa.
  const prepinac = (
    <div className="flex flex-wrap items-center gap-2">
      <ZdrojovyMailTlacidlo druh="nespracovany" id={d.id} inboxMessageId={d.inboxMessageId} />
      {d.subor.url && d.stav !== "cita" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void docitajDoklad()}
          title={t("Prečíta doklad znova a doplní chýbajúce údaje (VS, IBAN, splatnosť, adresu). Vyplnené neprepíše.")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-60"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t("Dočítať z dokladu")}
        </button>
      ) : null}
    <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label={t("Rozloženie")}>
      {(
        [
          ["klasicky", "Klasické"],
          ["kompaktny", "Kompaktné"],
        ] as const
      ).map(([k, n]) => (
        <button
          key={k}
          type="button"
          aria-pressed={vzhlad === k}
          onClick={() => void zmenVzhlad(k)}
          className={`rounded-md px-3 py-1.5 ${vzhlad === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
        >
          {t(n)}
        </button>
      ))}
    </div>
    </div>
  );
  const nadpis = u.dodavatel.nazov
    ? `${u.dodavatel.nazov}${u.cislo ? ` — ${u.cislo}` : ""}`
    : t("Nespracovaný doklad");

  if (vzhlad === "kompaktny")
    return (
      <>
        <PageHeader
          title={nadpis}
          description={`${t("Nespracované doklady")} › ${d.subor.nazov ?? t("doklad")}`}
          action={prepinac}
        />
        <PageBody>
          <NespracovanyKompaktny
            subor={d.subor}
            stav={d.stav}
            chybaCitania={d.chyba}
            varovania={d.varovania}
            druh={druh}
            setDruh={setDruh}
            u={u}
            setU={setU}
            navrhy={navrhy}
            stavNavrhuAi={navrhAi?.stav ?? null}
            chyby={chyby}
            sucty={s}
            sadzby={sadzby}
            busy={busy}
            onVytvor={() => void vytvorDoklad()}
            onUloz={() => void ulozZmeny()}
            onZmaz={() => void zmazDoklad()}
            companyId={d.companyId}
            rozdielVyrovna={rozdielVyrovna?.rozdiel ?? null}
            upozornenie={upozornenieVlastnej}
            zvyraznenie={zvyraznenie}
            onPrepniZvyraznenie={prepniZvyraznenie}
            pravidloZDokladu={
              druh && druh !== "ostatny" ? (
                <PravidloZDokladu companyId={d.companyId} zaklad={zakladPravidla(druh, u, d.odosielatelMailu)} />
              ) : null
            }
            pravidlo={
              <PravidloNespracovaneho
                companyId={d.companyId}
                druh={druh}
                u={u}
                setU={setU}
                createdBy={d.createdBy}
                predmetMailu={d.predmetMailu}
                odosielatelMailu={d.odosielatelMailu}
                krajinaFirmy={d.krajinaFirmy}
                aktivne={d.stav !== "cita"}
              />
            }
          />
        </PageBody>
      </>
    );

  const hodnotyKodov = {
    predkontacia: u.kody.predkontacia,
    clenenie: u.kody.clenenie,
    kategoria: u.kategoria,
    kv: u.kody.kv,
    stredisko: u.kody.stredisko,
    cinnost: u.kody.cinnost,
    rad: u.kody.rad,
    intPoznamka: u.kody.intPoznamka,
  };

  // Dodávateľ sa kreslí raz — pri bežnom doklade až za sumami, pri ostatných hneď za druhom.
  const sekciaDodavatela = (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {druh === "ostatny" ? t("Odosielateľ") : t("Dodávateľ")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="text-xs text-muted-foreground">{t("Názov")}</span>
          <input aria-label={t("Dodávateľ")} value={u.dodavatel.nazov} onChange={(e) => setDod({ nazov: e.target.value })} className={`${vstup} ${ram("dodavatel")}`} />
        </label>
        {druh !== "ostatny" && (
          <>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("IČO")}</span>
              <input value={u.dodavatel.ico} onChange={(e) => setDod({ ico: e.target.value })} className={`${vstup} border-input`} />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("IČ DPH")}</span>
              <input value={u.dodavatel.icDph} onChange={(e) => setDod({ icDph: e.target.value })} className={`${vstup} border-input`} />
            </label>
          </>
        )}
        {faktura && (
          // Adresa, krajina, DIČ a e-mail sú menej dôležité — pod „Zobraziť viac“.
          <ZobrazitViac>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("DIČ")}</span>
              <input value={u.dodavatel.dic} onChange={(e) => setDod({ dic: e.target.value })} className={`${vstup} border-input`} />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Krajina")}</span>
              <input aria-label={t("Krajina dodávateľa")} maxLength={2} placeholder="SK" value={u.dodavatel.krajina ?? ""} onChange={(e) => setDod({ krajina: e.target.value.toUpperCase() })} className={`${vstup} border-input`} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs text-muted-foreground">{t("Ulica a číslo")}</span>
              <input value={u.dodavatel.ulica} onChange={(e) => setDod({ ulica: e.target.value })} className={`${vstup} border-input`} />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Mesto")}</span>
              <input value={u.dodavatel.mesto} onChange={(e) => setDod({ mesto: e.target.value })} className={`${vstup} border-input`} />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("PSČ")}</span>
              <input value={u.dodavatel.psc} onChange={(e) => setDod({ psc: e.target.value })} className={`${vstup} border-input`} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs text-muted-foreground">{t("E-mail")}</span>
              <input type="email" aria-label={t("E-mail dodávateľa")} value={u.dodavatel.email ?? ""} onChange={(e) => setDod({ email: e.target.value })} className={`${vstup} border-input`} />
            </label>
          </ZobrazitViac>
        )}
      </div>
    </section>
  );

  return (
    <>
      <PageHeader
        title={nadpis}
        description={
          d.stav === "cita"
            ? t("Faktero doklad práve číta…")
            : t("Určte druh dokladu, skontrolujte údaje, zaúčtujte a vytvorte. Povinné polia, ktoré chýbajú, sú červené.")
        }
        action={prepinac}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Doklad */}
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            {d.subor.url ? (
              <>
                <NahladSVyberom
                  dokladId={d.id}
                  subor={d.subor}
                  pole={vyberPole}
                  polia={poliaPreDruh(druh)}
                  onVyberPola={setVyberPole}
                  onZrus={() => setVyberPole(null)}
                  onHodnota={(kluc, h) => {
                    setU((p) => (p ? zapisDoUdajov(p, kluc, h) : p));
                    setVyberPole(null);
                    zablikajPole(udajeRef.current, kluc);
                  }}
                  zvyraznenie={{ ...zvyraznenie, aktivne: hoverPola.pole ?? vyberPole }}
                  onPrepniZvyraznenie={prepniZvyraznenie}
                />
                <a
                  href={d.subor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />{" "}
                  {t("Otvoriť {nazov}", { nazov: d.subor.nazov ?? t("súbor") })}
                </a>
              </>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">{t("Doklad nemá súbor.")}</p>
            )}
          </div>

          {/* Údaje — kliknutie do poľa zapne výber z náhľadu */}
          <div
            ref={udajeRef}
            onFocusCapture={(e) => setVyberPole(poleZPrvku(e.target))}
            onMouseOver={hoverPola.onMouseOver}
            onMouseLeave={hoverPola.onMouseLeave}
            className="min-w-0 space-y-4"
          >
            {d.stav === "cita" && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("Čítam doklad — údaje sa doplnia samy.")}
              </div>
            )}
            {d.chyba && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{d.chyba}</div>}
            {upozornenieVlastnej}
            {d.zdrojUdajov && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                {t("Údaje sú zo strojového záznamu faktúry")} (
                {d.zdrojUdajov === "isdoc" ? "ISDOC" : d.zdrojUdajov === "zugferd" ? "ZUGFeRD / Factur-X" : "UBL"}
                ){t(", nie prečítané z obrázka — sumy a čísla sedia presne s dokladom.")}
              </div>
            )}
            {d.varovania.map((v) => (
              <div key={v} role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {t(v)}
              </div>
            ))}

            <section className="rounded-xl border border-border bg-card p-4">
              <label className="block text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Druh dokladu")}</span>
                <select
                  aria-label={t("Druh dokladu")}
                  value={druh}
                  onChange={(e) => setDruh(e.target.value as DruhNespracovaneho)}
                  className={`${vstup} ${ram("druh")}`}
                >
                  <option value="">{t("— vyberte —")}</option>
                  {DRUHY_NESPRACOVANYCH.map((x) => (
                    <option key={x.kluc} value={x.kluc}>
                      {t(x.nazov)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {/* Poradie podľa dôležitosti: zaúčtovanie hneď za druhom, platobné údaje až na konci. */}
            {druh && druh !== "ostatny" ? (
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 text-base font-semibold">{t("Zaúčtovanie")}</h3>
                <PoliaZauctovania
                  siroke
                  navrhy={navrhy}
                  doklad={{ typ: druh === "blocek" ? "blocek" : "faktura", platba: u.platba }}
                  hodnoty={hodnotyKodov}
                  oznacenia={oznaceniaZUdajov(u)}
                  setHodnoty={(h: any) =>
                    setU({
                      ...u,
                      kategoria: h.kategoria ?? "",
                      kody: {
                        predkontacia: h.predkontacia ?? "",
                        clenenie: h.clenenie ?? "",
                        kv: h.kv ?? "",
                        stredisko: h.stredisko ?? "",
                        cinnost: h.cinnost ?? "",
                        rad: h.rad ?? "",
                        intPoznamka: h.intPoznamka ?? "",
                      },
                    })
                  }
                />
                <JobPicker
                  value={u.jobId}
                  onChange={(v) => setU((p) => (p ? { ...p, jobId: v } : p))}
                  companyId={d.companyId}
                  className={`mt-3 ${zle("zakazka") ? "[&_select]:border-red-500" : ""}`}
                />
                <VozidloPicker
                  value={u.vehicleId ?? ""}
                  onChange={(v) => setU((p) => (p ? { ...p, vehicleId: v } : p))}
                  companyId={d.companyId}
                  className="mt-3"
                />
                <PravidloNespracovaneho
                  companyId={d.companyId}
                  druh={druh}
                  u={u}
                  setU={setU}
                  createdBy={d.createdBy}
                  predmetMailu={d.predmetMailu}
                  odosielatelMailu={d.odosielatelMailu}
                  krajinaFirmy={d.krajinaFirmy}
                  aktivne={d.stav !== "cita"}
                />
                <NauceneZDodavatela u={u} />
                <NavrhAiNespracovaneho u={u} setU={setU} stav={navrhAi?.stav} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("Prázdne pole = predvolené z")}{" "}
                  <Link to="/uctovnictvo/predkontacie" className="underline">
                    {t("nastavení predkontácií")}
                  </Link>
                  .
                </p>
              </section>
            ) : null}

            {!druh || druh === "ostatny" ? sekciaDodavatela : null}

            {druh === "ostatny" ? (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">{t("Druh")}</span>
                    <select value={u.ostatny.druh} onChange={(e) => set({ ostatny: { ...u.ostatny, druh: e.target.value } })} className={`${vstup} border-input`}>
                      {DRUHY_OSTATNYCH.map((x) => (
                        <option key={x.kluc} value={x.kluc}>
                          {t(x.nazov)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">{t("Lehota")}</span>
                    <input type="date" value={u.ostatny.lehota} onChange={(e) => set({ ostatny: { ...u.ostatny, lehota: e.target.value } })} className={`${vstup} border-input`} />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-xs text-muted-foreground">{t("Predmet")}</span>
                    <input value={u.ostatny.predmet} onChange={(e) => set({ ostatny: { ...u.ostatny, predmet: e.target.value } })} className={`${vstup} border-input`} />
                  </label>
                </div>
              </section>
            ) : druh ? (
              <>
                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Doklad")}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">{t("Číslo dokladu")}</span>
                      <input aria-label={t("Číslo dokladu")} value={u.cislo} onChange={(e) => set({ cislo: e.target.value })} className={`${vstup} ${ram("cislo")}`} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">{t("Dátum vystavenia")}</span>
                      <input type="date" aria-label={t("Dátum vystavenia")} value={u.datumVystavenia} onChange={(e) => set({ datumVystavenia: e.target.value })} className={`${vstup} ${ram("datumVystavenia")}`} />
                    </label>
                    {faktura && (
                      <>
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Dátum dodania (DUZP)")}</span>
                          <input type="date" value={u.datumDodania} onChange={(e) => set({ datumDodania: e.target.value })} className={`${vstup} border-input`} />
                        </label>
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Splatnosť")}</span>
                          <input type="date" aria-label={t("Splatnosť")} value={u.splatnost} onChange={(e) => set({ splatnost: e.target.value })} className={`${vstup} ${ram("splatnost")}`} />
                        </label>
                      </>
                    )}
                    {druh === "dobropis" && (
                      <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">{t("Opravuje faktúru č.")}</span>
                        <input value={u.opravuje} onChange={(e) => set({ opravuje: e.target.value })} className={`${vstup} ${ram("opravuje")}`} />
                      </label>
                    )}
                    {!faktura && (
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Spôsob úhrady")}</span>
                          <select aria-label={t("Spôsob úhrady")} value={u.platba} onChange={(e) => set({ platba: e.target.value })} className={`${vstup} ${ram("platba")}`}>
                            <option value="">{blocek ? t("— vyberte —") : t("prevodom (predvolené)")}</option>
                            <option value="hotovost">{t("Hotovosťou")}</option>
                            <option value="karta">{t("Kartou")}</option>
                            <option value="prevod">{t("Prevodom")}</option>
                            {faktura && <option value="inkaso">{t("Inkasom")}</option>}
                          </select>
                        </label>
                    )}
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">{t("Mena")}</span>
                      <input value={u.mena} maxLength={3} onChange={(e) => set({ mena: e.target.value.toUpperCase() })} className={`${vstup} border-input`} />
                    </label>
                    <ZobrazitViac>
                      {faktura && (
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Dátum prijatia")}</span>
                          <input type="date" aria-label={t("Dátum prijatia")} value={u.datumPrijatia ?? ""} onChange={(e) => set({ datumPrijatia: e.target.value })} className={`${vstup} border-input`} />
                        </label>
                      )}
                      <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">{t("Interné číslo")}</span>
                        <input aria-label={t("Interné číslo")} maxLength={40} value={u.interneCislo ?? ""} onChange={(e) => set({ interneCislo: e.target.value })} className={`${vstup} border-input`} />
                      </label>
                      {faktura && (
                        <label className="block text-sm sm:col-span-2">
                          <span className="text-xs text-muted-foreground">{t("Popis plnenia (text faktúry v Pohode)")}</span>
                          <input value={u.popis ?? ""} onChange={(e) => set({ popis: e.target.value })} className={`${vstup} border-input`} />
                        </label>
                      )}
                    </ZobrazitViac>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Sumy podľa sadzieb DPH")}</span>
                    <button type="button" onClick={() => set({ rozpis: [...u.rozpis, { sadzba: sadzby[0] ?? 23, zaklad: 0, dph: 0 }], celkom: null })} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Plus className="h-3.5 w-3.5" /> {t("Pridať sadzbu")}
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-2 font-medium">{t("Sadzba")}</th>
                        <th className="py-1 pr-2 text-right font-medium">{t("Základ")}</th>
                        <th className="py-1 pr-2 text-right font-medium">{t("DPH")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {u.rozpis.map((r, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2">
                            <select value={String(r.sadzba)} onChange={(e) => setRozpis(i, { sadzba: Number(e.target.value) })} className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                              {[...new Set([...sadzby, 0, Number(r.sadzba)])].map((x) => (
                                <option key={x} value={x}>
                                  {x} %
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 pr-2">
                            <input inputMode="decimal" value={String(r.zaklad)} onChange={(e) => {
                              const z = Number(e.target.value.replace(",", ".")) || 0;
                              setRozpis(i, { zaklad: z, dph: Math.round(z * Number(r.sadzba)) / 100 });
                            }} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums" />
                          </td>
                          <td className="py-1 pr-2">
                            <input inputMode="decimal" value={String(r.dph)} onChange={(e) => setRozpis(i, { dph: Number(e.target.value.replace(",", ".")) || 0 })} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums" />
                          </td>
                          <td className="py-1 text-right">
                            <button type="button" aria-label={t("Odstrániť sadzbu")} onClick={() => set({ rozpis: u.rozpis.filter((_, j) => j !== i), celkom: null })} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className={`mt-2 flex flex-wrap items-center justify-end gap-3 text-sm ${zle("celkom") ? "text-red-600" : ""}`}>
                    <span className="text-muted-foreground">
                      {t("Základ {zaklad} · DPH {dph}", { zaklad: s.zaklad.toFixed(2), dph: s.dph.toFixed(2) })}
                    </span>
                    <label className="inline-flex items-center gap-2 font-medium">
                      {t("Spolu")}
                      <input aria-label={t("Suma spolu")} inputMode="decimal" value={u.celkom ?? s.celkom} onChange={(e) => set({ celkom: Number(e.target.value.replace(",", ".")) || 0 })} className={`w-28 rounded-md border bg-background px-2 py-1.5 text-right tabular-nums ${ram("celkom")}`} />
                      {u.mena}
                    </label>
                  </div>
                  {druh === "dobropis" && <p className="mt-1 text-xs text-muted-foreground">{t("Sumy zadajte kladne — dobropis ich odpočíta sám.")}</p>}
                </section>

                {sekciaDodavatela}

                {faktura && (
                  <section className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Platobné údaje")}</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {faktura && (
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Variabilný symbol")}</span>
                          <input value={u.vs} onChange={(e) => set({ vs: e.target.value })} className={`${vstup} border-input`} />
                        </label>
                      )}
                      {faktura && (
                          <label className="block text-sm">
                            <span className="text-xs text-muted-foreground">{t("IBAN")}</span>
                            <input value={u.dodavatel.iban} onChange={(e) => setDod({ iban: e.target.value })} className={`${vstup} border-input`} />
                          </label>
                      )}
                      {faktura && (
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Konštantný / špecifický symbol")}</span>
                          <div className="flex gap-2">
                            <input aria-label={t("Konštantný symbol")} placeholder={t("KS")} maxLength={4} value={u.ks ?? ""} onChange={(e) => set({ ks: e.target.value })} className={`${vstup} border-input`} />
                            <input aria-label={t("Špecifický symbol")} placeholder={t("ŠS")} maxLength={10} value={u.ss ?? ""} onChange={(e) => set({ ss: e.target.value })} className={`${vstup} border-input`} />
                          </div>
                        </label>
                      )}
                      {faktura && (
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Číslo objednávky")}</span>
                          <input value={u.objednavka ?? ""} onChange={(e) => set({ objednavka: e.target.value })} className={`${vstup} border-input`} />
                          <UpozornenieObjednavky companyId={d.companyId} ico={u.dodavatel.ico} cisloObjednavky={u.objednavka} />
                        </label>
                      )}
                      {faktura && (
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">{t("Číslo dodacieho listu")}</span>
                          <input value={u.dodaciList ?? ""} onChange={(e) => set({ dodaciList: e.target.value })} className={`${vstup} border-input`} />
                        </label>
                      )}
                      {faktura && (
                          <label className="block text-sm">
                            <span className="text-xs text-muted-foreground">{t("Spôsob úhrady")}</span>
                            <select aria-label={t("Spôsob úhrady")} value={u.platba} onChange={(e) => set({ platba: e.target.value })} className={`${vstup} ${ram("platba")}`}>
                              <option value="">{blocek ? t("— vyberte —") : t("prevodom (predvolené)")}</option>
                              <option value="hotovost">{t("Hotovosťou")}</option>
                              <option value="karta">{t("Kartou")}</option>
                              <option value="prevod">{t("Prevodom")}</option>
                              {faktura && <option value="inkaso">{t("Inkasom")}</option>}
                            </select>
                          </label>
                      )}
                      {faktura && (
                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                          <input type="checkbox" checked={Boolean(u.uhradene)} onChange={(e) => set({ uhradene: e.target.checked || undefined })} />
                          {t("Faktúra je už uhradená")}
                        </label>
                      )}
                    </div>
                  </section>
                )}
              </>
            ) : null}

            {druh ? (
              <section className="rounded-xl border border-border bg-card p-4">
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t("Poznámka")}</span>
                  <textarea rows={2} value={u.poznamka} onChange={(e) => set({ poznamka: e.target.value })} className={`${vstup} border-input`} />
                  <PreddefinovanaPoznamka companyId={d.companyId} agenda="nespracovane" onVyber={(text) => set({ poznamka: u.poznamka ? `${u.poznamka}\n${text}` : text })} />
                </label>
                {/* Komentár pre ľudí vo firme — ako v kompaktnom rozložení; ide do `komentar` dokladu, do účtovníctva nie. */}
                {druh !== "ostatny" ? (
                  <label className="mt-3 block text-sm">
                    <span className="text-xs text-muted-foreground">{t("Komentár (do účtovníctva sa neprenáša)")}</span>
                    <textarea rows={2} maxLength={1000} value={u.komentar ?? ""} onChange={(e) => set({ komentar: e.target.value })} className={`${vstup} border-input`} />
                    <span className="block text-right text-[11px] text-muted-foreground">{(u.komentar ?? "").length}/1000</span>
                  </label>
                ) : null}
              </section>
            ) : null}

            {druh && druh !== "ostatny" ? (
                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Položky")}</div>
                  <PolozkyNespracovaneho u={u} setU={setU} sadzby={sadzby} navrhy={navrhy} />
                </section>
            ) : null}

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 p-3 pr-24 backdrop-blur">
              <button type="button" disabled={busy || d.stav === "cita"} onClick={() => void vytvorDoklad()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("Vytvoriť")}
              </button>
              {druh && druh !== "ostatny" ? (
                <PravidloZDokladu
                  companyId={d.companyId}
                  zaklad={zakladPravidla(druh, u, d.odosielatelMailu)}
                  tlacidlo
                />
              ) : null}
              <button type="button" disabled={busy} onClick={ulozZmeny} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60">
                {t("Uložiť zmeny")}
              </button>
              {chyby.length > 0 && druh ? (
                <span className="text-xs text-red-600">
                  {t("Chýba: {polia}", { polia: chyby.map((k) => t(NAZVY_POLI[k] ?? k)).join(", ") })}
                </span>
              ) : rozdielVyrovna && druh ? (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  {t("Položky nesedia so sumou o {rozdiel} — doplní sa vyrovnávacia položka.", {
                    rozdiel: rozdielVyrovna.rozdiel.toFixed(2),
                  })}
                </span>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void zmazDoklad()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> {t("Zmazať")}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-6 max-w-xl">
          <SchvalovaniePanel companyId={d.companyId} agenda="nespracovany" id={d.id} />
        </div>
      </PageBody>
    </>
  );
}

/**
 * Menej dôležité polia pod „Zobraziť viac“ (v mriežke dvoch stĺpcov) —
 * dôležité ostávajú vždy viditeľné.
 */
function ZobrazitViac({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={otvorene}
        onClick={() => setOtvorene((o) => !o)}
        className="inline-flex items-center gap-1 justify-self-start text-xs text-primary hover:underline sm:col-span-2"
      >
        {otvorene ? t("Zobraziť menej") : t("Zobraziť viac")}
        {otvorene ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {otvorene ? children : null}
    </>
  );
}

/** Čo z nespracovaného dokladu predvyplní nové pravidlo účtovania. */
function zakladPravidla(
  druh: DruhNespracovaneho,
  u: UdajeNespracovaneho,
  odosielatel: string | null | undefined,
): ZakladPravidlaZDokladu {
  return {
    druh: druh === "blocek" ? "blocek" : "prijata",
    nazov: u.dodavatel.nazov,
    ico: u.dodavatel.ico,
    odosielatel: odosielatel ?? null,
    vs: druh === "blocek" ? null : u.vs,
    platba: u.platba,
    predkontacia: u.kody.predkontacia,
    clenenie: u.kody.clenenie,
    kv: u.kody.kv,
    kategoria: u.kategoria,
  };
}
