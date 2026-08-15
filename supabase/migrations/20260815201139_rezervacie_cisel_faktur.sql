-- Rezervované čísla faktúr pre vystavovanie bez signálu.
--
-- Appka si v signáli vypýta zopár čísel dopredu a bez signálu z nich vydáva,
-- takže zákazník dostane číslo hneď na mieste. Rezervácia musí byť viditeľná
-- pre `faktero_next_invoice_number`, inak by to isté číslo medzitým dostal
-- niekto iný online.
--
-- Nepoužitá rezervácia po vypršaní prestane blokovať a číslo sa vráti do rady —
-- generátor hľadá najnižšie voľné číslo, takže dieru sám zaplní.

create table if not exists public.invoice_number_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_number text not null,
  sequence_number integer not null,
  -- Obdobie, do ktorého číslo patrí — rada sa resetuje ročne alebo mesačne.
  issue_date date not null,
  device text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  invoice_id uuid references public.invoices(id) on delete set null
);

create unique index if not exists invoice_number_reservations_cislo_uniq
  on public.invoice_number_reservations (company_id, invoice_number);

create index if not exists invoice_number_reservations_zive_idx
  on public.invoice_number_reservations (company_id, expires_at)
  where used_at is null;

alter table public.invoice_number_reservations enable row level security;

drop policy if exists "clenovia vidia rezervacie" on public.invoice_number_reservations;
create policy "clenovia vidia rezervacie" on public.invoice_number_reservations
  for select using (public.is_company_member(company_id, auth.uid()));

-- Zapísať rezerváciu vie len `faktero_reserve_invoice_numbers` (SECURITY
-- DEFINER). Označiť ju za použitú musí vystavenie faktúry, ktoré ide cez
-- klienta prihláseného človeka — na to je potrebná politika.
drop policy if exists "clenovia znacia pouzitie" on public.invoice_number_reservations;
create policy "clenovia znacia pouzitie" on public.invoice_number_reservations
  for update using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));

revoke all on public.invoice_number_reservations from public;
grant select, update on public.invoice_number_reservations to authenticated;
