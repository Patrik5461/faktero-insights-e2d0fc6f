-- Bezpečnostný audit 2026-10-09: majiteľa chráni databáza, logy a pozvánky len pre správcov,
-- šablóny e-mailov mení len správca.

create or replace function public.chran_majitela()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _ja uuid := auth.uid();
  _firma uuid := coalesce(new.company_id, old.company_id);
  _moja_rola text;
begin
  -- Server (servisný kľúč) si oprávnenia stráži v kóde; kaskády pri mazaní firmy
  -- alebo účtu idú hlbšie než prvá úroveň spúšťačov.
  if _ja is null or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  select role into _moja_rola from company_users where company_id = _firma and user_id = _ja;

  if tg_op = 'INSERT' then
    if new.role = 'owner' and coalesce(_moja_rola, '') <> 'owner'
       and exists (select 1 from company_users where company_id = new.company_id) then
      raise exception 'Majiteľa môže pridať len majiteľ firmy.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or new.user_id is distinct from old.user_id then
      raise exception 'Člena nemožno presunúť do inej firmy ani na iný účet.' using errcode = '42501';
    end if;
    if (old.role = 'owner' or new.role = 'owner') and new.role is distinct from old.role
       and coalesce(_moja_rola, '') <> 'owner' then
      raise exception 'Rolu majiteľa môže meniť len majiteľ firmy.' using errcode = '42501';
    end if;
    if old.role = 'owner' and new.role <> 'owner'
       and not exists (select 1 from company_users where company_id = old.company_id
                       and role = 'owner' and user_id <> old.user_id) then
      raise exception 'Firma musí mať aspoň jedného majiteľa.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE
  if old.role = 'owner' then
    if coalesce(_moja_rola, '') <> 'owner' then
      raise exception 'Majiteľa môže odobrať len majiteľ firmy.' using errcode = '42501';
    end if;
    if not exists (select 1 from company_users where company_id = old.company_id
                   and role = 'owner' and user_id <> old.user_id) then
      raise exception 'Firma musí mať aspoň jedného majiteľa.' using errcode = '42501';
    end if;
  end if;
  return old;
end;
$$;

revoke all on function public.chran_majitela() from public, anon, authenticated;

drop trigger if exists trg_chran_majitela on public.company_users;
create trigger trg_chran_majitela
  before insert or update or delete on public.company_users
  for each row execute function public.chran_majitela();

-- Logy API a webhookov nesú telá požiadaviek a odpovedí — len pre majiteľa a admina.
drop policy if exists "Members read api logs" on public.api_logs;
create policy "Spravca cita api logy" on public.api_logs for select to authenticated
  using (company_id is not null and is_company_admin(company_id, (select auth.uid())));

drop policy if exists "Members read webhook logs" on public.webhook_logs;
create policy "Spravca cita webhook logy" on public.webhook_logs for select to authenticated
  using (is_company_admin(company_id, (select auth.uid())));

drop policy if exists "Members read webhook delivery logs" on public.webhook_delivery_logs;
create policy "Spravca cita dorucenia webhookov" on public.webhook_delivery_logs for select to authenticated
  using (is_company_admin(company_id, (select auth.uid())));

-- Šablóna mailu ide zákazníkom firmy (text, platobné údaje) — meniť ju smie len správca.
drop policy if exists "Members can insert email templates" on public.email_templates;
drop policy if exists "Members can update email templates" on public.email_templates;
drop policy if exists "Members can delete email templates" on public.email_templates;
create policy "Spravca pridava sablony" on public.email_templates for insert to authenticated
  with check (is_company_admin(company_id, (select auth.uid())));
create policy "Spravca upravuje sablony" on public.email_templates for update to authenticated
  using (is_company_admin(company_id, (select auth.uid())))
  with check (is_company_admin(company_id, (select auth.uid())));
create policy "Spravca maze sablony" on public.email_templates for delete to authenticated
  using (is_company_admin(company_id, (select auth.uid())));

-- Pozvánka nesie token — kto ho uvidí, môže sa ním prihlásiť. Vidí ich len správca.
drop policy if exists "Company members can view invitations" on public.company_invitations;
create policy "Spravca vidi pozvanky" on public.company_invitations for select to authenticated
  using (is_company_admin(company_id, (select auth.uid())));

-- Členská UPDATE politika nemala WITH CHECK.
drop policy if exists "Admins manage members" on public.company_users;
create policy "Admins manage members" on public.company_users for update to authenticated
  using (is_company_admin(company_id, (select auth.uid())))
  with check (is_company_admin(company_id, (select auth.uid())));
