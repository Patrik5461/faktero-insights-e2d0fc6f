import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  Asset,
  Scripts,
  useTags,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import "@/lib/faktero/toast-chyby";
import { PotvrdzovacieOkno } from "@/components/faktero/PotvrdzovacieOkno";
import { CookieConsentBanner } from "@/components/faktero/cookie-consent";
import { NativeRouteGuard } from "@/components/mobile/NativeRouteGuard";
import { PreskocitNaObsah } from "@/components/faktero/PreskocitNaObsah";
import { listSeoPagesPublic } from "@/lib/seo.functions";
import { SKRIPT_DO_HLAVICKY } from "@/lib/faktero/motiv";
import { COOKIE_JAZYKA, preloz, type Jazyk } from "@/lib/i18n/jazyk";
import { zistiJazyk } from "@/lib/i18n/zisti-jazyk";
import { jazykZAdresy, upravZnackyHlavicky } from "@/lib/i18n/jazyk-adresa";
import { JazykProvider } from "@/lib/i18n/useT";
import { SKRIPT_DIZAJNU } from "@/lib/faktero/dizajn";
import { SKRIPT_SUHLASU, SKRIPT_GTM, GTM_NOSCRIPT_SRC } from "@/lib/faktero/gtm";

/*
  Chybové stránky koreňa nemusia ležať vnútri `JazykProvider` (ten je až
  v `RootComponent`), preto jazyk berú priamo z kontextu koreňovej trasy.
*/
function useTKorena() {
  const jazyk = useRouterState({
    select: (s) => (s.matches[0]?.context as { jazyk?: Jazyk } | undefined)?.jazyk,
  });
  return (text: string) => preloz(jazyk ?? "sk", text);
}

function NotFoundComponent() {
  const t = useTKorena();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("Stránka sa nenašla")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Táto adresa neexistuje alebo sa presunula inam.")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Späť na úvod")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const t = useTKorena();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("Stránku sa nepodarilo načítať")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Chyba je na našej strane. Skúste to znova alebo sa vráťte na úvod.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Skúsiť znova")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("Späť na úvod")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Jazyk webu z cookie — server tak vykreslí stránku hneď v zvolenom jazyku.
  beforeLoad: async () => ({ jazyk: await zistiJazyk() }),
  loader: async () => {
    try {
      const rows = await listSeoPagesPublic();
      const global = (rows as any[]).find((r) => r.path === "_global") ?? {};
      return {
        googleVerification: global.google_verification ?? null,
        gaMeasurementId: global.ga_measurement_id ?? null,
      };
    } catch {
      return { googleVerification: null, gaMeasurementId: null };
    }
  },
  head: ({ loaderData, match }) => {
    const jazyk: Jazyk = match.context.jazyk ?? "sk";
    const nazov = preloz(jazyk, "Faktero — Moderná fakturácia pre SK a CZ firmy");
    const popis = preloz(
      jazyk,
      "Faktero je API-first fakturačná platforma pre slovenské a české firmy. Vystavujte faktúry manuálne alebo cez API.",
    );
    const gv = loaderData?.googleVerification;
    const ga = loaderData?.gaMeasurementId;
    const meta: any[] = [
      { charSet: "utf-8" },
      {
        // Bez `maximum-scale` — priblíženie prstami nesmie byť zakázané (WCAG
        // 1.4.4). Automatické priblíženie iPhonu pri ťuknutí do poľa rieši
        // písmo polí 16 px na telefóne (styles.css). Natívna appka má vlastnú
        // hlavičku v index.mobile.html.
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: nazov },
      {
        name: "description",
        content: popis,
      },
      { property: "og:title", content: nazov },
      {
        property: "og:description",
        content: popis,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: nazov },
      {
        name: "twitter:description",
        content: popis,
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/4f322507-0af1-495b-95a6-9961c2422916",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/4f322507-0af1-495b-95a6-9961c2422916",
      },
    ];
    if (gv) meta.push({ name: "google-site-verification", content: gv });

    const scripts: any[] = [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Tobify s. r. o.",
          legalName: "Tobify s. r. o.",
          url: "https://www.faktero.sk",
          email: "info@faktero.sk",
          telephone: "+421902101967",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Športová 707/43",
            postalCode: "919 26",
            addressLocality: "Zavar",
            addressCountry: "SK",
          },
          taxID: "SK2122358579",
          vatID: "SK2122358579",
        }),
      },
    ];
    if (ga) {
      scripts.push({ src: `https://www.googletagmanager.com/gtag/js?id=${ga}`, async: true });
      scripts.push({
        children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`,
      });
    }

    return {
      meta,
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
      ],
      scripts,
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/*
  `HeadContent` z TanStacku, len kanonická adresa ukazuje na jazykovú verziu
  stránky a hneď za ňou idú odkazy hreflang (sk, cs, de, x-default).
*/
function HlavickaStranky({ jazyk }: { jazyk: Jazyk }) {
  const router = useRouter();
  const nonce = router.options.ssr?.nonce;
  const znacky = upravZnackyHlavicky(useTags(), jazyk);
  return (
    <>
      {znacky.map((z) => (
        <Asset {...z} key={`tsr-meta-${JSON.stringify(z)}`} nonce={nonce} />
      ))}
    </>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  const { jazyk } = Route.useRouteContext();
  return (
    /*
      `suppressHydrationWarning` kvôli motívu: skript v hlavičke nastaví na
      `<html>` triedu a `color-scheme` ešte pred hydratáciou, takže sa server
      a prehliadač na tomto prvku nikdy nezhodnú. Je to zámer, nie nesúlad —
      bez potlačenia by React hlásil chybu pri každom načítaní stránky.
    */
    /*
      Natívny výber dátumu v `input[type=date]` sa riadi jazykom dokumentu —
      pri „en" ho prehliadač vyrenderoval podľa svojho nastavenia a ľuďom s
      českým prehliadačom vyskakoval český kalendár. Web je po slovensky, tak
      to má stáť aj tu; appka si `lang` prepisuje podľa zvoleného jazyka.
    */
    <html lang={jazyk ?? "sk"} suppressHydrationWarning>
      <head>
        <HlavickaStranky jazyk={jazyk ?? "sk"} />
        {/*
          Motív sa nasadzuje pred prvým vykreslením, inak by tmavý režim začal
          bielym bliknutím. Preto je to obyčajný skript v hlavičke a nie efekt
          v komponente — ten beží až po prvom kresle.
        */}
        <script dangerouslySetInnerHTML={{ __html: SKRIPT_DO_HLAVICKY + SKRIPT_DIZAJNU }} />
        {/*
          Google Tag Manager. Režim súhlasu musí byť v dataLayer **pred**
          kontajnerom — keby prišiel po ňom, značky by sa medzitým stihli
          spustiť aj tomu, kto v našej lište klikol „Iba nevyhnutné".
        */}
        <script dangerouslySetInnerHTML={{ __html: SKRIPT_SUHLASU }} />
        <script dangerouslySetInnerHTML={{ __html: SKRIPT_GTM }} />
      </head>
      <body>
        {/* GTM pre prehliadače bez JavaScriptu — musí byť hneď za <body>. */}
        <noscript>
          <iframe
            src={GTM_NOSCRIPT_SRC}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, jazyk } = Route.useRouteContext();

  // Jazyk z odkazu `?lang=de` si prehliadač zapamätá — ďalšie stránky bez
  // parametra potom ostanú v tom istom jazyku.
  useEffect(() => {
    const zAdresy = jazykZAdresy(window.location.search);
    if (zAdresy && !document.cookie.includes(`${COOKIE_JAZYKA}=${zAdresy}`))
      document.cookie = `${COOKIE_JAZYKA}=${zAdresy}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return (
    <JazykProvider jazyk={jazyk ?? "sk"}>
      <QueryClientProvider client={queryClient}>
        {/* Prvý prvok pre Tab na každej stránke — web, aplikácia aj verejné odkazy. */}
        <PreskocitNaObsah />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <NativeRouteGuard />
        <Outlet />
        <Toaster />
        <PotvrdzovacieOkno />
        <CookieConsentBanner />
      </QueryClientProvider>
    </JazykProvider>
  );
}
