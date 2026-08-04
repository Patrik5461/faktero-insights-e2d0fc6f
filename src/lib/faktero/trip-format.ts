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
  return source;
}
