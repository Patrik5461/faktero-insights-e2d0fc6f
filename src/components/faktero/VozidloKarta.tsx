import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, ScanText, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";
import { potvrd } from "@/lib/potvrdenie";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { precitajTechnickyPreukazFn } from "@/lib/faktero/vozovy-park.functions";
import {
  DRUHY_DOKUMENTOV,
  KATEGORIE_VOZIDLA,
  S_FINANCOVANIM,
  VLASTNICTVO,
  nazovDruhu,
  podliehaDmv,
  terminyVozidla,
  type PrecitanyPreukaz,
  type Termin,
} from "@/lib/faktero/vozovy-park";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
/** Štítok termínu — prepadnutý červený, blížiaci sa oranžový, ostatné sivé. */
export function StitokTerminu({ t: termin }: { t: Termin }) {
  const { t } = useT();
  const cls =
    termin.stav === "prepadnute"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
      : termin.stav === "coskoro"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
        : "bg-secondary text-muted-foreground";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {t(termin.nazov)}{" "}
      {termin.stav === "prepadnute"
        ? // „prepadlo“ sedelo len na niektoré termíny („STK prepadlo“ je zle) — platnosť drží rod.
          t("platnosť skončila {datum}", { datum: datumNaDoklade(termin.datum) })
        : t("do {datum}", { datum: datumNaDoklade(termin.datum) })}
    </span>
  );
}

/** Polia formulára — všetko ako text, na čísla a null sa prevedie pri uložení. */
type Formular = Record<string, string | boolean>;

const TEXTOVE = [
  "name",
  "license_plate",
  "vin",
  "znacka",
  "model",
  "kategoria",
  "farba",
  "fuel_type",
  "vlastnictvo",
  "vlastnik_nazov",
  "vlastnik_ico",
  "drzitel_nazov",
  "financing_contract_id",
  "pouzitie",
  "odpocet_dph",
  "vodic",
  "pzp_poistovna",
  "pzp_cislo",
  "havarijne_poistovna",
  "havarijne_cislo",
  "poznamka",
] as const;
const DATUMOVE = [
  "datum_prvej_evidencie",
  "datum_obstarania",
  "stk_do",
  "ek_do",
  "pzp_do",
  "havarijne_do",
  "dialnicna_znamka_do",
  "servis_datum",
  "vyradene_dna",
] as const;
const CISELNE = [
  "rok_vyroby",
  "objem_cm3",
  "vykon_kw",
  "celkova_hmotnost_kg",
  "pocet_miest",
  "obstaravacia_cena",
  "servis_km",
  "consumption_l_100km",
] as const;
const CELE = new Set([
  "rok_vyroby",
  "objem_cm3",
  "celkova_hmotnost_kg",
  "pocet_miest",
  "servis_km",
]);

function zRiadku(v: any): Formular {
  const f: Formular = { active: v?.active !== false, dmv: !!v?.dmv };
  for (const k of [...TEXTOVE, ...DATUMOVE, ...CISELNE]) f[k] = v?.[k] == null ? "" : String(v[k]);
  return f;
}

function naRiadok(f: Formular) {
  const r: Record<string, unknown> = { active: !!f.active, dmv: !!f.dmv };
  for (const k of [...TEXTOVE, ...DATUMOVE]) {
    const s = String(f[k] ?? "").trim();
    r[k] = s || null;
  }
  for (const k of CISELNE) {
    const s = String(f[k] ?? "")
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    const n = s ? Number(s) : null;
    r[k] = n === null || !Number.isFinite(n) ? null : CELE.has(k) ? Math.round(n) : n;
  }
  if (typeof r.license_plate === "string") r.license_plate = r.license_plate.toUpperCase();
  if (typeof r.vin === "string") r.vin = r.vin.replace(/\s/g, "").toUpperCase();
  return r;
}

type Dokument = {
  id?: string;
  druh: string;
  nazov: string;
  file_path: string;
  file_mime: string | null;
  file_size: number | null;
  platne_do: string | null;
  created_at?: string;
};

const MAX_SUBOR = 20 * 1024 * 1024;
const vstup = "mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

function Pole({
  label,
  children,
  siroke,
}: {
  label: string;
  children: ReactNode;
  siroke?: boolean;
}) {
  const { t } = useT();
  return (
    <label className={`block min-w-0 ${siroke ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{t(label)}</span>
      {children}
    </label>
  );
}

function Sekcia({
  nadpis,
  popis,
  children,
}: {
  nadpis: string;
  popis?: string;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{t(nadpis)}</h2>
      {popis && <p className="mt-0.5 text-xs text-muted-foreground">{t(popis)}</p>}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * Karta vozidla vo vozovom parku — nové (`id` null) aj existujúce.
 * Ukladá do tej istej tabuľky `vehicles`, ktorú používa Kniha jázd.
 */
export function VozidloKarta({ id }: { id: string | null }) {
  const { t } = useT();
  const navigate = useNavigate();
  const precitaj = useServerFn(precitajTechnickyPreukazFn);
  const cid = typeof window !== "undefined" ? getActiveCompanyId() : null;
  const [f, setF] = useState<Formular | null>(id ? null : zRiadku({ fuel_type: "diesel" }));
  const [zmluvy, setZmluvy] = useState<{ id: string; nazov: string }[]>([]);
  const [dokumenty, setDokumenty] = useState<Dokument[]>([]);
  const [druhNahratia, setDruhNahratia] = useState("tp1");
  const [platneDo, setPlatneDo] = useState("");
  const [nahravam, setNahravam] = useState(false);
  const [citam, setCitam] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [doplnene, setDoplnene] = useState<Set<string>>(new Set());
  const subor = useRef<HTMLInputElement>(null);
  const dnes = dnesBratislava();

  async function nacitaj() {
    if (!cid) return;
    const [{ data: z }, v, d] = await Promise.all([
      supabase
        .from("financing_contracts")
        .select("id, name, provider_name, contract_number, kind")
        .eq("company_id", cid)
        .in("kind", ["leasing", "uver"] as any)
        .order("name"),
      id
        ? supabase.from("vehicles").select("*").eq("id", id).eq("company_id", cid).maybeSingle()
        : null,
      id
        ? supabase
            .from("vehicle_documents")
            .select("*")
            .eq("vehicle_id", id)
            .order("created_at", { ascending: false })
        : null,
    ]);
    setZmluvy(
      (z ?? []).map((x: any) => ({
        id: x.id,
        nazov: [x.name, x.provider_name, x.contract_number].filter(Boolean).join(" · "),
      })),
    );
    if (id) {
      if (!v?.data) {
        toast.error(t("Vozidlo sa nenašlo."));
        navigate({ to: "/vozovy-park" });
        return;
      }
      setF(zRiadku(v.data));
      setDokumenty((d?.data ?? []) as Dokument[]);
    }
  }
  useEffect(() => {
    void nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!f) return <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>;
  const set = (k: string, h: string | boolean) => setF((p) => (p ? { ...p, [k]: h } : p));
  const txt = (k: string) => String(f[k] ?? "");
  const oznacene = (k: string) => (doplnene.has(k) ? "ring-2 ring-primary/40" : "");
  const input = (k: string, typ = "text", extra: Record<string, unknown> = {}) => (
    <input
      type={typ}
      value={txt(k)}
      onChange={(e) => set(k, e.target.value)}
      className={`${vstup} ${oznacene(k)}`}
      {...extra}
    />
  );

  /** Doplní z preukazu len prázdne polia — čo človek vyplnil, sa neprepíše. */
  function pouziPreukaz(p: PrecitanyPreukaz) {
    const doplnit = (stare: Formular) => {
      const n = { ...stare };
      const nove = new Set<string>();
      for (const [k, h] of Object.entries(p)) {
        if (h === null || h === undefined) continue;
        if (String(n[k] ?? "").trim()) continue;
        n[k] = String(h);
        nove.add(k);
      }
      if (!String(n.name ?? "").trim() && (p.znacka || p.model)) {
        n.name = [p.znacka, p.model].filter(Boolean).join(" ");
        nove.add("name");
      }
      if (p.kategoria && podliehaDmv(p.kategoria) && !stare.dmv) n.dmv = true;
      return { n, nove };
    };
    // Počet na hlášku sa počíta hneď — updater stavu beží až pri ďalšom vykreslení.
    const { nove } = doplnit(f!);
    setF((stare) => (stare ? doplnit(stare).n : stare));
    setDoplnene(nove);
    if (nove.size)
      toast.success(
        t("Z preukazu sa doplnilo polí: {n}. Skontrolujte ich a uložte.", { n: nove.size }),
      );
    else toast.info(t("Z preukazu sa nedoplnilo nič nové — vyplnené polia sa neprepisujú."));
  }

  async function citajDokument(cesta: string) {
    if (!cid) return;
    setCitam(cesta);
    try {
      pouziPreukaz(await precitaj({ data: { company_id: cid, file_path: cesta } }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Preukaz sa nepodarilo prečítať."));
    } finally {
      setCitam(null);
    }
  }

  async function nahraj(file: File) {
    if (!cid) return;
    if (file.size > MAX_SUBOR) return toast.error(t("Súbor je väčší ako 20 MB."));
    setNahravam(true);
    try {
      const pripona = (file.name.split(".").pop() || "pdf").toLowerCase().slice(0, 5);
      const cesta = `${cid}/${id ?? "nove"}/${crypto.randomUUID()}.${pripona}`;
      const { error } = await supabase.storage
        .from("vehicle-docs")
        .upload(cesta, file, { contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      const dok: Dokument = {
        druh: druhNahratia,
        nazov: file.name,
        file_path: cesta,
        file_mime: file.type || null,
        file_size: file.size,
        platne_do: platneDo || null,
      };
      if (id) {
        const { data, error: e2 } = await supabase
          .from("vehicle_documents")
          .insert({ ...dok, company_id: cid, vehicle_id: id })
          .select("*")
          .single();
        if (e2) throw new Error(e2.message);
        setDokumenty((d) => [data as Dokument, ...d]);
      } else {
        // Nové vozidlo ešte nemá id — dokument sa zapíše po uložení.
        setDokumenty((d) => [dok, ...d]);
      }
      setPlatneDo("");
      if (druhNahratia === "tp1" || druhNahratia === "tp2") await citajDokument(cesta);
      else toast.success(t("Dokument je nahratý."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nahratie zlyhalo."));
    } finally {
      setNahravam(false);
      if (subor.current) subor.current.value = "";
    }
  }

  async function otvor(d: Dokument) {
    const { data } = await supabase.storage.from("vehicle-docs").createSignedUrl(d.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error(t("Dokument sa nepodarilo otvoriť."));
  }

  async function zmazDokument(d: Dokument) {
    if (
      !(await potvrd(t("Zmazať dokument {nazov}?", { nazov: d.nazov }), { potvrdit: t("Zmazať") }))
    )
      return;
    if (d.id) {
      const { error } = await supabase.from("vehicle_documents").delete().eq("id", d.id);
      if (error) return toast.error(error.message);
    }
    await supabase.storage.from("vehicle-docs").remove([d.file_path]);
    setDokumenty((x) => x.filter((y) => y.file_path !== d.file_path));
  }

  async function uloz() {
    if (!cid || !f) return;
    if (!txt("name").trim()) return toast.error(t("Vyplňte názov vozidla."));
    setUkladam(true);
    try {
      const riadok = naRiadok(f);
      if (!f.active && !riadok.vyradene_dna) riadok.vyradene_dna = dnes;
      if (f.active) riadok.vyradene_dna = null;
      if (!S_FINANCOVANIM.has(String(riadok.vlastnictvo ?? "")))
        riadok.financing_contract_id = null;
      if (id) {
        const { data, error } = await supabase
          .from("vehicles")
          .update(riadok as any)
          .eq("id", id)
          .select("id");
        if (error) throw new Error(error.message);
        // Bez práva zápisu databáza nič nezmení a chybu nehlási — vráti prázdno.
        if (!data?.length)
          throw new Error(t("Vozidlo smie upravovať len majiteľ alebo správca firmy."));
        toast.success(t("Vozidlo je uložené."));
        setDoplnene(new Set());
      } else {
        const { data, error } = await supabase
          .from("vehicles")
          .insert({ ...(riadok as any), company_id: cid, initial_odometer: 0 })
          .select("id")
          .single();
        if (error) {
          throw new Error(
            error.code === "42501" || /row-level security/i.test(error.message)
              ? t("Vozidlo smie pridať len majiteľ alebo správca firmy.")
              : error.message,
          );
        }
        if (dokumenty.length) {
          const { error: e2 } = await supabase
            .from("vehicle_documents")
            .insert(dokumenty.map((d) => ({ ...d, company_id: cid, vehicle_id: data.id })));
          if (e2)
            toast.error(t("Vozidlo je uložené, dokumenty nie: {chyba}", { chyba: e2.message }));
        }
        toast.success(t("Vozidlo je pridané."));
        navigate({ to: "/vozovy-park/$id", params: { id: data.id } });
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("Uloženie zlyhalo."));
    } finally {
      setUkladam(false);
    }
  }

  const terminy = terminyVozidla(f as any, dnes);
  const sFinancovanim = S_FINANCOVANIM.has(txt("vlastnictvo"));
  const zmiesane = txt("pouzitie") === "zmiesane";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <Sekcia nadpis="Vozidlo" popis="Údaje z technického preukazu (osvedčenia o evidencii).">
          <Pole label="Názov vozidla">
            {input("name", "text", { placeholder: t("napr. Škoda Octavia — obchod") })}
          </Pole>
          <Pole label="ŠPZ (A)">{input("license_plate")}</Pole>
          <Pole label="VIN (E)">{input("vin", "text", { maxLength: 17 })}</Pole>
          <Pole label="Značka (D.1)">{input("znacka")}</Pole>
          <Pole label="Model (D.3)">{input("model")}</Pole>
          <Pole label="Kategória (J)">
            <select
              value={txt("kategoria")}
              onChange={(e) => set("kategoria", e.target.value)}
              className={`${vstup} ${oznacene("kategoria")}`}
            >
              <option value="">—</option>
              {KATEGORIE_VOZIDLA.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {t(k.nazov)}
                </option>
              ))}
            </select>
          </Pole>
          <Pole label="Rok výroby">{input("rok_vyroby", "number")}</Pole>
          <Pole label="Dátum prvej evidencie (B)">{input("datum_prvej_evidencie", "date")}</Pole>
          <Pole label="Palivo (P.3)">
            <select
              value={txt("fuel_type")}
              onChange={(e) => set("fuel_type", e.target.value)}
              className={`${vstup} ${oznacene("fuel_type")}`}
            >
              <option value="">—</option>
              <option value="diesel">{t("Nafta")}</option>
              <option value="benzin">{t("Benzín")}</option>
              <option value="lpg">LPG</option>
              <option value="cng">CNG</option>
              <option value="elektro">{t("Elektro")}</option>
              <option value="hybrid">{t("Hybrid")}</option>
            </select>
          </Pole>
          <Pole label="Farba (R)">{input("farba")}</Pole>
          <Pole label="Objem motora v cm³ (P.1)">{input("objem_cm3", "number")}</Pole>
          <Pole label="Výkon v kW (P.2)">{input("vykon_kw", "number", { step: "0.1" })}</Pole>
          <Pole label="Celková hmotnosť v kg (F.2)">{input("celkova_hmotnost_kg", "number")}</Pole>
          <Pole label="Počet miest na sedenie (S.1)">{input("pocet_miest", "number")}</Pole>
          <Pole label="Spotreba l/100 km (pre Knihu jázd)">
            {input("consumption_l_100km", "number", { step: "0.1" })}
          </Pole>
        </Sekcia>

        <Sekcia
          nadpis="Vlastníctvo a použitie"
          popis="Kto je vlastník podľa technického preukazu a ako sa vozidlo financuje."
        >
          <Pole label="Vlastníctvo" siroke>
            <select
              value={txt("vlastnictvo")}
              onChange={(e) => set("vlastnictvo", e.target.value)}
              className={vstup}
            >
              <option value="">—</option>
              {VLASTNICTVO.map((v) => (
                <option key={v.kod} value={v.kod}>
                  {t(v.nazov)} — {t(v.popis)}
                </option>
              ))}
            </select>
          </Pole>
          <Pole label="Vlastník (C.2 / C.4)">{input("vlastnik_nazov")}</Pole>
          <Pole label="IČO vlastníka">
            {input("vlastnik_ico", "text", { inputMode: "numeric", maxLength: 8 })}
          </Pole>
          <Pole label="Držiteľ (C.1)">{input("drzitel_nazov")}</Pole>
          <Pole label="Vodič / kto vozidlo používa">{input("vodic")}</Pole>
          {sFinancovanim && (
            <Pole label="Zmluva o financovaní" siroke>
              <select
                value={txt("financing_contract_id")}
                onChange={(e) => set("financing_contract_id", e.target.value)}
                className={vstup}
              >
                <option value="">
                  {zmluvy.length ? "—" : t("žiadna zmluva v Leasingoch a úveroch")}
                </option>
                {zmluvy.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nazov}
                  </option>
                ))}
              </select>
              {txt("financing_contract_id") ? (
                <Link
                  to="/financovanie/$id"
                  params={{ id: txt("financing_contract_id") }}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> {t("Otvoriť splátkový kalendár")}
                </Link>
              ) : (
                <Link
                  to="/financovanie/nova"
                  className="mt-1 inline-block text-xs text-primary hover:underline"
                >
                  {t("Pridať zmluvu do Leasingov a úverov")}
                </Link>
              )}
            </Pole>
          )}
          <Pole label="Dátum obstarania">{input("datum_obstarania", "date")}</Pole>
          <Pole label="Obstarávacia cena bez DPH">
            {input("obstaravacia_cena", "number", { step: "0.01" })}
          </Pole>
          <Pole label="Použitie">
            <select
              value={txt("pouzitie")}
              onChange={(e) => set("pouzitie", e.target.value)}
              className={vstup}
            >
              <option value="">—</option>
              <option value="podnikanie">{t("Len na podnikanie")}</option>
              <option value="zmiesane">{t("Zmiešané — aj súkromne")}</option>
            </select>
          </Pole>
          <Pole label="Odpočet DPH">
            <select
              value={txt("odpocet_dph")}
              onChange={(e) => set("odpocet_dph", e.target.value)}
              className={vstup}
            >
              <option value="">—</option>
              <option value="100">{t("100 % — len na podnikanie")}</option>
              <option value="50">{t("50 % — zmiešané použitie")}</option>
              <option value="0">{t("Bez odpočtu")}</option>
            </select>
          </Pole>
          {zmiesane && txt("odpocet_dph") === "100" && (
            <p className="text-xs text-amber-700 sm:col-span-2 dark:text-amber-300">
              {t(
                "Pri zmiešanom použití osobného auta sa na Slovensku od 1. 1. 2026 do 30. 6. 2028 odpočítava DPH paušálne 50 % (§ 85n zákona o DPH). 100 % len pri aute výlučne na podnikanie s podrobnou elektronickou evidenciou jázd a oznámením daňovému úradu.",
              )}
            </p>
          )}
          {(txt("odpocet_dph") === "50" || txt("odpocet_dph") === "0") && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {t(
                "Bločky a prijaté faktúry s týmto vozidlom sa pri zaúčtovaní aj vo výkazoch DPH rozdelia samy — odpočíta sa len povolená časť DPH, zvyšok ide do nákladu (v dani z príjmov je to nedaňový výdavok).",
              )}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={!!f.dmv}
              onChange={(e) => set("dmv", e.target.checked)}
              className="mt-1"
            />
            <span>
              {t("Platí sa daň z motorových vozidiel")}
              <span className="block text-xs text-muted-foreground">
                {podliehaDmv(txt("kategoria"))
                  ? t(
                      "Kategória {k} dani podlieha (nákladné a autobusy nad 3,5 t, ťažké prívesy).",
                      { k: txt("kategoria") },
                    )
                  : t(
                      "Osobné autá a dodávky do 3,5 t daň z motorových vozidiel na Slovensku od roku 2023 neplatia.",
                    )}
              </span>
            </span>
          </label>
        </Sekcia>

        <Sekcia
          nadpis="Termíny a poistky"
          popis="Blížiace sa termíny (30 dní vopred) uvidíte v zvončeku aj v zozname vozidiel."
        >
          <Pole label="STK platná do">{input("stk_do", "date")}</Pole>
          <Pole label="Emisná kontrola platná do">{input("ek_do", "date")}</Pole>
          <Pole label="PZP — poisťovňa">{input("pzp_poistovna")}</Pole>
          <Pole label="PZP — číslo zmluvy">{input("pzp_cislo")}</Pole>
          <Pole label="PZP platné do">{input("pzp_do", "date")}</Pole>
          <div className="hidden sm:block" />
          <Pole label="Havarijné — poisťovňa">{input("havarijne_poistovna")}</Pole>
          <Pole label="Havarijné — číslo zmluvy">{input("havarijne_cislo")}</Pole>
          <Pole label="Havarijné platné do">{input("havarijne_do", "date")}</Pole>
          <Pole label="Diaľničná známka platná do">{input("dialnicna_znamka_do", "date")}</Pole>
          <Pole label="Najbližší servis — dátum">{input("servis_datum", "date")}</Pole>
          <Pole label="Najbližší servis — pri km">{input("servis_km", "number")}</Pole>
        </Sekcia>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">{t("Poznámka a stav")}</h2>
          <textarea
            value={txt("poznamka")}
            onChange={(e) => set("poznamka", e.target.value)}
            rows={3}
            className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!f.active}
              onChange={(e) => set("active", !e.target.checked)}
            />
            {t("Vozidlo je vyradené (predané, vrátené z leasingu)")}
          </label>
          {!f.active && (
            <div className="mt-2 max-w-xs">
              <Pole label="Vyradené dňa">{input("vyradene_dna", "date")}</Pole>
            </div>
          )}
        </section>

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => void uloz()}
            disabled={ukladam}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {ukladam && <Loader2 className="h-4 w-4 animate-spin" />}
            {id ? t("Uložiť zmeny") : t("Pridať vozidlo")}
          </button>
          <Link
            to="/vozovy-park"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            {t("Späť na vozový park")}
          </Link>
        </div>
      </div>

      <aside className="min-w-0 space-y-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">{t("Dokumenty")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              "Technický preukaz, poistky, STK, zmluvy. Z technického preukazu sa údaje vozidla vyčítajú samé.",
            )}
          </p>
          <div className="mt-3 space-y-2">
            <select
              value={druhNahratia}
              onChange={(e) => setDruhNahratia(e.target.value)}
              className={vstup}
              aria-label={t("Druh dokumentu")}
            >
              {DRUHY_DOKUMENTOV.map((d) => (
                <option key={d.kod} value={d.kod}>
                  {t(d.nazov)}
                </option>
              ))}
            </select>
            {!["tp1", "tp2", "faktura", "zmluva"].includes(druhNahratia) && (
              <label className="block text-xs text-muted-foreground">
                {t("Platné do (nepovinné)")}
                <input
                  type="date"
                  value={platneDo}
                  onChange={(e) => setPlatneDo(e.target.value)}
                  className={vstup}
                />
              </label>
            )}
            <input
              ref={subor}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void nahraj(e.target.files[0])}
            />
            <button
              type="button"
              onClick={() => subor.current?.click()}
              disabled={nahravam}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-primary/50 px-3 py-3 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {nahravam ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {druhNahratia === "tp1" || druhNahratia === "tp2"
                ? t("Nahrať technický preukaz a vyčítať údaje")
                : t("Nahrať dokument")}
            </button>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {dokumenty.length === 0 && (
              <li className="py-2 text-xs text-muted-foreground">
                {t("Zatiaľ žiadne dokumenty.")}
              </li>
            )}
            {dokumenty.map((d) => (
              <li key={d.file_path} className="flex items-start gap-2 py-2 text-sm">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void otvor(d)}
                    className="block max-w-full truncate text-left hover:underline"
                  >
                    {d.nazov}
                  </button>
                  <div className="text-xs text-muted-foreground">
                    {t(nazovDruhu(d.druh))}
                    {d.platne_do
                      ? ` · ${t("platné do {datum}", { datum: datumNaDoklade(d.platne_do) })}`
                      : ""}
                    {!d.id ? ` · ${t("uloží sa s vozidlom")}` : ""}
                  </div>
                </div>
                {(d.druh === "tp1" || d.druh === "tp2") && (
                  <button
                    type="button"
                    title={t("Vyčítať údaje z preukazu")}
                    aria-label={t("Vyčítať údaje z preukazu")}
                    onClick={() => void citajDokument(d.file_path)}
                    disabled={citam !== null}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    {citam === d.file_path ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanText className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t("Zmazať dokument")}
                  onClick={() => void zmazDokument(d)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">{t("Termíny")}</h2>
          {terminy.length ? (
            <div className="mt-3 flex flex-col items-start gap-1.5">
              {terminy.map((x) => (
                <StitokTerminu key={x.kluc} t={x} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Zatiaľ bez termínov — doplňte STK, poistky a známku.")}
            </p>
          )}
        </section>

        {id && <NakladyVozidla id={id} />}

        {id && (
          <p className="px-1 text-xs text-muted-foreground">
            {t(
              "To isté vozidlo používa aj Kniha jázd — zmena názvu, ŠPZ či spotreby sa prejaví aj tam. Jazdy sa vo vozovom parku nezobrazujú.",
            )}
          </p>
        )}
      </aside>
    </div>
  );
}

type Naklad = {
  id: string;
  druh: "blocek" | "prijata" | "karta";
  datum: string | null;
  dodavatel: string | null;
  cislo: string | null;
  bezDph: number;
  spolu: number;
  mena: string;
};

/**
 * Bločky a prijaté faktúry priradené k vozidlu — palivo, servis, poistky.
 * Súčet je bez DPH, lebo to je náklad firmy; DPH ide do odpočtu.
 *
 * Nákupy palivovou kartou sa pripočítajú zvlášť, lebo mesačná faktúra
 * vydavateľa karty býva za viac áut a vozidlo na nej vyplnené nie je. Nákup,
 * ktorého faktúra alebo bloček je už v zozname, sa nepočíta druhýkrát.
 */
function NakladyVozidla({ id }: { id: string }) {
  const { t } = useT();
  const [naklady, setNaklady] = useState<Naklad[] | null>(null);
  const rok = new Date().getFullYear();

  useEffect(() => {
    let zive = true;
    Promise.all([
      supabase
        .from("expense_documents")
        .select(
          "id, issue_date, supplier_name, document_number, net_amount, total_amount, currency",
        )
        .eq("vehicle_id", id)
        .order("issue_date", { ascending: false })
        .limit(500),
      supabase
        .from("purchase_invoices")
        .select(
          "id, issue_date, supplier_name, invoice_number, amount_without_vat, amount_total, currency",
        )
        .eq("vehicle_id", id)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(500),
      (supabase as any)
        .from("palivove_karty_transakcie")
        .select(
          "id, datum, produkt, miesto, faktura_cislo, zaklad, mena, purchase_invoice_id, blocek_id",
        )
        .eq("vehicle_id", id)
        .order("datum", { ascending: false })
        .limit(500),
    ]).then(([b, p, k]) => {
      if (!zive) return;
      const uzZapocitane = new Set<string>([
        ...(b.data ?? []).map((x: any) => String(x.id)),
        ...(p.data ?? []).map((x: any) => String(x.id)),
      ]);
      const vsetky: Naklad[] = [
        ...(b.data ?? []).map((x: any) => ({
          id: x.id,
          druh: "blocek" as const,
          datum: x.issue_date,
          dodavatel: x.supplier_name,
          cislo: x.document_number,
          bezDph: Number(x.net_amount ?? x.total_amount ?? 0),
          spolu: Number(x.total_amount ?? 0),
          mena: x.currency || "EUR",
        })),
        ...(p.data ?? []).map((x: any) => ({
          id: x.id,
          druh: "prijata" as const,
          datum: x.issue_date,
          dodavatel: x.supplier_name,
          cislo: x.invoice_number,
          bezDph: Number(x.amount_without_vat ?? x.amount_total ?? 0),
          spolu: Number(x.amount_total ?? 0),
          mena: x.currency || "EUR",
        })),
        ...((k.data ?? []) as any[])
          .filter(
            (x) =>
              !uzZapocitane.has(String(x.purchase_invoice_id ?? "")) &&
              !uzZapocitane.has(String(x.blocek_id ?? "")),
          )
          .map((x) => ({
            id: x.id,
            druh: "karta" as const,
            datum: x.datum,
            dodavatel: [x.produkt, x.miesto].filter(Boolean).join(" · ") || null,
            cislo: x.faktura_cislo,
            bezDph: Number(x.zaklad ?? 0),
            spolu: Number(x.zaklad ?? 0),
            mena: x.mena || "EUR",
          })),
      ].sort((a, c) => String(c.datum ?? "").localeCompare(String(a.datum ?? "")));
      setNaklady(vsetky);
    });
    return () => {
      zive = false;
    };
  }, [id]);

  const sucet = (zoznam: Naklad[]) => {
    const po = new Map<string, number>();
    for (const n of zoznam) po.set(n.mena, (po.get(n.mena) ?? 0) + n.bezDph);
    return (
      [...po.entries()].map(([m, v]) => formatujMenu(Math.round(v * 100) / 100, m)).join(" + ") ||
      "—"
    );
  };
  const tentoRok = (naklady ?? []).filter((n) => String(n.datum ?? "").startsWith(String(rok)));

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{t("Náklady na vozidlo")}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          "Bločky a prijaté faktúry, pri ktorých je vybrané toto vozidlo, a nákupy palivovou kartou. Sumy bez DPH.",
        )}
      </p>
      {naklady === null ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("Načítavam…")}</p>
      ) : naklady.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "Zatiaľ žiadne. Vozidlo vyberiete pri bločku, prijatej faktúre alebo v Nespracovaných dokladoch.",
          )}
        </p>
      ) : (
        <>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Tento rok ({rok})", { rok })}</dt>
              <dd className="font-medium tabular-nums">{sucet(tentoRok)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Spolu")}</dt>
              <dd className="tabular-nums">{sucet(naklady)}</dd>
            </div>
          </dl>
          <ul className="mt-3 divide-y divide-border text-sm">
            {naklady.slice(0, 10).map((n) => (
              <li
                key={`${n.druh}-${n.id}`}
                className="flex items-start justify-between gap-2 py-1.5"
              >
                <Link
                  to={
                    n.druh === "blocek"
                      ? "/doklady/novy"
                      : n.druh === "karta"
                        ? "/vozovy-park/palivove-karty"
                        : "/prijate-faktury/$id"
                  }
                  {...(n.druh === "blocek"
                    ? { search: { id: n.id } as any }
                    : n.druh === "prijata"
                      ? { params: { id: n.id } as any }
                      : {})}
                  className="min-w-0 hover:underline"
                >
                  <span className="block truncate">{n.dodavatel ?? (n.cislo || "—")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {datumNaDoklade(n.datum)} ·{" "}
                    {n.druh === "blocek"
                      ? t("bloček")
                      : n.druh === "karta"
                        ? t("palivová karta")
                        : t("prijatá faktúra")}
                  </span>
                </Link>
                <span className="shrink-0 tabular-nums">{formatujMenu(n.bezDph, n.mena)}</span>
              </li>
            ))}
          </ul>
          {naklady.length > 10 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("a ďalších {n}", { n: naklady.length - 10 })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
