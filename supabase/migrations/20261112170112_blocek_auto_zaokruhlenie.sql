-- Bloček platený v hotovosti: rozdiel do 2 centov medzi sumou bločku a
-- základom + DPH + zaokrúhlením sa zapíše ako položka zaokrúhlenia
-- (zaokruhlenie-blocku.ts: NAZOV_ZAOKRUHLENIA, MAX_ZAOKRUHLENIE). Hotovosť sa
-- zaokrúhľuje na 5 centov; bez tohto svietilo pri každom takom bločku
-- „Súčet nesedí so sumou bločku“. Odovzdaný bloček (exported_at) sa nemení.
create or replace function public.faktero_auto_zaokruhlenie_blocku()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _zaklad numeric;
  _dph numeric;
  _zr numeric;
  _rozdiel numeric;
  _nove numeric;
  _items jsonb;
  _vzor constant text := '(zaokr[uú]hl|zaokrouhl|\mrounding\M|\mrundung\M)';
begin
  if coalesce(new.payment_method, '') <> 'hotovost' or new.exported_at is not null then
    return new;
  end if;
  if new.total_amount is null then
    return new;
  end if;

  if jsonb_typeof(new.vat_breakdown) = 'array' and jsonb_array_length(new.vat_breakdown) > 0 then
    select coalesce(sum((x->>'zaklad')::numeric), 0), coalesce(sum((x->>'dph')::numeric), 0)
      into _zaklad, _dph
      from jsonb_array_elements(new.vat_breakdown) x;
  else
    _zaklad := coalesce(new.net_amount, 0);
    _dph := coalesce(new.vat_amount, 0);
  end if;
  if _zaklad = 0 and _dph = 0 then
    return new;
  end if;

  _items := case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end;
  select coalesce(sum(coalesce(nullif(i->>'total', '')::numeric,
                                coalesce(nullif(i->>'quantity', '')::numeric, 1) * coalesce(nullif(i->>'unit_price', '')::numeric, 0))), 0)
    into _zr
    from jsonb_array_elements(_items) i
   where coalesce(i->>'zaokruhlenie', '') = 'true' or coalesce(i->>'name', '') ~* _vzor;

  _rozdiel := round(new.total_amount - (_zaklad + _dph + _zr), 2);
  _nove := round(_zr + _rozdiel, 2);
  if abs(_rozdiel) < 0.005 or abs(_rozdiel) > 0.0201 or abs(_nove) > 0.0201 then
    return new;
  end if;

  select coalesce(jsonb_agg(i), '[]'::jsonb) into _items
    from jsonb_array_elements(_items) i
   where not (coalesce(i->>'zaokruhlenie', '') = 'true' or coalesce(i->>'name', '') ~* _vzor);
  if abs(_nove) >= 0.005 then
    _items := _items || jsonb_build_array(jsonb_build_object(
      'name', 'Zaokrúhlenie', 'quantity', 1, 'unit', null, 'unit_price', _nove,
      'vat_rate', 0, 'total', _nove, 'zaokruhlenie', true));
  end if;
  new.items := _items;
  return new;
end
$$;

drop trigger if exists zz_blocek_auto_zaokruhlenie on public.expense_documents;
create trigger zz_blocek_auto_zaokruhlenie
  before insert or update of total_amount, net_amount, vat_amount, vat_breakdown, items, payment_method
  on public.expense_documents
  for each row execute function public.faktero_auto_zaokruhlenie_blocku();
