/*
  Úhrady prijatých faktúr — väzby len v rámci jednej firmy.

  uhrada_prijatej_z_banky beží ako SECURITY DEFINER, takže pohyb s
  matched_purchase_invoice_id cudzej firmy by cudziu faktúru „zaplatil“.
  A ručná úhrada mohla niesť bank_transaction_id cudzieho pohybu (unikátny
  stĺpec — zablokoval by jeho skutočné spárovanie).
*/
create or replace function public.uhrada_prijatej_doplnenie()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _firma uuid;
  _mena text;
begin
  select company_id, currency into _firma, _mena
    from public.purchase_invoices where id = new.purchase_invoice_id;
  if _firma is null then
    raise exception 'Faktúra sa nenašla.' using errcode = 'P0001';
  end if;
  new.company_id := _firma;
  if new.bank_transaction_id is not null and not exists (
    select 1 from public.bank_transactions b
     where b.id = new.bank_transaction_id and b.company_id = _firma
  ) then
    raise exception 'Pohyb z banky patrí inej firme.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.currency := coalesce(nullif(new.currency, ''), _mena, 'EUR');
  end if;
  return new;
end $$;
revoke all on function public.uhrada_prijatej_doplnenie() from public, anon, authenticated;

create or replace trigger purchase_invoice_payments_doplnenie
  before insert or update of purchase_invoice_id, bank_transaction_id on public.purchase_invoice_payments
  for each row execute function public.uhrada_prijatej_doplnenie();

create or replace function public.uhrada_prijatej_z_banky()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.matched_purchase_invoice_id is not distinct from new.matched_purchase_invoice_id
     and old.amount = new.amount
     and old.booking_date is not distinct from new.booking_date then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.matched_purchase_invoice_id is not null then
    delete from public.purchase_invoice_payments where bank_transaction_id = new.id;
  end if;
  -- Len faktúra tej istej firmy ako pohyb — funkcia obchádza RLS.
  if new.matched_purchase_invoice_id is not null and coalesce(abs(new.amount), 0) > 0
     and exists (select 1 from public.purchase_invoices p
                  where p.id = new.matched_purchase_invoice_id and p.company_id = new.company_id) then
    -- Ručné „označenie“ bolo náhradou za neznámu platbu; pohyb z banky ho nahradí.
    delete from public.purchase_invoice_payments
     where purchase_invoice_id = new.matched_purchase_invoice_id and zdroj = 'oznacenie';
    insert into public.purchase_invoice_payments
      (company_id, purchase_invoice_id, amount, currency, paid_at, method, zdroj, bank_transaction_id)
    select p.company_id, p.id, abs(new.amount), coalesce(new.currency, p.currency, 'EUR'),
           coalesce(new.booking_date, current_date), 'prevod', 'banka', new.id
      from public.purchase_invoices p
     where p.id = new.matched_purchase_invoice_id
       and p.company_id = new.company_id
    on conflict (bank_transaction_id) do update
      set purchase_invoice_id = excluded.purchase_invoice_id,
          amount = excluded.amount,
          paid_at = excluded.paid_at;
  end if;
  return null;
end $$;
revoke all on function public.uhrada_prijatej_z_banky() from public, anon, authenticated;
