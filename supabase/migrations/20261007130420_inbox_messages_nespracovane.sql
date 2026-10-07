alter table public.inbox_messages add column if not exists created_nespracovane_ids uuid[] not null default '{}'::uuid[];
