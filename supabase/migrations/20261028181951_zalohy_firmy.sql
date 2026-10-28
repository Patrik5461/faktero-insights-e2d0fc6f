/*
  Zálohy firmy — „Vytvoriť zálohu“ zabalí na pozadí všetky doklady firmy
  (tabuľky CSV, PDF faktúr, skeny prijatých dokladov) do ZIP v súkromnom koši
  `export-firmy` pod `<firma>/zalohy/`. Riadok drží stav behu, aby sa naň dalo
  doptávať (dlhé volanie by nginx po 30 s prerušil). Zapisuje len server.
*/
create table public.zalohy_firmy (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  stav text not null default 'bezi' check (stav in ('bezi', 'hotovo', 'chyba')),
  cesta text,
  velkost bigint,
  pocty jsonb not null default '{}'::jsonb,
  chyba text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index zalohy_firmy_firma_idx on public.zalohy_firmy (company_id, created_at desc);
create index zalohy_firmy_created_by_idx on public.zalohy_firmy (created_by);

alter table public.zalohy_firmy enable row level security;

create policy "clenovia citaju zalohy" on public.zalohy_firmy for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.zalohy_firmy as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "oblast citanie" on public.zalohy_firmy as restrictive for select to authenticated
  using (company_id = any ((select firmy_s_pravom('faktury', false))::uuid[])
     and company_id = any ((select firmy_s_pravom('doklady', false))::uuid[]));

revoke all on public.zalohy_firmy from anon, public;
grant select on public.zalohy_firmy to authenticated;
grant all on public.zalohy_firmy to service_role;
