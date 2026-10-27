import { PlayCircle } from "lucide-react";
import { formatDuration, type VideoNavod } from "@/lib/faktero/video-navody";
import { useT } from "@/lib/i18n/useT";

/** Prehrávač video návodu. Video sa sťahuje až po kliknutí na prehrať (preload="none"). */
export function VideoNavodPlayer({
  video,
  className = "",
}: {
  video: VideoNavod;
  className?: string;
}) {
  const { t } = useT();
  return (
    <figure
      className={`overflow-hidden rounded-xl border border-border bg-card shadow-sm ${className}`}
    >
      <video
        controls
        preload="none"
        playsInline
        poster={video.posterUrl}
        className="aspect-video w-full bg-black"
        aria-label={t("Video návod: {nazov}", { nazov: t(video.title) })}
      >
        <source src={video.videoUrl} type="video/mp4" />
        {t("Váš prehliadač nevie prehrať video.")}{" "}
        <a href={video.videoUrl} className="text-primary underline">
          {t("Stiahnuť video")}
        </a>
        .
      </video>
      <figcaption className="flex items-center gap-2 px-4 py-3 text-sm">
        <PlayCircle className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
        <span className="font-medium">{t(video.title)}</span>
        <span className="ml-auto text-muted-foreground">
          {formatDuration(video.durationSeconds)}
        </span>
      </figcaption>
    </figure>
  );
}
