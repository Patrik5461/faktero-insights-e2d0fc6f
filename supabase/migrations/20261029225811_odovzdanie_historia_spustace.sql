-- História odovzdania a „Opraviť zaúčtovanie“ (P-1008, P-1009) — 3/3: spúšťače.

/* ------------------------------------------------------------------ 4) spúšťač histórie */

create or replace function public.faktero_historia_odovzdania()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _job uuid;
begin
  if tg_op = 'INSERT' then
    new.prvy_export_at := null;
    new.pocet_exportov := 0;
    new.export_cesta := null;
    new.vratene_z_pohody_at := null;
    new.oprava_zauctovania_at := null;
    new.oprava_zauctovania_povodne := null;
  else
    -- História sa píše len tu — zápis z aplikácie ju neprepíše.
    new.prvy_export_at := old.prvy_export_at;
    new.pocet_exportov := old.pocet_exportov;
    new.export_cesta := old.export_cesta;
    new.vratene_z_pohody_at := old.vratene_z_pohody_at;
  end if;

  -- Odovzdanie (aj opakované po vrátení).
  if new.exported_at is not null and (tg_op = 'INSERT' or old.exported_at is null) then
    if tg_table_name = 'invoices' then
      select l.export_job_id into _job
        from public.export_logs l
       where l.invoice_id = new.id and l.status = 'ok'
       order by l.created_at desc
       limit 1;
    else
      _job := (to_jsonb(new) ->> 'export_job_id')::uuid;
    end if;
    new.prvy_export_at := coalesce(new.prvy_export_at, new.exported_at);
    new.pocet_exportov := coalesce(new.pocet_exportov, 0) + 1;
    new.export_cesta := public.faktero_cesta_odovzdania(_job);
    new.vratene_z_pohody_at := null;
    new.oprava_zauctovania_at := null;
    new.oprava_zauctovania_povodne := null;
  end if;

  -- Vrátenie z Pohody: odznak ostáva, len sa zmení na „vrátené na opravu“.
  if tg_op = 'UPDATE' and old.exported_at is not null and new.exported_at is null then
    new.vratene_z_pohody_at := now();
    new.oprava_zauctovania_at := null;
    new.oprava_zauctovania_povodne := null;
  end if;

  -- Oprava zaúčtovania len pri odovzdanom doklade.
  if new.exported_at is null then
    new.oprava_zauctovania_at := null;
    new.oprava_zauctovania_povodne := null;
  end if;
  return new;
end
$$;
revoke all on function public.faktero_historia_odovzdania() from public, anon;

drop trigger if exists invoices_historia_odovzdania on public.invoices;
create trigger invoices_historia_odovzdania
  before insert or update on public.invoices
  for each row execute function public.faktero_historia_odovzdania();
drop trigger if exists purchase_invoices_historia_odovzdania on public.purchase_invoices;
create trigger purchase_invoices_historia_odovzdania
  before insert or update on public.purchase_invoices
  for each row execute function public.faktero_historia_odovzdania();
drop trigger if exists expense_documents_historia_odovzdania on public.expense_documents;
create trigger expense_documents_historia_odovzdania
  before insert or update on public.expense_documents
  for each row execute function public.faktero_historia_odovzdania();

/* ------------------------------------------------------------------ 5) zámok: výnimka pre opravu zaúčtovania */

-- Rovnaké telo ako v 20261022170756_pohoda_zamok; pribudla len výnimka
-- `_oprava` pre zaúčtovacie polia (POLIA_OPRAVY_ZAUCTOVANIA v pohoda-zamok.ts).
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
  _oprava boolean := false;
  _polia_opravy text[] := array['pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'int_poznamka'];
  _msg text := 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.';
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
    raise exception '%', _msg using errcode = 'P0001', detail = '_zmazanie';
  end if;
  _nove := to_jsonb(new);
  if new.exported_at is distinct from old.exported_at then
    raise exception '%', _msg using errcode = 'P0001', detail = 'exported_at';
  end if;
  -- „Opraviť zaúčtovanie“ pustí len zaúčtovacie polia.
  _oprava := (_nove ->> 'oprava_zauctovania_at') is not null;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    _storno := exists (select 1 from public.export_logs l where l.invoice_id = old.id and l.status = 'ok' and l.pohoda_cislo is not null);
  end if;
  foreach _s in array tg_argv loop
    if _storno and _s = 'cancelled_at' then continue; end if;
    if _oprava and _s = any(_polia_opravy) then continue; end if;
    if (_stare -> _s) is distinct from (_nove -> _s) then
      raise exception '%', _msg using errcode = 'P0001', detail = _s;
    end if;
  end loop;
  if not _storno and new.status is distinct from old.status
     and (new.status in ('cancelled', 'draft') or old.status = 'cancelled') then
    raise exception '%', _msg using errcode = 'P0001', detail = 'status';
  end if;
  return new;
end
$$;
revoke all on function public.zamok_odovzdanej_faktury() from public, anon;

create or replace function public.zamok_odovzdaneho_dokladu()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _stlpce text[] := tg_argv;
  _s text;
  _stare jsonb := to_jsonb(old);
  _nove jsonb;
  _odovzdany boolean;
  _zamknuty boolean;
  _oprava boolean;
  _polia_opravy text[] := array['pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'int_poznamka'];
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.exported_at is not null then
      raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody, potom ho zmažte.' using errcode = 'P0001', detail = '_zmazanie';
    end if;
    return old;
  end if;
  _nove := to_jsonb(new);
  _odovzdany := old.exported_at is not null and new.exported_at is not null;
  _zamknuty := (_stare ->> 'locked_at') is not null and (_nove ->> 'locked_at') is not null;
  if not _odovzdany and not _zamknuty then
    return new;
  end if;
  -- „Opraviť zaúčtovanie“ pustí len zaúčtovacie polia (zamknutý doklad nie).
  _oprava := _odovzdany and not _zamknuty and (_nove ->> 'oprava_zauctovania_at') is not null;
  foreach _s in array _stlpce loop
    if _oprava and _s = any(_polia_opravy) then continue; end if;
    if (_stare -> _s) is distinct from (_nove -> _s) then
      if _odovzdany then
        raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody (%).', _s using errcode = 'P0001';
      else
        raise exception 'Doklad je zamknutý — najprv ho odomknite (%).', _s using errcode = 'P0001';
      end if;
    end if;
  end loop;
  return new;
end
$$;
revoke all on function public.zamok_odovzdaneho_dokladu() from public, anon;
