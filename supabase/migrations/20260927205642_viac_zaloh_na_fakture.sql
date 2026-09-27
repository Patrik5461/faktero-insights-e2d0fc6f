-- Viac zálohových faktúr na jednej vyúčtovacej faktúre.
--
-- Faktúra si zálohu pamätala v `advance_invoice_id` — teda práve jednu. Pri
-- etapovej dodávke (časť pri objednávke, časť pri dodaní materiálu) ich býva
-- viac a zvyšok musel človek dopočítať ručne, čím sa stráca väzba na doklady
-- aj istota, že sa každá záloha odpočíta práve raz.
--
-- `advance_invoice_id` ostáva pre **daňový doklad k prijatej platbe**, kde
-- znamená niečo iné: ku ktorej zálohe patrí. Odpočty vyúčtovania sa sťahujú
-- sem a `invoices.advance_amount` drží ich súčet, lebo doklad aj QR kód
-- potrebujú jedno číslo „k úhrade".
create table if not exists public.invoice_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  advance_invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- Tá istá záloha sa na jednu faktúru nedá dať dvakrát.
  unique (invoice_id, advance_invoice_id)
);

create index if not exists invoice_advances_invoice_idx on public.invoice_advances (invoice_id);
create index if not exists invoice_advances_zaloha_idx on public.invoice_advances (advance_invoice_id);

alter table public.invoice_advances enable row level security;

revoke all on public.invoice_advances from public;
grant select, insert, update, delete on public.invoice_advances to authenticated;
grant all on public.invoice_advances to service_role;

create policy "Members read invoice advances" on public.invoice_advances
  for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));

create policy "Members write invoice advances – vklad" on public.invoice_advances
  for insert to authenticated
  with check (is_company_member(company_id, (select auth.uid())));

create policy "Members write invoice advances – úprava" on public.invoice_advances
  for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));

create policy "Members write invoice advances – mazanie" on public.invoice_advances
  for delete to authenticated
  using (is_company_member(company_id, (select auth.uid())));

-- Dvojfaktor: reštriktívna politika ako na každej tabuľke s dokladmi.
create policy "mfa ak je zapnute" on public.invoice_advances
  as restrictive for all to public
  using ((select mfa_ok()))
  with check ((select mfa_ok()));

-- Vlastný prístup podľa oblasti „faktúry".
create policy "oblast citanie" on public.invoice_advances
  as restrictive for select to public
  using (company_id = any ((select firmy_s_pravom('faktury', false))::uuid[]));

create policy "oblast zapis" on public.invoice_advances
  as restrictive for insert to public
  with check (company_id = any ((select firmy_s_pravom('faktury', true))::uuid[]));

create policy "oblast uprava" on public.invoice_advances
  as restrictive for update to public
  using (company_id = any ((select firmy_s_pravom('faktury', true))::uuid[]))
  with check (company_id = any ((select firmy_s_pravom('faktury', true))::uuid[]));

create policy "oblast mazanie" on public.invoice_advances
  as restrictive for delete to public
  using (company_id = any ((select firmy_s_pravom('faktury', true))::uuid[]));

-- Doterajšie odpočty sa presunú, nech je jedno miesto pravdy.
insert into public.invoice_advances (company_id, invoice_id, advance_invoice_id, amount)
select i.company_id, i.id, i.advance_invoice_id, i.advance_amount
  from public.invoices i
 where i.type = 'regular'
   and i.advance_invoice_id is not null
   and coalesce(i.advance_amount, 0) > 0
   and i.deleted_at is null
on conflict do nothing;
