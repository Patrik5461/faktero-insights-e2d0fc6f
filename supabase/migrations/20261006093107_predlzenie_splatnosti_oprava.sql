-- Stav faktúry je enum — porovnanie s '' padalo a s ním každá zmena splatnosti.
create or replace function public.zapamataj_povodnu_splatnost()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.due_date is distinct from old.due_date
     and old.due_date is not null
     and coalesce(old.status::text, '') <> 'draft' then
    if old.povodna_splatnost is null then
      new.povodna_splatnost := old.due_date;
    end if;
    new.predlzene_at := now();
    new.predlzil := coalesce(auth.uid(), new.predlzil);
  end if;
  return new;
end $function$;
