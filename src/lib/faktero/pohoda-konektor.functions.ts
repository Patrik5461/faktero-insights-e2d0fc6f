import { createServerFn } from "@tanstack/react-start";
import {
  davkovySubor,
  nastavenieUlohy,
  navod,
  nazovBalicka,
  zoznamFiriem,
} from "./pohoda-konektor.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { zakladnaAdresa } from "./pohoda-konektor.server";

/**
 * Vyrobí kľúč a stiahnuteľný balíček pre účtovníčku.
 *
 * Kľúč sa vytvára pri každom stiahnutí nový — starý ostáva platný, takže sa dá
 * balíček znovu poslať bez toho, aby prestal fungovať ten, čo už beží. Zrušiť
 * sa dajú v Nastavenia → API kľúče.
 */
export const pripravKonektorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ziadane = [...new Set(data.companyIds ?? [])];
    if (!ziadane.length) throw new Error("Nevybrali ste žiadnu firmu.");

    /*
      Kľúč smie vydať len majiteľ alebo správca firmy — rovnako, ako to stráži
      politika nad `api_keys`. Kontrolujeme to aj tu, aby sa človek dozvedel
      dôvod: zamietnutý zápis by inak vyzeral ako chyba databázy.
    */
    const { data: clenstva, error: mErr } = await supabase
      .from("company_users")
      .select("company_id, role, company:companies(id, name, ico)")
      .eq("user_id", userId)
      .in("company_id", ziadane);
    if (mErr) throw new Error(mErr.message);

    const firmy = (clenstva ?? [])
      .filter((r: { role: string }) => r.role === "owner" || r.role === "admin")
      .map(
        (r: { company: unknown }) => r.company as { id: string; name: string; ico: string | null },
      )
      .filter(Boolean);
    if (!firmy.length) {
      throw new Error("Ani k jednej z vybraných firiem nemáte právo vydať kľúč.");
    }

    const rok = new Date().getFullYear();
    const riadky: { kluc: string; firma: string; databaza: string }[] = [];

    for (const firma of firmy) {
      const bajty = new Uint8Array(24);
      crypto.getRandomValues(bajty);
      const kluc = `fk_live_${Array.from(bajty)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kluc))),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error: kErr } = await supabase.from("api_keys").insert({
        company_id: firma.id,
        mode: "live",
        name: "Pohoda — konektor",
        prefix: kluc.slice(0, 14),
        key_hash: hash,
      });
      if (kErr) throw new Error(kErr.message);

      const ico = String(firma.ico ?? "").replace(/\D/g, "");
      riadky.push({
        kluc,
        firma: String(firma.name ?? ""),
        /*
          Databáza účtovnej jednotky je odhad podľa IČO a roka — Pohoda si
          súbory takto pomenúva, ale účtovníčka si ich mohla nazvať inak,
          takže si to má overiť. Predvyplnené preto, aby v bežnom prípade
          nemusela hľadať nič.
        */
        databaza: `StwPh_${ico || "00000000"}_${rok}.mdb`,
      });
    }

    const adresa = zakladnaAdresa();
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("faktero-pohoda.cmd", davkovySubor({ adresa }));
    /*
      Bez BOM, na rozdiel od návodu: `for /f "eol=#"` porovnáva **prvý znak**
      riadku, a BOM by sa pred mriežku postavil — hlavička so vysvetlivkami by
      sa potom čítala ako firma. Súbor je zámerne celý bez diakritiky, takže
      ho Poznámkový blok zobrazí správne aj tak.
    */
    zip.file("firmy.txt", zoznamFiriem(riadky));
    zip.file("nastav-ulohu.cmd", nastavenieUlohy());
    // BOM, nech Poznámkový blok prečíta diakritiku.
    zip.file("NAVOD.txt", "\ufeff" + navod({ firmy: riadky.map((r) => r.firma), adresa }));

    return {
      base64: await zip.generateAsync({ type: "base64" }),
      fileName:
        riadky.length === 1 ? nazovBalicka(riadky[0].firma) : "faktero-pohoda-vsetky-firmy.zip",
      firmy: riadky.map((r) => r.firma),
    };
  });

/** Stav konektora do rozhrania — beží vôbec, a čo naposledy priniesol. */
export const stavKonektoraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: kluce }, { data: potvrdene }] = await Promise.all([
      supabase
        .from("api_keys")
        .select("id, last_used_at, revoked_at")
        .eq("company_id", data.companyId)
        .eq("name", "Pohoda — konektor")
        .order("created_at", { ascending: false }),
      supabase
        .from("export_logs")
        .select("invoice_number, pohoda_cislo, pohoda_stav, potvrdene_at, error")
        .eq("company_id", data.companyId)
        .not("potvrdene_at", "is", null)
        .order("potvrdene_at", { ascending: false })
        .limit(5),
    ]);

    const zive = (kluce ?? []).filter((k: { revoked_at: string | null }) => !k.revoked_at);
    const naposledy = zive
      .map((k: { last_used_at: string | null }) => k.last_used_at)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;

    return {
      kluce: zive.length,
      naposledy: naposledy ?? null,
      potvrdene: potvrdene ?? [],
    };
  });
