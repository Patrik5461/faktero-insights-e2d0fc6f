-- Rola „Vlastný prístup“: majiteľ či admin vyklikne, ku ktorým oblastiam má
-- človek prístup (none / read / edit). Práva ležia pri členstve aj pri pozvánke.
alter type public.company_role add value if not exists 'custom';
alter table public.company_users add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.company_invitations add column if not exists permissions jsonb not null default '{}'::jsonb;
