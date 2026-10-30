-- Hláška zámku podľa programu, do ktorého doklad naozaj odišiel.
-- Export faktúr nejde len do Pohody (Money, Omega, Flexi, MRP, ISDOC, CSV…);
-- „odovzdaná do Pohody“ pri faktúre poslanej do Money mätie. Texty sú
-- doslovne tie isté ako `hlaskaZamkuFaktury` v src/lib/faktero/odovzdanie-exportu.ts.

create or replace function public.nazov_programu_exportu(_format text)
returns text
language sql
immutable
set search_path = public
as $$
  select case _format
    when 'omega_txt' then 'KROS Omega'
    when 'omega_eud' then 'KROS Omega'
    when 'money_s3_xml' then 'Money S3'
    when 'money_s3_uct' then 'Money S3'
    when 'flexi_xml' then 'ABRA Flexi'
    when 'flexi_uct' then 'ABRA Flexi'
    when 'mrp_xml' then 'MRP-K/S'
    when 'mrp_uct' then 'MRP-K/S'
    when 'datev_extf' then 'DATEV'
    when 'isdoc_zip' then 'ISDOC'
    when 'bis_zip' then 'Peppol BIS'
    when 'csv_univerzal' then 'súpiska CSV'
    when 'csv_uct' then 'súpiska CSV'
    else null
  end
$$;
revoke all on function public.nazov_programu_exportu(text) from public, anon;
grant execute on function public.nazov_programu_exportu(text) to authenticated, service_role;

-- Hláška zámku vydanej faktúry podľa posledného úspešného exportu.
create or replace function public.hlaska_zamku_faktury(_invoice uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  _nazov text;
begin
  select public.nazov_programu_exportu(j.format) into _nazov
    from public.export_logs l
    join public.export_jobs j on j.id = l.export_job_id
   where l.invoice_id = _invoice and l.status = 'ok'
   order by l.created_at desc
   limit 1;
  if _nazov is null then
    return 'Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.';
  end if;
  return 'Faktúra už bola odovzdaná do účtovníctva (' || _nazov || ') — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.';
end
$$;
revoke all on function public.hlaska_zamku_faktury(uuid) from public, anon;
grant execute on function public.hlaska_zamku_faktury(uuid) to authenticated, service_role;

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
  _msg text;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if old.exported_at is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  _msg := public.hlaska_zamku_faktury(old.id);
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

create or replace function public.zamok_polozky_odovzdanej_faktury()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _s text;
  _stare jsonb;
  _nove jsonb;
  _odovzdana uuid;
  _msg text;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select i.id into _odovzdana from public.invoices i
   where i.exported_at is not null
     and i.id in (case when tg_op <> 'INSERT' then old.invoice_id end, case when tg_op <> 'DELETE' then new.invoice_id end)
   limit 1;
  if _odovzdana is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  _msg := public.hlaska_zamku_faktury(_odovzdana);
  if tg_op in ('INSERT', 'DELETE') then
    raise exception '%', _msg using errcode = 'P0001', detail = 'polozky';
  end if;
  _stare := to_jsonb(old);
  _nove := to_jsonb(new);
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      raise exception '%', _msg using errcode = 'P0001', detail = 'polozky.' || _s;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.zamok_polozky_odovzdanej_faktury() from public, anon;

-- Prijaté faktúry a bločky: program podľa dávky, v ktorej odišli (export_job_id).
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
  _nazov text;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if old.exported_at is not null and (_stare ->> 'export_job_id') is not null then
    select public.nazov_programu_exportu(j.format) into _nazov
      from public.export_jobs j where j.id = (_stare ->> 'export_job_id')::uuid;
  end if;
  if tg_op = 'DELETE' then
    if old.exported_at is not null then
      if _nazov is not null then
        raise exception 'Doklad je odovzdaný do účtovníctva (%) — najprv ho vráťte, potom ho zmažte.', _nazov using errcode = 'P0001', detail = '_zmazanie';
      end if;
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
      if _odovzdany and _nazov is not null then
        raise exception 'Doklad je odovzdaný do účtovníctva (%) — najprv ho vráťte (%).', _nazov, _s using errcode = 'P0001';
      elsif _odovzdany then
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
