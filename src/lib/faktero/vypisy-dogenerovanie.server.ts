/**
 * Dogenerovanie mesačných bankových výpisov po pripojení banky.
 *
 * Mesačný beh (`/api/public/hooks/bank-statements`) rieši vždy len
 * predchádzajúci mesiac. Keď v tej chvíli banka odmietla (napr. vypršaný
 * súhlas — `SCA_EXPIRED`) alebo ešte neboli pohyby, výpis za ten mesiac ostal
 * `failed` a staršie mesiace sa už nikdy znova neskúsili. Po obnovení súhlasu
 * sa preto nič nedialo, kým to niekto nespustil ručne.
 *
 * Tu je jedna funkcia, ktorá pre účty jednej firmy prejde ukončené mesiace
 * v okne histórie banky (13 mesiacov, najskôr od prvého pohybu účtu) a:
 *
 *   - účtu vedenému v Tatra banke vypýta výpis od banky tam, kde riadok chýba,
 *     je `failed` alebo dlho visí v `pending`,
 *   - ostatným účtom (iná banka cez multibanking TB, Wise, Revolut,
 *     Wallester, Fio) zostaví vlastný výpis z pohybov — keď chýba, zlyhal,
 *     alebo za ten mesiac odvtedy pribudli pohyby,
 *   - výpis od banky, ktorý je `ready`, nikdy nemení.
 *
 * Spúšťa sa po obnovení súhlasu (návrat z TB), po sťahovaní, ktoré priniesl
 * nové pohyby, ručne tlačidlom „Dogenerovať“ a denne ako poistka. Beží na
 * pozadí s jedným behom na firmu naraz — požiadavka, ktorá príde počas behu,
 * sa zlúči a spustí sa raz po ňom.
 */
import { dnesBratislava } from "./datum-vystavenia";
import { vsetkyRiadky } from "./strankovanie";

export type DogenerujVstup = {
  companyId: string;
  /** Len tieto účty firmy; bez nich všetky. */
  bankAccountIds?: string[];
  /** Najskorší mesiac "RRRR-MM"; bez neho okno histórie banky. */
  odMesiaca?: string;
  /** Odkiaľ prišiel podnet — len do logu. */
  dovod?: string;
  /** Dnešný deň "RRRR-MM-DD" (testy). */
  dnes?: string;
};

export type VysledokDogenerovania = {
  companyId: string;
  uctov: number;
  zBanky: number;
  vlastnych: number;
  caka: number;
  nevydane: number;
  cakaNaSuhlas: number;
  chyby: Array<{ account_id: string; mesiac: string; export_type: string; error: string }>;
};

/** Koľko ukončených mesiacov dozadu (TB dáva 13–15 mesiacov histórie). */
export const OKNO_MESIACOV = 13;
/** Po koľkých minútach `pending` už nečaká na iný beh, ale zasekol sa. */
export const PENDING_ZASEKNUTY_MIN = 30;
/** Banky, ktorých pohyby sťahujeme zo zdroja celé — z nich vlastný výpis vznikne aj bez riadku. */
const VLASTNE_BANKY = ["wise", "revolut", "wallester", "fio"];

const TYPY = ["PDF", "XML"] as const;
type Typ = (typeof TYPY)[number];

/** "RRRR-MM" → { start, end } celého mesiaca. */
export function obdobieMesiaca(mesiac: string): { start: string; end: string } {
  const [y, m] = mesiac.split("-").map(Number);
  return {
    start: `${mesiac}-01`,
    end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}

function posunMesiac(mesiac: string, o: number): string {
  const [y, m] = mesiac.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + o, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Ukončené mesiace od najnovšieho, ktoré sa majú skontrolovať: od
 * neskoršieho z (okno histórie, mesiac prvého pohybu, `odMesiaca`) po
 * minulý mesiac.
 */
export function mesiaceNaKontrolu(dnes: string, prvyPohyb: string, odMesiaca?: string): string[] {
  const posledny = posunMesiac(dnes.slice(0, 7), -1);
  let od = posunMesiac(dnes.slice(0, 7), -OKNO_MESIACOV);
  if (prvyPohyb.slice(0, 7) > od) od = prvyPohyb.slice(0, 7);
  if (odMesiaca && odMesiaca > od) od = odMesiaca;
  const out: string[] = [];
  for (let m = posledny; m >= od; m = posunMesiac(m, -1)) out.push(m);
  return out;
}

type Riadok = {
  id: string;
  company_id: string;
  bank_account_id: string;
  period_start: string;
  period_end: string;
  export_type: string;
  status: string;
  source: string | null;
  error: string | null;
  task_id: string | null;
  updated_at: string;
};

const jeOdBanky = (r: Riadok) => (r.source ?? "bank") === "bank";

/**
 * Dogeneruje výpisy jednej firmy. Nikdy nesiaha na riadky iných firiem —
 * každý dotaz je obmedzený `company_id`.
 */
export async function dogenerujVypisy(vstup: DogenerujVstup): Promise<VysledokDogenerovania> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db: any = supabaseAdmin;
  const companyId = vstup.companyId;
  const dnes = vstup.dnes ?? dnesBratislava();
  const vysledok: VysledokDogenerovania = {
    companyId,
    uctov: 0,
    zBanky: 0,
    vlastnych: 0,
    caka: 0,
    nevydane: 0,
    cakaNaSuhlas: 0,
    chyby: [],
  };

  const { data: pripojenia } = await db
    .from("bank_connections")
    .select("id, company_id, provider, status, access_token, consent_id")
    .eq("company_id", companyId);
  // Testovacia firma sa do banky nepýta.
  const skutocne = await (
    await import("./testovacia-firma-banka.server")
  ).bezTestovacichFiriem((pripojenia ?? []) as any[], "vypisy-dogenerovanie");
  const pripojeniePodlaId = new Map<string, any>(
    skutocne.filter((c: any) => c.status === "connected").map((c: any) => [c.id, c]),
  );
  if (!pripojeniePodlaId.size) return vysledok;

  let dotazUcty = db
    .from("bank_accounts")
    .select(
      "id, company_id, bank_connection_id, iban, external_account_id, unavailable_since, unavailable_reason, pohyby_chyba_suhlas",
    )
    .eq("company_id", companyId);
  if (vstup.bankAccountIds?.length) dotazUcty = dotazUcty.in("id", vstup.bankAccountIds);
  const { data: ucty } = await dotazUcty;

  const bank = await import("./bank-statements.server");
  const own = await import("./bank-statements-own.server");

  for (const acc of (ucty ?? []) as any[]) {
    const conn = pripojeniePodlaId.get(acc.bank_connection_id);
    if (!conn) continue;
    vysledok.uctov++;
    try {
      await dogenerujUcet(db, bank, own, conn, acc, dnes, vstup.odMesiaca, vysledok);
    } catch (e: any) {
      vysledok.chyby.push({
        account_id: acc.id,
        mesiac: "*",
        export_type: "*",
        error: e?.message ?? "dogenerovanie_zlyhalo",
      });
    }
  }

  console.log(
    `[vypisy-dogenerovanie] firma ${companyId} (${vstup.dovod ?? "?"}): ${vysledok.uctov} účtov, ${vysledok.zBanky} z banky, ${vysledok.vlastnych} zostavených, ${vysledok.caka} čaká, ${vysledok.nevydane} nevydaných, ${vysledok.cakaNaSuhlas} čaká na súhlas, ${vysledok.chyby.length} chýb`,
  );
  return vysledok;
}

async function dogenerujUcet(
  db: any,
  bank: typeof import("./bank-statements.server"),
  own: typeof import("./bank-statements-own.server"),
  conn: any,
  acc: any,
  dnes: string,
  odMesiaca: string | undefined,
  vysledok: VysledokDogenerovania,
) {
  const { data: prvy } = await db
    .from("bank_transactions")
    .select("booking_date")
    .eq("company_id", conn.company_id)
    .eq("bank_account_id", acc.id)
    .order("booking_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  // Bez jediného pohybu niet z čoho stavať a okno nemá začiatok.
  if (!prvy?.booking_date) return;

  const mesiace = mesiaceNaKontrolu(dnes, prvy.booking_date, odMesiaca);
  if (!mesiace.length) return;
  const najstarsiZaciatok = `${mesiace[mesiace.length - 1]}-01`;

  const { data: vsetkyRiadkyUctu } = await db
    .from("bank_statements")
    .select(
      "id, company_id, bank_account_id, period_start, period_end, export_type, status, source, error, task_id, updated_at",
    )
    .eq("company_id", conn.company_id)
    .eq("bank_account_id", acc.id);
  const riadky = (vsetkyRiadkyUctu ?? []) as Riadok[];

  const jeTb = conn.provider === "tatrabanka" && !!conn.access_token;
  // Účet z inej banky, ktorý TB len agreguje — banka preň výpis nevydá nikdy.
  let cudzi = riadky.some((r) => bank.jeTrvalaChyba(r.error ?? "") === "mimo-tb");
  const nedostupny = !!acc.unavailable_since;
  // Vypršaný súhlas k tomuto účtu — banka by odpovedala tou istou chybou.
  const suhlasVyprsal =
    !!conn.consent_id && !!acc.pohyby_chyba_suhlas && acc.pohyby_chyba_suhlas === conn.consent_id;
  // Kde vznikne aj chýbajúci výpis: TB (od banky alebo vlastný pre cudzí účet), Wise & spol.
  const vytvaratChybajuce = jeTb || VLASTNE_BANKY.includes(conn.provider);

  /*
    Pohyby, ktoré pribudli po poslednej zmene vlastného výpisu: stačí ich
    načítať raz od najstaršieho takého riadku a rozdeliť podľa mesiaca.
  */
  const vlastneRiadky = riadky.filter(
    (r) =>
      r.period_start >= najstarsiZaciatok &&
      (r.source === "faktero" || r.status === "unsupported"),
  );
  let nove: Array<{ booking_date: string; created_at: string }> = [];
  if (vlastneRiadky.length) {
    const odKedy = vlastneRiadky.map((r) => r.updated_at).sort()[0];
    nove = await vsetkyRiadky<any>((zac, kon) =>
      db
        .from("bank_transactions")
        .select("booking_date, created_at")
        .eq("company_id", conn.company_id)
        .eq("bank_account_id", acc.id)
        .gt("created_at", odKedy)
        .lte("booking_date", obdobieMesiaca(mesiace[0]).end)
        .order("id", { ascending: true })
        .range(zac, kon),
    );
  }
  /** Pribudol od `r.updated_at` pohyb, ktorý výpis za jeho obdobie mení? */
  const zmenene = (r: Riadok) =>
    nove.some((t) => t.booking_date <= r.period_end && t.created_at > r.updated_at);
  const staryPending = (r: Riadok) =>
    Date.parse(r.updated_at) < Date.now() - PENDING_ZASEKNUTY_MIN * 60_000;

  for (const mesiac of mesiace) {
    const { start, end } = obdobieMesiaca(mesiac);
    const zaMesiac = riadky.filter((r) => r.period_start === start);
    const celyMesiac = (typ: Typ) =>
      zaMesiac.find((r) => r.period_end === end && r.export_type === typ) ?? null;

    const doBanky: Array<{ typ: Typ; riadok: Riadok | null }> = [];
    const vlastne: Typ[] = [];

    for (const typ of TYPY) {
      const r = celyMesiac(typ);
      // Originál od banky sa nikdy nemení.
      if (r && r.status === "ready" && jeOdBanky(r)) continue;

      const vlastnyUcet = !jeTb || cudzi;
      if (!r) {
        if (!vytvaratChybajuce) continue;
        if (vlastnyUcet) vlastne.push(typ);
        else if (!nedostupny) doBanky.push({ typ, riadok: null });
        continue;
      }
      if (r.status === "ready" || r.status === "unsupported") {
        // Vlastný výpis alebo odmietnutý od banky — prestaviť len keď pribudli pohyby.
        if (zmenene(r)) vlastne.push(typ);
        continue;
      }
      if (r.status === "failed") {
        if (vlastnyUcet || r.source === "faktero" || nedostupny) vlastne.push(typ);
        else doBanky.push({ typ, riadok: r });
        continue;
      }
      if (r.status === "pending" && staryPending(r)) {
        if (vlastnyUcet || nedostupny) vlastne.push(typ);
        else doBanky.push({ typ, riadok: r });
      }
    }

    if (doBanky.length && suhlasVyprsal) {
      vysledok.cakaNaSuhlas += doBanky.length;
      doBanky.length = 0;
    }
    for (const { typ, riadok } of doBanky) {
      const r = await bank.vybavVypisZBanky(db, conn, acc, start, end, typ, riadok);
      if (r.stav === "ready") vysledok.zBanky++;
      else if (r.stav === "pending") vysledok.caka++;
      else if (r.stav === "unsupported") {
        // Čo banka nevydá, zostavíme sami — ako mesačný beh.
        vlastne.push(typ);
        if (r.dovod === "mimo-tb") cudzi = true;
      } else if (r.stav === "failed" && (!r.bezRiadku || !/duplicate key|23505/.test(r.chyba))) {
        vysledok.chyby.push({ account_id: acc.id, mesiac, export_type: typ, error: r.chyba });
      }
    }

    if (vlastne.length) {
      await zostavVlastny(db, own, conn.company_id, acc.id, mesiac, vlastne, vysledok);
    }
  }
}

/**
 * Zostaví vlastný výpis (PDF/XML) za celý mesiac a zapíše riadky. Výpis,
 * ktorý si človek už raz zostavil ako čiastočný, ostane čiastočný; nový sa
 * stavia len za celé obdobie, ako v mesačnom behu.
 */
async function zostavVlastny(
  db: any,
  own: typeof import("./bank-statements-own.server"),
  companyId: string,
  accountId: string,
  mesiac: string,
  typy: Typ[],
  vysledok: VysledokDogenerovania,
) {
  const { start, end } = obdobieMesiaca(mesiac);
  const { data: existujuce } = await db
    .from("bank_statements")
    .select("id, period_end, export_type, status, source")
    .eq("company_id", companyId)
    .eq("bank_account_id", accountId)
    .eq("period_start", start);
  const riadky = (existujuce ?? []) as Riadok[];
  const ciastocny = riadky.some((r) => r.source === "faktero" && r.status === "ready");
  const teraz = () => new Date().toISOString();

  const z = await own.zostavVypisUctu(db, accountId, start, end, { ciastocny });
  if (!z.ok) {
    // Nevieme ho zostaviť (chýbajú pohyby od začiatku mesiaca). Chýbajúci riadok
    // nezakladáme; existujúcim zapíšeme dôvod, zlyhaný sa presunie medzi nevydané.
    vysledok.nevydane += typy.length;
    for (const r of riadky) {
      if (r.period_end !== end || !typy.includes(r.export_type as Typ)) continue;
      if (r.status === "ready") continue;
      /*
        Odmietnutý riadok si nechá dôvod od banky (`PRODUCT_UNKNOWN` hovorí, že
        účet je z inej banky a nabudúce sa do banky ani nepýtame); posunie sa
        len čas, aby sa bez nových pohybov neskúšal znova.
      */
      await db
        .from("bank_statements")
        .update(
          r.status === "unsupported"
            ? { updated_at: teraz() }
            : {
                status: "unsupported",
                error: `nemáme transakcie za celé obdobie (najstaršia je ${z.najstarsi ?? "—"})`,
                updated_at: teraz(),
              },
        )
        .eq("id", r.id)
        .eq("company_id", companyId);
    }
    return;
  }

  let postavenych = 0;
  for (const typ of typy) {
    const path = own.cestaVlastnehoVypisu(companyId, accountId, start, typ);
    const zaklad = {
      company_id: companyId,
      bank_account_id: accountId,
      period_start: start,
      period_end: end,
      export_type: typ,
      source: "faktero",
    };
    try {
      const bytes = await own.suborVypisu(z.input, typ);
      const { error: upErr } = await db.storage.from(own.BUCKET_VYPISOV).upload(path, bytes, {
        contentType: typ === "PDF" ? "application/pdf" : "application/xml",
        upsert: true,
      });
      if (upErr) throw new Error(`upload zlyhal: ${upErr.message}`);
      const { error } = await db.from("bank_statements").upsert(
        {
          ...zaklad,
          status: "ready",
          storage_path: path,
          file_size: bytes.length,
          error: null,
          task_id: null,
          statement_id: null,
          updated_at: teraz(),
        },
        { onConflict: "bank_account_id,period_start,period_end,export_type" },
      );
      if (error) throw new Error(`uloženie zlyhalo: ${error.message}`);
      vysledok.vlastnych++;
      postavenych++;
    } catch (e: any) {
      const msg = e?.message ?? "generate_failed";
      await db.from("bank_statements").upsert(
        { ...zaklad, status: "failed", error: msg, updated_at: teraz() },
        { onConflict: "bank_account_id,period_start,period_end,export_type" },
      );
      vysledok.chyby.push({ account_id: accountId, mesiac, export_type: typ, error: msg });
    }
  }

  /*
    Čiastočný výpis za ten istý mesiac (zostavený ručne počas mesiaca, s iným
    koncom obdobia) ustúpi celému — súbor má tú istú cestu a práve sa prepísal.
  */
  if (postavenych === typy.length) {
    const stare = riadky
      .filter(
        (r) =>
          r.period_end !== end &&
          typy.includes(r.export_type as Typ) &&
          (r.source === "faktero" || r.status === "unsupported" || r.status === "failed"),
      )
      .map((r) => r.id);
    if (stare.length) {
      await db.from("bank_statements").delete().in("id", stare).eq("company_id", companyId);
    }
  }
}

/* ------------------------------------------------------- beh na pozadí */

type Beh = { znova: DogenerujVstup | null; hotovo: Promise<VysledokDogenerovania | null> };
const behy = new Map<string, Beh>();

/** Zlúči dve požiadavky tej istej firmy do jednej (širšej). */
export function zlucVstupy(a: DogenerujVstup, b: DogenerujVstup): DogenerujVstup {
  const ucty =
    a.bankAccountIds?.length && b.bankAccountIds?.length
      ? [...new Set([...a.bankAccountIds, ...b.bankAccountIds])]
      : undefined;
  const od = a.odMesiaca && b.odMesiaca ? (a.odMesiaca < b.odMesiaca ? a.odMesiaca : b.odMesiaca) : undefined;
  return {
    companyId: a.companyId,
    bankAccountIds: ucty,
    odMesiaca: od,
    dovod: [a.dovod, b.dovod].filter(Boolean).join("+") || undefined,
    dnes: b.dnes ?? a.dnes,
  };
}

/**
 * Spustí dogenerovanie firmy na pozadí a hneď sa vráti (volajúci ho nemusí
 * čakať — `void spustiDogenerovanie(...)`). Na firmu beží najviac jeden beh;
 * požiadavka počas neho sa zlúči a spustí raz po ňom, lebo mohla priniesť
 * nové pohyby. Výsledný sľub nikdy nezlyhá.
 */
export function spustiDogenerovanie(
  vstup: DogenerujVstup,
): Promise<VysledokDogenerovania | null> {
  const bezi = behy.get(vstup.companyId);
  if (bezi) {
    bezi.znova = bezi.znova ? zlucVstupy(bezi.znova, vstup) : vstup;
    return bezi.hotovo;
  }
  const beh: Beh = { znova: null, hotovo: Promise.resolve(null) };
  behy.set(vstup.companyId, beh);
  beh.hotovo = (async () => {
    let posledny: VysledokDogenerovania | null = null;
    let dalsi: DogenerujVstup | null = vstup;
    try {
      while (dalsi) {
        const teraz: DogenerujVstup = dalsi;
        try {
          posledny = await dogenerujVypisy(teraz);
        } catch (e: any) {
          console.error(
            `[vypisy-dogenerovanie] firma ${teraz.companyId} zlyhala:`,
            e?.message ?? e,
          );
        }
        dalsi = beh.znova;
        beh.znova = null;
      }
    } finally {
      behy.delete(vstup.companyId);
    }
    return posledny;
  })();
  return beh.hotovo;
}

/** Beží pre firmu dogenerovanie? (pre UI a testy) */
export function dogenerovanieBezi(companyId: string): boolean {
  return behy.has(companyId);
}

/**
 * Denná poistka: všetky firmy s pripojenou bankou, jedna po druhej.
 * Volá ju hook mesačných výpisov po svojom behu.
 */
export async function dogenerujVsetkyFirmy(dovod = "denny-beh") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("bank_connections")
    .select("company_id")
    .eq("status", "connected");
  const firmy = [...new Set(((data ?? []) as any[]).map((r) => r.company_id).filter(Boolean))];
  const vysledky: Array<VysledokDogenerovania | null> = [];
  for (const companyId of firmy) {
    vysledky.push(await spustiDogenerovanie({ companyId: companyId as string, dovod }));
  }
  return {
    firiem: firmy.length,
    zBanky: vysledky.reduce((s, v) => s + (v?.zBanky ?? 0), 0),
    vlastnych: vysledky.reduce((s, v) => s + (v?.vlastnych ?? 0), 0),
    chyb: vysledky.reduce((s, v) => s + (v?.chyby.length ?? 0), 0),
  };
}
