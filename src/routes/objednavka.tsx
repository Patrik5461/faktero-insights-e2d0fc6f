import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Crown, Zap, ArrowRight, RefreshCw, CreditCard, Info, ShieldCheck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEGAL_COMPANY } from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/objednavka")({
  head: () => ({
    meta: [
      { title: "Objednávka — Faktero" },
      { name: "description", content: "Aktivujte si predplatné Faktero. Starter 9 €/mes alebo Premium 19 €/mes. Bezpečná platba cez GoPay." },
      { property: "og:title", content: "Objednávka Faktero" },
      { property: "og:description", content: "Aktivujte si predplatné Faktero. Starter 9 €/mes alebo Premium 19 €/mes. Bezpečná platba cez GoPay." },
    ],
  }),
  component: ObjednavkaPage,
});

const PLANS = [
  {
    slug: "starter",
    name: "Starter",
    price: "9 €",
    priceVat: "11,07 €",
    period: "/ mesiac",
    tagline: "Pre živnostníkov a malé firmy — všetko podstatné bez limitu.",
    features: [
      "eFaktúra zadarmo (Peppol)",
      "Neobmedzené faktúry",
      "2 používatelia + 1 účtovník",
      "1 firma",
      "Opakované faktúry",
      "Bankové párovanie",
      "PDF s QR platbou",
      "Pohoda export",
      "E-mail podpora",
    ],
    featured: false,
    icon: Zap,
  },
  {
    slug: "premium",
    name: "Premium",
    price: "19 €",
    priceVat: "23,37 €",
    period: "/ mesiac",
    tagline: "Pre rastúce tímy bez stropov — API, webhooky a import.",
    features: [
      "eFaktúra zadarmo (Peppol)",
      "Všetko zo Starter",
      "Neobmedzení používatelia",
      "Neobmedzené firmy",
      "API + Webhooky",
      "Import zo SuperFaktúry",
      "Audit log",
      "Prioritná podpora",
    ],
    featured: true,
    icon: Crown,
  },
];

function useAuthSession() {
  const [session, setSession] = useState<{ user?: { id: string } } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ? { user: data.session.user } : null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s ? { user: s.user } : null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

function ObjednavkaPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuthSession();
  const [selectedSlug, setSelectedSlug] = useState<string>("premium");
  const [busy, setBusy] = useState(false);

  const selectedPlan = PLANS.find((p) => p.slug === selectedSlug) ?? PLANS[1];

  function activate() {
    setBusy(true);
    if (session?.user) {
      navigate({ to: "/predplatne", search: { plan: selectedSlug } });
    } else {
      navigate({ to: "/registracia", search: { plan: selectedSlug, redirect: "/predplatne" } });
    }
  }

  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Objednávka</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
            Aktivujte si Faktero
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Vyberte si plán a začnite fakturovať. Platba cez GoPay — bezpečne a okamžite.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        {/* Plan selection */}
        <div className="grid gap-6 md:grid-cols-2">
          {PLANS.map((p) => {
            const Icon = p.icon;
            const isSelected = selectedSlug === p.slug;
            return (
              <Card
                key={p.slug}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary ring-1 ring-primary/30 shadow-lg"
                    : "border-border bg-card hover:border-primary/30"
                }`}
                onClick={() => setSelectedSlug(p.slug)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                    </div>
                    {p.featured && (
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                        Najobľúbenejšie
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                    <span className="text-sm text-muted-foreground">{p.period}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    S DPH 23 %: <span className="font-medium text-foreground">{p.priceVat}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSlug(p.slug);
                      }}
                    >
                      {isSelected ? "Vybraté" : "Vybrať tento plán"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary + CTA */}
        <Card className="mt-8 border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Vybratý plán: {selectedPlan.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedPlan.price} / mesiac ({selectedPlan.priceVat} s DPH)
                </p>
              </div>
              <Button
                size="lg"
                className="w-full md:w-auto gap-2"
                onClick={activate}
                disabled={busy || authLoading}
              >
                {authLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Aktivovať plán <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recurring payment info box */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-900 dark:text-blue-100">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
          <div className="space-y-1">
            <p className="font-medium">Opakované platby</p>
            <p>
              Predplatné sa automaticky obnovuje každý mesiac. Platba je spracovaná cez GoPay
              (Visa/Mastercard). Zrušiť môžete kedykoľvek v nastaveniach účtu alebo emailom na{" "}
              <a href={`mailto:${LEGAL_COMPANY.email}`} className="underline">
                {LEGAL_COMPANY.email}
              </a>
              .
            </p>
          </div>
        </div>

        {/* Trust / payment badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
            <CreditCard className="h-3.5 w-3.5" /> GoPay
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-[#1a1f71]">
            VISA
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold">
            <span className="text-[#eb001b]">Master</span>
            <span className="text-[#f79e1b]">card</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
            <Lock className="h-3.5 w-3.5" /> 3-D Secure
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Údaje karty spracúva GoPay
          </span>
        </div>

        {/* Legal links */}
        <div className="mt-8 rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Ceny a DPH:</strong> Uvedené ceny sú bez DPH.
            Prevádzkovateľ je platca DPH; k cene sa uplatňuje sadzba <strong>23 %</strong> (Starter
            9 € → 11,07 € s DPH; Premium 19 € → 23,37 € s DPH).
          </p>
          <p>
            <strong className="text-foreground">Automatické obnovenie:</strong> Predplatné sa po
            skončení obdobia automaticky obnovuje, kým ho nezrušíte. Zrušiť môžete kedykoľvek —
            prístup ostáva do konca zaplateného obdobia.
          </p>
          <p>
            Kliknutím na „Aktivovať plán“ potvrdzujete súhlas s{" "}
            <Link to="/pravne/obchodne-podmienky" target="_blank" className="underline">
              Obchodnými podmienkami
            </Link>
            ,{" "}
            <Link to="/pravne/opakovane-platby" target="_blank" className="underline">
              podmienkami opakovaných platieb
            </Link>{" "}
            a{" "}
            <Link to="/pravne/gopay-podmienky" target="_blank" className="underline">
              GoPay podmienkami
            </Link>
            .
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Máte otázky? <Link to="/kontakt" className="underline">Kontaktujte nás</Link>.
        </p>
      </section>
    </MarketingShell>
  );
}
