/*
 * Hromadný import cenníka — produkty a ceny cenových hladín v jednej transakcii.
 *
 * 1. Parciálny unique index na cenu hladiny „od prvého kusu“: jeden riadok na
 *    (firma, produkt, hladina) bez odberateľa s prahom 0 alebo 1. Množstevné
 *    ceny s vyšším prahom ostávajú povolené (stráži ich product_prices_skupina_uniq)
 *    — index bez podmienky na min_quantity by ich zakázal, a tie demo aj cenník
 *    (ceny.ts → cenaPodlaMnozstva) používajú.
 *    Pred vytvorením overené v produkcii 2026-11-05: 0 duplicít.
 *
 * 2. `importuj_cennik` — security invoker, takže platí RLS (člen firmy, oblasť
 *    „sklad“, dvojfaktor). Párovanie robí prehliadač (náhľad), funkcia dostane
 *    už spárované položky a zapíše len zmeny. Množinovo, nie po riadkoch:
 *    1 000 produktov × 5 hladín je jeden INSERT/UPDATE na tabuľku.
 */

create unique index if not exists product_prices_hladina_zakladna_uniq
  on public.product_prices (company_id, product_id, price_group_id)
  where customer_id is null and min_quantity <= 1;

/*
 * p_polozky: [{ riadok, product_id (null = nový), code, name, unit, vat_rate,
 *               unit_price, external_id,
 *               ceny: [{ hladina_id | hladina (názov novej), cena (null = zmazať) }] }]
 * Vyplnené polia sa zapíšu, chýbajúce/null ostanú bez zmeny.
 * p_nove_hladiny: názvy hladín, ktoré sa majú založiť (zmazaná s rovnakým
 *                 názvom sa obnoví — názov je v rámci firmy unikátny).
 */
create or replace function public.importuj_cennik(
  p_company_id uuid,
  p_polozky jsonb,
  p_nove_hladiny text[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nove_hladiny int := 0;
  v_nove_produkty int := 0;
  v_upravene_produkty int := 0;
  v_nove_ceny int := 0;
  v_zmenene_ceny int := 0;
  v_zmazane_ceny int := 0;
  v_pocet int;
  v_chyba text;
begin
  if auth.uid() is null or not public.is_company_member(p_company_id, auth.uid()) then
    raise exception 'Do cenníka tejto firmy nemáte prístup.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_polozky) is distinct from 'array' then
    raise exception 'Položky importu musia byť pole.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_polozky) > 20000 then
    raise exception 'Naraz sa dá importovať najviac 20 000 položiek.' using errcode = '22023';
  end if;

  -- Rozbalené položky (pole riadkov) — raz, potom sa s nimi pracuje množinovo.
  create temporary table if not exists _cennik_vstup (
    riadok int, product_id uuid, code text, name text, unit text,
    vat_rate numeric, unit_price numeric, external_id text, ceny jsonb
  ) on commit drop;
  truncate _cennik_vstup;
  insert into _cennik_vstup
  select (e ->> 'riadok')::int,
         nullif(e ->> 'product_id', '')::uuid,
         nullif(btrim(e ->> 'code'), ''),
         nullif(btrim(e ->> 'name'), ''),
         nullif(btrim(e ->> 'unit'), ''),
         (e ->> 'vat_rate')::numeric,
         (e ->> 'unit_price')::numeric,
         nullif(btrim(e ->> 'external_id'), ''),
         coalesce(e -> 'ceny', '[]'::jsonb)
  from jsonb_array_elements(p_polozky) e;
  -- Dočasná tabuľka nemá štatistiky; bez nich plánovač spojí 5 000 × 5 000 riadkov.
  analyze _cennik_vstup;

  select format('Riadok %s: %s', riadok,
           case when unit_price < 0 then 'záporná cena'
                when vat_rate < 0 or vat_rate > 100 then 'sadzba DPH mimo 0–100'
                when product_id is null and code is null then 'nový produkt bez kódu'
                else 'nový produkt bez názvu' end)
    into v_chyba
  from _cennik_vstup
  where unit_price < 0 or vat_rate < 0 or vat_rate > 100
     or (product_id is null and (code is null or name is null))
  limit 1;
  if v_chyba is not null then
    raise exception '%', v_chyba using errcode = '22023';
  end if;

  select format('Riadok %s: produkt nepatrí tejto firme alebo je zmazaný.', v.riadok) into v_chyba
  from _cennik_vstup v
  where v.product_id is not null
    and not exists (select 1 from public.products p
                    where p.id = v.product_id and p.company_id = p_company_id and p.deleted_at is null)
  limit 1;
  if v_chyba is not null then
    raise exception '%', v_chyba using errcode = '22023';
  end if;

  -- 1. nové hladiny (zmazaná s rovnakým názvom sa obnoví)
  with n as (
    select distinct on (lower(btrim(x))) btrim(x) as name
    from unnest(coalesce(p_nove_hladiny, '{}')) x
    where btrim(x) <> ''
  ), z as (
    insert into public.price_groups (company_id, name)
    select p_company_id, n.name from n
    on conflict (company_id, name) do update set deleted_at = null
      where public.price_groups.deleted_at is not null
    returning 1
  )
  select count(*) into v_nove_hladiny from z;

  -- 2. nové produkty; kód je v rámci jedného importu jedinečný (stráži náhľad)
  with ins as (
    insert into public.products (company_id, code, name, unit, vat_rate, unit_price, external_id)
    select p_company_id, v.code, v.name, coalesce(v.unit, 'ks'), coalesce(v.vat_rate, 23),
           coalesce(v.unit_price, 0), v.external_id
    from _cennik_vstup v
    where v.product_id is null
    returning id, code
  )
  update _cennik_vstup v set product_id = ins.id
  from ins where v.product_id is null and v.code = ins.code;
  get diagnostics v_nove_produkty = row_count;

  -- 3. úprava existujúcich (len vyplnené a iné hodnoty) + predajná cena na skladovej karte
  with upd as (
    update public.products p set
      code = coalesce(v.code, p.code),
      name = coalesce(v.name, p.name),
      unit = coalesce(v.unit, p.unit),
      vat_rate = coalesce(v.vat_rate, p.vat_rate),
      unit_price = coalesce(v.unit_price, p.unit_price),
      external_id = coalesce(v.external_id, p.external_id)
    from _cennik_vstup v
    where p.id = v.product_id
      and p.company_id = p_company_id
      and (v.code, v.name, v.unit, v.vat_rate, v.unit_price, v.external_id) is distinct from
          (null::text, null::text, null::text, null::numeric, null::numeric, null::text)
      and (coalesce(v.code, p.code), coalesce(v.name, p.name), coalesce(v.unit, p.unit),
           coalesce(v.vat_rate, p.vat_rate), coalesce(v.unit_price, p.unit_price),
           coalesce(v.external_id, p.external_id))
          is distinct from (p.code, p.name, p.unit, p.vat_rate, p.unit_price, p.external_id)
    returning p.id, p.unit_price, p.vat_rate, p.unit, v.unit_price is not null or v.vat_rate is not null or v.unit is not null as cena
  ), sklad as (
    -- Tovar má predajnú cenu ešte raz na skladovej karte (ako zosuladPredajnuCenu).
    update public.stock_items s set sale_price = upd.unit_price, vat_rate = upd.vat_rate, unit = upd.unit
    from upd
    where upd.cena and s.product_id = upd.id and s.company_id = p_company_id
    returning 1
  )
  select count(*) into v_upravene_produkty from upd;

  -- 4. ceny hladín: rozbalené, hladina podľa id alebo názvu (len živé hladiny firmy)
  create temporary table if not exists _cennik_ceny (
    riadok int, product_id uuid, price_group_id uuid, cena numeric, nazov text
  ) on commit drop;
  truncate _cennik_ceny;
  insert into _cennik_ceny
  select distinct on (v.product_id, g.id)
         v.riadok, v.product_id, g.id, (c ->> 'cena')::numeric,
         coalesce(c ->> 'hladina', c ->> 'hladina_id')
  from _cennik_vstup v
  cross join lateral jsonb_array_elements(v.ceny) c
  left join public.price_groups g
    on g.company_id = p_company_id and g.deleted_at is null
   and (g.id = nullif(c ->> 'hladina_id', '')::uuid
        or (c ->> 'hladina_id' is null and lower(g.name) = lower(btrim(c ->> 'hladina'))))
  order by v.product_id, g.id, v.riadok desc;
  analyze _cennik_ceny;

  select format('Riadok %s: cenová hladina %s neexistuje.', riadok, nazov) into v_chyba
  from _cennik_ceny where price_group_id is null limit 1;
  if v_chyba is not null then
    raise exception '%', v_chyba using errcode = '22023';
  end if;
  select format('Riadok %s: záporná cena hladiny.', riadok) into v_chyba
  from _cennik_ceny where cena < 0 limit 1;
  if v_chyba is not null then
    raise exception '%', v_chyba using errcode = '22023';
  end if;

  with up as (
    insert into public.product_prices (company_id, product_id, price_group_id, unit_price, min_quantity)
    select p_company_id, c.product_id, c.price_group_id, c.cena, 0
    from _cennik_ceny c
    where c.cena is not null
    on conflict (company_id, product_id, price_group_id)
      where customer_id is null and min_quantity <= 1
    do update set unit_price = excluded.unit_price
      where public.product_prices.unit_price is distinct from excluded.unit_price
    returning (xmax = 0) as nova
  )
  select count(*) filter (where nova), count(*) filter (where not nova)
    into v_nove_ceny, v_zmenene_ceny
  from up;

  if exists (select 1 from _cennik_ceny where cena is null) then
    with d as (
      delete from public.product_prices pp
      where pp.company_id = p_company_id
        and pp.customer_id is null
        and pp.min_quantity <= 1
        and (pp.product_id, pp.price_group_id) in
            (select c.product_id, c.price_group_id from _cennik_ceny c where c.cena is null)
      returning 1
    )
    select count(*) into v_zmazane_ceny from d;
  end if;

  return jsonb_build_object(
    'nove_hladiny', v_nove_hladiny,
    'nove_produkty', v_nove_produkty,
    'upravene_produkty', v_upravene_produkty,
    'nove_ceny', v_nove_ceny,
    'zmenene_ceny', v_zmenene_ceny,
    'zmazane_ceny', v_zmazane_ceny
  );
end;
$$;

comment on function public.importuj_cennik(uuid, jsonb, text[]) is
  'Hromadný import cenníka (produkty + ceny cenových hladín od prvého kusu) v jednej transakcii. Security invoker — platí RLS.';

revoke all on function public.importuj_cennik(uuid, jsonb, text[]) from public, anon;
grant execute on function public.importuj_cennik(uuid, jsonb, text[]) to authenticated, service_role;
