import { cn } from "@/lib/utils";

const logoFull = "/faktero-logo-full.png";
/*
  Tá istá značka so svetlým nápisom. Pôvodné logo má nápis tmavozelený a na
  tmavom podklade splýva — ikona vľavo je čitateľná v oboch režimoch, mení sa
  len text vedľa nej.
*/
const logoFullSvetle = "/faktero-logo-full-svetle.png";
const logoIcon = "/faktero-icon.png";

/** Logo, ktoré si vyberie verziu podľa motívu. Prepína CSS, nie JavaScript —
 *  pri prepnutí motívu tak nepreblikne a na serveri sa vykreslí rovnako. */
function LogoObrazok({ className }: { className?: string }) {
  return (
    <>
      <img src={logoFull} alt="Faktero" className={cn("object-contain dark:hidden", className)} />
      <img
        src={logoFullSvetle}
        alt="Faktero"
        aria-hidden
        className={cn("hidden object-contain dark:block", className)}
      />
    </>
  );
}

type LogoProps = {
  variant?: "header" | "full" | "icon";
  className?: string;
};

export function Logo({ variant = "header", className }: LogoProps) {
  if (variant === "icon") {
    return (
      <img
        src={logoIcon}
        alt="Faktero"
        className={cn("h-8 w-8 object-contain", className)}
        loading="lazy"
      />
    );
  }

  if (variant === "full") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <LogoObrazok className="h-10 w-auto" />
        <span className="text-xs text-muted-foreground">API-first fakturácia</span>
      </div>
    );
  }

  // Header variant — compact wordmark
  return <LogoObrazok className={cn("h-8 w-auto", className)} />;
}
