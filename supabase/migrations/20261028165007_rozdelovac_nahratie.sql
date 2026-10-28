-- Rozdeľovač: záznam pôvodu v Nespracovaných a nahratie súboru bez výberu firmy.
alter table public.nespracovane_doklady
  add column if not exists cez_rozdelovac boolean not null default false;
comment on column public.nespracovane_doklady.cez_rozdelovac is
  'Doklad do firmy zaradil rozdeľovač (osobná adresa alebo nahratie do ktorejkoľvek firmy).';

alter table public.mail_nepriradene alter column provider_email_id drop not null;
alter table public.mail_nepriradene
  add column if not exists zdroj text not null default 'mail',
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_mime text,
  add column if not exists file_size bigint,
  add column if not exists ai jsonb;
alter table public.mail_nepriradene drop constraint if exists mail_nepriradene_zdroj_check;
alter table public.mail_nepriradene
  add constraint mail_nepriradene_zdroj_check check (zdroj in ('mail', 'nahratie'));
alter table public.mail_nepriradene drop constraint if exists mail_nepriradene_povod_check;
alter table public.mail_nepriradene
  add constraint mail_nepriradene_povod_check
  check ((zdroj = 'mail' and provider_email_id is not null) or (zdroj = 'nahratie'));

-- Súbory nahraté do rozdeľovača ešte nepatria žiadnej firme: vlastný kôš bez
-- politík, siaha naň len servisná rola po overení používateľa.
insert into storage.buckets (id, name, public, file_size_limit)
values ('rozdelovac', 'rozdelovac', false, 15728640)
on conflict (id) do nothing;
