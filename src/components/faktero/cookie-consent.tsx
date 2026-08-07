"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Cookie, X, Settings2, ShieldCheck, BarChart3, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useServerFn } from "@tanstack/react-start";
import { recordLegalAcceptance } from "@/lib/legal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

const STORAGE_KEY = "faktero-cookie-consent";
const LEGAL_VERSION = "1.0";

type CookieConsent = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  acceptedAt: string;
  recorded: boolean;
};

function getStoredConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CookieConsent;
  } catch {
    return null;
  }
}

function saveConsent(consent: CookieConsent) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // localStorage môže byť zakázané (privátny režim, blokovač) — súhlas potom platí len pre túto reláciu
  }
}

const defaultConsent: CookieConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
  acceptedAt: new Date().toISOString(),
  recorded: false,
};

export function CookieConsentBanner() {
  const [mounted, setMounted] = useState(false);
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const recordAcceptance = useServerFn(recordLegalAcceptance);

  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const stored = getStoredConsent();
    setConsent(stored);
  }, []);

  /**
   * Lišta visí na `position: fixed`, takže sama nezaberá miesto a prekrýva to,
   * čo je naspodku stránky. Na mobile zakrývala prihlasovacie tlačidlo — človek
   * naň klikal a nič sa nedialo. Kým je lišta na obrazovke, odsadíme o jej
   * výšku spodok stránky.
   */
  useEffect(() => {
    const el = bannerRef.current;
    if (!mounted || consent || !el) return;
    const uprav = () => {
      document.body.style.paddingBottom = `${el.offsetHeight}px`;
    };
    uprav();
    const ro = new ResizeObserver(uprav);
    ro.observe(el);
    window.addEventListener("resize", uprav);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", uprav);
      document.body.style.paddingBottom = "";
    };
  }, [mounted, consent]);

  const recordToBackend = async (consent: CookieConsent) => {
    if (consent.recorded) return;
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;

      const documents: { document_type: "cookies"; version: string }[] = [
        { document_type: "cookies", version: LEGAL_VERSION },
      ];

      await recordAcceptance({ data: { documents } });
      saveConsent({ ...consent, recorded: true });
    } catch (err) {
      console.error("[CookieConsent] failed to record acceptance", err);
    }
  };

  const acceptAll = async () => {
    const next = {
      ...defaultConsent,
      analytics: true,
      marketing: true,
      acceptedAt: new Date().toISOString(),
    };
    setPending(true);
    saveConsent(next);
    setConsent(next);
    await recordToBackend(next);
    setPending(false);
  };

  const acceptNecessaryOnly = async () => {
    const next = { ...defaultConsent, acceptedAt: new Date().toISOString() };
    setPending(true);
    saveConsent(next);
    setConsent(next);
    await recordToBackend(next);
    setPending(false);
  };

  const saveCustom = async (analytics: boolean, marketing: boolean) => {
    const next = { ...defaultConsent, analytics, marketing, acceptedAt: new Date().toISOString() };
    setPending(true);
    saveConsent(next);
    setConsent(next);
    await recordToBackend(next);
    setPending(false);
    setOpen(false);
  };

  if (!mounted || consent) return null;

  return (
    <>
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Cookies súhlas"
        ref={bannerRef}
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      >
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-start gap-3">
            <div className="mt-1 hidden rounded-full bg-primary/10 p-2 sm:flex">
              <Cookie className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-card-foreground">
                Používame cookies na zabezpečenie prevádzky a anonymnú analýzu. Viac informácií
                nájdete v{" "}
                <Link to="/pravne/cookies" className="underline hover:text-primary">
                  pravidlách používania cookies
                </Link>
                .
              </p>
              <p className="text-xs text-muted-foreground">
                Nevyhnutné cookies sú povolené vždy. Analytické a marketingové cookies si môžete
                nastaviť.
              </p>
            </div>
          </div>

          {/* Tlačidlá vedľa seba aj na mobile — na stĺpec pod sebou zaberali na
              malých telefónoch vyše polovicu obrazovky. */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              className="gap-2"
              disabled={pending}
            >
              <Settings2 className="h-4 w-4" />
              Nastaviť
            </Button>
            <Button variant="secondary" size="sm" onClick={acceptNecessaryOnly} disabled={pending}>
              Iba nevyhnutné
            </Button>
            <Button size="sm" onClick={acceptAll} disabled={pending}>
              Prijať všetko
            </Button>
          </div>
        </div>
      </div>

      <CookieSettingsSheet
        open={open}
        onOpenChange={setOpen}
        onSave={saveCustom}
        pending={pending}
      />
    </>
  );
}

function CookieSettingsSheet({
  open,
  onOpenChange,
  onSave,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (analytics: boolean, marketing: boolean) => void;
  pending: boolean;
}) {
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-xl sm:mx-auto sm:rounded-t-xl">
        <SheetHeader className="space-y-2">
          <SheetTitle className="flex items-center gap-2">
            <Cookie className="h-5 w-5 text-primary" />
            Nastavenia cookies
          </SheetTitle>
          <SheetDescription>
            Vyberte, ktoré kategórie cookies môžeme používať. Nevyhnutné cookies sú povinné pre
            prevádzku aplikácie.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <CategoryRow
            icon={ShieldCheck}
            title="Nevyhnutné cookies"
            description="Prihlásenie, bezpečnosť, relácia, predvolené nastavenia. Bez nich Faktero nemôže fungovať."
            checked={true}
            onCheckedChange={() => {}}
            disabled
          />
          <Separator />
          <CategoryRow
            icon={BarChart3}
            title="Analytické cookies"
            description="Anonymizované štatistiky používania, ktoré nám pomáhajú zlepšovať službu."
            checked={analytics}
            onCheckedChange={setAnalytics}
          />
          <Separator />
          <CategoryRow
            icon={Megaphone}
            title="Marketingové cookies"
            description="Aktuálne nepoužívame. Ak ich v budúcnosti nasadíme, budete informovaní."
            checked={marketing}
            onCheckedChange={setMarketing}
          />
        </div>

        <SheetFooter className="mt-8 gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Zrušiť
          </Button>
          <Button onClick={() => onSave(analytics, marketing)} disabled={pending}>
            Uložiť nastavenia
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CategoryRow({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-primary/10 p-1.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="font-medium text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={title}
      />
    </div>
  );
}

export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent | null>(null);

  useEffect(() => {
    setConsent(getStoredConsent());
  }, []);

  const refresh = () => setConsent(getStoredConsent());
  const canUseAnalytics = consent?.analytics ?? false;
  const canUseMarketing = consent?.marketing ?? false;

  return { consent, canUseAnalytics, canUseMarketing, refresh };
}

export function CookieConsentResetButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (typeof window === "undefined") return;
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }}
    >
      Zmeniť nastavenia cookies
    </Button>
  );
}
