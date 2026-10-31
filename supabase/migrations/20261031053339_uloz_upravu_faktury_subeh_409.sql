-- Súbeh pri úprave faktúry hlási PT409 (PostgREST → HTTP 409) namiesto 40001.
-- 40001 (serialization_failure) PostgREST považuje za opakovateľnú chybu a
-- transakciu skúša znova, kým nevyprší — volanie skončilo po ~125 s odpoveďou
-- 504 a hláška FAKTERO_SUBEH sa k človeku nedostala (overené cez REST).
-- Text hlášky ostáva, web ho hľadá podľa FAKTERO_SUBEH.
--
-- Appka (oprava faktúry v telefóne) používa od tejto vetvy tú istú funkciu.

create or replace function public.uloz_upravu_faktury(
  p_id uuid,
  p_hlavicka jsonb,
  p_polozky jsonb,
  p_povodne_upravena timestamptz default null
) returns timestamptz
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  _upravena timestamptz;
  _stlpce text;
  _stlpce_poloziek text;
  _riadok jsonb;
begin
  if jsonb_typeof(coalesce(p_hlavicka, '{}'::jsonb)) <> 'object' then
    raise exception 'Hlavička faktúry nie je objekt.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_polozky, '[]'::jsonb)) <> 'array' then
    raise exception 'Položky faktúry nie sú zoznam.' using errcode = '22023';
  end if;

  -- Zámok riadku: súbežné uloženie počká a potom narazí na zmenený čas úpravy.
  select updated_at into _upravena from invoices where id = p_id for update;
  if not found then
    raise exception 'Faktúra sa nenašla.' using errcode = 'P0002';
  end if;
  if p_povodne_upravena is not null and _upravena is distinct from p_povodne_upravena then
    raise exception 'FAKTERO_SUBEH: Faktúru medzitým zmenil niekto iný (iná karta alebo kolega). Načítajte ju znova — vaše zmeny sa neuložili.'
      using errcode = 'PT409', hint = 'faktura_zmenena';
  end if;

  -- Hlavička: len stĺpce, ktoré prišli a v tabuľke naozaj sú (id a firma sa nemenia).
  select string_agg(quote_ident(a.attname), ', ')
    into _stlpce
    from pg_attribute a
   where a.attrelid = 'public.invoices'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname not in ('id', 'company_id', 'created_at', 'updated_at')
     and p_hlavicka ? a.attname;
  if _stlpce is not null then
    execute format(
      'update public.invoices set (%1$s) = (select %1$s from jsonb_populate_record(null::public.invoices, $2)) where id = $1',
      _stlpce
    ) using p_id, p_hlavicka;
  end if;

  delete from invoice_items where invoice_id = p_id;

  -- Po riadkoch: stĺpec, ktorý riadok nemá, dostane predvolenú hodnotu tabuľky (nie NULL).
  for _riadok in select value from jsonb_array_elements(coalesce(p_polozky, '[]'::jsonb)) loop
    if jsonb_typeof(_riadok) <> 'object' then
      raise exception 'Položka faktúry nie je objekt.' using errcode = '22023';
    end if;
    select string_agg(quote_ident(a.attname), ', ')
      into _stlpce_poloziek
      from pg_attribute a
     where a.attrelid = 'public.invoice_items'::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('id', 'invoice_id', 'created_at')
       and _riadok ? a.attname;
    if _stlpce_poloziek is null then
      raise exception 'Položka faktúry je prázdna.' using errcode = '22023';
    end if;
    execute format(
      'insert into public.invoice_items (invoice_id, %1$s) select $1, %1$s from jsonb_populate_record(null::public.invoice_items, $2)',
      _stlpce_poloziek
    ) using p_id, _riadok;
  end loop;

  select updated_at into _upravena from invoices where id = p_id;
  return _upravena;
end;
$function$;

revoke all on function public.uloz_upravu_faktury(uuid, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.uloz_upravu_faktury(uuid, jsonb, jsonb, timestamptz) to authenticated, service_role;
