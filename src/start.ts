import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // Admin → Chyby. Zápis beží až po odpovedi a nikdy nehodí.
    void import("./lib/systemove-chyby/zapis.server")
      .then((m) => {
        const cesta = new URL(request.url).pathname;
        m.zaznamenajChybu({
          zdroj: m.zdrojPodlaCesty(cesta),
          chyba: error,
          trasa: cesta,
          metoda: request.method,
          httpStatus: 500,
          userId: m.pouzivatelZHlaviciek(request.headers),
          userAgent: request.headers.get("user-agent"),
        });
      })
      .catch(() => {});
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/*
  Chyby server funkcií (createServerFn) do Admin → Chyby. Výnimka ide ďalej
  nezmenená — prehliadač ju dostane rovnako ako doteraz; len sa zapíše.
  Očakávané chyby (presmerovanie, neprihlásený, zlý vstup) triedi
  `urovenChybyFunkcie`.
*/
const zachytChybyFunkcii = createMiddleware({ type: "function" }).server(
  async ({ next, data, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      void import("./lib/systemove-chyby/zapis.server")
        .then(async (m) => {
          const uroven = m.urovenChybyFunkcie(error);
          if (!uroven) return;
          let request: Request | null = null;
          try {
            const { getRequest } = await import("@tanstack/react-start/server");
            request = getRequest();
          } catch {
            request = null;
          }
          const vstup = data as unknown as { companyId?: unknown; company_id?: unknown } | null;
          const kde = serverFnMeta ? `${serverFnMeta.filename}#${serverFnMeta.name}` : null;
          m.zaznamenajChybu({
            zdroj: "server",
            uroven,
            chyba: error,
            kde,
            trasa: kde ?? (request ? new URL(request.url).pathname : null),
            metoda: request?.method ?? "POST",
            httpStatus: 500,
            companyId: String(vstup?.companyId ?? vstup?.company_id ?? ""),
            userId: m.pouzivatelZHlaviciek(request?.headers),
            userAgent: request?.headers.get("user-agent"),
          });
        })
        .catch(() => {});
      throw error;
    }
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, zachytChybyFunkcii],
  requestMiddleware: [errorMiddleware],
}));
