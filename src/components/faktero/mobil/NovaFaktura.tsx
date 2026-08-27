import { useEffect, useMemo, useRef, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import {
  Building2,
  Check,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  Mail,
  Package,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cenaZPodkladov, PRAZDNE_PODKLADY, type Podklady } from "@/lib/faktero/ceny";
import { sadzbyKrajiny, DEFAULT_VAT_RATE } from "@/lib/faktero/vat-rates";
import { friendlyError } from "@/lib/faktero/plan-error";
import { POLOZKY, sPoctom } from "@/lib/faktero/mnozne";
import { HlavneTlacidlo, MobilObrazovka, Pracujem, VelkeTlacidlo } from "./MobilChrome";
import type { OdlozenaFaktura } from "@/lib/mobile/faktury-fronta";
import { riadkyNaZapis, suctyFaktury } from "@/lib/mobile/faktura-uprava";
import { otvorPdfFaktury, zdielajPdfFaktury } from "./pdf-faktury";
import { formatovacMeny } from "@/lib/faktero/mena";

import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { usePreklad } from "@/lib/mobile/preklady/hook";
/**
 * Vystavenie faktúry v telefóne.
 *
 * Webový formulár má tri desiatky polí — na malej obrazovke sa v ňom nedá
 * pracovať. Tu sú tri kroky a v každom jediná otázka: komu, za čo, kedy
 * splatné. Zvyšok sa dopĺňa sám z firmy a z cenníka; keď treba viac, faktúra
 * sa doupraví na webe.
 */

export type Odberatel = {
  id: string;
  name: string;
  email: string | null;
  ico: string | null;
  dic: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  discount_percent: number | null;
  price_group_id: string | null;
};

type Produkt = { id: string; name: string; unit: string; unit_price: number; vat_rate: number };

type Podkladove = {
  firma: { id: string; name: string; platcaDph: boolean; mena: string; maIban: boolean };
  odberatelia: Odberatel[];
  produkty: Produkt[];
};

export type Riadok = {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  unit_price: string;
  vat_rate: number;
  product_id: string | null;
  /** Prečo je cena taká — z dohodnutej ceny, zľavy alebo akcie. */
  dovod?: string | null;
};

type Krok = "odberatel" | "polozky" | "suhrn" | "hotovo" | "odlozena";

/** „12,50" aj „12.50" — na telefóne sa píše desatinná čiarka. */
export function cislo(v: string): number {
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

export function suma(n: number, mena = "EUR"): string {
  return formatovacMeny(mena, "sk-SK")(n);
}

/** „2026-08-11" → „11. 8. 2026" — ISO tvar nikto nečíta ako dátum. */
export function datumSk(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : v;
}

export function dnes(): string {
  return new Date().toISOString().slice(0, 10);
}

export function oDni(od: string, dni: number): string {
  const d = new Date(`${od}T00:00:00`);
  d.setDate(d.getDate() + dni);
  return d.toISOString().slice(0, 10);
}

export function prazdnyRiadok(sadzba: number): Riadok {
  return {
    key: Math.random().toString(36).slice(2),
    name: "",
    quantity: "1",
    unit: "ks",
    unit_price: "",
    vat_rate: sadzba,
    product_id: null,
  };
}

export function NovaFaktura({
  firma,
  onSpat,
  onHotovo,
  upravuje,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  /** Po vystavení vedieme človeka do zoznamu — nech vidí, že faktúra existuje. */
  onHotovo: () => void;
  /**
   * Oprava už vystavenej faktúry.
   *
   * Je to tá istá obrazovka zámerne: keby mala oprava vlastnú, museli by sa v
   * nej znova napísať položky, cenník aj súčty — a rozišli by sa. Odberateľ sa
   * pritom nemení (rovnako ako na webe), takže sa začína rovno položkami.
   */
  upravuje?: { id: string; invoice_number: string };
}) {
  const { t } = usePreklad();
  const nacitajPodklady = useOperacia("faktura-podklady");
  const nacitajCennik = useOperacia("cennik-kontext");
  const nacitajPoslednu = useOperacia("faktura-posledna");
  const vystav = useOperacia("faktura-vystav");

  /* Sadzby DPH vyplývajú z krajiny registrácie firmy, nenastavujú sa ručne. */

  const krajina = useKrajinaDane();

  const [podklady, setPodklady] = useState<Podkladove | null>(null);
  const [krok, setKrok] = useState<Krok>("odberatel");
  const [odberatel, setOdberatel] = useState<Odberatel | null>(null);
  const [cennik, setCennik] = useState<Podklady>(PRAZDNE_PODKLADY);
  const [riadky, setRiadky] = useState<Riadok[]>([]);
  const [vystavenie, setVystavenie] = useState(dnes());
  const [splatnost, setSplatnost] = useState(oDni(dnes(), 14));
  const [uhrada, setUhrada] = useState<"bank_transfer" | "cash" | "card">("bank_transfer");
  const [poznamka, setPoznamka] = useState("");
  const [poznamkaNad, setPoznamkaNad] = useState("");
  /*
    Zálohová faktúra nie je daňový doklad a má vlastnú radu čísel. Dobropis
    v telefóne nerobíme — ten opravuje konkrétnu faktúru a patrí na web.
  */
  const [druh, setDruh] = useState<"regular" | "proforma">("regular");
  /** Zúčtovaná záloha — ktorá zálohová faktúra sa od tejto odpočíta. */
  const [zaloha, setZaloha] = useState<{
    id: string;
    invoice_number: string;
    total: number;
  } | null>(null);
  /* Posledná faktúra toho istého odberateľa — ponúkne sa na zopakovanie. */
  const [posledna, setPosledna] = useState<{
    invoice_number: string;
    issue_date: string;
    polozky: {
      name: string;
      quantity: number;
      unit: string | null;
      unit_price: number;
      vat_rate: number;
      product_id: string | null;
    }[];
  } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [hotova, setHotova] = useState<{
    id: string;
    invoice_number: string;
    total: number;
    currency: string;
    customer_email: string | null;
  } | null>(null);
  /** Faktúra vystavená bez signálu — leží v telefóne a čaká na odoslanie. */
  const [odlozena, setOdlozena] = useState<OdlozenaFaktura | null>(null);

  const platca = podklady?.firma.platcaDph ?? true;
  const mena = podklady?.firma.mena ?? "EUR";
  const zakladnaSadzba = platca ? sadzbyKrajiny(krajina)[0] : 0;

  useEffect(() => {
    (async () => {
      const { ulozDoPamate, zPamate } = await import("@/lib/mobile/jazdy-lokalne");
      const kluc = `podklady-faktury:${firma.id}`;
      try {
        const p = (await nacitajPodklady({ data: { company_id: firma.id } })) as Podkladove;
        setPodklady(p);
        void ulozDoPamate(kluc, p);
      } catch (e: any) {
        /*
          Bez odberateľov sa faktúra nedá ani začať — a práve bez signálu ju
          človek potrebuje. Preto sa berie posledný známy zoznam. Nové ceny v
          ňom nie sú, ale odberateľ a jeho údaje sa menia zriedka.
        */
        const zapamatane = await zPamate<Podkladove>(kluc);
        if (zapamatane?.hodnota?.odberatelia?.length) {
          setPodklady(zapamatane.hodnota);
          toast.message(t("nf.bezPripojenia"), {
            description: new Date(zapamatane.kedy).toLocaleString("sk-SK"),
          });
          return;
        }
        const { isOnline } = await import("@/lib/mobile/offline-queue");
        toast.error(
          (await isOnline())
            ? (e?.message ?? t("nf.chybaPodkladov"))
            : t("nf.bezPripojeniaVystavit"),
          { duration: 7000 },
        );
        onSpat();
      }
    })();
    // eslint-disable-next-line
  }, [firma.id]);

  /*
    Oprava: doťahujú sa hlavička aj položky. Ide to cez `supabase` a nie cez
    serverovú operáciu — čítanie stráži RLS a appka tu nepotrebuje nič navyše.
  */
  useEffect(() => {
    if (!upravuje || !podklady) return;
    let zrusene = false;
    (async () => {
      const [{ data: f, error: chybaF }, { data: polozky }] = await Promise.all([
        supabase
          .from("invoices")
          .select("customer_id, issue_date, due_date, payment_method, notes, intro_note, status")
          .eq("id", upravuje.id)
          .single(),
        supabase
          .from("invoice_items")
          .select("name, quantity, unit, unit_price, vat_rate, product_id")
          .eq("invoice_id", upravuje.id)
          .order("position"),
      ]);
      if (zrusene) return;
      if (chybaF || !f) {
        toast.error(t("nf.chybaNacitania"));
        onSpat();
        return;
      }
      const o =
        podklady.odberatelia.find((x) => x.id === f.customer_id) ??
        ({ id: f.customer_id, name: t("nf.odberatel") } as Odberatel);
      setOdberatel(o);
      setVystavenie(f.issue_date ?? dnes());
      setSplatnost(f.due_date ?? oDni(dnes(), 14));
      setUhrada((f.payment_method as typeof uhrada) ?? "bank_transfer");
      setPoznamka(f.notes ?? "");
      setPoznamkaNad((f as any).intro_note ?? "");
      setRiadky(
        (polozky ?? []).map((r: any) => ({
          key: Math.random().toString(36).slice(2),
          name: r.name ?? "",
          quantity: String(r.quantity ?? 1).replace(".", ","),
          unit: r.unit || "ks",
          unit_price: String(r.unit_price ?? 0).replace(".", ","),
          vat_rate: Number(r.vat_rate ?? 0),
          product_id: r.product_id ?? null,
          dovod: null,
        })),
      );
      setKrok("polozky");
    })();
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line
  }, [upravuje?.id, podklady]);

  /* Cenník sa načíta až keď je známy odberateľ — dohodnuté ceny a zľavy sú jeho. */
  async function vyberOdberatela(o: Odberatel) {
    setOdberatel(o);
    setKrok("polozky");
    if (riadky.length === 0) setRiadky([prazdnyRiadok(zakladnaSadzba)]);
    setPosledna(null);
    nacitajPoslednu({ data: { company_id: firma.id, customer_id: o.id } })
      .then((r: any) => setPosledna(r?.polozky?.length ? r : null))
      .catch(() => setPosledna(null));
    try {
      const p = (await nacitajCennik({
        data: { company_id: firma.id, customer_id: o.id, datum: vystavenie },
      })) as Podklady;
      setCennik(p);
    } catch {
      // Bez cenníka sa fakturuje za základnú cenu — to je horšie, ale nie chyba.
      setCennik(PRAZDNE_PODKLADY);
    }
  }

  function pridajProdukt(p: Produkt) {
    const v = cenaZPodkladov(cennik, { id: p.id, unit_price: p.unit_price }, 1);
    setRiadky((r) => [
      ...r.filter((x) => x.name || x.unit_price),
      {
        key: Math.random().toString(36).slice(2),
        name: p.name,
        quantity: "1",
        unit: p.unit || "ks",
        // Desatinná čiarka — inak sa v poli mieša „2.36" s tým, čo človek píše.
        unit_price: String(v.cena).replace(".", ","),
        vat_rate: platca ? p.vat_rate : 0,
        product_id: p.id,
        dovod: v.zdroj === "zakladna" ? null : v.dovod,
      },
    ]);
  }

  /** Prevezme riadky z poslednej faktúry — ceny aj sadzby ostávajú tie isté. */
  function zopakujPoslednu() {
    if (!posledna) return;
    setRiadky(
      posledna.polozky.map((p) => ({
        key: Math.random().toString(36).slice(2),
        name: p.name,
        quantity: String(p.quantity).replace(".", ","),
        unit: p.unit || "ks",
        unit_price: String(p.unit_price).replace(".", ","),
        vat_rate: platca ? Number(p.vat_rate) : 0,
        product_id: p.product_id,
        dovod: `Z faktúry ${posledna.invoice_number}`,
      })),
    );
    toast.success(`Položky z faktúry ${posledna.invoice_number}`);
  }

  function zmen(key: string, patch: Partial<Riadok>) {
    setRiadky((r) => r.map((x) => (x.key === key ? { ...x, ...patch, dovod: null } : x)));
  }

  const sucty = useMemo(() => {
    let zaklad = 0;
    let dph = 0;
    for (const r of riadky) {
      const s = +(cislo(r.quantity) * cislo(r.unit_price)).toFixed(2);
      zaklad += s;
      dph += +((s * r.vat_rate) / 100).toFixed(2);
    }
    return { zaklad: +zaklad.toFixed(2), dph: +dph.toFixed(2), spolu: +(zaklad + dph).toFixed(2) };
  }, [riadky]);

  const pouzitelne = riadky.filter((r) => r.name.trim() && cislo(r.quantity) > 0);

  /**
   * Uloženie opravy.
   *
   * Položky sa nezlučujú, ale prepíšu — je to to isté, čo robí web, a pri
   * dvoch rovnakých riadkoch je to jediné, čo dá predvídateľný výsledok.
   * Súčty počíta appka, aby sedeli s tým, čo mal človek pred očami.
   */
  async function ulozUpravu() {
    if (!upravuje) return;
    const vstupy = pouzitelne.map((x) => ({
      name: x.name,
      quantity: cislo(x.quantity),
      unit: x.unit || "ks",
      unit_price: cislo(x.unit_price),
      vat_rate: platca ? x.vat_rate : 0,
      product_id: x.product_id,
    }));
    const s = suctyFaktury(vstupy);

    setUkladam(true);
    try {
      const { error: chybaHlavicky } = await supabase
        .from("invoices")
        .update({
          issue_date: vystavenie,
          due_date: splatnost,
          payment_method: uhrada,
          notes: poznamka.trim() || null,
          intro_note: poznamkaNad.trim() || null,
          subtotal: s.subtotal,
          vat_total: s.vat_total,
          total: s.total,
        })
        .eq("id", upravuje.id);
      if (chybaHlavicky) throw new Error(chybaHlavicky.message);

      const { error: chybaMazania } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", upravuje.id);
      if (chybaMazania) throw new Error(chybaMazania.message);

      const { error: chybaZapisu } = await supabase
        .from("invoice_items")
        .insert(riadkyNaZapis(upravuje.id, vstupy));
      if (chybaZapisu) throw new Error(chybaZapisu.message);

      toast.success(`Faktúra ${upravuje.invoice_number} opravená`);
      onHotovo();
    } catch (e: any) {
      toast.error(friendlyError(e, t("nf.chybaZmien")));
    } finally {
      setUkladam(false);
    }
  }

  async function uloz() {
    if (!odberatel || pouzitelne.length === 0) return;
    if (splatnost < vystavenie) {
      toast.error(t("nf.splatnostSkor"));
      return;
    }
    /*
      Oprava nemá offline vetvu: mení sa doklad, ktorý už existuje na serveri,
      a odkladať takú zmenu do fronty by znamenalo prepisovať niečo, čo medzitým
      mohol zmeniť niekto iný.
    */
    if (upravuje) {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) {
        toast.error(t("nf.opravaBezPripojenia"));
        return;
      }
      await ulozUpravu();
      return;
    }
    const vstup = {
      company_id: firma.id,
      customer_id: odberatel.id,
      issue_date: vystavenie,
      due_date: splatnost,
      payment_method: uhrada,
      currency: mena,
      notes: poznamka.trim() || null,
      intro_note: poznamkaNad.trim() || null,
      type: druh,
      advance_invoice_id: zaloha?.id ?? null,
      advance_amount: zaloha ? zaloha.total : null,
      items: pouzitelne.map((x) => ({
        name: x.name.trim(),
        quantity: cislo(x.quantity),
        unit: x.unit || "ks",
        unit_price: cislo(x.unit_price),
        vat_rate: platca ? x.vat_rate : 0,
        product_id: x.product_id,
      })),
    };

    /**
     * Bez signálu sa faktúra odloží do telefónu a odošle sa sama, keď sa
     * pripojenie vráti. Keď má človek zapnuté vydávanie s číslom, dostane
     * rovno aj číslo z rezervovaných — vtedy sa dá doklad odovzdať na mieste.
     */
    async function odloz() {
      const { zaradFakturu } = await import("@/lib/mobile/faktury-fronta");
      const z = zaradFakturu(firma.id, vstup, {
        odberatel: odberatel!.name,
        spolu: sucty.spolu,
      });
      setOdlozena(z);
      setKrok("odlozena");
    }

    setUkladam(true);
    try {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) {
        /*
          Odložiť sa dá len bežná faktúra. Zálohová má vlastnú radu čísel a
          rezervované čísla sú z tej bežnej — odložená zálohová by si buď vzala
          cudzie číslo, alebo by ostala visieť bez neho.
        */
        if (druh === "proforma") {
          setUkladam(false);
          toast.error(t("nf.zalohovaBezPripojenia"));
          return;
        }
        await odloz();
        return;
      }
      const r = (await vystav({ data: vstup })) as any;
      setHotova(r);
      setKrok("hotovo");
    } catch (e: any) {
      // Signál mohol vypadnúť práve teraz — vtedy sa faktúra neztráca, ale
      // odloží. Ozajstnú chybu servera (chýbajúci odberateľ, limit plánu)
      // treba naopak povedať, nie ju zamiesť do fronty.
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) {
        await odloz();
      } else {
        toast.error(friendlyError(e, t("nf.chybaVystavenia")));
      }
    } finally {
      setUkladam(false);
    }
  }

  if (!podklady) return <Pracujem text={t("nf.nacitavamOdberatelov")} />;
  if (ukladam) return <Pracujem text={upravuje ? t("nf.ukladamZmeny") : t("nf.vystavujem")} />;

  if (krok === "hotovo" && hotova) {
    return <Vystavena faktura={hotova} onHotovo={onHotovo} />;
  }

  if (krok === "odlozena" && odlozena) {
    return <Odlozena faktura={odlozena} mena={mena} onHotovo={onHotovo} />;
  }

  if (krok === "odberatel") {
    return (
      <KrokOdberatel
        firma={firma}
        druh={druh}
        setDruh={setDruh}
        odberatelia={podklady.odberatelia}
        onSpat={onSpat}
        onVyber={vyberOdberatela}
        onPridany={(o) => {
          setPodklady({ ...podklady, odberatelia: [o, ...podklady.odberatelia] });
          vyberOdberatela(o);
        }}
      />
    );
  }

  if (krok === "polozky") {
    return (
      <KrokPolozky
        uprava={upravuje}
        odberatel={odberatel!}
        produkty={podklady.produkty}
        riadky={riadky}
        platca={platca}
        mena={mena}
        sucty={sucty}
        onSpat={() => (upravuje ? onSpat() : setKrok("odberatel"))}
        onPridajProdukt={pridajProdukt}
        onPridajVlastnu={() => setRiadky((r) => [...r, prazdnyRiadok(zakladnaSadzba)])}
        posledna={posledna}
        onZopakuj={zopakujPoslednu}
        onZmen={zmen}
        onZmaz={(key) => setRiadky((r) => r.filter((x) => x.key !== key))}
        onDalej={() => setKrok("suhrn")}
        pocetPouzitelnych={pouzitelne.length}
      />
    );
  }

  return (
    <KrokSuhrn
      uprava={upravuje}
      odberatel={odberatel!}
      mena={mena}
      platca={platca}
      sucty={sucty}
      pocetPoloziek={pouzitelne.length}
      vystavenie={vystavenie}
      setVystavenie={setVystavenie}
      splatnost={splatnost}
      setSplatnost={setSplatnost}
      uhrada={uhrada}
      setUhrada={setUhrada}
      druh={druh}
      firmaId={firma.id}
      zaloha={zaloha}
      setZaloha={setZaloha}
      poznamkaNad={poznamkaNad}
      setPoznamkaNad={setPoznamkaNad}
      poznamka={poznamka}
      setPoznamka={setPoznamka}
      maIban={podklady.firma.maIban}
      onSpat={() => setKrok("polozky")}
      onUloz={uloz}
    />
  );
}

/* ------------------------- Krok 1: odberateľ ------------------------- */

function KrokOdberatel({
  firma,
  druh,
  setDruh,
  odberatelia,
  onSpat,
  onVyber,
  onPridany,
}: {
  firma: { id: string; name: string };
  druh: "regular" | "proforma";
  setDruh: (v: "regular" | "proforma") => void;
  odberatelia: Odberatel[];
  onSpat: () => void;
  onVyber: (o: Odberatel) => void;
  onPridany: (o: Odberatel) => void;
}) {
  const { t } = usePreklad();
  const [hladanie, setHladanie] = useState("");
  const [novy, setNovy] = useState(false);

  const najdene = useMemo(() => {
    const q = hladanie.trim().toLowerCase();
    if (!q) return odberatelia;
    return odberatelia.filter((o) =>
      [o.name, o.ico, o.city].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [odberatelia, hladanie]);

  if (novy) {
    return (
      <NovyOdberatel
        companyId={firma.id}
        predvyplneneMeno={hladanie.trim()}
        onSpat={() => setNovy(false)}
        onPridany={onPridany}
      />
    );
  }

  return (
    <MobilObrazovka
      title={t("nf.komuFakturujete")}
      subtitle={druh === "proforma" ? t("nf.krokZalohova") : t("nf.krok", { n: 1 })}
      onBack={onSpat}
    >
      {/*
        Druh dokladu patrí na začiatok — mení celý doklad, nielen jeho text.
        Zálohová faktúra nie je daňový doklad a číslo dostane z vlastnej rady,
        takže sa to nedá prepnúť až na konci.
      */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            ["regular", t("nf.faktura")],
            ["proforma", t("nf.zalohova")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setDruh(id)}
            className={`rounded-2xl border py-3 text-[14px] transition active:scale-[0.98] ${
              druh === id
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border/70 bg-card"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {druh === "proforma" && (
        <p className="mb-4 rounded-xl bg-secondary px-3 py-2 text-[12px] leading-snug text-muted-foreground">
          {t("nf.zalohovaVysvetlenie")}
        </p>
      )}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={hladanie}
          onChange={(e) => setHladanie(e.target.value)}
          placeholder={t("nf.hladatOdberatela")}
          className="w-full rounded-2xl border border-border/70 bg-card py-3 pl-9 pr-3 text-[15px] shadow-[var(--shadow-card)]"
        />
      </div>

      <button
        onClick={() => setNovy(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left active:bg-primary/10"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <UserPlus className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[15px] font-medium text-primary">{t("nf.novyOdberatel")}</span>
      </button>

      {najdene.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {hladanie ? t("nf.nicSaNenaslo") : t("nf.ziadnyOdberatel")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
          {najdene.map((o, i) => (
            <button
              key={o.id}
              onClick={() => onVyber(o)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary ${
                i > 0 ? "border-t border-border/70" : ""
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-tight">
                  {o.name}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                  {[o.ico ? `IČO ${o.ico}` : null, o.city].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </MobilObrazovka>
  );
}

/* ------------------------- Nový odberateľ ------------------------- */

export function NovyOdberatel({
  companyId,
  predvyplneneMeno,
  onSpat,
  onPridany,
}: {
  companyId: string;
  predvyplneneMeno: string;
  onSpat: () => void;
  onPridany: (o: Odberatel) => void;
}) {
  const { t } = usePreklad();
  const lookup = useOperacia("firma-podla-ica");
  const [f, setF] = useState({
    name: predvyplneneMeno,
    ico: "",
    dic: "",
    ic_dph: "",
    street: "",
    city: "",
    zip: "",
    email: "",
  });
  const [hladam, setHladam] = useState(false);
  const [ukladam, setUkladam] = useState(false);

  /*
   * Doplnenie z registra podľa IČO — na telefóne je to rozdiel medzi jedným
   * poľom a ôsmimi. Beží samo, len čo je IČO celé.
   */
  const posledne = useRef("");
  useEffect(() => {
    const ico = f.ico.replace(/\s+/g, "");
    if (!/^\d{8}$/.test(ico) || posledne.current === ico) return;
    posledne.current = ico;
    setHladam(true);
    lookup({ data: { ico } })
      .then((r: any) => {
        if (r?.status !== "ok" || !r.data) return;
        const d = r.data;
        setF((p) => ({
          ...p,
          name: p.name || d.name || "",
          dic: p.dic || d.dic || "",
          ic_dph: p.ic_dph || d.ic_dph || "",
          street: p.street || d.street || "",
          city: p.city || d.city || "",
          zip: p.zip || d.zip || "",
        }));
        toast.success(t("nf.udajeDoplnene"));
      })
      .catch(() => {})
      .finally(() => setHladam(false));
    // eslint-disable-next-line
  }, [f.ico]);

  async function uloz() {
    if (!f.name.trim()) return toast.error(t("nf.zadajteNazov"));
    setUkladam(true);
    // Bez siete zápis vyhodí; nezachytené by to nechalo tlačidlo navždy
    // v stave „ukladám".
    const { data, error } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
        name: f.name.trim(),
        ico: f.ico.trim() || null,
        dic: f.dic.trim() || null,
        ic_dph: f.ic_dph.trim() || null,
        street: f.street.trim() || null,
        city: f.city.trim() || null,
        zip: f.zip.trim() || null,
        country: "SK",
        email: f.email.trim() || null,
      })
      .select(
        "id, name, email, ico, dic, ic_dph, street, city, zip, country, discount_percent, price_group_id",
      )
      .single()
      .then(
        (r) => r,
        (e) => ({ data: null, error: e as any }),
      );
    setUkladam(false);
    if (error || !data) return toast.error(friendlyError(error, t("nf.chybaOdberatela")));
    toast.success(t("nf.odberatelPridany"));
    onPridany(data as Odberatel);
  }

  return (
    <MobilObrazovka
      title={t("nf.novyOdberatel")}
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={uloz} disabled={ukladam || !f.name.trim()}>
          {ukladam ? t("nf.ukladam") : t("nf.ulozitPokracovat")}
        </HlavneTlacidlo>
      }
    >
      <div className="space-y-3">
        <Pole
          label={t("nf.ico")}
          value={f.ico}
          onChange={(v) => setF({ ...f, ico: v })}
          inputMode="numeric"
          hint={hladam ? t("nf.hladamVRegistri") : t("nf.podlaIco")}
        />
        <Pole label={t("nf.nazov")} value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <Pole label={t("nf.ulica")} value={f.street} onChange={(v) => setF({ ...f, street: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Pole label={t("nf.psc")} value={f.zip} onChange={(v) => setF({ ...f, zip: v })} />
          <Pole label={t("nf.mesto")} value={f.city} onChange={(v) => setF({ ...f, city: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Pole label={t("nf.dic")} value={f.dic} onChange={(v) => setF({ ...f, dic: v })} />
          <Pole label={t("nf.icDph")} value={f.ic_dph} onChange={(v) => setF({ ...f, ic_dph: v })} />
        </div>
        <Pole
          label={t("nf.emailPole")}
          value={f.email}
          onChange={(v) => setF({ ...f, email: v })}
          inputMode="email"
          hint={t("nf.email")}
        />
      </div>
    </MobilObrazovka>
  );
}

function Pole({
  label,
  value,
  onChange,
  hint,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  inputMode?: "numeric" | "email" | "decimal";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoCapitalize={inputMode ? "none" : "sentences"}
        autoCorrect="off"
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
      />
      {hint && <span className="mt-1 block text-[12px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/* ------------------------- Krok 2: položky ------------------------- */

function KrokPolozky({
  uprava,
  odberatel,
  produkty,
  riadky,
  platca,
  mena,
  sucty,
  onSpat,
  onPridajProdukt,
  onPridajVlastnu,
  onZmen,
  onZmaz,
  onDalej,
  pocetPouzitelnych,
  posledna,
  onZopakuj,
}: {
  odberatel: Odberatel;
  produkty: Produkt[];
  riadky: Riadok[];
  platca: boolean;
  mena: string;
  sucty: { zaklad: number; dph: number; spolu: number };
  onSpat: () => void;
  onPridajProdukt: (p: Produkt) => void;
  onPridajVlastnu: () => void;
  onZmen: (key: string, patch: Partial<Riadok>) => void;
  onZmaz: (key: string) => void;
  onDalej: () => void;
  pocetPouzitelnych: number;
  posledna: { invoice_number: string; issue_date: string } | null;
  onZopakuj: () => void;
  /** Keď sa opravuje už vystavená faktúra, kroky sa nečíslujú — je len jeden. */
  uprava?: { invoice_number: string };
}) {
  const { t } = usePreklad();
  const [cennikOtvoreny, setCennikOtvoreny] = useState(false);

  return (
    <>
      <MobilObrazovka
        title={t("nf.zaCoFakturujete")}
        subtitle={
          uprava
            ? `${t("nf.oprava", { cislo: uprava.invoice_number })} · ${odberatel.name}`
            : `${t("nf.krok", { n: 2 })} · ${odberatel.name}`
        }
        onBack={onSpat}
        footer={
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-[15px]">
              <span className="text-muted-foreground">{t("nf.spolu")}</span>
              <span className="text-[20px] font-semibold tabular-nums">
                {suma(sucty.spolu, mena)}
              </span>
            </div>
            <HlavneTlacidlo onClick={onDalej} disabled={pocetPouzitelnych === 0}>
              {pocetPouzitelnych === 0 ? t("nf.pridajtePolozku") : t("nf.dalej")}
            </HlavneTlacidlo>
          </div>
        }
      >
        <div className="space-y-3">
          {riadky.map((r) => (
            <RiadokPolozky
              key={r.key}
              riadok={r}
              platca={platca}
              mena={mena}
              jediny={riadky.length === 1}
              onZmen={(patch) => onZmen(r.key, patch)}
              onZmaz={() => onZmaz(r.key)}
            />
          ))}

          {/*
            Ďalšia faktúra pre toho istého odberateľa býva kópiou predošlej —
            prepisovať tie isté riadky na telefóne je to najotravnejšie.
          */}
          {posledna && (
            <button
              onClick={onZopakuj}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left active:bg-primary/10"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <RotateCcw className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-primary">
                  {t("nf.zopakovatPoslednu")}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {posledna.invoice_number} · {datumSk(posledna.issue_date)}
                </span>
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setCennikOtvoreny(true)}
              disabled={produkty.length === 0}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-3 text-[14px] font-medium shadow-[var(--shadow-card)] active:bg-secondary disabled:opacity-50"
            >
              <Package className="h-4 w-4" /> {t("nf.zCennika")}
            </button>
            <button
              onClick={onPridajVlastnu}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-3 text-[14px] font-medium shadow-[var(--shadow-card)] active:bg-secondary"
            >
              <Plus className="h-4 w-4" /> {t("nf.vlastna")}
            </button>
          </div>

          {platca && (
            <div className="rounded-2xl border border-border/70 bg-card p-4 text-[14px] shadow-[var(--shadow-card)]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("nf.zaklad")}</span>
                <span className="tabular-nums">{suma(sucty.zaklad, mena)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">{t("nf.dph")}</span>
                <span className="tabular-nums">{suma(sucty.dph, mena)}</span>
              </div>
            </div>
          )}
        </div>
      </MobilObrazovka>

      {cennikOtvoreny && (
        <VyberProduktu
          produkty={produkty}
          mena={mena}
          onZavri={() => setCennikOtvoreny(false)}
          onVyber={(p) => {
            onPridajProdukt(p);
            setCennikOtvoreny(false);
          }}
        />
      )}
    </>
  );
}

export function RiadokPolozky({
  riadok,
  platca,
  mena,
  jediny,
  onZmen,
  onZmaz,
}: {
  riadok: Riadok;
  platca: boolean;
  mena: string;
  jediny: boolean;
  onZmen: (patch: Partial<Riadok>) => void;
  onZmaz: () => void;
}) {
  const { t } = usePreklad();
  // Vlastný hook aj tu: odpoveď je zapamätaná, takže to nie je dotaz navyše.
  const krajina = useKrajinaDane();
  const zaklad = +(cislo(riadok.quantity) * cislo(riadok.unit_price)).toFixed(2);
  const celkom = +(zaklad * (1 + riadok.vat_rate / 100)).toFixed(2);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-2">
        <input
          value={riadok.name}
          onChange={(e) => onZmen({ name: e.target.value })}
          placeholder={t("nf.nazovPolozky")}
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
        />
        {!jediny && (
          <button
            onClick={onZmaz}
            aria-label={t("nf.odstranitPolozku")}
            className="mt-0.5 rounded-xl p-2.5 text-muted-foreground active:bg-secondary"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <div className={`mt-2 grid gap-2 ${platca ? "grid-cols-3" : "grid-cols-2"}`}>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted-foreground">{t("nf.mnozstvo")}</span>
          <input
            value={riadok.quantity}
            onChange={(e) => onZmen({ quantity: e.target.value })}
            inputMode="decimal"
            className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-[16px] tabular-nums"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted-foreground">
            Cena{platca ? " bez DPH" : ""}
          </span>
          <input
            value={riadok.unit_price}
            onChange={(e) => onZmen({ unit_price: e.target.value })}
            inputMode="decimal"
            placeholder="0,00"
            className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-[16px] tabular-nums"
          />
        </label>
        {platca && (
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted-foreground">{t("nf.dph")}</span>
            <select
              value={riadok.vat_rate}
              onChange={(e) => onZmen({ vat_rate: Number(e.target.value) })}
              className="w-full rounded-xl border border-input bg-background px-2 py-2.5 text-[16px]"
            >
              {sadzbyKrajiny(krajina).map((r) => (
                <option key={r} value={r}>
                  {r} %
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[12px] text-muted-foreground">
          {riadok.dovod ? riadok.dovod : `${riadok.unit || "ks"}`}
        </span>
        <span className="text-[15px] font-semibold tabular-nums">{suma(celkom, mena)}</span>
      </div>
    </div>
  );
}

function VyberProduktu({
  produkty,
  mena,
  onZavri,
  onVyber,
}: {
  produkty: Produkt[];
  mena: string;
  onZavri: () => void;
  onVyber: (p: Produkt) => void;
}) {
  const { t } = usePreklad();
  const [q, setQ] = useState("");
  const najdene = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? produkty.filter((p) => p.name.toLowerCase().includes(s)) : produkty;
  }, [produkty, q]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onZavri}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80dvh] overflow-hidden rounded-t-3xl bg-card"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <h2 className="flex-1 text-[16px] font-semibold">{t("nf.cennik")}</h2>
          <button
            onClick={onZavri}
            aria-label={t("nf.zavriet")}
            className="rounded-full p-2 active:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("nf.hladatPolozku")}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
        </div>
        <div className="max-h-[52dvh] overflow-y-auto pb-2">
          {najdene.map((p) => (
            <button
              key={p.id}
              onClick={() => onVyber(p)}
              className="flex w-full items-center gap-3 border-t border-border/70 px-4 py-3 text-left active:bg-secondary"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{p.name}</span>
                <span className="block text-[12px] text-muted-foreground">
                  {p.unit || "ks"} · {p.vat_rate} % DPH
                </span>
              </span>
              <span className="shrink-0 text-[15px] font-medium tabular-nums">
                {suma(Number(p.unit_price), mena)}
              </span>
            </button>
          ))}
          {najdene.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("nf.nicSaNenaslo")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Krok 3: súhrn ------------------------- */

function KrokSuhrn({
  uprava,
  odberatel,
  mena,
  platca,
  sucty,
  pocetPoloziek,
  vystavenie,
  setVystavenie,
  splatnost,
  setSplatnost,
  uhrada,
  setUhrada,
  poznamka,
  setPoznamka,
  poznamkaNad,
  setPoznamkaNad,
  druh,
  firmaId,
  zaloha,
  setZaloha,
  maIban,
  onSpat,
  onUloz,
}: {
  odberatel: Odberatel;
  mena: string;
  platca: boolean;
  sucty: { zaklad: number; dph: number; spolu: number };
  pocetPoloziek: number;
  vystavenie: string;
  setVystavenie: (v: string) => void;
  splatnost: string;
  setSplatnost: (v: string) => void;
  uhrada: "bank_transfer" | "cash" | "card";
  setUhrada: (v: "bank_transfer" | "cash" | "card") => void;
  poznamka: string;
  setPoznamka: (v: string) => void;
  poznamkaNad: string;
  setPoznamkaNad: (v: string) => void;
  druh: "regular" | "proforma";
  firmaId: string;
  zaloha: { id: string; invoice_number: string; total: number } | null;
  setZaloha: (v: { id: string; invoice_number: string; total: number } | null) => void;
  maIban: boolean;
  onSpat: () => void;
  onUloz: () => void;
  uprava?: { invoice_number: string };
}) {
  const { t } = usePreklad();
  const dni = Math.round(
    (new Date(`${splatnost}T00:00:00`).getTime() - new Date(`${vystavenie}T00:00:00`).getTime()) /
      86400000,
  );

  return (
    <MobilObrazovka
      title={druh === "proforma" ? t("nf.skontrolujteZalohovu") : t("nf.skontrolujte")}
      subtitle={
        uprava ? t("nf.fakturaCislo", { cislo: uprava.invoice_number }) : t("nf.krok", { n: 3 })
      }
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={onUloz}>
          {uprava
            ? t("nf.ulozitZmeny")
            : druh === "proforma"
              ? t("nf.vystavitZalohovu")
              : t("nf.vystavit")}
        </HlavneTlacidlo>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="text-[32px] font-semibold leading-none tabular-nums">
            {suma(sucty.spolu, mena)}
          </div>
          <div className="mt-2 text-[14px] text-muted-foreground">
            {odberatel.name} · {sPoctom(pocetPoloziek, POLOZKY)}
          </div>
          {platca && (
            <div className="mt-1 text-[12px] text-muted-foreground">
              základ {suma(sucty.zaklad, mena)} · DPH {suma(sucty.dph, mena)}
            </div>
          )}
          {zaloha && (
            /* Celková suma ostáva, mení sa len to, čo má zákazník doplatiť. */
            <div className="mt-2 border-t border-border/70 pt-2 text-[13px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Zúčtovaná záloha {zaloha.invoice_number}</span>
                <span>− {suma(zaloha.total, mena)}</span>
              </div>
              <div className="mt-1 flex justify-between font-semibold">
                <span>{t("nf.naUhradu")}</span>
                <span>{suma(+(sucty.spolu - zaloha.total).toFixed(2), mena)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
              Vystavenie
            </span>
            <input
              type="date"
              value={vystavenie}
              onChange={(e) => setVystavenie(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
              {t("nf.splatnost")}
            </span>
            <input
              type="date"
              value={splatnost}
              onChange={(e) => setSplatnost(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
            />
          </label>
        </div>

        {/* Splatnosť sa nastavuje takmer vždy na okrúhly počet dní. */}
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setSplatnost(oDni(vystavenie, d))}
              className={`flex-1 rounded-xl border py-2.5 text-[14px] ${
                dni === d
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border/70 bg-card"
              }`}
            >
              {d} dní
            </button>
          ))}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">{t("nf.sposobUhrady")}</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["bank_transfer", t("pd.prevodom")],
                ["cash", t("nf.hotovost")],
                ["card", t("pd.kartou")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setUhrada(id)}
                className={`rounded-2xl border py-3 text-[14px] transition active:scale-[0.98] ${
                  uhrada === id
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border/70 bg-card"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {uhrada === "bank_transfer" && !maIban && (
            <p className="mt-1.5 text-xs text-destructive">
              {t("nf.bezIbanu")}
            </p>
          )}
        </div>

        {druh === "regular" && !uprava && (
          <VyberZalohy
            firmaId={firmaId}
            odberatelId={odberatel.id}
            mena={mena}
            zaloha={zaloha}
            setZaloha={setZaloha}
          />
        )}

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
            {t("nf.poznamkaNad")}
          </span>
          <textarea
            value={poznamkaNad}
            onChange={(e) => setPoznamkaNad(e.target.value)}
            rows={2}
            placeholder={t("nf.priklad")}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
            {t("nf.poznamkaPod")}
          </span>
          <textarea
            value={poznamka}
            onChange={(e) => setPoznamka(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
        </label>
      </div>
    </MobilObrazovka>
  );
}

/* ------------------------- Zúčtovanie zálohy ------------------------- */

/**
 * Výber zálohovej faktúry, ktorá sa od tejto odpočíta.
 *
 * Ponúkajú sa len zálohové faktúry toho istého odberateľa, ktoré ešte neboli
 * zúčtované na inej faktúre — inak by sa tá istá záloha odpočítala dvakrát.
 * Číta sa cez `supabase`, teda pod RLS; server si to isté overuje znova.
 */
function VyberZalohy({
  firmaId,
  odberatelId,
  mena,
  zaloha,
  setZaloha,
}: {
  firmaId: string;
  odberatelId: string;
  mena: string;
  zaloha: { id: string; invoice_number: string; total: number } | null;
  setZaloha: (v: { id: string; invoice_number: string; total: number } | null) => void;
}) {
  const { t } = usePreklad();
  const [zoznam, setZoznam] = useState<
    { id: string; invoice_number: string; total: number; issue_date: string }[] | null
  >(null);
  const [otvorene, setOtvorene] = useState(false);

  useEffect(() => {
    let zrusene = false;
    (async () => {
      const [{ data: zalohy }, { data: uzPouzite }] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, total, issue_date")
          .eq("company_id", firmaId)
          .eq("customer_id", odberatelId)
          .eq("type", "proforma")
          .is("deleted_at", null)
          .order("issue_date", { ascending: false })
          .limit(20),
        supabase
          .from("invoices")
          .select("advance_invoice_id")
          .eq("company_id", firmaId)
          .not("advance_invoice_id", "is", null)
          .is("deleted_at", null),
      ]);
      if (zrusene) return;
      const pouzite = new Set(
        ((uzPouzite as any[]) ?? []).map((r) => r.advance_invoice_id as string),
      );
      setZoznam(
        ((zalohy as any[]) ?? [])
          .filter((z) => !pouzite.has(z.id))
          .map((z) => ({
            id: z.id,
            invoice_number: z.invoice_number,
            total: Number(z.total),
            issue_date: z.issue_date,
          })),
      );
    })();
    return () => {
      zrusene = true;
    };
  }, [firmaId, odberatelId]);

  if (zaloha) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="min-w-0">
          <div className="text-[14px] font-medium">Záloha {zaloha.invoice_number}</div>
          <div className="text-[13px] text-muted-foreground">
            odpočíta sa {suma(zaloha.total, mena)}
          </div>
        </div>
        <button
          onClick={() => setZaloha(null)}
          className="shrink-0 rounded-xl border border-border px-3 py-2 text-[13px]"
        >
          {t("nf.zrusit")}
        </button>
      </div>
    );
  }

  if (!otvorene) {
    /*
      Tlačidlo je tu vždy, aj keď odberateľ zálohu nemá. Keď sa skrývalo,
      človek nemal ako zistiť, že sa to v appke vôbec dá — hľadal funkciu,
      ktorá tam bola, len neviditeľná.
    */
    return (
      <button
        onClick={() => setOtvorene(true)}
        className="w-full rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-[14px] font-medium text-primary active:bg-primary/10"
      >
        {t("nf.pridatZalohovu")}
      </button>
    );
  }

  if (zoznam && zoznam.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="text-[14px] font-medium">{t("nf.ziadnaZaloha")}</div>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          {t("nf.ziadnaZalohaPopis", { zalohova: t("nf.zalohova") })}
        </p>
        <button
          onClick={() => setOtvorene(false)}
          className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-[13px]"
        >
          {t("nf.zavriet")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-3">
      <div className="px-1 text-[13px] text-muted-foreground">
        {zoznam === null ? t("nf.hladamZalohy") : t("nf.zalohy")}
      </div>
      {(zoznam ?? []).map((z) => (
        <button
          key={z.id}
          onClick={() => {
            setZaloha({ id: z.id, invoice_number: z.invoice_number, total: z.total });
            setOtvorene(false);
          }}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5 text-left active:bg-secondary"
        >
          <span className="min-w-0">
            <span className="block text-[14px] font-medium">{z.invoice_number}</span>
            <span className="block text-[12px] text-muted-foreground">{datumSk(z.issue_date)}</span>
          </span>
          <span className="shrink-0 text-[14px] tabular-nums">{suma(z.total, mena)}</span>
        </button>
      ))}
      <button
        onClick={() => setOtvorene(false)}
        className="w-full py-2 text-center text-[13px] text-muted-foreground"
      >
        {t("nf.zavriet")}
      </button>
    </div>
  );
}

/* ------------------------- Hotovo ------------------------- */

/**
 * Faktúra vystavená bez signálu.
 *
 * Dva veľmi rôzne konce, a človek musí na prvý pohľad vidieť, ktorý má:
 * s rezervovaným číslom je doklad hotový a číslo sa dá odovzdať na mieste,
 * bez neho je to zatiaľ len odložený zápis. Zamlčať ten rozdiel by znamenalo,
 * že niekto nadiktuje zákazníkovi číslo, ktoré ešte neexistuje.
 */
function Odlozena({
  faktura,
  mena,
  onHotovo,
}: {
  faktura: OdlozenaFaktura;
  mena: string;
  onHotovo: () => void;
}) {
  const { t } = usePreklad();
  return (
    <MobilObrazovka title={t("nf.bezPripojeniaNadpis")}>
      <div className="space-y-4 pt-2 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary">
          <CloudOff className="h-8 w-8 text-muted-foreground" />
        </div>

        {faktura.cislo ? (
          <>
            <div>
              <p className="text-[13px] text-muted-foreground">{t("nf.maCislo")}</p>
              <p className="mt-1 text-[30px] font-semibold leading-none tabular-nums">
                {faktura.cislo}
              </p>
            </div>
            <p className="text-[14px] leading-snug text-muted-foreground">
              {t("nf.cisloJeVase")}
            </p>
          </>
        ) : (
          <>
            <p className="text-[17px] font-semibold">{t("nf.odlozena")}</p>
            <p className="text-[14px] leading-snug text-muted-foreground">
              {t("nf.odlozenaPopis")}
            </p>
          </>
        )}

        <div className="rounded-2xl border border-border/70 bg-card p-4 text-left">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-muted-foreground">{t("nf.odberatel")}</span>
            <span className="text-[15px] font-medium">{faktura.odberatel}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[14px] text-muted-foreground">{t("nf.spolu")}</span>
            <span className="text-[17px] font-semibold tabular-nums">
              {suma(faktura.spolu, mena)}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <HlavneTlacidlo onClick={onHotovo}>{t("nf.hotovo")}</HlavneTlacidlo>
      </div>
    </MobilObrazovka>
  );
}

function Vystavena({
  faktura,
  onHotovo,
}: {
  faktura: {
    id: string;
    invoice_number: string;
    total: number;
    currency: string;
    customer_email: string | null;
  };
  onHotovo: () => void;
}) {
  const { t } = usePreklad();
  const pdfFn = useOperacia("faktura-pdf");
  const mailFn = useOperacia("faktura-email");
  const [busy, setBusy] = useState<"pdf" | "mail" | "zdielam" | null>(null);
  const [odoslane, setOdoslane] = useState(false);

  async function otvorPdf() {
    setBusy("pdf");
    try {
      await otvorPdfFaktury(() => pdfFn({ data: { invoiceId: faktura.id } }) as any);
    } catch (e: any) {
      toast.error(e?.message ?? t("nf.chybaPdf"));
    } finally {
      setBusy(null);
    }
  }

  async function zdielaj() {
    setBusy("zdielam");
    try {
      await zdielajPdfFaktury(
        () => pdfFn({ data: { invoiceId: faktura.id } }) as any,
        faktura.invoice_number,
        `Faktúra ${faktura.invoice_number} na ${suma(faktura.total, faktura.currency)}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? t("nf.chybaZdielania"));
    } finally {
      setBusy(null);
    }
  }

  async function posli() {
    if (!faktura.customer_email) return;
    setBusy("mail");
    try {
      await mailFn({
        data: { invoiceId: faktura.id, recipient_email: faktura.customer_email },
      });
      setOdoslane(true);
      toast.success(`Odoslané na ${faktura.customer_email}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Odoslanie zlyhalo.");
    } finally {
      setBusy(null);
    }
  }

  if (busy === "mail") return <Pracujem text={t("nf.odosielam")} />;
  if (busy === "pdf" || busy === "zdielam") return <Pracujem text={t("nf.pripravujemPdf")} />;

  return (
    <MobilObrazovka
      title={t("nf.vystavena")}
      footer={<HlavneTlacidlo onClick={onHotovo}>{t("nf.hotovo")}</HlavneTlacidlo>}
    >
      <div className="space-y-4">
        <div className="grid place-items-center rounded-2xl border border-border/70 bg-card px-4 py-8 text-center shadow-[var(--shadow-card)]">
          <CheckCircle2 className="mb-3 h-12 w-12 text-primary" />
          <div className="text-[15px] text-muted-foreground">{faktura.invoice_number}</div>
          <div className="mt-1 text-[32px] font-semibold leading-none tabular-nums">
            {suma(faktura.total, faktura.currency)}
          </div>
        </div>

        <div className="space-y-2">
          {faktura.customer_email && (
            <VelkeTlacidlo
              icon={odoslane ? Check : Mail}
              label={odoslane ? t("nf.odoslane") : t("nf.poslatEmailom")}
              hint={faktura.customer_email}
              variant={odoslane ? "default" : "primary"}
              disabled={odoslane}
              onClick={posli}
            />
          )}
          <VelkeTlacidlo
            icon={Share2}
            label={t("nf.zdielat")}
            hint={t("nf.zdielatPopis")}
            onClick={zdielaj}
          />
          <VelkeTlacidlo
            icon={ExternalLink}
            label={t("nf.otvoritPdf")}
            hint={t("nf.naPrezretie")}
            onClick={otvorPdf}
          />
        </div>

        {!faktura.customer_email && (
          <p className="text-xs text-muted-foreground">
            {t("nf.bezEmailu")}
          </p>
        )}
      </div>
    </MobilObrazovka>
  );
}
