-- Opakované platby: čo si o obnove treba pamätať.
--
-- Predplatné sa doteraz obnovovalo len tak, že niekto znovu prešiel platobnou
-- bránou. Podmienky pritom sľubujú automatické strhnutie a upozornenie 7 dní
-- vopred — na oboje treba vedieť, kedy sa naposledy čo stalo a koľko pokusov
-- už zlyhalo.
alter table public.subscriptions
  add column if not exists renewal_reminder_sent_at timestamptz,
  add column if not exists renewal_attempts integer not null default 0,
  add column if not exists last_renewal_at timestamptz,
  add column if not exists last_renewal_error text;

comment on column public.subscriptions.renewal_reminder_sent_at is
  'Kedy odišlo upozornenie pred najbližšou obnovou (nuluje sa po úspešnej platbe).';
comment on column public.subscriptions.renewal_attempts is
  'Koľkokrát po sebe zlyhalo strhnutie. Po treťom sa predplatné označí ako po splatnosti.';
comment on column public.subscriptions.gopay_subscription_id is
  'Id prvej (rodičovskej) platby v GoPay — z nej sa strhávajú ďalšie mesiace.';

-- Obnovu hľadá cron podľa dátumu; bez indexu by prechádzal celú tabuľku.
create index if not exists subscriptions_next_billing_idx
  on public.subscriptions (next_billing_at)
  where status in ('active', 'past_due');
