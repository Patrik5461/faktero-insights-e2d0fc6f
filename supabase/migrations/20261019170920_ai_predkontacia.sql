-- Aplikované v dvoch častiach: 20261019170920_ai_predkontacia a 20261019170929_ai_predkontacia_prava.
-- Návrh zaúčtovania od AI pre doklad od nového dodávateľa
-- (src/lib/faktero/ai-predkontacia*.ts).
--
-- Pamäť výsledku, aby sa model nevolal pri každom otvorení dokladu. Jeden
-- riadok na doklad; `odtlacok` je odtlačok vstupu (dodávateľ, sumy,
-- položky…) — keď sa doklad zmení, návrh sa spočíta znova. `navrh` drží
-- len kódy, ktoré prešli kontrolou proti číselníku firmy:
--   {"predkontacia": "1Fp", "clenenie": "PD", "kv": null, "kategoria": "software", "dovod": "…"}
-- Návrh doklad nikdy nezaúčtuje — potvrdzuje ho človek.
--
-- `doklad_id` ukazuje do purchase_invoices / expense_documents /
-- nespracovane_doklady podľa `doklad_typ`, preto bez cudzieho kľúča.
create table if not exists public.ai_navrhy_zauctovania (
  company_id uuid not null references public.companies(id) on delete cascade,
  doklad_typ text not null check (doklad_typ in ('prijata', 'doklad', 'nespracovany')),
  doklad_id uuid not null,
  odtlacok text not null check (length(odtlacok) between 4 and 64),
  stav text not null check (stav in ('navrh', 'prazdny')),
  navrh jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, doklad_typ, doklad_id)
);

alter table public.ai_navrhy_zauctovania enable row level security;

create policy "clenovia citaju navrhy ai" on public.ai_navrhy_zauctovania for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju navrhy ai" on public.ai_navrhy_zauctovania for insert to authenticated
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju navrhy ai" on public.ai_navrhy_zauctovania for update to authenticated
  using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu navrhy ai" on public.ai_navrhy_zauctovania for delete to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));

-- Dvojfaktor (reštriktívne, ako na každej tabuľke).
create policy "mfa ak je zapnute" on public.ai_navrhy_zauctovania as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Vlastný prístup — oblasť „doklady".
select public.vlastny_pristup_politiky_na('ai_navrhy_zauctovania', 'company_id', 'doklady');

-- Právo drží PUBLIC — odobrať treba jemu, nie len anon.
revoke all on public.ai_navrhy_zauctovania from public, anon;
grant select, insert, update, delete on public.ai_navrhy_zauctovania to authenticated;
grant all on public.ai_navrhy_zauctovania to service_role;
