-- Storno faktúry (invoice.cancelled) ide do fronty webhookov rovnako ako úhrada.
-- Doteraz ho podpisoval server z dát, ktoré poslal prehliadač (triggerEventFn) —
-- člen firmy tak vedel odoslať integrátorovi ľubovoľnú „udalosť“. Spúšťač
-- `invoices_webhook_uhradena` je AFTER UPDATE OF status, takže storno zachytí.
create or replace function public.webhook_faktura_uhradena()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid'
     and public.webhook_odobera(new.company_id, 'invoice.paid') then
    insert into public.webhook_outbox (company_id, event, entity_id) values (new.company_id, 'invoice.paid', new.id);
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and public.webhook_odobera(new.company_id, 'invoice.cancelled') then
    insert into public.webhook_outbox (company_id, event, entity_id) values (new.company_id, 'invoice.cancelled', new.id);
  end if;
  return null;
end $$;
revoke all on function public.webhook_faktura_uhradena() from public, anon, authenticated;
