/*
  Úhrady prijatých faktúr — aj čiastočné.

  Doteraz mala prijatá faktúra len stav `paid` a `payment_date`; čiastočnú
  úhradu nebolo kam zapísať a pohyby z banky (`bank_transactions.
  matched_purchase_invoice_id`) sa sčítavali len v príkaze na úhradu.

  Teraz je každá úhrada riadok v `purchase_invoice_payments`:
  - `rucne`     — pridaná v okne Úhrady,
  - `banka`     — spárovaný pohyb z účtu (riadok vzniká a zaniká sám so
                  spárovaním, spúšťač na bank_transactions),
  - `oznacenie` — „Označiť ako uhradenú“ odkiaľkoľvek (aj staré cesty, ktoré
                  len prepnú status na paid): doplní sa zvyšok sumy.

  Stav `paid` a `payment_date` počíta spúšťač zo súčtu úhrad (+ zaplatená
  zálohová faktúra, ktorú faktúra zúčtováva). Koncept a storno sa nemenia.
  Čiastočne uhradenú faktúru pozná aplikácia podľa súčtu riadkov.

  Úhrady nie sú zamknuté uzávierkou ani odovzdaním do Pohody — platba prichádza
  po uzávierke (faktero-uzamknutie-obdobi).
*/
create table public.purchase_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  paid_at date not null default current_date,
  method text,
  zdroj text not null default 'rucne' check (zdroj in ('rucne', 'banka', 'oznacenie')),
  bank_transaction_id uuid unique references public.bank_transactions(id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index purchase_invoice_payments_faktura_idx
  on public.purchase_invoice_payments (purchase_invoice_id, paid_at);
create index purchase_invoice_payments_firma_idx
  on public.purchase_invoice_payments (company_id, paid_at);

comment on table public.purchase_invoice_payments is
  'Úhrady prijatej faktúry (aj čiastočné). Stav paid na faktúre z nich počíta spúšťač.';

alter table public.purchase_invoice_payments enable row level security;

create policy "clenovia citaju uhrady prijatych" on public.purchase_invoice_payments for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju uhrady prijatych" on public.purchase_invoice_payments for insert to authenticated
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju uhrady prijatych" on public.purchase_invoice_payments for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu uhrady prijatych" on public.purchase_invoice_payments for delete to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.purchase_invoice_payments as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "oblast citanie" on public.purchase_invoice_payments as restrictive for select to authenticated
  using (company_id = any ((select firmy_s_pravom('doklady', false))::uuid[]));
create policy "oblast zapis" on public.purchase_invoice_payments as restrictive for insert to authenticated
  with check (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast uprava" on public.purchase_invoice_payments as restrictive for update to authenticated
  using (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast mazanie" on public.purchase_invoice_payments as restrictive for delete to authenticated
  using (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));

revoke all on public.purchase_invoice_payments from anon, public;
grant select, insert, update, delete on public.purchase_invoice_payments to authenticated;
grant all on public.purchase_invoice_payments to service_role;

/*
  Firma a mena úhrady sa berú z faktúry — klient ich neurčuje. Funkcia beží
  s právami volajúceho, takže cudziu faktúru (RLS) nenájde a úhradu k nej
  nezaloží.
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
  if tg_op = 'INSERT' then
    new.currency := coalesce(nullif(new.currency, ''), _mena, 'EUR');
  end if;
  return new;
end $$;

create trigger purchase_invoice_payments_doplnenie
  before insert or update of purchase_invoice_id on public.purchase_invoice_payments
  for each row execute function public.uhrada_prijatej_doplnenie();

/** Suma, ktorú treba faktúrou uhradiť: |celkom| mínus zaplatená zálohová faktúra. */
create or replace function public.prijata_suma_na_uhradu(_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _celkom numeric;
  _zaloha_id uuid;
  _zaloha numeric := 0;
begin
  select abs(coalesce(amount_total, 0)), advance_invoice_id into _celkom, _zaloha_id
    from public.purchase_invoices where id = _id;
  if _celkom is null then return 0; end if;
  if _zaloha_id is not null then
    select abs(coalesce(amount_total, 0)) into _zaloha
      from public.purchase_invoices
     where id = _zaloha_id and status = 'paid' and deleted_at is null;
  end if;
  return greatest(_celkom - coalesce(_zaloha, 0), 0);
end $$;

/*
  Prepočet stavu faktúry zo súčtu úhrad. Mení len status a payment_date, a len
  keď treba — koncept, storno a faktúra s nulovou sumou ostávajú, ako sú.
  Príznak `faktero.prepocet_uhrad` zabráni tomu, aby zmenu stavu odtiaľto
  spúšťač na faktúre bral ako ručné označenie.
*/
create or replace function public.prepocitaj_uhrady_prijatej(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _f record;
  _s numeric;
  _posledna date;
  _treba numeric;
begin
  select id, status, zauctovane_at, payment_date into _f
    from public.purchase_invoices where id = _id;
  if not found or _f.status in ('draft', 'cancelled') then return; end if;
  select coalesce(sum(amount), 0), max(paid_at) into _s, _posledna
    from public.purchase_invoice_payments where purchase_invoice_id = _id;
  _treba := public.prijata_suma_na_uhradu(_id);
  if _treba <= 0 then return; end if;

  perform set_config('faktero.prepocet_uhrad', '1', true);
  if _s >= _treba - 0.005 then
    if _f.status <> 'paid' or _f.payment_date is distinct from _posledna then
      update public.purchase_invoices
         set status = 'paid', payment_date = _posledna
       where id = _id;
    end if;
  elsif _f.status = 'paid' then
    update public.purchase_invoices
       set status = case when _f.zauctovane_at is not null then 'booked' else 'received' end,
           payment_date = null
     where id = _id;
  end if;
  perform set_config('faktero.prepocet_uhrad', '', true);
end $$;

create or replace function public.uhrady_prijatej_zmena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.prepocitaj_uhrady_prijatej(old.purchase_invoice_id);
    return null;
  end if;
  perform public.prepocitaj_uhrady_prijatej(new.purchase_invoice_id);
  if tg_op = 'UPDATE' and old.purchase_invoice_id <> new.purchase_invoice_id then
    perform public.prepocitaj_uhrady_prijatej(old.purchase_invoice_id);
  end if;
  return null;
end $$;

/*
  Staré cesty (hromadné označenie, appka, API, Nespracované „už uhradená“)
  len prepnú status. Pri prepnutí na paid sa doplní úhrada za zvyšok sumy,
  pri návrate na neuhradenú sa zmažú úhrady, ktoré neprišli z banky.
*/
create or replace function public.uhrady_prijatej_zo_stavu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _s numeric;
  _treba numeric;
begin
  if coalesce(current_setting('faktero.prepocet_uhrad', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'paid' then return null; end if;
  end if;

  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select coalesce(sum(amount), 0) into _s
      from public.purchase_invoice_payments where purchase_invoice_id = new.id;
    _treba := public.prijata_suma_na_uhradu(new.id);
    if _treba - _s > 0.005 then
      insert into public.purchase_invoice_payments
        (company_id, purchase_invoice_id, amount, currency, paid_at, method, zdroj, created_by)
      values
        (new.company_id, new.id, round(_treba - _s, 2), coalesce(new.currency, 'EUR'),
         coalesce(new.payment_date, current_date), new.payment_method, 'oznacenie', auth.uid());
    end if;
    return null;
  end if;

  if tg_op = 'UPDATE' and old.status = 'paid' and new.status in ('received', 'booked', 'draft') then
    delete from public.purchase_invoice_payments
     where purchase_invoice_id = new.id and bank_transaction_id is null;
    return null;
  end if;

  -- Zmena sumy alebo zálohy — stav sa prepočíta.
  if tg_op = 'UPDATE' and (old.amount_total is distinct from new.amount_total
      or old.advance_invoice_id is distinct from new.advance_invoice_id) then
    perform public.prepocitaj_uhrady_prijatej(new.id);
  end if;
  return null;
end $$;

/* Spárovaný pohyb z banky = úhrada; zrušenie väzby ju zmaže. */
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
  if new.matched_purchase_invoice_id is not null and coalesce(abs(new.amount), 0) > 0 then
    -- Ručné „označenie“ bolo náhradou za neznámu platbu; pohyb z banky ho nahradí.
    delete from public.purchase_invoice_payments
     where purchase_invoice_id = new.matched_purchase_invoice_id and zdroj = 'oznacenie';
    insert into public.purchase_invoice_payments
      (company_id, purchase_invoice_id, amount, currency, paid_at, method, zdroj, bank_transaction_id)
    select p.company_id, p.id, abs(new.amount), coalesce(new.currency, p.currency, 'EUR'),
           coalesce(new.booking_date, current_date), 'prevod', 'banka', new.id
      from public.purchase_invoices p
     where p.id = new.matched_purchase_invoice_id
    on conflict (bank_transaction_id) do update
      set purchase_invoice_id = excluded.purchase_invoice_id,
          amount = excluded.amount,
          paid_at = excluded.paid_at;
  end if;
  return null;
end $$;

revoke all on function public.uhrada_prijatej_doplnenie() from public, anon, authenticated;
revoke all on function public.prijata_suma_na_uhradu(uuid) from public, anon, authenticated;
revoke all on function public.prepocitaj_uhrady_prijatej(uuid) from public, anon, authenticated;
revoke all on function public.uhrady_prijatej_zmena() from public, anon, authenticated;
revoke all on function public.uhrady_prijatej_zo_stavu() from public, anon, authenticated;
revoke all on function public.uhrada_prijatej_z_banky() from public, anon, authenticated;

/*
  Doterajšie úhrady: spárované pohyby a zvyšok zaplatených faktúr ako
  „označenie“. Spúšťače sa zakladajú až po tomto kroku, takže stav ani
  updated_at žiadnej faktúry sa nezmení.
*/
insert into public.purchase_invoice_payments
  (company_id, purchase_invoice_id, amount, currency, paid_at, method, zdroj, bank_transaction_id, created_by)
select p.company_id, p.id, abs(b.amount), coalesce(b.currency, p.currency, 'EUR'),
       coalesce(b.booking_date, p.payment_date, current_date), 'prevod', 'banka', b.id, null
  from public.bank_transactions b
  join public.purchase_invoices p on p.id = b.matched_purchase_invoice_id
 where coalesce(abs(b.amount), 0) > 0;

insert into public.purchase_invoice_payments
  (company_id, purchase_invoice_id, amount, currency, paid_at, method, zdroj, created_by)
select p.company_id, p.id, round(public.prijata_suma_na_uhradu(p.id) - coalesce(u.s, 0), 2),
       coalesce(p.currency, 'EUR'), coalesce(p.payment_date, p.issue_date, current_date),
       p.payment_method, 'oznacenie', null
  from public.purchase_invoices p
  left join (select purchase_invoice_id, sum(amount) s from public.purchase_invoice_payments group by 1) u
    on u.purchase_invoice_id = p.id
 where p.status = 'paid'
   and public.prijata_suma_na_uhradu(p.id) - coalesce(u.s, 0) > 0.005;

create trigger purchase_invoice_payments_prepocet
  after insert or update or delete on public.purchase_invoice_payments
  for each row execute function public.uhrady_prijatej_zmena();

create trigger purchase_invoices_uhrady_zo_stavu
  after insert or update of status, amount_total, advance_invoice_id on public.purchase_invoices
  for each row execute function public.uhrady_prijatej_zo_stavu();

create trigger bank_transactions_uhrada_prijatej
  after insert or update of matched_purchase_invoice_id, amount, booking_date on public.bank_transactions
  for each row execute function public.uhrada_prijatej_z_banky();
