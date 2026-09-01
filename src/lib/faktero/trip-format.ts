export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return "—";
  const s = Math.round(Number(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatSpeed(
  distanceKm: number | null | undefined,
  durationSeconds: number | null | undefined,
  stored?: number | null,
): string {
  if (stored != null && Number.isFinite(Number(stored)) && Number(stored) > 0)
    return `${Number(stored).toFixed(0)} km/h`;
  const d = Number(distanceKm);
  const sec = Number(durationSeconds);
  if (!Number.isFinite(d) || !Number.isFinite(sec) || sec <= 0) return "—";
  return `${(d / (sec / 3600)).toFixed(0)} km/h`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "Manuálne";
  if (source === "commander") return "Commander GPS";
  if (source === "drive_detector") return "Automatická detekcia";
  return source;
}

/** Súkromná jazda firemným autom patrí do knihy jázd, ale musí byť vidieť. */
export function jeSukromna(classification: string | null | undefined): boolean {
  return classification === "private";
}

/** Popis do exportov. Prázdna hodnota je služobná — tak vznikali staré jazdy. */
export function charakterJazdy(classification: string | null | undefined): string {
  return jeSukromna(classification) ? "Súkromná" : "Služobná";
}

/**
 * Účel jazdy na zobrazenie vedľa charakteru — alebo nič.
 *
 * Rozpoznané jazdy si kedysi ukladali účel „Automaticky rozpoznaná jazda"
 * a „Súkromná jazda", Commander píše do všetkých „Služobná cesta". Vedľa
 * štítku Služobná/Súkromná to len opakuje to isté a človeka mätie — hľadá
 * v tom informáciu, ktorá tam nie je. Vlastný účel („Servis u zákazníka")
 * sa zobrazí.
 */
export function ucelNaZobrazenie(
  purpose: string | null | undefined,
  classification: string | null | undefined,
): string | null {
  const u = purpose?.trim();
  if (!u) return null;
  const holy = u.toLowerCase().replace(/\s+/g, " ");
  const prazdne = [
    "automaticky rozpoznaná jazda",
    "súkromná jazda",
    "služobná jazda",
    "služobná cesta",
    "jazda",
  ];
  if (prazdne.includes(holy)) return null;
  // „Súkromná" pri súkromnej jazde je to isté slovo dvakrát.
  if (holy === charakterJazdy(classification).toLowerCase()) return null;
  return u;
}

/**
 * Súkromná jazda aj so starými zápismi — na súčty v prehľadoch.
 *
 * Pole `classification` pribudlo neskôr; dovtedy sa charakter písal len do
 * účelu („Súkromná jazda"). Keď je pole vyplnené, rozhoduje **ono**: jazdu,
 * ktorú človek prepol na služobnú, nesmie starý text v účele ťahať späť do
 * súkromných. Účel sa číta len vtedy, keď pole nie je vyplnené vôbec.
 */
export function jeSukromnaJazda(jazda: {
  classification?: string | null;
  purpose?: string | null;
}): boolean {
  if (jazda.classification) return jeSukromna(jazda.classification);
  return /súkrom/i.test(jazda.purpose ?? "");
}
