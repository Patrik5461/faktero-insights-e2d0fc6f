/**
 * Video návody. Videá generuje a zverejňuje ~/faktero-tutorials
 * (`npm run tutorials:publish -- <nazov>` vypíše hotový záznam na vloženie sem).
 * Súbory ležia vo verejnom Supabase buckete `video-navody`.
 */
export type VideoNavod = {
  slug: string;
  title: string;
  description: string;
  durationSeconds: number;
  videoUrl: string;
  posterUrl: string;
  /** Dátum zverejnenia (YYYY-MM-DD) – pre štruktúrované dáta VideoObject. */
  uploadDate: string;
  /** Článok pomoci, ku ktorému video patrí (a kde sa aj zobrazí). */
  helpPath: string;
  helpLabel: string;
};

export const VIDEO_NAVODY: VideoNavod[] = [
  {
    slug: "vytvorenie-prvej-faktury",
    title: "Vytvorenie prvej faktúry",
    description: "Ako vo Faktere vystaviť faktúru za menej ako minútu.",
    durationSeconds: 79,
    videoUrl:
      "https://sywcjxydnljkzoepfcaz.supabase.co/storage/v1/object/public/video-navody/vytvorenie-prvej-faktury.mp4",
    posterUrl:
      "https://sywcjxydnljkzoepfcaz.supabase.co/storage/v1/object/public/video-navody/vytvorenie-prvej-faktury.jpg",
    uploadDate: "2026-09-22",
    helpPath: "/pomoc/faktury",
    helpLabel: "Faktúry",
  },
];

export function videoNavod(slug: string) {
  return VIDEO_NAVODY.find((v) => v.slug === slug);
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/** schema.org VideoObject – aby Google vedel video zobraziť vo výsledkoch vyhľadávania. */
export function videoJsonLd(v: VideoNavod) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.title,
    description: v.description,
    thumbnailUrl: v.posterUrl,
    contentUrl: v.videoUrl,
    uploadDate: v.uploadDate,
    duration: `PT${Math.floor(v.durationSeconds / 60)}M${v.durationSeconds % 60}S`,
    inLanguage: "sk",
  };
}
