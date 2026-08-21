-- Nahlásenie chyby a návrh na zlepšenie priamo z aplikácie.
-- Doteraz sa to dalo poslať len cez verejný kontaktný formulár, kde človek
-- musel znova písať, kto je a kde to videl. Tu sa to k správe pripojí samo.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'chyba' alebo 'napad'; viac druhov zatiaľ netreba a voľný text by sa
  -- rozsypal na preklepoch.
  kind text not null check (kind in ('chyba', 'napad')),
  message text not null,
  -- Kde to videl a v čom — bez toho sa chyba hľadá dvakrát dlhšie.
  url text,
  user_agent text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Vidí to autor (nech vie, že to odišlo) a správa platformy.
create policy "Autor a admin citaju feedback" on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()) or is_platform_admin((select auth.uid())));

create policy "Prihlaseny posiela feedback" on public.feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (company_id is null or is_company_member(company_id, (select auth.uid())))
  );

create policy "Admin uzatvara feedback" on public.feedback
  for update to authenticated
  using (is_platform_admin((select auth.uid())))
  with check (is_platform_admin((select auth.uid())));

grant select, insert, update on public.feedback to authenticated;
grant select, insert, update, delete on public.feedback to service_role;

comment on table public.feedback is
  'Nahlásené chyby a návrhy na zlepšenie z prihlásenej aplikácie.';
