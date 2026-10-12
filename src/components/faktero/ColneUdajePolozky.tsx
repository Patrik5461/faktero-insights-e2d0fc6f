import { useState } from "react";
import { jePlatnyColnyKod } from "@/lib/faktero/colny-kod";
import { VyberColnehoKodu } from "@/components/faktero/VyberColnehoKodu";

/*
  Colný kód (KN), krajina pôvodu a hmotnosť pri položke dokladu — pre vývoz
  mimo EÚ a Intrastat. Väčšina faktúr ich nepotrebuje, preto sú schované za
  odkazom a otvoria sa samy, keď už niečo vyplnené je (napr. z cenníka).
*/

export type ColneUdaje = {
  colny_kod?: string | null;
  krajina_povodu?: string | null;
  hmotnost_kg?: string | number | null;
};

export function ColneUdajePolozky({
  value,
  onChange,
  disabled,
  mobil,
}: {
  value: ColneUdaje;
  onChange: (v: ColneUdaje) => void;
  disabled?: boolean;
  mobil?: boolean;
}) {
  const vyplnene = Boolean(value.colny_kod || value.krajina_povodu || value.hmotnost_kg);
  const [otvorene, setOtvorene] = useState(false);
  if (!vyplnene && !otvorene) {
    if (disabled) return null;
    return (
      <button
        type="button"
        onClick={() => setOtvorene(true)}
        className={`text-xs text-primary hover:underline ${mobil ? "mb-2" : "ml-2 mt-0.5"}`}
      >
        + Colný kód
      </button>
    );
  }
  const zlyKod = !jePlatnyColnyKod(value.colny_kod);
  const pole =
    "rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring";
  return (
    <div className={`flex flex-wrap items-start gap-2 ${mobil ? "mb-2" : "mt-1"}`}>
      <label className="flex items-start gap-1 text-xs text-muted-foreground">
        <span className="pt-1">KN</span>
        <div className="w-56">
          <VyberColnehoKodu
            value={value.colny_kod}
            disabled={disabled}
            autoFocus={otvorene && !vyplnene}
            onChange={(kod) => onChange({ ...value, colny_kod: kod })}
            className={`${pole} w-full ${zlyKod ? "border-destructive" : "border-input"}`}
          />
        </div>
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        pôvod
        <input
          aria-label="Krajina pôvodu"
          value={value.krajina_povodu ?? ""}
          disabled={disabled}
          maxLength={2}
          onChange={(e) => onChange({ ...value, krajina_povodu: e.target.value.toUpperCase() })}
          placeholder="SK"
          title="Krajina pôvodu tovaru — dvojpísmenový kód (SK, CN, DE…)"
          className={`${pole} w-12 border-input uppercase`}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        kg
        <input
          aria-label="Hmotnosť v kg"
          value={value.hmotnost_kg ?? ""}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) => onChange({ ...value, hmotnost_kg: e.target.value })}
          placeholder="0,5"
          title="Čistá hmotnosť položky spolu v kilogramoch"
          className={`${pole} w-16 border-input`}
        />
      </label>
      {zlyKod && <span className="text-xs text-destructive">Kód má 6–10 číslic.</span>}
    </div>
  );
}
