-- Keď si človek v Gmaile zapne preposielanie na svoju adresu na doklady, Google
-- pošle na ňu overovací mail s kódom a odkazom. Tá adresa je naša, takže mail
-- dovtedy končil tam, kam používateľ nevidí, a preposielanie sa nikdy nezaplo.
-- Z mailu sa uloží len kód, odkaz a schránka, z ktorej sa preposiela — telo nie.
create table if not exists public.inbox_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'gmail',
  -- Schránka, z ktorej sa preposiela. Gmail ju píše v jazyku používateľa,
  -- takže sa nemusí podariť prečítať — vtedy je prázdna.
  source_email text,
  code text,
  confirm_url text,
  received_at timestamptz not null default now(),
  confirmed_at timestamptz,
  -- Odkaz od Googlu má krátku platnosť; po týždni je záznam na nič.
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists inbox_verifications_company_idx
  on public.inbox_verifications (company_id, received_at desc);

alter table public.inbox_verifications enable row level security;

-- Potvrdenie vidí celá firma — preposielanie si môže nastaviť ktokoľvek z nej.
create policy "Members read inbox verifications" on public.inbox_verifications
  for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));

-- Meniť sa smie jediné: odškrtnúť, že je potvrdené. Zapisuje server.
create policy "Members confirm inbox verifications" on public.inbox_verifications
  for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));

grant select, update on public.inbox_verifications to authenticated;

comment on table public.inbox_verifications is
  'Potvrdzovacie maily poskytovateľov (Gmail) pre preposielanie na adresu firmy na doklady.';

-- Banner sa má objaviť bez obnovenia stránky.
alter publication supabase_realtime add table public.inbox_verifications;
