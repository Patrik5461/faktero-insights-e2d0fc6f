-- História dokladov: kto + kedy pri každej udalosti (požiadavka 2026-11-03).
--
-- Nadväzuje na `historia_dokladov` (20261007215206) a „kto nahral / zaúčtoval“
-- (20261102112809). Čo pribudlo:
--
--   kto_typ / kto_popis  — kto zmenu urobil, keď to nie je prihlásený človek:
--       clovek   prihlásený člen (web)                       kto = auth.uid()
--       appka    prihlásený člen z mobilnej appky            kto = auth.uid()
--                (appka posiela v X-Client-Info „faktero-appka“)
--       api      API kľúč (server pošle hlavičku x-faktero-zdroj: api:<id kľúča>),
--                kto_popis = názov kľúča
--       automat  autopilot zaúčtovania (servisný kľúč, zauctovanie_zdroj
--                pravidlo/zvyk/ai), kto_popis = zdroj
--       mail / import / efaktura — doklad zapísal server (e-mail, import, eFaktúra);
--                kto_popis pri maile = odosielateľ
--       system   iný zápis servera bez človeka
--     Pri človeku môže byť kto_popis = pravidlo/zvyk/ai: zaúčtovanie urobilo
--     pravidlo pri jeho zápise. Hlavičky x-faktero-zdroj / x-faktero-kto platia
--     len pre servisný kľúč (bez auth.uid()) — prihlásený človek si nimi
--     nič nepripíše.
--   agenda 'ostatny'     — história ostatných dokladov (listy, predpisy…)
--   pole '_platba'       — spárovanie / zrušenie spárovania s bankovým pohybom
--                          (pred/po = {suma, mena, datum, protistrana})
--   pole 'items'         — položky sa ukladajú zhrnuté {pocet, suma}
--   + sledované polia: položky, rozúčtovanie, typ, dátum prijatia, IČ DPH,
--     stredisko/činnosť a storno pri vystavených
--   Pri zápise dokladu už zaúčtovaného (pravidlo pri vložení) sa zapíše aj
--   zaúčtovanie a jeho kódy.
--
-- Rozhranie (HistoriaDokladu.tsx) skladá riadky jedného zápisu (rovnaký čas
-- transakcie a autor) do jednej udalosti. Staré riadky bez kto_typ ostávajú
-- platné (kto != null = človek). Migrácia je idempotentná.

/* ------------------------------------------------------------- 1) tabuľka */

alter table public.historia_dokladov add column if not exists kto_typ text;
alter table public.historia_dokladov add column if not exists kto_popis text;
alter table public.historia_dokladov drop constraint if exists historia_dokladov_kto_typ_check;
alter table public.historia_dokladov add constraint historia_dokladov_kto_typ_check
  check (kto_typ is null or kto_typ in ('clovek', 'appka', 'api', 'automat', 'mail', 'import', 'efaktura', 'system'));

alter table public.historia_dokladov drop constraint if exists historia_dokladov_agenda_check;
alter table public.historia_dokladov
  add constraint historia_dokladov_agenda_check check (agenda in ('prijata', 'doklad', 'faktura', 'ostatny'));

comment on column public.historia_dokladov.kto_typ is
  'clovek | appka | api | automat | mail | import | efaktura | system — kto zmenu urobil (null pri starých riadkoch: kto != null = človek).';
comment on column public.historia_dokladov.kto_popis is
  'Názov API kľúča, odosielateľ e-mailu, zdroj automatu (pravidlo/zvyk/ai) alebo cesta odovzdania.';

/* -------------------------------------------------- 2) kto zmenu urobil */

create or replace function public.faktero_kto_historie(
  _nove jsonb, _stare jsonb, _vlozenie boolean,
  out kto uuid, out typ text, out popis text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _hl jsonb;
  _z text;
  _zdroj text := _nove ->> 'zauctovanie_zdroj';
  _automat boolean := (_nove ->> 'zauctovanie_zdroj') in ('pravidlo', 'zvyk', 'ai');
  _job uuid;
begin
  begin
    _hl := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    _hl := null;
  end;
  _hl := coalesce(_hl, '{}'::jsonb);

  -- Prihlásený človek (web alebo appka).
  if _uid is not null then
    kto := _uid;
    typ := case when coalesce(_hl ->> 'x-client-info', '') like '%faktero-appka%' then 'appka' else 'clovek' end;
    -- Zaúčtovanie pri jeho zápise urobilo pravidlo / zvyk.
    if _automat and (
         (_vlozenie and _nove ->> 'zauctovane_at' is not null)
         or (not _vlozenie and (_stare -> 'zauctovanie_zdroj') is distinct from (_nove -> 'zauctovanie_zdroj'))) then
      popis := _zdroj;
    end if;
    return;
  end if;

  -- Server: API kľúč alebo zápis v mene človeka.
  _z := _hl ->> 'x-faktero-zdroj';
  if _z ~ '^api:[0-9a-fA-F-]{36}$' then
    typ := 'api';
    select k.name into popis from public.api_keys k where k.id = substr(_z, 5)::uuid;
    return;
  end if;
  _z := _hl ->> 'x-faktero-kto';
  if _z ~ '^[0-9a-fA-F-]{36}$' then
    kto := _z::uuid;
    typ := 'clovek';
    return;
  end if;

  if _vlozenie then
    if coalesce(_nove ->> 'odosielatel_mailu', '') <> '' or _nove ->> 'inbox_message_id' is not null
       or _nove ->> 'source' = 'mail' then
      typ := 'mail';
      popis := nullif(_nove ->> 'odosielatel_mailu', '');
      kto := (_nove ->> 'created_by')::uuid;
    elsif _nove ->> 'source' = 'api' then
      typ := 'api';
    elsif _nove ->> 'source' = 'efaktura' then
      typ := 'efaktura';
    elsif _nove ->> 'source' = 'import' or coalesce(_nove ->> 'import_source', '') <> '' then
      typ := 'import';
    elsif _nove ->> 'created_by' is not null then
      kto := (_nove ->> 'created_by')::uuid;
      typ := 'clovek';
    else
      typ := 'system';
    end if;
    return;
  end if;

  -- Zaúčtovanie serverom: človek, ktorého server zapísal, alebo automat.
  if (_nove -> 'naposledy_zauctovane_at') is distinct from (_stare -> 'naposledy_zauctovane_at')
     and _nove ->> 'naposledy_zauctovane_at' is not null then
    if _nove ->> 'naposledy_zauctoval' is not null then
      kto := (_nove ->> 'naposledy_zauctoval')::uuid;
      typ := 'clovek';
      return;
    elsif _automat then
      typ := 'automat';
      popis := _zdroj;
      return;
    end if;
  end if;

  -- Odovzdanie serverom: kto spustil dávku (export_jobs.created_by), cesta do popisu.
  if (_nove -> 'exported_at') is distinct from (_stare -> 'exported_at') and _nove ->> 'exported_at' is not null then
    popis := _nove ->> 'export_cesta';
    begin
      _job := (_nove ->> 'export_job_id')::uuid;
    exception when others then
      _job := null;
    end;
    if _job is not null then
      select j.created_by into kto from public.export_jobs j where j.id = _job;
    end if;
    typ := case when kto is not null then 'clovek' else 'system' end;
    return;
  end if;

  typ := 'system';
end
$function$;
revoke all on function public.faktero_kto_historie(jsonb, jsonb, boolean) from public, anon, authenticated;

/* Položky sa do histórie ukladajú zhrnuté — počet riadkov a súčet. */
create or replace function public.faktero_suhrn_poloziek(_p jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select case when jsonb_typeof(_p) = 'array' then
    jsonb_build_object(
      'pocet', jsonb_array_length(_p),
      'suma', (select round(sum(case when (e ->> 'total') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e ->> 'total')::numeric end), 2)
                 from jsonb_array_elements(_p) e))
  end
$function$;
revoke all on function public.faktero_suhrn_poloziek(jsonb) from public, anon;

/* ------------------------------------------------- 3) zápis histórie */

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
                    when 'other_documents' then 'ostatny'
                    else 'doklad' end;
  _k record;
  _s text;
  _pred jsonb;
  _po jsonb;
begin
  -- Hromadné úpravy bez sledovanej zmeny nič nepočítajú.
  if tg_op = 'UPDATE' and not exists (
       select 1 from unnest(tg_argv) a(s) where (_stare -> a.s) is distinct from (_nove -> a.s)) then
    return new;
  end if;

  select * into _k from public.faktero_kto_historie(_nove, _stare, tg_op = 'INSERT');

  if tg_op = 'INSERT' then
    insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
    values (new.company_id, _agenda, new.id, '_vytvoreny', null, null,
            coalesce(_k.kto, (_nove ->> 'created_by')::uuid), _k.typ, _k.popis);
    -- Doklad zapísaný rovno zaúčtovaný (pravidlo pri vložení, import): zaúčtovanie a kódy.
    if _nove ->> 'zauctovane_at' is not null then
      foreach _s in array array['zauctovane_at', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie'] loop
        if _s = any(tg_argv) and _nove ->> _s is not null then
          insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
          values (new.company_id, _agenda, new.id, _s, null, _nove -> _s,
                  coalesce(_k.kto, (_nove ->> 'zauctoval')::uuid),
                  case when _k.typ in ('clovek', 'appka', 'api') or _nove ->> 'zauctoval' is not null then coalesce(_k.typ, 'clovek')
                       when (_nove ->> 'zauctovanie_zdroj') in ('pravidlo', 'zvyk', 'ai') then 'automat'
                       else _k.typ end,
                  coalesce(_k.popis, case when (_nove ->> 'zauctovanie_zdroj') in ('pravidlo', 'zvyk', 'ai')
                                          then _nove ->> 'zauctovanie_zdroj' end));
        end if;
      end loop;
    end if;
    return new;
  end if;

  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      _pred := _stare -> _s;
      _po := _nove -> _s;
      if _s = 'items' then
        _pred := public.faktero_suhrn_poloziek(_pred);
        _po := public.faktero_suhrn_poloziek(_po);
      end if;
      insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
      values (new.company_id, _agenda, new.id, _s, _pred, _po, _k.kto, _k.typ, _k.popis);
    end if;
  end loop;
  return new;
end
$function$;
revoke all on function public.zapis_historiu_dokladu() from public, anon;

drop trigger if exists purchase_invoices_historia on public.purchase_invoices;
create trigger purchase_invoices_historia
  after insert or update on public.purchase_invoices
  for each row execute function public.zapis_historiu_dokladu(
    'type', 'invoice_number', 'supplier_name', 'supplier_ico', 'supplier_ic_dph', 'supplier_iban',
    'issue_date', 'delivery_date', 'due_date', 'received_date',
    'amount_without_vat', 'vat_amount', 'amount_total', 'currency', 'variable_symbol', 'payment_method',
    'items', 'status', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'rozuctovanie',
    'stredisko', 'cinnost', 'job_id', 'category', 'note', 'zauctovane_at', 'zauctovanie_zdroj',
    'exported_at', 'locked_at', 'deleted_at', 'stitky', 'odberatel_nesedi');

drop trigger if exists expense_documents_historia on public.expense_documents;
create trigger expense_documents_historia
  after insert or update on public.expense_documents
  for each row execute function public.zapis_historiu_dokladu(
    'supplier_name', 'supplier_ico', 'supplier_ic_dph', 'document_number', 'issue_date',
    'total_amount', 'vat_amount', 'net_amount', 'currency', 'payment_method', 'items', 'status',
    'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'rozuctovanie', 'stredisko',
    'cinnost', 'job_id', 'category', 'note', 'zauctovane_at', 'zauctovanie_zdroj', 'exported_at',
    'locked_at', 'stitky');

drop trigger if exists invoices_historia on public.invoices;
create trigger invoices_historia
  after insert or update on public.invoices
  for each row execute function public.zapis_historiu_dokladu(
    'invoice_number', 'type', 'issue_date', 'delivery_date', 'due_date', 'customer_name', 'customer_ico',
    'customer_ic_dph', 'subtotal', 'vat_total', 'total', 'currency', 'exchange_rate', 'reverse_charge',
    'variable_symbol', 'status', 'sent_at', 'paid_at', 'pohoda_predkontacia', 'pohoda_clenenie_dph',
    'kv_clenenie', 'stredisko', 'cinnost', 'zauctovane_at', 'zauctovanie_zdroj', 'exported_at',
    'cancelled_at', 'deleted_at');

drop trigger if exists other_documents_historia on public.other_documents;
create trigger other_documents_historia
  after insert or update on public.other_documents
  for each row execute function public.zapis_historiu_dokladu(
    'kind', 'sender', 'subject', 'received_date', 'amount', 'currency', 'due_date', 'note', 'status',
    'employee_id', 'financing_contract_id', 'priecinok', 'exported_at', 'stitky');

/* ----------------------------------- 4) spárovanie s bankovým pohybom */

create or replace function public.faktero_historia_platby()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _k record;
  _info jsonb := jsonb_build_object('suma', new.amount, 'mena', new.currency,
                                    'datum', new.booking_date, 'protistrana', new.counterparty);
  _stare uuid;
  _nove uuid;
  _agenda text;
  _i int;
begin
  select * into _k from public.faktero_kto_historie('{}'::jsonb, '{}'::jsonb, false);
  for _i in 1..3 loop
    _agenda := (array['faktura', 'prijata', 'doklad'])[_i];
    _nove := case _i when 1 then new.matched_invoice_id when 2 then new.matched_purchase_invoice_id else new.matched_expense_id end;
    _stare := case when tg_op = 'INSERT' then null
                   else case _i when 1 then old.matched_invoice_id when 2 then old.matched_purchase_invoice_id else old.matched_expense_id end end;
    if _stare is distinct from _nove then
      if _stare is not null then
        insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
        values (new.company_id, _agenda, _stare, '_platba', _info, null, _k.kto, _k.typ, _k.popis);
      end if;
      if _nove is not null then
        insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
        values (new.company_id, _agenda, _nove, '_platba', null, _info, _k.kto, _k.typ, _k.popis);
      end if;
    end if;
  end loop;
  return new;
end
$function$;
revoke all on function public.faktero_historia_platby() from public, anon, authenticated;

drop trigger if exists bank_transactions_historia_vlozenie on public.bank_transactions;
create trigger bank_transactions_historia_vlozenie
  after insert on public.bank_transactions
  for each row
  when (new.matched_invoice_id is not null or new.matched_purchase_invoice_id is not null or new.matched_expense_id is not null)
  execute function public.faktero_historia_platby();
drop trigger if exists bank_transactions_historia_parovanie on public.bank_transactions;
create trigger bank_transactions_historia_parovanie
  after update of matched_invoice_id, matched_purchase_invoice_id, matched_expense_id on public.bank_transactions
  for each row
  when (old.matched_invoice_id is distinct from new.matched_invoice_id
        or old.matched_purchase_invoice_id is distinct from new.matched_purchase_invoice_id
        or old.matched_expense_id is distinct from new.matched_expense_id)
  execute function public.faktero_historia_platby();
