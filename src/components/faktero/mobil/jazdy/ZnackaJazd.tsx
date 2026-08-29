/**
 * Značka samostatnej appky Kniha jázd.
 *
 * Na prihlásení stálo logo Faktera — v appke, ktorá sa volá inak, má iný znak
 * a v obchode je samostatná. Dve appky tej istej firmy s rovnakou značkou sú
 * navyše presne to, čo Apple posudzuje pri pravidle 4.3.
 *
 * Znak je ten istý, aký má ikona: trasa s odjazdom a cieľom. Kreslí sa ako
 * SVG, nie obrázok — v prihlasovacej obrazovke musí byť ostrý v každej
 * veľkosti a nemá zmysel kvôli nemu sťahovať súbor.
 */
export function ZnackaJazd({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 100 100" className="h-9 w-9" aria-hidden>
        <rect width="100" height="100" rx="22.5" className="fill-app-text" />
        <path
          d="M25 77 C84 63, 18 40, 75 25"
          fill="none"
          stroke="white"
          strokeWidth="10.5"
          strokeLinecap="round"
        />
        <circle cx="25" cy="77" r="9.5" fill="white" />
        <circle cx="75" cy="25" r="9.6" fill="none" stroke="white" strokeWidth="7.7" />
      </svg>
      <span className="text-[19px] font-semibold tracking-tight text-app-text">Kniha jázd</span>
    </div>
  );
}
