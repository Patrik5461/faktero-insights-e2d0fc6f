import type { ReactNode } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";

/**
 * Rám mobilnej aplikácie.
 *
 * Appka beží v natívnom obale, ktorý ukazuje živý web — nemá teda vlastný
 * skelet a musí si ho vyrobiť stránka. Preto tu je aj odsadenie pre výrez a
 * spodnú lištu telefónu (`env(safe-area-inset-*)`): bez neho by hlavička
 * liezla pod hodiny a spodné tlačidlo pod indikátor domovskej obrazovky.
 */
export function MobilObrazovka({
  title,
  subtitle,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header
        className="sticky top-0 z-10 border-b border-border bg-card"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Späť"
              className="-ml-2 rounded-full p-2 hover:bg-secondary"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">{children}</main>

      {footer && (
        <footer
          className="sticky bottom-0 border-t border-border bg-card px-4 py-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          {footer}
        </footer>
      )}
    </div>
  );
}

/** Veľké tlačidlo — palcom sa musí trafiť na prvý raz. */
export function VelkeTlacidlo({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  variant = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.99] disabled:opacity-50 ${
        variant === "primary"
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-secondary"
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          variant === "primary" ? "bg-white/15" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && (
          <span
            className={`block text-xs ${variant === "primary" ? "text-primary-foreground/80" : "text-muted-foreground"}`}
          >
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

export function Pracujem({ text }: { text: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        {text}
      </div>
    </div>
  );
}
