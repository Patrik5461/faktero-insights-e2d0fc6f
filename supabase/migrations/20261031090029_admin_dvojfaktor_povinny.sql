-- Povinné 2FA pre administrátorov platformy od 8. 11. 2026 (src/lib/faktero/admin-dvojfaktor.ts).
-- Keď sa admin pýta sám za seba (RLS politiky s is_platform_admin(auth.uid())),
-- po termíne platí len relácia aal2. Dotazy za iného používateľa a volania
-- bez používateľa (servisný kľúč) sa nemenia. Do termínu sa nemení nič.
create or replace function public.is_platform_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.platform_admins where user_id = _user_id)
     and (
       _user_id is distinct from auth.uid()
       or now() < timestamptz '2026-11-08 00:00:00+01'
       or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     )
$function$;
