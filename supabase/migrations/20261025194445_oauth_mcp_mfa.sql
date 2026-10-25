create policy "mfa ak je zapnute" on public.oauth_clients as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa ak je zapnute" on public.oauth_codes as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa ak je zapnute" on public.oauth_refresh_tokens as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
