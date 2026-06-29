import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getProductCapabilitiesMarkdown } from "@/lib/faktero/product-capabilities";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

const SYSTEM = `Si Faktero AI podpora — priateľský asistent pre verejnú webovú stránku faktero.sk.
Odpovedaj VÝHRADNE po slovensky, stručne (2–5 viet), priateľsky a profesionálne. Používaj markdown len pre zoznamy alebo zvýraznenie.

Faktero je moderný fakturačný SaaS pre slovenské a české firmy a živnostníkov.
Nižšie dostaneš v druhej systémovej správe aktuálnu Faktero Knowledge Base so zoznamom všetkých modulov, ktoré Faktero reálne podporuje (napr. Fakturácia, Sklad, Kniha jázd, Commander GPS, eFaktúra, API, FinStat, GoPay, Import zo SuperFaktúry).
Tento zoznam je autoritatívny. NIKDY netvrď, že modul z Knowledge Base neexistuje. Ak sa pýtajú "Máte X?" (kniha jázd, GPS, Commander, sklad, eFaktúra, API, ...), odpovedz potvrdzujúco a stručne vymenuj kľúčové funkcie.
Pri otázke "Prečo Faktero?" alebo "Čo všetko viete?" vymenuj hlavné moduly: Fakturácia, FinStat, GoPay, Sklad, Kniha jázd, Commander GPS, API, eFaktúra, Import zo SuperFaktúry.

Cenník a plány: aktuálne plány zahŕňajú Free, Pro a Enterprise. Presné ceny nájde používateľ na /cennik.
Skúšobná verzia: 2 Mesiace zdarma, bez platobnej karty pri registrácii.
Registrácia: /registracia. Prihlásenie: /prihlasenie.
Podpora: podpora@faktero.sk.
Pomocník: /pomoc. Dokumentácia API: /docs/api.

PRAVIDLÁ:
- Neposkytuj právne ani daňové poradenstvo. Ak sa pýtajú, povedz: "Nie som právny ani daňový poradca, poraďte sa prosím s vaším účtovníkom."
- Nemáš prístup k žiadnym používateľským údajom, faktúram, odberateľom ani API kľúčom.
- Nevykonávaj žiadne akcie na účte — len odpovedaj na otázky.
- Ak otázka nesúvisí s Fakterom alebo informáciu nemáš v Knowledge Base, povedz: "Toto neviem zodpovedať. Napíšte nám na podpora@faktero.sk a ozveme sa vám." Pre otázky o existujúcich moduloch z Knowledge Base však VŽDY odpovedz potvrdzujúco.
- Pri otázkach o cenách smeruj na /cennik.
- Pri záujme o vyskúšanie smeruj na /registracia.`;

export const Route = createFileRoute("/api/public/support-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "invalid_input" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "ai_unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: SYSTEM },
                { role: "system", content: getProductCapabilitiesMarkdown() },
                ...parsed.messages,
              ],
              max_tokens: 500,
            }),
          });
          if (res.status === 429) {
            return new Response(
              JSON.stringify({ error: "rate_limited", message: "Príliš veľa otázok. Skúste o chvíľu." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (res.status === 401) {
            return new Response(
              JSON.stringify({ error: "ai_unavailable", message: "AI podpora je dočasne nedostupná. Napíšte nám na podpora@faktero.sk." }),
              { status: 503, headers: { "Content-Type": "application/json" } },
            );
          }
          if (!res.ok) {
            return new Response(JSON.stringify({ error: "ai_error" }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
          const json: any = await res.json();
          const content =
            json?.choices?.[0]?.message?.content ??
            "Toto neviem zodpovedať. Napíšte nám na podpora@faktero.sk a ozveme sa vám.";
          return new Response(JSON.stringify({ content }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "ai_error" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});