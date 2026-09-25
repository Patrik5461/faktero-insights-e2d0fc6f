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
Nižšie dostaneš v druhej systémovej správe aktuálnu Faktero Knowledge Base so zoznamom všetkých modulov, ktoré Faktero reálne podporuje (napr. Fakturácia, Sklad, Kniha jázd, Commander GPS, eFaktúra, API, FinStat, importy z iných systémov).
Tento zoznam je autoritatívny. NIKDY netvrď, že modul z Knowledge Base neexistuje. Ak sa pýtajú "Máte X?" (kniha jázd, GPS, Commander, sklad, eFaktúra, API, ...), odpovedz potvrdzujúco a stručne vymenuj kľúčové funkcie.
Pri otázke "Prečo Faktero?" alebo "Čo všetko viete?" vymenuj hlavné moduly: Fakturácia, FinStat, Sklad, Kniha jázd, Commander GPS, API, eFaktúra, importy z iných systémov.
Platby kartou pre zákazníkov firmy Faktero neponúka — na úhrady slúži QR platba na faktúre a párovanie úhrad z banky. GoPay je len spôsob, akým sa platí predplatné Faktera.

Cenník a plány: aktuálne plány zahŕňajú Free, Pro a Enterprise. Presné ceny nájde používateľ na /cennik.
Skúšobná verzia: 30 dní zdarma, bez platobnej karty pri registrácii.
Registrácia: /registracia. Prihlásenie: /prihlasenie.
Podpora: podpora@faktero.sk, telefón +421902101967.
Pomocník: /pomoc. Dokumentácia API: /docs/api.

PRAVIDLÁ:
- Neposkytuj právne ani daňové poradenstvo. Ak sa pýtajú, povedz: "Nie som právny ani daňový poradca, poraďte sa prosím s vaším účtovníkom."
- Nemáš prístup k žiadnym používateľským údajom, faktúram, odberateľom ani API kľúčom.
- Nevykonávaj žiadne akcie na účte — len odpovedaj na otázky.
- Ak otázka nesúvisí s Fakterom alebo informáciu nemáš v Knowledge Base, povedz: "Toto neviem zodpovedať. Napíšte nám na podpora@faktero.sk alebo zavolajte na +421902101967 a ozveme sa vám." Pre otázky o existujúcich moduloch z Knowledge Base však VŽDY odpovedz potvrdzujúco.
- Telefónne číslo píš vždy presne v tvare +421902101967, bez medzier a bez iného členenia — ľudia si ho z odpovede kopírujú.
- Pri otázkach o cenách smeruj na /cennik.
- Pri záujme o vyskúšanie smeruj na /registracia.`;

/**
 * Jednoduchý strop na IP. Endpoint je zámerne verejný (chat na marketingovom
 * webe), takže bez neho vie ktokoľvek volať platený model donekonečna a míňať
 * cudzie kredity. Appka beží ako jeden proces pod pm2, takže pamäť stačí —
 * pri viacerých inštanciách to bude treba presunúť do databázy.
 */
const OKNO_MS = 60_000;
const MAX_ZA_OKNO = 8;
const historia = new Map<string, number[]>();

function prekrocenyLimit(ip: string): boolean {
  const teraz = Date.now();
  const nedavne = (historia.get(ip) ?? []).filter((t) => teraz - t < OKNO_MS);
  nedavne.push(teraz);
  historia.set(ip, nedavne);
  // Mapa by inak rástla donekonečna — staré IP adresy priebežne vyhadzujeme.
  if (historia.size > 5000) {
    for (const [k, v] of historia) {
      if (v.every((t) => teraz - t >= OKNO_MS)) historia.delete(k);
    }
  }
  return nedavne.length > MAX_ZA_OKNO;
}

export const Route = createFileRoute("/api/public/support-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip") ||
          "neznama";
        if (prekrocenyLimit(ip)) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": "60" },
          });
        }

        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "invalid_input" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Stačí ktorýkoľvek poskytovateľ — vrstva si vyberie sama.
        if (!process.env.GEMINI_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) {
          return new Response(JSON.stringify({ error: "ai_unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          /*
            Návštevník sa pýta na to isté, čo je v manuáloch — tie sú preto
            najlepší podklad. Posiela sa obsah pomoci a úryvky k poslednej
            otázke; bez nich asistent poznal len zoznam funkcií a postupy si
            domýšľal.
          */
          const { znalostiKOtazke } = await import("@/lib/faktero/znalosti");
          const poslednaOtazka =
            [...parsed.messages].reverse().find((m: any) => m.role === "user")?.content ?? "";

          const rozhovor = [
            SYSTEM,
            getProductCapabilitiesMarkdown(),
            znalostiKOtazke(String(poslednaOtazka), 3),
            ...parsed.messages.map(
              (m: any) => `${m.role === "user" ? "NÁVŠTEVNÍK" : "PODPORA"}: ${String(m.content)}`,
            ),
            "PODPORA:",
          ].join("\n\n");

          // Spoločná vrstva: schopnejší model a náhrada, keď prvý poskytovateľ
          // zlyhá. Volanie sa zároveň započíta do merania využitia.
          const { aiText } = await import("@/lib/faktero/ai.server");
          const odpoved = (
            await aiText(rozhovor, { maxOutputTokens: 900, bezUvazovania: true, ucel: "podpora" })
          ).trim();

          const content =
            odpoved ||
            "Toto neviem zodpovedať. Napíšte nám na podpora@faktero.sk alebo zavolajte na +421902101967 a ozveme sa vám.";
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
