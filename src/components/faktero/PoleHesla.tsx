import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Pole na heslo s tlačidlom „oko“ na zobrazenie zadaného hesla
 * (Patrik 25. 11.: prihlásenie, registrácia, nové heslo, web aj appka).
 * Popisy tlačidla dodáva volajúci — web a appka majú každý svoj slovník.
 */
export function PoleHesla({
  className = "",
  obal = "",
  popisZobraz,
  popisSkry,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  popisZobraz: string;
  popisSkry: string;
  /** Triedy obalu (okraje patria sem, nie na pole — inak by oko nebolo v strede). */
  obal?: string;
}) {
  const [vidno, setVidno] = useState(false);
  const popis = vidno ? popisSkry : popisZobraz;
  return (
    <div className={`relative ${obal}`}>
      <input {...props} type={vidno ? "text" : "password"} className={`${className} pr-10`} />
      <button
        type="button"
        onClick={() => setVidno((v) => !v)}
        aria-label={popis}
        aria-pressed={vidno}
        title={popis}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {vidno ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
