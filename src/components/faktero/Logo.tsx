import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";

const logoFull = "/faktero-logo-full.png";
/*
  Tá istá značka so svetlým nápisom. Pôvodné logo má nápis tmavozelený a na
  tmavom podklade splýva — ikona vľavo je čitateľná v oboch režimoch, mení sa
  len text vedľa nej.
*/
const logoFullSvetle = "/faktero-logo-full-svetle.png";
const logoIcon = "/faktero-icon.png";
const logoFull480 = "/faktero-logo-full-480.png";
const logoFullSvetle480 = "/faktero-logo-full-svetle-480.png";

/** Logo, ktoré si vyberie verziu podľa motívu. Prepína CSS, nie JavaScript —
 *  pri prepnutí motívu tak nepreblikne a na serveri sa vykreslí rovnako. */
function LogoObrazok({ className }: { className?: string }) {
  /*
    Logo je najviac 40 px vysoké (~170 px široké) — prehliadač si vezme 480 px
    verziu (9 kB) a pôvodnú 1600 px (45–85 kB) len pri hustote obrazovky nad 2,8.
    Svetlá verzia je `loading="lazy"`: v svetlom motíve je skrytá, takže ju
    prehliadač vôbec nestiahne.
  */
  return (
    <>
      <img
        src={logoFull}
        srcSet={`${logoFull480} 480w, ${logoFull} 1600w`}
        sizes="170px"
        alt="Faktero"
        decoding="async"
        className={cn("object-contain dark:hidden", className)}
      />
      <img
        src={logoFullSvetle}
        srcSet={`${logoFullSvetle480} 480w, ${logoFullSvetle} 1600w`}
        sizes="170px"
        alt="Faktero"
        aria-hidden
        loading="lazy"
        decoding="async"
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
  const { t } = useT();
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
        <span className="text-xs text-muted-foreground">{t("API-first fakturácia")}</span>
      </div>
    );
  }

  // Header variant — compact wordmark
  return <LogoObrazok className={cn("h-8 w-auto", className)} />;
}
