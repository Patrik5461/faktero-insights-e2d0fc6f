-- Prístup podpory nesmie nikto z firmy cez API predĺžiť ani povýšiť — mení ho len server.
create or replace function public.company_users_straz_podpory()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.podpora_pristup_id is not null then
      raise exception 'Prístup technickej podpory udeľuje len Faktero.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.podpora_pristup_id is distinct from old.podpora_pristup_id then
      raise exception 'Prístup technickej podpory sa nedá zmeniť.';
    end if;
    if old.podpora_pristup_id is not null
       and (new.role is distinct from old.role or new.permissions is distinct from old.permissions
            or new.user_id is distinct from old.user_id or new.company_id is distinct from old.company_id) then
      raise exception 'Prístup technickej podpory sa nedá zmeniť — odoberte ho a udeľte nový.';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.company_users_straz_podpory() from public, anon, authenticated;
create or replace trigger company_users_straz_podpory before insert or update on public.company_users
  for each row execute function public.company_users_straz_podpory();
