/**
 * Prehliadačová časť preview režimu. Načíta sa ako prvý import `src/router.tsx`
 * (len cez `vite.config.preview.ts`), takže beží skôr než appka.
 *
 * 1. Strážca siete — fetch/XHR/sendBeacon/WebSocket/EventSource mimo vlastný
 *    pôvod sa zablokuje a zapíše do konzoly (`window.__demoSiet`). Externé
 *    odkazy a `window.open` von sa neotvoria.
 * 2. Toast „Demo – nič sa neodoslalo“, keď server ohlási simulované volanie
 *    (`x-demo-simulovane`) alebo zápis len do pamäte (`x-demo-zapisy`).
 * 3. Automatické prihlásenie demo účtom pri prvej návšteve.
 * 4. Demo panel (vľavo dole) — účet, rola, dizajn, obnova dát. Skryť ho dá
 *    `?demoPanel=0` (pamätá sa) a vrátiť `?demoPanel=1`.
 */
import { toast } from "sonner";

declare global {
  interface Window {
    __demoSiet?: { blokovane: { cas: string; kam: string; sposob: string }[] };
  }
}

const jeKlient = typeof window !== "undefined" && typeof document !== "undefined";

function bezpecne<T>(f: () => T, nahrada: T): T {
  try {
    return f();
  } catch {
    return nahrada;
  }
}

if (jeKlient && !(window as any).__demoNainstalovane) {
  (window as any).__demoNainstalovane = true;
  const POVOD = window.location.origin;
  const stav = (window.__demoSiet = { blokovane: [] as { cas: string; kam: string; sposob: string }[] });

  /* ------------------------------------------------------------ toasty */
  let poslednyToast = 0;
  const demoToast = (popis: string) => {
    const teraz = Date.now();
    if (teraz - poslednyToast < 1200) return;
    poslednyToast = teraz;
    // Toaster appky sa vykreslí až po hydratácii — toast počká na ďalší tik.
    setTimeout(() => toast.info("Demo – nič sa neodoslalo", { description: popis, duration: 4000 }), 0);
  };

  const zablokuj = (kam: string, sposob: string) => {
    stav.blokovane.push({ cas: new Date().toISOString(), kam, sposob });
    console.warn(`[demo] ZABLOKOVANÉ (${sposob}) → ${kam}`);
  };

  const jeVlastny = (adresa: string | URL): boolean => {
    const u = bezpecne(() => new URL(String(adresa), window.location.href), null);
    if (!u) return true;
    if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return true;
    if (u.protocol === "ws:" || u.protocol === "wss:") return u.host === window.location.host;
    return u.origin === POVOD;
  };

  /* ------------------------------------------------------------ fetch */
  const povodnyFetch = window.fetch.bind(window);
  window.fetch = async (vstup: RequestInfo | URL, init?: RequestInit) => {
    const adresa = typeof vstup === "string" || vstup instanceof URL ? String(vstup) : vstup.url;
    const metoda = (init?.method ?? (vstup instanceof Request ? vstup.method : "GET")).toUpperCase();
    if (!jeVlastny(adresa)) {
      zablokuj(`${metoda} ${adresa}`, "fetch");
      demoToast(`Preview neposiela nič mimo tento počítač (${bezpecne(() => new URL(adresa).host, adresa)}).`);
      throw new TypeError("Demo – externé volanie je v preview zablokované");
    }
    const odpoved = await povodnyFetch(vstup as RequestInfo, init);
    const simulovane = odpoved.headers.get("x-demo-simulovane");
    const zapisy = odpoved.headers.get("x-demo-zapisy");
    if (simulovane) {
      demoToast(`Simulované v demo: ${decodeURIComponent(simulovane)}`);
    } else if (zapisy || (adresa.includes("/__demo/rest/") && !["GET", "HEAD"].includes(metoda) && !adresa.includes("/rpc/"))) {
      demoToast("Zmena sa uložila len do pamäte preview.");
    } else if (adresa.includes("/__demo/storage/") && ["POST", "PUT", "DELETE"].includes(metoda) && !adresa.includes("/object/sign/") && !adresa.includes("/object/list")) {
      demoToast("Súbor je len v pamäti preview.");
    }
    return odpoved;
  };

  /* ------------------------------------------------------------ XHR, beacon, WS, SSE */
  const povodnyOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, metoda: string, adresa: string | URL, ...zvysok: any[]) {
    if (!jeVlastny(adresa)) {
      zablokuj(`${metoda} ${adresa}`, "xhr");
      throw new TypeError("Demo – externé volanie je v preview zablokované");
    }
    return (povodnyOpen as any).call(this, metoda, adresa, ...zvysok);
  } as typeof XMLHttpRequest.prototype.open;

  if (navigator.sendBeacon) {
    const povodnyBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (adresa: string | URL, data?: BodyInit | null) => {
      if (!jeVlastny(adresa)) {
        zablokuj(String(adresa), "sendBeacon");
        return true;
      }
      return povodnyBeacon(adresa, data);
    };
  }

  const PovodnyWS = window.WebSocket;
  window.WebSocket = class extends PovodnyWS {
    constructor(adresa: string | URL, protokoly?: string | string[]) {
      if (!jeVlastny(adresa)) {
        zablokuj(String(adresa), "websocket");
        throw new DOMException("Demo – externé spojenie je v preview zablokované", "SecurityError");
      }
      super(adresa, protokoly);
    }
  } as typeof WebSocket;

  if (window.EventSource) {
    const PovodnyES = window.EventSource;
    window.EventSource = class extends PovodnyES {
      constructor(adresa: string | URL, nastavenia?: EventSourceInit) {
        if (!jeVlastny(adresa)) {
          zablokuj(String(adresa), "eventsource");
          throw new DOMException("Demo – zablokované", "SecurityError");
        }
        super(adresa, nastavenia);
      }
    } as typeof EventSource;
  }

  const povodnyOpenOkna = window.open.bind(window);
  window.open = (adresa?: string | URL, ...zvysok: any[]) => {
    if (adresa && !jeVlastny(adresa)) {
      zablokuj(String(adresa), "window.open");
      demoToast(`Externý odkaz sa v preview neotvára (${bezpecne(() => new URL(String(adresa)).host, String(adresa))}).`);
      return null;
    }
    return povodnyOpenOkna(adresa as any, ...zvysok);
  };

  // Kliknutie na externý odkaz (`<a href="https://…">`, mailto: nechávame — nič neodošle).
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!/^https?:/i.test(href) || jeVlastny(href)) return;
      e.preventDefault();
      e.stopPropagation();
      zablokuj(href, "odkaz");
      demoToast(`Externý odkaz sa v preview neotvára (${bezpecne(() => new URL(href).host, href)}).`);
    },
    true,
  );

  /* ------------------------------------------------------------ prihlásenie */
  const kluceRelacie = () => {
    const meno = bezpecne(() => new URL(POVOD + "/__demo").hostname.split(".")[0], "127");
    return `sb-${meno}-auth-token`;
  };
  const nastavRelaciu = (ucet: string) => {
    const xhr = new XMLHttpRequest();
    povodnyOpen.call(xhr, "GET", `/__demo/relacia?ucet=${encodeURIComponent(ucet)}`, false);
    xhr.send();
    if (xhr.status === 200) localStorage.setItem(kluceRelacie(), xhr.responseText);
  };
  bezpecne(() => {
    const parametre = new URLSearchParams(window.location.search);
    const ucet = parametre.get("demoUcet");
    if (ucet) nastavRelaciu(ucet);
    else if (!localStorage.getItem("faktero.demo.pripravene")) {
      localStorage.setItem("faktero.demo.pripravene", "1");
      if (!localStorage.getItem(kluceRelacie())) nastavRelaciu("majitel@demo.faktero.sk");
      // Lišta cookies by na každej snímke zakrývala obsah — v preview je súhlas „len nevyhnutné“.
      if (!localStorage.getItem("faktero-cookie-consent")) {
        localStorage.setItem(
          "faktero-cookie-consent",
          JSON.stringify({ necessary: true, analytics: false, marketing: false, acceptedAt: new Date().toISOString(), recorded: true }),
        );
      }
    }
    const dizajn = parametre.get("demoDizajn");
    if (dizajn === "kompaktny" || dizajn === "faktero") localStorage.setItem("faktero.dizajn", dizajn);
    const panel = parametre.get("demoPanel");
    if (panel === "0") localStorage.setItem("faktero.demo.panel", "0");
    if (panel === "1") localStorage.removeItem("faktero.demo.panel");
  }, undefined);

  /* ------------------------------------------------------------ panel */
  const vykresliPanel = () => {
    if (localStorage.getItem("faktero.demo.panel") === "0") return;
    if (document.getElementById("faktero-demo-panel")) return;
    const hostitel = document.createElement("div");
    hostitel.id = "faktero-demo-panel";
    hostitel.setAttribute("data-demo-panel", "");
    hostitel.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483646;";
    const tien = hostitel.attachShadow({ mode: "open" });
    tien.innerHTML = `
<style>
  :host{all:initial}
  *{box-sizing:border-box;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}
  .tl{background:#111827;color:#fde68a;border:1px solid #f59e0b;border-radius:999px;padding:4px 10px;cursor:pointer;font-weight:700;letter-spacing:.04em}
  .p{display:none;position:absolute;left:0;bottom:30px;width:280px;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:10px}
  .p.o{display:block}
  label{display:block;margin:6px 0 2px;color:#374151;font-weight:600}
  select,button.b{width:100%;padding:5px 6px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#111827}
  button.b{cursor:pointer;margin-top:8px;background:#f9fafb}
  .m{color:#6b7280;margin-top:6px}
  h4{margin:0 0 4px;font-weight:700;font-size:13px}
</style>
<button class="tl" title="Demo preview — nič sa neodosiela">DEMO</button>
<div class="p" role="dialog" aria-label="Demo preview">
  <h4>Demo preview</h4>
  <div class="m">Lokálne demo dáta, nič sa neodosiela ani neukladá.</div>
  <label for="u">Účet</label><select id="u"></select>
  <label for="r">Rola v demo firmách</label>
  <select id="r">
    <option value="owner">Majiteľ</option><option value="admin">Administrátor</option>
    <option value="accountant">Účtovník</option><option value="employee">Používateľ</option>
    <option value="custom">Vlastný prístup (faktúry, doklady – čítať, kontakty, sklad – čítať)</option>
  </select>
  <label for="d">Dizajn</label>
  <select id="d"><option value="faktero">Klasický (Faktero)</option><option value="kompaktny">Kompaktný</option></select>
  <button class="b" id="ok">Použiť a obnoviť</button>
  <button class="b" id="reset">Obnoviť demo dáta</button>
  <button class="b" id="skry">Skryť panel (?demoPanel=1 vráti)</button>
  <div class="m" id="info"></div>
</div>`;
    const $ = <T extends Element>(s: string) => tien.querySelector(s) as T;
    $("button.tl").addEventListener("click", () => $(".p").classList.toggle("o"));
    const aktualnyUcet = () =>
      bezpecne(() => JSON.parse(localStorage.getItem(kluceRelacie()) ?? "null")?.user?.email ?? "", "");
    povodnyFetch("/__demo/stav")
      .then((r) => r.json())
      .then((s) => {
        const u = $<HTMLSelectElement>("#u");
        for (const x of s.ucty) {
          const o = document.createElement("option");
          o.value = x.email;
          o.textContent = `${x.meno} (${x.email})`;
          u.appendChild(o);
        }
        const ja = s.ucty.find((x: any) => x.email === aktualnyUcet()) ?? s.ucty[0];
        u.value = ja.email;
        $<HTMLSelectElement>("#r").value = ja.rola;
        $<HTMLSelectElement>("#d").value = localStorage.getItem("faktero.dizajn") === "kompaktny" ? "kompaktny" : "faktero";
        $("#info").textContent = `Zablokované pokusy o sieť: server ${s.blokovane}, prehliadač ${stav.blokovane.length}`;
        u.addEventListener("change", () => {
          const iny = s.ucty.find((x: any) => x.email === u.value);
          if (iny) $<HTMLSelectElement>("#r").value = iny.rola;
        });
      })
      .catch(() => {});
    $("#ok").addEventListener("click", async () => {
      const ucet = $<HTMLSelectElement>("#u").value;
      const rola = $<HTMLSelectElement>("#r").value;
      const dizajn = $<HTMLSelectElement>("#d").value;
      const stavUctov = await povodnyFetch("/__demo/stav").then((r) => r.json());
      const id = stavUctov.ucty.find((x: any) => x.email === ucet)?.id;
      await povodnyFetch("/__demo/nastav", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ucet: id, rola, dizajn }),
      });
      localStorage.setItem("faktero.dizajn", dizajn);
      nastavRelaciu(ucet);
      window.location.reload();
    });
    $("#reset").addEventListener("click", async () => {
      await povodnyFetch("/__demo/reset", { method: "POST" });
      window.location.reload();
    });
    $("#skry").addEventListener("click", () => {
      localStorage.setItem("faktero.demo.panel", "0");
      hostitel.remove();
    });
    document.body.appendChild(hostitel);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(vykresliPanel, 500));
  else setTimeout(vykresliPanel, 500);

  console.info("[demo] Preview režim: demo dáta v pamäti servera, sieť mimo tento počítač je zablokovaná.");
}

export {};
