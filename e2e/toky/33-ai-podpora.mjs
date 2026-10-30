/*
  Faktero AI, help desk a MCP OAuth — bez volania AI a bez e-mailov:
  - konverzácie asistenta: založenie, správa, zmazanie aj so správami (kaskáda),
    cudzia firma (PALIERA) konverzáciu nedostane a cudzie správy nevidno;
  - help desk: cudzia požiadavka sa nedá čítať ani k nej priložiť súbor,
    tajný token odpovede (`odpoved_token`) klient neprečíta, nepodpísaný
    webhook prijatej pošty (podvrhnutá odpoveď e-mailom) server odmietne;
  - verejná AI na webe odmietne zlé telo ešte pred volaním modelu;
  - MCP OAuth: metadáta, 401 s `resource_metadata`, registrácia klienta
    s cudzou návratovou adresou, token pre neznámeho klienta.
  Konverzácia sa po toku zmaže (aj keď tok spadne).
*/
import { randomUUID } from "node:crypto";
import { BASE, CUDZIA_FIRMA, prihlasRest, qaHeslo } from "../lib/prostredie.mjs";

async function json(cesta, init = {}) {
  const r = await fetch(`${BASE}${cesta}`, init);
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* nie JSON */
  }
  return { status: r.status, data, text, hlavicky: r.headers };
}

export default {
  popis: "AI asistent, help desk a MCP OAuth: práva, mazanie, podpisy (bez AI)",
  bezPrehliadaca: true,
  limit: 90000,
  async spusti(t) {
    const { jwt, userId } = await prihlasRest(qaHeslo());

    await t.krok("konverzácia asistenta: založenie, správa, zmazanie s kaskádou", async () => {
      const k = await t.rest.post("ai_conversations", {
        company_id: t.firmy.test,
        user_id: userId,
        title: `${t.znacka} AI`,
      });
      t.over(
        k.status < 300 && k.data?.[0]?.id,
        `konverzácia sa nezaložila: ${k.status} ${k.text.slice(0, 160)}`,
      );
      const id = k.data[0].id;
      t.uprac("konverzácia AI", async () => {
        await t.rest.delete(`ai_conversations?id=eq.${id}`);
      });
      const m = await t.rest.post("ai_messages", {
        conversation_id: id,
        role: "user",
        content: "test",
      });
      t.over(m.status < 300, `správa sa nezapísala: ${m.status} ${m.text.slice(0, 160)}`);

      // Cudzia firma: RLS konverzáciu nepustí (QA účet nie je členom PALIERY).
      const cudzia = await t.rest.post("ai_conversations", {
        company_id: CUDZIA_FIRMA,
        user_id: userId,
        title: `${t.znacka} cudzia`,
      });
      t.over(cudzia.status >= 400, `konverzácia v cudzej firme prešla: ${cudzia.status}`);
      // Cudzí používateľ ako autor konverzácie tiež nie.
      const zaIneho = await t.rest.post("ai_conversations", {
        company_id: t.firmy.test,
        user_id: randomUUID(),
        title: `${t.znacka} iny`,
      });
      t.over(zaIneho.status >= 400, `konverzácia za iného používateľa prešla: ${zaIneho.status}`);

      const z = await t.rest.delete(`ai_conversations?id=eq.${id}`);
      t.over(z.status < 300, `konverzácia sa nezmazala: ${z.status}`);
      const zvysok = await t.rest.get(`ai_messages?conversation_id=eq.${id}&select=id`);
      t.over(
        zvysok.status === 200 && zvysok.data.length === 0,
        "po zmazaní konverzácie ostali správy",
      );
    });

    await t.krok("help desk: cudzia požiadavka, tajný token, príloha", async () => {
      const token = await t.rest.get("podpora_poziadavky?select=odpoved_token&limit=1");
      t.over(
        token.status === 403 || token.status === 401,
        `odpoved_token je klientovi čitateľný: ${token.status}`,
      );
      const cudzie = await t.rest.get(`podpora_poziadavky?user_id=neq.${userId}&select=id&limit=1`);
      t.over(cudzie.status === 200 && cudzie.data.length === 0, "QA účet vidí cudzie požiadavky");
      const spravy = await t.rest.get("podpora_spravy?interna=eq.true&select=id&limit=1");
      t.over(
        spravy.status === 200 && spravy.data.length === 0,
        "zákazník vidí interné poznámky podpory",
      );

      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const p = await json("/api/mobil/podpora-priloha-nahraj", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          data: { poziadavkaId: randomUUID(), name: "x.png", mime: "image/png", base64: png },
        }),
      });
      t.over(
        p.status === 400 && /nenašla/.test(p.data?.error ?? ""),
        `príloha k cudzej požiadavke: ${p.status} ${p.text.slice(0, 160)}`,
      );
    });

    await t.krok("podvrhnutá odpoveď e-mailom: nepodpísaný webhook pošty", async () => {
      const telo = JSON.stringify({
        type: "email.received",
        data: {
          email_id: randomUUID(),
          from: "efaktura-qa@faktero.sk",
          to: ["podpora-000000000000000000@doklady.faktero.sk"],
        },
      });
      for (const hlavicky of [
        {},
        {
          "svix-id": "msg_e2e",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "v1,AAAA",
        },
      ]) {
        const r = await json("/api/public/mail/prijem", {
          method: "POST",
          headers: { "content-type": "application/json", ...hlavicky },
          body: telo,
        });
        t.over(r.status === 401, `nepodpísaný webhook pošty: ${r.status}`);
      }
    });

    await t.krok("verejná AI: zlé telo odmietne bez volania modelu", async () => {
      for (const telo of [{}, { messages: [] }, { messages: [{ role: "system", content: "x" }] }]) {
        const r = await json("/api/public/support-chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(telo),
        });
        // 429 je v poriadku — strop práve vyčerpal niekto iný a model sa tiež nevolal.
        t.over(r.status === 400 || r.status === 429, `support-chat so zlým telom: ${r.status}`);
      }
    });

    await t.krok("MCP OAuth: metadáta, 401, registrácia, token", async () => {
      const zdroj = await json("/.well-known/oauth-protected-resource/api/mcp");
      t.over(
        zdroj.data?.resource === `${BASE}/api/mcp`,
        `metadáta zdroja: ${zdroj.text.slice(0, 160)}`,
      );
      const server = await json("/.well-known/oauth-authorization-server");
      t.over(
        server.data?.code_challenge_methods_supported?.includes("S256") &&
          server.data?.registration_endpoint?.endsWith("/oauth/register"),
        `metadáta servera: ${server.text.slice(0, 160)}`,
      );
      const mcp = await json("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      t.over(
        mcp.status === 401 && /resource_metadata=/.test(mcp.hlavicky.get("www-authenticate") ?? ""),
        `MCP bez tokenu: ${mcp.status} ${mcp.hlavicky.get("www-authenticate")}`,
      );
      for (const adresa of ["http://evil.example/cb", "javascript:alert(1)"]) {
        const r = await json("/oauth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_name: `${t.znacka}`, redirect_uris: [adresa] }),
        });
        t.over(
          r.status === 400 && r.data?.error === "invalid_redirect_uri",
          `registrácia s ${adresa}: ${r.status}`,
        );
      }
      const tok = await json("/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "x",
          code_verifier: "y".repeat(50),
          client_id: "mcp_neexistuje",
        }),
      });
      t.over(
        tok.status === 401 && tok.data?.error === "invalid_client",
        `token neznámeho klienta: ${tok.status}`,
      );
    });
  },
};
