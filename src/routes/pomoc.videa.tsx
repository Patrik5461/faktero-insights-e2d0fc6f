import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { useT } from "@/lib/i18n/useT";
import { VideoNavodPlayer } from "@/components/faktero/VideoNavodPlayer";
import { VIDEO_NAVODY, videoJsonLd } from "@/lib/faktero/video-navody";

export const Route = createFileRoute("/pomoc/videa")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Video návody — Pomoc — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Krátke video návody k Fakteru so slovenským komentárom — krok za krokom priamo v aplikácii.",
        ),
      },
      { property: "og:title", content: preloz(match.context.jazyk, "Video návody — Faktero") },
      { property: "og:url", content: "https://faktero.sk/pomoc/videa" },
      ...(VIDEO_NAVODY[0] ? [{ property: "og:image", content: VIDEO_NAVODY[0].posterUrl }] : []),
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/videa" }],
    scripts: VIDEO_NAVODY.map((v) => ({
      type: "application/ld+json",
      children: JSON.stringify(videoJsonLd(v)),
    })),
  }),
  component: Page,
});

function Page() {
  const { t } = useT();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          <Link to="/pomoc" className="hover:underline">
            {t("Pomoc")}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Video návody")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {t(
            "Krátke videá, v ktorých vám krok za krokom ukážeme, ako vo Faktere urobiť bežné veci. Každé má slovenský komentár aj titulky.",
          )}
        </p>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {VIDEO_NAVODY.map((v) => (
            <section key={v.slug} id={v.slug} className="scroll-mt-24">
              <VideoNavodPlayer video={v} />
              <p className="mt-3 text-sm text-muted-foreground">
                {t(v.description)} {t("Podrobný písaný návod nájdete v časti")}{" "}
                <Link to={v.helpPath} className="text-primary underline">
                  {t(v.helpLabel)}
                </Link>
                .
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-border bg-card p-5 text-sm">
          <p className="font-semibold">{t("Chýba vám návod?")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("Napíšte nám na")}{" "}
            <a href="mailto:info@faktero.sk" className="text-primary underline">
              info@faktero.sk
            </a>
            {t(", k čomu by sa vám video hodilo. Nové pribúdajú postupne.")}
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
