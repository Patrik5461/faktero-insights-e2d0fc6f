-- eFaktúra → Príjem: kam sa zaradí zaevidovaná prijatá eFaktúra, automatické
-- zaevidovanie a čo sa stane po zaevidovaní. Meniť smie len správca firmy
-- (politiky efaktura_profiles pustia úpravu len is_company_admin).
alter table public.efaktura_profiles
  add column if not exists prijem_ciel text not null default 'prijate',
  add column if not exists prijem_stav_id uuid references public.stavy_dokladov(id) on delete set null,
  add column if not exists prijem_automaticky boolean not null default false,
  add column if not exists prijem_otvorit boolean not null default true;

alter table public.efaktura_profiles drop constraint if exists efaktura_profiles_prijem_ciel_check;
alter table public.efaktura_profiles
  add constraint efaktura_profiles_prijem_ciel_check check (prijem_ciel in ('prijate', 'nespracovane'));

comment on column public.efaktura_profiles.prijem_ciel is
  'Kam sa zaradí zaevidovaná eFaktúra (faktúra, dobropis): prijate | nespracovane. Zálohová ide vždy medzi prijaté zálohové.';
comment on column public.efaktura_profiles.prijem_stav_id is 'Stav dokladu firmy pre novú prijatú faktúru z eFaktúry.';
comment on column public.efaktura_profiles.prijem_automaticky is 'Zaevidovať eFaktúru hneď po stiahnutí.';
comment on column public.efaktura_profiles.prijem_otvorit is 'Po ručnom zaevidovaní otvoriť doklad.';

-- Väzba na Nespracovaný doklad a zámok proti súbežnému zaevidovaniu.
alter table public.efaktura_received_documents
  add column if not exists nespracovany_id uuid references public.nespracovane_doklady(id) on delete set null,
  add column if not exists zaevidovanie_at timestamptz;
create index if not exists efaktura_received_nespracovany_idx
  on public.efaktura_received_documents (nespracovany_id) where nespracovany_id is not null;

-- Ten istý doklad od poskytovateľa sa uloží len raz (súbežné stiahnutie).
create unique index if not exists efaktura_received_sprava_uniq
  on public.efaktura_received_documents (company_id, (parsed_data ->> 'providerMessageId'))
  where parsed_data ? 'providerMessageId';

-- Suma na úhradu: odpočet zálohy napísaný na doklade (zaplatená záloha z
-- eFaktúry, samofaktúra) má prednosť pred zaplatenou zálohovou z väzby.
create or replace function public.prijata_suma_na_uhradu(_id uuid)
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _celkom numeric;
  _zaloha_id uuid;
  _na_doklade numeric := 0;
  _zaloha numeric := 0;
begin
  select abs(coalesce(amount_total, 0)), advance_invoice_id, abs(coalesce(advance_amount, 0))
    into _celkom, _zaloha_id, _na_doklade
    from public.purchase_invoices where id = _id;
  if _celkom is null then return 0; end if;
  if coalesce(_na_doklade, 0) > 0 then
    return greatest(_celkom - _na_doklade, 0);
  end if;
  if _zaloha_id is not null then
    select abs(coalesce(amount_total, 0)) into _zaloha
      from public.purchase_invoices
     where id = _zaloha_id and status = 'paid' and deleted_at is null;
  end if;
  return greatest(_celkom - coalesce(_zaloha, 0), 0);
end $function$;

create or replace function public.uhrady_prijatej_zo_stavu()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      or old.advance_invoice_id is distinct from new.advance_invoice_id
      or old.advance_amount is distinct from new.advance_amount) then
    perform public.prepocitaj_uhrady_prijatej(new.id);
  end if;
  return null;
end $function$;

drop trigger if exists purchase_invoices_uhrady_zo_stavu on public.purchase_invoices;
create trigger purchase_invoices_uhrady_zo_stavu
  after insert or update of status, amount_total, advance_invoice_id, advance_amount on public.purchase_invoices
  for each row execute function public.uhrady_prijatej_zo_stavu();
