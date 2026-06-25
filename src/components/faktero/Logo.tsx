import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "header" | "full";
  className?: string;
};

export function Logo({ variant = "header", className }: LogoProps) {
  if (variant === "full") {
    return (
      <svg
        viewBox="0 0 200 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("h-auto", className)}
        aria-label="Faktero"
      >
        {/* Icon: rounded square with F */}
        <rect x="4" y="10" width="48" height="48" rx="10" fill="currentColor" className="text-primary" />
        <text
          x="28"
          y="42"
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="700"
          fontSize="26"
        >
          F
        </text>
        {/* Wordmark */}
        <text
          x="64"
          y="32"
          dominantBaseline="central"
          fill="currentColor"
          className="text-foreground"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="700"
          fontSize="24"
          letterSpacing="0"
        >
          Faktero
        </text>
        {/* Tagline */}
        <text
          x="64"
          y="52"
          dominantBaseline="central"
          fill="currentColor"
          className="text-muted-foreground"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="400"
          fontSize="11"
        >
          API-first fakturácia
        </text>
      </svg>
    );
  }

  // Header variant — icon + wordmark only, compact
  return (
    <svg
      viewBox="0 0 160 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-auto", className)}
      aria-label="Faktero"
    >
      {/* Icon: rounded square with F */}
      <rect x="2" y="4" width="32" height="32" rx="8" fill="currentColor" className="text-primary" />
      <text
        x="18"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="18"
      >
        F
      </text>
      {/* Wordmark */}
      <text
        x="42"
        y="20"
        dominantBaseline="central"
        fill="currentColor"
        className="text-foreground"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="20"
        letterSpacing="0"
      >
        Faktero
      </text>
    </svg>
  );
}
