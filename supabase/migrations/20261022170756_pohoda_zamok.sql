-- Aplikované po častiach (pohoda_zamok_* od 20261022170756); funkcie s rovnakým telom, hlášky cez premennú _msg.
-- NEAPLIKOVANÉ — zámok dokladov odovzdaných do Pohody (audit exportov 22. 10. 2026).
-- Aplikovať cez MCP a súbor potom premenovať podľa zapísanej verzie.
--
-- Zoznamy polí sú zhodné so `src/lib/faktero/pohoda-zamok.ts` (ZAMOK_FAKTURY,
-- ZAMOK_POLOZKY_FAKTURY, ZAMOK_PRIJATEJ, ZAMOK_DOKLADU, HISTORIA_FAKTURY) —
-- test `pohoda-zamok.test.ts` to kontroluje. Pole pridané tam patrí aj sem.
--
-- Servisný kľúč a databázové funkcie (security definer, napr. prepočet
-- `invoices.exported_at` z `export_logs`) zámok nepúta: kontroluje sa len
-- zápis rolou `authenticated`/`anon`. Spúšťače preto nie sú security definer
-- — `current_user` v nich je ten, kto zápis robí.

/* ------------------------------------------------------------------ 1) vydané faktúry */

create or replace function public.zamok_odovzdanej_faktury()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _s text;
  _stare jsonb := to_jsonb(old);
  _nove jsonb;
  _storno boolean := false;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if old.exported_at is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.'
      using errcode = 'P0001', detail = '_zmazanie';
  end if;
  _nove := to_jsonb(new);
  -- Odovzdanie ruší len vrátenie (export_logs → spúšťač), nie priamy zápis.
  if new.exported_at is distinct from old.exported_at then
    raise exception 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.'
      using errcode = 'P0001', detail = 'exported_at';
  end if;
  -- Storno sa smie, keď Pohoda import potvrdila: stornujúci doklad tam potom
  -- pošle konektor alebo balík (nacitajStorna).
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    _storno := exists (
      select 1 from public.export_logs l
       where l.invoice_id = old.id and l.status = 'ok' and l.pohoda_cislo is not null
    );
  end if;
  foreach _s in array tg_argv loop
    if _storno and _s = 'cancelled_at' then continue; end if;
    if (_stare -> _s) is distinct from (_nove -> _s) then
      raise exception 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.'
        using errcode = 'P0001', detail = _s;
    end if;
  end loop;
  if not _storno and new.status is distinct from old.status
     and (new.status in ('cancelled', 'draft') or old.status = 'cancelled') then
    raise exception 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.'
      using errcode = 'P0001', detail = 'status';
  end if;
  return new;
end
$$;
revoke all on function public.zamok_odovzdanej_faktury() from public, anon;

drop trigger if exists invoices_zamok_odovzdania on public.invoices;
create trigger invoices_zamok_odovzdania
  before update or delete on public.invoices
  for each row execute function public.zamok_odovzdanej_faktury(
    'type', 'invoice_number', 'number_series_id', 'sequence_number', 'variable_symbol', 'constant_symbol',
    'specific_symbol', 'order_number', 'issue_date', 'delivery_date', 'due_date', 'customer_id',
    'customer_name', 'customer_street', 'customer_city', 'customer_zip', 'customer_country', 'customer_ico',
    'customer_dic', 'customer_ic_dph', 'customer_email', 'subtotal', 'vat_total', 'total', 'subtotal_eur',
    'vat_total_eur', 'total_eur', 'discount_total', 'discount_type', 'discount_value', 'rounding_mode',
    'advance_invoice_id', 'advance_amount', 'reverse_charge', 'reverse_charge_type', 'eu_plnenie', 'oss',
    'oss_country', 'osobitna_uprava', 'oprava_25a', 'opravuje_fakturu_id', 'currency', 'exchange_rate',
    'exchange_rate_date', 'intro_note', 'notes', 'payment_method', 'pohoda_predkontacia',
    'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'cancelled_at', 'deleted_at'
  );

create or replace function public.zamok_polozky_odovzdanej_faktury()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _s text;
  _stare jsonb;
  _nove jsonb;
  _odovzdana boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select exists (
    select 1 from public.invoices i
     where i.exported_at is not null
       and i.id in (
         case when tg_op <> 'INSERT' then old.invoice_id end,
         case when tg_op <> 'DELETE' then new.invoice_id end
       )
  ) into _odovzdana;
  if not _odovzdana then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op in ('INSERT', 'DELETE') then
    raise exception 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.'
      using errcode = 'P0001', detail = 'polozky';
  end if;
  _stare := to_jsonb(old);
  _nove := to_jsonb(new);
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      raise exception 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.'
        using errcode = 'P0001', detail = 'polozky.' || _s;
    end if;
  end loop;
  return new;
end
$$;
revoke all on function public.zamok_polozky_odovzdanej_faktury() from public, anon;

drop trigger if exists invoice_items_zamok_odovzdania on public.invoice_items;
create trigger invoice_items_zamok_odovzdania
  before insert or update or delete on public.invoice_items
  for each row execute function public.zamok_polozky_odovzdanej_faktury(
    'invoice_id', 'position', 'name', 'description', 'quantity', 'unit', 'unit_price', 'discount_percent',
    'vat_rate', 'subtotal', 'vat_amount', 'total', 'prenesenie', 'colny_kod', 'krajina_povodu',
    'hmotnost_kg', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie'
  );

/* ---------------------------------------------- 2) prijaté faktúry a bločky */

create or replace function public.zamok_odovzdaneho_dokladu()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  _stlpce text[] := tg_argv;
  _s text;
  _stare jsonb := to_jsonb(old);
  _nove jsonb;
  _odovzdany boolean;
  _zamknuty boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- Bločky sa mažú natvrdo — odovzdaný doklad by v Pohode ostal bez páru.
  if tg_op = 'DELETE' then
    if old.exported_at is not null then
      raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody, potom ho zmažte.'
        using errcode = 'P0001', detail = '_zmazanie';
    end if;
    return old;
  end if;
  _nove := to_jsonb(new);
  -- Zmena, ktorá zároveň ruší odovzdanie, je „Vrátiť z Pohody“ a prejde.
  _odovzdany := old.exported_at is not null and new.exported_at is not null;
  _zamknuty := (_stare ->> 'locked_at') is not null and (_nove ->> 'locked_at') is not null;
  if not _odovzdany and not _zamknuty then
    return new;
  end if;
  foreach _s in array _stlpce loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      if _odovzdany then
        raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody (%).', _s
          using errcode = 'P0001';
      else
        raise exception 'Doklad je zamknutý — najprv ho odomknite (%).', _s
          using errcode = 'P0001';
      end if;
    end if;
  end loop;
  return new;
end
$function$;
revoke all on function public.zamok_odovzdaneho_dokladu() from public, anon;

drop trigger if exists expense_documents_zamok_odovzdania on public.expense_documents;
create trigger expense_documents_zamok_odovzdania
  before update or delete on public.expense_documents
  for each row execute function public.zamok_odovzdaneho_dokladu(
    'supplier_name', 'supplier_ico', 'supplier_ic_dph', 'document_number', 'issue_date', 'total_amount',
    'vat_amount', 'net_amount', 'vat_rate', 'vat_breakdown', 'items', 'currency', 'payment_method',
    'odpocet', 'note', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'rozuctovanie',
    'stredisko', 'cinnost', 'pohoda_rad', 'pohoda_pokladna', 'vyuctovanie_id', 'job_id', 'category'
  );

drop trigger if exists purchase_invoices_zamok_odovzdania on public.purchase_invoices;
create trigger purchase_invoices_zamok_odovzdania
  before update or delete on public.purchase_invoices
  for each row execute function public.zamok_odovzdaneho_dokladu(
    'type', 'invoice_number', 'variable_symbol', 'constant_symbol', 'specific_symbol', 'order_number',
    'delivery_note_number', 'opravuje_cislo', 'issue_date', 'delivery_date', 'due_date', 'supplier_name',
    'supplier_ico', 'supplier_dic', 'supplier_ic_dph', 'supplier_street', 'supplier_city', 'supplier_zip',
    'supplier_country', 'supplier_iban', 'amount_without_vat', 'vat_amount', 'amount_total',
    'discount_total', 'items', 'currency', 'exchange_rate', 'dph_rezim', 'reverse_charge', 'odpocet',
    'payment_method', 'intro_note', 'note', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie',
    'rozuctovanie', 'stredisko', 'cinnost', 'pohoda_rad', 'job_id', 'category', 'deleted_at'
  );

/* ----------------------------------------------- 3) história vydaných faktúr */

alter table public.historia_dokladov drop constraint if exists historia_dokladov_agenda_check;
alter table public.historia_dokladov
  add constraint historia_dokladov_agenda_check check (agenda in ('prijata', 'doklad', 'faktura'));

create or replace function public.zapis_historiu_dokladu()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _stare jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  _nove jsonb := to_jsonb(new);
  _agenda text := case tg_table_name
                    when 'purchase_invoices' then 'prijata'
                    when 'invoices' then 'faktura'
                    else 'doklad' end;
  _s text;
begin
  if tg_op = 'INSERT' then
    insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto)
    values (new.company_id, _agenda, new.id, '_vytvoreny', null, null, coalesce(auth.uid(), (_nove ->> 'created_by')::uuid));
    return new;
  end if;
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto)
      values (new.company_id, _agenda, new.id, _s, _stare -> _s, _nove -> _s, auth.uid());
    end if;
  end loop;
  return new;
end
$function$;
revoke all on function public.zapis_historiu_dokladu() from public, anon;

drop trigger if exists invoices_historia on public.invoices;
create trigger invoices_historia
  after insert or update on public.invoices
  for each row execute function public.zapis_historiu_dokladu(
    'invoice_number', 'type', 'issue_date', 'delivery_date', 'due_date', 'customer_name', 'customer_ico',
    'customer_ic_dph', 'subtotal', 'vat_total', 'total', 'currency', 'exchange_rate', 'reverse_charge',
    'variable_symbol', 'status', 'sent_at', 'paid_at', 'pohoda_predkontacia', 'pohoda_clenenie_dph',
    'kv_clenenie', 'zauctovane_at', 'exported_at', 'deleted_at'
  );

/* ------------------------------------------- 4) verzia opravy pre Pohodu */

-- Pohoda kontroluje duplicitu podľa id položky dávky (data.xsd). Opravený
-- doklad po „Vrátiť z Pohody“ preto ide ako `id-verzia`; verziu zvyšuje
-- vrátenie (vratenie.functions.ts, zauctovanie.functions.ts).
alter table public.invoices add column if not exists pohoda_verzia integer not null default 0;
alter table public.purchase_invoices add column if not exists pohoda_verzia integer not null default 0;
alter table public.expense_documents add column if not exists pohoda_verzia integer not null default 0;
comment on column public.invoices.pohoda_verzia is 'Koľkokrát bola faktúra vrátená z Pohody — do dávky ide ako id-verzia (kontrola duplicity Pohody).';
comment on column public.purchase_invoices.pohoda_verzia is 'Koľkokrát bol doklad vrátený z Pohody — do dávky ide ako id-verzia.';
comment on column public.expense_documents.pohoda_verzia is 'Koľkokrát bol doklad vrátený z Pohody — do dávky ide ako id-verzia.';
