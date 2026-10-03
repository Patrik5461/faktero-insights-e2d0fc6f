-- Účet, ktorý banka odmietne (NO_ACCOUNT), sa doteraz skúšal každú noc znova a
-- jediná stopa bola chyba v logu. Teraz si dôvod zapamätá: nočný beh ho
-- preskočí a človek v prehľade uvidí, že s ním treba niečo urobiť.
alter table public.bank_accounts
  add column if not exists unavailable_since timestamptz,
  add column if not exists unavailable_reason text;

comment on column public.bank_accounts.unavailable_since is
  'Kedy banka účet naposledy odmietla. NULL = v poriadku. Maže sa pri prvom úspešnom stiahnutí.';
