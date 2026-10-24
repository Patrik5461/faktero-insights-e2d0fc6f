-- Udalosť sa zapíše len vtedy, keď ju firma naozaj odoberá — inak by fronta rástla zbytočne
-- (prvá synchronizácia banky natiahne tisíce pohybov).
create or replace function public.webhook_odobera(p_company uuid, p_event text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.webhooks w
    where w.company_id = p_company and w.active
      and (p_event = any(w.events) or '*' = any(w.events))
  );
$$;
revoke all on function public.webhook_odobera(uuid, text) from public, anon, authenticated;

create or replace function public.webhook_faktura_uhradena()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid'
     and public.webhook_odobera(new.company_id, 'invoice.paid') then
    insert into public.webhook_outbox (company_id, event, entity_id) values (new.company_id, 'invoice.paid', new.id);
  end if;
  return null;
end $$;
revoke all on function public.webhook_faktura_uhradena() from public, anon, authenticated;

create or replace function public.webhook_bankovy_pohyb()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.webhook_odobera(new.company_id, 'bank_transaction.created') then
    insert into public.webhook_outbox (company_id, event, entity_id) values (new.company_id, 'bank_transaction.created', new.id);
  end if;
  return null;
end $$;
revoke all on function public.webhook_bankovy_pohyb() from public, anon, authenticated;
