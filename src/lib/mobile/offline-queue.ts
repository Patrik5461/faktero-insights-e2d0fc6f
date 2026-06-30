/**
 * Offline fronta pre zápisy (faktúry, jazdy, ...).
 * Stratégia: ak `navigator.onLine === false` alebo nativ. fetch zlyhá,
 * uloží sa request do localStorage. Po `online` evente sa fronta presype.
 *
 * Toto je minimálny adapter — komponenty volajú `queueOrPost(...)` namiesto fetch.
 */
type Job = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  ts: number;
};

const KEY = "faktero.offline.queue.v1";

function load(): Job[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function save(q: Job[]) { localStorage.setItem(KEY, JSON.stringify(q)); }

export function queueLength(): number { return load().length; }

export async function isOnline(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Network } = await import("@capacitor/network");
      const s = await Network.getStatus();
      return s.connected;
    }
  } catch {}
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function queueOrPost(url: string, init: RequestInit & { body?: string }): Promise<Response> {
  const online = await isOnline();
  if (online) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (e) {
      // network error → queue
    }
  }
  const job: Job = {
    id: crypto.randomUUID(),
    url,
    method: init.method ?? "POST",
    headers: (init.headers as Record<string, string>) ?? {},
    body: typeof init.body === "string" ? init.body : undefined,
    ts: Date.now(),
  };
  const q = load();
  q.push(job);
  save(q);
  return new Response(JSON.stringify({ queued: true, id: job.id }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const q = load();
  if (q.length === 0) return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  const remaining: Job[] = [];
  for (const job of q) {
    try {
      const res = await fetch(job.url, {
        method: job.method,
        headers: job.headers,
        body: job.body,
      });
      if (res.ok) sent++; else { failed++; remaining.push(job); }
    } catch {
      failed++; remaining.push(job);
    }
  }
  save(remaining);
  return { sent, failed };
}

export function initOfflineSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => { flushQueue().catch(() => {}); });
  (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Network } = await import("@capacitor/network");
        Network.addListener("networkStatusChange", (s) => {
          if (s.connected) flushQueue().catch(() => {});
        });
      }
    } catch {}
  })();
}
