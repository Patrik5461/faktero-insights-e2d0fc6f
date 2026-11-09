-- Údaje veriteľa (leasingovej spoločnosti / banky) na zmluve o financovaní.
-- Do Pohody idú v partnerIdentity záväzkov za splátky; IČ DPH potrebuje
-- kontrolný výkaz pri B.2 (Pohoda bez neho záväzok do KV nezaradí).
alter table public.financing_contracts
  add column if not exists provider_ico text,
  add column if not exists provider_dic text,
  add column if not exists provider_ic_dph text,
  add column if not exists provider_street text,
  add column if not exists provider_city text,
  add column if not exists provider_zip text,
  add column if not exists provider_country text;

comment on column public.financing_contracts.provider_ico is 'IČO veriteľa (leasingovka/banka), nie nájomcu.';
comment on column public.financing_contracts.provider_ic_dph is 'IČ DPH veriteľa — potrebné pre KV DPH B.2 v Pohode.';
comment on column public.financing_contracts.provider_country is 'Kód krajiny veriteľa (ISO 3166-1 alpha-2).';

notify pgrst, 'reload schema';
