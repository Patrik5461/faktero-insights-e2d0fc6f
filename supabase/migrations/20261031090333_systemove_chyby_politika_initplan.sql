-- Advisor auth_rls_initplan: auth.uid() aj vnútri volania funkcie cez (select …).
alter policy "platform admin cita systemove chyby" on public.systemove_chyby
  using ((select public.is_platform_admin((select auth.uid()))));
