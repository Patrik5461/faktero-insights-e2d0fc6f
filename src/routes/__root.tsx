import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { CookieConsentBanner } from "@/components/faktero/cookie-consent";
import { NativeRouteGuard } from "@/components/mobile/NativeRouteGuard";
import { listSeoPagesPublic } from "@/lib/seo.functions";
import { SKRIPT_DO_HLAVICKY } from "@/lib/faktero/motiv";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Stránka sa nenašla</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Táto adresa neexistuje alebo sa presunula inam.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Späť na úvod
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Stránku sa nepodarilo načítať
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Chyba je na našej strane. Skúste to znova alebo sa vráťte na úvod.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Skúsiť znova
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Späť na úvod
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
  head: ({ loaderData }) => {
    const gv = loaderData?.googleVerification;
    const ga = loaderData?.gaMeasurementId;
    const meta: any[] = [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
      { title: "Faktero — Moderná fakturácia pre SK a CZ firmy" },
      {
        name: "description",
        content:
          "Faktero je API-first fakturačná platforma pre slovenské a české firmy. Vystavujte faktúry manuálne alebo cez API.",
      },
      { property: "og:title", content: "Faktero — Moderná fakturácia pre SK a CZ firmy" },
      {
        property: "og:description",
        content:
          "Faktero je API-first fakturačná platforma pre slovenské a české firmy. Vystavujte faktúry manuálne alebo cez API.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Faktero — Moderná fakturácia pre SK a CZ firmy" },
      {
        name: "twitter:description",
        content:
          "Faktero je API-first fakturačná platforma pre slovenské a české firmy. Vystavujte faktúry manuálne alebo cez API.",
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

function RootShell({ children }: { children: ReactNode }) {
  return (
    /*
      `suppressHydrationWarning` kvôli motívu: skript v hlavičke nastaví na
      `<html>` triedu a `color-scheme` ešte pred hydratáciou, takže sa server
      a prehliadač na tomto prvku nikdy nezhodnú. Je to zámer, nie nesúlad —
      bez potlačenia by React hlásil chybu pri každom načítaní stránky.
    */
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/*
          Motív sa nasadzuje pred prvým vykreslením, inak by tmavý režim začal
          bielym bliknutím. Preto je to obyčajný skript v hlavičke a nie efekt
          v komponente — ten beží až po prvom kresle.
        */}
        <script dangerouslySetInnerHTML={{ __html: SKRIPT_DO_HLAVICKY }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <NativeRouteGuard />
      <Outlet />
      <Toaster />
      <CookieConsentBanner />
    </QueryClientProvider>
  );
}
