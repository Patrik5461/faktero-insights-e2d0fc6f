/*
  Trans.eu: návrat po prihlásení na tú istú adresu, z ktorej človek začal.
  Návratová adresa pre Trans.eu je pevná (www.faktero.sk), prihlásenie do
  Faktera však drží prehliadač zvlášť pre faktero.sk a www — kto začal bez www,
  musí sa vrátiť bez www. Odkiaľ začal, nesie cookie `faktero_transeu_navrat`;
  cudzia adresa v nej nesmie byť otvorené presmerovanie. Bez prehliadača,
  nič sa nezapisuje (callback bez kódu len presmeruje s chybou).

  Dvojklik na „Vystaviť faktúru“ pri novej objednávke (obe volania vrátia tú
  istú faktúru) overuje src/lib/faktero/transeu.db.test.ts — potrebuje
  podvrhnutý Trans.eu (`npm run test:db -- transeu`).
*/
const CALLBACK = "/api/public/transeu/callback";
const NAVRAT = "faktero_transeu_navrat";

export default {
  popis: "Trans.eu: po prihlásení späť na faktero.sk alebo www, cudzia adresa neprejde",
  bezPrehliadaca: true,
  limit: 60000,
  async spusti(t) {
    const base = new URL(t.base);
    const produkcia = base.hostname === "www.faktero.sk" || base.hostname === "faktero.sk";

    const kam = async (cookie) => {
      const r = await fetch(`${t.base}${CALLBACK}?state=x`, {
        redirect: "manual",
        headers: cookie ? { cookie } : {},
      });
      t.over(r.status === 302, `callback vrátil ${r.status} namiesto presmerovania`);
      return {
        ciel: new URL(r.headers.get("location")),
        cookies: r.headers.getSetCookie?.() ?? [],
      };
    };

    await t.krok("bez cookie ostane adresa callbacku", async () => {
      const { ciel } = await kam(null);
      t.over(ciel.host === base.host, `presmeroval na ${ciel.host}`);
      t.over(ciel.pathname === "/nastavenia/transeu", ciel.pathname);
      t.over(ciel.searchParams.get("chyba") === "missing_code", ciel.search);
    });

    await t.krok("začal na faktero.sk bez www → späť bez www", async () => {
      const { ciel, cookies } = await kam(`${NAVRAT}=faktero.sk`);
      t.over(ciel.host === (produkcia ? "faktero.sk" : base.host), `presmeroval na ${ciel.host}`);
      t.over(
        cookies.some((c) => c.startsWith(`${NAVRAT}=;`) && /Max-Age=0/i.test(c)),
        "cookie s návratovou adresou sa nezmazala",
      );
    });

    await t.krok("cudzia adresa v cookie neprejde", async () => {
      for (const zla of ["zly.example.com", "faktero.sk.zly.com", "evil.faktero.sk"]) {
        const { ciel } = await kam(`${NAVRAT}=${zla}`);
        t.over(ciel.host === base.host, `cookie ${zla} presmerovala na ${ciel.host}`);
      }
    });
  },
};
