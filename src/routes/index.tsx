import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BellRing,
  Blocks,
  Boxes,
  Building,
  Building2,
  Calculator,
  CheckCircle2,
  Code2,
  CreditCard,
  ClipboardList,
  Database,
  FileSpreadsheet,
  FileText,
  Flag,
  HardHat,
  Landmark,
  Mail,
  MapPin,
  Minus,
  Plug,
  QrCode,
  Quote,
  Receipt,
  Repeat,
  Rocket,
  ScanLine,
  Send,
  ShieldCheck,
  ShoppingCart,
  ListChecks,
  Download,
  ArrowLeftRight,
  Smartphone,
  Sparkles,
  Tags,
  TrendingUp,
  Truck,
  Upload,
  UserPlus,
  Wallet,
  Webhook,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { MarketingNav } from "@/components/faktero/MarketingNav";
import { PublicSupportWidget } from "@/components/faktero/PublicSupportWidget";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { track } from "@/lib/faktero/track";
import {
  ANDROID_STRANKA,
  APP_STORE_FAKTERO,
  APP_STORE_KNIHA_JAZD,
  APP_STORE_ODZNAK,
} from "@/lib/faktero/obchody";
import { PartneriPas } from "@/components/faktero/PartneriPas";
import { zoznamPartnerovPublic } from "@/lib/partneri.functions";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/")({
  /*
    Partneri sa načítajú pri vykresľovaní stránky, nie až v prehliadači —
    hlavná stránka sa vykresľuje na serveri a pás, ktorý dobehne až potom, by
    obsah poskakoval. Keď načítanie zlyhá, sekcia sa jednoducho nevykreslí;
    kvôli zoznamu partnerov nemá padnúť celá stránka.
  */
  loader: async () => {
    try {
      return { partneri: await zoznamPartnerovPublic() };
    } catch {
      return { partneri: [] };
    }
  },
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "Faktero — Fakturácia pre moderné firmy. API a eFaktúra v jednom.") },
        {
          name: "description",
          content: preloz(
            j,
            "Vystavujte faktúry, posielajte PDF, automatizujte cez API a pripravte firmu na eFaktúru 2027. Pohoda export, prechod z iného systému. 30 dní zdarma.",
          ),
        },
        { property: "og:title", content: preloz(j, "Faktero — Fakturácia pre moderné firmy") },
        {
          property: "og:description",
          content: preloz(
            j,
            "API, eFaktúra a automatizácia v jednom systéme. Pohoda export, REST API, opakované faktúry. Pripravené na eFaktúru 2027.",
          ),
        },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Landing,
});

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

const trustMetrics = [
  { label: "eFaktúra Ready", icon: ShieldCheck },
  { label: "FinStat integrácia", icon: Database },
  { label: "Prepojenie s Pohodou", icon: Plug },
  { label: "API First", icon: Code2 },
  { label: "Webhooky", icon: Webhook },
] as const;

const features = [
  {
    icon: FileText,
    title: "Faktúry a PDF",
    text: "Profesionálne PDF s logom, QR platbou, IBAN a rozpisom DPH. Pripojte dodací list či zmluvu a odošlite jedným klikom.",
  },
  {
    icon: Quote,
    title: "Cenové ponuky",
    text: "Vystavte ponuku za minútu a jedným klikom ju premeňte na ostrú faktúru.",
  },
  {
    icon: Repeat,
    title: "Opakované faktúry",
    text: "Mesačné a ročné šablóny — generujú a odosielajú sa automaticky bez vašej účasti.",
  },
  {
    icon: Code2,
    title: "API a webhooky",
    text: "REST API s test / live režimom, idempotencia cez external_id a real-time webhooky.",
  },
  {
    icon: QrCode,
    title: "QR platba na faktúre",
    text: "Odberateľ naskenuje kód v mobilnej banke — suma aj variabilný symbol sú predvyplnené.",
  },
  {
    icon: Landmark,
    title: "Bankové párovanie",
    /* Priamo sa pripája Tatra banka, Wise a Revolut Business. Účty v SLSP, VÚB
       či ČSOB natiahne Faktero vtedy, keď ich má človek v TB cez multibanking —
       sľubovať ich ako samostatné pripojenie by bolo klamlivé. */
    text: "Automatické párovanie platieb s faktúrami. Priame pripojenie Tatra banky, Wise, Revolut Business a Wallesteru; účty v SLSP, VÚB či ČSOB natiahneme cez multibanking v Tatra banke.",
  },
  {
    icon: Receipt,
    title: "Prijaté faktúry",
    text: "Evidujte výdavky a prijaté faktúry. Aging záväzkov, DPH na vstupe, export pre účtovníka.",
  },
  {
    icon: BellRing,
    title: "Upomienky",
    text: "Automatické upomienky po splatnosti. 3 úrovne, vlastné texty, prehľad odoslaných upomienok.",
  },
  {
    icon: BadgeCheck,
    title: "Schvaľovanie zákazníkom",
    text: "Zákazník schváli faktúru jedným kliknutím cez email. Bez registrácie, okamžite.",
  },
  {
    icon: Send,
    title: "E-mailové šablóny",
    /* Spojené s kartou „Z vašej e-mailovej adresy“ — uvoľnilo miesto pre
       Firmy v Nemecku a mriežka ostala po 4. */
    text: "Vlastné texty e-mailov pre faktúry, upomienky aj schvaľovanie. Ak chcete, chodia odberateľom z faktury@vasafirma.sk cez váš poštový server.",
  },
  {
    icon: Blocks,
    title: "Hromadné akcie",
    text: "Označte, odošlite alebo exportujte desiatky faktúr naraz. Ušetrite hodiny manuálnej práce.",
  },
  {
    icon: ShoppingCart,
    title: "E-shop na WooCommerce",
    text: "Hotový doplnok pre WordPress: z každej objednávky vznikne faktúra sama, so sumami na cent a s PDF pre zákazníka.",
  },
  {
    icon: Plug,
    title: "Prepojenie s Pohodou",
    text: "Pohoda si doklady stiahne sama každú noc a vráti čísla, ktoré im pridelila. Účtovníčka pritom nič neinštaluje.",
  },
  {
    icon: Upload,
    title: "Prechod z iného systému",
    text: "Prejdite na Faktero bez straty histórie faktúr, odberateľov a číselných radov.",
  },
  {
    icon: ShieldCheck,
    title: "eFaktúra 2027",
    text: "Štruktúrované XML, Peppol a Digitálny poštár. Sme pripravení, aby ste nemuseli vy.",
  },
  {
    icon: ScanLine,
    title: "Skener bločkov",
    text: "Naskenujte QR kód z bločku a doklad sa načíta z Finančnej správy aj s položkami.",
  },
  {
    icon: Mail,
    title: "Doklady e-mailom",
    text: "Faktúru od dodávateľa prepošlete na svoju adresu a zaeviduje sa sama — aj s dodávateľom, sumami a DPH.",
  },
  {
    icon: Smartphone,
    title: "Faktero v telefóne",
    text: "Faktúra, skenovanie dokladov aj kniha jázd priamo z mobilu. Skenovanie funguje aj bez signálu.",
  },
  {
    icon: Tags,
    title: "Cenník, zľavy a akcie",
    text: "Dohodnuté ceny pre odberateľa, množstevné ceny a časovo obmedzené akcie — cena sa doplní sama.",
  },
  {
    icon: HardHat,
    title: "Zákazky a ziskovosť",
    text: "Faktúry, materiál a jazdy na jednej zákazke. Uvidíte, koľko na nej naozaj ostalo.",
  },
  {
    icon: ClipboardList,
    title: "Prijaté objednávky",
    text: "Od objednávky po faktúru aj po častiach — fakturuje sa vždy len to, čo ešte nebolo.",
  },
  {
    icon: Wallet,
    title: "Pokladňa a eKasa",
    text: "Stav hotovosti z pokladničných dokladov aj z bločkov, ktoré ste zaplatili v hotovosti.",
  },
  {
    icon: Calculator,
    title: "DPH a uzávierka",
    text: "Podklad pre priznanie s rozpisom po sadzbách a zámok na obdobie, ktoré už bolo podané.",
  },
  {
    icon: Boxes,
    title: "Skladové hospodárstvo",
    text: "Príjemky, výdajky, viacero skladov a prepojenie skladových položiek priamo s faktúrami.",
  },
  {
    icon: Truck,
    title: "Dodací list na naskladnenie",
    text: "Odfoťte dodací list od dodávateľa — položky aj nákupné ceny sa prečítajú a tovar sa naskladní.",
  },
  {
    icon: MapPin,
    title: "Kniha jázd + Commander GPS",
    text: "Prepojenie na Commander GPS — jazdy a tankovania sa sťahujú automaticky do knihy jázd.",
  },
  {
    icon: Banknote,
    title: "Leasingy a úvery",
    text: "Splátkový kalendár s rozpadom na istinu, úrok a DPH. Zmluvu načítate z PDF a splátky si Faktero páruje s platbami z banky.",
  },
  {
    icon: BadgeCheck,
    title: "Samofakturácia",
    text: "Faktúru za dodávateľa vyhotovíte vy podľa § 72 ods. 4, on ju odsúhlasí jedným klikom z e-mailu. Potom ide rovno do DPH a na úhradu.",
  },
  {
    icon: Wallet,
    title: "Vyúčtovanie výdavkov",
    text: "Bločky a faktúry, ktoré zaplatil zamestnanec zo zálohy, vlastnými peniazmi či firemnou kartou — súhrn, doplatok a PDF na podpis.",
  },
  {
    icon: Flag,
    title: "Firmy v Nemecku",
    text: "Nemecká faktúra s vetami podľa UStG a GiroCode, ZUGFeRD v každom PDF, XRechnung, export do DATEV a prehľad UStVA.",
  },
  {
    icon: Quote,
    title: "Zdrojový e-mail pri doklade",
    text: "„To je za september, zákazka Novák“ — text mailu, s ktorým doklad prišiel, ostane pri doklade aj po spracovaní.",
  },
  {
    icon: ShieldCheck,
    title: "Stráž duplicít",
    text: "Tá istá faktúra od dodávateľa druhýkrát — mailom, nahratá či cez eFaktúru — sa nezaeviduje bez otázky a nezaplatí dvakrát.",
  },
] as const;

const accounting = [
  {
    icon: FileSpreadsheet,
    title: "Pohoda: konektor alebo XML",
    text: "Buď si Pohoda doklady stiahne sama, alebo dostanete XML na import — aj s predkontáciami a členením DPH.",
  },
  {
    icon: Receipt,
    title: "Mesačné podklady",
    text: "Jedným klikom pripravíte balík faktúr, ponúk a nákladov za zvolený mesiac.",
  },
  {
    icon: Upload,
    title: "Import faktúr",
    text: "Faktúry, odberatelia aj prijaté doklady zo SuperFaktúry, iDokladu, Pohody, Money S3, Omegy, KROSu či Doklada.",
  },
  {
    icon: TrendingUp,
    title: "Výkazy k DPH",
    text: "Daňové priznanie, kontrolný a súhrnný výkaz v XML na podanie, s rozpadom po sadzbách a obdobiach.",
  },
  {
    icon: Download,
    title: "Zaúčtované aj mimo Pohody",
    text: "Vystavené, prijaté faktúry aj bločky s predkontáciou do Omegy, Money S3, ABRA Flexi, a súpiska pre MRP či Helios.",
  },
  {
    icon: ArrowLeftRight,
    title: "Výpisy z platobných brán",
    text: "Export zo Stripe, PayPal, GoPay, Comgate či Barionu ako bankový výpis — platby, poplatky a výbery zvlášť.",
  },
  {
    icon: ListChecks,
    title: "Automatické účtovanie",
    text: "Bloček, prijatá aj vystavená faktúra či pohyb v banke dostane predkontáciu, členenie DPH a KV sám, hneď ako vznikne.",
  },
  {
    icon: Send,
    title: "Hromadný príkaz na úhradu",
    text: "Vyberte prijaté faktúry a stiahnite SEPA XML pre internetbanking — zaplatíte ich naraz, so symbolmi.",
  },
  {
    icon: Wallet,
    title: "Vyúčtovanie výdavkov zamestnancov",
    text: "Výdavky zo zálohy či vlastných peňazí s výsledkom na podpis; bločky idú do Pohody ako interný doklad, nie z pokladne.",
  },
  {
    icon: Code2,
    title: "API pre prijaté doklady",
    text: "Prijaté faktúry a bločky so zaúčtovaním, zmeny od posledného stiahnutia a nahratie dokladov — pre váš vlastný program.",
  },
  {
    icon: Download,
    title: "Export do DATEV",
    text: "Pre klientov z Nemecka: Buchungsstapel so SKR03 alebo SKR04, Beraternummer a Mandantennummer a účty, ktoré sa dajú prepísať.",
  },
  {
    icon: Calculator,
    title: "UStVA pre nemecké firmy",
    text: "Kennzahlen za mesiac či štvrťrok zostavené z dokladov — v CSV a PDF na prepis do ELSTER.",
  },
] as const;

const plans = [
  {
    name: "Starter",
    price: "9 €",
    period: "/ mesiac",
    tagline: "Pre živnostníkov, ktorí vystavia pár faktúr mesačne.",
    features: [
      "1 firma",
      "Neobmedzene faktúr a ponúk",
      "PDF s QR platbou",
      "Pohoda export",
      "E-mail podpora",
    ],
    cta: "Vyskúšať zdarma",
    ctaTo: "/registracia",
    featured: false,
  },
  {
    // Názov, cena aj rozsah musia sedieť s tabuľkou subscription_plans, z ktorej
    // číta cenník. Predtým tu stál plán „Business 24 €", ktorý v nej roky nebol.
    name: "Premium",
    price: "19 €",
    period: "/ mesiac",
    tagline: "Pre s.r.o. a tímy bez stropov. API, webhooky a importy.",
    features: [
      "Neobmedzene firiem a používateľov",
      "Opakované faktúry",
      "REST API + webhooky",
      "Prechod z iného systému",
      "Záznam zmien a prioritná podpora",
    ],
    cta: "Vyskúšať zdarma",
    ctaTo: "/registracia",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Na mieru",
    period: "",
    tagline: "Pre firmy s vlastnou integráciou a vyšším objemom.",
    features: [
      "Neobmedzene firiem",
      "SLA a dedikovaná podpora",
      // SSO (SAML) Faktero nemá; prihlasovanie chráni dvojfaktorové overenie.
      "Vlastné role, dvojfaktor a audit log",
      "Konzultácie pri integrácii",
      "Vlastné podmienky",
    ],
    cta: "Kontaktovať",
    // Tlačidlo hovorí „Kontaktovať", tak nech aj kontaktuje — dovtedy viedlo
    // na registráciu ako ostatné dva plány.
    ctaTo: "/kontakt",
    featured: false,
  },
] as const;

const codeExample = `POST /api/v1/invoices
Authorization: Bearer fk_live_••••
Idempotency-Key: ord_8421
Content-Type: application/json

{
  "external_id": "ord_8421",
  "customer": { "ico": "12345678" },
  "items": [
    { "name": "Web design",  "quantity": 1, "unit_price": 1200, "vat_rate": 23 },
    { "name": "Hosting 12 m", "quantity": 1, "unit_price": 180,  "vat_rate": 23 }
  ],
  "due_in_days": 14,
  "send_email": true
}`;

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground antialiased">
      <MarketingNav />

      <main>
        <Hero />
        <TrustRow />
        <PartneriSection />
        <ScreenshotShowcase />
        <HowItWorks />
        <FeatureGrid />
        <ApiSection />
        <EFakturaSection />
        <IntegrationsTrust />
        <AccountingSection />
        <MobileAppSection />
        <ComparisonSection />
        <PricingSection />
        <FounderStory />
        <FaqSection />
        <FinalCta />
      </main>

      <SiteFooter />
      <PublicSupportWidget />
      <FloatingCta />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

function Hero() {
  const { t } = useT();
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.68 0.16 162 / 0.5), transparent)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 md:pb-28 md:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 [&>*]:min-w-0">
          <div className="min-w-0">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
                <Sparkles className="h-3 w-3" />
                {t("eFaktúra 2027 — zadarmo v každom pláne")}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{" "}
                {t("Private Beta · Prijímame prvých testerov")}
              </div>
            </div>
            <h1 className="text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground sm:text-5xl md:text-6xl lg:text-[4.25rem]">
              {t("Fakturácia pripravená na")}{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-br from-primary via-primary to-primary/70 bg-clip-text text-transparent">
                  {t("rok 2027.")}
                </span>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t(
                "Vystavujte faktúry, posielajte PDF, automatizujte procesy cez API a pripravte firmu na povinnú",
              )}{" "}
              <span className="font-medium text-foreground">{t("eFaktúru")}</span>.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/registracia"
                onClick={() => {
                  track("registration_click", { source: "hero" });
                  track("trial_start", { source: "hero" });
                }}
                className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:translate-y-[-1px] hover:shadow-[var(--shadow-elegant)]"
              >
                {t("Vyskúšať zdarma")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#api"
                onClick={() => track("api_docs_click", { source: "hero" })}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-5 py-3 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-secondary"
              >
                <Code2 className="h-4 w-4" /> {t("Pozrieť API")}
              </a>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["30 dní zdarma", "Bezpečné platby cez GoPay", "Zrušenie kedykoľvek"].map((x) => (
                <li key={x} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {t(x)}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative w-full min-w-0 max-w-full lg:justify-self-end">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard mockup                                                           */
/* -------------------------------------------------------------------------- */

function DashboardMockup() {
  const { t } = useT();
  return (
    <div className="relative min-w-0 max-w-full">
      {/* Decorative ambient glows — na mobile bez presahu, inak rozširuje stránku */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 sm:-inset-6 rounded-[2rem] opacity-70 blur-3xl"
        style={{ background: "var(--brand-gradient)" }}
      />
      <div className="relative rounded-[1.5rem] border border-border/70 bg-card/95 p-2 shadow-[var(--shadow-elegant)] backdrop-blur">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
          <span className="ml-3 truncate text-[11px] text-muted-foreground">
            {t("app.faktero.sk / prehlad")}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t("Live")}
          </span>
        </div>

        <div className="space-y-3 rounded-[1.1rem] bg-background p-3 sm:p-4">
          {/* Top KPI strip */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 [&>*]:min-w-0">
            <KpiCard
              icon={<Banknote className="h-3.5 w-3.5" />}
              label={t("Neuhradené faktúry")}
              value="4 218 €"
              hint={t("12 faktúr")}
              trend="+8,4 %"
              trendPositive
            />
            <KpiCard
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label={t("Cashflow (30 dní)")}
              value="+14 920 €"
              hint={t("46 platieb")}
              trend="+12,1 %"
              trendPositive
            />
          </div>

          {/* Cashflow chart */}
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("Cashflow")}
                </div>
                <div className="mt-0.5 text-sm font-semibold">{t("Posledných 12 týždňov")}</div>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                +18,3 %
              </span>
            </div>
            <MiniBarChart />
          </div>

          {/* Bottom row: eFaktúra + API */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 [&>*]:min-w-0">
            <MiniEFakturaCard />
            <MiniApiStatusCard />
          </div>

          {/* Last received payment */}
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("Posledná prijatá platba")}
              </div>
              <div className="truncate text-sm font-semibold">
                {t("Acme s.r.o.")}{" "}
                <span className="text-muted-foreground font-normal">{t("· FA2026-0042")}</span>
              </div>
            </div>
            <div className="ml-auto shrink-0 text-right">
              <div className="whitespace-nowrap text-sm font-bold tabular-nums">+1 698,60 €</div>
              <div className="text-[10px] text-muted-foreground">
                {t("pred 4 min · bankový prevod")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating side card */}
      <div className="absolute -bottom-4 -left-4 hidden w-60 rotate-[-3deg] rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-elegant)] md:block">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold">{t("FA2026-0042")}</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {t("Acme s.r.o. · 1 698,60 €")}
            </div>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t("Uhradená")}
          </span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  trend,
  trendPositive,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  trend: string;
  trendPositive?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-card p-3.5">
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="shrink-0 text-primary">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div className="whitespace-nowrap text-lg font-bold tracking-tight">{value}</div>
        <span
          className={
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
            (trendPositive
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/15 text-destructive")
          }
        >
          <ArrowUpRight className="h-3 w-3" /> {trend}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function MiniBarChart() {
  const bars = [38, 52, 44, 68, 60, 76, 64, 88, 72, 96, 82, 110];
  const max = Math.max(...bars);
  return (
    <div className="mt-3 flex h-20 items-end gap-1.5">
      {bars.map((v, i) => {
        const h = Math.round((v / max) * 100);
        const isLast = i === bars.length - 1;
        return (
          /* h-full: bez neho má obal výšku 0 a percentuálna výška stĺpca
             sa nemá z čoho počítať — graf ostal prázdny biely box. */
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${h}%`,
                background: isLast
                  ? "var(--brand-gradient)"
                  : "color-mix(in oklab, var(--primary) 20%, transparent)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function MiniEFakturaCard() {
  const { t } = useT();
  const [zost, setT] = useState<{ d: number; h: number; m: number }>({ d: 0, h: 0, m: 0 });
  useEffect(() => {
    const tick = () => {
      const target = new Date("2027-01-01T00:00:00+01:00").getTime();
      const diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setT({ d, h, m });
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {t("eFaktúra 2027")}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums tracking-tight">{zost.d}</span>
        <span className="text-[10px] uppercase text-muted-foreground">{t("dní")}</span>
        <span className="ml-1 text-sm font-semibold tabular-nums text-muted-foreground">
          {String(zost.h).padStart(2, "0")}:{String(zost.m).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full"
          style={{ width: "62%", background: "var(--brand-gradient)" }}
        />
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">{t("Pripravenosť integrácie")}</div>
    </div>
  );
}

function MiniApiStatusCard() {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-primary" /> {t("API status")}
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t("OK")}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-xl font-bold tracking-tight">142</span>
        <span className="text-[10px] text-muted-foreground">{t("ms · p95")}</span>
      </div>
      <div className="mt-2 grid h-8 grid-cols-12 items-end gap-[3px]">
        {Array.from({ length: 24 }).map((_, i) => {
          const h = 35 + Math.round(Math.sin(i * 0.7) * 18 + Math.random() * 12);
          return (
            <div
              key={i}
              className="rounded-[2px]"
              style={{
                height: `${h}%`,
                background:
                  i > 18
                    ? "var(--primary)"
                    : "color-mix(in oklab, var(--primary) 35%, transparent)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Trust row                                                                  */
/* -------------------------------------------------------------------------- */

/** Pás partnerov. Čo je v ňom, spravuje admin v Nastaveniach → Partneri. */
function PartneriSection() {
  const { partneri } = Route.useLoaderData();
  return <PartneriPas partneri={partneri} />;
}

function TrustRow() {
  const { t } = useT();
  return (
    <section className="border-y border-border/60 bg-card/40 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-8 md:py-10">
        <div className="grid grid-cols-2 items-center gap-x-4 gap-y-8 sm:grid-cols-3 lg:flex lg:justify-between">
          {trustMetrics.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="group flex min-w-0 items-center justify-start gap-2.5 sm:gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <span className="min-w-0 text-sm font-medium leading-snug text-foreground sm:text-[15px] lg:whitespace-nowrap">
                {t(label)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Feature grid                                                               */
/* -------------------------------------------------------------------------- */

function FeatureGrid() {
  const { t } = useT();
  return (
    <section id="funkcie" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionHeader
          eyebrow={t("Funkcie")}
          title={t("Všetko, čo potrebujete na fakturáciu")}
          subtitle={t(
            "Od jednoduchej faktúry po REST API, opakované faktúry a pripravenosť na eFaktúru 2027.",
          )}
        />
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative bg-card p-6 transition-colors hover:bg-card/80"
            >
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{t(f.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(f.text)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* API section (dark premium)                                                 */
/* -------------------------------------------------------------------------- */

function ApiSection() {
  const { t } = useT();
  return (
    <section id="api" className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "var(--gradient-dark)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(60% 40% at 10% 0%, oklch(0.68 0.16 162 / 0.25), transparent 60%), radial-gradient(40% 30% at 90% 100%, oklch(0.85 0.13 85 / 0.18), transparent 60%)",
        }}
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 md:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="min-w-0 text-sidebar-foreground">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
              <Code2 className="h-3 w-3" /> {t("Pre vývojárov")}
            </div>
            <h2 className="text-balance break-words text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {t("REST API, ktoré")}{" "}
              <span className="text-primary">{t("vyzerá ako u veľkých")}</span>.
            </h2>
            <p className="mt-5 w-full max-w-lg break-words text-sidebar-foreground/70">
              {t(
                "Vystavujte faktúry priamo z vášho e-shopu, CRM alebo ERP. Predvídateľné JSON odpovede, idempotencia, webhooky a oddelený test / live režim.",
              )}
            </p>
            <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
              {[
                { t: "API kľúče", d: "Bearer tokeny pre test a live." },
                { t: "Webhooky", d: "Real-time stav faktúry." },
                { t: "Idempotencia", d: "external_id zabráni duplicitám." },
                { t: "Test / live", d: "Vyvíjajte bez vplyvu na ostro." },
              ].map((i) => (
                <li
                  key={i.t}
                  className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur"
                >
                  <div className="text-sm font-semibold text-sidebar-foreground">{t(i.t)}</div>
                  <div className="mt-1 text-xs text-sidebar-foreground/65">{t(i.d)}</div>
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="/docs/api"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:translate-y-[-1px]"
              >
                {t("API dokumentácia")} <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/api-playground"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-sidebar-foreground hover:bg-white/10"
              >
                {t("Playground")}
              </a>
            </div>
          </div>

          <CodeCard />
        </div>
      </div>
    </section>
  );
}

function CodeCard() {
  const { t } = useT();
  return (
    <div className="relative w-full min-w-0 max-w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[1.75rem] opacity-60 blur-2xl"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.68 0.16 162 / 0.45), oklch(0.85 0.13 85 / 0.25))",
        }}
      />
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.13_0.02_250)] shadow-[var(--shadow-elegant)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent/80" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary/80" />
          <span className="ml-3 truncate text-xs font-medium text-white/60">
            {t("POST /api/v1/invoices")}
          </span>
          <span className="ml-auto shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70">
            {t("201 Created · 142 ms")}
          </span>
        </div>
        <pre className="w-full min-w-0 max-w-full overflow-x-auto p-6 text-[12.5px] leading-relaxed">
          <code className="text-white/85">{highlightCode(codeExample)}</code>
        </pre>
      </div>
    </div>
  );
}

// Lightweight inline highlighter — keeps the card crisp without a runtime dep.
function highlightCode(src: string) {
  const lines = src.split("\n");
  return lines.map((line, idx) => {
    const keyMatch = line.match(/^(\s*)("[^"]+")\s*:\s*(.+?)(,?)$/);
    if (keyMatch) {
      const [, indent, key, val, comma] = keyMatch;
      const isString = /^".*"$/.test(val.trim());
      return (
        <span key={idx}>
          {indent}
          <span className="text-[oklch(0.78_0.14_175)]">{key}</span>
          <span className="text-white/55">: </span>
          <span className={isString ? "text-[oklch(0.85_0.13_85)]" : "text-[oklch(0.85_0.16_162)]"}>
            {val.replace(/,$/, "")}
          </span>
          {comma}
          {"\n"}
        </span>
      );
    }
    if (/^(POST|GET|PUT|DELETE|PATCH)\s/.test(line)) {
      const [verb, ...rest] = line.split(" ");
      return (
        <span key={idx}>
          <span className="text-[oklch(0.85_0.16_162)] font-semibold">{verb}</span>{" "}
          <span className="text-white">{rest.join(" ")}</span>
          {"\n"}
        </span>
      );
    }
    if (/^[A-Z][A-Za-z-]+:/.test(line)) {
      const [k, ...v] = line.split(":");
      return (
        <span key={idx}>
          <span className="text-[oklch(0.78_0.14_175)]">{k}</span>
          <span className="text-white/55">:</span>
          <span className="text-white/80">{v.join(":")}</span>
          {"\n"}
        </span>
      );
    }
    return <span key={idx}>{line + "\n"}</span>;
  });
}

/* -------------------------------------------------------------------------- */
/* eFaktúra                                                                   */
/* -------------------------------------------------------------------------- */

function EFakturaSection() {
  const { t } = useT();
  return (
    <section id="efaktura-2027" className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 80% 0%, oklch(0.68 0.16 162 / 0.10), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {t("Pripravené na 2027 ✓")}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
              {t("eFaktúra")} <span className="text-primary">{t("zadarmo")}</span>{" "}
              {t("v každom pláne")}
            </h2>
            {/* Od 13. 10. 2026 beží odosielanie cez ePoštáka naostro. */}
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t(
                "Faktúry vo formáte eFaktúry pripraví Faktero za vás a odošle ich cez Peppol. Žiadna extra registrácia, žiadne skryté poplatky —",
              )}{" "}
              <span className="font-semibold text-foreground">
                {t("eFaktúra je zahrnutá v cene")}
              </span>
              {t(". Odosielanie cez Peppol beží naostro od októbra 2026.")}
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Odoslanie cez sieť Peppol bez extra krokov — s PDF faktúry a prílohami.",
                "Žiadne poplatky za odoslanú eFaktúru, v každom pláne.",
                "Strojovo čitateľný XML formát (UBL 2.1) namiesto PDF prílohy.",
                "Pripravené na povinnosť pre B2B a B2G od 1.1.2027.",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t(x)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/registracia"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
              >
                {t("Pripraviť firmu")} <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="/efakturacia"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold hover:bg-secondary"
              >
                {t("Zistiť viac")}
              </a>
            </div>
          </div>

          <BigCountdownCard />
        </div>
      </div>
    </section>
  );
}

function BigCountdownCard() {
  const { t } = useT();
  const [zost, setT] = useState<{ d: number; h: number; m: number; s: number }>({
    d: 0,
    h: 0,
    m: 0,
    s: 0,
  });
  useEffect(() => {
    const tick = () => {
      const target = new Date("2027-01-01T00:00:00+01:00").getTime();
      const diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setT({ d, h, m, s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const items: Array<[number, string]> = [
    [zost.d, "Dní"],
    [zost.h, "Hodín"],
    [zost.m, "Minút"],
    [zost.s, "Sekúnd"],
  ];
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] opacity-60 blur-2xl"
        style={{ background: "var(--brand-gradient)" }}
      />
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)] md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("Štart eFaktúry")}
            </div>
            <div className="mt-1 text-lg font-semibold">{t("1. január 2027")}</div>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            {t("Povinné")}
          </span>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-2 md:gap-3">
          {items.map(([val, label]) => (
            <div key={label} className="flex flex-col items-center">
              <div className="flex h-16 w-full items-center justify-center rounded-xl border border-border bg-background text-2xl font-bold tabular-nums tracking-tight text-foreground md:h-20 md:text-3xl">
                {String(val).padStart(2, "0")}
              </div>
              <span className="mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t(label)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {["XML", "Peppol", "Digitálny poštár", "B2B", "B2G"].map((b) => (
            <span
              key={b}
              className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Accounting                                                                 */
/* -------------------------------------------------------------------------- */

function AccountingSection() {
  const { t } = useT();
  return (
    <section id="uctovnici" className="border-y border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Calculator className="h-3 w-3" /> {t("Pre účtovníkov")}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
              {t("Mesačné podklady")} <span className="text-primary">{t("jedným klikom")}</span>.
            </h2>
            <p className="mt-5 max-w-md text-muted-foreground">
              {t(
                "Pohoda konektor aj XML, sedem formátov exportu vrátane DATEV, výkazy k DPH, pravidlá účtovania a výpisy z platobných brán — pripravené pre desiatky klientov bez ručného prepisovania.",
              )}
            </p>
            <Link
              to="/registracia"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
            >
              {t("Vyskúšať pre účtovnícku firmu")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {accounting.map((a) => (
              <div
                key={a.title}
                className="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-[var(--shadow-card)]"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <a.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{t(a.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(a.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pricing                                                                    */
/* -------------------------------------------------------------------------- */

function PricingSection() {
  const { t } = useT();
  return (
    <section id="cennik" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionHeader
          eyebrow={t("Cenník")}
          title={t("Jednoduchý cenník. 30 dní zdarma.")}
          subtitle={t("Začnite zdarma, prejdite na platený plán až keď vám Faktero ušetrí čas.")}
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={[
                "relative flex flex-col rounded-2xl p-7 transition-all",
                p.featured
                  ? "border border-primary/40 bg-card shadow-[var(--shadow-elegant)] ring-1 ring-primary/30"
                  : "border border-border bg-card hover:border-primary/30",
              ].join(" ")}
            >
              {p.featured && (
                <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground shadow-[var(--shadow-glow)]">
                  {t("Najobľúbenejší")}
                </span>
              )}
              <div className="text-sm font-semibold text-muted-foreground">{t(p.name)}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{t(p.price)}</span>
                {p.period && <span className="text-sm text-muted-foreground">{t(p.period)}</span>}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{t(p.tagline)}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{t(f)}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={p.ctaTo}
                onClick={() => track("pricing_click", { plan: p.name, featured: p.featured })}
                className={[
                  "mt-8 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold",
                  p.featured
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
                    : "border border-border bg-card hover:bg-secondary",
                ].join(" ")}
              >
                {t(p.cta)} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t("Všetky plány zahŕňajú 30-dňovú skúšobnú dobu zdarma. Bez platobnej karty.")}
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Final CTA                                                                  */
/* -------------------------------------------------------------------------- */

function ComparisonSection() {
  const { t, jazyk } = useT();
  const rows: Array<{
    label: string;
    faktero: boolean | string;
    ine: boolean | string;
    manual: boolean | string;
  }> = [
    // Overené proti SuperFaktúre 19. 10. 2026 — tvrdiť, že konkurencia nemá
    // sklad, knihu jázd či bankové párovanie, by nebola pravda.
    { label: "REST API", faktero: true, ine: "Obmedzene", manual: false },
    { label: "Webhooky", faktero: true, ine: "Obmedzene", manual: false },
    {
      label: "eFaktúra bez poplatku za odoslanú faktúru",
      faktero: true,
      ine: "Často za poplatok",
      manual: false,
    },
    {
      label: "Výkazy k DPH (priznanie, kontrolný a súhrnný výkaz)",
      faktero: true,
      ine: "Obmedzene",
      manual: false,
    },
    {
      label: "Zaúčtovanie a export do Pohody s predkontáciou",
      faktero: true,
      ine: "Obmedzene",
      manual: false,
    },
    { label: "Opakované faktúry", faktero: true, ine: true, manual: false },
    { label: "QR platba na faktúre", faktero: true, ine: true, manual: false },
    { label: "Bankové párovanie", faktero: true, ine: true, manual: false },
    { label: "Prijaté faktúry", faktero: true, ine: true, manual: false },
    { label: "Mobilná aplikácia", faktero: "iPhone, Android", ine: "Rôzne", manual: false },
    { label: "Upomienky po splatnosti", faktero: true, ine: true, manual: false },
    { label: "Schvaľovanie faktúr zákazníkom", faktero: true, ine: false, manual: false },
    { label: "Skladové hospodárstvo", faktero: true, ine: true, manual: false },
    {
      label: "Kniha jázd s GPS a automatickým rozpoznaním jazdy",
      faktero: true,
      ine: "Bez GPS",
      manual: false,
    },
    { label: "Zákazky, leasingy a úvery", faktero: true, ine: false, manual: false },
  ];
  const cell = (v: boolean | string) => {
    if (v === true) return <CheckCircle2 className="mx-auto h-5 w-5 text-primary" />;
    if (v === false) return <X className="mx-auto h-5 w-5 text-muted-foreground/50" />;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> {t(v)}
      </span>
    );
  };
  return (
    <section id="porovnanie" className="border-y border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionHeader
          eyebrow={t("Porovnanie")}
          title={t("Prečo si firmy vyberajú Faktero")}
          subtitle={t(
            "Neutrálne porovnanie funkcií, ktoré sú dnes dôležité pre moderné slovenské firmy.",
          )}
        />
        <div className="mt-12 overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("Funkcia")}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-primary">
                    {t("Faktero")}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("INÉ FAKTURAČNÉ SYSTÉMY")}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("Manuálna fakturácia")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label} className={i % 2 === 0 ? "bg-card" : "bg-background/40"}>
                    <td className="px-6 py-4 font-medium text-foreground">{t(r.label)}</td>
                    <td className="px-6 py-4 text-center">{cell(r.faktero)}</td>
                    <td className="px-6 py-4 text-center">{cell(r.ine)}</td>
                    <td className="px-6 py-4 text-center">{cell(r.manual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("Údaje k {datum}. Funkcie konkurencie sa môžu meniť.", {
            datum: new Date().toLocaleDateString(lokalJazyka(jazyk), {
              month: "long",
              year: "numeric",
            }),
          })}
        </p>
      </div>
    </section>
  );
}

function MobileAppSection() {
  const { t } = useT();
  const items = [
    {
      icon: ScanLine,
      title: "Skenovanie dokladov s AI OCR",
      text: "Odfotíte doklad — AI vyplní sumu, DPH, dodávateľa aj dátum.",
    },
    {
      icon: MapPin,
      title: "GPS tracking jázd",
      text: "Automatický záznam trás pre knihu jázd priamo z mobilu.",
    },
    {
      icon: BellRing,
      title: "Push notifikácie",
      text: "Okamžite viete, keď vám prišla platba alebo je faktúra po splatnosti.",
    },
    {
      icon: Wifi,
      title: "Offline režim",
      text: "Fakturujte aj bez signálu — po pripojení sa všetko synchronizuje.",
    },
  ];
  return (
    <section id="mobil" className="border-y border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Smartphone className="h-3 w-3" /> {t("iPhone aj Android")}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl whitespace-pre-line">
              {t("Faktero v mobile")}
              {"\n"}
              <span className="text-primary">{t("fakturujte kdekoľvek")}</span>
            </h2>
            <p className="mt-5 max-w-lg text-muted-foreground">
              {/* Pôvodne tu stálo „s offline režimom". Appka bez signálu naozaj zapíše
                  jazdu aj doklad, ale rozhranie sa načítava zo živého webu — pri
                  studenom štarte bez pripojenia sa neotvorí. Sľubujme len to, čo platí. */}
              {t(
                "Appka pre iPhone aj Android so skenovaním dokladov a GPS knihou jázd — pre iPhone z App Store, pre Android zatiaľ priamo z webu. Jazdu aj odfotený doklad zapíše aj bez signálu a odošle ich, len čo ste online.",
              )}
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {items.map((i) => (
                <li key={i.title} className="rounded-xl border border-border bg-card p-4">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <i.icon className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-semibold">{t(i.title)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t(i.text)}</div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* Oficiálny odznak Apple — na svetlom aj tmavom pozadí ho drží jeho sivý rámik. */}
              <a
                href={APP_STORE_FAKTERO}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("Stiahnuť Faktero v App Store")}
                className="inline-block rounded-lg transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <img
                  src={APP_STORE_ODZNAK}
                  alt={t("Download on the App Store")}
                  className="h-12 w-auto"
                />
              </a>
              {/* Kým appka nie je v Google Play, Android ju sťahuje z webu ako APK. */}
              <Link
                to={ANDROID_STRANKA}
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-semibold transition hover:border-primary/40 hover:text-primary"
              >
                <Smartphone className="h-4 w-4" /> {t("Stiahnuť pre Android")}
              </Link>
            </div>
            {/*
              Samostatná appka Kniha jázd — pre toho, kto potrebuje len jazdy,
              napríklad vodiča vo firme, ktorý s faktúrami nerobí. V obchode je
              zvlášť, s vlastnou ikonou, tak aj tu.
            */}
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
              <img src="/kniha-jazd-icon.png" alt="" className="h-12 w-12 shrink-0 rounded-[22%]" />
              <div className="min-w-0 flex-1 basis-48">
                <div className="text-sm font-semibold">{t("Potrebujete len knihu jázd?")}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t("Samostatná appka")} <strong>{t("Kniha jázd")}</strong>{" "}
                  {t("pre vodičov — jazdy rozpozná a zapíše sama, aj s telefónom vo vrecku.")}
                </div>
              </div>
              <a
                href={APP_STORE_KNIHA_JAZD}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("Stiahnuť Knihu jázd v App Store")}
                className="inline-block shrink-0 rounded-lg transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <img
                  src={APP_STORE_ODZNAK}
                  alt={t("Download on the App Store")}
                  className="h-10 w-auto"
                />
              </a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4 -z-10 sm:-inset-8 rounded-[3rem] opacity-60 blur-3xl"
              style={{ background: "var(--brand-gradient)" }}
            />
            <div className="relative rounded-[2.5rem] border-[10px] border-foreground/90 bg-background p-4 shadow-[var(--shadow-elegant)]">
              <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-foreground/20" />
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("Dnes")}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{t("3 nové platby · +2 340 €")}</div>
                </div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] p-3">
                  <div className="flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <div className="text-sm font-semibold">{t("Doklad naskenovaný")}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("Shell · 62,40 € · DPH 23 %")}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">{t("Kniha jázd")}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("BA → TT · 68 km · automaticky")}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm font-semibold">{t("FA2026-0042 uhradená")}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("Acme s.r.o. · 1 698,60 €")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const { t } = useT();
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[oklch(0.14_0.025_250)] p-10 text-center text-sidebar-foreground md:p-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-80"
          style={{
            background:
              "radial-gradient(50% 60% at 50% 0%, oklch(0.68 0.16 162 / 0.35), transparent 70%), radial-gradient(40% 40% at 90% 100%, oklch(0.85 0.13 85 / 0.20), transparent 70%)",
          }}
        />
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Zap className="h-5 w-5" />
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
          {t("Prestaňte strácať čas")} <span className="text-primary">{t("fakturáciou")}</span>.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sidebar-foreground/70">
          {t("Začnite za pár minút. 30 dní zdarma, bez platobnej karty.")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/registracia"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
          >
            {t("Vyskúšať zdarma")} <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:podpora@faktero.sk"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-sidebar-foreground hover:bg-white/10"
          >
            {t("Kontaktovať nás")}
          </a>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-sidebar-foreground/60">
          {["30 dní zdarma", "Bez platobnej karty", "Slovenská podpora", "GDPR"].map((x) => (
            <span key={x} className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" /> {t(x)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

function SiteFooter() {
  const { t } = useT();
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:gap-10 sm:px-6 sm:py-14 sm:grid-cols-2 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div className="sm:col-span-2 md:col-span-1">
          <div className="text-lg font-bold tracking-tight">{t("Faktero")}</div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            {t(
              "Moderná fakturácia s API pre slovenské a české firmy. Pripravené na eFaktúru 2027.",
            )}
          </p>
        </div>
        {[
          {
            title: "Produkt",
            links: [
              ["Funkcie", "/funkcie"],
              ["Cenník", "/cennik"],
              ["eFaktúra 2027", "/efakturacia"],
              ["Blog", "/blog"],
            ],
          },
          {
            title: "Pre vývojárov",
            links: [
              ["REST API", "/vyvojari/rest"],
              ["Webhooky", "/vyvojari/webhooky"],
              ["Skúšobné prostredie", "/vyvojari/playground"],
            ],
          },
          {
            title: "Účtovníci",
            links: [
              ["Prepojenie s Pohodou", "/uctovnici/pohoda-konektor"],
              ["Pohoda export", "/uctovnici/pohoda-export"],
              ["Mesačné podklady", "/uctovnici/mesacne-podklady"],
              ["Integrácie", "/uctovnici/integracie"],
            ],
          },
          {
            title: "Firma",
            links: [
              // Návody boli dosiahnuteľné len zvnútra aplikácie a cez Google.
              // Kto sa ešte len rozhoduje, nemal ako zistiť, že vôbec sú.
              ["Návody a pomoc", "/pomoc"],
              ["Prihlásenie", "/prihlasenie"],
              ["Registrácia", "/registracia"],
              ["Kontakt", "/kontakt"],
            ],
          },
        ].map((col) => (
          <div key={col.title}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(col.title)}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-foreground/80 hover:text-foreground">
                    {t(label)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-5 py-5 text-xs text-muted-foreground sm:items-center sm:px-6 sm:py-6 md:flex-row">
          <div className="order-2 md:order-1">
            {t(
              "© 2026 Tobify s. r. o. — Športová 707/43, 919 26 Zavar · IČO: 56607016 · DIČ: 2122358579 · info@faktero.sk · +421 902 101 967",
            )}
          </div>
          <div className="order-1 flex flex-wrap items-center gap-x-4 gap-y-2 md:order-2 md:gap-x-5">
            <a href="/pravne/obchodne-podmienky" className="hover:text-foreground">
              {t("Obchodné podmienky")}
            </a>
            <a href="/pravne/gdpr" className="hover:text-foreground">
              {t("GDPR")}
            </a>
            <a href="/pravne/spracovanie-udajov" className="hover:text-foreground">
              {t("Spracúvanie údajov (čl. 28)")}
            </a>
            <a href="/pravne/tesla-podmienky" className="hover:text-foreground">
              {t("Tesla Fleet API")}
            </a>
            <a href="/kontakt" className="hover:text-foreground">
              {t("Kontakt")}
            </a>
          </div>
        </div>
        <div
          className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 pb-6 sm:px-6"
          aria-label={t("Podporované spôsoby platby")}
        >
          <span className="text-xs text-muted-foreground">{t("Platby zabezpečuje:")}</span>
          <img
            src="https://cdn.gopay.com/img/logo/gopay_logo.svg"
            alt={t("GoPay")}
            width={64}
            height={20}
            loading="lazy"
            className="h-5 w-auto"
          />
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg"
            alt={t("Visa")}
            width={40}
            height={16}
            loading="lazy"
            className="h-4 w-auto"
          />
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
            alt={t("Mastercard")}
            width={28}
            height={20}
            loading="lazy"
            className="h-5 w-auto"
          />
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        {eyebrow}
      </div>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{subtitle}</p>
    </div>
  );
}

// keep imports tree-shake friendly
void Building2;
void ShieldCheck;
void Landmark;
void Wallet;

/* -------------------------------------------------------------------------- */
/* Screenshot showcase                                                        */
/* -------------------------------------------------------------------------- */

function ScreenshotShowcase() {
  const { t } = useT();
  const shots = [
    {
      key: "dashboard",
      title: "Prehľad firmy",
      desc: "Cashflow, neuhradené faktúry a stav eFaktúry na jednom mieste.",
      node: <ShotDashboard />,
    },
    {
      key: "list",
      title: "Zoznam faktúr",
      desc: "Rýchle filtre, stavy a hromadné akcie pre desiatky faktúr mesačne.",
      node: <ShotInvoiceList />,
    },
    {
      key: "detail",
      title: "Detail faktúry",
      desc: "PDF, QR platba, úhrady a história udalostí v jednom okne.",
      node: <ShotInvoiceDetail />,
    },
    {
      key: "efaktura",
      title: "Pripravenosť na eFaktúru",
      desc: "Pripravenosť na povinný XML formát 1.1.2027.",
      node: <ShotEfaktura />,
    },
  ];
  const [active, setActive] = useState(shots[0].key);
  const current = shots.find((s) => s.key === active) ?? shots[0];
  return (
    <section id="ukazky" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-28">
        <SectionHeader
          eyebrow={t("Produkt")}
          title={t("Pozrite si Faktero v akcii")}
          subtitle={t("Skutočné obrazovky aplikácie od prehľadu cez faktúru po eFaktúru.")}
        />
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {shots.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              className={[
                "rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors",
                active === s.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary",
              ].join(" ")}
            >
              {t(s.title)}
            </button>
          ))}
        </div>
        <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">{t(current.title)}</h3>
            <p className="mt-3 text-muted-foreground">{t(current.desc)}</p>
            <Link
              to="/registracia"
              onClick={() => track("registration_click", { source: "screenshots" })}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
            >
              {t("Vyskúšať zdarma")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] opacity-50 blur-3xl sm:-inset-4"
              style={{ background: "var(--brand-gradient)" }}
            />
            <div className="rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-elegant)]">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                <span className="ml-3 truncate text-[11px] text-muted-foreground">
                  {t("app.faktero.sk")}
                </span>
              </div>
              <div className="rounded-xl bg-background p-3 sm:p-4">{current.node}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShotDashboard() {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { l: "Neuhradené", v: "4 218 €" },
          { l: "Cashflow 30 d", v: "+14 920 €" },
          { l: "Po splatnosti", v: "612 €" },
        ].map((k) => (
          <div key={k.l} className="min-w-0 rounded-lg border border-border bg-card p-2 sm:p-3">
            <div className="truncate text-[9px] uppercase tracking-normal text-muted-foreground sm:text-[10px] sm:tracking-wider">
              {k.l}
            </div>
            <div className="mt-1 whitespace-nowrap text-xs font-bold tabular-nums sm:text-base">
              {k.v}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("Cashflow")}
        </div>
        <MiniBarChart />
      </div>
      <div className="rounded-lg border border-border bg-card p-3 text-xs">
        <div className="font-semibold">{t("Najnovšie aktivity")}</div>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li>{t("· FA2026-0042 · Acme s.r.o. · +1 698,60 € · prevod")}</li>
          <li>{t("· FA2026-0041 · Beta s.r.o. · odoslaná e-mailom")}</li>
          <li>{t("· Nový odberateľ: Gamma s.r.o.")}</li>
        </ul>
      </div>
    </div>
  );
}

function ShotInvoiceList() {
  const { t } = useT();
  const rows = [
    { n: "FA2026-0042", c: "Acme s.r.o.", s: "Uhradená", sum: "1 698,60 €", color: "emerald" },
    { n: "FA2026-0041", c: "Beta s.r.o.", s: "Odoslaná", sum: "920,00 €", color: "primary" },
    {
      n: "FA2026-0040",
      c: "Gamma s.r.o.",
      s: "Po splatnosti",
      sum: "612,00 €",
      color: "destructive",
    },
    { n: "FA2026-0039", c: "Delta s.r.o.", s: "Koncept", sum: "240,00 €", color: "muted" },
    { n: "FA2026-0038", c: "Epsilon s.r.o.", s: "Uhradená", sum: "3 600,00 €", color: "emerald" },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[1.2fr_2fr_1fr_1fr] gap-3 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{t("Číslo")}</span>
        <span>{t("Odberateľ")}</span>
        <span>{t("Stav")}</span>
        <span className="text-right">{t("Suma")}</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.n}
          className={
            "grid grid-cols-[1.2fr_2fr_1fr_1fr] gap-3 px-3 py-2.5 text-xs " +
            (i % 2 ? "bg-background" : "bg-card")
          }
        >
          <span className="font-mono font-semibold">{r.n}</span>
          <span className="truncate text-foreground">{r.c}</span>
          <span>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                r.color === "emerald" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                r.color === "primary" && "bg-primary/15 text-primary",
                r.color === "destructive" && "bg-destructive/15 text-destructive",
                r.color === "muted" && "bg-secondary text-muted-foreground",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {t(r.s)}
            </span>
          </span>
          <span className="text-right font-semibold tabular-nums">{r.sum}</span>
        </div>
      ))}
    </div>
  );
}

function ShotInvoiceDetail() {
  const { t } = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-4 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("Faktúra")}
            </div>
            <div className="text-base font-bold">{t("FA2026-0042")}</div>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t("Uhradená")}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="text-muted-foreground">{t("Dodávateľ")}</div>
            <div className="font-semibold">{t("Faktero s.r.o.")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("Odberateľ")}</div>
            <div className="font-semibold">{t("Acme s.r.o.")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("Splatnosť")}</div>
            <div className="font-semibold">{t("14. jún 2026")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("IBAN")}</div>
            <div className="font-mono">{t("SK12 1100…")}</div>
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-2 text-[11px]">
          <div className="flex justify-between py-1">
            <span>{t("Web design")}</span>
            <span className="tabular-nums">1 200,00 €</span>
          </div>
          <div className="flex justify-between py-1">
            <span>{t("Hosting 12 m")}</span>
            <span className="tabular-nums">180,00 €</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 font-bold">
            <span>{t("Spolu s DPH")}</span>
            <span className="tabular-nums">1 698,60 €</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center text-[11px]">
          <div className="font-semibold">{t("QR platba")}</div>
          <div className="mx-auto mt-2 grid h-20 w-20 grid-cols-8 grid-rows-8 gap-[1px] bg-foreground/10 p-1">
            {Array.from({ length: 64 }).map((_, i) => (
              <div key={i} className={(i * 7) % 3 === 0 ? "bg-foreground" : "bg-transparent"} />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-[11px]">
          <div className="font-semibold">{t("Časová os")}</div>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>{t("· Vytvorená")}</li>
            <li>{t("· Odoslaná e-mailom")}</li>
            <li className="text-emerald-600 dark:text-emerald-400">
              {t("· Uhradená — spárované s bankou")}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ShotEfaktura() {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" /> {t("Vaša firma je pripravená na eFaktúru")}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-500/15">
          <div className="h-full w-[88%] bg-emerald-500" />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">{t("Pripravenosť 88 %")}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[
          ["IČO a IČ DPH overené", true],
          ["Bankové údaje (IBAN)", true],
          ["XML schéma UBL 2.1", true],
          ["Peppol identifikátor", false],
        ].map(([l, ok]) => (
          <div
            key={String(l)}
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5"
          >
            {ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <X className="h-4 w-4 text-muted-foreground" />
            )}
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  const { t } = useT();
  const steps = [
    {
      icon: Building,
      n: "01",
      title: "Vytvorte firmu",
      text: "Načítajte údaje z IČO. Faktero predvyplní názov, adresu a DPH.",
    },
    {
      icon: FileText,
      n: "02",
      title: "Vystavte faktúru",
      text: "Doplňte položky, vyberte odberateľa a odošlite PDF e-mailom.",
    },
    {
      icon: Wallet,
      n: "03",
      title: "Získajte zaplatené",
      text: "Klient zaplatí QR kódom z faktúry alebo prevodom. Úhrada sa spáruje automaticky.",
    },
  ];
  return (
    <section id="ako-to-funguje" className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-28">
        <SectionHeader
          eyebrow={t("Ako to funguje")}
          title={t("Od registrácie po prvú platbu za pár minút")}
          subtitle={t("Tri kroky a faktúra je na ceste. Bez návodov, bez školení.")}
        />
        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent md:block" />
          {steps.map((s) => (
            <div
              key={s.n}
              className="relative rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/12 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <span className="text-3xl font-bold tracking-tight text-primary/30">{s.n}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{t(s.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(s.text)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Integrations trust                                                         */
/* -------------------------------------------------------------------------- */

function IntegrationsTrust() {
  const { t } = useT();
  const items = [
    { name: "FinStat", desc: "Automatické dohľadanie firmy podľa IČO.", icon: Database },
    { name: "Tatra banka", desc: "Pohyby na účte a párovanie úhrad s faktúrami.", icon: Landmark },
    {
      name: "Pohoda",
      desc: "Doklady si Pohoda vezme sama a vráti čísla, ktoré im pridelila.",
      icon: FileSpreadsheet,
    },
    { name: "eFaktúra 2027", desc: "UBL 2.1 / Peppol pripravenosť.", icon: ShieldCheck },
    {
      name: "WooCommerce",
      desc: "Doplnok pre e-shop: faktúra z každej objednávky vznikne sama.",
      icon: ShoppingCart,
    },
    { name: "REST API", desc: "Vystavujte faktúry z vlastného e-shopu či CRM.", icon: Code2 },
  ];
  return (
    <section id="integracie" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-28">
        <SectionHeader
          eyebrow={t("Integrácie")}
          title={t("Navrhnuté pre slovenské firmy")}
          subtitle={t("Pracujeme s nástrojmi, ktoré už dnes používate.")}
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div
              key={i.name}
              className="rounded-2xl border border-border bg-card p-5 text-center transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <i.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-bold">{t(i.name)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t(i.desc)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Founder story                                                              */
/* -------------------------------------------------------------------------- */

function FounderStory() {
  const { t } = useT();
  return (
    <section id="pribeh" className="border-y border-border/60 bg-card/40">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Rocket className="h-3 w-3" /> {t("Prečo vzniklo Faktero")}
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
          {t("Existujúce nástroje na fakturáciu sú")}{" "}
          <span className="text-primary">{t("zastarané")}</span>
          {t(", zbytočne zložité a nepripravené na to, čo príde.")}
        </h2>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">
          {t(
            "Faktero som postavil pre seba — pre podnikateľov, ktorí chcú fakturovať rýchlo, automatizovať cez API a byť pripravení na povinnú eFaktúru 2027 skôr, ako začne tlačiť termín. Žiadne pop-upy, žiadne staré rozhrania, žiadne prekvapenia na faktúre na konci mesiaca.",
          )}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">{t("— zakladateľ Faktero")}</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                        */
/* -------------------------------------------------------------------------- */

function FaqSection() {
  const { t } = useT();
  const faqs = [
    {
      q: "Ako funguje skúšobná verzia?",
      a: "Po registrácii dostávate 30 dní zdarma s prístupom ku všetkým funkciám zvoleného plánu. Po skončení skúšky si vyberiete plán alebo môžete účet nechať bez aktivácie.",
    },
    {
      q: "Potrebujem platobnú kartu?",
      a: "Nie. Skúšobná verzia neviaže žiadnu platobnú kartu. Platobné údaje zadávate až pri aktivácii plateného plánu cez GoPay.",
    },
    {
      q: "Môžem prejsť zo SuperFaktúry?",
      a: "Áno. Faktúry, odberateľov aj prijaté doklady prenesiete zo SuperFaktúry, iDokladu, Pohody, Money S3, Omegy, KROSu aj Doklada — bez straty histórie.",
    },
    {
      q: "Máte API?",
      a: "Áno. REST API s test / live režimom, Bearer autentifikáciou, idempotenciou cez external_id a real-time webhookmi. Dostupné v pláne Business a Enterprise.",
    },
    {
      q: "Budete podporovať eFaktúru?",
      a: "Áno. Pripravujeme štruktúrované XML (UBL 2.1), Peppol identifikátor a integráciu s Digitálnym poštárom tak, aby ste boli pripravení na 1.1.2027.",
    },
    {
      q: "Koľko stojí odoslanie eFaktúry?",
      a: "Nič extra — eFaktúra cez Peppol je zahrnutá v cene každého plánu Faktero. Žiadne skryté poplatky za odoslanú faktúru.",
    },
    {
      q: "Je možné exportovať do Pohody?",
      a: "Áno. XML export priamo do Pohody dostávate v každom pláne — účtovník dostane podklady jedným klikom.",
    },
  ];
  return (
    <section id="faq" className="relative">
      <div className="mx-auto max-w-3xl px-6 py-24 md:py-28">
        <SectionHeader
          eyebrow={t("Časté otázky")}
          title={t("Odpovede na to, čo sa najčastejšie pýtate")}
          subtitle={t("Niečo nenašli ste? Napíšte nám na podpora@faktero.sk.")}
        />
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`q-${i}`}
              className="border-b border-border last:border-b-0"
            >
              <AccordionTrigger
                onClick={() => track("faq_open", { question: f.q })}
                className="text-left text-base font-semibold hover:no-underline"
              >
                {t(f.q)}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {t(f.a)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            to="/registracia"
            onClick={() => track("registration_click", { source: "faq" })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
          >
            {t("Vyskúšať zdarma")} <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:podpora@faktero.sk"
            onClick={() => track("contact_click", { source: "faq" })}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold hover:bg-secondary"
          >
            <Send className="h-4 w-4" /> {t("Kontaktovať")}
          </a>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Floating CTA                                                               */
/* -------------------------------------------------------------------------- */

function FloatingCta() {
  const { t } = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 800);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <>
      {/* Desktop: bottom-right floating button */}
      <div
        className={[
          "pointer-events-none fixed bottom-6 right-6 z-40 hidden transition-all duration-300 md:block",
          show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        ].join(" ")}
      >
        <Link
          to="/registracia"
          onClick={() => {
            track("floating_cta_click", { device: "desktop" });
            track("registration_click", { source: "floating_cta" });
          }}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
        >
          <UserPlus className="h-4 w-4" /> {t("Vyskúšať zdarma")}
        </Link>
      </div>
      {/* Mobile: sticky bottom bar */}
      <div
        className={[
          "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur transition-transform md:hidden",
          show ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <Link
          to="/registracia"
          onClick={() => {
            track("floating_cta_click", { device: "mobile" });
            track("registration_click", { source: "floating_cta" });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
        >
          {t("Vyskúšať zdarma")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}
