-- Heslá k zaheslovaným PDF (Patrik 25. 11.): faktúry od operátorov, bánk a poisťovní
-- chodia s heslom. Firma si heslo uloží a PDF z mailu sa odomkne samo.
-- Heslo je šifrované (encryptSecret, ako bankové tokene); tabuľku číta a píše
-- len server (service_role) po kontrole práv — prehliadač k nej prístup nemá.
create table public.pdf_hesla (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null check (char_length(btrim(nazov)) between 1 and 120),
  odosielatel text check (odosielatel is null or char_length(odosielatel) <= 200),
  heslo_sifrovane text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index pdf_hesla_company_id_idx on public.pdf_hesla(company_id);
alter table public.pdf_hesla enable row level security;
revoke all on public.pdf_hesla from public, anon, authenticated;
grant all on public.pdf_hesla to service_role;
