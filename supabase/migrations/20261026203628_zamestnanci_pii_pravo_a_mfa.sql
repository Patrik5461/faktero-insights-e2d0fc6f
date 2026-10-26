-- RČ a číslo OP: RPC obchádzalo oblasť „zamestnanci“ (vlastný prístup) aj 2FA.
create or replace function public.employee_get_pii(_employee_id uuid)
 returns table(rodne_cislo text, op_cislo text)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  _company uuid;
  _kluc text := public.employee_pii_key();
begin
  select company_id into _company from public.employees where id = _employee_id;
  if _company is null or not public.is_company_member(_company, auth.uid())
     or not public.mfa_ok()
     or not (_company = any(public.firmy_s_pravom('zamestnanci', false))) then
    raise exception 'Zamestnanec nenájdený';
  end if;
  insert into public.employee_access_log (company_id, employee_id, user_id, action)
    values (_company, _employee_id, auth.uid(), 'view_sensitive');
  return query
    select
      case when e.rodne_cislo_enc is null then null else pgp_sym_decrypt(e.rodne_cislo_enc, _kluc) end,
      case when e.op_cislo_enc is null then null else pgp_sym_decrypt(e.op_cislo_enc, _kluc) end
    from public.employees e where e.id = _employee_id;
end;
$function$;

create or replace function public.employee_set_pii(_employee_id uuid, _rodne_cislo text, _op_cislo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  _company uuid;
  _kluc text := public.employee_pii_key();
begin
  select company_id into _company from public.employees where id = _employee_id;
  if _company is null or not public.is_company_member(_company, auth.uid())
     or not public.mfa_ok()
     or not (_company = any(public.firmy_s_pravom('zamestnanci', true))) then
    raise exception 'Zamestnanec nenájdený';
  end if;
  update public.employees set
    rodne_cislo_enc = case
      when _rodne_cislo is null then rodne_cislo_enc
      when btrim(_rodne_cislo) = '' then null
      else pgp_sym_encrypt(btrim(_rodne_cislo), _kluc) end,
    op_cislo_enc = case
      when _op_cislo is null then op_cislo_enc
      when btrim(_op_cislo) = '' then null
      else pgp_sym_encrypt(btrim(_op_cislo), _kluc) end
  where id = _employee_id;
  insert into public.employee_access_log (company_id, employee_id, user_id, action)
    values (_company, _employee_id, auth.uid(), 'update_sensitive');
end;
$function$;

create or replace function public.employee_pii_present(_employee_id uuid)
 returns table(ma_rodne_cislo boolean, ma_op boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select e.rodne_cislo_enc is not null, e.op_cislo_enc is not null
  from public.employees e
  where e.id = _employee_id
    and public.is_company_member(e.company_id, auth.uid())
    and public.mfa_ok()
    and e.company_id = any(public.firmy_s_pravom('zamestnanci', false));
$function$;
