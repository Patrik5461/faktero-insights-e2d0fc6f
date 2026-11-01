import type { ReactNode } from "react";
import { ZoznamVytiek } from "@/components/faktero/ZoznamVytiek";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { zostavVykazyFn, ulozVykazFn } from "@/lib/faktero/dph-vykazy.functions";
import { kvNaXml, priznanieNaXml, svNaXml, type TypVykazu } from "@/lib/faktero/dph-vykazy-xml";
import { verziaPriznania } from "@/lib/faktero/dph-vykazy";
import { AlertTriangle, Download, Loader2, CheckCircle2 } from "lucide-react";
import { useRezimDph } from "@/lib/faktero/krajina-firmy";
import { druhVykazov } from "@/lib/faktero/vykazy-rezim";
import { CzVykazyDph } from "@/components/faktero/CzVykazyDph";
import { DeUstva } from "@/components/faktero/DeUstva";
import { DeZm } from "@/components/faktero/DeZm";
import { slovoPodlaPoctu } from "@/lib/faktero/sklonovanie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/uctovnictvo/vykazy")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Výkazy k DPH — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Priznanie k DPH, kontrolný výkaz a súhrnný výkaz zostavené z dokladov a pripravené na podanie v XML.",
        ),
      },
    ],
  }),
  component: VykazyStranka,
});

/**
 * Česká firma podáva iné tlačivá (DPHDP3, DPHKH1), nemecká UStVA — každá má
 * vlastnú obrazovku.
 */
function VykazyStranka() {
  const rezim = useRezimDph();
  const krajina = String(rezim.krajina);
  const druh = druhVykazov(rezim.schema);
  const [ajTak, setAjTak] = useState(false);
  const uvod = druh === "registrovana" ? <PoznamkaRegistrovanejOsoby krajina={krajina} /> : null;
  if (krajina === "DE") return (<><DeUstva /><DeZm /></>);
  // Neplatiteľ výkazy nepodáva — tlačivá až na požiadanie (režim môže byť nastavený zle).
  if (druh === "neplatitel" && !ajTak)
    return <NeplatitelBezVykazov krajina={krajina} onZobraz={() => setAjTak(true)} />;
  return (
    <>
      {krajina === "CZ" ? <CzVykazyDph uvod={uvod} /> : <VykazyPage uvod={uvod} />}
    </>
  );
}

function NeplatitelBezVykazov({ krajina, onZobraz }: { krajina: string; onZobraz: () => void }) {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("Výkazy k DPH")} />
      <PageBody>
        <div
          className="rounded-xl border border-border bg-card p-5 text-sm space-y-3"
          data-testid="vykazy-neplatitel"
        >
          <p className="font-medium">
            {krajina === "CZ" ? t("Firma nie je plátcom DPH") : t("Firma nie je platiteľom DPH")}
          </p>
          <p className="text-muted-foreground">
            {krajina === "CZ"
              ? t(
                  "Neplátce nepodáva přiznání k DPH, kontrolní hlášení ani souhrnné hlášení. Ak sa firma stala plátcom, zmeňte registráciu v Nastaveniach firmy.",
                )
              : t(
                  "Neplatiteľ nepodáva priznanie k DPH, kontrolný výkaz ani súhrnný výkaz. Ak sa firma stala platiteľom alebo sa registrovala podľa § 7 či § 7a, zmeňte registráciu v Nastaveniach firmy.",
                )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/firma" className="text-primary underline underline-offset-2">
              {t("Nastavenia firmy")}
            </Link>
            <button type="button" className="text-primary underline underline-offset-2" onClick={onZobraz}>
              {t("Zobraziť výkazy aj tak")}
            </button>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function PoznamkaRegistrovanejOsoby({ krajina }: { krajina: string }) {
  const { t } = useT();
  return (
    <div
      className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      data-testid="vykazy-registrovana"
    >
      {krajina === "CZ"
        ? t(
            "Identifikovaná osoba podáva přiznání len za obdobie, v ktorom jej vznikla povinnosť priznať daň (tovar alebo služby z EÚ), a souhrnné hlášení pri službách do EÚ. Kontrolní hlášení podáva len plátce.",
          )
        : t(
            "Registrovaná osoba podľa § 7 / § 7a podáva priznanie len za obdobie, v ktorom jej vznikla daňová povinnosť (tovar alebo služby z EÚ), a súhrnný výkaz pri službách do EÚ. Kontrolný výkaz podáva len platiteľ.",
          )}
    </div>
  );
}

type Vysledok = Awaited<ReturnType<typeof zostavVykazyFn>>;

const MESIACE = [
  "Január",
  "Február",
  "Marec",
  "Apríl",
  "Máj",
  "Jún",
  "Júl",
  "August",
  "September",
  "Október",
  "November",
  "December",
];

/* Riadky, ktoré z dokladov nevyplývajú — dopĺňa ich účtovník. */
const RUCNE_SPOLOCNE: { kluc: string; popis: string }[] = [
  { kluc: "r16", popis: "r16 Daň pri ukončení režimov (ropa, minerálne oleje)" },
  { kluc: "r26", popis: "r26 Nevymožiteľná pohľadávka — základ dane (opravné doklady § 25a sa dopĺňajú samy; sem len to, čo vo Fakteri nie je)" },
  { kluc: "r27", popis: "r27 Nevymožiteľná pohľadávka — daň (opravné doklady § 25a sa dopĺňajú samy)" },
  { kluc: "r29", popis: "r29 Oprava odpočítanej dane (§ 53b sa z nezaplatených prijatých faktúr dopĺňa sám; sem len to, čo vo Fakteri nie je)" },
  { kluc: "r30", popis: "r30 Odpočet dane pri registrácii (§ 55)" },
  { kluc: "r31", popis: "r31 Daň vrátená cestujúcim (§ 60)" },
  { kluc: "r34", popis: "r34 Nadmerný odpočet z predchádzajúceho obdobia" },
];

const RUCNE_2021: { kluc: string; popis: string }[] = [
  { kluc: "r11", popis: "r11 Trojstranný obchod — základ dane (druhý odberateľ)" },
  { kluc: "r12", popis: "r12 Trojstranný obchod — daň" },
  { kluc: "r22", popis: "r22 Odpočet dane pri dovoze — znížená sadzba" },
  { kluc: "r23", popis: "r23 Odpočet dane pri dovoze — základná sadzba" },
  ...RUCNE_SPOLOCNE,
];

/* Tlačivo od 07/2025 — trojstranný obchod, dovoz a odpočet pri dovoze po sadzbách 19 / 5 / 23 %. */
const RUCNE_2025: { kluc: string; popis: string }[] = [
  { kluc: "r11", popis: "r11 Trojstranný obchod 19 % — základ dane (druhý odberateľ)" },
  { kluc: "r12", popis: "r12 Trojstranný obchod 19 % — daň" },
  { kluc: "r11a", popis: "r11a Trojstranný obchod 5 % — základ dane" },
  { kluc: "r12a", popis: "r12a Trojstranný obchod 5 % — daň" },
  { kluc: "r11b", popis: "r11b Trojstranný obchod 23 % — základ dane" },
  { kluc: "r12b", popis: "r12b Trojstranný obchod 23 % — daň" },
  { kluc: "r11c", popis: "r11c Dovoz s daňou podľa § 84a ods. 3, 19 % — základ dane" },
  { kluc: "r12c", popis: "r12c Dovoz podľa § 84a ods. 3, 19 % — daň" },
  { kluc: "r11d", popis: "r11d Dovoz podľa § 84a ods. 3, 5 % — základ dane" },
  { kluc: "r12d", popis: "r12d Dovoz podľa § 84a ods. 3, 5 % — daň" },
  { kluc: "r11e", popis: "r11e Dovoz podľa § 84a ods. 3, 23 % — základ dane" },
  { kluc: "r12e", popis: "r12e Dovoz podľa § 84a ods. 3, 23 % — daň" },
  { kluc: "r22", popis: "r22 Odpočet dane zaplatenej colnému orgánu pri dovoze — 19 %" },
  { kluc: "r22a", popis: "r22a Odpočet dane zaplatenej colnému orgánu pri dovoze — 5 %" },
  { kluc: "r23", popis: "r23 Odpočet dane zaplatenej colnému orgánu pri dovoze — 23 %" },
  { kluc: "r23a", popis: "r23a Odpočet dane uplatnenej podľa § 84a ods. 3 — 19 %" },
  { kluc: "r23b", popis: "r23b Odpočet dane uplatnenej podľa § 84a ods. 3 — 5 %" },
  { kluc: "r23c", popis: "r23c Odpočet dane uplatnenej podľa § 84a ods. 3 — 23 %" },
  ...RUCNE_SPOLOCNE,
];

const POPIS_SPOLOCNE: Record<string, string> = {
  r13: "Oslobodené dodania celkom",
  r14: "Z toho dodanie tovaru do EÚ (§ 43)",
  r15: "Z toho vývoz a prepravné služby (§ 46, § 47)",
  r16: "Daň pri ukončení režimov",
  r17: "Daň celkom",
  r24: "Oprava základu dane (§ 25)",
  r25: "Oprava dane (§ 25)",
  r26: "Nevymožiteľná pohľadávka — základ dane",
  r27: "Nevymožiteľná pohľadávka — daň",
  r28: "Oprava odpočítanej dane (§ 53)",
  r29: "Oprava odpočítanej dane (§ 53b)",
  r30: "Odpočet dane pri registrácii",
  r31: "Daň vrátená cestujúcim",
  r32: "Vlastná daňová povinnosť",
  r33: "Nadmerný odpočet",
  r34: "Nadmerný odpočet z minulého obdobia",
  r35: "Daň na úhradu",
};

/* Pôvodné tlačivo (obdobia do 06/2025): znížené sadzby spolu. Poradie = poradie v tlačive. */
const POPIS_2021: Record<string, string> = {
  r01: "Dodanie tovaru a služby — znížená sadzba, základ dane",
  r02: "Dodanie tovaru a služby — znížená sadzba, daň",
  r03: "Dodanie tovaru a služby — základná sadzba, základ dane",
  r04: "Dodanie tovaru a služby — základná sadzba, daň",
  r05: "Nadobudnutie tovaru z EÚ — znížená sadzba, základ dane",
  r06: "Nadobudnutie tovaru z EÚ — znížená sadzba, daň",
  r07: "Nadobudnutie tovaru z EÚ — základná sadzba, základ dane",
  r08: "Nadobudnutie tovaru z EÚ — základná sadzba, daň",
  r09: "Daň platí príjemca (§ 69) — základ dane",
  r10: "Daň platí príjemca (§ 69) — daň",
  r11: "Trojstranný obchod — základ dane",
  r12: "Trojstranný obchod — daň",
  r13: POPIS_SPOLOCNE.r13,
  r14: POPIS_SPOLOCNE.r14,
  r15: POPIS_SPOLOCNE.r15,
  r16: POPIS_SPOLOCNE.r16,
  r17: POPIS_SPOLOCNE.r17,
  r18: "Odpočítanie dane — znížená sadzba",
  r19: "Odpočítanie dane — základná sadzba",
  r20: "Z toho z tuzemska — znížená sadzba",
  r21: "Z toho z tuzemska — základná sadzba",
  r22: "Z toho pri dovoze — znížená sadzba",
  r23: "Z toho pri dovoze — základná sadzba",
  ...POPIS_SPOLOCNE,
};

/* Tlačivo od 07/2025 (vzor MF/007833/2025-731) — riadky po sadzbách 19 %, 5 % a 23 %. */
const POPIS_2025: Record<string, string> = {
  r01: "Dodanie tovaru a služby 19 % — základ dane",
  r01a: "Dodanie tovaru a služby 5 % — základ dane",
  r02: "Dodanie tovaru a služby 19 % — daň",
  r02a: "Dodanie tovaru a služby 5 % — daň",
  r03: "Dodanie tovaru a služby 23 % — základ dane",
  r04: "Dodanie tovaru a služby 23 % — daň",
  r05: "Nadobudnutie tovaru z EÚ 19 % — základ dane",
  r05a: "Nadobudnutie tovaru z EÚ 5 % — základ dane",
  r06: "Nadobudnutie tovaru z EÚ 19 % — daň",
  r06a: "Nadobudnutie tovaru z EÚ 5 % — daň",
  r07: "Nadobudnutie tovaru z EÚ 23 % — základ dane",
  r08: "Nadobudnutie tovaru z EÚ 23 % — daň",
  r09: "Daň platí príjemca (§ 69) 19 % — základ dane",
  r09a: "Daň platí príjemca (§ 69) 5 % — základ dane",
  r09b: "Daň platí príjemca (§ 69) 23 % — základ dane",
  r10: "Daň platí príjemca (§ 69) 19 % — daň",
  r10a: "Daň platí príjemca (§ 69) 5 % — daň",
  r10b: "Daň platí príjemca (§ 69) 23 % — daň",
  r11: "Trojstranný obchod 19 % — základ dane",
  r11a: "Trojstranný obchod 5 % — základ dane",
  r11b: "Trojstranný obchod 23 % — základ dane",
  r11c: "Dovoz podľa § 84a ods. 3, 19 % — základ dane",
  r11d: "Dovoz podľa § 84a ods. 3, 5 % — základ dane",
  r11e: "Dovoz podľa § 84a ods. 3, 23 % — základ dane",
  r12: "Trojstranný obchod 19 % — daň",
  r12a: "Trojstranný obchod 5 % — daň",
  r12b: "Trojstranný obchod 23 % — daň",
  r12c: "Dovoz podľa § 84a ods. 3, 19 % — daň",
  r12d: "Dovoz podľa § 84a ods. 3, 5 % — daň",
  r12e: "Dovoz podľa § 84a ods. 3, 23 % — daň",
  r13: POPIS_SPOLOCNE.r13,
  r14: POPIS_SPOLOCNE.r14,
  r15: POPIS_SPOLOCNE.r15,
  r16: POPIS_SPOLOCNE.r16,
  r17: POPIS_SPOLOCNE.r17,
  r18: "Odpočítanie dane 19 %",
  r18a: "Odpočítanie dane 5 %",
  r19: "Odpočítanie dane 23 %",
  r20: "Z toho z tuzemska 19 %",
  r20a: "Z toho z tuzemska 5 %",
  r21: "Z toho z tuzemska 23 %",
  r22: "Z toho dovoz (colný orgán) 19 %",
  r22a: "Z toho dovoz (colný orgán) 5 %",
  r23: "Z toho dovoz (colný orgán) 23 %",
  r23a: "Z toho dovoz podľa § 84a ods. 3, 19 %",
  r23b: "Z toho dovoz podľa § 84a ods. 3, 5 %",
  r23c: "Z toho dovoz podľa § 84a ods. 3, 23 %",
  ...POPIS_SPOLOCNE,
};

function eur(n: number | undefined): string {
  return (n ?? 0).toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stiahni(nazov: string, obsah: string) {
  const blob = new Blob([obsah], { type: "application/xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nazov;
  a.click();
  URL.revokeObjectURL(a.href);
}

function VykazyPage({ uvod }: { uvod?: ReactNode }) {
  const { t } = useT();
  const zostav = useServerFn(zostavVykazyFn);
  const uloz = useServerFn(ulozVykazFn);

  const dnes = new Date();
  const predchadzajuci = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
  const [rok, setRok] = useState(predchadzajuci.getFullYear());
  const [rezim, setRezim] = useState<"mesiac" | "stvrtrok">("mesiac");
  const [mesiac, setMesiac] = useState(predchadzajuci.getMonth() + 1);
  const [stvrtrok, setStvrtrok] = useState(Math.floor(predchadzajuci.getMonth() / 3) + 1);
  const [typ, setTyp] = useState<TypVykazu>("R");
  const [danovyUrad, setDanovyUrad] = useState("");
  const [konatel, setKonatel] = useState("");
  const [rucne, setRucne] = useState<Record<string, string>>({});
  const [data, setData] = useState<Vysledok | null>(null);
  const [nacitavam, setNacitavam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const cisla = useMemo(() => {
    const von: Record<string, number> = {};
    for (const [k, v] of Object.entries(rucne)) {
      const n = Number(String(v).replace(",", "."));
      if (Number.isFinite(n) && n !== 0) von[k] = n;
    }
    return von;
  }, [rucne]);

  const nacitaj = useCallback(async () => {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    setNacitavam(true);
    setChyba(null);
    try {
      const res = await zostav({
        data: {
          company_id: companyId,
          rok,
          mesiac: rezim === "mesiac" ? mesiac : null,
          stvrtrok: rezim === "stvrtrok" ? stvrtrok : null,
          rucne: cisla,
        },
      });
      setData(res);
      setDanovyUrad((d) => d || res.hlavicka.danovyUrad);
      setKonatel((k) => k || res.hlavicka.konatel);
    } catch (e: any) {
      setChyba(e?.message ?? t("Nepodarilo sa zostaviť výkazy."));
    } finally {
      setNacitavam(false);
    }
  }, [zostav, rok, rezim, mesiac, stvrtrok, cisla, t]);

  useEffect(() => {
    nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rok, rezim, mesiac, stvrtrok]);

  const firmaXml = data
    ? {
        icDph: data.firma.ic_dph ?? "",
        dic: data.firma.dic ?? "",
        nazov: data.firma.name ?? "",
        ulica: data.firma.street ?? "",
        cislo: "",
        psc: data.firma.zip ?? "",
        obec: data.firma.city ?? "",
        stat: "Slovensko",
        tel: data.firma.phone ?? "",
        email: data.firma.email ?? "",
        danovyUrad,
        konatel,
      }
    : null;

  const registrovanaOsoba =
    data?.firma?.vat_scheme === "sk_7" || data?.firma?.vat_scheme === "sk_7a";
  const oznacenie =
    rezim === "mesiac" ? `${rok}-${String(mesiac).padStart(2, "0")}` : `${rok}-Q${stvrtrok}`;

  async function ulozAOznac(druh: "priznanie" | "kv" | "sv", obsah: Record<string, unknown>) {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    try {
      await uloz({
        data: {
          company_id: companyId,
          druh,
          typ,
          rok,
          mesiac: rezim === "mesiac" ? mesiac : null,
          stvrtrok: rezim === "stvrtrok" ? stvrtrok : null,
          data: { ...obsah, danovyUrad, konatel },
          podane: true,
        },
      });
      toast.success(t("Zapísané ako podané."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť."));
    }
  }

  // Tlačivo podľa obdobia: od 07/2025 nové s riadkami po sadzbách.
  const verzia = verziaPriznania({
    rok,
    mesiac: rezim === "mesiac" ? mesiac : null,
    stvrtrok: rezim === "stvrtrok" ? stvrtrok : null,
  });
  const POPIS_RIADKOV = verzia === "2025" ? POPIS_2025 : POPIS_2021;
  const RUCNE = verzia === "2025" ? RUCNE_2025 : RUCNE_2021;
  const riadkyPriznania = Object.keys(POPIS_RIADKOV).filter(
    (k) => (data?.priznanie as Record<string, number>)?.[k] !== undefined,
  );

  return (
    <>
      <PageHeader
        title={t("Výkazy k DPH")}
        description={t(
          "Priznanie, kontrolný výkaz a súhrnný výkaz zostavené z dokladov, v XML pre eDane.",
        )}
      />
      <PageBody>
        {uvod}
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Rok")}</span>
            <input
              type="number"
              value={rok}
              onChange={(e) => setRok(Number(e.target.value))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Zdaňovacie obdobie")}</span>
            <select
              value={rezim}
              onChange={(e) => setRezim(e.target.value as "mesiac" | "stvrtrok")}
              className="input mt-1"
            >
              <option value="mesiac">{t("Mesiac")}</option>
              <option value="stvrtrok">{t("Štvrťrok")}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Obdobie")}</span>
            {rezim === "mesiac" ? (
              <select
                value={mesiac}
                onChange={(e) => setMesiac(Number(e.target.value))}
                className="input mt-1"
              >
                {MESIACE.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {t(m)}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={stvrtrok}
                onChange={(e) => setStvrtrok(Number(e.target.value))}
                className="input mt-1"
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {t("{q}. štvrťrok", { q })}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Druh")}</span>
            <select
              value={typ}
              onChange={(e) => setTyp(e.target.value as TypVykazu)}
              className="input mt-1"
            >
              <option value="R">{t("Riadny")}</option>
              <option value="O">{t("Opravný")}</option>
              <option value="D">{t("Dodatočný")}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Daňový úrad")}</span>
            <input
              value={danovyUrad}
              onChange={(e) => setDanovyUrad(e.target.value)}
              placeholder={t("napr. {x}", { x: "Bratislava" })}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("Výkaz podáva")}</span>
            <input
              value={konatel}
              onChange={(e) => setKonatel(e.target.value)}
              placeholder={t("Meno a priezvisko")}
              className="input mt-1"
            />
          </label>
        </div>

        {chyba && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chyba}
          </div>
        )}

        {nacitavam && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t("Zostavujem z dokladov…")}
          </div>
        )}

        {data && (
          <>
            <p className="text-sm text-muted-foreground">
              {t("V období: {vystavene}, {prijate} a {doklady}.", {
                vystavene: t(
                  slovoPodlaPoctu(
                    data.pocty.vystavene,
                    "{n} vystavená faktúra",
                    "{n} vystavené faktúry",
                    "{n} vystavených faktúr",
                  ),
                  { n: data.pocty.vystavene },
                ),
                prijate: t(
                  slovoPodlaPoctu(data.pocty.prijate, "{n} prijatá", "{n} prijaté", "{n} prijatých"),
                  { n: data.pocty.prijate },
                ),
                doklady: t(
                  slovoPodlaPoctu(
                    data.pocty.doklady,
                    "{n} doklad s DPH",
                    "{n} doklady s DPH",
                    "{n} dokladov s DPH",
                  ),
                  { n: data.pocty.doklady },
                ),
              })}
            </p>

            <ZoznamVytiek
                vytky={data.vytky}
                nadpis={t("Pred podaním treba doplniť ({n})", { n: data.vytky.length })}
              />

            {/* Priznanie */}
            <section className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="text-base font-semibold">{t("Priznanie k DPH")}</div>
                  <div className="text-xs text-muted-foreground">
                    {verzia === "2025"
                      ? t("Vzor DPH2025 (od 07/2025)")
                      : t("Vzor DPHv21 (do 06/2025)")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      firmaXml &&
                      stiahni(
                        `dph-priznanie-${oznacenie}.xml`,
                        priznanieNaXml(
                          data.priznanie as Record<string, number>,
                          firmaXml,
                          data.obdobie,
                          {
                            typ,
                            registrovanaOsoba,
                          },
                        ),
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                  >
                    <Download className="h-4 w-4" /> XML
                  </button>
                  <button
                    onClick={() =>
                      ulozAOznac("priznanie", data.priznanie as Record<string, unknown>)
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-accent"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Podané")}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {riadkyPriznania.map((k) => (
                      <tr key={k} className="border-b border-border last:border-0">
                        <td className="px-4 py-1.5 text-muted-foreground">{t(POPIS_RIADKOV[k])}</td>
                        <td className="suma px-4 py-1.5 text-right">
                          {eur((data.priznanie as Record<string, number>)[k])}
                          <span className="suma-mena">€</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="border-t border-border px-4 py-3 text-sm">
                <summary className="cursor-pointer font-semibold">
                  {t("Riadky, ktoré z dokladov nevyplývajú")}
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {RUCNE.map((r) => (
                    <label key={r.kluc} className="block">
                      <span className="text-xs text-muted-foreground">{t(r.popis)}</span>
                      <input
                        value={rucne[r.kluc] ?? ""}
                        onChange={(e) => setRucne((p) => ({ ...p, [r.kluc]: e.target.value }))}
                        onBlur={nacitaj}
                        inputMode="decimal"
                        className="input mt-1"
                      />
                    </label>
                  ))}
                </div>
              </details>
            </section>

            {/* Kontrolný výkaz */}
            <section className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="text-base font-semibold">{t("Kontrolný výkaz")}</div>
                  <div className="text-xs text-muted-foreground">{t("Schéma KVDPH 2025")}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      firmaXml &&
                      stiahni(
                        `kv-dph-${oznacenie}.xml`,
                        kvNaXml(data.kv, firmaXml, data.obdobie, typ),
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                  >
                    <Download className="h-4 w-4" /> XML
                  </button>
                  <button
                    onClick={() => ulozAOznac("kv", data.kv as unknown as Record<string, unknown>)}
                    className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-accent"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Podané")}
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-border text-sm">
                {[
                  ["A.1 — vystavené faktúry s daňou", data.kv.a1.length],
                  ["A.2 — tuzemský prenos daňovej povinnosti", data.kv.a2.length],
                  ["B.1 — prijaté plnenia so samozdanením", data.kv.b1.length],
                  ["B.2 — prijaté faktúry s odpočtom", data.kv.b2.length],
                  ["B.3.1 — bločky sumárne", data.kv.b31 ? 1 : 0],
                  ["B.3.2 — bločky po dodávateľoch", data.kv.b32.length],
                  ["C.1 — vystavené opravné doklady", data.kv.c1.length],
                  ["C.2 — prijaté opravné doklady", data.kv.c2.length],
                  ["D.2 — ostatné vydané faktúry sumárne", data.kv.d2 ? 1 : 0],
                ].map(([popis, pocet]) => (
                  <li key={String(popis)} className="flex justify-between gap-3 px-4 py-2">
                    <span className={`min-w-0 ${pocet ? "" : "text-muted-foreground"}`}>{t(String(popis))}</span>
                    <span className={`shrink-0 tabular-nums ${pocet ? "font-semibold" : "text-muted-foreground"}`}>{pocet as number}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Súhrnný výkaz */}
            <section className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="text-base font-semibold">{t("Súhrnný výkaz")}</div>
                  <div className="text-xs text-muted-foreground">{t("Dodania do EÚ, vzor SVDPHv20")}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      firmaXml &&
                      stiahni(
                        `sv-dph-${oznacenie}.xml`,
                        svNaXml(data.sv, firmaXml, data.obdobie, { typ }),
                      )
                    }
                    disabled={data.sv.riadky.length === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" /> XML
                  </button>
                  <button
                    onClick={() => ulozAOznac("sv", data.sv as unknown as Record<string, unknown>)}
                    disabled={data.sv.riadky.length === 0}
                    className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Podané")}
                  </button>
                </div>
              </div>
              {data.sv.riadky.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  {t(
                    "V období nie je žiadne dodanie do iného členského štátu — súhrnný výkaz sa nepodáva.",
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2">{t("Štát")}</th>
                      <th className="whitespace-nowrap px-4 py-2">{t("IČ DPH odberateľa")}</th>
                      <th className="whitespace-nowrap px-4 py-2">{t("Druh plnenia")}</th>
                      <th className="whitespace-nowrap px-4 py-2 text-right">{t("Hodnota")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sv.riadky.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-2">{r.kodStatu}</td>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">{r.idCislo}</td>
                        <td className="px-4 py-2">
                          {r.kod === ""
                            ? t("Tovar")
                            : r.kod === "1"
                              ? t("Trojstranný obchod")
                              : t("Služba")}
                        </td>
                        <td className="suma px-4 py-2 text-right">
                          {eur(r.hodnota)}
                          <span className="suma-mena">€</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>

            <p className="text-xs text-muted-foreground">
              {t(
                "XML sa nahráva do eDane alebo na portál finančnej správy, kde sa podpíše. Faktero výkazy neodosiela — kontrolu a podanie robí ten, kto za priznanie zodpovedá.",
              )}
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}
