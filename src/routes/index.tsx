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
  Download,
  FileSpreadsheet,
  FileText,
  HardHat,
  Landmark,
  MapPin,
  Minus,
  QrCode,
  Quote,
  Receipt,
  Repeat,
  Rocket,
  ScanLine,
  Send,
  ShieldCheck,
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Faktero — Fakturácia pre moderné firmy. API a eFaktúra v jednom." },
      {
        name: "description",
        content:
          "Vystavujte faktúry, posielajte PDF, automatizujte cez API a pripravte firmu na eFaktúru 2027. Pohoda export, prechod z iného systému. 30 dní zdarma.",
      },
      { property: "og:title", content: "Faktero — Fakturácia pre moderné firmy" },
      {
        property: "og:description",
        content:
          "API, eFaktúra a automatizácia v jednom systéme. Pohoda export, REST API, opakované faktúry. Pripravené na eFaktúru 2027.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

const trustMetrics = [
  { label: "eFaktúra Ready", icon: ShieldCheck },
  { label: "FinStat Integrácia", icon: Database },
  { label: "Pohoda Export", icon: Download },
  { label: "API First", icon: Code2 },
  { label: "Webhooky", icon: Webhook },
] as const;

const features = [
  {
    icon: FileText,
    title: "Faktúry a PDF",
    text: "Profesionálne PDF s logom, QR platbou, IBAN a rozpisom DPH. Odošlite jedným klikom.",
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
    text: "Automatické párovanie platieb s faktúrami. Prepojenie s Tatra bankou, ČSOB, SLSP, VÚB a ďalšími bankami.",
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
    title: "Email šablóny",
    text: "Vlastné texty emailov pre faktúry, upomienky aj schvaľovanie. Slovenčina aj angličtina.",
  },
  {
    icon: Blocks,
    title: "Hromadné akcie",
    text: "Označte, odošlite alebo exportujte desiatky faktúr naraz. Ušetrite hodiny manuálnej práce.",
  },
  {
    icon: Download,
    title: "Pohoda export",
    text: "XML export priamo do Pohody. Účtovník dostáva podklady stlačením jediného tlačidla.",
  },
  {
    icon: Upload,
    title: "Prechod z iného systému",
    text: "Prejdite na Faktero bez straty histórie faktúr, odberateľov a číselných radov.",
  },
  {
    icon: ShieldCheck,
    title: "eFaktúra 2027",
    text: "Štruktúrované XML, Peppol and Digitálny poštár. Sme pripravení, aby ste nemuseli vy.",
  },
  {
    icon: ScanLine,
    title: "Skener bločkov",
    text: "Naskenujte QR kód z bločku a doklad sa načíta z Finančnej správy aj s položkami.",
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
] as const;

const accounting = [
  {
    icon: FileSpreadsheet,
    title: "Pohoda XML export",
    text: "Štruktúrovaný XML export kompatibilný s Pohodou — bez ručného prepisovania.",
  },
  {
    icon: Receipt,
    title: "Mesačné podklady",
    text: "Jedným klikom pripravíte balík faktúr, ponúk a nákladov za zvolený mesiac.",
  },
  {
    icon: Upload,
    title: "Import faktúr",
    text: "Hromadný import faktúr a odberateľov z doterajšieho systému, CSV alebo XML.",
  },
  {
    icon: TrendingUp,
    title: "Prehľady DPH",
    text: "Sumáre DPH s rozpadom po sadzbách a obdobiach, pripravené pre kontrolný výkaz.",
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
      "Audit log a prioritná podpora",
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
      "SSO a audit logy",
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
Authorization: Bearer sk_live_••••
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
    <div className="min-h-screen bg-background text-foreground antialiased">
      <MarketingNav />

      <main>
        <Hero />
        <TrustRow />
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
      <div className="mx-auto max-w-7xl px-6 pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
                <Sparkles className="h-3 w-3" />
                eFaktúra 2027 — zadarmo v každom pláne
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Private Beta · Prijímame
                prvých testerov
              </div>
            </div>
            <h1 className="text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground sm:text-5xl md:text-6xl lg:text-[4.25rem]">
              Fakturácia pripravená na{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-br from-primary via-primary to-primary/70 bg-clip-text text-transparent">
                  rok 2027.
                </span>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Vystavujte faktúry, posielajte PDF, automatizujte procesy cez API a pripravte firmu na
              povinnú <span className="font-medium text-foreground">eFaktúru</span>.
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
                Vyskúšať zdarma
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#api"
                onClick={() => track("api_docs_click", { source: "hero" })}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-5 py-3 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-secondary"
              >
                <Code2 className="h-4 w-4" /> Pozrieť API
              </a>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["30 dní zdarma", "Bezpečné platby cez GoPay", "Zrušenie kedykoľvek"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative w-full lg:justify-self-end">
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
  return (
    <div className="relative">
      {/* Decorative ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-3xl"
        style={{ background: "var(--brand-gradient)" }}
      />
      <div className="relative rounded-[1.5rem] border border-border/70 bg-card/95 p-2 shadow-[var(--shadow-elegant)] backdrop-blur">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
          <span className="ml-3 truncate text-[11px] text-muted-foreground">
            app.faktero.sk / prehlad
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
          </span>
        </div>

        <div className="space-y-3 rounded-[1.1rem] bg-background p-4">
          {/* Top KPI strip */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={<Banknote className="h-3.5 w-3.5" />}
              label="Neuhradené faktúry"
              value="4 218 €"
              hint="12 faktúr"
              trend="+8,4 %"
              trendPositive
            />
            <KpiCard
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Cashflow (30 dní)"
              value="+14 920 €"
              hint="46 platieb"
              trend="+12,1 %"
              trendPositive
            />
          </div>

          {/* Cashflow chart */}
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Cashflow
                </div>
                <div className="mt-0.5 text-sm font-semibold">Posledných 12 týždňov</div>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                +18,3 %
              </span>
            </div>
            <MiniBarChart />
          </div>

          {/* Bottom row: eFaktúra + API */}
          <div className="grid grid-cols-2 gap-3">
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
                Posledná prijatá platba
              </div>
              <div className="truncate text-sm font-semibold">
                Acme s.r.o. <span className="text-muted-foreground font-normal">· FA2026-0042</span>
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm font-bold tabular-nums">+1 698,60 €</div>
              <div className="text-[10px] text-muted-foreground">pred 4 min · bankový prevod</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating side card */}
      <div className="absolute -bottom-6 -left-6 hidden w-56 rotate-[-3deg] rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-elegant)] md:block">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold">FA2026-0042</div>
            <div className="truncate text-[10px] text-muted-foreground">
              Acme s.r.o. · 1 698,60 €
            </div>
          </div>
          <span className="ml-auto rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
            Uhradená
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
    <div className="rounded-xl border border-border/70 bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-lg font-bold tracking-tight">{value}</div>
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
          <div key={i} className="flex flex-1 flex-col items-center justify-end">
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
  const [t, setT] = useState<{ d: number; h: number; m: number }>({ d: 0, h: 0, m: 0 });
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
        eFaktúra 2027
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums tracking-tight">{t.d}</span>
        <span className="text-[10px] uppercase text-muted-foreground">dní</span>
        <span className="ml-1 text-sm font-semibold tabular-nums text-muted-foreground">
          {String(t.h).padStart(2, "0")}:{String(t.m).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full"
          style={{ width: "62%", background: "var(--brand-gradient)" }}
        />
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">Pripravenosť integrácie</div>
    </div>
  );
}

function MiniApiStatusCard() {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-primary" /> API status
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          OK
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-xl font-bold tracking-tight">142</span>
        <span className="text-[10px] text-muted-foreground">ms · p95</span>
      </div>
      <div className="mt-2 grid grid-cols-12 gap-[3px]">
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

function TrustRow() {
  return (
    <section className="border-y border-border/60 bg-card/40 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-8 md:py-10">
        <div className="grid grid-cols-2 items-center gap-x-4 gap-y-8 sm:grid-cols-3 lg:flex lg:justify-between">
          {trustMetrics.map(({ label, icon: Icon }) => (
            <div key={label} className="group flex items-center justify-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <span className="whitespace-nowrap text-[15px] font-medium text-foreground">
                {label}
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
  return (
    <section id="funkcie" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionHeader
          eyebrow="Funkcie"
          title="Všetko, čo potrebujete na fakturáciu"
          subtitle="Od jednoduchej faktúry po REST API, opakované faktúry a pripravenosť na eFaktúru 2027."
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
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
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
              <Code2 className="h-3 w-3" /> Pre vývojárov
            </div>
            <h2 className="text-balance break-words text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              REST API, ktoré <span className="text-primary">vyzerá ako u veľkých</span>.
            </h2>
            <p className="mt-5 w-full max-w-lg break-words text-sidebar-foreground/70">
              Vystavujte faktúry priamo z vášho e-shopu, CRM alebo ERP. Predvídateľné JSON odpovede,
              idempotencia, webhooky a oddelený test / live režim.
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
                  <div className="text-sm font-semibold text-sidebar-foreground">{i.t}</div>
                  <div className="mt-1 text-xs text-sidebar-foreground/65">{i.d}</div>
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="/docs/api"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:translate-y-[-1px]"
              >
                API dokumentácia <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/api-playground"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-sidebar-foreground hover:bg-white/10"
              >
                Playground
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
            POST /api/v1/invoices
          </span>
          <span className="ml-auto shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70">
            201 Created · 142 ms
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
              Pripravené na 2027 ✓
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
              eFaktúra <span className="text-primary">zadarmo</span> v každom pláne
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Faktero automaticky odošle každú faktúru cez Peppol sieť. Žiadna extra registrácia,
              žiadne skryté poplatky —{" "}
              <span className="font-semibold text-foreground">eFaktúra je zahrnutá v cene</span>.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Automatické odoslanie cez sieť Peppol — bez extra krokov.",
                "Žiadne poplatky za odoslanú eFaktúru, v každom pláne.",
                "Strojovo čitateľný XML formát (UBL 2.1) namiesto PDF prílohy.",
                "Pripravené na povinnosť pre B2B a B2G od 1.1.2027.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/registracia"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
              >
                Pripraviť firmu <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="/efakturacia"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold hover:bg-secondary"
              >
                Zistiť viac
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
  const [t, setT] = useState<{ d: number; h: number; m: number; s: number }>({
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
    [t.d, "Dní"],
    [t.h, "Hodín"],
    [t.m, "Minút"],
    [t.s, "Sekúnd"],
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
              Štart eFaktúry
            </div>
            <div className="mt-1 text-lg font-semibold">1. január 2027</div>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            Povinné
          </span>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-2 md:gap-3">
          {items.map(([val, label]) => (
            <div key={label} className="flex flex-col items-center">
              <div className="flex h-16 w-full items-center justify-center rounded-xl border border-border bg-background text-2xl font-bold tabular-nums tracking-tight text-foreground md:h-20 md:text-3xl">
                {String(val).padStart(2, "0")}
              </div>
              <span className="mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
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
  return (
    <section id="uctovnici" className="border-y border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Calculator className="h-3 w-3" /> Pre účtovníkov
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
              Mesačné podklady <span className="text-primary">jedným klikom</span>.
            </h2>
            <p className="mt-5 max-w-md text-muted-foreground">
              Pohoda XML export, prehľady DPH a hromadný import faktúr — pripravené pre desiatky
              klientov bez ručného prepisovania.
            </p>
            <Link
              to="/registracia"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
            >
              Vyskúšať pre účtovnícku firmu <ArrowRight className="h-4 w-4" />
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
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
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
  return (
    <section id="cennik" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionHeader
          eyebrow="Cenník"
          title="Jednoduchý cenník. 30 dní zdarma."
          subtitle="Začnite zdarma, prejdite na platený plán až keď vám Faktero ušetrí čas."
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
                  Najobľúbenejší
                </span>
              )}
              <div className="text-sm font-semibold text-muted-foreground">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                {p.period && <span className="text-sm text-muted-foreground">{p.period}</span>}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{p.tagline}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
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
                {p.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Všetky plány zahŕňajú 30-dňovú skúšobnú dobu zdarma. Bez platobnej karty.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Final CTA                                                                  */
/* -------------------------------------------------------------------------- */

function ComparisonSection() {
  const rows: Array<{
    label: string;
    faktero: boolean | string;
    ine: boolean | string;
    manual: boolean | string;
  }> = [
    { label: "REST API", faktero: true, ine: "Obmedzene", manual: false },
    { label: "Webhooky", faktero: true, ine: "Obmedzene", manual: false },
    { label: "eFaktúra 2027 pripravenosť", faktero: true, ine: "Plánované", manual: false },
    { label: "Opakované faktúry", faktero: true, ine: true, manual: false },
    { label: "QR platba na faktúre", faktero: true, ine: true, manual: false },
    { label: "FinStat integrácia", faktero: true, ine: false, manual: false },
    { label: "Bankové párovanie", faktero: true, ine: "Obmedzene", manual: false },
    { label: "Prijaté faktúry", faktero: true, ine: true, manual: false },
    // Appka je pred vydaním — do porovnania nepatrí ako hotová vec.
    { label: "Mobilná aplikácia", faktero: "Pripravujeme", ine: "Rôzne", manual: false },
    { label: "Upomienky po splatnosti", faktero: true, ine: "Obmedzene", manual: false },
    { label: "Schvaľovanie faktúr zákazníkom", faktero: true, ine: false, manual: false },
    { label: "Skladové hospodárstvo", faktero: true, ine: false, manual: false },
    { label: "Kniha jázd + Commander GPS", faktero: true, ine: false, manual: false },
  ];
  const cell = (v: boolean | string) => {
    if (v === true) return <CheckCircle2 className="mx-auto h-5 w-5 text-primary" />;
    if (v === false) return <X className="mx-auto h-5 w-5 text-muted-foreground/50" />;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> {v}
      </span>
    );
  };
  return (
    <section id="porovnanie" className="border-y border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionHeader
          eyebrow="Porovnanie"
          title="Prečo si firmy vyberajú Faktero"
          subtitle="Neutrálne porovnanie funkcií, ktoré sú dnes dôležité pre moderné slovenské firmy."
        />
        <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Funkcia
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-primary">
                    Faktero
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    INÉ FAKTURAČNÉ SYSTÉMY
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Manuálna fakturácia
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label} className={i % 2 === 0 ? "bg-card" : "bg-background/40"}>
                    <td className="px-6 py-4 font-medium text-foreground">{r.label}</td>
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
          Údaje k {new Date().toLocaleDateString("sk-SK", { month: "long", year: "numeric" })}.
          Funkcie konkurencie sa môžu meniť.
        </p>
      </div>
    </section>
  );
}

function MobileAppSection() {
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
              <Smartphone className="h-3 w-3" /> iOS & Android (pripravujeme)
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl whitespace-pre-line">
              Faktero v mobile{"\n"}
              <span className="text-primary">fakturujte kdekoľvek</span>
            </h2>
            <p className="mt-5 max-w-lg text-muted-foreground">
              {/* Pôvodne tu stálo „s offline režimom". Appka bez signálu naozaj zapíše
                  jazdu aj doklad, ale rozhranie sa načítava zo živého webu — pri
                  studenom štarte bez pripojenia sa neotvorí. Sľubujme len to, čo platí. */}
              iOS a Android appka so skenovaním dokladov a GPS knihou jázd. Jazdu aj odfotený doklad
              zapíše aj bez signálu a odošle ich, len čo ste online.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {items.map((i) => (
                <li key={i.title} className="rounded-xl border border-border bg-card p-4">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <i.icon className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-semibold">{i.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{i.text}</div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold text-muted-foreground opacity-70"
              >
                <Smartphone className="h-4 w-4" /> App Store
                <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Čoskoro
                </span>
              </button>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold text-muted-foreground opacity-70"
              >
                <Smartphone className="h-4 w-4" /> Google Play
                <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Čoskoro
                </span>
              </button>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] opacity-60 blur-3xl"
              style={{ background: "var(--brand-gradient)" }}
            />
            <div className="relative rounded-[2.5rem] border-[10px] border-foreground/90 bg-background p-4 shadow-[var(--shadow-elegant)]">
              <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-foreground/20" />
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Dnes
                  </div>
                  <div className="mt-1 text-sm font-semibold">3 nové platby · +2 340 €</div>
                </div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] p-3">
                  <div className="flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <div className="text-sm font-semibold">Doklad naskenovaný</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Shell · 62,40 € · DPH 23 %
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">Kniha jázd</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    BA → TT · 68 km · automaticky
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm font-semibold">FA2026-0042 uhradená</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Acme s.r.o. · 1 698,60 €</div>
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
          Prestaňte strácať čas <span className="text-primary">fakturáciou</span>.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sidebar-foreground/70">
          Začnite za pár minút. 30 dní zdarma, bez platobnej karty.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/registracia"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
          >
            Vyskúšať zdarma <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:podpora@faktero.sk"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-sidebar-foreground hover:bg-white/10"
          >
            Kontaktovať nás
          </a>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-sidebar-foreground/60">
          {["30 dní zdarma", "Bez platobnej karty", "Slovenská podpora", "GDPR"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" /> {t}
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
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:gap-10 sm:px-6 sm:py-14 sm:grid-cols-2 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div className="sm:col-span-2 md:col-span-1">
          <div className="text-lg font-bold tracking-tight">Faktero</div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Moderná fakturácia s API pre slovenské a české firmy. Pripravené na eFaktúru 2027.
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
              ["Playground", "/vyvojari/playground"],
            ],
          },
          {
            title: "Účtovníci",
            links: [
              ["Pohoda export", "/uctovnici/pohoda-export"],
              ["Mesačné podklady", "/uctovnici/mesacne-podklady"],
              ["Integrácie", "/uctovnici/integracie"],
            ],
          },
          {
            title: "Firma",
            links: [
              ["Prihlásenie", "/prihlasenie"],
              ["Registrácia", "/registracia"],
              ["Kontakt", "/kontakt"],
            ],
          },
        ].map((col) => (
          <div key={col.title}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {col.title}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-foreground/80 hover:text-foreground">
                    {label}
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
            © 2026 Tobify s. r. o. — Športová 707/43, 919 26 Zavar · IČO: 56607016 · DIČ: 2122358579
            · info@faktero.sk
          </div>
          <div className="order-1 flex flex-wrap items-center gap-x-4 gap-y-2 md:order-2 md:gap-x-5">
            <a href="/pravne/obchodne-podmienky" className="hover:text-foreground">
              Obchodné podmienky
            </a>
            <a href="/pravne/gdpr" className="hover:text-foreground">
              GDPR
            </a>
            <a href="/pravne/tesla-podmienky" className="hover:text-foreground">
              Tesla Fleet API
            </a>
            <a href="/kontakt" className="hover:text-foreground">
              Kontakt
            </a>
          </div>
        </div>
        <div
          className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 pb-6 sm:px-6"
          aria-label="Podporované spôsoby platby"
        >
          <span className="text-xs text-muted-foreground">Platby zabezpečuje:</span>
          <img
            src="https://cdn.gopay.com/img/logo/gopay_logo.svg"
            alt="GoPay"
            width={64}
            height={20}
            loading="lazy"
            className="h-5 w-auto"
          />
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg"
            alt="Visa"
            width={40}
            height={16}
            loading="lazy"
            className="h-4 w-auto"
          />
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
            alt="Mastercard"
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
      title: "eFaktúra readiness",
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
          eyebrow="Produkt"
          title="Pozrite si Faktero v akcii"
          subtitle="Skutočné obrazovky aplikácie od prehľadu cez faktúru po eFaktúru."
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
              {s.title}
            </button>
          ))}
        </div>
        <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">{current.title}</h3>
            <p className="mt-3 text-muted-foreground">{current.desc}</p>
            <Link
              to="/registracia"
              onClick={() => track("registration_click", { source: "screenshots" })}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:translate-y-[-1px] transition-transform"
            >
              Vyskúšať zdarma <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] opacity-50 blur-3xl"
              style={{ background: "var(--brand-gradient)" }}
            />
            <div className="rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-elegant)]">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                <span className="ml-3 truncate text-[11px] text-muted-foreground">
                  app.faktero.sk
                </span>
              </div>
              <div className="rounded-xl bg-background p-4">{current.node}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShotDashboard() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Neuhradené", v: "4 218 €" },
          { l: "Cashflow 30 d", v: "+14 920 €" },
          { l: "Po splatnosti", v: "612 €" },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
            <div className="mt-1 text-base font-bold tabular-nums">{k.v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cashflow</div>
        <MiniBarChart />
      </div>
      <div className="rounded-lg border border-border bg-card p-3 text-xs">
        <div className="font-semibold">Najnovšie aktivity</div>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li>· FA2026-0042 · Acme s.r.o. · +1 698,60 € · prevod</li>
          <li>· FA2026-0041 · Beta s.r.o. · odoslaná e-mailom</li>
          <li>· Nový odberateľ: Gamma s.r.o.</li>
        </ul>
      </div>
    </div>
  );
}

function ShotInvoiceList() {
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
        <span>Číslo</span>
        <span>Odberateľ</span>
        <span>Stav</span>
        <span className="text-right">Suma</span>
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
              {r.s}
            </span>
          </span>
          <span className="text-right font-semibold tabular-nums">{r.sum}</span>
        </div>
      ))}
    </div>
  );
}

function ShotInvoiceDetail() {
  return (
    <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-4 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Faktúra
            </div>
            <div className="text-base font-bold">FA2026-0042</div>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            Uhradená
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="text-muted-foreground">Dodávateľ</div>
            <div className="font-semibold">Faktero s.r.o.</div>
          </div>
          <div>
            <div className="text-muted-foreground">Odberateľ</div>
            <div className="font-semibold">Acme s.r.o.</div>
          </div>
          <div>
            <div className="text-muted-foreground">Splatnosť</div>
            <div className="font-semibold">14. jún 2026</div>
          </div>
          <div>
            <div className="text-muted-foreground">IBAN</div>
            <div className="font-mono">SK12 1100…</div>
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-2 text-[11px]">
          <div className="flex justify-between py-1">
            <span>Web design</span>
            <span className="tabular-nums">1 200,00 €</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Hosting 12 m</span>
            <span className="tabular-nums">180,00 €</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 font-bold">
            <span>Spolu s DPH</span>
            <span className="tabular-nums">1 698,60 €</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center text-[11px]">
          <div className="font-semibold">QR platba</div>
          <div className="mx-auto mt-2 grid h-20 w-20 grid-cols-8 grid-rows-8 gap-[1px] bg-foreground/10 p-1">
            {Array.from({ length: 64 }).map((_, i) => (
              <div key={i} className={(i * 7) % 3 === 0 ? "bg-foreground" : "bg-transparent"} />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-[11px]">
          <div className="font-semibold">Časová os</div>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>· Vytvorená</li>
            <li>· Odoslaná e-mailom</li>
            <li className="text-emerald-600 dark:text-emerald-400">
              · Uhradená — spárované s bankou
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ShotEfaktura() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" /> Vaša firma je pripravená na eFaktúru
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-500/15">
          <div className="h-full w-[88%] bg-emerald-500" />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">Pripravenosť 88 %</div>
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
          eyebrow="Ako to funguje"
          title="Od registrácie po prvú platbu za pár minút"
          subtitle="Tri kroky a faktúra je na ceste. Bez návodov, bez školení."
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
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
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
  const items = [
    { name: "FinStat", desc: "Automatické dohľadanie firmy podľa IČO.", icon: Database },
    { name: "Tatra banka", desc: "Pohyby na účte a párovanie úhrad s faktúrami.", icon: Landmark },
    { name: "Pohoda", desc: "XML export pripravený pre účtovníka.", icon: FileSpreadsheet },
    { name: "eFaktúra 2027", desc: "UBL 2.1 / Peppol pripravenosť.", icon: ShieldCheck },
    { name: "REST API", desc: "Vystavujte faktúry z e-shopu či CRM.", icon: Code2 },
  ];
  return (
    <section id="integracie" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-28">
        <SectionHeader
          eyebrow="Integrácie"
          title="Navrhnuté pre slovenské firmy"
          subtitle="Pracujeme s nástrojmi, ktoré už dnes používate."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {items.map((i) => (
            <div
              key={i.name}
              className="rounded-2xl border border-border bg-card p-5 text-center transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <i.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-bold">{i.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{i.desc}</div>
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
  return (
    <section id="pribeh" className="border-y border-border/60 bg-card/40">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Rocket className="h-3 w-3" /> Prečo vzniklo Faktero
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
          Existujúce nástroje na fakturáciu sú <span className="text-primary">zastarané</span>,
          zbytočne zložité a nepripravené na to, čo príde.
        </h2>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">
          Faktero som postavil pre seba — pre podnikateľov, ktorí chcú fakturovať rýchlo,
          automatizovať cez API a byť pripravení na povinnú eFaktúru 2027 skôr, ako začne tlačiť
          termín. Žiadne pop-upy, žiadne staré rozhrania, žiadne prekvapenia na faktúre na konci
          mesiaca.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">— zakladateľ Faktero</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                        */
/* -------------------------------------------------------------------------- */

function FaqSection() {
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
      a: "Áno. Faktero podporuje hromadný import faktúr, odberateľov a číselných radov zo SuperFaktúry, CSV alebo XML — bez straty histórie.",
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
          eyebrow="Časté otázky"
          title="Odpovede na to, čo sa najčastejšie pýtate"
          subtitle="Niečo nenašli ste? Napíšte nám na podpora@faktero.sk."
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
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
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
            Vyskúšať zdarma <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:podpora@faktero.sk"
            onClick={() => track("contact_click", { source: "faq" })}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold hover:bg-secondary"
          >
            <Send className="h-4 w-4" /> Kontaktovať
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
          <UserPlus className="h-4 w-4" /> Vyskúšať zdarma
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
          Vyskúšať zdarma <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}
