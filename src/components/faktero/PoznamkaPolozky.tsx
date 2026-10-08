import { useState } from "react";

/**
 * Podrobnejší rozpis pod položkou faktúry (napr. čo presne práca obsahovala).
 * Na PDF sa tlačí menším písmom pod názvom položky. Kým je prázdny, ukáže sa
 * len odkaz, nech tabuľka položiek ostane prehľadná.
 */
export function PoznamkaPolozky({
  value,
  onChange,
  disabled,
  mobil,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
  mobil?: boolean;
}) {
  const [otvorene, setOtvorene] = useState(false);
  const text = value ?? "";
  if (!text && !otvorene) {
    if (disabled) return null;
    return (
      <button
        type="button"
        onClick={() => setOtvorene(true)}
        className={`text-xs text-primary hover:underline ${mobil ? "mb-2" : "ml-2 mt-0.5"}`}
      >
        + Poznámka k položke
      </button>
    );
  }
  return (
    <textarea
      aria-label="Poznámka k položke"
      value={text}
      disabled={disabled}
      autoFocus={otvorene && !text}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => !text.trim() && setOtvorene(false)}
      rows={Math.min(6, Math.max(2, text.split("\n").length))}
      maxLength={2000}
      placeholder="Podrobnejší rozpis položky — vytlačí sa pod jej názvom"
      className={
        mobil
          ? "mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          : "mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground focus:text-foreground"
      }
    />
  );
}
