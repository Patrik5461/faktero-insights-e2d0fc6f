/*
  Help desk — prílohy k požiadavkám.

  Pri nahlásení chyby povie snímka obrazovky viac než odsek textu, a z mobilu
  ju človek odfotí rovno. Príloha visí na požiadavke (a na správe, s ktorou
  prišla); podpora ju otvorí podpísaným odkazom v administrácii.

  Zápis ide výhradne cez server (servisný kľúč po overení, že požiadavka patrí
  volajúcemu) — kôš preto nemá žiadne politiky pre prihlásených a zákazník
  riadky príloh len číta, a to iba pri vlastných požiadavkách. Help desk je
  viazaný na človeka, nie na firmu, takže `firmy_s_pravom()` sa tu nepoužíva
  (rovnako ako pri `podpora_poziadavky` a `podpora_spravy`).
*/
create table public.podpora_prilohy (
  id uuid primary key default gen_random_uuid(),
  poziadavka_id uuid not null references public.podpora_poziadavky(id) on delete cascade,
  sprava_id uuid references public.podpora_spravy(id) on delete set null,
  path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  mime text not null,
  size bigint not null check (size > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index podpora_prilohy_poziadavka_idx on public.podpora_prilohy (poziadavka_id, created_at);
create index podpora_prilohy_sprava_idx on public.podpora_prilohy (sprava_id);
create index podpora_prilohy_created_by_idx on public.podpora_prilohy (created_by);

alter table public.podpora_prilohy enable row level security;

create policy "zakaznik cita prilohy svojich poziadaviek" on public.podpora_prilohy
  for select to authenticated
  using (
    exists (
      select 1 from public.podpora_poziadavky p
       where p.id = poziadavka_id and p.user_id = (select auth.uid())
    )
  );

-- Dvojfaktor: nová tabuľka reštriktívnu politiku sama nedostane.
create policy "mfa ak je zapnute" on public.podpora_prilohy
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Bez GRANT vracia tabuľka „permission denied", hoci politiky sedia. Zápis ide cez server.
revoke all on public.podpora_prilohy from anon, public;
grant select on public.podpora_prilohy to authenticated;
grant all on public.podpora_prilohy to service_role;

-- Súkromný kôš, 10 MB na súbor; žiadne politiky na storage.objects — len servisný kľúč.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'podpora-prilohy', 'podpora-prilohy', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;
