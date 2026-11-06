/*
  Pokladňa dokladu podľa meny (checklist B2-3).

  Doklad platený hotovosťou bez pokladne dostával vždy predvolenú — aj
  bloček v CZK do eurovej pokladne. Teraz: predvolená, ak má menu dokladu;
  inak prvá aktívna pokladňa v mene dokladu; až potom predvolená (firma
  s jednou pokladňou sa správa ako doteraz). Platí pre appku, API, importy
  aj zmenu úhrady na „hotovosť“ v detaile — formulár na webe pokladňu
  posiela sám (tiež podľa meny, `pokladnaDoFormulara`).

  Mení sa len telo `pokladna_dokladu()`; spúšťače ostávajú.
*/
create or replace function public.pokladna_dokladu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _nove jsonb := to_jsonb(new);
  _stlpec text := coalesce(tg_argv[0], '');
  _hotovost boolean;
  _mena text := upper(btrim(coalesce(_nove ->> 'currency', '')));
  _id uuid;
begin
  if new.pokladna_id is not null then
    if tg_op = 'INSERT' or new.pokladna_id is distinct from old.pokladna_id
       or new.company_id is distinct from old.company_id then
      if not exists (select 1 from public.pokladne
                      where id = new.pokladna_id and company_id = new.company_id) then
        raise exception 'Pokladňa nepatrí k tejto firme.' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  _hotovost := _stlpec = ''
    or coalesce(_nove ->> _stlpec, '') = any (tg_argv[1:array_length(tg_argv, 1)]);
  if _hotovost and (_nove ->> 'vyuctovanie_id') is null then
    if _mena ~ '^[A-Z]{3}$' then
      select id into _id from public.pokladne
       where company_id = new.company_id and aktivna and mena = _mena
       order by predvolena desc, poradie, nazov
       limit 1;
    end if;
    new.pokladna_id := coalesce(_id, public.predvolena_pokladna(new.company_id));
  end if;
  return new;
end
$$;
revoke all on function public.pokladna_dokladu() from public, anon, authenticated;
