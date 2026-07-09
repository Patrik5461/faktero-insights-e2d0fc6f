import { Link } from "@tanstack/react-router";
import { MarketingNav } from "./MarketingNav";
import { PublicSupportWidget } from "./PublicSupportWidget";
import { Logo } from "./Logo";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      <main>{children}</main>
      <footer className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-10 space-y-6 text-sm text-muted-foreground">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Logo className="h-7 w-[112px] opacity-80" />
              <span>© {new Date().getFullYear()} Tobify s. r. o. Všetky práva vyhradené.</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/cennik" className="hover:text-foreground">Cenník</Link>
              <Link to="/funkcie" className="hover:text-foreground">Funkcie</Link>
              <Link to="/vyvojari" className="hover:text-foreground">API</Link>
              <Link to="/efakturacia" className="hover:text-foreground">eFaktúra</Link>
              <Link to="/uctovnici" className="hover:text-foreground">Účtovníci</Link>
              <Link to="/blog" className="hover:text-foreground">Blog</Link>
            </div>
          </div>
          <div className="border-t border-border/60 pt-4 flex flex-wrap gap-x-5 gap-y-2">
            <span className="font-medium text-foreground/80">Právne:</span>
            <Link to="/pravne/obchodne-podmienky" className="hover:text-foreground">Obchodné podmienky</Link>
            <Link to="/pravne/gdpr" className="hover:text-foreground">GDPR</Link>
            <Link to="/pravne/reklamacny-poriadok" className="hover:text-foreground">Reklamačný poriadok</Link>
            <Link to="/pravne/gopay-podmienky" className="hover:text-foreground">GoPay podmienky</Link>
            <Link to="/pravne/cookies" className="hover:text-foreground">Cookies</Link>
            <Link to="/pravne/tesla-podmienky" className="hover:text-foreground">Tesla Fleet API</Link>
          </div>
          <div className="text-xs text-muted-foreground/80 space-y-1">
            <div>Prevádzkovateľ: Tobify s. r. o., Športová 707/43, 919 26 Zavar, Slovenská republika</div>
            <div>IČO: 56607016 · DIČ: 2122358579 · IČ DPH: SK2122358579 · Email: <a href="mailto:info@faktero.sk" className="hover:text-foreground">info@faktero.sk</a></div>
          </div>
        </div>
      </footer>
      <PublicSupportWidget />
    </div>
  );
}