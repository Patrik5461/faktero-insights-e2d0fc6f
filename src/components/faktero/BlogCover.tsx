import type { LucideIcon } from "lucide-react";

/**
 * Obálka článku kreslená v kóde.
 *
 * Zámerne nie fotka: stiahnutá fotografia z fotobanky by znamenala licenciu,
 * ďalší súbor na stiahnutie pri každom otvorení a vzhľad, aký má polovica
 * internetu. Toto je čisté SVG — ostré na akomkoľvek displeji, váži nič a
 * drží sa značkových farieb.
 *
 * Každý článok má vlastný odtieň a ikonu, takže sa v zozname rozlíšia na
 * prvý pohľad aj bez čítania nadpisu.
 */

export type Odtien = "zelena" | "modra" | "jantar" | "fialova";

const ODTIENE: Record<Odtien, { od: string; do: string; akcent: string }> = {
  zelena: { od: "#007e46", do: "#0a8f52", akcent: "#7ee2b0" },
  modra: { od: "#0f4c81", do: "#1f6fb2", akcent: "#93c5fd" },
  jantar: { od: "#8a5a00", do: "#b57d10", akcent: "#fcd34d" },
  fialova: { od: "#4c2a85", do: "#6d42b8", akcent: "#c4b5fd" },
};

export function BlogCover({
  icon: Icon,
  odtien,
  vysoka,
}: {
  icon: LucideIcon;
  odtien: Odtien;
  /** Na detaile článku je obálka vyššia než v zozname. */
  vysoka?: boolean;
}) {
  const f = ODTIENE[odtien];
  return (
    <div
      aria-hidden
      className={`relative w-full overflow-hidden ${vysoka ? "h-56 md:h-72" : "h-36"}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${f.od} 0%, ${f.do} 100%)` }}
    >
      {/* Rastr bodiek — dá ploche hĺbku bez toho, aby prekrikoval nadpis. */}
      <svg className="absolute inset-0 h-full w-full opacity-25" aria-hidden>
        <defs>
          <pattern id={`bodky-${odtien}`} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.6" fill={f.akcent} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bodky-${odtien})`} />
      </svg>

      {/* Dva mäkké kruhy — jednoduchý motív, ktorý funguje aj v malej karte. */}
      <div
        className="absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-25 blur-2xl"
        style={{ backgroundColor: f.akcent }}
      />
      <div
        className="absolute -bottom-20 left-8 h-40 w-40 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: "#ffffff" }}
      />

      <Icon
        className={`absolute right-6 ${vysoka ? "bottom-6 h-24 w-24" : "bottom-4 h-14 w-14"} text-white/85`}
        strokeWidth={1.25}
      />
    </div>
  );
}
