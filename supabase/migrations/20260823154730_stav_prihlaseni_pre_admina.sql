-- Admin v aplikácii nevidí do schémy `auth` — PostgREST ju neponúka a stránka
-- Používatelia preto dosiaľ tvrdila, že posledné prihlásenie „nie je dostupné".
-- Bez neho sa nedá povedať, či je účet živý, a bez `banned_until` ani to, či
-- je prihlásenie zakázané. Funkcia vracia presne tie štyri stĺpce a nič viac.
create or replace function public.faktero_stav_prihlaseni(_ids uuid[])
returns table (
  id uuid,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  email_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.last_sign_in_at, u.banned_until, u.email_confirmed_at
    from auth.users u
   where u.id = any(_ids)
$$;

-- Právo drží PUBLIC, nie `anon` — odobrať treba jemu, inak sa funkcia dá volať
-- aj bez prihlásenia. Volá ju výhradne server so servisným kľúčom.
revoke execute on function public.faktero_stav_prihlaseni(uuid[]) from public, anon, authenticated;
grant execute on function public.faktero_stav_prihlaseni(uuid[]) to service_role;
