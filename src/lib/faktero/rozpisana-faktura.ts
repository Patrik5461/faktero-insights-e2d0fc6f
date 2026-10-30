/**
 * Rozpísaná faktúra v prehliadači.
 *
 * Keď počas písania faktúry vypršalo prihlásenie (alebo sa zavrela karta),
 * všetko napísané zmizlo: obnovenie stránky poslalo človeka na prihlásenie a
 * späť sa vrátil k prázdnemu formuláru (overené 30. 10. 2026). Formulár sa
 * preto priebežne odkladá do `localStorage` a pri ďalšom otvorení sa ponúkne.
 * Je to len pohodlie pre jedného človeka v jednom prehliadači, nič viac.
 */
const PREDPONA = "faktero.rozpisana-faktura";
const PLATNOST_MS = 7 * 86_400_000;

type Polozka = { name?: string | null; unit_price?: number | string | null };
export type RozpisanaFaktura<F, I> = { form: F; items: I[]; ulozene: number };

const kluc = (firma: string, typ: string) => `${PREDPONA}:${firma}:${typ}`;

function ulozisko(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Oplatí sa formulár odložiť? Prázdny by prepísal staršiu rozpísanú faktúru. */
export function maObsah(form: { customer_id?: string | null }, items: Polozka[]): boolean {
  return Boolean(form.customer_id) || items.some((i) => String(i.name ?? "").trim());
}

export function odlozRozpisanu<F extends { customer_id?: string | null }, I extends Polozka>(
  firma: string | null,
  typ: string,
  form: F,
  items: I[],
): void {
  const u = ulozisko();
  if (!u || !firma || !maObsah(form, items)) return;
  try {
    u.setItem(kluc(firma, typ), JSON.stringify({ form, items, ulozene: Date.now() }));
  } catch {
    /* plné úložisko — formulár ostáva len na obrazovke */
  }
}

export function nacitajRozpisanu<F, I>(
  firma: string | null,
  typ: string,
  teraz = Date.now(),
): RozpisanaFaktura<F, I> | null {
  const u = ulozisko();
  if (!u || !firma) return null;
  try {
    const d = JSON.parse(u.getItem(kluc(firma, typ)) ?? "null");
    if (!d?.form || !Array.isArray(d.items) || !(teraz - Number(d.ulozene) < PLATNOST_MS))
      return null;
    return d;
  } catch {
    return null;
  }
}

export function zahodRozpisanu(firma: string | null, typ: string): void {
  try {
    if (firma) ulozisko()?.removeItem(kluc(firma, typ));
  } catch {
    /* nič */
  }
}

/** Dátumy sa neobnovujú — rozpísaná faktúra zo včera sa vystavuje dnes. */
export function bezDatumov<F extends Record<string, unknown>>(form: F): Partial<F> {
  const { issue_date: _i, delivery_date: _d, due_date: _s, ...zvysok } = form;
  return zvysok as Partial<F>;
}
