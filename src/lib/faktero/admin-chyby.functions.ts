import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Admin → Chyby: systémové chyby (server, prehliadač, appka, hooky), zlyhané
  crony a stav procesu na serveri. Všetko len pre platform adminov — overenie
  je v každom handleri pred prvým čítaním cez servisný kľúč.
*/

async function overAdmina(context: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error("Admin check failed");
  if (!data) throw new Error("Forbidden: not a platform admin");
  return { supabaseAdmin };
}

const OBDOBIE_H = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30, "90d": 24 * 90 } as const;
const Obdobie = z.enum(["24h", "7d", "30d", "90d"]);
const odKedy = (o: keyof typeof OBDOBIE_H) =>
  new Date(Date.now() - OBDOBIE_H[o] * 3600_000).toISOString();

const STLPCE =
  "id, odtlacok, zdroj, uroven, sprava, stack, trasa, metoda, http_status, company_id, user_id, user_agent, vydanie, pocet, prvy_vyskyt, posledny_vyskyt, vyriesene_at, znovu_otvorene";

export type SystemovaChyba = {
  id: string;
  odtlacok: string;
  zdroj: "server" | "prehliadac" | "appka" | "cron" | "hook";
  uroven: "chyba" | "varovanie" | "stare_vydanie";
  sprava: string;
  stack: string | null;
  trasa: string | null;
  metoda: string | null;
  http_status: number | null;
  company_id: string | null;
  user_id: string | null;
  user_agent: string | null;
  vydanie: string | null;
  pocet: number;
  prvy_vyskyt: string;
  posledny_vyskyt: string;
  vyriesene_at: string | null;
  znovu_otvorene: number;
};

export const listSystemoveChyby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        zdroje: z.array(z.enum(["server", "prehliadac", "appka", "cron", "hook"])).min(1),
        obdobie: Obdobie.default("7d"),
        stav: z.enum(["nevyriesene", "vyriesene", "vsetky"]).default("nevyriesene"),
        uroven: z.enum(["vsetky", "chyba", "varovanie", "stare_vydanie"]).default("vsetky"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await overAdmina(context);
    let q = (supabaseAdmin as any)
      .from("systemove_chyby")
      .select(STLPCE)
      .in("zdroj", data.zdroje)
      .gte("posledny_vyskyt", odKedy(data.obdobie))
      .order("posledny_vyskyt", { ascending: false })
      .limit(300);
    if (data.stav === "nevyriesene") q = q.is("vyriesene_at", null);
    if (data.stav === "vyriesene") q = q.not("vyriesene_at", "is", null);
    if (data.uroven !== "vsetky") q = q.eq("uroven", data.uroven);
    const { data: rows, error } = await q;
    if (error) {
      // Tabuľka ešte nemusí existovať (migrácia nepustená) — stránka nemá spadnúť.
      return { rows: [] as SystemovaChyba[], chyba: error.message as string };
    }
    return { rows: (rows ?? []) as SystemovaChyba[], chyba: null as string | null };
  });

export const oznacSystemovuChybu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(300), vyriesene: z.boolean() })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await overAdmina(context);
    const { error } = await (supabaseAdmin as any)
      .from("systemove_chyby")
      .update(
        data.vyriesene
          ? { vyriesene_at: new Date().toISOString(), vyriesil: context.userId }
          : { vyriesene_at: null, vyriesil: null },
      )
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("platform_audit_logs").insert({
      admin_user_id: context.userId,
      action: data.vyriesene ? "systemova_chyba.vyriesena" : "systemova_chyba.otvorena",
      entity_type: "systemove_chyby",
      entity_id: data.ids.length === 1 ? data.ids[0] : null,
      metadata: { pocet: data.ids.length },
    });
    return { ok: true };
  });

type CronBeh = {
  nazov: string;
  pocet: number;
  posledny: string;
  sprava: string | null;
  behov_spolu: number;
};
type HttpOdpoved = {
  status_code: number | null;
  timed_out: boolean;
  error_msg: string | null;
  pocet: number;
  posledny: string;
  obsah: string | null;
};

export const zlyhaneCrony = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ obdobie: Obdobie.default("7d") }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await overAdmina(context);
    const { bezTajomstiev } = await import("@/lib/systemove-chyby/spolocne");
    const { data: r, error } = await (supabaseAdmin as any).rpc("admin_zlyhane_crony", {
      p_od: odKedy(data.obdobie),
    });
    if (error) return { behy: [] as CronBeh[], http: [] as HttpOdpoved[], chyba: error.message };
    const v = (r ?? {}) as { behy?: CronBeh[]; http?: HttpOdpoved[] };
    return {
      behy: (v.behy ?? []).map((b) => ({
        ...b,
        sprava: b.sprava ? bezTajomstiev(b.sprava, 500) : null,
      })),
      http: (v.http ?? []).map((h) => ({
        ...h,
        error_msg: h.error_msg ? bezTajomstiev(h.error_msg, 300) : null,
        obsah: h.obsah ? bezTajomstiev(h.obsah, 300) : null,
      })),
      chyba: null as string | null,
    };
  });

/*
  Proces na serveri: počet reštartov z pm2 a posledné riadky chybového logu.
  Z `pm2 jlist` sa berú len vybrané polia — celý výstup obsahuje premenné
  prostredia aj s kľúčmi a nesmie sa dostať von. Riadky logu idú cez
  `bezTajomstiev` a sú orezané.
*/
export const stavProcesuServera = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await overAdmina(context);
    const { bezTajomstiev } = await import("@/lib/systemove-chyby/spolocne");
    const { execFile } = await import("node:child_process");
    const { open } = await import("node:fs/promises");
    const nazov = process.env.name || process.env.PM2_APP_NAME || "faktero";

    const proces: {
      nazov: string;
      stav: string | null;
      restarty: number | null;
      nestabilne: number | null;
      start: string | null;
      pamatMb: number | null;
      cpu: number | null;
    } = {
      nazov,
      stav: null,
      restarty: null,
      nestabilne: null,
      start: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      pamatMb: Math.round(process.memoryUsage().rss / 1048576),
      cpu: null,
    };
    let cestaLogu: string | null = null;
    let chybaPm2: string | null = null;

    try {
      const vystup = await new Promise<string>((res, rej) =>
        execFile("pm2", ["jlist"], { timeout: 5000, maxBuffer: 32 * 1024 * 1024 }, (e, out) =>
          e ? rej(e) : res(out),
        ),
      );
      const zoznam = JSON.parse(vystup) as any[];
      const p = zoznam.find((x) => x?.name === nazov) ?? zoznam.find((x) => x?.pid === process.pid);
      if (p) {
        const e = p.pm2_env ?? {};
        proces.nazov = String(p.name);
        proces.stav = typeof e.status === "string" ? e.status : null;
        proces.restarty = Number.isFinite(e.restart_time) ? e.restart_time : null;
        proces.nestabilne = Number.isFinite(e.unstable_restarts) ? e.unstable_restarts : null;
        proces.start = Number.isFinite(e.pm_uptime)
          ? new Date(e.pm_uptime).toISOString()
          : proces.start;
        proces.pamatMb = p.monit?.memory ? Math.round(p.monit.memory / 1048576) : proces.pamatMb;
        proces.cpu = typeof p.monit?.cpu === "number" ? p.monit.cpu : null;
        cestaLogu = typeof e.pm_err_log_path === "string" ? e.pm_err_log_path : null;
      }
    } catch (e: any) {
      chybaPm2 = String(e?.code ?? e?.message ?? e).slice(0, 120);
    }

    // Bez pm2 skúsi štandardné miesto logu.
    if (!cestaLogu && process.env.HOME)
      cestaLogu = `${process.env.HOME}/.pm2/logs/${nazov}-error.log`;

    let riadky: string[] = [];
    let chybaLogu: string | null = null;
    if (cestaLogu && /\/\.pm2\/logs\/[\w.-]+-error(-\d+)?\.log$/.test(cestaLogu)) {
      try {
        const f = await open(cestaLogu, "r");
        try {
          const { size } = await f.stat();
          const dlzka = Math.min(size, 48 * 1024);
          const buf = Buffer.alloc(dlzka);
          await f.read(buf, 0, dlzka, size - dlzka);
          riadky = buf
            .toString("utf8")
            .split("\n")
            .slice(1) // prvý riadok býva useknutý
            .filter((r) => r.trim())
            .slice(-60)
            .map((r) => bezTajomstiev(r, 300));
        } finally {
          await f.close();
        }
      } catch (e: any) {
        chybaLogu = String(e?.code ?? e?.message ?? e).slice(0, 120);
      }
    }

    return { proces, chybaPm2, riadky, chybaLogu };
  });

/** Súhrn pre Prehľad a Health check: nevyriešené chyby a zlyhané crony za 24 h. */
export const suhrnChyb24h = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await overAdmina(context);
    const od = odKedy("24h");
    const zdroje = { server: 0, prehliadac: 0, appka: 0, cron: 0, hook: 0 } as Record<
      string,
      number
    >;
    let vyskyty = 0;
    let stareVydanie = 0;
    let dostupne = true;
    const { data, error } = await (supabaseAdmin as any)
      .from("systemove_chyby")
      .select("zdroj, uroven, pocet")
      .is("vyriesene_at", null)
      .gte("posledny_vyskyt", od)
      .limit(1000);
    if (error) dostupne = false;
    for (const r of (data ?? []) as { zdroj: string; uroven: string; pocet: number }[]) {
      if (r.uroven === "stare_vydanie") {
        stareVydanie++;
        continue;
      }
      if (r.uroven !== "chyba") continue;
      zdroje[r.zdroj] = (zdroje[r.zdroj] ?? 0) + 1;
      vyskyty += r.pocet;
    }
    let zlyhaneCronyPocet = 0;
    const { data: c } = await (supabaseAdmin as any).rpc("admin_zlyhane_crony", { p_od: od });
    for (const b of ((c as any)?.behy ?? []) as { pocet: number }[]) zlyhaneCronyPocet += b.pocet;
    for (const h of ((c as any)?.http ?? []) as { pocet: number }[]) zlyhaneCronyPocet += h.pocet;
    const spolu = Object.values(zdroje).reduce((a, b) => a + b, 0);
    return { dostupne, spolu, vyskyty, zdroje, stareVydanie, zlyhaneCrony: zlyhaneCronyPocet };
  });
