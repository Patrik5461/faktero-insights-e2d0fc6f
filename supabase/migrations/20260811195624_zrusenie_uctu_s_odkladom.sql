-- Zrušenie účtu s odkladom.
--
-- App Store vyžaduje, aby sa účet dal zrušiť priamo z aplikácie. Odklad 14 dní
-- je tu preto, že vo fakturačnom systéme je omylom zrušený účet drahšia chyba
-- než čakanie — kým lehota beží, stačí sa prihlásiť a žiadosť odvolať.
--
-- Píše sem výhradne server (service role). Vlastník riadku si tieto stĺpce
-- nesmie prepísať sám, inak by si vedel posunúť termín do minulosti.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

comment on column public.profiles.deletion_requested_at is
  'Kedy používateľ požiadal o zrušenie účtu. NULL = nepožiadal.';
comment on column public.profiles.deletion_scheduled_for is
  'Kedy sa účet naozaj zruší. Do tohto okamihu sa dá žiadosť odvolať prihlásením.';

create index if not exists profiles_deletion_scheduled_for_idx
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null;
