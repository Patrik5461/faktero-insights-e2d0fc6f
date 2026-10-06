-- Projektový manažér (ako v Doklado): zákazka má manažéra, ktorý môže schvaľovať jej doklady.
alter table public.jobs add column if not exists manazer_id uuid references auth.users(id) on delete set null;
create index if not exists jobs_manazer_idx on public.jobs (manazer_id) where manazer_id is not null;
