import { Link } from "@tanstack/react-router";
import { MarketingNav } from "./MarketingNav";
import { PublicSupportWidget } from "./PublicSupportWidget";
import { Logo } from "./Logo";
import { LEGAL_COMPANY } from "./LegalShell";
import { Mail, Phone, ShieldCheck, Lock } from "lucide-react";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      <main>{children}</main>
      <footer className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-10 space-y-6 text-sm text-muted-foreground">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <Logo className="h-7 w-[112px] opacity-80" />
              <p className="text-xs">
                Fakturačný systém pre slovenských podnikateľov. Pripravený na eFaktúru od 1.1.2027.
              </p>
            </div>
            <div className="space-y-2 text-xs">
              <div className="font-medium text-foreground/80">Kontakt</div>
              <a
                href={`mailto:${LEGAL_COMPANY.email}`}
                className="flex items-center gap-2 hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" />
                {LEGAL_COMPANY.email}
              </a>
              <a
                href={`tel:${LEGAL_COMPANY.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 hover:text-foreground"
              >
                <Phone className="h-3.5 w-3.5" />
                {LEGAL_COMPANY.phone}
              </a>
              <Link to="/kontakt" className="inline-block underline hover:text-foreground">
                Kontaktný formulár
              </Link>
            </div>
            <div className="space-y-2 text-xs">
              <div className="font-medium text-foreground/80">Bezpečné platby</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground">
                  GoPay
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-[#1a1f71]">
                  VISA
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold">
                  <span className="text-[#eb001b]">Master</span>
                  <span className="text-[#f79e1b]">card</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground">
                  <Lock className="h-3 w-3" />
                  3-D Secure
                </span>
              </div>
              <p className="flex items-center gap-1 text-[11px]">
                <ShieldCheck className="h-3 w-3" />
                Údaje karty spracúva výhradne GoPay.
              </p>
            </div>
          </div>

          <div className="border-t border-border/60 pt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <span>
              © {new Date().getFullYear()} {LEGAL_COMPANY.name}. Všetky práva vyhradené.
            </span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/cennik" className="hover:text-foreground">
                Cenník
              </Link>
              <Link to="/objednavka" className="hover:text-foreground">
                Objednať
              </Link>
              <Link to="/funkcie" className="hover:text-foreground">
                Funkcie
              </Link>
              <Link to="/vyvojari" className="hover:text-foreground">
                API
              </Link>
              <Link to="/efakturacia" className="hover:text-foreground">
                eFaktúra
              </Link>
              <Link to="/uctovnici" className="hover:text-foreground">
                Účtovníci
              </Link>
              <Link to="/blog" className="hover:text-foreground">
                Blog
              </Link>
              <Link to="/kontakt" className="hover:text-foreground">
                Kontakt
              </Link>
            </div>
          </div>
          <div className="border-t border-border/60 pt-4 flex flex-wrap gap-x-5 gap-y-2">
            <span className="font-medium text-foreground/80">Právne:</span>
            <Link to="/pravne/obchodne-podmienky" className="hover:text-foreground">
              Obchodné podmienky
            </Link>
            <Link to="/pravne/gdpr" className="hover:text-foreground">
              GDPR
            </Link>
            <Link to="/pravne/reklamacny-poriadok" className="hover:text-foreground">
              Reklamačný poriadok
            </Link>
            <Link to="/pravne/gopay-podmienky" className="hover:text-foreground">
              GoPay podmienky
            </Link>
            <Link to="/pravne/opakovane-platby" className="hover:text-foreground">
              Opakované platby
            </Link>
            <Link to="/pravne/cookies" className="hover:text-foreground">
              Cookies
            </Link>
            <Link to="/pravne/tesla-podmienky" className="hover:text-foreground">
              Tesla Fleet API
            </Link>
          </div>
          <div className="text-xs text-muted-foreground/80 space-y-1">
            <div>
              Prevádzkovateľ: {LEGAL_COMPANY.name}, {LEGAL_COMPANY.address}
            </div>
            <div>
              IČO: {LEGAL_COMPANY.ico} · DIČ: {LEGAL_COMPANY.dic} · IČ DPH: {LEGAL_COMPANY.icDph}
            </div>
          </div>
        </div>
      </footer>
      <PublicSupportWidget />
    </div>
  );
}
