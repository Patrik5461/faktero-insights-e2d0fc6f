-- Predaj spotrebiteľom do EÚ v režime OSS.
--
-- Po prekročení hranice 10 000 eur za rok sa predaj tovaru na diaľku
-- a digitálnych služieb nezdaniteľným osobám zdaňuje sadzbou štátu zákazníka
-- a daň sa odvádza cez jedno kontaktné miesto (§ 68a a nasl. zákona o DPH).
-- Takáto faktúra nesmie vstúpiť do slovenského priznania ani do kontrolného
-- výkazu — patrí do osobitného priznania OSS.
alter table public.invoices
  add column if not exists oss boolean not null default false,
  -- Štát spotreby (kód krajiny), podľa ktorého sa určila sadzba.
  add column if not exists oss_country text;

alter table public.invoices drop constraint if exists invoices_oss_country_chk;
alter table public.invoices add constraint invoices_oss_country_chk
  check (oss_country is null or oss_country ~ '^[A-Z]{2}$');

-- Faktúra v režime OSS musí vedieť, do ktorého štátu patrí.
alter table public.invoices drop constraint if exists invoices_oss_ma_stat_chk;
alter table public.invoices add constraint invoices_oss_ma_stat_chk
  check (oss = false or oss_country is not null);

create index if not exists invoices_oss_obdobie
  on public.invoices (company_id, oss, delivery_date)
  where oss = true;
