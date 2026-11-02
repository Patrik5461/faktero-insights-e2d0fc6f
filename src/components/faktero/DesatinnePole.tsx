import { useEffect, useState, type InputHTMLAttributes } from "react";

/**
 * Pole na sumu, ktoré si počas písania drží text.
 *
 * Predtým sa každé stlačenie hneď prevádzalo na číslo (`Number(…) || 0`):
 * „12,“ sa zmenilo na 12 a čiarka zmizla, „12,0“ na 12, zmazané pole na 0 —
 * sumu sa nedalo prepísať na desatinnú. Tu sa text mení voľne a von ide
 * číslo; keď sa hodnota zmení zvonka (prepočet, AI), text sa prepíše.
 */
export function precitajCislo(text: string): number | null {
  const t = text.replace(/\s/g, "").replace(",", ".");
  if (!t || t === "-" || t === "." || t === "-.") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const naText = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export function DesatinnePole({
  hodnota,
  naZmenu,
  prazdne = 0,
  ...rest
}: {
  hodnota: number | null | undefined;
  /** Dostane číslo; prázdne pole = `prazdne` (predvolene 0). */
  naZmenu: (v: number) => void;
  prazdne?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(naText(hodnota));
  useEffect(() => {
    // Zvonka zmenená hodnota (prepočet) prepíše text; vlastné písanie nie.
    if ((precitajCislo(text) ?? prazdne) !== (hodnota ?? prazdne)) setText(naText(hodnota));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hodnota]);
  return (
    <input
      inputMode="decimal"
      {...rest}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        if (!/^-?[\d\s]*[.,]?\d*$/.test(v)) return;
        setText(v);
        naZmenu(precitajCislo(v) ?? prazdne);
      }}
    />
  );
}
