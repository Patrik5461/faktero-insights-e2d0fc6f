-- Kľúč účtu: jeden API kľúč pre viac firiem používateľa (ako Doklado).
-- company_id ostáva = firma, v ktorej kľúč vznikol (zoznam kľúčov, denník);
-- ucet_user_id = komu kľúč patrí, firmy = obmedzenie (NULL = všetky firmy,
-- kde je používateľ vlastník alebo admin). Firma sa vyberá v požiadavke.
alter table public.api_keys
  add column if not exists ucet_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists firmy uuid[];

create index if not exists api_keys_ucet_user_id_idx on public.api_keys (ucet_user_id) where ucet_user_id is not null;

-- Kľúč účtu si človek vyrobí len pre seba — nie na cudzí účet.
create or replace function public.api_keys_ucet_len_pre_seba()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and new.ucet_user_id is not null and new.ucet_user_id <> auth.uid() then
    raise exception 'Kľúč účtu môže patriť len prihlásenému používateľovi.' using errcode = '42501';
  end if;
  return new;
end
$function$;

drop trigger if exists api_keys_ucet_len_pre_seba on public.api_keys;
create trigger api_keys_ucet_len_pre_seba before insert or update of ucet_user_id on public.api_keys
  for each row execute function public.api_keys_ucet_len_pre_seba();
