-- Termín zrušenia si používateľ nesmie prepísať sám.
--
-- `profiles` má politiku „Users update own profile", takže bez tohto by si
-- prihlásený človek (alebo ktokoľvek s ukradnutou reláciou) vedel posunúť
-- `deletion_scheduled_for` do minulosti a obísť tak celý zmysel odkladu.
-- Zapisuje sem výhradne server cez service role.
--
-- POZOR: tento revoke sám o sebe nezabral — pokračovanie je v migrácii
-- 20260811195741_zrusenie_uctu_stlpce_len_pre_server_oprava.sql.

revoke update (deletion_requested_at, deletion_scheduled_for)
  on public.profiles from authenticated;
revoke update (deletion_requested_at, deletion_scheduled_for)
  on public.profiles from anon;
