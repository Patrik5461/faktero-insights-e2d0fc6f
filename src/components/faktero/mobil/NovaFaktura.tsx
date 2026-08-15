import { useEffect, useMemo, useRef, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import {
  Building2,
  Check,
  CheckCircle2,
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
import { SK_VAT_RATES, DEFAULT_VAT_RATE } from "@/lib/faktero/vat-rates";
import { friendlyError } from "@/lib/faktero/plan-error";
import { POLOZKY, sPoctom } from "@/lib/faktero/mnozne";
import { HlavneTlacidlo, MobilObrazovka, Pracujem, VelkeTlacidlo } from "./MobilChrome";
import { otvorPdfFaktury, zdielajPdfFaktury } from "./pdf-faktury";

/**
 * Vystavenie faktúry v telefóne.
 *
 * Webový formulár má tri desiatky polí — na malej obrazovke sa v ňom nedá
 * pracovať. Tu sú tri kroky a v každom jediná otázka: komu, za čo, kedy
 * splatné. Zvyšok sa dopĺňa sám z firmy a z cenníka; keď treba viac, faktúra
 * sa doupraví na webe.
 */

type Odberatel = {
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

type Riadok = {
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

type Krok = "odberatel" | "polozky" | "suhrn" | "hotovo";

/** „12,50" aj „12.50" — na telefóne sa píše desatinná čiarka. */
function cislo(v: string): number {
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function suma(n: number, mena = "EUR"): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: mena }).format(n);
}

/** „2026-08-11" → „11. 8. 2026" — ISO tvar nikto nečíta ako dátum. */
function datumSk(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : v;
}

function dnes(): string {
  return new Date().toISOString().slice(0, 10);
}

function oDni(od: string, dni: number): string {
  const d = new Date(`${od}T00:00:00`);
  d.setDate(d.getDate() + dni);
  return d.toISOString().slice(0, 10);
}

function prazdnyRiadok(sadzba: number): Riadok {
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
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  /** Po vystavení vedieme človeka do zoznamu — nech vidí, že faktúra existuje. */
  onHotovo: () => void;
}) {
  const nacitajPodklady = useOperacia("faktura-podklady");
  const nacitajCennik = useOperacia("cennik-kontext");
  const nacitajPoslednu = useOperacia("faktura-posledna");
  const vystav = useOperacia("faktura-vystav");

  const [podklady, setPodklady] = useState<Podkladove | null>(null);
  const [krok, setKrok] = useState<Krok>("odberatel");
  const [odberatel, setOdberatel] = useState<Odberatel | null>(null);
  const [cennik, setCennik] = useState<Podklady>(PRAZDNE_PODKLADY);
  const [riadky, setRiadky] = useState<Riadok[]>([]);
  const [vystavenie, setVystavenie] = useState(dnes());
  const [splatnost, setSplatnost] = useState(oDni(dnes(), 14));
  const [uhrada, setUhrada] = useState<"bank_transfer" | "cash" | "card">("bank_transfer");
  const [poznamka, setPoznamka] = useState("");
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

  const platca = podklady?.firma.platcaDph ?? true;
  const mena = podklady?.firma.mena ?? "EUR";
  const zakladnaSadzba = platca ? DEFAULT_VAT_RATE : 0;

  useEffect(() => {
    (async () => {
      try {
        const p = (await nacitajPodklady({ data: { company_id: firma.id } })) as Podkladove;
        setPodklady(p);
      } catch (e: any) {
        toast.error(e?.message ?? "Podklady sa nepodarilo načítať.");
        onSpat();
      }
    })();
    // eslint-disable-next-line
  }, [firma.id]);

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

  async function uloz() {
    if (!odberatel || pouzitelne.length === 0) return;
    if (splatnost < vystavenie) {
      toast.error("Splatnosť nemôže byť skôr ako vystavenie.");
      return;
    }
    setUkladam(true);
    try {
      const r = (await vystav({
        data: {
          company_id: firma.id,
          customer_id: odberatel.id,
          issue_date: vystavenie,
          due_date: splatnost,
          payment_method: uhrada,
          currency: mena,
          notes: poznamka.trim() || null,
          items: pouzitelne.map((x) => ({
            name: x.name.trim(),
            quantity: cislo(x.quantity),
            unit: x.unit || "ks",
            unit_price: cislo(x.unit_price),
            vat_rate: platca ? x.vat_rate : 0,
            product_id: x.product_id,
          })),
        },
      })) as any;
      setHotova(r);
      setKrok("hotovo");
    } catch (e: any) {
      // Faktúra sa bez signálu vystaviť nedá a je to zámer: číslo prideľuje
      // server, aby dvaja ľudia nedostali to isté. Nech to appka povie rovno,
      // namiesto všeobecného „nepodarilo sa".
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) {
        toast.error(
          "Bez pripojenia sa faktúra vystaviť nedá — číslo jej prideľuje server. Rozpísané údaje tu ostanú.",
          { duration: 7000 },
        );
      } else {
        toast.error(friendlyError(e, "Faktúru sa nepodarilo vystaviť."));
      }
    } finally {
      setUkladam(false);
    }
  }

  if (!podklady) return <Pracujem text="Načítavam odberateľov…" />;
  if (ukladam) return <Pracujem text="Vystavujem faktúru…" />;

  if (krok === "hotovo" && hotova) {
    return <Vystavena faktura={hotova} onHotovo={onHotovo} />;
  }

  if (krok === "odberatel") {
    return (
      <KrokOdberatel
        firma={firma}
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
        odberatel={odberatel!}
        produkty={podklady.produkty}
        riadky={riadky}
        platca={platca}
        mena={mena}
        sucty={sucty}
        onSpat={() => setKrok("odberatel")}
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
  odberatelia,
  onSpat,
  onVyber,
  onPridany,
}: {
  firma: { id: string; name: string };
  odberatelia: Odberatel[];
  onSpat: () => void;
  onVyber: (o: Odberatel) => void;
  onPridany: (o: Odberatel) => void;
}) {
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
    <MobilObrazovka title="Komu fakturujete?" subtitle="Krok 1 z 3" onBack={onSpat}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={hladanie}
          onChange={(e) => setHladanie(e.target.value)}
          placeholder="Hľadať odberateľa"
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
        <span className="text-[15px] font-medium text-primary">Nový odberateľ</span>
      </button>

      {najdene.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {hladanie ? "Nič sa nenašlo." : "Zatiaľ nemáte žiadneho odberateľa."}
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

function NovyOdberatel({
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
        toast.success("Údaje doplnené z registra");
      })
      .catch(() => {})
      .finally(() => setHladam(false));
    // eslint-disable-next-line
  }, [f.ico]);

  async function uloz() {
    if (!f.name.trim()) return toast.error("Zadajte názov odberateľa.");
    setUkladam(true);
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
      .single();
    setUkladam(false);
    if (error || !data)
      return toast.error(friendlyError(error, "Odberateľa sa nepodarilo uložiť."));
    toast.success("Odberateľ pridaný");
    onPridany(data as Odberatel);
  }

  return (
    <MobilObrazovka
      title="Nový odberateľ"
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={uloz} disabled={ukladam || !f.name.trim()}>
          {ukladam ? "Ukladám…" : "Uložiť a pokračovať"}
        </HlavneTlacidlo>
      }
    >
      <div className="space-y-3">
        <Pole
          label="IČO"
          value={f.ico}
          onChange={(v) => setF({ ...f, ico: v })}
          inputMode="numeric"
          hint={hladam ? "Hľadám v registri…" : "Podľa IČO sa doplní názov aj adresa"}
        />
        <Pole label="Názov" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <Pole label="Ulica" value={f.street} onChange={(v) => setF({ ...f, street: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Pole label="PSČ" value={f.zip} onChange={(v) => setF({ ...f, zip: v })} />
          <Pole label="Mesto" value={f.city} onChange={(v) => setF({ ...f, city: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Pole label="DIČ" value={f.dic} onChange={(v) => setF({ ...f, dic: v })} />
          <Pole label="IČ DPH" value={f.ic_dph} onChange={(v) => setF({ ...f, ic_dph: v })} />
        </div>
        <Pole
          label="E-mail"
          value={f.email}
          onChange={(v) => setF({ ...f, email: v })}
          inputMode="email"
          hint="Na tento e-mail sa dá faktúra hneď odoslať"
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
}) {
  const [cennikOtvoreny, setCennikOtvoreny] = useState(false);

  return (
    <>
      <MobilObrazovka
        title="Za čo fakturujete?"
        subtitle={`Krok 2 z 3 · ${odberatel.name}`}
        onBack={onSpat}
        footer={
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-[15px]">
              <span className="text-muted-foreground">Spolu</span>
              <span className="text-[20px] font-semibold tabular-nums">
                {suma(sucty.spolu, mena)}
              </span>
            </div>
            <HlavneTlacidlo onClick={onDalej} disabled={pocetPouzitelnych === 0}>
              {pocetPouzitelnych === 0 ? "Pridajte položku" : "Ďalej"}
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
                  Zopakovať poslednú faktúru
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
              <Package className="h-4 w-4" /> Z cenníka
            </button>
            <button
              onClick={onPridajVlastnu}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-3 text-[14px] font-medium shadow-[var(--shadow-card)] active:bg-secondary"
            >
              <Plus className="h-4 w-4" /> Vlastná
            </button>
          </div>

          {platca && (
            <div className="rounded-2xl border border-border/70 bg-card p-4 text-[14px] shadow-[var(--shadow-card)]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Základ</span>
                <span className="tabular-nums">{suma(sucty.zaklad, mena)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">DPH</span>
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

function RiadokPolozky({
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
  const zaklad = +(cislo(riadok.quantity) * cislo(riadok.unit_price)).toFixed(2);
  const celkom = +(zaklad * (1 + riadok.vat_rate / 100)).toFixed(2);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-2">
        <input
          value={riadok.name}
          onChange={(e) => onZmen({ name: e.target.value })}
          placeholder="Názov položky"
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
        />
        {!jediny && (
          <button
            onClick={onZmaz}
            aria-label="Odstrániť položku"
            className="mt-0.5 rounded-xl p-2.5 text-muted-foreground active:bg-secondary"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <div className={`mt-2 grid gap-2 ${platca ? "grid-cols-3" : "grid-cols-2"}`}>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted-foreground">Množstvo</span>
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
            <span className="mb-1 block text-[12px] text-muted-foreground">DPH</span>
            <select
              value={riadok.vat_rate}
              onChange={(e) => onZmen({ vat_rate: Number(e.target.value) })}
              className="w-full rounded-xl border border-input bg-background px-2 py-2.5 text-[16px]"
            >
              {SK_VAT_RATES.map((r) => (
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
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <h2 className="flex-1 text-[16px] font-semibold">Cenník</h2>
          <button
            onClick={onZavri}
            aria-label="Zavrieť"
            className="rounded-full p-2 active:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hľadať položku"
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
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nič sa nenašlo.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Krok 3: súhrn ------------------------- */

function KrokSuhrn({
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
  maIban: boolean;
  onSpat: () => void;
  onUloz: () => void;
}) {
  const dni = Math.round(
    (new Date(`${splatnost}T00:00:00`).getTime() - new Date(`${vystavenie}T00:00:00`).getTime()) /
      86400000,
  );

  return (
    <MobilObrazovka
      title="Skontrolujte faktúru"
      subtitle="Krok 3 z 3"
      onBack={onSpat}
      footer={<HlavneTlacidlo onClick={onUloz}>Vystaviť faktúru</HlavneTlacidlo>}
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
              Splatnosť
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
          <div className="mb-2 text-sm font-medium">Spôsob úhrady</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["bank_transfer", "Prevodom"],
                ["cash", "Hotovosť"],
                ["card", "Kartou"],
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
              Firma nemá vyplnený IBAN — na faktúre nebude kam zaplatiť. Doplňte ho na webe v
              nastaveniach firmy.
            </p>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
            Poznámka na faktúre
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

/* ------------------------- Hotovo ------------------------- */

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
  const pdfFn = useOperacia("faktura-pdf");
  const mailFn = useOperacia("faktura-email");
  const [busy, setBusy] = useState<"pdf" | "mail" | "zdielam" | null>(null);
  const [odoslane, setOdoslane] = useState(false);

  async function otvorPdf() {
    setBusy("pdf");
    try {
      await otvorPdfFaktury(() => pdfFn({ data: { invoiceId: faktura.id } }) as any);
    } catch (e: any) {
      toast.error(e?.message ?? "PDF sa nepodarilo pripraviť.");
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
      toast.error(e?.message ?? "Zdieľanie zlyhalo.");
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

  if (busy === "mail") return <Pracujem text="Odosielam faktúru…" />;
  if (busy === "pdf" || busy === "zdielam") return <Pracujem text="Pripravujem PDF…" />;

  return (
    <MobilObrazovka
      title="Faktúra vystavená"
      footer={<HlavneTlacidlo onClick={onHotovo}>Hotovo</HlavneTlacidlo>}
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
              label={odoslane ? "Odoslané" : "Poslať e-mailom"}
              hint={faktura.customer_email}
              variant={odoslane ? "default" : "primary"}
              disabled={odoslane}
              onClick={posli}
            />
          )}
          <VelkeTlacidlo
            icon={Share2}
            label="Zdieľať faktúru"
            hint="Pošlite ju cez WhatsApp, Messenger alebo uložte do súborov"
            onClick={zdielaj}
          />
          <VelkeTlacidlo
            icon={ExternalLink}
            label="Otvoriť PDF"
            hint="Faktúra na prezretie"
            onClick={otvorPdf}
          />
        </div>

        {!faktura.customer_email && (
          <p className="text-xs text-muted-foreground">
            Odberateľ nemá e-mail, tak sa faktúra nedá odoslať. Doplňte ho v karte odberateľa.
          </p>
        )}
      </div>
    </MobilObrazovka>
  );
}
