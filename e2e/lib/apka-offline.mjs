/*
  Appka bez signálu v prehliadači — spoločné pre toky 29-apka-*.

  `setOffline` odreže všetko, aj server, ktorý na webe podáva samotnú appku.
  V telefóne je ale rozhranie v balíčku na disku, takže sa otvorí aj bez
  signálu. Toto ten balíček napodobní: čo sa raz načítalo, podá sa z pamäte.
*/

/**
 * Appka ako balíček v telefóne: čo sa raz načítalo, podá sa aj bez signálu.
 * Na webe stránku drží server — pri „otvorení appky" bez signálu ju preto
 * podáva táto pamäť a všetko ostatné (Supabase, serverové funkcie) zlyhá.
 */
export async function balicekVPamati(ctx, base) {
  const pamat = new Map();
  let bezSiete = false;
  const vlastny = (u) => u.startsWith(base) && !u.includes("/_serverFn/") && !u.includes("/api/");
  ctx.on("response", async (r) => {
    try {
      const u = r.url();
      if (r.request().method() !== "GET" || !vlastny(u) || r.status() !== 200) return;
      pamat.set(u.split("#")[0], {
        body: await r.body(),
        headers: { "content-type": r.headers()["content-type"] ?? "application/octet-stream" },
      });
    } catch {
      /* odpoveď bez tela (presmerovanie) */
    }
  });
  await ctx.route("**/*", async (route) => {
    if (!bezSiete) return route.fallback();
    const u = route.request().url().split("#")[0];
    const z = pamat.get(u) ?? (u.endsWith("/app") ? pamat.get(`${base}/app`) : null);
    if (z && route.request().method() === "GET") return route.fulfill({ status: 200, ...z });
    /*
      V telefóne je v balíčku každý kúsok rozhrania, aj ten, ktorý sa dovtedy
      nenačítal (spracovanie fotky a pod.). Ten sa tu dotiahne mimo prehliadača
      (APIRequestContext offline režim nevidí) — inak by web pri chýbajúcom
      kúsku obnovil stránku, čo appka nerobí.
    */
    if (route.request().method() === "GET" && u.startsWith(`${base}/assets/`)) {
      try {
        const r = await ctx.request.get(u);
        const telo = await r.body();
        const hlavicky = {
          "content-type": r.headers()["content-type"] ?? "application/javascript",
        };
        pamat.set(u, { body: telo, headers: hlavicky });
        return route.fulfill({ status: r.status(), body: telo, headers: hlavicky });
      } catch {
        /* nižšie */
      }
    }
    return route.abort("internetdisconnected");
  });
  return {
    async odpoj(v) {
      bezSiete = v;
      await ctx.setOffline(v);
    },
  };
}
