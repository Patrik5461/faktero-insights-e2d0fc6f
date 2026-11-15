/*
  Testy nesmú nič odoslať naozaj. Vitest načíta `.env` s ostrými kľúčmi, takže
  napr. test strážcu odosielania posielal adminovi skutočné upozornenie
  „Moja firma s.r.o. — pozastavené odosielanie“ (15. 11. 2026). Kľúče
  odosielacích služieb sa preto pred testami zmažú a volanie ich API sa
  zablokuje — test, ktorý odoslanie overuje, si podvrhne `fetch` sám.
*/
import { vi } from "vitest";

for (const k of [
  "RESEND_API_KEY",
  "EPOSTAK_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "WHATSAPP_TOKEN",
  "FCM_SERVER_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
]) {
  delete process.env[k];
}

const ZAKAZANE = /^https:\/\/(api\.resend\.com|api\.telegram\.org|graph\.facebook\.com|fcm\.googleapis\.com)\//i;
const povodny = globalThis.fetch;
if (typeof povodny === "function") {
  vi.stubGlobal("fetch", (vstup: any, init?: any) => {
    const url = typeof vstup === "string" ? vstup : String(vstup?.url ?? vstup);
    if (ZAKAZANE.test(url)) {
      return Promise.resolve(new Response(JSON.stringify({ id: "test-neodoslane" }), { status: 200 }));
    }
    return povodny(vstup, init);
  });
}
