-- Partneri na hlavnej stránke — pás, ktorý sa sám posúva.
-- Spravuje ich platformový admin, číta ich ktokoľvek (je to marketingová stránka).
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  website text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partners enable row level security;

-- Verejné čítanie len toho, čo je zapnuté. Vypnutý partner sa nemá ako
-- dostať na stránku ani cez priame volanie API.
drop policy if exists partners_public_read on public.partners;
create policy partners_public_read on public.partners
  for select using (active);

drop policy if exists partners_admin_read on public.partners;
create policy partners_admin_read on public.partners
  for select to authenticated using (public.is_platform_admin(auth.uid()));

drop policy if exists partners_admin_write on public.partners;
create policy partners_admin_write on public.partners
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

create index if not exists idx_partners_active_order on public.partners (active, sort_order);

-- Kôš na logá. Verejný naschvál: obrázok na verejnej stránke sa cez podpísanú
-- adresu servovať nedá, tá po hodine vyprší.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-logos', 'partner-logos', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists partner_logos_read on storage.objects;
create policy partner_logos_read on storage.objects
  for select using (bucket_id = 'partner-logos');

drop policy if exists partner_logos_admin_write on storage.objects;
create policy partner_logos_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'partner-logos' and public.is_platform_admin(auth.uid()))
  with check (bucket_id = 'partner-logos' and public.is_platform_admin(auth.uid()));
