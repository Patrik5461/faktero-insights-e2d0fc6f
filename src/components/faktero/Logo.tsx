import { cn } from "@/lib/utils";
import logoFull from "@/assets/faktero-logo-full.png.asset.json";
import logoIcon from "@/assets/faktero-icon.png.asset.json";

type LogoProps = {
  variant?: "header" | "full" | "icon";
  className?: string;
};

export function Logo({ variant = "header", className }: LogoProps) {
  if (variant === "icon") {
    return (
      <img
        src={logoIcon.url}
        alt="Faktero"
        className={cn("h-8 w-8 object-contain", className)}
        loading="lazy"
      />
    );
  }

  if (variant === "full") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <img src={logoFull.url} alt="Faktero" className="h-10 w-auto object-contain" />
        <span className="text-xs text-muted-foreground">API-first fakturácia</span>
      </div>
    );
  }

  // Header variant — compact wordmark
  return (
    <img src={logoFull.url} alt="Faktero" className={cn("h-8 w-auto object-contain", className)} />
  );
}
