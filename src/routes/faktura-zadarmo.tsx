import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { TurnstileWidget } from "@/components/faktero/TurnstileWidget";
import { nastavenieRegistracieFn } from "@/lib/faktero/registracia.functions";
import {
  generujFakturuZadarmoFn,
  vyhladajFirmuZadarmoFn,
} from "@/lib/faktero/faktura-zadarmo.functions";
import {
  FakturaZadarmoZ,
  LIMITY_ZADARMO,
  bezDane,
  nacitajPrenos,
  novaFakturaZadarmo,
  ocistiFakturu,
  pridajDni,
  sadzbyZadarmo,
  skontrolujFakturuZadarmo,
  spocitajZadarmo,
  ulozPrenos,
  upozorneniaZadarmo,
  vsZadarmo,
  SPLATNOST_DNI,
  type ChybaZadarmo,
  type FakturaZadarmo,
  type KrajinaZadarmo,
  type RezimZadarmo,
} from "@/lib/faktero/faktura-zadarmo";
import { zakladnaSadzba } from "@/lib/faktero/vat-rates";
import { SADZBY_EU } from "@/lib/faktero/sadzby-eu";
import { formatujMenu } from "@/lib/faktero/mena";
import { lokalJazyka, preloz, type Jazyk } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";

const URL_STRANKY = "https://www.faktero.sk/faktura-zadarmo";

export const Route = createFileRoute("/faktura-zadarmo")({
  head: ({ match }) => {
    const j = (match.context.jazyk ?? "sk") as Jazyk;
    const titulok = preloz(
      j,
      "Faktúra zadarmo — vystavte faktúru online bez registrácie | Faktero",
    );
    const popis = preloz(
      j,
      "Vyplňte dodávateľa, odberateľa a položky a stiahnite si hotovú PDF faktúru s QR platbou. Zadarmo, bez registrácie, so všetkými náležitosťami podľa zákona.",
    );
    return {
      meta: [
        { title: titulok },
        { name: "description", content: popis },
        { property: "og:title", content: titulok },
        { property: "og:description", content: popis },
        { property: "og:url", content: URL_STRANKY },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: URL_STRANKY }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: preloz(j, "Faktúra zadarmo"),
            url: URL_STRANKY,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            inLanguage: j,
            description: popis,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            provider: { "@type": "Organization", name: "Faktero", url: "https://www.faktero.sk" },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: preloz(j, "Ako vystaviť faktúru zadarmo"),
            totalTime: "PT3M",
            step: [
              preloz(j, "Vyplňte údaje dodávateľa — podľa IČO ich doplníme z registra."),
              preloz(j, "Vyplňte odberateľa, číslo faktúry a dátumy."),
              preloz(j, "Pridajte položky s množstvom, cenou a sadzbou DPH."),
              preloz(j, "Stiahnite si hotovú PDF faktúru s QR kódom na platbu."),
            ].map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
          }),
        },
      ],
    };
  },
  loader: () => nastavenieRegistracieFn(),
  component: FakturaZadarmoStranka,
});

/* ───────────── stav formulára ───────────── */

/** Čísla vo formulári ostávajú ako text, kým ich človek dopisuje („1,5“). */
type RiadokUi = { nazov: string; mnozstvo: string; mj: string; cena: string; sadzba: number };
type Formular = Omit<FakturaZadarmo, "polozky"> & { polozky: RiadokUi[] };

const cislo = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", "."));
const naText = (n: number) => (Number.isFinite(n) ? String(n).replace(".", ",") : "");

function doFormulara(f: FakturaZadarmo): Formular {
  return {
    ...f,
    polozky: f.polozky.map((p) => ({ ...p, mnozstvo: naText(p.mnozstvo), cena: naText(p.cena) })),
  };
}

function zFormulara(u: Formular): FakturaZadarmo {
  return {
    ...u,
    polozky: u.polozky.map((p) => ({ ...p, mnozstvo: cislo(p.mnozstvo), cena: cislo(p.cena) })),
  };
}

const MJ = ["ks", "hod", "deň", "mes", "km", "kg", "m", "m²", "bal", "súb"];

/** Odberateľ: SK a CZ navrchu, potom ostatné štáty EÚ. */
const KRAJINY_ODBERATELA = [
  { kod: "SK", nazov: "Slovensko" },
  { kod: "CZ", nazov: "Česko" },
  ...SADZBY_EU.filter((s) => s.kod !== "SK" && s.kod !== "CZ").map((s) => ({
    kod: s.kod,
    nazov: s.nazov,
  })),
];

function FakturaZadarmoStranka() {
  const { t, jazyk } = useT();
  const { siteKey } = Route.useLoaderData();
  const generuj = useServerFn(generujFakturuZadarmoFn);
  const hladaj = useServerFn(vyhladajFirmuZadarmoFn);

  const [u, setU] = useState<Formular>(() =>
    doFormulara(novaFakturaZadarmo(jazyk === "cs" ? "CZ" : "SK")),
  );
  const [logo, setLogo] = useState<{
    mime: "image/png" | "image/jpeg";
    base64: string;
    nahlad: string;
  } | null>(null);
  const [chyby, setChyby] = useState<ChybaZadarmo[]>([]);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetCaptchy, setResetCaptchy] = useState(0);
  const [generujem, setGenerujem] = useState(false);
  const [hotovo, setHotovo] = useState<{ nazov: string } | null>(null);
  const [hladam, setHladam] = useState<"dodavatel" | "odberatel" | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  // Rozpracovaná faktúra z minula (uložená po stiahnutí) — pokračuje sa v nej.
  useEffect(() => {
    const ulozena = nacitajPrenos();
    if (ulozena) setU(doFormulara(ulozena));
  }, []);

  const f = useMemo(() => zFormulara(u), [u]);
  const sucty = useMemo(
    () =>
      spocitajZadarmo({
        ...f,
        polozky: f.polozky.map((p) => ({ ...p, mnozstvo: p.mnozstvo || 0, cena: p.cena || 0 })),
      }),
    [f],
  );
  const sadzby = sadzbyZadarmo(f);
  const bezDph = bezDane(f);
  const lokal = lokalJazyka(jazyk);
  const peniaze = (n: number) => formatujMenu(n, f.mena, lokal);
  // Po neúspešnom odoslaní sa hlášky prepočítavajú pri každej zmene — inak by
  // „Doplňte IČO“ visela aj pri už vyplnenom poli až do ďalšieho kliknutia.
  const maChyby = chyby.length > 0;
  useEffect(() => {
    if (!maChyby) return;
    const tvar = FakturaZadarmoZ.safeParse(f);
    if (!tvar.success) return;
    setChyby(skontrolujFakturuZadarmo(ocistiFakturu(tvar.data)));
  }, [f, maChyby]);

  const chybaPola = (pole: string) => {
    const c = chyby.find((x) => x.pole === pole);
    return c ? t(c.sprava, c.parametre) : null;
  };

  /* ── úpravy ── */

  function zmen<K extends keyof Formular>(k: K, v: Formular[K]) {
    setU((s) => zosulad({ ...s, [k]: v }, s));
    setHotovo(null);
  }
  function zmenDodavatela<K extends keyof Formular["dodavatel"]>(
    k: K,
    v: Formular["dodavatel"][K],
  ) {
    setU((s) => zosulad({ ...s, dodavatel: { ...s.dodavatel, [k]: v } }, s));
    setHotovo(null);
  }
  function zmenOdberatela<K extends keyof Formular["odberatel"]>(
    k: K,
    v: Formular["odberatel"][K],
  ) {
    setU((s) => ({ ...s, odberatel: { ...s.odberatel, [k]: v } }));
    setHotovo(null);
  }
  function zmenPolozku(i: number, zmena: Partial<RiadokUi>) {
    setU((s) => ({ ...s, polozky: s.polozky.map((p, j) => (j === i ? { ...p, ...zmena } : p)) }));
    setHotovo(null);
  }

  /**
   * Po zmene krajiny, platiteľstva alebo dátumu: sadzby položiek musia patriť
   * do ponuky (`vat-rates.ts`), neplatiteľ má všade 0 % a režim „bežný“.
   */
  function zosulad(s: Formular, pred: Formular): Formular {
    const platitel = s.dodavatel.platitel;
    const ponuka = sadzbyZadarmo(s);
    const zakladna = zakladnaSadzba(s.krajina, s.datumDodania || s.datumVystavenia);
    // Práve sa stal platiteľom: nuly z neplatiteľa nahradí základná sadzba.
    const novyPlatitel = platitel && !pred.dodavatel.platitel;
    return {
      ...s,
      rezim: platitel ? s.rezim : "bezny",
      polozky: s.polozky.map((p) => ({
        ...p,
        sadzba: !platitel ? 0 : novyPlatitel || !ponuka.includes(p.sadzba) ? zakladna : p.sadzba,
      })),
    };
  }

  function zmenKrajinu(k: KrajinaZadarmo) {
    setU((s) =>
      zosulad(
        {
          ...s,
          krajina: k,
          mena: k === "CZ" ? "CZK" : "EUR",
          jazyk: k === "CZ" ? "cs" : s.jazyk === "cs" ? "sk" : s.jazyk,
          odberatel: {
            ...s.odberatel,
            krajina: s.odberatel.krajina === s.krajina ? k : s.odberatel.krajina,
          },
        },
        s,
      ),
    );
    setHotovo(null);
  }

  function zmenVystavenie(v: string) {
    setU((s) => {
      // Splatnosť sa posúva s vystavením, kým ju človek nezmenil ručne.
      const posun = s.datumSplatnosti === pridajDni(s.datumVystavenia, SPLATNOST_DNI);
      const dodanie = s.datumDodania === s.datumVystavenia ? v : s.datumDodania;
      return zosulad(
        {
          ...s,
          datumVystavenia: v,
          datumDodania: dodanie,
          datumSplatnosti: posun && v ? pridajDni(v, SPLATNOST_DNI) : s.datumSplatnosti,
        },
        s,
      );
    });
    setHotovo(null);
  }

  function pridajPolozku() {
    if (u.polozky.length >= LIMITY_ZADARMO.polozky) return;
    setU((s) => ({
      ...s,
      polozky: [
        ...s.polozky,
        {
          nazov: "",
          mnozstvo: "1",
          mj: "ks",
          cena: "",
          sadzba: s.dodavatel.platitel
            ? zakladnaSadzba(s.krajina, s.datumDodania || s.datumVystavenia)
            : 0,
        },
      ],
    }));
  }

  async function vyberLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const subor = e.target.files?.[0];
    e.target.value = "";
    if (!subor) return;
    if (
      !["image/png", "image/jpeg"].includes(subor.type) ||
      subor.size > LIMITY_ZADARMO.logoBajtov
    ) {
      toast.error(t("Logo musí byť obrázok PNG alebo JPG do 250 kB."));
      return;
    }
    const url = await new Promise<string>((hotovo, chyba) => {
      const r = new FileReader();
      r.onload = () => hotovo(String(r.result));
      r.onerror = () => chyba(r.error);
      r.readAsDataURL(subor);
    }).catch(() => "");
    if (!url) return;
    setLogo({
      mime: subor.type as "image/png" | "image/jpeg",
      base64: url.split(",")[1] ?? "",
      nahlad: url,
    });
    setHotovo(null);
  }

  async function doplnPodlaIco(kto: "dodavatel" | "odberatel") {
    const ico = (kto === "dodavatel" ? u.dodavatel.ico : u.odberatel.ico).replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(ico)) return toast.error(t("Zadajte IČO s 6 až 8 číslicami."));
    const krajina = kto === "dodavatel" ? u.krajina : u.odberatel.krajina === "CZ" ? "CZ" : "SK";
    setHladam(kto);
    try {
      const r = await hladaj({ data: { ico, krajina } });
      if (!r.ok) return toast.error(t(r.sprava));
      const d = r.firma;
      if (kto === "dodavatel") {
        setU((s) =>
          zosulad(
            {
              ...s,
              dodavatel: {
                ...s.dodavatel,
                nazov: d.nazov || s.dodavatel.nazov,
                ulica: d.ulica || s.dodavatel.ulica,
                mesto: d.mesto || s.dodavatel.mesto,
                psc: d.psc || s.dodavatel.psc,
                dic: d.dic || s.dodavatel.dic,
                icDph: d.icDph || s.dodavatel.icDph,
                platitel: d.platitel ?? s.dodavatel.platitel,
              },
            },
            s,
          ),
        );
      } else {
        setU((s) => ({
          ...s,
          odberatel: {
            ...s.odberatel,
            nazov: d.nazov || s.odberatel.nazov,
            ulica: d.ulica || s.odberatel.ulica,
            mesto: d.mesto || s.odberatel.mesto,
            psc: d.psc || s.odberatel.psc,
            dic: d.dic || s.odberatel.dic,
            icDph: d.icDph || s.odberatel.icDph,
          },
        }));
      }
      toast.success(t("Údaje firmy sme doplnili z registra."));
    } catch {
      toast.error(t("Register firiem teraz neodpovedá. Údaje vyplňte ručne."));
    } finally {
      setHladam(null);
    }
  }

  /* ── odoslanie ── */

  async function stiahni(e: React.FormEvent) {
    e.preventDefault();
    if (generujem) return;
    const cisla = u.polozky.findIndex(
      (p) =>
        !Number.isFinite(cislo(p.mnozstvo)) ||
        !Number.isFinite(cislo(p.cena)) ||
        cislo(p.mnozstvo) <= 0,
    );
    if (cisla >= 0) {
      const c = {
        pole: `polozky.${cisla}.cena`,
        sprava: "Položka {n}: zadajte množstvo a cenu číslom.",
        parametre: { n: cisla + 1 },
      };
      setChyby([c]);
      return toast.error(t(c.sprava, c.parametre));
    }
    const tvar = FakturaZadarmoZ.safeParse(f);
    if (!tvar.success) return toast.error(t("Skontrolujte údaje faktúry."));
    const cista = ocistiFakturu(tvar.data);
    const najdene = skontrolujFakturuZadarmo(cista);
    setChyby(najdene);
    if (najdene.length) {
      toast.error(t(najdene[0].sprava, najdene[0].parametre));
      document.getElementById(`pole-${najdene[0].pole}`)?.focus();
      return;
    }
    for (const w of upozorneniaZadarmo(cista)) toast.warning(t(w.sprava, w.parametre));
    if (!captcha) return toast.error(t("Počkajte, kým sa dokončí overenie, že nie ste robot."));

    setGenerujem(true);
    try {
      const r = await generuj({
        data: {
          faktura: cista,
          logo: logo ? { mime: logo.mime, base64: logo.base64 } : null,
          token: captcha,
        },
      });
      if (!r.ok) {
        if (r.polia) setChyby(r.polia);
        toast.error(t(r.sprava, r.parametre));
        return;
      }
      stiahniSubor(r.pdf, r.nazov);
      // Údaje si pamätáme pre prenos do účtu po registrácii (a pre ďalšiu faktúru).
      ulozPrenos(cista);
      setHotovo({ nazov: r.nazov });
    } catch {
      toast.error(t("PDF sa nepodarilo vytvoriť. Skúste to o chvíľu znova."));
    } finally {
      setGenerujem(false);
      // Token je jednorazový — po každom pokuse nový.
      setResetCaptchy((x) => x + 1);
    }
  }

  function dalsiaFaktura() {
    setU((s) => {
      const m = /^(.*?)(\d+)$/.exec(s.cislo);
      const dalsie = m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, "0")}` : s.cislo;
      return {
        ...s,
        cislo: dalsie,
        vs: "",
        odberatel: { ...novaFakturaZadarmo(s.krajina).odberatel, krajina: s.krajina },
        polozky: [
          { nazov: "", mnozstvo: "1", mj: "ks", cena: "", sadzba: s.polozky[0]?.sadzba ?? 0 },
        ],
        poznamka: "",
      };
    });
    setHotovo(null);
    setChyby([]);
    document.getElementById("formular")?.scrollIntoView({ behavior: "smooth" });
  }

  const vs = vsZadarmo(f);

  return (
    <MarketingShell>
      {/* Úvod */}
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> {t("Zadarmo a bez registrácie")}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("Faktúra zadarmo")}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t(
              "Vyplňte dodávateľa, odberateľa a položky — PDF faktúru s QR kódom na platbu máte za pár minút. Údaje nikam neukladáme a nič za vás neposielame.",
            )}
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {[
              "Náležitosti podľa zákona o DPH",
              "QR platba PAY by square / QR Platba",
              "Slovensko aj Česko, EUR aj CZK",
            ].map((x) => (
              <li key={x} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" /> {t(x)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <form
        id="formular"
        onSubmit={stiahni}
        noValidate
        className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6"
      >
        {/* Krajina, mena, jazyk */}
        <Karta>
          <div className="grid gap-4 sm:grid-cols-3">
            <Pole label={t("Krajina dodávateľa")}>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-input p-1">
                {(["SK", "CZ"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => zmenKrajinu(k)}
                    aria-pressed={u.krajina === k}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${u.krajina === k ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                  >
                    {k === "SK" ? t("Slovensko") : t("Česko")}
                  </button>
                ))}
              </div>
            </Pole>
            <Pole label={t("Mena")}>
              <select
                value={u.mena}
                onChange={(e) => zmen("mena", e.target.value as any)}
                className="input mt-1"
              >
                <option value="EUR">EUR €</option>
                <option value="CZK">CZK Kč</option>
              </select>
            </Pole>
            <Pole label={t("Jazyk faktúry")}>
              <select
                value={u.jazyk}
                onChange={(e) => zmen("jazyk", e.target.value as any)}
                className="input mt-1"
              >
                <option value="sk">Slovenčina</option>
                <option value="cs">Čeština</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </Pole>
          </div>
        </Karta>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Dodávateľ */}
          <Karta nadpis={t("Dodávateľ")} ikona={<Building2 className="h-4 w-4" />}>
            <div className="space-y-3">
              <IcoPole
                id="pole-dodavatel.ico"
                label={t("IČO")}
                value={u.dodavatel.ico}
                onChange={(v) => zmenDodavatela("ico", v)}
                onHladaj={() => doplnPodlaIco("dodavatel")}
                hladam={hladam === "dodavatel"}
                chyba={chybaPola("dodavatel.ico")}
                tlacidlo={t("Doplniť")}
              />
              <Text
                id="pole-dodavatel.nazov"
                label={t("Obchodné meno alebo meno a priezvisko")}
                povinne
                value={u.dodavatel.nazov}
                onChange={(v) => zmenDodavatela("nazov", v)}
                max={LIMITY_ZADARMO.nazov}
                chyba={chybaPola("dodavatel.nazov")}
                autoComplete="organization"
              />
              <Text
                id="pole-dodavatel.ulica"
                label={t("Ulica a číslo")}
                povinne
                value={u.dodavatel.ulica}
                onChange={(v) => zmenDodavatela("ulica", v)}
                max={LIMITY_ZADARMO.ulica}
                chyba={chybaPola("dodavatel.ulica")}
                autoComplete="street-address"
              />
              <div className="grid grid-cols-3 gap-3">
                <Text
                  label={t("PSČ")}
                  value={u.dodavatel.psc}
                  onChange={(v) => zmenDodavatela("psc", v)}
                  max={LIMITY_ZADARMO.psc}
                  autoComplete="postal-code"
                />
                <div className="col-span-2">
                  <Text
                    label={t("Mesto")}
                    povinne
                    value={u.dodavatel.mesto}
                    onChange={(v) => zmenDodavatela("mesto", v)}
                    max={LIMITY_ZADARMO.mesto}
                    autoComplete="address-level2"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={u.dodavatel.platitel}
                  onChange={(e) => zmenDodavatela("platitel", e.target.checked)}
                />
                <span className="font-medium">
                  {u.krajina === "CZ" ? t("Som plátca DPH") : t("Som platiteľ DPH")}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Text
                  label={t("DIČ")}
                  value={u.dodavatel.dic}
                  onChange={(v) => zmenDodavatela("dic", v)}
                  max={LIMITY_ZADARMO.dic}
                />
                {u.dodavatel.platitel && (
                  <Text
                    id="pole-dodavatel.icDph"
                    label={t("IČ DPH")}
                    povinne
                    value={u.dodavatel.icDph}
                    onChange={(v) => zmenDodavatela("icDph", v)}
                    max={LIMITY_ZADARMO.icDph}
                    chyba={chybaPola("dodavatel.icDph")}
                    placeholder={u.krajina === "CZ" ? "CZ12345678" : "SK1234567890"}
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                <Text
                  id="pole-dodavatel.iban"
                  label={t("IBAN")}
                  value={u.dodavatel.iban}
                  onChange={(v) => zmenDodavatela("iban", v)}
                  max={LIMITY_ZADARMO.iban}
                  chyba={chybaPola("dodavatel.iban")}
                  placeholder={
                    u.krajina === "CZ"
                      ? "CZ65 0800 0000 1920 0014 5399"
                      : "SK31 1200 0000 1987 4263 7541"
                  }
                />
                <Text
                  label={t("SWIFT")}
                  value={u.dodavatel.swift}
                  onChange={(v) => zmenDodavatela("swift", v)}
                  max={LIMITY_ZADARMO.swift}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Text
                  id="pole-dodavatel.email"
                  label={t("E-mail")}
                  type="email"
                  value={u.dodavatel.email}
                  onChange={(v) => zmenDodavatela("email", v)}
                  max={LIMITY_ZADARMO.email}
                  chyba={chybaPola("dodavatel.email")}
                  autoComplete="email"
                />
                <Text
                  label={t("Telefón")}
                  value={u.dodavatel.telefon}
                  onChange={(v) => zmenDodavatela("telefon", v)}
                  max={LIMITY_ZADARMO.telefon}
                  autoComplete="tel"
                />
              </div>
              <Text
                label={t("Zápis v registri")}
                value={u.dodavatel.zapis}
                onChange={(v) => zmenDodavatela("zapis", v)}
                max={LIMITY_ZADARMO.zapis}
                placeholder={
                  u.krajina === "CZ"
                    ? t("napr. zapsáno v OR u KS v Brně, oddíl C, vložka 1234")
                    : t("napr. zapísaná v OR OS Bratislava I, oddiel Sro, vložka č. 12345/B")
                }
              />
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={vyberLogo}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <ImagePlus className="h-4 w-4" />{" "}
                  {logo ? t("Zmeniť logo") : t("Pridať logo (nepovinné)")}
                </button>
                {logo && (
                  <>
                    <img
                      src={logo.nahlad}
                      alt={t("Logo")}
                      className="h-10 max-w-[120px] object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setLogo(null)}
                      className="text-xs text-muted-foreground underline"
                    >
                      {t("Odstrániť")}
                    </button>
                  </>
                )}
              </div>
            </div>
          </Karta>

          {/* Odberateľ */}
          <Karta nadpis={t("Odberateľ")} ikona={<User className="h-4 w-4" />}>
            <div className="space-y-3">
              <Pole label={t("Krajina")}>
                <select
                  value={u.odberatel.krajina}
                  onChange={(e) => zmenOdberatela("krajina", e.target.value)}
                  className="input mt-1"
                >
                  {KRAJINY_ODBERATELA.map((k) => (
                    <option key={k.kod} value={k.kod}>
                      {t(k.nazov)}
                    </option>
                  ))}
                </select>
              </Pole>
              <IcoPole
                id="pole-odberatel.ico"
                label={t("IČO")}
                value={u.odberatel.ico}
                onChange={(v) => zmenOdberatela("ico", v)}
                onHladaj={
                  u.odberatel.krajina === "SK" || u.odberatel.krajina === "CZ"
                    ? () => doplnPodlaIco("odberatel")
                    : undefined
                }
                hladam={hladam === "odberatel"}
                chyba={chybaPola("odberatel.ico")}
                tlacidlo={t("Doplniť")}
              />
              <Text
                id="pole-odberatel.nazov"
                label={t("Obchodné meno alebo meno a priezvisko")}
                povinne
                value={u.odberatel.nazov}
                onChange={(v) => zmenOdberatela("nazov", v)}
                max={LIMITY_ZADARMO.nazov}
                chyba={chybaPola("odberatel.nazov")}
              />
              <Text
                id="pole-odberatel.ulica"
                label={t("Ulica a číslo")}
                povinne
                value={u.odberatel.ulica}
                onChange={(v) => zmenOdberatela("ulica", v)}
                max={LIMITY_ZADARMO.ulica}
                chyba={chybaPola("odberatel.ulica")}
              />
              <div className="grid grid-cols-3 gap-3">
                <Text
                  label={t("PSČ")}
                  value={u.odberatel.psc}
                  onChange={(v) => zmenOdberatela("psc", v)}
                  max={LIMITY_ZADARMO.psc}
                />
                <div className="col-span-2">
                  <Text
                    label={t("Mesto")}
                    povinne
                    value={u.odberatel.mesto}
                    onChange={(v) => zmenOdberatela("mesto", v)}
                    max={LIMITY_ZADARMO.mesto}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Text
                  label={t("DIČ")}
                  value={u.odberatel.dic}
                  onChange={(v) => zmenOdberatela("dic", v)}
                  max={LIMITY_ZADARMO.dic}
                />
                <Text
                  id="pole-odberatel.icDph"
                  label={t("IČ DPH")}
                  value={u.odberatel.icDph}
                  onChange={(v) => zmenOdberatela("icDph", v)}
                  max={LIMITY_ZADARMO.icDph}
                  chyba={chybaPola("odberatel.icDph")}
                />
              </div>
              <Text
                id="pole-odberatel.email"
                label={t("E-mail")}
                type="email"
                value={u.odberatel.email}
                onChange={(v) => zmenOdberatela("email", v)}
                max={LIMITY_ZADARMO.email}
                chyba={chybaPola("odberatel.email")}
              />
            </div>
          </Karta>
        </div>

        {/* Údaje faktúry */}
        <Karta nadpis={t("Faktúra")} ikona={<FileText className="h-4 w-4" />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Text
              id="pole-cislo"
              label={t("Číslo faktúry")}
              povinne
              value={u.cislo}
              onChange={(v) => zmen("cislo", v)}
              max={LIMITY_ZADARMO.cislo}
              chyba={chybaPola("cislo")}
            />
            <Text
              id="pole-vs"
              label={t("Variabilný symbol")}
              value={u.vs}
              onChange={(v) => zmen("vs", v.replace(/\D/g, ""))}
              max={LIMITY_ZADARMO.vs}
              chyba={chybaPola("vs")}
              placeholder={vs ?? ""}
              inputMode="numeric"
            />
            <Pole label={t("Spôsob úhrady")}>
              <select
                value={u.sposobUhrady}
                onChange={(e) => zmen("sposobUhrady", e.target.value as any)}
                className="input mt-1"
              >
                <option value="bank_transfer">{t("Prevodom na účet")}</option>
                <option value="cash">{t("V hotovosti")}</option>
                <option value="card">{t("Kartou")}</option>
              </select>
            </Pole>
            <Text
              label={t("Dátum vystavenia")}
              type="date"
              povinne
              value={u.datumVystavenia}
              onChange={zmenVystavenie}
            />
            <Text
              id="pole-datumDodania"
              label={u.krajina === "CZ" ? t("Dátum zdaniteľného plnenia") : t("Dátum dodania")}
              type="date"
              povinne={u.dodavatel.platitel}
              value={u.datumDodania}
              onChange={(v) => zmen("datumDodania", v)}
              chyba={chybaPola("datumDodania")}
            />
            <Text
              id="pole-datumSplatnosti"
              label={t("Dátum splatnosti")}
              type="date"
              povinne
              value={u.datumSplatnosti}
              onChange={(v) => zmen("datumSplatnosti", v)}
              chyba={chybaPola("datumSplatnosti")}
            />
            {u.dodavatel.platitel && (
              <div className="sm:col-span-2 lg:col-span-3">
                <Pole label={t("Režim DPH")}>
                  <select
                    value={u.rezim}
                    onChange={(e) => zmen("rezim", e.target.value as RezimZadarmo)}
                    className="input mt-1"
                  >
                    <option value="bezny">{t("Bežná faktúra s DPH")}</option>
                    <option value="pdp_tuzemsko">
                      {t("Prenesenie daňovej povinnosti na odberateľa (tuzemsko)")}
                    </option>
                    <option value="eu_tovar">
                      {t("Dodanie tovaru do inej krajiny EÚ (oslobodené)")}
                    </option>
                    <option value="eu_sluzba">
                      {t("Služba pre podnikateľa z inej krajiny EÚ")}
                    </option>
                  </select>
                </Pole>
              </div>
            )}
          </div>
        </Karta>

        {/* Položky */}
        <Karta nadpis={t("Položky")}>
          <div className="hidden gap-2 px-1 pb-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_72px_76px_104px_84px_104px_32px]">
            <span>{t("Názov")}</span>
            <span>{t("Množstvo")}</span>
            <span>{t("MJ")}</span>
            <span>{t("Cena za MJ")}</span>
            <span>{t("DPH")}</span>
            <span className="text-right">{t("Spolu")}</span>
            <span />
          </div>
          <div className="space-y-3 sm:space-y-2">
            {u.polozky.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-6 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_72px_76px_104px_84px_104px_32px] sm:items-start sm:border-0 sm:p-0"
              >
                <div className="col-span-6 sm:col-span-1">
                  <input
                    id={`pole-polozky.${i}.nazov`}
                    aria-label={t("Názov položky {n}", { n: i + 1 })}
                    value={p.nazov}
                    maxLength={LIMITY_ZADARMO.nazovPolozky}
                    onChange={(e) => zmenPolozku(i, { nazov: e.target.value })}
                    placeholder={t("Napr. Tvorba webovej stránky")}
                    className="input"
                  />
                  {chybaPola(`polozky.${i}.nazov`) && (
                    <p className="mt-1 text-xs text-destructive">
                      {chybaPola(`polozky.${i}.nazov`)}
                    </p>
                  )}
                </div>
                <input
                  aria-label={t("Množstvo")}
                  inputMode="decimal"
                  value={p.mnozstvo}
                  onChange={(e) => zmenPolozku(i, { mnozstvo: e.target.value })}
                  className="input col-span-2 sm:col-span-1"
                />
                <input
                  aria-label={t("MJ")}
                  list="mj-zoznam"
                  value={p.mj}
                  maxLength={LIMITY_ZADARMO.mj}
                  onChange={(e) => zmenPolozku(i, { mj: e.target.value })}
                  className="input col-span-2 sm:col-span-1"
                />
                <input
                  id={`pole-polozky.${i}.cena`}
                  aria-label={t("Cena za MJ")}
                  inputMode="decimal"
                  value={p.cena}
                  placeholder="0,00"
                  onChange={(e) => zmenPolozku(i, { cena: e.target.value })}
                  className="input col-span-2 sm:col-span-1"
                />
                {bezDph ? (
                  <span className="col-span-3 flex h-9 items-center text-sm text-muted-foreground sm:col-span-1">
                    {u.dodavatel.platitel ? t("bez DPH") : "0 %"}
                  </span>
                ) : (
                  <select
                    aria-label={t("Sadzba DPH")}
                    value={p.sadzba}
                    onChange={(e) => zmenPolozku(i, { sadzba: Number(e.target.value) })}
                    className="input col-span-3 sm:col-span-1"
                  >
                    {sadzby.map((s) => (
                      <option key={s} value={s}>
                        {s} %
                      </option>
                    ))}
                  </select>
                )}
                <span className="col-span-2 flex h-9 items-center justify-end text-sm font-medium tabular-nums sm:col-span-1">
                  {peniaze(sucty.riadky[i]?.spolu ?? 0)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setU((s) => ({ ...s, polozky: s.polozky.filter((_, j) => j !== i) }))
                  }
                  disabled={u.polozky.length === 1}
                  aria-label={t("Odstrániť položku {n}", { n: i + 1 })}
                  className="col-span-1 grid h-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {chybaPola(`polozky.${i}.cena`) && (
                  <p className="col-span-6 text-xs text-destructive sm:col-span-7">
                    {chybaPola(`polozky.${i}.cena`)}
                  </p>
                )}
              </div>
            ))}
          </div>
          <datalist id="mj-zoznam">
            {MJ.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={pridajPolozku}
            disabled={u.polozky.length >= LIMITY_ZADARMO.polozky}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {t("Pridať položku")}
          </button>

          <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Pole label={t("Poznámka na faktúre")}>
              <textarea
                value={u.poznamka}
                maxLength={LIMITY_ZADARMO.poznamka}
                onChange={(e) => zmen("poznamka", e.target.value)}
                rows={3}
                className="input mt-1"
              />
            </Pole>
            <dl className="space-y-1.5 text-sm sm:pl-6">
              {!bezDph &&
                sucty.podlaSadzby.map((s) => (
                  <div key={s.sadzba} className="flex justify-between gap-3 text-muted-foreground">
                    <dt>{t("Základ {s} % / DPH", { s: s.sadzba })}</dt>
                    <dd className="tabular-nums">
                      {peniaze(s.zaklad)} / {peniaze(s.dan)}
                    </dd>
                  </div>
                ))}
              <div className="flex justify-between gap-3">
                <dt>{t("Spolu bez DPH")}</dt>
                <dd className="tabular-nums">{peniaze(sucty.zaklad)}</dd>
              </div>
              {!bezDph && (
                <div className="flex justify-between gap-3">
                  <dt>{t("DPH")}</dt>
                  <dd className="tabular-nums">{peniaze(sucty.dan)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-border pt-2 text-base font-semibold">
                <dt>{t("Na úhradu")}</dt>
                <dd className="tabular-nums">{peniaze(sucty.spolu)}</dd>
              </div>
            </dl>
          </div>
        </Karta>

        {/* Stiahnutie */}
        <Karta>
          {chyby.length > 0 && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <ul className="list-disc space-y-0.5 pl-4">
                {chyby.slice(0, 6).map((c, i) => (
                  <li key={i}>{t(c.sprava, c.parametre)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <TurnstileWidget
              siteKey={siteKey}
              jazyk={jazyk}
              akcia="faktura-zadarmo"
              onToken={setCaptcha}
              reset={resetCaptchy}
              popis={t("Overenie, že nie ste robot")}
              chybaNacitania={t(
                "Overenie sa nenačítalo — skontrolujte blokovanie reklám alebo obnovte stránku.",
              )}
            />
            <button
              type="submit"
              disabled={generujem}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              {generujem ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t("Stiahnuť PDF faktúru")}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "Faktúru nikam neukladáme a nikomu ju neposielame — PDF si stiahnete a odošlete sami. V pätičke PDF je malá poznámka „Vystavené vo Faktero“.",
            )}
          </p>
        </Karta>

        {hotovo && (
          <div role="status" className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{t("Faktúra je stiahnutá")}</h2>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {t("Súbor {nazov} nájdete v stiahnutých súboroch.", { nazov: hotovo.nazov })}
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold">
                {t("Uložte si faktúru a vystavujte ďalšie — 30 dní zadarmo")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "Po registrácii z vyplnených údajov založíme vašu firmu, odberateľa pridáme do adresára a faktúru uložíme ako koncept. Ďalšie faktúry, párovanie platieb s bankou, upomienky a eFaktúra sú potom na pár kliknutí.",
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/registracia"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  {t("Vyskúšať 30 dní zadarmo")} <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={dalsiaFaktura}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
                >
                  {t("Vystaviť ďalšiu faktúru")}
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("Bez platobnej karty. Údaje faktúry ostávajú len vo vašom prehliadači.")}
              </p>
            </div>
          </div>
        )}
      </form>

      <Nalezitosti krajina={u.krajina} />

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center">
          <QrCode className="h-10 w-10 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("Fakturujete pravidelne?")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Vo Faktere máte číselné rady, adresár odberateľov, opakované faktúry, párovanie platieb a eFaktúru od roku 2027.",
              )}
            </p>
          </div>
          <Link
            to="/registracia"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            {t("Vyskúšať zdarma")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

/* ───────────── stiahnutie ───────────── */

function stiahniSubor(base64: string, nazov: string) {
  const bin = atob(base64);
  const bajty = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bajty], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nazov;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* ───────────── náležitosti ───────────── */

const NALEZITOSTI_SK = [
  "Obchodné meno (meno a priezvisko), adresa sídla a IČO dodávateľa aj odberateľa; platiteľ DPH uvádza aj IČ DPH svoje a odberateľa, ak ho má.",
  "Poradové číslo faktúry, dátum vyhotovenia a dátum dodania tovaru alebo služby (alebo prijatia platby).",
  "Druh a množstvo tovaru alebo rozsah a druh služby, jednotkovú cenu bez dane a zľavy, ak nie sú v cene.",
  "Základ dane za každú sadzbu, uplatnenú sadzbu a výšku dane v eurách — alebo vetu o oslobodení či prenesení daňovej povinnosti.",
  "Neplatiteľ DPH daň neuvádza; faktúra je preňho účtovný doklad a odporúča sa na nej uviesť, že nie je platiteľom DPH.",
  "Údaj o zápise v obchodnom alebo živnostenskom registri (§ 3a Obchodného zákonníka).",
];

const NALEZITOSTI_CZ = [
  "Obchodná firma alebo meno, sídlo a IČO dodávateľa aj odberateľa; platca DPH uvádza DIČ svoje aj odberateľa.",
  "Evidenčné číslo dokladu, dátum vystavenia a dátum uskutočnenia zdaniteľného plnenia (DUZP), ak sa líši.",
  "Rozsah a predmet plnenia, jednotkovú cenu bez dane a zľavu, ak nie je v cene.",
  "Základ dane, sadzbu a výšku dane v korunách — alebo vetu o oslobodení či prenesení daňovej povinnosti.",
  "Neplatca DPH daň neuvádza; faktúra je preňho účtovný doklad a vhodné je uviesť, že nie je platcom DPH.",
  "Údaj o zápise do obchodného alebo živnostenského registra (§ 435 českého občianskeho zákonníka).",
];

function Nalezitosti({ krajina }: { krajina: KrajinaZadarmo }) {
  const { t } = useT();
  const cz = krajina === "CZ";
  return (
    <section className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight">{t("Čo musí faktúra obsahovať")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {cz
          ? t(
              "Podľa § 29 zákona č. 235/2004 Sb. o DPH (Česko). Daňový doklad sa vystavuje do 15 dní od uskutočnenia plnenia.",
            )
          : t(
              "Podľa § 74 zákona č. 222/2004 Z. z. o DPH (Slovensko). Faktúra sa vyhotovuje do 15 dní od dodania alebo prijatia platby.",
            )}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {(cz ? NALEZITOSTI_CZ : NALEZITOSTI_SK).map((x) => (
          <li key={x} className="flex gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{t(x)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────── drobné komponenty ───────────── */

function Karta({
  nadpis,
  ikona,
  children,
}: {
  nadpis?: string;
  ikona?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      {nadpis && (
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          {ikona && <span className="text-primary">{ikona}</span>}
          {nadpis}
        </h2>
      )}
      {children}
    </section>
  );
}

function Pole({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  max,
  povinne,
  chyba,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  povinne?: boolean;
  chyba?: string | null;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium">
        {label}
        {povinne && <span className="text-destructive"> *</span>}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={chyba ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`input mt-1 ${chyba ? "border-destructive" : ""}`}
      />
      {chyba && <span className="mt-1 block text-xs text-destructive">{chyba}</span>}
    </label>
  );
}

function IcoPole({
  id,
  label,
  value,
  onChange,
  onHladaj,
  hladam,
  chyba,
  tlacidlo,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onHladaj?: () => void;
  hladam: boolean;
  chyba?: string | null;
  tlacidlo: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          value={value}
          inputMode="numeric"
          maxLength={LIMITY_ZADARMO.ico}
          aria-invalid={chyba ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onHladaj) {
              e.preventDefault();
              onHladaj();
            }
          }}
          className={`input ${chyba ? "border-destructive" : ""}`}
        />
        {onHladaj && (
          <button
            type="button"
            onClick={onHladaj}
            disabled={hladam}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            {hladam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {tlacidlo}
          </button>
        )}
      </div>
      {chyba && <span className="mt-1 block text-xs text-destructive">{chyba}</span>}
    </label>
  );
}
