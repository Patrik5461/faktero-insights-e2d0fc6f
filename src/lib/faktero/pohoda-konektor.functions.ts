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

    /** Nový kľúč: text do balíčka a odtlačok do databázy. */
    async function novyKluc() {
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
      return { kluc, hash };
    }

    /*
      Viac firiem = jeden kľúč účtu a v každom riadku firmy.txt za zavináčom
      jej IČO (`fk_live_…@12345678`). Konektor ho pošle ako `?company=` a API
      vyberie firmu rovnako ako pri hlavičke X-Company. IČO len vtedy, keď je
      medzi vybranými jedinečné — inak by sa dve firmy zliali do jednej.
    */
    let jedenKluc: { vsetky: boolean } | undefined;
    let spolocny: string | null = null;
    if (firmy.length > 1) {
      const { data: vsetkyMoje } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", userId)
        .in("role", ["owner", "admin"]);
      const moje = new Set((vsetkyMoje ?? []).map((r: { company_id: string }) => r.company_id));
      // Kto vybral všetky svoje firmy, dostane kľúč aj pre tie, čo pribudnú.
      const vsetky = firmy.length >= moje.size && firmy.every((f) => moje.has(f.id));
      const { kluc, hash } = await novyKluc();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: kErr } = await supabaseAdmin.from("api_keys").insert({
        company_id: firmy[0].id,
        mode: "live",
        name: "Pohoda — konektor",
        prefix: kluc.slice(0, 14),
        key_hash: hash,
        created_by: userId,
        ucet_user_id: userId,
        firmy: vsetky ? null : firmy.map((f) => f.id),
      });
      if (kErr) throw new Error(kErr.message);
      spolocny = kluc;
      jedenKluc = { vsetky };
    }
    const icoFirmy = (f: { ico: string | null }) => String(f.ico ?? "").replace(/\D/g, "");
    const pocetIco = new Map<string, number>();
    for (const f of firmy) pocetIco.set(icoFirmy(f), (pocetIco.get(icoFirmy(f)) ?? 0) + 1);

    for (const firma of firmy) {
      const ico = icoFirmy(firma);
      let kluc: string;
      if (spolocny) {
        kluc = `${spolocny}@${ico && pocetIco.get(ico) === 1 ? ico : firma.id}`;
      } else {
        const novy = await novyKluc();
        const { error: kErr } = await supabase.from("api_keys").insert({
          company_id: firma.id,
          mode: "live",
          name: "Pohoda — konektor",
          prefix: novy.kluc.slice(0, 14),
          key_hash: novy.hash,
        });
        if (kErr) throw new Error(kErr.message);
        kluc = novy.kluc;
      }

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
    zip.file(
      "NAVOD.txt",
      "\ufeff" + navod({ firmy: riadky.map((r) => r.firma), adresa, jedenKluc }),
    );

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
  .validator((input: { companyId: string; companyIds?: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    /*
      Stav sa pýta za všetky firmy, ktoré balíček nesie, nie len za tú
      prepnutú. Jeden balíček obsluhuje aj desiatky klientov a keby sa stav
      dal zistiť len prepínaním firiem, nikto by si nevšimol, že sa jedna
      z nich prestala ozývať.
    */
    const idFiriem = [...new Set([data.companyId, ...(data.companyIds ?? [])])];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: kluce }, { data: potvrdene }, { data: ucetKluce }, ...ozvania] =
      await Promise.all([
        supabase
          .from("api_keys")
          .select("id, company_id, last_used_at, revoked_at, ucet_user_id")
          .in("company_id", idFiriem)
          .eq("name", "Pohoda — konektor")
          .order("created_at", { ascending: false }),
        supabase
          .from("export_logs")
          .select("invoice_number, pohoda_cislo, pohoda_stav, potvrdene_at, error")
          .eq("company_id", data.companyId)
          .not("potvrdene_at", "is", null)
          .order("potvrdene_at", { ascending: false })
          .limit(5),
        // Jeden kľúč pre viac firiem — jeho domovská firma nemusí byť medzi nimi.
        supabaseAdmin
          .from("api_keys")
          .select("firmy")
          .eq("name", "Pohoda — konektor")
          .eq("ucet_user_id", context.userId)
          .is("revoked_at", null),
        // Pri spoločnom kľúči povie len denník, ktorá firma sa ozvala.
        ...idFiriem.map((id) =>
          supabase
            .from("api_logs")
            .select("created_at")
            .eq("company_id", id)
            .like("path", "/api/v1/pohoda/%")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      ]);

    type Kluc = {
      company_id: string;
      last_used_at: string | null;
      revoked_at: string | null;
      ucet_user_id: string | null;
    };
    // Kľúč účtu sa počíta cez denník, nie cez svoju domovskú firmu.
    const zive = ((kluce ?? []) as Kluc[]).filter((k) => !k.revoked_at && !k.ucet_user_id);
    const spolocne = (ucetKluce ?? []) as { firmy: string[] | null }[];
    const pocetKlucov = (id: string) =>
      zive.filter((k) => k.company_id === id).length +
      spolocne.filter((k) => !k.firmy || k.firmy.includes(id)).length;
    const zDennika = new Map(
      idFiriem.map((id, i) => [
        id,
        (ozvania[i]?.data as { created_at: string } | null)?.created_at,
      ]),
    );

    /** Kedy sa naposledy ozval ktorýkoľvek živý kľúč firmy. */
    const naposledyPre = (id: string) =>
      ([...zive.filter((k) => k.company_id === id).map((k) => k.last_used_at), zDennika.get(id)]
        .filter(Boolean)
        .sort()
        .pop() as string | undefined) ?? null;

    return {
      kluce: pocetKlucov(data.companyId),
      naposledy: naposledyPre(data.companyId),
      potvrdene: potvrdene ?? [],
      firmy: idFiriem.map((id) => ({
        id,
        kluce: pocetKlucov(id),
        naposledy: naposledyPre(id),
      })),
    };
  });
