-- Anon nemá právo na is_platform_admin(); politika „active OR is_platform_admin()“
-- pre rolu public tak verejnému pásu partnerov na úvodnej stránke vracala
-- „permission denied for function is_platform_admin“ (zachytené v systemove_chyby 31. 10.).
drop policy if exists partners_read on public.partners;
create policy partners_read_anon on public.partners for select to anon using (active);
create policy partners_read on public.partners for select to authenticated
  using (active or public.is_platform_admin((select auth.uid())));
