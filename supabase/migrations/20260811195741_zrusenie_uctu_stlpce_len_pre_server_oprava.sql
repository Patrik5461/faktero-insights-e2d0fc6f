-- Predošlý revoke nezabral: `authenticated` má na `profiles` právo UPDATE na
-- celej tabuľke, a z tabuľkového práva sa jednotlivý stĺpec odobrať nedá.
-- Právo treba odobrať celé a vrátiť ho po stĺpcoch — bez tých dvoch.

revoke update on public.profiles from authenticated;
grant update (
  id, email, full_name, avatar_url, created_at, updated_at,
  product_mode, push_token, push_platform, push_updated_at
) on public.profiles to authenticated;

revoke update on public.profiles from anon;
